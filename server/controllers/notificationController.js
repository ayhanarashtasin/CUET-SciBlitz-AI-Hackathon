const Notification = require('../models/Notification');
const { getIO } = require('../socket');
const {
  clampLimit,
  descendingCursorFilter,
  finalizePage
} = require('../utils/forumPagination');

/**
 * Notification Controller
 *
 * Exposes three endpoints that together provide a full notification
 * management lifecycle: paginated listing, single-mark-read, and
 * bulk-mark-read.  Every mutation is followed by a Socket.IO push
 * so connected clients update their UI in real time without polling.
 */
const notificationController = {
  /**
   * GET /api/notifications?limit=&before=&cursor=
   *
   * Returns a cursor-paginated page of notifications for the current
   * user, sorted newest-first.  The response includes an `unreadCount`
   * so the client can render a badge immediately without a second call.
   */
  async list(req, res, next) {
    try {
      const limit = clampLimit(req.query.limit, 30, 100);
      const filter = {
        recipient: req.user.id,
        type: { $nin: ['mentor_task', 'mentor_submission', 'mentor_feedback', 'mentor_announcement'] }
      };
      const cursorFields = ['createdAt'];

      // Support both cursor-based and legacy `before` timestamp pagination.
      const cursorFilter = descendingCursorFilter(req.query.cursor, cursorFields);
      if (cursorFilter) {
        Object.assign(filter, cursorFilter);
      } else if (req.query.before) {
        const before = new Date(req.query.before);
        if (!Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
      }

      // Fetch one extra item to detect whether a next page exists.
      const [items, unreadCount] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit + 1)
          .populate('actor', 'name username avatar role')
          .populate('post', 'title contentText')
          .lean(),
        Notification.countDocuments({
          recipient: req.user.id,
          read: false,
          type: { $nin: ['mentor_task', 'mentor_submission', 'mentor_feedback', 'mentor_announcement'] }
        })
      ]);

      const page = finalizePage(items, limit, cursorFields);
      return res.json({
        success: true,
        data: page.items,
        nextCursor: page.nextCursor,
        unreadCount
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/:id/read
   *
   * Marks a single notification as read.  The query filters on
   * recipient + read:false so only the owner can flip the flag, and
   * the operation is idempotent — if it was already read the response
   * still succeeds with `changed: false`.
   */
  async markRead(req, res, next) {
    try {
      const notif = await Notification.findOneAndUpdate({
        _id: req.params.id,
        recipient: req.user.id,
        read: false
      }, {
        $set: { read: true }
      }, {
        new: true
      });

      if (notif) {
        // Broadcast to all of the user's connected tabs/devices.
        const io = getIO();
        io.to(`user:${String(req.user.id)}`).emit('notification:read', {
          _id: notif._id
        });
        return res.json({
          success: true,
          data: { _id: notif._id, read: true, changed: true }
        });
      }

      // Notification was already read or doesn't belong to this user.
      const existing = await Notification.exists({
        _id: req.params.id,
        recipient: req.user.id
      });
      if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

      return res.json({
        success: true,
        data: { _id: req.params.id, read: true, changed: false }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/read-all
   *
   * Bulk-marks every unread notification for the current user as read.
   * Only emits the socket event when at least one document was actually
   * modified to avoid unnecessary network traffic.
   */
  async markAllRead(req, res, next) {
    try {
      const result = await Notification.updateMany(
        { recipient: req.user.id, read: false },
        { $set: { read: true } }
      );
      if (result.modifiedCount > 0) {
        const io = getIO();
        io.to(`user:${String(req.user.id)}`).emit('notification:read-all');
      }
      return res.json({
        success: true,
        data: { ok: true, changedCount: result.modifiedCount }
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = notificationController;
