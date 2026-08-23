import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiBell,
  HiHeart,
  HiChatAlt2,
  HiUserAdd,
  HiAtSymbol,
  HiExclamationCircle,
  HiVideoCamera,
  HiSpeakerphone,
  HiClipboardList,
  HiClipboardCheck
} from 'react-icons/hi';
import { useForum } from '../../context/ForumContext';

const ICONS = {
  like: HiHeart,
  love: HiHeart,
  comment: HiChatAlt2,
  reply: HiChatAlt2,
  mention: HiAtSymbol,
  follow: HiUserAdd,
  warning: HiExclamationCircle,
  admin_update: HiBell,
  live_class: HiVideoCamera,
  mentor_announcement: HiSpeakerphone,
  mentor_task: HiClipboardList,
  mentor_feedback: HiClipboardCheck,
  mentor_submission: HiClipboardList
};

function timeAgo(date) {
  if (!date) return '';
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    hasMoreNotifications,
    notificationLoadingMore,
    markNotificationRead,
    markAllNotificationsRead,
    refreshNotifications,
    loadMoreNotifications
  } = useForum();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (open) refreshNotifications();
  }, [open, refreshNotifications]);

  function openItem(n) {
    if (!n.read) markNotificationRead(n._id);
    setOpen(false);
    if (n.type === 'live_class') {
      navigate('/student/live-class');
    } else if (n.type === 'mentor_announcement' || n.type === 'mentor_task' || n.type === 'mentor_feedback') {
      navigate('/my-class');
    } else if (n.type === 'mentor_submission') {
      navigate('/dashboard');
    } else if (n.post) {
      navigate(`/forum/post/${n.post._id || n.post}`);
    } else if (n.actor) {
      navigate(`/forum/u/${n.actor._id || n.actor}`);
    }
  }

  return (
    <div className="forum-bell" ref={ref}>
      <button
        type="button"
        className="forum-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="forum-notifications-panel"
        title="Notifications"
      >
        <HiBell size={20} aria-hidden="true" />
        {unreadCount > 0 && <span className="forum-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div id="forum-notifications-panel" className="forum-bell__panel" role="dialog" aria-label="Notifications">
          <div className="forum-bell__header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button type="button" className="forum-bell__markall" onClick={markAllNotificationsRead}>
                Mark All Read
              </button>
            )}
          </div>
          <div className="forum-bell__list">
            {notifications.length === 0 && (
              <div className="forum-bell__empty">No notifications yet. Start by joining a discussion!</div>
            )}
            {notifications.map((n) => {
              const Icon = ICONS[n.type] || HiBell;
              return (
                <button
                  type="button"
                  key={n._id}
                  className={`forum-bell__item ${!n.read ? 'forum-bell__item--unread' : ''}`}
                  onClick={() => openItem(n)}
                >
                  <div className="forum-bell__icon">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div className="forum-bell__main">
                    <div className="forum-bell__msg">{n.message}</div>
                    {n.preview && <div className="forum-bell__preview">{n.preview}</div>}
                    <div className="forum-bell__time">{timeAgo(n.createdAt)}</div>
                  </div>
                </button>
              );
            })}
            {hasMoreNotifications && (
              <button
                type="button"
                className="forum-bell__markall"
                onClick={loadMoreNotifications}
                disabled={notificationLoadingMore}
              >
                {notificationLoadingMore ? 'Loading…' : 'Load older notifications'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
