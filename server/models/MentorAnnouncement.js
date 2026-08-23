const mongoose = require('mongoose');

/**
 * MentorAnnouncement
 * ----------------------------------------------------------------------------
 * A broadcast a mentor posts to every student they are connected with. The
 * announcement already fans out as one Notification per student; this record is
 * the durable copy the "My Class" feed reads back, so a student who clears their
 * notifications can still scroll their mentor's history.
 *
 * Visibility is derived, not stored: a student sees an announcement when an
 * accepted MentorConnection links them to its author.
 */
const mentorAnnouncementSchema = new mongoose.Schema(
  {
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    // How many students were connected at send time — shown back to the mentor.
    recipientCount: {
      type: Number,
      default: 0
    },
    // Optional file attachments (PDF or image)
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, default: '' },
        fileType: { type: String, enum: ['image', 'pdf', 'file'], default: 'file' },
        size: { type: Number, default: 0 }
      }
    ]
  },
  { timestamps: true }
);

mentorAnnouncementSchema.index({ mentor: 1, createdAt: -1 });

module.exports = mongoose.model('MentorAnnouncement', mentorAnnouncementSchema);
