import { useEffect, useMemo, useState } from 'react';
import { HiSearch, HiViewGrid, HiViewList, HiArrowRight } from 'react-icons/hi';
import Sparkline from './Sparkline';
import StudentAvatar from './StudentAvatar';
import {
  getRosterStatus,
  getHealthStatus,
  formatDisplayName,
  formatRelativeTime,
  formatDayMonth,
  buildStudentMeta
} from './mentorDashboardUtils';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'active', label: 'Active today' },
  { id: 'top', label: 'Top scorers' }
];

const SORTS = [
  { id: 'recent', label: 'Recent activity' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'name', label: 'Name' }
];

const VIEW_STORAGE_KEY = 'topkorbo_mentor_roster_view';

function readStoredView() {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'table' || stored === 'grid' ? stored : 'grid';
  } catch {
    return 'grid';
  }
}

// The original filter predicates, lifted out verbatim so the chip counts and the
// visible list can never disagree about what a filter means.
function matchesFilter(entry, filter) {
  const accuracy = entry.analytics?.averageAccuracy || 0;
  if (filter === 'attention' && accuracy >= 60) return false;
  if (filter === 'active' && !entry.activeRecently) return false;
  if (filter === 'top' && accuracy < 75) return false;
  return true;
}

function matchesQuery(entry, query) {
  if (!query) return true;
  const haystack = `${entry.student.name} ${entry.student.collegeName || ''} ${entry.student.stream || ''}`.toLowerCase();
  return haystack.includes(query);
}

/** Last-activity line: a real sparkline when there is a series, plain text otherwise. */
function ActivityCell({ entry, tone }) {
  const hasSeries = Array.isArray(entry.trajectory) && entry.trajectory.length >= 2;

  if (entry.lastActivityAt) {
    const label = entry.lastActivitySummary
      ? `${entry.lastActivitySummary} · ${formatRelativeTime(entry.lastActivityAt)}`
      : formatRelativeTime(entry.lastActivityAt);
    return (
      <>
        {hasSeries && <Sparkline data={entry.trajectory} tone={tone} width={56} height={18} />}
        <span title={label}>{label}</span>
      </>
    );
  }

  const joined = formatDayMonth(entry.connectedAt);
  return <span>No practice yet{joined ? ` · joined ${joined}` : ''}</span>;
}

export default function MentorStudentRoster({ students, onOpenDossier }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState(readStoredView);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Private-mode browsers reject writes; the session default is fine.
    }
  }, [view]);

  const query = search.trim().toLowerCase();

  const visibleStudents = useMemo(() => {
    const filtered = students.filter((entry) => matchesFilter(entry, filter) && matchesQuery(entry, query));

    const sorted = [...filtered];
    if (sort === 'accuracy') {
      sorted.sort((a, b) => (b.analytics?.averageAccuracy || 0) - (a.analytics?.averageAccuracy || 0));
    } else if (sort === 'name') {
      sorted.sort((a, b) => a.student.name.localeCompare(b.student.name));
    } else {
      sorted.sort((a, b) => new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0));
    }
    return sorted;
  }, [students, filter, query, sort]);

  const filterCounts = useMemo(() => {
    const searched = students.filter((entry) => matchesQuery(entry, query));
    return FILTERS.reduce((acc, item) => {
      acc[item.id] = searched.filter((entry) => matchesFilter(entry, item.id)).length;
      return acc;
    }, {});
  }, [students, query]);

  return (
    <section className="mc-section" aria-labelledby="mc-roster-label">
      <div className="mc-section__head">
        <h2 className="mc-section__title" id="mc-roster-label">Student roster</h2>
        <span className="mc-section__rule" />
        <span className="mc-section__aside" aria-live="polite">
          {visibleStudents.length === students.length
            ? `${students.length} student${students.length === 1 ? '' : 's'}`
            : `${visibleStudents.length} of ${students.length}`}
        </span>
      </div>

      {students.length === 0 ? (
        <div className="mc-zero">
          <span className="mc-zero__title">No students connected yet</span>
          <p>
            Students find you through the mentor directory and send a request. Accepted students
            show up here with live accuracy, streak and activity signals.
          </p>
        </div>
      ) : (
        <>
          <div className="mc-toolbar">
            <div className="mc-search">
              <HiSearch size={15} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, college, stream…"
                aria-label="Search students"
              />
            </div>

            <div className="mc-chips" role="group" aria-label="Filter roster">
              {FILTERS.map((item) => (
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

            <span className="mc-toolbar__spacer" />

            <label className="mc-sort">
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>

            <div className="mc-segmented" role="group" aria-label="Roster layout">
              <button
                type="button"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                title="Card view"
              >
                <HiViewGrid size={14} aria-hidden="true" />
                <span className="mc-sr">Card view</span>
              </button>
              <button
                type="button"
                aria-pressed={view === 'table'}
                onClick={() => setView('table')}
                title="Table view"
              >
                <HiViewList size={14} aria-hidden="true" />
                <span className="mc-sr">Table view</span>
              </button>
            </div>
          </div>

          {visibleStudents.length === 0 ? (
            <div className="mc-zero">
              <span className="mc-zero__title">No students match these filters</span>
              <button
                type="button"
                className="mc-link-btn"
                onClick={() => { setSearch(''); setFilter('all'); }}
              >
                Clear search and filters
              </button>
            </div>
          ) : view === 'table' ? (
            <RosterTable students={visibleStudents} onOpenDossier={onOpenDossier} />
          ) : (
            <RosterGrid students={visibleStudents} onOpenDossier={onOpenDossier} />
          )}
        </>
      )}
    </section>
  );
}

function RosterGrid({ students, onOpenDossier }) {
  return (
    <div className="mc-roster__grid">
      {students.map((entry) => {
        const name = formatDisplayName(entry.student.name);
        const meta = buildStudentMeta(entry.student);
        const status = getRosterStatus(entry);
        const accuracy = entry.analytics?.averageAccuracy || 0;
        const hasAccuracy = (entry.analytics?.totalAttempts || 0) > 0;
        const tone = getHealthStatus(accuracy).tone;
        const pendingCount = entry.pendingSubmissionsCount || 0;

        return (
          <article className={`mc-card${pendingCount > 0 ? ' mc-card--has-submissions' : ''}`} key={entry.connectionId}>
            <div className="mc-card__head">
              <div style={{ position: 'relative' }}>
                <StudentAvatar name={entry.student.name} src={entry.student.avatar} />
                {pendingCount > 0 && (
                  <span className="mc-badge-dot" aria-hidden="true">
                    {pendingCount}
                  </span>
                )}
              </div>
              <div className="mc-card__identity">
                <span className="mc-card__name" title={name}>{name}</span>
                <span className="mc-card__meta" title={meta || 'No profile details'}>
                  {meta || 'No profile details'}
                </span>
              </div>
              {pendingCount > 0 && (
                <span className="mc-submission-badge">
                  <span aria-hidden="true">
                    📬 {pendingCount} {pendingCount === 1 ? 'submission' : 'submissions'}
                  </span>
                  <span className="mc-sr">
                    {pendingCount} assignment{pendingCount === 1 ? '' : 's'} submitted, awaiting your review
                  </span>
                </span>
              )}
            </div>

            <div className="mc-card__stats">
              {hasAccuracy ? (
                <span className="mc-acc">{Math.round(accuracy)}<small>%</small></span>
              ) : (
                <span className="mc-acc mc-acc--empty" title="No graded attempts yet">—</span>
              )}
              <span className={`mc-status mc-status--${status.tone}`}>{status.label}</span>
            </div>

            <div className="mc-card__activity">
              <ActivityCell entry={entry} tone={tone} />
            </div>

            <div className="mc-card__foot">
              <button
                type="button"
                className={`mc-btn mc-btn--block${pendingCount > 0 ? ' mc-btn--attention' : ''}`}
                onClick={() => onOpenDossier(entry.student._id)}
              >
                {pendingCount > 0 ? `Review submissions (${pendingCount})` : 'Open dossier'}
                <HiArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RosterTable({ students, onOpenDossier }) {
  return (
    <div className="mc-table-wrap">
      <table className="mc-table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">College</th>
            <th scope="col" className="mc-table__num">Accuracy</th>
            <th scope="col" className="mc-table__num">Mocks</th>
            <th scope="col">Last active</th>
            <th scope="col">Status</th>
            <th scope="col" className="mc-table__action"><span className="mc-sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {students.map((entry) => {
            const name = formatDisplayName(entry.student.name);
            const status = getRosterStatus(entry);
            const attempts = entry.analytics?.totalAttempts || 0;
            const accuracy = entry.analytics?.averageAccuracy || 0;
            const college = entry.student.collegeName || '—';
            const pendingCount = entry.pendingSubmissionsCount || 0;

            return (
              <tr key={entry.connectionId} className={pendingCount > 0 ? 'mc-table-row--has-submissions' : ''}>
                <td>
                  <span className="mc-table__student">
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <StudentAvatar name={entry.student.name} src={entry.student.avatar} size="sm" />
                      {pendingCount > 0 && (
                        <span className="mc-badge-dot mc-badge-dot--sm" aria-hidden="true">{pendingCount}</span>
                      )}
                    </span>
                    <span className="mc-table__name" title={name}>{name}</span>
                    {pendingCount > 0 && (
                      <span className="mc-submission-badge mc-submission-badge--sm">
                        <span aria-hidden="true">📬 {pendingCount}</span>
                        <span className="mc-sr">
                          {pendingCount} submission{pendingCount === 1 ? '' : 's'} to review
                        </span>
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  <span className="mc-table__muted" title={college}>{college}</span>
                </td>
                <td className="mc-table__num">{attempts ? `${Math.round(accuracy)}%` : '—'}</td>
                <td className="mc-table__num">{attempts}</td>
                <td>
                  <span className="mc-table__muted">
                    {entry.lastActivityAt
                      ? formatRelativeTime(entry.lastActivityAt)
                      : `Joined ${formatDayMonth(entry.connectedAt) || '—'}`}
                  </span>
                </td>
                <td>
                  <span className={`mc-status mc-status--${status.tone}`}>{status.label}</span>
                </td>
                <td className="mc-table__action">
                  <button
                    type="button"
                    className={`mc-btn mc-btn--sm${pendingCount > 0 ? ' mc-btn--attention' : ''}`}
                    onClick={() => onOpenDossier(entry.student._id)}
                  >
                    {pendingCount > 0 ? `Review (${pendingCount})` : 'Dossier'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
