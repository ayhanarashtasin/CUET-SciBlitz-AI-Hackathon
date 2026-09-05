import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import useYoloProctor, { findBestPhone, preloadYoloProctorModel } from './useYoloProctor';

const runtime = vi.hoisted(() => ({
  env: { wasm: {}, webgpu: {} },
  session: { inputNames: ['images'], outputNames: ['predictions'], run: vi.fn(), release: vi.fn().mockResolvedValue() },
  create: vi.fn(),
  request: vi.fn(),
}));
vi.mock('onnxruntime-web/webgpu', () => ({
  env: runtime.env,
  InferenceSession: { create: runtime.create },
  Tensor: class {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); }
    dispose = vi.fn();
  },
}));
vi.mock('../services/httpClient', () => ({ default: { request: runtime.request } }));

function predictions(phoneScore = 0, otherScore = 0) {
  const data = new Float32Array(84);
  data.set([320, 320, 100, 200]);
  data[71] = phoneScore;
  data[69] = otherScore; // remote
  return { predictions: { data, dims: [1, 84, 1], dispose: vi.fn() } };
}

beforeAll(async () => {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  runtime.create.mockResolvedValue(runtime.session);
  runtime.session.run.mockResolvedValue(predictions());
  const model = await preloadYoloProctorModel();
  expect(model.offMainThread).toBe(true);
  expect(runtime.env.wasm.proxy).toBe(true);
  expect(await preloadYoloProctorModel()).toBe(model);
  expect(runtime.create).toHaveBeenCalledTimes(1);
});

let contexts;
let track;
beforeEach(() => {
  vi.useFakeTimers();
  runtime.session.run.mockReset().mockResolvedValue(predictions());
  runtime.request.mockReset().mockResolvedValue({ totalViolations: 1 });
  contexts = [];
  track = { stop: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    const ctx = {
      canvas: this, fillRect: vi.fn(), drawImage: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(640 * 640 * 4) }),
    };
    contexts.push(ctx);
    return ctx;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,evidence');
});

afterEach(async () => {
  cleanup();
  await act(async () => vi.runOnlyPendingTimersAsync());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startHook() {
  const onViolation = vi.fn();
  const hook = renderHook(props => useYoloProctor({ ...props, onViolation }), {
    initialProps: { contestId: 'contest-a', enabled: false },
  });
  hook.result.current.videoRef.current = {
    readyState: 4, videoWidth: 640, videoHeight: 480,
    get currentTime() { return performance.now() / 1000; },
    setAttribute: vi.fn(), play: vi.fn().mockResolvedValue(),
  };
  await act(async () => hook.rerender({ contestId: 'contest-a', enabled: true }));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  return { ...hook, onViolation };
}

it('rejects a competing object class and still finds the next real phone candidate', () => {
  const data = new Float32Array(84 * 2);
  data[71 * 2] = 0.8;
  data[69 * 2] = 0.9;
  expect(findBestPhone(data, [1, 84, 2])).toBeNull();
  data[71 * 2 + 1] = 0.6;
  data[1] = 320; data[3] = 320; data[5] = 100; data[7] = 200;
  expect(findBestPhone(data, [1, 84, 2])).toMatchObject({ bbox: [270, 220, 100, 200] });
  expect(() => findBestPhone(data, [1, 2, 84])).toThrow('Unsupported YOLO output shape');
});

it('alerts on the first strong frame, saves that analyzed frame, and exposes failed uploads', async () => {
  let finish;
  runtime.session.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  runtime.request.mockRejectedValueOnce(new Error('HTTP 500'));
  const hook = await startHook();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(async () => finish(predictions(0.8)));
  expect(hook.result.current.phoneDetected).toBe(true);
  expect(hook.onViolation).toHaveBeenCalledTimes(1);
  expect(contexts[1].drawImage).toHaveBeenCalledWith(contexts[0].canvas, 0, 80, 640, 480, 0, 0, 640, 480);
  expect(runtime.request).toHaveBeenCalledWith('/contests/contest-a/proctor/violation', expect.objectContaining({ method: 'POST' }));
  expect(hook.result.current.uploadError).toContain('could not be saved');
});

it('requires two weak detections, clears a missing phone, and throttles snapshot uploads', async () => {
  runtime.session.run.mockResolvedValue(predictions(0.35));
  const hook = await startHook();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(hook.result.current.phoneDetected).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(hook.result.current.phoneDetected).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(2400));
  expect(runtime.request).toHaveBeenCalledTimes(1);
  runtime.session.run.mockResolvedValue(predictions());
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(hook.result.current.phoneDetected).toBe(false);
});

it('does not wait an entire inference again when CPU inference runs in a worker', async () => {
  runtime.session.run.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(predictions()), 800)));
  await startHook();
  await act(async () => vi.advanceTimersByTimeAsync(859));
  expect(runtime.session.run).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(runtime.session.run).toHaveBeenCalledTimes(2);
});

it('discards an in-flight result after stop and reports subsequent detections to the new contest', async () => {
  let finish;
  runtime.session.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const hook = await startHook();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  await act(async () => hook.rerender({ contestId: 'contest-b', enabled: true }));
  await act(async () => finish(predictions(0.8)));
  expect(runtime.request).not.toHaveBeenCalled();
  runtime.session.run.mockResolvedValue(predictions(0.8));
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(runtime.request).toHaveBeenCalledWith('/contests/contest-b/proctor/violation', expect.anything());
  expect(track.stop).toHaveBeenCalled();
});

it('shows an inference failure and permits retry instead of silently remaining active', async () => {
  runtime.session.run.mockRejectedValueOnce(new Error('device lost'));
  const hook = await startHook();
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(hook.result.current.status).toBe('error');
  expect(track.stop).toHaveBeenCalled();
  await act(async () => {
    hook.result.current.start();
    await vi.advanceTimersByTimeAsync(50);
  });
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(hook.result.current.status).toBe('active');
});

it('does not confirm a weak detection by analyzing the same frozen video frame twice', async () => {
  runtime.session.run.mockResolvedValue(predictions(0.35));
  const hook = await startHook();
  Object.defineProperty(hook.result.current.videoRef.current, 'currentTime', { value: performance.now() / 1000 });
  await act(async () => vi.advanceTimersByTimeAsync(800));
  expect(runtime.session.run).toHaveBeenCalledTimes(1);
  expect(hook.result.current.phoneDetected).toBe(false);
});

it('shows a camera disconnect instead of continuing to report the proctor active', async () => {
  const hook = await startHook();
  act(() => track.onended());
  expect(hook.result.current.status).toBe('error');
  expect(hook.result.current.error).toContain('Camera disconnected');
});

it('falls back to CPU when GPU warmup fails instead of claiming the detector is ready', async () => {
  vi.useRealTimers();
  vi.resetModules();
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
  runtime.create.mockClear();
  runtime.session.run.mockRejectedValueOnce(new Error('shader compilation failed'));
  try {
    const { preloadYoloProctorModel: preload } = await import('./useYoloProctor');
    expect((await preload()).gpuAvailable).toBe(false);
    expect(runtime.create.mock.calls.map(call => call[1].executionProviders)).toEqual([['webgpu'], ['wasm']]);
  } finally {
    delete navigator.gpu;
    vi.useFakeTimers();
  }
});

it('rejects a failed CPU warmup and retries initialization on the next request', async () => {
  vi.useRealTimers();
  vi.resetModules();
  runtime.create.mockClear();
  runtime.session.run.mockRejectedValueOnce(new Error('model failed'));
  try {
    const { preloadYoloProctorModel: preload } = await import('./useYoloProctor');
    await expect(preload()).rejects.toThrow('model failed');
    await expect(preload()).resolves.toMatchObject({ gpuAvailable: false });
    expect(runtime.create).toHaveBeenCalledTimes(2);
  } finally {
    vi.useFakeTimers();
  }
});
