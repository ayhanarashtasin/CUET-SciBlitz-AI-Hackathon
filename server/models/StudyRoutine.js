const mongoose = require('mongoose');

/**
 * segmentSchema
 * Represents a single study slot/task within a routine day.
 */
const segmentSchema = new mongoose.Schema({
  // Human-readable time range string, e.g. "07:00 AM - 08:30 AM"
  time: String,
  // Subject name, e.g. "Physics", "Chemistry", "Higher Math"
  subject: String,
  // Curriculum paper, e.g. "1st Paper" or "2nd Paper"
  paper: String,
  // Chapter or topic title, e.g. "Vector", "Organic Chemistry"
  chapter: String,
  // Concrete actionable study task description
  task: String,
  // Whether the student has checked off this study session
  completed: { type: Boolean, default: false },
  // Exact timestamp when the student marked the segment completed
  completedAt: Date,
  // Scheduled start ISO datetime
  startAt: Date,
  // Scheduled end ISO datetime
  endAt: Date,
  // Priority level: 'high' (for weak subjects/critical chapters), 'medium', or 'low'
  priority: String,
  // Expected study duration in minutes (used for calculating total planned hours)
  estimatedMinutes: Number,
  // Flag indicating if a push/toast reminder was already dispatched
  notified: { type: Boolean, default: false }
});

/**
 * routineDaySchema
 * Represents one calendar day within the multi-day routine array.
 */
const routineDaySchema = new mongoose.Schema({
  // Sequential day index, e.g. Day 1, Day 2, Day 3 ... Day 14
  day: Number,
  // The calendar date corresponding to this routine day
  dayDate: Date,
  // Flag for designated rest/free days (empty segments array when true)
  isRest: { type: Boolean, default: false },
  // Array of study segments scheduled for this day
  segments: [segmentSchema]
});

/**
 * studyRoutineSchema
 * Main document storing a student's active AI study plan.
 */
const studyRoutineSchema = new mongoose.Schema(
  {
    // Owner of the routine (indexed for O(1) query performance)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // The calendar start date of the routine
    startDate: {
      type: Date,
      required: true
    },
    // Overall study plan horizon in days (e.g. 30, 60, 90)
    durationDays: {
      type: Number,
      default: 30
    },
    // Furthest calendar date up to which days have currently been generated
    generatedUpTo: {
      type: Date
    },
    // Snapshot of the student's 28-field profiling form preferences
    studentProfile: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Exam targets and deadlines (examTarget, examDate, targetGpa)
    examInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // The structured array of routine days containing study segments
    routine: [routineDaySchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudyRoutine', studyRoutineSchema);
