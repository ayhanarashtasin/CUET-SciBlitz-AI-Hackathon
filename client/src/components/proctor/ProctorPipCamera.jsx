import { useState } from 'react';
import useYoloProctor from '../../hooks/useYoloProctor';
import { useLanguage } from '../../hooks/useLanguage';
import './ProctorPipCamera.css';

/**
 * ProctorPipCamera — Floating PiP webcam overlay for AI-proctored contests.
 *
 * Shows the student's live webcam feed in a compact, draggable corner widget.
 * When YOLO detects a mobile phone, the border turns red and a warning appears.
 * The student sees their violation count (X/3) to understand the stakes.
 */
export default function ProctorPipCamera({ contestId, enabled = false, onViolation, onStatusChange, maxViolations = 3 }) {
  const { language } = useLanguage();
  const { status, phoneDetected, violationCount, videoRef, error, start } = useYoloProctor({
    contestId,
    enabled,
    onViolation,
    onStatusChange
  });

  const [minimized, setMinimized] = useState(false);

  if (!enabled) return null;

  const isActive = status === 'active' || status === 'camera_ready' || status === 'camera_only';
  const isRequesting = status === 'requesting_camera';
  const isError = status === 'error';

  const statusText = (() => {
    if (isError) return language === 'en' ? '⚠️ Camera Error' : '⚠️ ক্যামেরা ত্রুটি';
    if (phoneDetected) return language === 'en' ? '🚨 Phone Detected!' : '🚨 ফোন শনাক্ত!';
    if (status === 'active') return language === 'en' ? '🛡️ AI Proctor Active' : '🛡️ এআই প্রক্টর সক্রিয়';
    if (status === 'camera_ready') return language === 'en' ? '📷 AI Loading...' : '📷 এআই লোড হচ্ছে...';
    if (status === 'camera_only') return language === 'en' ? '📷 Camera Active' : '📷 ক্যামেরা সক্রিয়';
    if (isRequesting) return language === 'en' ? '⏳ Starting...' : '⏳ শুরু হচ্ছে...';
    return language === 'en' ? '🛡️ AI Proctor Active' : '🛡️ এআই প্রক্টর সক্রিয়';
  })();

  return (
    <>
      {minimized && (
        <button
          type="button"
          className={`proctor-pip-minimized ${phoneDetected ? 'proctor-pip-minimized--alert' : ''}`}
          onClick={() => setMinimized(false)}
          title={`${language === 'en' ? 'Show Camera' : 'ক্যামেরা দেখুন'} — ${statusText}`}
        >
          <span className="proctor-pip-minimized__icon">📷</span>
          {violationCount > 0 && (
            <span className="proctor-pip-minimized__badge">{violationCount}</span>
          )}
        </button>
      )}

      {/*
        The panel is ALWAYS mounted, even while minimized — it is only parked
        offscreen by `proctor-pip--stowed`. Unmounting it would destroy the
        <video> node, and with it the MediaStream the detector reads frames
        from, so minimizing the widget would silently switch the AI proctor
        off (and leave a black feed when restored). Keeping the element alive
        means detection, snapshots and violation reporting all carry on in the
        background exactly as they do when the panel is visible.
      */}
      <div
        className={`proctor-pip ${minimized ? 'proctor-pip--stowed' : ''} ${
          phoneDetected ? 'proctor-pip--alert' :
          isActive ? 'proctor-pip--active' : ''
        }`}
        aria-hidden={minimized ? 'true' : undefined}
      >
        <div className="proctor-pip__header">
          <span className="proctor-pip__status-dot" />
          <span className="proctor-pip__status-text">{statusText}</span>
          <button
            type="button"
            className="proctor-pip__minimize"
            onClick={() => setMinimized(true)}
            title={language === 'en' ? 'Minimize' : 'ছোট করুন'}
            tabIndex={minimized ? -1 : undefined}
          >
            −
          </button>
        </div>

        <div className="proctor-pip__video-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="proctor-pip__video"
          />
          {isRequesting && (
            <div className="proctor-pip__overlay">
              <div className="proctor-pip__spinner" />
            </div>
          )}
          {isError && (
            <div className="proctor-pip__overlay proctor-pip__overlay--error">
              <p>{error || (language === 'en' ? 'Camera access failed' : 'ক্যামেরা অ্যাক্সেস ব্যর্থ')}</p>
              <button
                type="button"
                className="proctor-pip__retry-btn"
                onClick={start}
                tabIndex={minimized ? -1 : undefined}
              >
                {language === 'en' ? 'Retry Camera' : 'আবার চেষ্টা করুন'}
              </button>
            </div>
          )}
        </div>

        <div className="proctor-pip__footer">
          <span className={`proctor-pip__violations ${
            violationCount >= maxViolations ? 'proctor-pip__violations--critical' :
            violationCount > 0 ? 'proctor-pip__violations--warning' : ''
          }`}>
            {language === 'en'
              ? `Violations: ${violationCount}/${maxViolations}`
              : `লঙ্ঘন: ${violationCount}/${maxViolations}`
            }
          </span>
        </div>

        {phoneDetected && (
          <div className="proctor-pip__alert-banner">
            {language === 'en'
              ? 'Mobile phone detected! A screenshot has been captured and sent to the proctor.'
              : 'মোবাইল ফোন শনাক্ত হয়েছে! একটি স্ক্রিনশট ক্যাপচার করে প্রক্টরের কাছে পাঠানো হয়েছে।'
            }
          </div>
        )}
      </div>
    </>
  );
}
