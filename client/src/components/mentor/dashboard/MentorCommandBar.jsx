import { useEffect, useId, useRef, useState } from 'react';
import { HiVideoCamera, HiSpeakerphone, HiX } from 'react-icons/hi';
import FileAttachmentPicker from '../../common/FileAttachmentPicker';

/**
 * MentorCommandBar — a single 52px title row with the two primary actions, and
 * a compact metrics strip underneath. Roster capacity is folded into the
 * "Students" metric as an inline bar rather than a section of its own, and the
 * announcement composer opens as a popover so it never pushes the roster down.
 *
 * `mentorName` is still accepted from the dashboard but no longer rendered —
 * the "Welcome back, X" hero it fed cost ~400px to say something the mentor
 * already knows.
 */
export default function MentorCommandBar({
  overview,
  capacity,
  pendingCount,
  onLaunchLiveClass,
  onPostAnnouncement
}) {
  const [showComposer, setShowComposer] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  const composerId = useId();
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const textareaRef = useRef(null);

  const totalStudents = overview.totalStudents || 0;
  const capacityValue = capacity || 30;
  const capacityPercent = Math.min(100, Math.round((totalStudents / capacityValue) * 100));

  // Dismiss the popover on Escape or an outside click, and hand focus back to
  // the trigger so keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!showComposer) return undefined;

    textareaRef.current?.focus();

    const close = () => {
      setShowComposer(false);
      triggerRef.current?.focus();
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    const handlePointer = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setShowComposer(false);
    };

    document.addEventListener('keydown', handleKey, true);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [showComposer]);

  const handleSend = async () => {
    const message = announcement.trim();
    if ((!message && !attachments.length) || sending) return;
    setSending(true);
    try {
      const ok = await onPostAnnouncement(message || '(Attached file)', attachments);
      if (ok) {
        setAnnouncement('');
        setAttachments([]);
        setShowComposer(false);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="mc-header">
        <h1 className="mc-header__title">Mentor Command Center</h1>

        <div className="mc-header__actions" ref={wrapperRef}>
          <button type="button" className="mc-btn" onClick={onLaunchLiveClass}>
            <HiVideoCamera size={15} aria-hidden="true" />
            Launch live class
          </button>
          <button
            type="button"
            className="mc-btn mc-btn--primary"
            ref={triggerRef}
            aria-expanded={showComposer}
            aria-controls={composerId}
            onClick={() => setShowComposer((prev) => !prev)}
          >
            <HiSpeakerphone size={15} aria-hidden="true" />
            Post announcement
          </button>

          {showComposer && (
            <div className="mc-announce" id={composerId}>
              <div className="mc-announce__head">
                <span className="mc-announce__title">
                  Broadcast to {totalStudents} connected student{totalStudents === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="mc-icon-btn"
                  onClick={() => { setShowComposer(false); triggerRef.current?.focus(); }}
                  aria-label="Close announcement composer"
                >
                  <HiX size={15} aria-hidden="true" />
                </button>
              </div>
              <textarea
                ref={textareaRef}
                className="mc-field"
                value={announcement}
                onChange={(event) => setAnnouncement(event.target.value.slice(0, 500))}
                placeholder="e.g. Live doubt-solving session on Calculus this Saturday at 8 PM. (You can also attach a PDF or question image below)"
                rows={4}
                maxLength={500}
                aria-label="Announcement message"
              />

              <FileAttachmentPicker
                attachments={attachments}
                onChange={setAttachments}
                disabled={sending}
                label="Attach PDF / Image"
              />

              <div className="mc-announce__footer">
                <span className="mc-count">{announcement.length}/500</span>
                <button
                  type="button"
                  className="mc-btn mc-btn--primary mc-btn--sm"
                  disabled={(!announcement.trim() && !attachments.length) || sending}
                  onClick={handleSend}
                >
                  {sending ? 'Sending…' : 'Send announcement'}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mc-metrics">
        <div className="mc-metric">
          <span className="mc-metric__value">
            {totalStudents}<small> /{capacityValue}</small>
          </span>
          <div className="mc-metric__bar" role="presentation">
            <i style={{ width: `${Math.max(2, capacityPercent)}%` }} />
          </div>
          <span className="mc-metric__label">
            Connected students · {capacityPercent}% of capacity
          </span>
        </div>

        <div className="mc-metric">
          <span className="mc-metric__value">{pendingCount}</span>
          <span className={`mc-metric__delta${pendingCount > 0 ? ' mc-metric__delta--alert' : ''}`}>
            {pendingCount > 0 ? 'Awaiting your reply' : 'All caught up'}
          </span>
          <span className="mc-metric__label">Pending requests</span>
        </div>

        <div className="mc-metric">
          <span className="mc-metric__value">{overview.averageStudentScore || 0}</span>
          <span className="mc-metric__delta">
            {overview.totalAttempts ? `${overview.totalAttempts} attempts` : 'No attempts yet'}
          </span>
          <span className="mc-metric__label">Avg mock score</span>
        </div>

        <div className="mc-metric">
          <span className="mc-metric__value">{overview.activeRate ?? 0}<small>%</small></span>
          <span className="mc-metric__delta">
            {overview.activeStudents48h || 0} of {totalStudents} students
          </span>
          <span className="mc-metric__label">Active in 48h</span>
        </div>
      </div>
    </>
  );
}
