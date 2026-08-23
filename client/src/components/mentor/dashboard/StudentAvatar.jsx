import { useState } from 'react';
import { getAvatarPalette, getInitials } from './mentorDashboardUtils';

/**
 * StudentAvatar — the one avatar frame used across the command center. Photos,
 * letters and broken image URLs all render into the same circle at the same
 * size, and the letter fallback picks a deterministic colour from the name so a
 * student keeps the same tile everywhere.
 */
export default function StudentAvatar({ name, src, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  const palette = getAvatarPalette(name);
  const className = `mc-avatar${size === 'sm' ? ' mc-avatar--sm' : ''}${size === 'lg' ? ' mc-avatar--lg' : ''}`;

  if (src && !failed) {
    return (
      <span className={className}>
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }

  return (
    <span className={className} style={{ background: palette.fill, color: palette.ink }} aria-hidden="true">
      {getInitials(name)}
    </span>
  );
}
