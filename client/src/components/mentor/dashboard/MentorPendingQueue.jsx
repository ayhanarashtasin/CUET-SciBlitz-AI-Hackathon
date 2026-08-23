import { useState } from 'react';
import { HiCheck, HiX, HiEye } from 'react-icons/hi';
import StudentAvatar from './StudentAvatar';
import { formatDisplayName, formatRelativeTime, buildStudentMeta } from './mentorDashboardUtils';

const COLLAPSE_THRESHOLD = 3;

/**
 * MentorPendingQueue — a compact strip directly under the metrics. One row per
 * application: who, where from, what they want, and the three actions. Above
 * three applications it collapses to the first three with a "show all" toggle;
 * at zero it renders nothing at all rather than an empty-state box.
 */
export default function MentorPendingQueue({ requests, respondingRequestId, onRespond }) {
  const [expandedId, setExpandedId] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (!requests.length) return null;

  const isCollapsible = requests.length > COLLAPSE_THRESHOLD;
  const visible = isCollapsible && !showAll ? requests.slice(0, COLLAPSE_THRESHOLD) : requests;

  return (
    <section className="mc-pending" aria-labelledby="mc-pending-label">
      <div className="mc-pending__bar">
        <span className="mc-pending__label" id="mc-pending-label">Pending applications</span>
        <span className="mc-pending__count">{requests.length}</span>
        {isCollapsible && (
          <button
            type="button"
            className="mc-btn mc-btn--sm mc-pending__toggle"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll ? 'Show first 3' : `Show all ${requests.length}`}
          </button>
        )}
      </div>

      {visible.map((request) => {
        const student = request.student;
        const name = formatDisplayName(student.name);
        const meta = buildStudentMeta(student);
        const goals = (student.aspirations || []).join(', ');
        const isBusy = respondingRequestId === request._id;
        const isExpanded = expandedId === request._id;
        const peekId = `mc-peek-${request._id}`;

        return (
          <article key={request._id}>
            <div className="mc-pending__row">
              <StudentAvatar name={student.name} src={student.avatar} size="sm" />

              <div className="mc-pending__identity">
                <span className="mc-pending__name" title={name}>{name}</span>
                {meta && <span className="mc-pending__meta" title={meta}>{meta}</span>}
                {goals && <span className="mc-pending__goal" title={goals}>Goal: {goals}</span>}
                <span className="mc-pending__meta">{formatRelativeTime(request.requestedAt)}</span>
              </div>

              <div className="mc-pending__actions">
                <button
                  type="button"
                  className="mc-icon-btn"
                  aria-expanded={isExpanded}
                  aria-controls={peekId}
                  onClick={() => setExpandedId(isExpanded ? '' : request._id)}
                  title={`View ${name}'s details`}
                >
                  <HiEye size={15} aria-hidden="true" />
                  <span className="mc-sr">View {name}&apos;s details</span>
                </button>
                <button
                  type="button"
                  className="mc-btn mc-btn--sm mc-btn--accept"
                  disabled={isBusy}
                  onClick={() => onRespond(request._id, 'accepted')}
                >
                  <HiCheck size={14} aria-hidden="true" />
                  Accept
                </button>
                <button
                  type="button"
                  className="mc-btn mc-btn--sm mc-btn--decline"
                  disabled={isBusy}
                  onClick={() => onRespond(request._id, 'declined')}
                >
                  <HiX size={14} aria-hidden="true" />
                  Decline
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="mc-pending__peek" id={peekId}>
                <dl className="mc-peek-grid">
                  <div><dt>Email</dt><dd>{student.email || '—'}</dd></div>
                  <div><dt>Stream</dt><dd>{student.stream || '—'}</dd></div>
                  <div><dt>Status</dt><dd>{student.academicStatus || '—'}</dd></div>
                  <div><dt>Target</dt><dd>{goals || '—'}</dd></div>
                </dl>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
