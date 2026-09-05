import { useEffect, useRef, useState, useCallback } from 'react';
import httpClient from '../services/httpClient';

const CELL_PHONE_CLASS_ID = 67; // COCO dataset class for 'cell phone'
const PREFILTER_THRESHOLD = 0.25; // Cheapest gate inside the output scan
const CONFIDENCE_THRESHOLD = 0.30; // Lowest score that can ever count as a phone
const INSTANT_CONFIDENCE = 0.40; // At/above this, fire on the very first frame
// Target time from the start of one inference to the start of the next. On a
// fast device this sets the detection cadence; on a slow one the duty-cycle
// rule below takes over.
const WASM_CYCLE_MS = 400; // CPU (WASM) fallback
const WEBGPU_CYCLE_MS = 150; // GPU (WebGPU)
// Hard floor on idle time between inferences. The detection loop must ALWAYS
// hand the main thread back — running inference back-to-back is what makes the
// browser show "Page unresponsive".
const MIN_IDLE_MS = 60;
const DEBOUNCE_MS = 3000; // Min 3 seconds between backend snapshot uploads
const MODEL_INPUT_SIZE = 640; // Fixed YOLOv8 ONNX input resolution (model is exported at 640x640)

const MODEL_URL = '/models/yolov8n.onnx';
const MODEL_CACHE_NAME = 'topkorbo-proctor-model-v1';

// ── Module-level model singleton ──────────────────────────────────────────
// The YOLO weights are ~12 MB and the first inference has to compile GPU
// shaders / WASM kernels. Doing that per-mount is what made the first phone
// take "lots of time" to detect. We now download + compile + warm up ONCE per
// page load, keep it alive across unmount/remount (and React StrictMode's
// double-mount), and expose preloadYoloProctorModel() so callers can start the
// work before the exam screen even renders.
let sessionPromise = null;
// ponytail: one inference at a time; separate sessions if simultaneous cameras are needed.
let inferencePending = false;

async function fetchModelBytes() {
  // Cache Storage keeps the 12 MB weights on disk so the second contest (and
  // every reload) skips the download entirely. Unavailable on insecure origins
  // and in some private modes — fall back to a plain fetch.
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(MODEL_CACHE_NAME);
      const cached = await cache.match(MODEL_URL);
      if (cached) return await cached.arrayBuffer();

      const fresh = await fetch(MODEL_URL);
      if (!fresh.ok) throw new Error(`Model fetch failed: ${fresh.status}`);
      try {
        await cache.put(MODEL_URL, fresh.clone());
      } catch (putErr) {
        console.warn('[Proctor] Model cache write skipped:', putErr.message);
      }
      return await fresh.arrayBuffer();
    }
  } catch (cacheErr) {
    console.warn('[Proctor] Model cache unavailable, fetching directly:', cacheErr.message);
  }

  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
  return await res.arrayBuffer();
}

async function createSession() {
  // Prefer a usable GPU adapter; the same bundle supports CPU/WASM fallback.
  // Download the weights while the runtime bundle is still being imported —
  // the two slowest steps now overlap instead of running back to back.
  const [ort, modelBytes] = await Promise.all([
    import('onnxruntime-web/webgpu'),
    fetchModelBytes()
  ]);
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  let gpuAvailable = !!adapter;
  if (adapter) ort.env.webgpu.adapter = adapter;

  // WASM settings only apply when it falls back to CPU. Single thread avoids
  // the SharedArrayBuffer / COOP-COEP requirement on mobile.
  if (ort.env && ort.env.wasm) {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = !gpuAvailable;
  }

  // Building the session runs graph optimization, which is synchronous. Yield
  // first so an in-progress route change / render can finish.
  await yieldToBrowser();

  for (const provider of gpuAvailable ? ['webgpu', 'wasm'] : ['wasm']) {
    let session;
    let warmTensor;
    try {
      session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {
        executionProviders: [provider],
        graphOptimizationLevel: 'all'
      });
      // Compile kernels before accepting camera frames; a failed warmup is not ready.
      await yieldToBrowser();
      const inputName = session.inputNames?.[0] || 'images';
      warmTensor = new ort.Tensor('float32', new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE), [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
      const outputs = await session.run({ [inputName]: warmTensor });
      Object.values(outputs).forEach(output => output.dispose());
      console.info(`[Proctor] Detector ready (${gpuAvailable ? 'WebGPU' : 'CPU/WASM'})`);
      return { ort, session, gpuAvailable, offMainThread: gpuAvailable || ort.env.wasm.proxy };
    } catch (err) {
      if (session) await session.release();
      if (provider === 'wasm') throw err;
      console.warn('[Proctor] GPU initialization failed; retrying on CPU:', err.message);
      gpuAvailable = false;
      // The runtime is initialized; retain its worker setting for the CPU retry.
    } finally {
      warmTensor?.dispose();
    }
  }
}

// Hand the thread back so the browser can paint / handle input before we start
// another long synchronous chunk of work.
function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Start (or join) the one-time YOLO model download + compile + warmup.
 *
 * Safe to call as often as you like — the work happens once. Call it as early
 * as the contest is known (e.g. the moment the student clicks "Participate") so
 * the model is already hot by the time the exam screen mounts.
 *
 * @returns {Promise<{ort: object, session: object, gpuAvailable: boolean}>}
 */
export function preloadYoloProctorModel() {
  if (!sessionPromise) {
    sessionPromise = createSession().catch((err) => {
      sessionPromise = null; // Let a later attempt retry instead of failing forever
      throw err;
    });
  }
  return sessionPromise;
}

/**
 * useYoloProctor — real-time mobile phone detection during contests.
 *
 * Runs a pre-trained YOLOv8-nano ONNX model directly in the browser via
 * WebGPU (with a WebAssembly fallback). When a cell phone is detected,
 * captures a snapshot with the bounding box drawn on it and POSTs to the
 * server for audit logging.
 *
 * @param {Object} options
 * @param {string} options.contestId - The active contest ID
 * @param {boolean} options.enabled - Whether proctoring is active
 * @param {Function} options.onViolation - Callback when a violation is detected
 * @param {Function} options.onStatusChange - Callback whenever `status` changes
 * @returns {{ status, phoneDetected, violationCount, videoRef, error }}
 */
export default function useYoloProctor({ contestId, enabled = false, onViolation, onStatusChange } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const ortRef = useRef(null);
  const isRunningRef = useRef(false);
  const loopTimeoutRef = useRef(null);
  // Bumped by every start() and stop(). Any async work that resumes with a
  // stale value belongs to a superseded run and must bail out — this is what
  // keeps StrictMode's double-mount from leaving a second camera stream and a
  // second inference loop alive.
  const runTokenRef = useRef(0);
  const loopGenerationRef = useRef(0);
  const consecutiveDetectionsRef = useRef(0);
  const lastViolationTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const contestIdRef = useRef(contestId);
  // Reused input buffer avoids allocating ~1.2M floats per frame (less GC jank).
  const inputBufferRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | requesting_camera | camera_ready | active | error
  const [phoneDetected, setPhoneDetected] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // Latest callbacks in refs so the detection loop never closes over stale ones
  // and never has to be torn down when a parent re-renders.
  const onViolationRef = useRef(onViolation);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onViolationRef.current = onViolation;
    onStatusChangeRef.current = onStatusChange;
    contestIdRef.current = contestId;
  }, [onViolation, onStatusChange, contestId]);

  useEffect(() => {
    if (onStatusChangeRef.current) onStatusChangeRef.current(status);
  }, [status]);

  // Stop the camera and the detection loop. The compiled model itself is kept
  // alive at module scope so re-entering a contest is instant.
  const stop = useCallback(() => {
    isRunningRef.current = false;
    // Invalidate any in-flight start() and any awaiting detection tick.
    runTokenRef.current += 1;
    loopGenerationRef.current += 1;
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    sessionRef.current = null;
    ortRef.current = null;
    setStatus('idle');
    setPhoneDetected(false);
    consecutiveDetectionsRef.current = 0;
    lastVideoTimeRef.current = -1;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Capture snapshot and report violation
  const handleViolation = useCallback((detection, { padX, padY, drawW, drawH, vw, vh }) => {
    const contestId = contestIdRef.current;
    const runToken = runTokenRef.current;

    // Capture full-resolution snapshot
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = vw;
    captureCanvas.height = vh;
    const captureCtx = captureCanvas.getContext('2d');
    // Save the frame actually analyzed, not the live camera after inference.
    captureCtx.drawImage(canvasRef.current, padX, padY, drawW, drawH, 0, 0, vw, vh);

    // Draw red bounding box on the snapshot. videoBbox is already in the
    // full-resolution video coordinate space (mapped out of the letterbox), so
    // no extra scaling is needed here.
    if (detection.videoBbox) {
      const [bx, by, bw, bh] = detection.videoBbox;
      captureCtx.strokeStyle = '#ef4444';
      captureCtx.lineWidth = 3;
      captureCtx.strokeRect(bx, by, bw, bh);
      // Label
      captureCtx.fillStyle = '#ef4444';
      captureCtx.font = 'bold 14px sans-serif';
      captureCtx.fillText(
        `Mobile Phone ${Math.round(detection.confidence * 100)}%`,
        bx,
        Math.max(by - 6, 14)
      );
    }

    const snapshotBase64 = captureCanvas.toDataURL('image/jpeg', 0.8);

    // Increment client-side violation counter immediately
    setViolationCount(prev => prev + 1);

    // Report to backend
    if (contestId) {
      httpClient.request(`/contests/${contestId}/proctor/violation`, {
        method: 'POST',
        showSlowMessage: false,
        body: JSON.stringify({
          violationType: 'MOBILE_PHONE_DETECTED',
          confidence: Math.round(detection.confidence * 100),
          image: snapshotBase64
        })
      }).catch(err => {
        console.warn('[Proctor] Failed to report violation to server:', err.message);
        if (isRunningRef.current && runToken === runTokenRef.current) {
          setUploadError('A detection could not be saved. Check your connection and contact the proctor.');
        }
      });
    }

    if (onViolationRef.current) {
      onViolationRef.current({
        type: 'MOBILE_PHONE_DETECTED',
        confidence: detection.confidence,
        timestamp: Date.now()
      });
    }
  }, []);

  // Lazily create the offscreen work canvas once. Re-assigning canvas.width
  // every frame (the old behaviour) reallocates and clears the backing store.
  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = MODEL_INPUT_SIZE;
      canvas.height = MODEL_INPUT_SIZE;
      canvasRef.current = canvas;
      ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });
    }
    return ctxRef.current;
  }, []);

  // Run a single inference frame. Returns when the frame is fully scored so the
  // caller can chain the next one immediately.
  const runInference = useCallback(async () => {
    const video = videoRef.current;
    const session = sessionRef.current;
    const ort = ortRef.current;
    if (!video || !session || !ort || video.readyState < 2 || inferencePending) return;
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;
    const runToken = runTokenRef.current;
    const isStale = () => !isRunningRef.current || runToken !== runTokenRef.current;
    inferencePending = true;
    let inputTensor;
    let results;

    try {
      const ctx = getContext();

      // Letterbox: preserve the camera's aspect ratio instead of stretching it
      // into a square. YOLOv8 is trained on aspect-preserved + padded frames, so
      // stretching distorts phones and tanks confidence. We scale the frame to
      // fit 640x640 and pad the remainder with neutral gray (114) — the exact
      // letterbox the model expects.
      const vw = video.videoWidth || MODEL_INPUT_SIZE;
      const vh = video.videoHeight || MODEL_INPUT_SIZE;
      const scale = Math.min(MODEL_INPUT_SIZE / vw, MODEL_INPUT_SIZE / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const padX = (MODEL_INPUT_SIZE - drawW) / 2;
      const padY = (MODEL_INPUT_SIZE - drawH) / 2;

      ctx.fillStyle = 'rgb(114,114,114)';
      ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      ctx.drawImage(video, padX, padY, drawW, drawH);

      const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      // The WASM proxy transfers (detaches) the input buffer to its worker.
      if (!inputBufferRef.current?.byteLength) {
        inputBufferRef.current = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
      }
      inputTensor = preprocessImage(ort, imageData.data, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, inputBufferRef.current);

      const inputName = session.inputNames?.[0] || 'images';
      results = await session.run({ [inputName]: inputTensor });
      if (isStale()) return;
      const outputKey = session.outputNames?.[0] || Object.keys(results)[0];
      const output = results[outputKey];

      if (!output || !output.data) throw new Error('Detector returned no predictions');

      // Scan phone scores first; compare classes only for plausible candidates.
      const phoneModel = findBestPhone(output.data, output.dims);
      const phoneDetection = phoneModel && phoneModel.confidence >= CONFIDENCE_THRESHOLD
        ? phoneModel
        : null;

      // Map the box from letterboxed model space back to real video pixels so the
      // snapshot draws the red box in the right place.
      if (phoneDetection) {
        const [mx, my, mw, mh] = phoneDetection.bbox;
        phoneDetection.videoBbox = [
          (mx - padX) / scale,
          (my - padY) / scale,
          mw / scale,
          mh / scale
        ];
      }

      if (phoneDetection) {
        consecutiveDetectionsRef.current += 1;
        // A clearly-visible phone fires on the very first frame it appears in;
        // only the low-confidence band needs a second frame to confirm.
        const isConfirmed =
          phoneDetection.confidence >= INSTANT_CONFIDENCE ||
          consecutiveDetectionsRef.current >= 2;

        if (isConfirmed) {
          setPhoneDetected(true);
          const now = Date.now();
          if (now - lastViolationTimeRef.current > DEBOUNCE_MS) {
            lastViolationTimeRef.current = now;
            handleViolation(phoneDetection, { padX, padY, drawW, drawH, vw, vh });
          }
        }
      } else {
        consecutiveDetectionsRef.current = 0;
        setPhoneDetected(false);
      }
    } catch (err) {
      if (isStale()) return;
      console.warn('[Proctor] Inference error:', err.message);
      stop();
      setError('Phone detection stopped. Please retry the proctor.');
      setStatus('error');
      sessionPromise = null;
      await session.release().catch(() => {});
    } finally {
      inputTensor?.dispose();
      if (results) Object.values(results).forEach(output => output.dispose());
      inferencePending = false;
    }
  }, [getContext, handleViolation, stop]);

  // Self-scheduling detection loop. Each pass waits for the previous inference
  // to finish before queuing the next, so runs can never overlap and thrash the
  // GPU.
  //
  // `loopGenerationRef` is what actually cancels a loop: an in-flight `tick` is
  // sitting inside an `await`, so clearTimeout alone cannot stop it. Every
  // start/stop bumps the generation, and a tick whose generation is stale exits
  // instead of rescheduling. Without this, React StrictMode's mount → unmount →
  // mount leaves two loops running forever and the tab locks up.
  const startDetectionLoop = useCallback((cycleMs, offMainThread) => {
    const generation = ++loopGenerationRef.current;
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }

    const isStale = () => !isRunningRef.current || generation !== loopGenerationRef.current;

    const tick = async () => {
      if (isStale()) return;
      const startedAt = performance.now();
      await runInference();
      if (isStale()) return;

      const elapsed = performance.now() - startedAt;
      // GPU / worker inference yields naturally; only main-thread CPU needs
      // the extra duty-cycle pause to keep exam inputs responsive.
      const wait = Math.max(MIN_IDLE_MS, cycleMs - elapsed, offMainThread ? 0 : elapsed);
      loopTimeoutRef.current = setTimeout(tick, wait);
    };

    loopTimeoutRef.current = setTimeout(tick, 0);
  }, [runInference]);

  // Initialize camera and model in parallel
  const start = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    const runToken = ++runTokenRef.current;
    const isStale = () => !isRunningRef.current || runToken !== runTokenRef.current;
    setError(null);

    // Kick the model off FIRST and deliberately do NOT await it here. The
    // download/compile now runs while the browser is showing the camera
    // permission prompt, instead of only starting after the student clicks
    // "Allow" — which is what made the first detection take so long.
    const modelReady = preloadYoloProctorModel();
    modelReady.catch(() => { }); // Handled below; avoids an unhandled rejection

    try {
      // 1. Start camera for instant feedback on mobile & desktop
      setStatus('requesting_camera');
      let stream = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
      } catch (constraintErr) {
        console.warn('[Proctor] Ideal constraints failed, trying basic user-facing camera:', constraintErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
          });
        } catch (facingErr) {
          console.warn('[Proctor] FacingMode failed, trying fallback video: true:', facingErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      // This run was superseded while the permission prompt was open (a remount,
      // or the contest ended). Release the camera we just opened instead of
      // leaking a second live stream, and stop here.
      if (isStale()) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      stream.getTracks().forEach(track => {
        track.onended = () => {
          if (isStale()) return;
          stop();
          setError('Camera disconnected. Please reconnect it and retry the proctor.');
          setStatus('error');
        };
      });

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');
        video.muted = true;

        await video.play();
      }

      if (isStale()) return;
      setStatus('camera_ready');

      // 2. Join the (already running) model load. Usually resolved by now.
      try {
        const { ort, session, gpuAvailable, offMainThread } = await modelReady;
        if (isStale()) return;

        ortRef.current = ort;
        sessionRef.current = session;
        setStatus('active');

        // GPU runs a tighter cadence; the CPU fallback is given a longer one
        // and the loop's duty-cycle rule slows it further if frames are slow.
        startDetectionLoop(gpuAvailable ? WEBGPU_CYCLE_MS : WASM_CYCLE_MS, offMainThread);
      } catch (modelErr) {
        if (isStale()) return;
        console.warn('[Proctor] YOLO model failed to load:', modelErr);
        stop();
        setError('Phone detection could not start. Please retry the proctor.');
        setStatus('error');
      }

    } catch (err) {
      if (isStale()) return;
      console.error('[Proctor] Camera initialization failed:', err);
      stop();
      setError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : `Camera setup failed: ${err.message || 'Unknown error'}`
      );
      setStatus('error');
    }
  }, [startDetectionLoop, stop]);

  // Defer startup so the camera widget paints before permission / model work.
  useEffect(() => {
    const timer = enabled && contestId ? setTimeout(start, 0) : null;
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [enabled, contestId, start, stop]);

  return { status, phoneDetected, violationCount, videoRef, error, uploadError, start, stop };
}

// ── Tensor Preprocessing ──────────────────────────────────────────────────
// Converts RGBA Uint8ClampedArray to Float32 CHW Tensor [1, 3, H, W].
// Writes into a caller-provided buffer to avoid per-frame allocations.
function preprocessImage(ort, data, width, height, buffer) {
  const float32Data = buffer || new Float32Array(3 * width * height);
  const plane = width * height;
  for (let i = 0; i < plane; i++) {
    float32Data[i] = data[i * 4] / 255.0;             // R channel
    float32Data[plane + i] = data[i * 4 + 1] / 255.0; // G channel
    float32Data[2 * plane + i] = data[i * 4 + 2] / 255.0; // B channel
  }
  return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
}

// ── YOLO Output Postprocessing ────────────────────────────────────────────
// YOLOv8 output shape: [1, 84, N] where 84 = 4 bbox coords + 80 class scores.
// Return the best box whose winning class is phone; a single best pick needs no NMS.
export function findBestPhone(output, dims) {
  if (dims?.length !== 3 || dims[0] !== 1 || dims[1] !== 84 || dims[2] < 1 || output.length !== 84 * dims[2]) {
    throw new Error('Unsupported YOLO output shape');
  }
  const numAnchors = dims[2];
  const scoreRow = (4 + CELL_PHONE_CLASS_ID) * numAnchors; // class 67 score offset

  let bestScore = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < numAnchors; i++) {
    const score = output[scoreRow + i];
    if (score >= PREFILTER_THRESHOLD && score > bestScore) {
      // Check other classes only for candidates. A remote/book with a higher
      // class score must not become a phone merely because its phone score is high.
      let isPhone = true;
      for (let classId = 0; classId < 80; classId++) {
        if (classId !== CELL_PHONE_CLASS_ID && output[(4 + classId) * numAnchors + i] >= score) {
          isPhone = false;
          break;
        }
      }
      if (!isPhone) continue;
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestScore < PREFILTER_THRESHOLD) return null;

  const cx = output[bestIdx];
  const cy = output[numAnchors + bestIdx];
  const w = output[2 * numAnchors + bestIdx];
  const h = output[3 * numAnchors + bestIdx];

  return {
    classId: CELL_PHONE_CLASS_ID,
    confidence: bestScore,
    bbox: [cx - w / 2, cy - h / 2, w, h]
  };
}
