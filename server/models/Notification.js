const mongoose = require('mongoose');

/**
 * Notification Model
 *
 * Tracks user-to-user interactions (likes, comments, follows, etc.)
 * and system events (admin updates, warnings). Each notification is
 * scoped to a recipient and carries enough denormalised context
 * (actor, post, preview) so the client can render it without extra
 * look-ups. Timestamps are stored in descending order to support
 * efficient "newest-first" pagination.
 */
const notificationSchema = new mongoose.Schema(
  {
    // The user who receives this notification.
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // The user who triggered the action (undefined for system notifications).
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Interaction category — drives the notification UI text and icon.
    type: {
      type: String,
      enum: [
        'like', 'love', 'comment', 'reply', 'mention', 'follow', 'warning', 'admin_update', 'live_class',
        'mentor_announcement', 'mentor_task', 'mentor_feedback', 'mentor_submission',
        'mentor_request'
      ],
      required: true
    },
    // Optional linked entities for contextual deep-links.
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },

    // Free-text message for custom notification copy.
    message: { type: String, default: '' },
    // Short snippet of the related content for inline previews.
    preview: { type: String, default: '' },

    // Read/unread flag for client-side filtering and badge counts.
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Compound index for the primary list query: user + unread filter + newest first.
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// Cursor-based pagination index: efficient for "load older" infinite scroll.
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
