const mongoose = require('mongoose');

/**
 * MentorNote
 * ----------------------------------------------------------------------------
 * Private guidance a mentor records for one of their connected students. A note
 * can be a plain observation ("focus on definite integrals") or a homework
 * assignment tied to a specific chapter/target with an open/done status the
 * mentor can toggle once the student completes it.
 *
 * Only the authoring mentor (and, read-only, the student the note is about) may
 * see these — authorization is enforced in the controller via MentorConnection.
 */
const mentorNoteSchema = new mongoose.Schema(
  {
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // 'note' = free-form observation, 'homework' = actionable assignment
    kind: {
      type: String,
      enum: ['note', 'homework'],
      default: 'note'
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    // Optional chapter/topic target for homework assignments.
    target: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200
    },
    /**
     * Homework lifecycle:
     *   open      → assigned, the student has not handed anything in
     *   submitted → the student handed work in, waiting on the mentor
     *   returned  → the mentor sent it back for another attempt
     *   done      → the mentor accepted it
     * Plain observations only ever sit at 'open'.
     */
    status: {
      type: String,
      enum: ['open', 'submitted', 'returned', 'done'],
      default: 'open'
    },
    // Homework only: optional deadline surfaced to the student in My Class.
    dueAt: {
      type: Date,
      default: null
    },
    // Optional mentor attachments (e.g. assignment question sheet PDF or image)
    attachments: [
      {
        url: { type: String, required: true },
        name: { type: String, default: '' },
        fileType: { type: String, enum: ['image', 'pdf', 'file'], default: 'file' },
        size: { type: Number, default: 0 }
      }
    ],
    // The student's hand-in with text and optional attachments (PDF or images).
    submission: {
      body: { type: String, default: '', trim: true, maxlength: 4000 },
      submittedAt: { type: Date, default: null },
      attachments: [
        {
          url: { type: String, required: true },
          name: { type: String, default: '' },
          fileType: { type: String, enum: ['image', 'pdf', 'file'], default: 'file' },
          size: { type: Number, default: 0 }
        }
      ]
    },
    // The mentor's response to a submission.
    feedback: {
      body: { type: String, default: '', trim: true, maxlength: 2000 },
      reviewedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

// The mentor's review queue: their homework, newest submissions first.
mentorNoteSchema.index({ mentor: 1, kind: 1, status: 1, 'submission.submittedAt': -1 });
// The student's My Class feed.
mentorNoteSchema.index({ student: 1, kind: 1, createdAt: -1 });

mentorNoteSchema.index({ mentor: 1, student: 1, createdAt: -1 });

module.exports = mongoose.model('MentorNote', mentorNoteSchema);
