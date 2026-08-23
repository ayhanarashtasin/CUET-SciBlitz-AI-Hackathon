/**
 * My Class
 * ----------------------------------------------------------------------------
 * The student half of the mentor loop: announcements their mentor broadcast,
 * the assignments they were set, and the hand-in flow for each one. The mentor
 * reviews what lands here from their own dashboard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineClipboardList, HiOutlineSpeakerphone, HiOutlineExclamation } from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import StudentAvatar from '../components/mentor/dashboard/StudentAvatar';
import MentorProfileDialog from '../components/mentor/MentorProfileDialog';
import FileAttachmentPicker from '../components/common/FileAttachmentPicker';
import AttachmentView from '../components/common/AttachmentView';
import useSocket from '../hooks/useSocket';
import {
  fetchMyClass,
  fetchMentorProfile,
  submitMentorReview,
  submitAssignment,
  unsubmitAssignment
} from '../services/mentorApi';
import {
  formatDisplayName,
  formatRelativeTime,
  formatDateTime
} from '../components/mentor/dashboard/mentorDashboardUtils';
import '../components/mentor/dashboard/MentorDashboard.css';
import './FindMentor.css';
import './MyClass.css';

const EMPTY_CLASS = { mentors: [], announcements: [], assignments: [], notes: [], stats: null };

const WORK_FILTERS = [
  { id: 'todo', label: 'To do' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' }
];

/**
 * Status is derived rather than read straight off the record, because "overdue"
 * is a function of the clock, not something the server can store.
 */
function describeAssignment(assignment, now = Date.now()) {
  const dueTime = assignment.dueAt ? new Date(assignment.dueAt).getTime() : null;
  const isOverdue = Boolean(dueTime) && dueTime < now && assignment.status !== 'done' && assignment.status !== 'submitted';

  if (assignment.status === 'done') return { id: 'done', label: 'Completed', tone: 'success', isOverdue: false };
  if (assignment.status === 'submitted') return { id: 'submitted', label: 'Submitted', tone: 'info', isOverdue: false };
  if (assignment.status === 'returned') return { id: 'returned', label: 'Returned for revision', tone: 'warn', isOverdue };
  if (isOverdue) return { id: 'overdue', label: 'Overdue', tone: 'danger', isOverdue: true };
  return { id: 'todo', label: 'Assigned', tone: 'neutral', isOverdue: false };
}

/** Mirrors the server's tally so the strip stays right after a local update. */
function computeStats(assignments, now = Date.now()) {
  return assignments.reduce((acc, item) => {
    acc.total += 1;
    if (item.status === 'done') acc.done += 1;
    else if (item.status === 'submitted') acc.submitted += 1;
    else {
      acc.todo += 1;
      if (item.dueAt && new Date(item.dueAt).getTime() < now) acc.overdue += 1;
    }
    return acc;
  }, { total: 0, todo: 0, submitted: 0, done: 0, overdue: 0 });
}

function matchesWorkFilter(assignment, filter) {
  if (filter === 'all') return true;
  if (filter === 'done') return assignment.status === 'done';
  if (filter === 'submitted') return assignment.status === 'submitted';
  return assignment.status === 'open' || assignment.status === 'returned';
}

function formatDue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyClass() {
  const [user] = useState(() => ({
    name: localStorage.getItem('topkorbo_name') || 'Student',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    role: localStorage.getItem('topkorbo_role') || 'student'
  }));

  const [data, setData] = useState(EMPTY_CLASS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('work');
  const [filter, setFilter] = useState('todo');
  const [openId, setOpenId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [submissionAttachments, setSubmissionAttachments] = useState({});
  const [busyId, setBusyId] = useState('');
  const { on } = useSocket();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await fetchMyClass();
        if (cancelled) return;

        // An announcement or assignment that arrived over the socket while this
        // request was in flight would otherwise be wiped by a response that
        // predates it. Keep anything live that the response does not mention.
        setData((prev) => {
          const fetched = payload || EMPTY_CLASS;
          const keepLive = (fresh = [], live = []) => {
            const known = new Set(fresh.map((item) => String(item._id)));
            const extra = live.filter((item) => !known.has(String(item._id)));
            return extra.length ? [...extra, ...fresh] : fresh;
          };
          const assignments = keepLive(fetched.assignments, prev.assignments);
          return {
            ...fetched,
            announcements: keepLive(fetched.announcements, prev.announcements),
            assignments,
            stats: computeStats(assignments)
          };
        });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load your class.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Live Socket Sync for real-time updates without refreshing the page
  useEffect(() => {
    if (!on) return;

    const offAnnouncement = on('class:announcement:new', (announcement) => {
      setData((prev) => ({
        ...prev,
        announcements: [announcement, ...prev.announcements.filter((a) => a._id !== announcement._id)]
      }));
    });

    const offAssignmentNew = on('class:assignment:new', (assignment) => {
      setData((prev) => {
        const exists = prev.assignments.some((a) => a._id === assignment._id);
        const updated = exists
          ? prev.assignments.map((a) => (a._id === assignment._id ? assignment : a))
          : [assignment, ...prev.assignments];
        return {
          ...prev,
          assignments: updated,
          stats: computeStats(updated)
        };
      });
    });

    const offAssignmentUpdate = on('class:assignment:update', (assignment) => {
      setData((prev) => {
        const updated = prev.assignments.map((a) => (a._id === assignment._id ? { ...a, ...assignment } : a));
        return {
          ...prev,
          assignments: updated,
          stats: computeStats(updated)
        };
      });
    });

    const offAssignmentDelete = on('class:assignment:delete', ({ noteId }) => {
      setData((prev) => {
        const updated = prev.assignments.filter((a) => a._id !== noteId);
        return {
          ...prev,
          assignments: updated,
          stats: computeStats(updated)
        };
      });
    });

    return () => {
      offAnnouncement && offAnnouncement();
      offAssignmentNew && offAssignmentNew();
      offAssignmentUpdate && offAssignmentUpdate();
      offAssignmentDelete && offAssignmentDelete();
    };
  }, [on]);

  const stats = useMemo(
    () => data.stats || computeStats(data.assignments),
    [data.stats, data.assignments]
  );

  const visible = useMemo(
    () => data.assignments.filter((item) => matchesWorkFilter(item, filter)),
    [data.assignments, filter]
  );

  const filterCounts = useMemo(() => WORK_FILTERS.reduce((acc, item) => {
    acc[item.id] = data.assignments.filter((entry) => matchesWorkFilter(entry, item.id)).length;
    return acc;
  }, {}), [data.assignments]);

  // Every hand-in returns the updated record, so the list and the stats strip
  // both refresh from one response instead of a second round-trip.
  const applyUpdate = useCallback((updated) => {
    setData((prev) => {
      const assignments = prev.assignments.map((item) => (
        item._id === updated._id ? { ...item, ...updated, mentor: item.mentor } : item
      ));
      return { ...prev, assignments, stats: computeStats(assignments) };
    });
  }, []);

  const handleSubmit = async (assignment) => {
    if (busyId) return;
    setBusyId(assignment._id);
    try {
      const atts = submissionAttachments[assignment._id] || assignment.submission?.attachments || [];
      const updated = await submitAssignment(assignment._id, {
        body: drafts[assignment._id] ?? assignment.submission?.body ?? '',
        attachments: atts
      });
      applyUpdate(updated);
      toast.success('Turned in. Your mentor will review it.');
    } catch (err) {
      toast.error(err.message || 'Could not submit this assignment.');
    } finally {
      setBusyId('');
    }
  };

  const handleUnsubmit = async (assignment) => {
    if (busyId) return;
    setBusyId(assignment._id);
    try {
      const updated = await unsubmitAssignment(assignment._id);
      applyUpdate(updated);
      toast('Submission withdrawn — you can edit and turn it in again.');
    } catch (err) {
      toast.error(err.message || 'Could not withdraw this submission.');
    } finally {
      setBusyId('');
    }
  };

  const [selectedMentorId, setSelectedMentorId] = useState('');
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: '' });
  const [reviewSaving, setReviewSaving] = useState(false);
  const profileRequestIdRef = useRef(0);

  const closeProfile = useCallback(() => {
    profileRequestIdRef.current += 1;
    setSelectedMentorId('');
    setSelectedMentor(null);
    setProfileError('');
    setProfileLoading(false);
  }, []);

  const openProfile = useCallback(async (mentorId, mentorPreview = null) => {
    if (!mentorId) return;
    const requestId = ++profileRequestIdRef.current;
    setSelectedMentorId(mentorId);
    setSelectedMentor(mentorPreview ? {
      ...mentorPreview,
      connectionStatus: 'accepted',
      reviews: mentorPreview.recentReviews || []
    } : null);
    setProfileLoading(true);
    setProfileError('');

    try {
      const mentorData = await fetchMentorProfile(mentorId);
      if (requestId !== profileRequestIdRef.current) return;
      setSelectedMentor(mentorData);
      setReviewDraft({
        rating: mentorData?.currentUserReview?.rating || 5,
        comment: mentorData?.currentUserReview?.comment || ''
      });
    } catch (err) {
      if (requestId === profileRequestIdRef.current) {
        setProfileError(err.message || 'Could not load mentor profile.');
      }
    } finally {
      if (requestId === profileRequestIdRef.current) {
        setProfileLoading(false);
      }
    }
  }, []);

  const handleReviewSubmit = async (event) => {
    event?.preventDefault?.();
    if (!selectedMentorId || reviewSaving) return;
    setReviewSaving(true);
    try {
      const updated = await submitMentorReview(selectedMentorId, reviewDraft);
      setSelectedMentor(updated);
      toast.success('Review saved.');
    } catch (err) {
      toast.error(err.message || 'Could not save review.');
    } finally {
      setReviewSaving(false);
    }
  };

  const mentorNames = data.mentors.map((mentor) => formatDisplayName(mentor.name)).join(', ');

  return (
    <div className="dashboard-container">
      <Sidebar activeTab="my-class" user={user} />

      <main className="dashboard-main dashboard-main--class">
        <div className="dashboard-workspace">
          <div className="dashboard-workspace__body">
            <div className="mc-workspace">
              <header className="mc-header">
                <h1 className="mc-header__title">My Class</h1>
                {data.mentors.length > 0 && (
                  <div className="cls-mentors">
                    {data.mentors.map((mentor) => (
                      <button
                        type="button"
                        className="cls-mentor cls-mentor--btn"
                        key={mentor._id}
                        onClick={() => openProfile(mentor._id, mentor)}
                        title={`View ${mentor.name}'s profile details`}
                      >
                        <StudentAvatar name={mentor.name} src={mentor.avatar} size="sm" />
                        <span>{formatDisplayName(mentor.name)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </header>

              {error ? (
                <section className="mc-section">
                  <div className="mc-zero">
                    <span className="mc-zero__title">Could not load your class</span>
                    <p>{error}</p>
                  </div>
                </section>
              ) : loading ? (
                <ClassSkeleton />
              ) : data.mentors.length === 0 ? (
                <section className="mc-section">
                  <div className="mc-zero">
                    <span className="mc-zero__title">You are not connected to a mentor yet</span>
                    <p>
                      Once a mentor accepts your request, their announcements and the work they set
                      you show up here.
                    </p>
                    <Link className="mc-btn mc-btn--primary" to="/student/find-mentor">Find a mentor</Link>
                  </div>
                </section>
              ) : (
                <>
                  <div className="mc-metrics">
                    <div className="mc-metric">
                      <span className="mc-metric__value">{stats.todo}</span>
                      <span className="mc-metric__label">To do</span>
                    </div>
                    <div className="mc-metric">
                      <span className="mc-metric__value">{stats.submitted}</span>
                      <span className="mc-metric__label">Awaiting review</span>
                    </div>
                    <div className="mc-metric">
                      <span className="mc-metric__value">{stats.done}</span>
                      <span className="mc-metric__label">Completed</span>
                    </div>
                    <div className="mc-metric">
                      <span className={`mc-metric__value${stats.overdue > 0 ? ' cls-value--alert' : ''}`}>
                        {stats.overdue}
                      </span>
                      <span className="mc-metric__label">Overdue</span>
                    </div>
                  </div>

                  <section className="mc-section">
                    <div className="mc-toolbar">
                      <div className="mc-segmented" role="group" aria-label="Class view">
                        <button type="button" aria-pressed={tab === 'work'} onClick={() => setTab('work')}>
                          <HiOutlineClipboardList size={14} aria-hidden="true" />
                          Classwork
                        </button>
                        <button type="button" aria-pressed={tab === 'stream'} onClick={() => setTab('stream')}>
                          <HiOutlineSpeakerphone size={14} aria-hidden="true" />
                          Announcements
                        </button>
                      </div>

                      {tab === 'work' && (
                        <div className="mc-chips" role="group" aria-label="Filter assignments">
                          {WORK_FILTERS.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="mc-chip"
                              aria-pressed={filter === item.id}
                              onClick={() => setFilter(item.id)}
                            >
                              {item.label}
                              <span className="mc-chip__n">{filterCounts[item.id] ?? 0}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {tab === 'work' ? (
                      visible.length === 0 ? (
                        <div className="mc-zero">
                          <span className="mc-zero__title">
                            {data.assignments.length === 0
                              ? 'No assignments yet'
                              : 'Nothing in this list'}
                          </span>
                          <p>
                            {data.assignments.length === 0
                              ? `${mentorNames || 'Your mentor'} has not set you any work yet. Anything they assign lands here.`
                              : 'Try another filter to see the rest of your work.'}
                          </p>
                        </div>
                      ) : (
                        <div className="cls-list">
                          {visible.map((assignment) => (
                            <AssignmentCard
                              key={assignment._id}
                              assignment={assignment}
                              isOpen={openId === assignment._id}
                              isBusy={busyId === assignment._id}
                              draft={drafts[assignment._id]}
                              attachments={submissionAttachments[assignment._id] || assignment.submission?.attachments || []}
                              onToggle={() => setOpenId(openId === assignment._id ? '' : assignment._id)}
                              onDraftChange={(value) => setDrafts((prev) => ({ ...prev, [assignment._id]: value }))}
                              onAttachmentsChange={(atts) => setSubmissionAttachments((prev) => ({ ...prev, [assignment._id]: atts }))}
                              onSubmit={() => handleSubmit(assignment)}
                              onUnsubmit={() => handleUnsubmit(assignment)}
                              onOpenMentorProfile={openProfile}
                            />
                          ))}
                        </div>
                      )
                    ) : (
                      <StreamTab
                        announcements={data.announcements}
                        notes={data.notes}
                        onOpenMentorProfile={openProfile}
                      />
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {selectedMentorId && (
        <MentorProfileDialog
          mentor={selectedMentor}
          isLoading={profileLoading}
          error={profileError}
          isRequesting={false}
          reviewDraft={reviewDraft}
          reviewSaving={reviewSaving}
          onClose={closeProfile}
          onRetry={() => openProfile(selectedMentorId, selectedMentor)}
          onRequest={() => {}}
          onReviewChange={(patch) => setReviewDraft((prev) => ({ ...prev, ...patch }))}
          onReviewSubmit={handleReviewSubmit}
        />
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  isOpen,
  isBusy,
  draft,
  attachments = [],
  onToggle,
  onDraftChange,
  onAttachmentsChange,
  onSubmit,
  onUnsubmit,
  onOpenMentorProfile
}) {
  const status = describeAssignment(assignment);
  const title = assignment.target || 'Assignment';
  const due = formatDue(assignment.dueAt);
  const value = draft ?? assignment.submission?.body ?? '';
  const isLocked = assignment.status === 'done';
  const panelId = `cls-panel-${assignment._id}`;

  return (
    <article className={`cls-card cls-card--${status.id}`}>
      <div
        className="cls-card__head"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="cls-card__title" title={title}>{title}</span>
        <span className="cls-card__meta">
          {assignment.mentor && (
            <span
              className="cls-card__from cls-card__from--btn"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onOpenMentorProfile && onOpenMentorProfile(assignment.mentor._id, assignment.mentor);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenMentorProfile && onOpenMentorProfile(assignment.mentor._id, assignment.mentor);
                }
              }}
              title={`View ${assignment.mentor.name}'s profile details`}
            >
              <StudentAvatar name={assignment.mentor.name} src={assignment.mentor.avatar} size="sm" />
              <span className="cls-mentor-name">{formatDisplayName(assignment.mentor.name)}</span>
            </span>
          )}
          <span className="cls-card__posted">Posted {formatRelativeTime(assignment.createdAt)}</span>
          {due && (
            <span className={`cls-due${status.isOverdue ? ' cls-due--late' : ''}`}>
              {status.isOverdue && <HiOutlineExclamation size={13} aria-hidden="true" />}
              Due {due}
            </span>
          )}
        </span>
        <span className={`mc-status mc-status--${status.tone}`}>{status.label}</span>
      </div>

      {isOpen && (
        <div className="cls-card__body" id={panelId}>
          <p className="cls-card__brief">{assignment.body}</p>

          {assignment.attachments?.length > 0 && (
            <AttachmentView attachments={assignment.attachments} title="Assignment Reference Material" />
          )}

          {assignment.feedback?.body && (
            <div className="cls-feedback">
              <span className="cls-feedback__label">
                Mentor feedback · {formatDateTime(assignment.feedback?.reviewedAt)}
              </span>
              <p>{assignment.feedback?.body}</p>
            </div>
          )}

          {isLocked ? (
            <>
              <span className="mc-block__title">Your work</span>
              {assignment.submission?.body && (
                <p className="cls-submitted">{assignment.submission.body}</p>
              )}
              {assignment.submission?.attachments?.length > 0 && (
                <AttachmentView attachments={assignment.submission.attachments} title="Your Attached Files" />
              )}
              <p className="mc-note-line">
                Completed · submitted {formatDateTime(assignment.submission?.submittedAt)}
              </p>
            </>
          ) : assignment.status === 'submitted' ? (
            <>
              <span className="mc-block__title">Turned in</span>
              {assignment.submission?.body && (
                <p className="cls-submitted">{assignment.submission.body}</p>
              )}
              {assignment.submission?.attachments?.length > 0 && (
                <AttachmentView attachments={assignment.submission.attachments} title="Your Attached Files" />
              )}
              <div className="cls-actions">
                <span className="mc-note-line">
                  Submitted {formatRelativeTime(assignment.submission?.submittedAt)} · waiting on your mentor
                </span>
                <button type="button" className="mc-btn" disabled={isBusy} onClick={onUnsubmit}>
                  {isBusy ? 'Working…' : 'Unsubmit'}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="mc-block__title" htmlFor={`cls-draft-${assignment._id}`}>
                Your work
              </label>
              <textarea
                id={`cls-draft-${assignment._id}`}
                className="mc-field"
                rows={4}
                value={value}
                maxLength={4000}
                placeholder="Write your answer, or describe what you did..."
                onChange={(event) => onDraftChange(event.target.value.slice(0, 4000))}
              />

              <FileAttachmentPicker
                attachments={attachments}
                onChange={onAttachmentsChange}
                disabled={isBusy}
                label="Attach PDF Solution or Photo"
              />

              <div className="cls-actions">
                <span className="mc-count">{value.length}/4000</span>
                <button type="button" className="mc-btn mc-btn--primary" disabled={isBusy} onClick={onSubmit}>
                  {isBusy ? 'Turning in…' : (value.trim() || attachments.length) ? 'Turn in' : 'Mark as done'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function StreamTab({ announcements, notes, onOpenMentorProfile }) {
  if (!announcements.length && !notes.length) {
    return (
      <div className="mc-zero">
        <span className="mc-zero__title">Nothing posted yet</span>
        <p>Announcements your mentor broadcasts, and private notes they write for you, appear here.</p>
      </div>
    );
  }

  return (
    <div className="cls-stream">
      {announcements.map((item) => (
        <article className="cls-post" key={item._id}>
          <button
            type="button"
            className="cls-post__avatar-btn"
            onClick={() => onOpenMentorProfile && onOpenMentorProfile(item.mentor?._id, item.mentor)}
            title={`View ${item.mentor?.name || 'Mentor'}'s profile details`}
          >
            <StudentAvatar name={item.mentor?.name} src={item.mentor?.avatar} size="sm" />
          </button>
          <div className="cls-post__body">
            <span className="cls-post__head">
              <button
                type="button"
                className="cls-post__mentor-btn"
                onClick={() => onOpenMentorProfile && onOpenMentorProfile(item.mentor?._id, item.mentor)}
                title={`View ${item.mentor?.name || 'Mentor'}'s profile details`}
              >
                {formatDisplayName(item.mentor?.name)}
              </button>
              <span className="mc-note-line">{formatRelativeTime(item.createdAt)}</span>
            </span>
            <p>{item.message}</p>
            {item.attachments?.length > 0 && (
              <AttachmentView attachments={item.attachments} title="Attached Files" />
            )}
          </div>
        </article>
      ))}

      {notes.length > 0 && (
        <>
          <div className="mc-section__head">
            <h2 className="mc-section__title">Notes for you</h2>
            <span className="mc-section__rule" />
          </div>
          {notes.map((item) => (
            <article className="cls-post" key={item._id}>
              <button
                type="button"
                className="cls-post__avatar-btn"
                onClick={() => onOpenMentorProfile && onOpenMentorProfile(item.mentor?._id, item.mentor)}
                title={`View ${item.mentor?.name || 'Mentor'}'s profile details`}
              >
                <StudentAvatar name={item.mentor?.name} src={item.mentor?.avatar} size="sm" />
              </button>
              <div className="cls-post__body">
                <span className="cls-post__head">
                  <button
                    type="button"
                    className="cls-post__mentor-btn"
                    onClick={() => onOpenMentorProfile && onOpenMentorProfile(item.mentor?._id, item.mentor)}
                    title={`View ${item.mentor?.name || 'Mentor'}'s profile details`}
                  >
                    {formatDisplayName(item.mentor?.name)}
                  </button>
                  <span className="mc-note-line">{formatRelativeTime(item.createdAt)}</span>
                </span>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}

function ClassSkeleton() {
  return (
    <>
      <div className="mc-metrics" aria-busy="true">
        {[0, 1, 2, 3].map((key) => (
          <div className="mc-metric" key={key}>
            <span className="mc-sk mc-sk--line" style={{ width: 40, height: 20 }} />
            <span className="mc-sk mc-sk--line" style={{ width: '60%' }} />
          </div>
        ))}
      </div>
      <section className="mc-section">
        <div className="mc-toolbar">
          <span className="mc-sk mc-sk--line" style={{ width: 200, height: 32, borderRadius: 10 }} />
        </div>
        <div className="cls-list">
          {[0, 1, 2].map((key) => (
            <div className="cls-card" key={key}>
              <div className="cls-card__head">
                <span className="mc-sk mc-sk--line" style={{ width: '40%', height: 14 }} />
                <span className="mc-sk mc-sk--line" style={{ width: '70%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
