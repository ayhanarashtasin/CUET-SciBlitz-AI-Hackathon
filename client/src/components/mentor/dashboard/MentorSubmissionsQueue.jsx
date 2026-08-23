import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import StudentAvatar from './StudentAvatar';
import useSocket from '../../../hooks/useSocket';
import { fetchMentorSubmissions, reviewAssignment } from '../../../services/mentorApi';
import {
  formatDisplayName,
  formatRelativeTime,
  formatDateTime,
  formatDayMonth
} from './mentorDashboardUtils';

const FILTERS = [
  { id: 'review', label: 'Awaiting review' },
  { id: 'open', label: 'Outstanding' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' }
];

function matchesFilter(assignment, filter) {
  if (filter === 'all') return true;
  if (filter === 'review') return assignment.status === 'submitted';
  if (filter === 'done') return assignment.status === 'done';
  return assignment.status === 'open' || assignment.status === 'returned';
}

/** The single state a review row advertises, clock included. */
function describe(assignment, now = Date.now()) {
  if (assignment.status === 'done') return { label: 'Completed', tone: 'success' };
  if (assignment.status === 'submitted') return { label: 'Awaiting review', tone: 'info' };
  if (assignment.status === 'returned') return { label: 'Returned', tone: 'warn' };
  if (assignment.dueAt && new Date(assignment.dueAt).getTime() < now) {
    return { label: 'Overdue', tone: 'danger' };
  }
  return { label: 'Assigned', tone: 'neutral' };
}

/**
 * MentorSubmissionsQueue — what students handed in, and the two decisions the
 * mentor can make about each: accept it, or send it back for another attempt.
 * Loads on its own so the dashboard's existing fetch path is untouched, and
 * hides completely until the mentor has actually set some work.
 */
export default function MentorSubmissionsQueue() {
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('review');
  const [openId, setOpenId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState('');
  const { on } = useSocket();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await fetchMentorSubmissions();
        if (cancelled) return;
        setAssignments(payload?.assignments || []);
        setStats(payload?.stats || null);
      } catch {
        // A failed review queue must never take the dashboard down with it —
        // the section simply stays hidden.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // --- Real-time socket updates for incoming student hand-ins ---
  useEffect(() => {
    const offSubmitted = on('class:assignment:submitted', (newSubmission) => {
      setAssignments((prev) => {
        const id = String(newSubmission._id);
        const exists = prev.some((item) => String(item._id) === id);
        if (exists) {
          return prev.map((item) => String(item._id) === id ? { ...item, ...newSubmission, student: newSubmission.student || item.student } : item);
        }
        return [newSubmission, ...prev];
      });
      const studentName = newSubmission.student?.name || 'A student';
      toast(`📝 ${studentName} submitted work for review!`, {
        duration: 6000,
        id: `submission-${newSubmission._id}`
      });
    });

    const offUpdate = on('class:assignment:update', (updated) => {
      setAssignments((prev) => {
        const id = String(updated._id);
        return prev.map((item) => String(item._id) === id ? { ...item, ...updated, student: updated.student || item.student } : item);
      });
    });

    return () => {
      offSubmitted && offSubmitted();
      offUpdate && offUpdate();
    };
  }, [on]);

  const counts = useMemo(() => FILTERS.reduce((acc, item) => {
    acc[item.id] = assignments.filter((entry) => matchesFilter(entry, item.id)).length;
    return acc;
  }, {}), [assignments]);

  const visible = useMemo(
    () => assignments.filter((entry) => matchesFilter(entry, filter)),
    [assignments, filter]
  );

  if (loading || assignments.length === 0) return null;

  const handleReview = async (assignment, action) => {
    if (busyId) return;
    setBusyId(assignment._id);
    try {
      const updated = await reviewAssignment(assignment._id, {
        action,
        feedback: drafts[assignment._id] || ''
      });
      setAssignments((prev) => prev.map((item) => (
        item._id === updated._id ? { ...item, ...updated, student: item.student } : item
      )));
      setStats(null);
      setOpenId('');
      toast.success(action === 'return' ? 'Sent back for another attempt.' : 'Marked complete.');
    } catch (err) {
      toast.error(err.message || 'Could not save your review.');
    } finally {
      setBusyId('');
    }
  };

  const awaiting = stats ? stats.awaitingReview : counts.review;

  return (
    <section className="mc-section" aria-labelledby="mc-review-label">
      <div className="mc-section__head">
        <h2 className="mc-section__title" id="mc-review-label">Assignment review</h2>
        <span className="mc-section__rule" />
        <span className="mc-section__aside">
          {awaiting > 0 ? `${awaiting} waiting on you` : 'Nothing waiting on you'}
        </span>
      </div>

      <div className="mc-toolbar">
        <div className="mc-chips" role="group" aria-label="Filter assignments">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mc-chip"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="mc-chip__n">{counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mc-note-line">Nothing in this list right now.</p>
      ) : (
        <div className="mc-review-list">
          {visible.map((assignment) => {
            const status = describe(assignment);
            const name = formatDisplayName(assignment.student?.name);
            const title = assignment.target || 'Assignment';
            const isOpen = openId === assignment._id;
            const isBusy = busyId === assignment._id;
            const panelId = `mc-review-${assignment._id}`;

            return (
              <article className="mc-review" key={assignment._id}>
                <button
                  type="button"
                  className="mc-review__head"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? '' : assignment._id)}
                >
                  <StudentAvatar name={assignment.student?.name} src={assignment.student?.avatar} size="sm" />
                  <span className="mc-review__identity">
                    <span className="mc-review__name" title={name}>{name}</span>
                    <span className="mc-review__task" title={title}>{title}</span>
                  </span>
                  <span className="mc-review__when">
                    {assignment.submission?.submittedAt
                      ? `Handed in ${formatRelativeTime(assignment.submission?.submittedAt)}`
                      : assignment.dueAt
                        ? `Due ${formatDayMonth(assignment.dueAt)}`
                        : `Set ${formatRelativeTime(assignment.createdAt)}`}
                  </span>
                  <span className={`mc-status mc-status--${status.tone}`}>{status.label}</span>
                </button>

                {isOpen && (
                  <div className="mc-review__body" id={panelId}>
                    <div className="mc-block">
                      <span className="mc-block__title">What you set</span>
                      <p className="mc-review__text">{assignment.body}</p>
                    </div>

                    <div className="mc-block">
                      <span className="mc-block__title">
                        {assignment.submission?.submittedAt
                          ? `Submitted ${formatDateTime(assignment.submission?.submittedAt)}`
                          : 'Not handed in yet'}
                      </span>
                      <p className="mc-review__text mc-review__text--work">
                        {assignment.submission?.submittedAt
                          ? (assignment.submission?.body || 'Marked done without a written hand-in.')
                          : 'Nothing to review until the student turns this in.'}
                      </p>
                    </div>

                    {assignment.feedback?.body && assignment.status !== 'submitted' && (
                      <p className="mc-note-line">
                        Your last feedback ({formatDateTime(assignment.feedback?.reviewedAt)}): {assignment.feedback?.body}
                      </p>
                    )}

                    {assignment.submission?.submittedAt && (
                      <>
                        <label className="mc-block__title" htmlFor={`mc-fb-${assignment._id}`}>
                          Feedback (optional)
                        </label>
                        <textarea
                          id={`mc-fb-${assignment._id}`}
                          className="mc-field"
                          rows={3}
                          maxLength={2000}
                          value={drafts[assignment._id] ?? ''}
                          placeholder="What they got right, and what to fix next time…"
                          onChange={(event) => setDrafts((prev) => ({
                            ...prev,
                            [assignment._id]: event.target.value.slice(0, 2000)
                          }))}
                        />
                        <div className="mc-review__actions">
                          <button
                            type="button"
                            className="mc-btn"
                            disabled={isBusy}
                            onClick={() => handleReview(assignment, 'return')}
                          >
                            Return for revision
                          </button>
                          <button
                            type="button"
                            className="mc-btn mc-btn--primary"
                            disabled={isBusy}
                            onClick={() => handleReview(assignment, 'approve')}
                          >
                            {isBusy ? 'Saving…' : 'Mark complete'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
