import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HiX, HiCheck, HiTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import Sparkline from './Sparkline';
import StudentAvatar from './StudentAvatar';
import FileAttachmentPicker from '../../common/FileAttachmentPicker';
import AttachmentView from '../../common/AttachmentView';
import useSocket from '../../../hooks/useSocket';
import {
  fetchStudentDossier,
  saveStudentNote,
  updateStudentNote,
  deleteStudentNote,
  reviewAssignment
} from '../../../services/mentorApi';
import {
  getHealthStatus,
  formatDisplayName,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatDuration
} from './mentorDashboardUtils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'practice', label: 'Practice' },
  { id: 'contests', label: 'Contests & mocks' },
  { id: 'notes', label: 'Assignments & Notes' }
];

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function StudentDossierDrawer({ studentId, onClose, onAssignmentReviewed }) {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [reloadKey, setReloadKey] = useState(0);

  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const tabsRef = useRef(null);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const { on } = useSocket();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchStudentDossier(studentId);
        if (!cancelled) {
          setDossier(data);
          const hasPending = (data?.notes || []).some(
            (note) => note.kind === 'homework' && note.status === 'submitted'
          );
          if (hasPending) {
            setActiveTab('notes');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load student dossier.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [studentId, reloadKey]);

  // Scroll lock and focus restore are deliberately mount-scoped (empty deps).
  // Folding them in with the key handler tied this cleanup to `onClose`, so any
  // parent re-render restored focus to the roster button behind the modal —
  // stealing the caret out of the feedback box mid-sentence.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, []);

  // Escape closes; Tab cycles within the panel.
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
        .filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!loading) closeRef.current?.focus();
  }, [loading]);

  /**
   * Accepts either the next array or an updater. Handlers that await a request
   * before writing back must pass an updater: the `notes` they captured when
   * the click happened may be stale by the time the response lands (another
   * review finished, or a live submission arrived).
   */
  const handleNotesChanged = useCallback((update) => {
    setDossier((prev) => {
      if (!prev) return prev;
      const notes = typeof update === 'function' ? update(prev.notes || []) : update;
      return { ...prev, notes };
    });
  }, []);

  // Keep an open dossier live. Without this the "Submissions awaiting review"
  // panel stayed frozen at whatever it held when the modal opened, so work that
  // arrived while the mentor was reading was invisible until they reopened it.
  useEffect(() => {
    const upsert = (incoming) => {
      if (String(incoming?.studentId || '') !== String(studentId)) return;
      setDossier((prev) => {
        if (!prev) return prev;
        const notes = prev.notes || [];
        const exists = notes.some((note) => String(note._id) === String(incoming._id));
        return {
          ...prev,
          notes: exists
            ? notes.map((note) => (String(note._id) === String(incoming._id) ? { ...note, ...incoming } : note))
            : [incoming, ...notes]
        };
      });
    };

    const offSubmitted = on('class:assignment:submitted', upsert);
    const offUpdate = on('class:assignment:update', upsert);
    return () => {
      offSubmitted && offSubmitted();
      offUpdate && offUpdate();
    };
  }, [on, studentId]);

  /**
   * Arrow-key navigation for the tablist. The roving `tabIndex={-1}` on inactive
   * tabs takes them out of the Tab order by design, which left them reachable by
   * nothing at all until this handler existed.
   */
  const handleTabKeyDown = useCallback((event) => {
    const list = event.currentTarget;
    const focusTab = (id) => {
      window.requestAnimationFrame(() => {
        list?.querySelector(`#mc-tab-${id}`)?.focus();
      });
    };

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target = event.key === 'Home' ? TABS[0].id : TABS[TABS.length - 1].id;
      setActiveTab(target);
      focusTab(target);
      return;
    }

    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();

    setActiveTab((current) => {
      const index = TABS.findIndex((tab) => tab.id === current);
      const next = TABS[(index + step + TABS.length) % TABS.length].id;
      focusTab(next);
      return next;
    });
  }, []);

  const pendingSubmissions = useMemo(() => {
    return (dossier?.notes || []).filter((note) => note.kind === 'homework' && note.status === 'submitted');
  }, [dossier?.notes]);

  const profile = dossier?.profile;
  const name = profile ? formatDisplayName(profile.name) : 'Student dossier';
  const accuracy = Math.round(dossier?.overview?.averageAccuracy || 0);
  const hasAttempts = (dossier?.overview?.totalAttempts || 0) > 0;
  const tone = getHealthStatus(dossier?.overview?.averageAccuracy || 0).tone;

  const metaLine = profile
    ? [
        profile.academicStatus || 'HSC candidate',
        profile.stream,
        profile.hscBatch ? `HSC ${profile.hscBatch}` : '',
        profile.aspirations?.length ? `Aim: ${profile.aspirations.join(', ')}` : ''
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="mc-drawer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.aside
        ref={panelRef}
        className="mc-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {loading ? (
          <DossierSkeleton onClose={onClose} closeRef={closeRef} titleId={titleId} />
        ) : error ? (
          <>
            <header className="mc-drawer__header">
              <span className="mc-drawer__name" id={titleId}>Student dossier</span>
              <button type="button" className="mc-icon-btn mc-drawer__close" ref={closeRef} onClick={onClose} aria-label="Close dossier">
                <HiX size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="mc-drawer__state mc-drawer__state--error">
              <p>{error}</p>
              <button type="button" className="mc-btn mc-btn--sm" onClick={() => setReloadKey((key) => key + 1)}>Retry</button>
            </div>
          </>
        ) : profile ? (
          <>
            <header className="mc-drawer__header">
              <StudentAvatar name={profile.name} src={profile.avatar} size="lg" />
              <div className="mc-drawer__identity">
                <span className="mc-drawer__name" id={titleId} title={name}>{name}</span>
                <p className="mc-drawer__meta" title={metaLine}>{metaLine}</p>
                <div className="mc-drawer__chips">
                  {hasAttempts && (
                    <span className={`mc-status mc-status--${tone === 'risk' ? 'danger' : tone === 'strong' ? 'success' : 'warn'}`}>
                      {accuracy}% accuracy
                    </span>
                  )}
                  {profile.streak > 0 && <span className="mc-status mc-status--plain">{profile.streak}-day streak</span>}
                  {profile.collegeName && (
                    <span className="mc-status mc-status--plain" title={profile.collegeName}>{profile.collegeName}</span>
                  )}
                </div>
              </div>
              <button type="button" className="mc-icon-btn mc-drawer__close" ref={closeRef} onClick={onClose} aria-label="Close dossier">
                <HiX size={16} aria-hidden="true" />
              </button>
            </header>

            <div
              className="mc-tabs"
              role="tablist"
              aria-label="Dossier sections"
              ref={tabsRef}
              onKeyDown={handleTabKeyDown}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`mc-tab-${tab.id}`}
                  className="mc-tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`mc-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === 'notes' && pendingSubmissions.length > 0 && (
                    <span className="mc-tab-badge">
                      <span aria-hidden="true">{pendingSubmissions.length}</span>
                      <span className="mc-sr">
                        {pendingSubmissions.length} submission
                        {pendingSubmissions.length === 1 ? '' : 's'} awaiting review
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div
              className="mc-drawer__body"
              role="tabpanel"
              id={`mc-panel-${activeTab}`}
              aria-labelledby={`mc-tab-${activeTab}`}
              tabIndex={-1}
            >
              {activeTab === 'overview' && <OverviewTab dossier={dossier} onGoToNotes={() => setActiveTab('notes')} />}
              {activeTab === 'practice' && <PracticeTab items={dossier.practiceHistory} onGoToNotes={() => setActiveTab('notes')} />}
              {activeTab === 'contests' && <ContestsTab mockTests={dossier.mockTests} contests={dossier.contests} />}
              {activeTab === 'notes' && (
                <NotesTab
                  studentId={studentId}
                  notes={dossier.notes}
                  onNotesChanged={handleNotesChanged}
                  onAssignmentReviewed={onAssignmentReviewed}
                  pendingSubmissions={pendingSubmissions}
                />
              )}
            </div>
          </>
        ) : null}
      </motion.aside>
    </div>
  );
}

function DossierSkeleton({ onClose, closeRef, titleId }) {
  return (
    <>
      <header className="mc-drawer__header">
        <span className="mc-sk mc-sk--avatar" style={{ width: 48, height: 48 }} />
        <div className="mc-sk-stack">
          <span className="mc-sr" id={titleId}>Loading student dossier</span>
          <span className="mc-sk mc-sk--line" style={{ width: '52%', height: 14 }} />
          <span className="mc-sk mc-sk--line" style={{ width: '72%' }} />
          <span className="mc-sk mc-sk--line" style={{ width: '38%' }} />
        </div>
        <button type="button" className="mc-icon-btn mc-drawer__close" ref={closeRef} onClick={onClose} aria-label="Close dossier">
          <HiX size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="mc-drawer__body" aria-busy="true">
        <div className="mc-tabpane">
          <div className="mc-stat-row">
            {[0, 1, 2, 3].map((key) => (
              <div className="mc-stat" key={key}>
                <span className="mc-sk mc-sk--line" style={{ width: '70%' }} />
                <span className="mc-sk mc-sk--line" style={{ width: '45%', height: 16, marginTop: 4 }} />
              </div>
            ))}
          </div>
          {[0, 1, 2].map((key) => (
            <div className="mc-block" key={key}>
              <span className="mc-sk mc-sk--line" style={{ width: 120 }} />
              <span className="mc-sk mc-sk--line" style={{ width: '100%', height: 34 }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OverviewTab({ dossier, onGoToNotes }) {
  const { overview } = dossier;
  const routine = overview.routineAdherence || {};
  const subjects = overview.subjectAccuracy || [];
  const hasAnything = (overview.totalAttempts || 0) > 0 || subjects.length > 0 || routine.hasRoutine;

  // One honest empty state beats four zeroed stat boxes and three "no data"
  // headings stacked on top of each other.
  if (!hasAnything) {
    return (
      <div className="mc-tabpane">
        <div className="mc-zero">
          <span className="mc-zero__title">Nothing logged yet</span>
          <p>
            This student has not completed a mock test or a graded practice set, so there is no
            accuracy, subject breakdown or routine data to show. Set them a first task and the
            metrics fill in as they work.
          </p>
          <button type="button" className="mc-btn mc-btn--primary" onClick={onGoToNotes}>
            Assign first practice set
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-tabpane">
      <div className="mc-stat-row">
        <div className="mc-stat"><span>Mock attempts</span><strong>{overview.totalAttempts}</strong></div>
        <div className="mc-stat"><span>Avg score</span><strong>{overview.averageScore}</strong></div>
        <div className="mc-stat"><span>Best score</span><strong>{overview.bestScore}</strong></div>
        <div className="mc-stat"><span>Streak</span><strong>{overview.streak}d</strong></div>
      </div>

      {overview.trajectory?.length >= 2 && (
        <div className="mc-block">
          <h3 className="mc-block__title">Score trajectory</h3>
          <div className="mc-trajectory">
            <Sparkline data={overview.trajectory} width={280} height={48} tone="steady" />
          </div>
        </div>
      )}

      {subjects.length > 0 && (
        <div className="mc-block">
          <h3 className="mc-block__title">Subject accuracy</h3>
          <div className="mc-bar-list">
            {subjects.map((subject) => {
              const accuracy = Math.round(subject.accuracy);
              const tone = accuracy < 50 ? 'is-danger' : accuracy < 75 ? 'is-warn' : 'is-success';
              return (
                <div className="mc-bar-row" key={subject.subject}>
                  <div className="mc-bar-row__label">
                    <span className="mc-bar-row__topic" title={subject.subject}>{subject.subject}</span>
                    <span className="mc-bar-row__sub">{subject.correct}/{subject.total} correct</span>
                  </div>
                  <div className="mc-bar">
                    <i className={tone} style={{ width: `${Math.max(4, accuracy)}%` }} />
                  </div>
                  <span className="mc-bar-row__value">{accuracy}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {routine.hasRoutine && (
        <div className="mc-block">
          <h3 className="mc-block__title">Study routine adherence</h3>
          <div className="mc-routine">
            <div className="mc-routine__gauge">
              <strong>{routine.adherencePercent}%</strong>
              <span>completed this week</span>
            </div>
            <div className="mc-routine__detail">
              <div><span>Blocks done</span><strong>{routine.completedBlocks}/{routine.totalBlocks}</strong></div>
              <div><span>Days on track</span><strong>{routine.daysOnTrack}/{routine.daysTracked}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PracticeTab({ items, onGoToNotes }) {
  if (!items || items.length === 0) {
    return (
      <div className="mc-tabpane">
        <div className="mc-zero">
          <span className="mc-zero__title">No practice sessions yet</span>
          <p>Once this student runs a practice set you will see focus, timing and accuracy per session here.</p>
          <button type="button" className="mc-btn mc-btn--primary" onClick={onGoToNotes}>
            Assign a practice set
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-tabpane">
      <div className="mc-log-list">
        {items.map((item) => {
          const focus = item.title || item.subjects?.[0] || 'Practice session';
          const tone = getHealthStatus(item.percentage).tone;
          return (
            <div key={item._id} className="mc-log">
              <div className="mc-log__main">
                <strong>{focus}</strong>
                <span className="mc-log__meta">
                  {(item.chapters?.[0] || item.subjects?.join(', ') || 'Mixed')} · {formatDuration(item.timeTakenSeconds)}
                </span>
                <span className="mc-log__date">{formatDateTime(item.createdAt)}</span>
              </div>
              <div className={`mc-log__score mc-log__score--${tone}`}>
                <strong>{item.percentage}%</strong>
                <span>{item.correct} right · {item.incorrect} wrong · {item.skipped} skipped</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContestsTab({ mockTests, contests }) {
  const hasMocks = mockTests && mockTests.length > 0;
  const hasContests = contests && contests.length > 0;

  if (!hasMocks && !hasContests) {
    return (
      <div className="mc-tabpane">
        <div className="mc-zero">
          <span className="mc-zero__title">No mocks or contests yet</span>
          <p>Ranked results appear here after this student sits their first mock test or joins a contest.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-tabpane">
      {hasMocks && (
        <div className="mc-block">
          <h3 className="mc-block__title">Mock tests</h3>
          <div className="mc-log-list">
            {mockTests.map((test) => (
              <div key={test._id} className="mc-log">
                <div className="mc-log__main">
                  <strong>Mock test · {test.total} Qs</strong>
                  <span className="mc-log__meta">
                    Rank #{test.ranking?.overallPosition || '—'} / {test.ranking?.totalAttempts || '—'}
                    {test.ranking?.percentile ? ` · ${test.ranking.percentile}th pct` : ''}
                  </span>
                  <span className="mc-log__date">{formatDateTime(test.createdAt)}</span>
                </div>
                <div className="mc-log__score">
                  <strong>{test.score}</strong>
                  <span>{test.correct} right · {test.wrong} wrong</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasContests && (
        <div className="mc-block">
          <h3 className="mc-block__title">Contests</h3>
          <div className="mc-log-list">
            {contests.map((contest) => (
              <div key={contest._id} className="mc-log">
                <div className="mc-log__main">
                  <strong>{contest.contestName}</strong>
                  <span className="mc-log__meta">
                    {contest.finalRank ? `Rank #${contest.finalRank}` : 'Unranked'}
                    {contest.pointsEarned ? ` · ${contest.pointsEarned} pts` : ''}
                  </span>
                  <span className="mc-log__date">{formatDate(contest.contestDate || contest.submittedAt)}</span>
                </div>
                <div className="mc-log__score">
                  <strong>{contest.score}/{contest.totalQuestions}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Homework lifecycle as one chip. Observations never carry a state. */
function describeHomework(note, now = Date.now()) {
  if (note.status === 'done') return { label: 'Completed', tone: 'success' };
  if (note.status === 'submitted') return { label: 'Awaiting review', tone: 'info' };
  if (note.status === 'returned') return { label: 'Returned', tone: 'warn' };
  if (note.dueAt && new Date(note.dueAt).getTime() < now) return { label: 'Overdue', tone: 'danger' };
  return { label: 'Assigned', tone: 'neutral' };
}

function NotesTab({ studentId, notes, onNotesChanged, onAssignmentReviewed, pendingSubmissions = [] }) {
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [composerAttachments, setComposerAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [reviewBusyId, setReviewBusyId] = useState('');

  const handleSave = async () => {
    const text = body.trim();
    if ((!text && !composerAttachments.length) || saving) return;
    setSaving(true);
    try {
      const created = await saveStudentNote(studentId, {
        kind,
        body: text || (kind === 'homework' ? 'Solve the attached homework.' : 'Reference attached file.'),
        target: target.trim(),
        dueAt: kind === 'homework' && dueAt ? dueAt : null,
        // A bare date means "end of this day where the mentor is", not UTC
        // midnight — otherwise work goes red on the morning it is due.
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
        attachments: composerAttachments
      });
      onNotesChanged((current) => [created, ...current]);
      setBody('');
      setTarget('');
      setDueAt('');
      setComposerAttachments([]);
      setKind('note');
      toast.success(kind === 'homework' ? 'Homework assigned to student!' : 'Observation saved.');
    } catch (err) {
      toast.error(err.message || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (note, action) => {
    if (reviewBusyId) return;
    setReviewBusyId(note._id);
    try {
      const feedback = (reviewDrafts[note._id] ?? '').trim();
      const updated = await reviewAssignment(note._id, { action, feedback });
      onNotesChanged((current) => current.map((item) => (item._id === note._id ? updated : item)));
      if (onAssignmentReviewed) {
        onAssignmentReviewed(studentId, note._id);
      }
      toast.success(action === 'return' ? 'Sent back for student revision.' : 'Assignment marked complete!');
    } catch (err) {
      toast.error(err.message || 'Could not save review.');
    } finally {
      setReviewBusyId('');
    }
  };

  const handleToggle = async (note) => {
    setBusyId(note._id);
    try {
      const nextStatus = note.status === 'done' ? 'open' : 'done';
      const updated = await updateStudentNote(note._id, { status: nextStatus });
      onNotesChanged((current) => current.map((item) => (item._id === note._id ? updated : item)));
      // Ticking a *submitted* assignment closes it just as a review would, so
      // the roster badge has to drop with it rather than stay stuck.
      if (note.status === 'submitted' && onAssignmentReviewed) {
        onAssignmentReviewed(studentId, note._id);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update note.');
    } finally {
      setBusyId('');
    }
  };

  const handleDelete = async (note) => {
    if (!window.confirm('Remove this note or assignment?')) return;
    setBusyId(note._id);
    try {
      await deleteStudentNote(note._id);
      onNotesChanged((current) => current.filter((item) => item._id !== note._id));
      if (note.status === 'submitted' && onAssignmentReviewed) {
        onAssignmentReviewed(studentId, note._id);
      }
      toast.success('Removed successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete note.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="mc-tabpane">
      {/* ── Pending Submissions Review Section ── */}
      {pendingSubmissions.length > 0 && (
        <div className="mc-review-block">
          <div className="mc-review-block__header">
            <span className="mc-review-block__badge">
              📬 {pendingSubmissions.length} {pendingSubmissions.length === 1 ? 'Submission' : 'Submissions'} Awaiting Review
            </span>
            <span className="mc-review-block__hint">
              Review student's answer, uploaded solution sheets, and approve or send back with feedback
            </span>
          </div>

          <div className="mc-review-block__list">
            {pendingSubmissions.map((sub) => (
              <div key={sub._id} className="mc-review-card">
                <div className="mc-review-card__header">
                  <div className="mc-review-card__identity">
                    <strong className="mc-review-card__target">
                      {sub.target || 'Homework Task'}
                    </strong>
                    <span className="mc-review-card__date">
                      Turned in {formatDateTime(sub.submission?.submittedAt)}
                    </span>
                  </div>
                  <span className="mc-status mc-status--info">Awaiting review</span>
                </div>

                <p className="mc-review-card__assignment-body">
                  <strong>Assigned Task:</strong> {sub.body}
                </p>

                {sub.attachments?.length > 0 && (
                  <AttachmentView attachments={sub.attachments} title="Assigned Reference Material" />
                )}

                <div className="mc-review-card__work">
                  <span className="mc-review-card__label">Student's Submission:</span>
                  {sub.submission?.body && (
                    <div className="mc-review-card__work-content">
                      {sub.submission.body}
                    </div>
                  )}
                  {sub.submission?.attachments?.length > 0 && (
                    <AttachmentView attachments={sub.submission.attachments} title="Student Attached Files (PDF / Photos)" />
                  )}
                  {!sub.submission?.body && !sub.submission?.attachments?.length && (
                    <div className="mc-review-card__work-content">
                      <em>(Marked done without text or attachments)</em>
                    </div>
                  )}
                </div>

                <div className="mc-review-card__feedback">
                  <label className="mc-review-card__label" htmlFor={`feedback-${sub._id}`}>
                    Mentor Feedback & Correction Notes:
                  </label>
                  <textarea
                    id={`feedback-${sub._id}`}
                    className="mc-field"
                    rows={2}
                    value={reviewDrafts[sub._id] ?? sub.feedback?.body ?? ''}
                    onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [sub._id]: e.target.value }))}
                    placeholder="Write constructive feedback for the student (e.g. Great solution for problem 2, but check your signs in problem 4)..."
                  />
                </div>

                <div className="mc-review-card__actions">
                  <button
                    type="button"
                    className="mc-btn mc-btn--sm mc-btn--warn"
                    disabled={reviewBusyId === sub._id}
                    onClick={() => handleReview(sub, 'return')}
                  >
                    {reviewBusyId === sub._id ? 'Saving…' : 'Request Revision'}
                  </button>
                  <button
                    type="button"
                    className="mc-btn mc-btn--sm mc-btn--primary"
                    disabled={reviewBusyId === sub._id}
                    onClick={() => handleReview(sub, 'approve')}
                  >
                    {reviewBusyId === sub._id ? 'Saving…' : '✓ Mark Complete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Assign / Note Composer ── */}
      <div className="mc-composer">
        <div className="mc-segmented" role="group" aria-label="Note type">
          <button type="button" aria-pressed={kind === 'note'} onClick={() => setKind('note')}>Observation</button>
          <button type="button" aria-pressed={kind === 'homework'} onClick={() => setKind('homework')}>Homework / Task</button>
        </div>
        {kind === 'homework' && (
          <>
            <input
              type="text"
              className="mc-field"
              value={target}
              onChange={(event) => setTarget(event.target.value.slice(0, 200))}
              placeholder="Assign a chapter or target (e.g. Integration – Ch 9)"
              aria-label="Homework target"
            />
            <div className="mc-composer__row">
              <label htmlFor="mc-due">Due date (optional)</label>
              <input
                id="mc-due"
                type="date"
                className="mc-field"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
              {dueAt && (
                <button type="button" className="mc-link-btn" onClick={() => setDueAt('')}>Clear</button>
              )}
            </div>
          </>
        )}
        <textarea
          className="mc-field"
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 2000))}
          placeholder={kind === 'homework' ? "Describe the task, questions to solve, or reading required..." : "Write a private observation or instruction for this student…"}
          rows={3}
          aria-label="Note body"
        />

        <FileAttachmentPicker
          attachments={composerAttachments}
          onChange={setComposerAttachments}
          disabled={saving}
          label="Attach Reference PDF / Question Image"
        />

        <div className="mc-composer__footer">
          <span className="mc-count">{body.length}/2000</span>
          <button
            type="button"
            className="mc-btn mc-btn--primary mc-btn--sm"
            disabled={(!body.trim() && !composerAttachments.length) || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : (kind === 'homework' ? 'Assign task' : 'Save note')}
          </button>
        </div>
      </div>

      {/* ── List of Notes & Assignments ── */}
      {notes.length === 0 ? (
        <p className="mc-note-line">No notes or assignments set for this student yet.</p>
      ) : (
        <div className="mc-note-list">
          {notes.map((note) => (
            <div key={note._id} className={`mc-note ${note.status === 'done' ? 'mc-note--done' : ''}`}>
              <div className="mc-note__main">
                <div className="mc-note__tags">
                  <span className={`mc-note__badge mc-note__badge--${note.kind}`}>
                    {note.kind === 'homework' ? 'Homework' : 'Note'}
                  </span>
                  {note.target && <span className="mc-note__target">{note.target}</span>}
                  {note.kind === 'homework' && (
                    <span className={`mc-status mc-status--${describeHomework(note).tone}`}>
                      {describeHomework(note).label}
                    </span>
                  )}
                  {note.dueAt && (
                    <span className={`mc-note__due${describeHomework(note).tone === 'danger' ? ' mc-note__due--late' : ''}`}>
                      Due {formatDayMonth(note.dueAt)}
                    </span>
                  )}
                </div>
                <p className="mc-note__body">{note.body}</p>

                {note.attachments?.length > 0 && (
                  <AttachmentView attachments={note.attachments} title="Reference Material" />
                )}

                {note.submission?.submittedAt && (
                  <div className="mc-note__submission-preview">
                    <span className="mc-note__sub-title">
                      Student Submission ({formatDateTime(note.submission.submittedAt)}):
                    </span>
                    {note.submission.body && (
                      <p className="mc-note__sub-body">{note.submission.body}</p>
                    )}
                    {note.submission.attachments?.length > 0 && (
                      <AttachmentView attachments={note.submission.attachments} title="Submitted Files" />
                    )}
                  </div>
                )}

                {note.feedback?.body && (
                  <div className="mc-note__feedback-preview">
                    <span className="mc-note__sub-title">Your Review Feedback:</span>
                    <p className="mc-note__sub-body">{note.feedback.body}</p>
                  </div>
                )}

                <span className="mc-note__date">{formatDateTime(note.createdAt)}</span>
              </div>
              <div className="mc-note__actions">
                {note.kind === 'homework' && (
                  <button
                    type="button"
                    className={`mc-icon-btn ${note.status === 'done' ? 'mc-icon-btn--done' : ''}`}
                    disabled={busyId === note._id}
                    onClick={() => handleToggle(note)}
                    title={note.status === 'done' ? 'Mark as open' : 'Mark as done'}
                    aria-label={note.status === 'done' ? 'Mark as open' : 'Mark as done'}
                  >
                    <HiCheck size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="mc-icon-btn mc-icon-btn--danger"
                  disabled={busyId === note._id}
                  onClick={() => handleDelete(note)}
                  title="Delete note"
                  aria-label="Delete note"
                >
                  <HiTrash size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
