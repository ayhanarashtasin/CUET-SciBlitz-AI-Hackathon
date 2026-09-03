/**
 * Post Model
 *
 * Defines the schema for forum posts (text posts and questions).
 * Posts support rich HTML content, images, tags, categories, reactions,
 * and moderation controls. Indexes are optimized for feed queries,
 * trending/sorting, and full-text search.
 */

const mongoose = require('mongoose');

/**
 * Embedded sub-document for images attached to a post.
 * Stores Cloudinary URLs and metadata for responsive rendering.
 */
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },   // Cloudinary public ID for deletion/transformations
    width: { type: Number },                    // Original width for responsive layout
    height: { type: Number }                    // Original height for responsive layout
  },
  { _id: false }  // Sub-documents don't need their own _id; parent reference is sufficient
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'question'], default: 'text' },
    category: {
      type: String,
      enum: [
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biology',
        'General',
        'Exam',
        'Assignment',
        'Other'
      ],
      default: 'General'
    },
    title: { type: String, trim: true, maxlength: 200 },
    contentHtml: { type: String, required: true },      // Rich HTML content from editor
    contentText: { type: String, default: '' },          // Plain-text version for search indexing
    images: { type: [imageSchema], default: [] },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],  // Users notified via @mention
    tags: { type: [String], default: [] },
    groupVisibility: [
      {
        type: String,
        enum: ['Science', 'Business Studies', 'Humanities']  // Restrict visibility to specific faculty groups
      }
    ],
    reactionsCount: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 }
    },
    commentsCount: { type: Number, default: 0 },     // Denormalized count for fast feed sorting
    bookmarksCount: { type: Number, default: 0 },    // Denormalized count for popularity ranking
    score: { type: Number, default: 0 },             // Trending score (combines recency + engagement)
    isEdited: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },     // Moderation: soft-delete without removing data
    hiddenReason: { type: String, default: '' },     // Audit trail for moderation actions
    editedAt: { type: Date }
  },
  { timestamps: true }
);
// --- Indexes ---
// All feed queries filter out hidden posts first (isHidden: 1),
// then sort by a secondary dimension (date, score, comments).

// General chronological feed: all non-hidden posts by date
postSchema.index({ isHidden: 1, createdAt: -1, _id: -1 });

// Category-filtered chronological feed
postSchema.index({ isHidden: 1, category: 1, createdAt: -1, _id: -1 });

// Global trending/popular feed: score descending, then date
postSchema.index({ isHidden: 1, score: -1, createdAt: -1, _id: -1 });

// Category-filtered trending feed
postSchema.index({ isHidden: 1, category: 1, score: -1, createdAt: -1, _id: -1 });

// Most-discussed feed: comments descending, then date
postSchema.index({ isHidden: 1, commentsCount: -1, createdAt: -1, _id: -1 });

// Category-filtered most-discussed feed
postSchema.index({ isHidden: 1, category: 1, commentsCount: -1, createdAt: -1, _id: -1 });

// User profile page: all non-hidden posts by a specific author
postSchema.index({ author: 1, isHidden: 1, createdAt: -1, _id: -1 });

// Full-text search with weighted ranking: title matches rank highest, then tags, then body
postSchema.index(
  { title: 'text', contentText: 'text', tags: 'text' },
  { weights: { title: 5, tags: 3, contentText: 1 }, name: 'PostTextIndex' }
);

// Virtual field computed on-the-fly; not stored in DB
postSchema.virtual('totalReactions').get(function () {
  return (this.reactionsCount?.like || 0) + (this.reactionsCount?.love || 0);
});

// Include virtuals when serializing to JSON or plain objects (API responses)
postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Post', postSchema);
