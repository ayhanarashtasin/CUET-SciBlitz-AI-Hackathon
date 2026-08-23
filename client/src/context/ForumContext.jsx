import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import forumApi from '../services/forumApi';
import useSocket from '../hooks/useSocket';

/**
 * Central state provider for the entire Community/Forum feature.
 *
 * Owns user profile, categories, notifications, and unread count. Exposes
 * action helpers (createPost, toggleReaction, follow, etc.) and live-update
 * subscription hooks (subscribeReaction, subscribeComment, subscribePost) so
 * child components can react to Socket.IO events without managing their own
 * socket listeners. Boot data (user, categories, initial notifications) is
 * loaded once on mount; subsequent updates arrive via socket in real time.
 */

const ForumContext = createContext(null);

export function ForumProvider({ children }) {
  // --- Core state ---
  // User: the currently authenticated forum user (null until boot completes).
  // Categories: available post categories, fetched once on mount.
  // Notifications + unreadCount: in-app notification list and badge count.
  // notificationCursor: server cursor for paginated notification loading.
  // bootDone/bootError: gate rendering until initial data is loaded; errors
  // surface a non-blocking banner rather than blocking the entire app.
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationCursor, setNotificationCursor] = useState(null);
  const [notificationLoadingMore, setNotificationLoadingMore] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [bootDone, setBootDone] = useState(false);

  const { socket, connected, on } = useSocket();
  // Tracks which notification IDs are currently unread so we can deduplicate
  // incoming socket events and only increment the count once per notification.
  const unreadNotificationIdsRef = useRef(new Set());

  // --- Boot sequence: load initial data on mount ---
  const refreshUser = useCallback(async () => {
    try {
      const json = await forumApi.me();
      setUser(json.data);
      return json.data;
    } catch (e) {
      setBootError(e);
      return null;
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const json = await forumApi.categories();
      setCategories(json.data || []);
    } catch {
      // Categories failing to load is non-fatal — the rest of the app still works.
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const json = await forumApi.notifications({ limit: 30 });
      const items = json.data || [];
      unreadNotificationIdsRef.current = new Set(
        items
          .filter((notification) => !notification.read)
          .map((notification) => String(notification._id))
      );
      setNotifications(items);
      setNotificationCursor(json.nextCursor || null);
      setUnreadCount(json.unreadCount || 0);
    } catch {
      // Notifications failing to load is non-fatal.
    }
  }, []);

  const loadMoreNotifications = useCallback(async () => {
    if (!notificationCursor || notificationLoadingMore) return;
    setNotificationLoadingMore(true);
    try {
      const json = await forumApi.notifications({ limit: 30, cursor: notificationCursor });
      const items = json.data || [];
      for (const notification of items) {
        if (!notification.read) {
          unreadNotificationIdsRef.current.add(String(notification._id));
        }
      }
      setNotifications((current) => {
        const existing = new Set(current.map((notification) => String(notification._id)));
        return [...current, ...items.filter((notification) => !existing.has(String(notification._id)))];
      });
      setNotificationCursor(json.nextCursor || null);
      setUnreadCount(json.unreadCount || 0);
    } finally {
      setNotificationLoadingMore(false);
    }
  }, [notificationCursor, notificationLoadingMore]);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshUser(), refreshCategories(), refreshNotifications()]);
      setBootDone(true);
    })();
  }, [refreshUser, refreshCategories, refreshNotifications]);

  const applyNotificationRead = useCallback((notificationId) => {
    const id = String(notificationId);
    const wasUnread = unreadNotificationIdsRef.current.delete(id);
    setNotifications((current) =>
      current.map((notification) =>
        String(notification._id) === id
          ? { ...notification, read: true }
          : notification
      )
    );
    if (wasUnread) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }
  }, []);

  // --- Real-time socket subscriptions ---
  // Listens for server-pushed notification events to keep the badge count and
  // notification list in sync across all open tabs without polling.
  useEffect(() => {
    if (!socket || !connected) return;

    const off1 = on('notification:new', (notif) => {
      if (notif?.type?.startsWith('mentor_')) return;
      const id = String(notif._id);
      if (!unreadNotificationIdsRef.current.has(id)) {
        unreadNotificationIdsRef.current.add(id);
        setUnreadCount((current) => current + 1);
      }
      setNotifications((current) => [
        notif,
        ...current.filter((notification) => String(notification._id) !== id)
      ].slice(0, 50));
    });

    const off2 = on('notification:read', ({ _id }) => {
      applyNotificationRead(_id);
    });

    const off3 = on('notification:read-all', () => {
      unreadNotificationIdsRef.current.clear();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    });

    return () => {
      off1 && off1();
      off2 && off2();
      off3 && off3();
    };
  }, [applyNotificationRead, socket, connected, on]);

  // --- Action helpers ---
  // Thin wrappers around forumApi that return the unwrapped `data` field.
  // Components call these instead of forumApi directly so the context
  // controls all state mutations and can trigger re-renders.
  const toggleReaction = useCallback(async ({ targetType, target, type }) => {
    const json = await forumApi.toggleReaction({ targetType, target, type });
    return json.data;
  }, []);

  // Subscribe to live reaction updates for a specific post or comment.
  // Returns an unsubscribe function.
  const subscribeReaction = useCallback(
    (targetType, target, callback) => {
      if (!socket) return () => {};
      const handler = (payload) => {
        if (
          payload.targetType === targetType &&
          String(payload.target) === String(target)
        ) {
          callback(payload);
        }
      };
      socket.on('reaction:update', handler);
      return () => {
        socket.off('reaction:update', handler);
      };
    },
    [socket]
  );

  const subscribeComment = useCallback(
    (postId, callbacks = {}) => {
      if (!socket) return () => {};
      const onNew = (c) => callbacks.onNew && callbacks.onNew(c);
      const onUpdate = (c) => callbacks.onUpdate && callbacks.onUpdate(c);
      const onDelete = (payload) => callbacks.onDelete && callbacks.onDelete(payload);

      socket.on('comment:new', onNew);
      socket.on('comment:update', onUpdate);
      socket.on('comment:delete', onDelete);
      socket.emit('join:post', postId);

      return () => {
        socket.off('comment:new', onNew);
        socket.off('comment:update', onUpdate);
        socket.off('comment:delete', onDelete);
        socket.emit('leave:post', postId);
      };
    },
    [socket]
  );

  const subscribePost = useCallback((callbacks = {}) => {
    if (!socket) return () => {};
    const onNew = (post) => callbacks.onNew?.(post);
    const onUpdate = (post) => callbacks.onUpdate?.(post);
    const onDelete = (payload) => callbacks.onDelete?.(payload);
    const onStats = (payload) => callbacks.onStats?.(payload);
    socket.on('post:new', onNew);
    socket.on('post:update', onUpdate);
    socket.on('post:delete', onDelete);
    socket.on('post:stats', onStats);
    return () => {
      socket.off('post:new', onNew);
      socket.off('post:update', onUpdate);
      socket.off('post:delete', onDelete);
      socket.off('post:stats', onStats);
    };
  }, [socket]);

  const createPost = useCallback(async (payload) => {
    const json = await forumApi.createPost(payload);
    return json.data;
  }, []);

  const updatePost = useCallback(async (id, patch) => {
    const json = await forumApi.updatePost(id, patch);
    return json.data;
  }, []);

  const deletePost = useCallback(async (id) => {
    await forumApi.deletePost(id);
  }, []);

  const toggleBookmark = useCallback(async (id) => {
    const json = await forumApi.toggleBookmark(id);
    return json.data;
  }, []);

  const createComment = useCallback(async (postId, payload) => {
    const json = await forumApi.createComment(postId, payload);
    return json.data;
  }, []);

  const updateComment = useCallback(async (id, payload) => {
    const json = await forumApi.updateComment(id, payload);
    return json.data;
  }, []);

  const deleteComment = useCallback(async (id) => {
    await forumApi.deleteComment(id);
  }, []);

  const markNotificationRead = useCallback(async (id) => {
    try {
      const response = await forumApi.markNotificationRead(id);
      if (response.data?.changed) applyNotificationRead(id);
    } catch {
      // Best-effort — we still mark the notification read locally even if the API call fails.
    }
  }, [applyNotificationRead]);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await forumApi.markAllNotificationsRead();
      unreadNotificationIdsRef.current.clear();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Best-effort — local optimistic state is the source of truth on failure.
    }
  }, []);

  const follow = useCallback(async (id) => {
    const json = await forumApi.follow(id);
    return json.data;
  }, []);

  const unfollow = useCallback(async (id) => {
    const json = await forumApi.unfollow(id);
    return json.data;
  }, []);

  const value = useMemo(
    () => ({
      // state
      user,
      categories,
      notifications,
      unreadCount,
      hasMoreNotifications: Boolean(notificationCursor),
      notificationLoadingMore,
      socketConnected: connected,
      bootDone,
      bootError,

      // refreshers
      refreshUser,
      refreshNotifications,
      loadMoreNotifications,

      // posts / comments / reactions
      createPost,
      updatePost,
      deletePost,
      toggleBookmark,
      createComment,
      updateComment,
      deleteComment,
      toggleReaction,
      subscribeReaction,
      subscribeComment,
      subscribePost,

      // notifications
      markNotificationRead,
      markAllNotificationsRead,

      // follow
      follow,
      unfollow
    }),
    [
      user,
      categories,
      notifications,
      unreadCount,
      notificationCursor,
      notificationLoadingMore,
      connected,
      bootDone,
      bootError,
      refreshUser,
      refreshNotifications,
      loadMoreNotifications,
      createPost,
      updatePost,
      deletePost,
      toggleBookmark,
      createComment,
      updateComment,
      deleteComment,
      toggleReaction,
      subscribeReaction,
      subscribeComment,
      subscribePost,
      markNotificationRead,
      markAllNotificationsRead,
      follow,
      unfollow
    ]
  );

  return <ForumContext.Provider value={value}>{children}</ForumContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useForum() {
  const ctx = use(ForumContext);
  if (!ctx) throw new Error('useForum must be used inside <ForumProvider>');
  return ctx;
}
