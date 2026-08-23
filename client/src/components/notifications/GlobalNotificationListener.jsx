import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useSocket from '../../hooks/useSocket';

/**
 * GlobalNotificationListener
 * ----------------------------------------------------------------------------
 * One place that turns classroom socket traffic into a chime + a tappable toast,
 * mounted app-wide so a student or mentor is told wherever they happen to be.
 *
 * Events are role-filtered. The server emits `class:assignment:update` to BOTH
 * sides of a review so each can refresh its own view, which previously meant a
 * mentor clicking "Mark complete" congratulated *themselves* and offered a link
 * to /my-class — a student-only route that answers 403 for them.
 */

// One AudioContext for the whole session. Constructing one per chime leaked
// them until the browser's cap (~6 in Chrome) was hit, after which every later
// chime threw into a silent catch and notifications went quiet for good.
let audioContext = null;

function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new Ctor();
  }
  return audioContext;
}

function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Autoplay policy parks the context until a user gesture; resuming is a
    // no-op when it is already running.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Already torn down — nothing to do.
      }
    };
  } catch {
    // Audio is a nicety; never let it break the notification itself.
  }
}

function markClassUnread(type, data) {
  try {
    localStorage.setItem('topkorbo_class_unread', 'true');
    window.dispatchEvent(new CustomEvent('topkorbo:class:unread', { detail: { type, data } }));
  } catch {
    // Blocked storage still gets the live toast; only the badge is skipped.
  }
}

/**
 * Shared toast body. Sized in `min()` so it never overflows a narrow phone,
 * and given a comfortable tap target rather than a mouse-sized one.
 */
function ClassToast({ t, icon, title, titleColor, body, cta, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: '#211C18',
        color: '#FAF4EE',
        padding: '14px 16px',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        border: '1px solid rgba(192, 133, 82, 0.4)',
        cursor: 'pointer',
        width: 'min(420px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        minHeight: '44px',
        fontFamily: 'system-ui, sans-serif',
        opacity: t?.visible === false ? 0 : 1,
        transition: 'opacity 150ms ease'
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }} aria-hidden="true">{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: titleColor, marginBottom: '2px' }}>
          {title}
        </div>
        <div
          style={{
            fontSize: '13px',
            color: '#D5C7B8',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere'
          }}
        >
          {body}
        </div>
        <div style={{ fontSize: '11px', color: '#C08552', marginTop: '4px', fontWeight: 600 }}>
          {cta}
        </div>
      </div>
    </div>
  );
}

export default function GlobalNotificationListener() {
  const { on, socket } = useSocket();
  const navigate = useNavigate();

  const role = useMemo(() => {
    try {
      return localStorage.getItem('topkorbo_role') || 'student';
    } catch {
      return 'student';
    }
  }, []);
  const isMentor = role === 'tutor' || role === 'teacher';

  const show = useCallback((id, config, destination) => {
    playNotificationChime();
    toast.custom(
      (t) => <ClassToast t={t} {...config} onOpen={() => { toast.dismiss(t.id); navigate(destination); }} />,
      { duration: 7000, id }
    );
  }, [navigate]);

  useEffect(() => {
    if (!socket) return undefined;
    const unsubscribers = [];

    if (!isMentor) {
      // 1. Live mentor announcement
      unsubscribers.push(on('class:announcement:new', (announcement) => {
        markClassUnread('announcement', announcement);
        show(`announcement-${announcement._id}`, {
          icon: '📢',
          title: `${announcement.mentor?.name || 'Your Mentor'} posted an announcement`,
          titleColor: '#F3E5D8',
          body: announcement.message,
          cta: 'Tap to open My Class →'
        }, '/my-class');
      }));

      // 2. Newly assigned task
      unsubscribers.push(on('class:assignment:new', (assignment) => {
        markClassUnread('assignment', assignment);
        show(`task-${assignment._id}`, {
          icon: '📝',
          title: 'New task assigned by your mentor',
          titleColor: '#F3E5D8',
          body: assignment.target || assignment.body,
          cta: 'Tap to view in My Class →'
        }, '/my-class');
      }));

      // 3. Review outcome. Guarded by role: the mentor receives this same event
      //    so their own dossier can refresh, and must not be congratulated by it.
      unsubscribers.push(on('class:assignment:update', (assignment) => {
        if (assignment.status === 'returned') {
          show(`task-return-${assignment._id}`, {
            icon: '⚠️',
            title: 'Revision requested by your mentor',
            titleColor: '#E8A598',
            body: assignment.target || assignment.body,
            cta: 'Tap to revise your work →'
          }, '/my-class');
        } else if (assignment.status === 'done') {
          show(`task-done-${assignment._id}`, {
            icon: '🎉',
            title: 'Assignment marked complete!',
            titleColor: '#97D5B0',
            body: assignment.target || assignment.body,
            cta: 'Tap to view in My Class →'
          }, '/my-class');
        }
      }));
    } else {
      // 4. A student handed work in
      unsubscribers.push(on('class:assignment:submitted', (assignment) => {
        show(`submission-${assignment._id}`, {
          icon: '📬',
          title: `${assignment.student?.name || 'A student'} turned in work`,
          titleColor: '#F3E5D8',
          body: assignment.target || assignment.body,
          cta: 'Tap to review on your dashboard →'
        }, '/dashboard');
      }));

      // 5. A student asked to join the mentor's roster
      unsubscribers.push(on('mentor:request:new', (request) => {
        show(`request-${request._id}`, {
          icon: '🤝',
          title: `${request.student?.name || 'A student'} wants you as their mentor`,
          titleColor: '#F3E5D8',
          body: request.student?.collegeName || 'Review their profile and respond.',
          cta: 'Tap to review the request →'
        }, '/dashboard');
      }));
    }

    return () => {
      unsubscribers.forEach((off) => off && off());
    };
  }, [on, socket, isMentor, show]);

  return null;
}
