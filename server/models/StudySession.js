const mongoose = require('mongoose');

/**
 * studySessionSchema
 * Represents a live focus timer session (Pomodoro or manual study tracking).
 * Tracks exactly when a student starts studying a segment, how long they stay focused,
 * and records completed minutes toward streak and progress analytics.
 */
const studySessionSchema = new mongoose.Schema({
  // The user who logged this study session
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Optional reference to the parent StudyRoutine
  routineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyRoutine'
  },
  // Optional ID of the specific routine segment being studied
  segmentId: {
    type: String
  },
  // Subject name (e.g., 'Physics', 'Higher Math')
  subject: {
    type: String
  },
  // Chapter or topic (e.g., 'Vector', 'Matrix and Determinant')
  chapter: {
    type: String
  },
  // Timestamp when the student pressed "Start Focus"
  startedAt: {
    type: Date,
    default: Date.now
  },
  // Timestamp when the student pressed "Stop"
  endedAt: {
    type: Date
  },
  // Total calculated study duration in minutes
  durationMinutes: {
    type: Number
  },
  // Session lifecycle status:
  // - 'active': Currently ticking in the user's browser
  // - 'completed': Normal completion when student stops and saves
  // - 'abandoned': Automatically marked if user starts a new session or deletes routine
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('StudySession', studySessionSchema);
