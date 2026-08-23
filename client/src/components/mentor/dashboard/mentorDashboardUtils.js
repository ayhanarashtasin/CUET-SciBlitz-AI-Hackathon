/**
 * Shared presentation helpers for the mentor command center. Keeps the health
 * thresholds, relative-time formatting, and initials logic in one place so the
 * roster cards, command bar, and dossier drawer stay visually consistent.
 */

// Accuracy thresholds drive the green/amber/red health chips on roster cards.
export function getHealthStatus(accuracy) {
  const value = Number(accuracy) || 0;
  if (value >= 75) return { tone: 'strong', label: 'Top Performer' };
  if (value >= 60) return { tone: 'steady', label: 'On Track' };
  return { tone: 'risk', label: 'Needs Attention' };
}

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'S';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function formatRelativeTime(value) {
  if (!value) return 'No activity yet';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'No activity yet';

  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'} ago`;

  return `${Math.round(months / 12)} yr ago`;
}

export function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

// Direction of the last-vs-first delta in a trajectory series.
export function getTrend(series = []) {
  if (!Array.isArray(series) || series.length < 2) return { direction: 'flat', delta: 0 };
  const delta = Math.round(series[series.length - 1] - series[0]);
  if (delta > 2) return { direction: 'up', delta };
  if (delta < -2) return { direction: 'down', delta };
  return { direction: 'flat', delta };
}

/* ---------------------------------------------------------------------------
   Presentation normalisers added for the command-center rebuild.
   -------------------------------------------------------------------------- */

/**
 * Names arrive from the database exactly as the student typed them, so the same
 * person renders as "ISHRAK HOWLADER" in one row and "Ishrak Howlader" in the
 * next. Title-case any all-caps latin run and leave every other script alone —
 * Bengali is caseless, so `\p{Lu}` never matches and the string passes through
 * untouched.
 */
export function formatDisplayName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Unnamed student';

  const fixPart = (part) => {
    if (part.length < 2) return part;
    const hasUpper = /\p{Lu}/u.test(part);
    const hasLower = /\p{Ll}/u.test(part);
    if (!hasUpper || hasLower) return part;
    return part.charAt(0) + part.slice(1).toLowerCase();
  };

  return name
    .split(' ')
    .map((word) => word.split(/([-'’.])/).map((part) => (/^[-'’.]$/.test(part) ? part : fixPart(part))).join(''))
    .join(' ');
}

/**
 * Deterministic avatar colours so a student without a photo keeps the same
 * letter tile everywhere. Every pair clears 4.5:1 ink-on-fill.
 */
const AVATAR_PALETTE = [
  { fill: '#FDE7DA', ink: '#8A4622' },
  { fill: '#E4EEF8', ink: '#1F5B8F' },
  { fill: '#E7F4EE', ink: '#1B6B45' },
  { fill: '#F1E9F7', ink: '#6B3E96' },
  { fill: '#FBEBD7', ink: '#8A5A00' },
  { fill: '#E9EDF0', ink: '#3E4A54' }
];

export function getAvatarPalette(name = '') {
  const key = String(name);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/**
 * The single status a roster row is allowed to advertise. Ordered by what the
 * mentor needs to act on first, so "needs attention" is never masked by the
 * softer "active today". Colour is always paired with the label text.
 */
export function getRosterStatus(entry) {
  const analytics = entry?.analytics || {};
  const attempts = analytics.totalAttempts || 0;
  const hasSignal = Boolean(entry?.lastActivityAt) || attempts > 0;

  if (!hasSignal) return { id: 'nodata', label: 'No data', tone: 'neutral' };
  if ((Number(analytics.averageAccuracy) || 0) < 60) {
    return { id: 'attention', label: 'Needs attention', tone: 'danger' };
  }
  if (entry?.activeRecently) return { id: 'active', label: 'Active today', tone: 'info' };
  return { id: 'ontrack', label: 'On track', tone: 'success' };
}

/** "12 Aug" — the compact form used in card fallbacks. */
export function formatDayMonth(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Metadata line shared by roster cards, table rows and the dossier header. */
export function buildStudentMeta(student = {}) {
  return [
    student.collegeName,
    student.hscBatch ? `HSC ${student.hscBatch}` : '',
    student.stream
  ].filter(Boolean).join(' · ');
}
