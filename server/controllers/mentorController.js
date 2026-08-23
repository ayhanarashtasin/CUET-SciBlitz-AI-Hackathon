const mongoose = require('mongoose');
const MentorConnection = require('../models/MentorConnection');
const MentorReview = require('../models/MentorReview');
const MockTestAttempt = require('../models/MockTestAttempt');
const PracticeAttempt = require('../models/PracticeAttempt');
const ContestResult = require('../models/ContestResult');
const StudyRoutine = require('../models/StudyRoutine');
const MentorNote = require('../models/MentorNote');
const MentorAnnouncement = require('../models/MentorAnnouncement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const IeltsTeacher = require('../models/IeltsTeacher');
const { getIO } = require('../socket');
const { notify } = require('../services/notificationService');
const { processClassUpload, sanitizeAttachments } = require('../middleware/classUpload');

function getSocketServer() {
  try {
    return getIO();
  } catch (_) {
    return null;
  }
}

const MENTOR_ROLES = ['tutor', 'teacher'];
const FIND_MENTOR_ROLES = ['tutor'];
const MAX_STUDENTS_PER_MENTOR = 30;
const LIST_RECENT_REVIEW_LIMIT = 3;
const PROFILE_REVIEW_LIMIT = 20;

function isMentorRole(role) {
  return MENTOR_ROLES.includes(role);
}

function serializeAnonymousReview(review) {
  return {
    _id: review._id,
    rating: review.rating,
    comment: review.comment || '',
    createdAt: review.createdAt,
    reviewer: 'Anonymous student',
    isAnonymous: true
  };
}

function serializeNote(note) {
  // The student may be populated (review queue) or a bare ObjectId (everywhere
  // else); the mentor roster only ever needs the id to key its badge map.
  const studentRef = note.student && note.student._id ? note.student._id : note.student;

  return {
    _id: note._id,
    studentId: studentRef ? String(studentRef) : '',
    kind: note.kind || 'note',
    body: note.body || '',
    target: note.target || '',
    status: note.status || 'open',
    dueAt: note.dueAt || null,
    attachments: Array.isArray(note.attachments) ? note.attachments : [],
    submission: {
      body: note.submission?.body || '',
      submittedAt: note.submission?.submittedAt || null,
      attachments: Array.isArray(note.submission?.attachments) ? note.submission.attachments : []
    },
    feedback: {
      body: note.feedback?.body || '',
      reviewedAt: note.feedback?.reviewedAt || null
    },
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

/** Minimal person payload for the class feed — never leaks contact details. */
function serializeClassPerson(user) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name || 'Mentor',
    avatar: user.avatar || ''
  };
}

const DEFAULT_UTC_OFFSET_MINUTES = 6 * 60; // Asia/Dhaka — the platform's home timezone.
const BARE_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Parses an optional client-supplied due date, rejecting unparseable input.
 *
 * A bare "YYYY-MM-DD" from an <input type="date"> parses as UTC midnight, which
 * would flip an assignment to "Overdue" at 6am local on the very day it is due.
 * Bare dates are therefore pinned to the END of that day in the caller's
 * timezone, so "due the 25th" means "any time on the 25th".
 */
function parseDueAt(value, offsetMinutes = DEFAULT_UTC_OFFSET_MINUTES) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string' && BARE_DATE_RE.test(value.trim())) {
    const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : DEFAULT_UTC_OFFSET_MINUTES;
    const endOfLocalDay = new Date(value.trim() + 'T23:59:59.999Z').getTime() - offset * 60000;
    return Number.isNaN(endOfLocalDay) ? null : new Date(endOfLocalDay);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Clamps a client-reported UTC offset to a real-world range (UTC-12 … UTC+14). */
function parseTzOffset(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= -720 && minutes <= 840
    ? minutes
    : DEFAULT_UTC_OFFSET_MINUTES;
}

function toSafeMentor(user, connectionStatus, reviewSummary = {}) {
  return {
    _id: user._id,
    name: user.name,
    avatar: user.avatar || '',
    role: user.role,
    universityName: user.universityName || '',
    department: user.department || '',
    currentYearSemester: user.currentYearSemester || '',
    admissionAchievement: user.admissionAchievement || '',
    interestedToGuide: Array.isArray(user.interestedToGuide) ? user.interestedToGuide : [],
    collegeName: user.collegeName || '',
    hscBatch: user.hscBatch || '',
    createdAt: user.createdAt,
    connectionStatus: connectionStatus || 'none',
    averageRating: reviewSummary.averageRating || 0,
    reviewCount: reviewSummary.reviewCount || 0,
    recentReviews: reviewSummary.recentReviews || [],
    currentUserReview: reviewSummary.currentUserReview || null
  };
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getMentorReviewSummaries(mentorIds, studentId = null) {
  if (!mentorIds.length) {
    return new Map();
  }

  const [stats, recentReviewGroups, currentUserReviews] = await Promise.all([
    MentorReview.aggregate([
      { $match: { mentor: { $in: mentorIds } } },
      {
        $group: {
          _id: '$mentor',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 }
        }
      }
    ]),
    MentorReview.aggregate([
      { $match: { mentor: { $in: mentorIds } } },
      { $sort: { mentor: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$mentor',
          reviews: {
            $push: {
              _id: '$_id',
              rating: '$rating',
              comment: '$comment',
              createdAt: '$createdAt'
            }
          }
        }
      },
      { $project: { reviews: { $slice: ['$reviews', LIST_RECENT_REVIEW_LIMIT] } } }
    ]),
    studentId
      ? MentorReview.find({ mentor: { $in: mentorIds }, student: studentId })
        .select('mentor rating comment createdAt updatedAt')
        .lean()
      : []
  ]);

  const summaryMap = new Map();
  mentorIds.forEach((id) => {
    summaryMap.set(String(id), {
      averageRating: 0,
      reviewCount: 0,
      recentReviews: [],
      currentUserReview: null
    });
  });

  stats.forEach((item) => {
    const summary = summaryMap.get(String(item._id));
    if (summary) {
      summary.averageRating = round2(item.averageRating);
      summary.reviewCount = item.reviewCount;
    }
  });

  recentReviewGroups.forEach((item) => {
    const summary = summaryMap.get(String(item._id));
    if (summary) {
      summary.recentReviews = (item.reviews || []).map(serializeAnonymousReview);
    }
  });

  currentUserReviews.forEach((review) => {
    const summary = summaryMap.get(String(review.mentor));
    if (summary) {
      summary.currentUserReview = serializeAnonymousReview(review);
    }
  });

  return summaryMap;
}

function sortMentorList(mentors, sort) {
  const sorted = [...mentors];
  if (sort === 'rating') {
    sorted.sort((a, b) => {
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      return b.reviewCount - a.reviewCount;
    });
    return sorted;
  }

  if (sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return sorted;
}

function buildStudentAttemptSummary(attempts) {
  if (!attempts.length) {
    return {
      totalAttempts: 0,
      averageScore: 0,
      bestScore: 0,
      latestScore: 0,
      averageAccuracy: 0,
      latestAttemptAt: null,
      ranking: null,
      recentAttempts: [],
      subjectPerformance: []
    };
  }

  const subjectMap = new Map();
  let totalScore = 0;
  let totalAccuracy = 0;
  let bestScore = 0;

  attempts.forEach((attempt) => {
    totalScore += attempt.summary?.score || 0;
    bestScore = Math.max(bestScore, attempt.summary?.score || 0);

    const total = attempt.summary?.total || 0;
    const correct = attempt.summary?.correct || 0;
    totalAccuracy += total > 0 ? (correct / total) * 100 : 0;

    (attempt.subjectBreakdown || []).forEach((entry) => {
      const bucket = subjectMap.get(entry.subject) || {
        subject: entry.subject,
        total: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        score: 0
      };
      bucket.total += entry.total || 0;
      bucket.correct += entry.correct || 0;
      bucket.wrong += entry.wrong || 0;
      bucket.skipped += entry.skipped || 0;
      bucket.score += entry.score || 0;
      subjectMap.set(entry.subject, bucket);
    });
  });

  const latest = attempts[0];
  const subjectPerformance = Array.from(subjectMap.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.total ? round2((entry.correct / entry.total) * 100) : 0,
      score: round2(entry.score)
    }))
    .sort((a, b) => b.score - a.score);

  return {
    totalAttempts: attempts.length,
    averageScore: round2(totalScore / attempts.length),
    bestScore: round2(bestScore),
    latestScore: round2(latest.summary?.score || 0),
    averageAccuracy: round2(totalAccuracy / attempts.length),
    latestAttemptAt: latest.createdAt,
    ranking: latest.ranking || null,
    recentAttempts: attempts.slice(0, 5).map((attempt) => ({
      _id: attempt._id,
      score: round2(attempt.summary?.score || 0),
      correct: attempt.summary?.correct || 0,
      wrong: attempt.summary?.wrong || 0,
      skipped: attempt.summary?.skipped || 0,
      total: attempt.summary?.total || 0,
      timeTakenSeconds: attempt.summary?.timeTakenSeconds || 0,
      createdAt: attempt.createdAt,
      ranking: attempt.ranking || null
    })),
    subjectPerformance
  };
}

function buildMentorOverview(students) {
  const subjectMap = new Map();
  let attemptsCount = 0;
  let totalScore = 0;
  let latestRankingSum = 0;
  let rankedStudents = 0;

  students.forEach((student) => {
    totalScore += student.analytics.averageScore || 0;
    attemptsCount += student.analytics.totalAttempts || 0;

    if (student.analytics.ranking?.overallPosition) {
      latestRankingSum += student.analytics.ranking.overallPosition;
      rankedStudents += 1;
    }

    (student.analytics.subjectPerformance || []).forEach((entry) => {
      const bucket = subjectMap.get(entry.subject) || {
        subject: entry.subject,
        total: 0,
        correct: 0,
        score: 0
      };
      bucket.total += entry.total || 0;
      bucket.correct += entry.correct || 0;
      bucket.score += entry.score || 0;
      subjectMap.set(entry.subject, bucket);
    });
  });

  const subjectInsights = Array.from(subjectMap.values())
    .map((entry) => ({
      subject: entry.subject,
      total: entry.total,
      score: round2(entry.score),
      accuracy: entry.total ? round2((entry.correct / entry.total) * 100) : 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    totalStudents: students.length,
    activeStudents: students.filter((student) => student.analytics.totalAttempts > 0).length,
    totalAttempts: attemptsCount,
    averageStudentScore: students.length ? round2(totalScore / students.length) : 0,
    averageRanking: rankedStudents ? round2(latestRankingSum / rankedStudents) : null,
    subjectInsights
  };
}

const ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;
const ACTIVE_TODAY_MS = 24 * 60 * 60 * 1000;
const DOSSIER_PRACTICE_LIMIT = 40;
const DOSSIER_MOCK_LIMIT = 20;
const DOSSIER_CONTEST_LIMIT = 20;
const DOSSIER_NOTE_LIMIT = 50;
const CLASS_FEED_LIMIT = 40;
const CLASS_ASSIGNMENT_LIMIT = 120;
const SUBMISSION_QUEUE_LIMIT = 200;
const EMPTY_CLASS_STATS = { total: 0, todo: 0, submitted: 0, done: 0, overdue: 0 };
const TRAJECTORY_LENGTH = 10;
const WEAK_SPOT_MIN_QUESTIONS = 5;

function toLocalDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Current consecutive-day practice streak. Counts back from today (or
 * yesterday, so a not-yet-practiced today does not break an active streak).
 */
function computeCurrentStreak(dateValues) {
  const dayKeys = new Set();
  dateValues.forEach((value) => {
    const key = toLocalDayKey(value);
    if (key) dayKeys.add(key);
  });
  if (!dayKeys.size) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!dayKeys.has(toLocalDayKey(cursor))) {
    // Allow the streak to still be "alive" if they practised yesterday.
    cursor.setDate(cursor.getDate() - 1);
    if (!dayKeys.has(toLocalDayKey(cursor))) return 0;
  }

  let streak = 0;
  while (dayKeys.has(toLocalDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Per-subject accuracy from a student's PracticeAttempt question snapshots.
 * Only MCQ answers with a definitive correct/incorrect verdict are counted.
 */
function buildSubjectAccuracy(practiceAttempts) {
  const subjectMap = new Map();
  practiceAttempts.forEach((attempt) => {
    (attempt.questions || []).forEach((question) => {
      if (!question.isAttempted || question.isCorrect === null || question.isCorrect === undefined) return;
      const subject = (question.subject || '').trim() || 'General';
      const bucket = subjectMap.get(subject) || { subject, correct: 0, total: 0 };
      bucket.total += 1;
      if (question.isCorrect) bucket.correct += 1;
      subjectMap.set(subject, bucket);
    });
  });

  return Array.from(subjectMap.values())
    .map((entry) => ({
      subject: entry.subject,
      correct: entry.correct,
      total: entry.total,
      accuracy: entry.total ? round2((entry.correct / entry.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Seven-day study-routine adherence derived from the active StudyRoutine.
 * Counts segments scheduled in the last 7 calendar days and how many were
 * marked completed.
 */
function buildRoutineAdherence(routineDoc) {
  const empty = {
    hasRoutine: false,
    adherencePercent: 0,
    completedBlocks: 0,
    totalBlocks: 0,
    daysOnTrack: 0,
    daysTracked: 0
  };
  if (!routineDoc || !Array.isArray(routineDoc.routine)) return empty;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);

  let completedBlocks = 0;
  let totalBlocks = 0;
  let daysOnTrack = 0;
  let daysTracked = 0;

  routineDoc.routine.forEach((day) => {
    if (day.isRest) return;
    const dayDate = day.dayDate ? new Date(day.dayDate) : null;
    if (!dayDate || Number.isNaN(dayDate.getTime())) return;
    dayDate.setHours(0, 0, 0, 0);
    if (dayDate < weekAgo || dayDate > today) return;

    const segments = Array.isArray(day.segments) ? day.segments : [];
    if (!segments.length) return;
    const dayCompleted = segments.filter((segment) => segment.completed).length;

    totalBlocks += segments.length;
    completedBlocks += dayCompleted;
    daysTracked += 1;
    if (dayCompleted === segments.length) daysOnTrack += 1;
  });

  return {
    hasRoutine: true,
    adherencePercent: totalBlocks ? round2((completedBlocks / totalBlocks) * 100) : 0,
    completedBlocks,
    totalBlocks,
    daysOnTrack,
    daysTracked
  };
}

/**
 * Score/accuracy trajectory (oldest → newest) for the last N mock attempts,
 * used to render a sparkline in the roster + dossier.
 */
function buildTrajectory(mockAttempts) {
  return [...mockAttempts]
    .slice(0, TRAJECTORY_LENGTH)
    .reverse()
    .map((attempt) => {
      const total = attempt.summary?.total || 0;
      const correct = attempt.summary?.correct || 0;
      return total ? round2((correct / total) * 100) : 0;
    });
}

/**
 * Aggregate the hardest chapters/subjects across every connected student.
 * Chapters with fewer than WEAK_SPOT_MIN_QUESTIONS answered are ignored so a
 * single unlucky attempt does not dominate the radar.
 */
function buildCohortWeakSpots(practiceAttemptsByStudent) {
  const topicMap = new Map();

  Object.values(practiceAttemptsByStudent).forEach((attempts) => {
    attempts.forEach((attempt) => {
      (attempt.questions || []).forEach((question) => {
        if (!question.isAttempted || question.isCorrect === null || question.isCorrect === undefined) return;
        const subject = (question.subject || '').trim() || 'General';
        const chapter = (question.chapter || '').trim();
        const label = chapter ? `${subject} · ${chapter}` : subject;
        const bucket = topicMap.get(label) || { label, subject, chapter, correct: 0, total: 0 };
        bucket.total += 1;
        if (question.isCorrect) bucket.correct += 1;
        topicMap.set(label, bucket);
      });
    });
  });

  return Array.from(topicMap.values())
    .filter((entry) => entry.total >= WEAK_SPOT_MIN_QUESTIONS)
    .map((entry) => ({
      label: entry.label,
      subject: entry.subject,
      chapter: entry.chapter,
      total: entry.total,
      accuracy: round2((entry.correct / entry.total) * 100)
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
}

/** Compact summary of a student's most recent practice attempt. */
function buildLastActivity(latestPractice, latestMockAt) {
  const practiceAt = latestPractice ? new Date(latestPractice.createdAt).getTime() : 0;
  const mockAt = latestMockAt ? new Date(latestMockAt).getTime() : 0;
  const lastActivityAt = Math.max(practiceAt, mockAt) || null;

  let summary = '';
  if (latestPractice) {
    const focus = latestPractice.title
      || latestPractice.subjects?.[0]
      || latestPractice.chapters?.[0]
      || 'Practice session';
    const correct = latestPractice.marks?.correct ?? 0;
    const totalAnswered = (latestPractice.marks?.correct ?? 0)
      + (latestPractice.marks?.incorrect ?? 0)
      + (latestPractice.marks?.skipped ?? 0);
    summary = totalAnswered ? `${focus} · ${correct}/${totalAnswered} correct` : focus;
  }

  return {
    lastActivityAt: lastActivityAt ? new Date(lastActivityAt) : null,
    summary
  };
}

const mentorController = {
  async listMentors(req, res, next) {
    try {
      const { sort = 'newest', university = '' } = req.query;
      const filter = {
        role: { $in: FIND_MENTOR_ROLES },
        isBanned: { $ne: true }
      };

      const universityFilter = String(university || '').trim();

      const mentors = await User.find(filter)
        .select('name avatar role universityName department currentYearSemester admissionAchievement interestedToGuide collegeName hscBatch createdAt')
        .sort({ createdAt: -1 })
        .lean();

      const allMentorIds = mentors.map((mentor) => mentor._id);
      const ieltsTutors = allMentorIds.length
        ? await IeltsTeacher.find({ userId: { $in: allMentorIds } })
          .select('userId studentIdNumber collegeName hscBatch universityName department currentYearSemester admissionAchievement ieltsScore')
          .lean()
        : [];
      const ieltsMap = new Map(ieltsTutors.map(t => [String(t.userId), t]));

      const mergedMentors = mentors.map((mentor) => {
        const ieltsRecord = ieltsMap.get(String(mentor._id));
        if (ieltsRecord && (!mentor.universityName || (mentor.interestedToGuide.length === 1 && mentor.interestedToGuide[0] === 'IELTS'))) {
          return {
            ...mentor,
            studentIdNumber: ieltsRecord.studentIdNumber,
            collegeName: ieltsRecord.collegeName,
            hscBatch: ieltsRecord.hscBatch,
            universityName: ieltsRecord.universityName,
            department: ieltsRecord.department,
            currentYearSemester: ieltsRecord.currentYearSemester,
            admissionAchievement: ieltsRecord.admissionAchievement,
            interestedToGuide: ['IELTS'],
            ieltsScore: ieltsRecord.ieltsScore
          };
        }
        return mentor;
      });

      let finalMentors = mergedMentors;
      if (universityFilter) {
        const regex = new RegExp(universityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        finalMentors = mergedMentors.filter(m => regex.test(m.universityName || ''));
      }

      const mentorIds = finalMentors.map((mentor) => mentor._id);
      const reviewSummaryMap = await getMentorReviewSummaries(
        mentorIds,
        req.user.role === 'student' ? req.user.id : null
      );

      let connectionMap = new Map();
      if (req.user.role === 'student') {
        const connections = await MentorConnection.find({ student: req.user.id })
          .select('mentor status')
          .lean();
        connectionMap = new Map(connections.map((item) => [String(item.mentor), item.status]));
      }

      return res.json({
        success: true,
        data: sortMentorList(
          finalMentors.map((mentor) => toSafeMentor(
            mentor,
            connectionMap.get(String(mentor._id)),
            reviewSummaryMap.get(String(mentor._id))
          )),
          sort
        )
      });
    } catch (err) {
      next(err);
    }
  },

  async getMentorProfile(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can view mentor profiles.' });
      }

      const { mentorId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(mentorId)) {
        return res.status(400).json({ success: false, message: 'Invalid mentor selected.' });
      }

      const mentor = await User.findOne({
        _id: mentorId,
        role: { $in: FIND_MENTOR_ROLES },
        isBanned: { $ne: true }
      })
        .select('name avatar role universityName department currentYearSemester admissionAchievement interestedToGuide collegeName hscBatch createdAt')
        .lean();

      if (!mentor) {
        return res.status(404).json({ success: false, message: 'Mentor not found.' });
      }

      const ieltsRecord = await IeltsTeacher.findOne({ userId: mentor._id }).lean();
      if (ieltsRecord && (!mentor.universityName || (mentor.interestedToGuide.length === 1 && mentor.interestedToGuide[0] === 'IELTS'))) {
        mentor.studentIdNumber = ieltsRecord.studentIdNumber;
        mentor.collegeName = ieltsRecord.collegeName;
        mentor.hscBatch = ieltsRecord.hscBatch;
        mentor.universityName = ieltsRecord.universityName;
        mentor.department = ieltsRecord.department;
        mentor.currentYearSemester = ieltsRecord.currentYearSemester;
        mentor.admissionAchievement = ieltsRecord.admissionAchievement;
        mentor.interestedToGuide = ['IELTS'];
        mentor.ieltsScore = ieltsRecord.ieltsScore;
      }

      const [connection, reviewSummaryMap, reviews] = await Promise.all([
        MentorConnection.findOne({ student: req.user.id, mentor: mentorId }).select('status').lean(),
        getMentorReviewSummaries([mentor._id], req.user.id),
        MentorReview.find({ mentor: mentorId })
          .sort({ createdAt: -1 })
          .select('rating comment createdAt')
          .limit(PROFILE_REVIEW_LIMIT)
          .lean()
      ]);

      const summary = reviewSummaryMap.get(String(mentor._id)) || {};
      return res.json({
        success: true,
        data: {
          ...toSafeMentor(mentor, connection?.status || 'none', summary),
          reviews: reviews.map(serializeAnonymousReview)
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async submitMentorReview(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can review mentors.' });
      }

      const { mentorId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(mentorId)) {
        return res.status(400).json({ success: false, message: 'Invalid mentor selected.' });
      }

      const rating = Number(req.body?.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
      }

      const comment = String(req.body?.comment || '').trim().slice(0, 500);
      const mentor = await User.findById(mentorId).select('role isBanned');
      if (!mentor || mentor.isBanned || !isMentorRole(mentor.role)) {
        return res.status(404).json({ success: false, message: 'Mentor not found.' });
      }

      const isConnected = await MentorConnection.exists({
        student: req.user.id,
        mentor: mentorId,
        status: 'accepted'
      });

      if (!isConnected) {
        return res.status(403).json({ success: false, message: 'Only accepted students can review this mentor.' });
      }

      const review = await MentorReview.findOneAndUpdate(
        { mentor: mentorId, student: req.user.id },
        {
          $set: {
            rating: Math.round(rating),
            comment,
            isAnonymous: true
          }
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean();

      return res.json({
        success: true,
        message: 'Anonymous review saved.',
        data: serializeAnonymousReview(review)
      });
    } catch (err) {
      next(err);
    }
  },

  async requestMentor(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can send mentor requests.' });
      }

      const { mentorId } = req.body;
      if (!mongoose.Types.ObjectId.isValid(mentorId)) {
        return res.status(400).json({ success: false, message: 'Invalid mentor selected.' });
      }

      if (String(mentorId) === String(req.user.id)) {
        return res.status(400).json({ success: false, message: 'You cannot request yourself.' });
      }

      const mentor = await User.findById(mentorId).select('name role isBanned');
      if (!mentor || mentor.isBanned || !isMentorRole(mentor.role)) {
        return res.status(404).json({ success: false, message: 'Mentor not found.' });
      }

      const acceptedCount = await MentorConnection.countDocuments({
        mentor: mentorId,
        status: 'accepted'
      });
      if (acceptedCount >= MAX_STUDENTS_PER_MENTOR) {
        return res.status(400).json({ success: false, message: 'This mentor already has the maximum number of students.' });
      }

      const existing = await MentorConnection.findOne({
        student: req.user.id,
        mentor: mentorId
      });

      if (existing?.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'You are already connected with this mentor.' });
      }

      if (existing?.status === 'pending') {
        return res.status(400).json({ success: false, message: 'Your request is already pending.' });
      }

      // Upsert atomically. A double-tap (or two tabs) would otherwise race past
      // the "already pending" check above and collide on the unique
      // {student, mentor} index, surfacing an E11000 as an opaque 500.
      let connection;
      try {
        connection = await MentorConnection.findOneAndUpdate(
          { student: req.user.id, mentor: mentorId },
          { $set: { status: 'pending', requestedAt: new Date() }, $unset: { respondedAt: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(409).json({ success: false, message: 'Your request is already pending.' });
        }
        throw err;
      }

      // The mentor is told immediately: a durable bell notification plus a live
      // card for the pending queue, so the metrics strip moves without a reload.
      const student = await User.findById(req.user.id)
        .select('name avatar email collegeName hscBatch stream academicStatus aspirations')
        .lean();
      const io = getSocketServer();

      await Promise.allSettled([notify(io, {
        recipient: mentorId,
        actor: req.user.id,
        type: 'mentor_request',
        message: (student && student.name ? student.name : 'A student') + ' asked you to be their mentor.',
        preview: (student && student.collegeName) || ''
      })]);

      if (io) {
        try {
          io.to('user:' + String(mentorId)).emit('mentor:request:new', {
            _id: connection._id,
            requestedAt: connection.requestedAt,
            student: {
              _id: (student && student._id) || req.user.id,
              name: (student && student.name) || 'A student',
              avatar: (student && student.avatar) || '',
              email: (student && student.email) || '',
              collegeName: (student && student.collegeName) || '',
              hscBatch: (student && student.hscBatch) || '',
              stream: (student && student.stream) || '',
              academicStatus: (student && student.academicStatus) || '',
              aspirations: Array.isArray(student && student.aspirations) ? student.aspirations : []
            }
          });
        } catch (_) {}
      }

      return res.json({
        success: true,
        message: `Request sent to ${mentor.name}.`,
        data: { status: connection.status, mentorId: String(mentorId) }
      });
    } catch (err) {
      next(err);
    }
  },

  async respondToRequest(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can respond to requests.' });
      }

      const { connectionId } = req.params;
      const { action } = req.body;
      if (!['accepted', 'declined'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid action.' });
      }

      if (!mongoose.Types.ObjectId.isValid(connectionId)) {
        return res.status(400).json({ success: false, message: 'Invalid request selected.' });
      }

      // Claim the request atomically: the pending -> decided flip is itself the
      // lock, so two clicks can never both carry the same request into the
      // capacity check below.
      const respondedAt = new Date();
      const connection = await MentorConnection.findOneAndUpdate(
        { _id: connectionId, mentor: req.user.id, status: 'pending' },
        { $set: { status: action, respondedAt } },
        { new: true }
      );

      if (!connection) {
        const stillThere = await MentorConnection.exists({ _id: connectionId, mentor: req.user.id });
        return stillThere
          ? res.status(409).json({ success: false, message: 'This request has already been handled.' })
          : res.status(404).json({ success: false, message: 'Request not found.' });
      }

      if (action === 'accepted') {
        // Count AFTER the write. Counting first is a time-of-check/time-of-use
        // race: two accepts at 29 students both read 29 and both commit. Here a
        // loser can detect that it was the one which crossed the line, and undo.
        const acceptedCount = await MentorConnection.countDocuments({
          mentor: req.user.id,
          status: 'accepted'
        });

        if (acceptedCount > MAX_STUDENTS_PER_MENTOR) {
          const ahead = await MentorConnection.countDocuments({
            mentor: req.user.id,
            status: 'accepted',
            respondedAt: { $lt: respondedAt }
          });

          // Earliest acceptances keep their seat; only the overflow rolls back.
          if (ahead >= MAX_STUDENTS_PER_MENTOR) {
            await MentorConnection.updateOne(
              { _id: connection._id },
              { $set: { status: 'pending' }, $unset: { respondedAt: 1 } }
            );
            return res.status(409).json({
              success: false,
              message: 'You already have ' + MAX_STUDENTS_PER_MENTOR + ' students connected.'
            });
          }
        }
      }

      // The student has been waiting on this answer — tell them either way.
      const respondingMentor = await User.findById(req.user.id).select('name').lean();
      const mentorLabel = (respondingMentor && respondingMentor.name) || 'Your mentor';
      await Promise.allSettled([notify(getSocketServer(), {
        recipient: connection.student,
        actor: req.user.id,
        type: 'mentor_request',
        message: action === 'accepted'
          ? mentorLabel + ' accepted your mentorship request.'
          : mentorLabel + ' declined your mentorship request.'
      })]);

      return res.json({
        success: true,
        message: action === 'accepted' ? 'Request accepted.' : 'Request declined.',
        data: { connectionId: String(connection._id), status: connection.status }
      });
    } catch (err) {
      next(err);
    }
  },

  async studentDashboard(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this view.' });
      }

      const [connections, recentAttempts] = await Promise.all([
        MentorConnection.find({ student: req.user.id })
          .populate('mentor', 'name avatar role universityName department currentYearSemester admissionAchievement interestedToGuide collegeName hscBatch')
          .sort({ requestedAt: -1 })
          .lean(),
        MockTestAttempt.find({ student: req.user.id })
          .sort({ createdAt: -1 })
          .limit(6)
          .lean()
      ]);

      const mentors = connections.map((item) => ({
        _id: item._id,
        status: item.status,
        requestedAt: item.requestedAt,
        respondedAt: item.respondedAt,
        mentor: item.mentor ? toSafeMentor(item.mentor, item.status) : null
      })).filter((item) => item.mentor);

      return res.json({
        success: true,
        data: {
          mentorLimitPerMentor: MAX_STUDENTS_PER_MENTOR,
          mentors,
          recentAttempts: recentAttempts.map((attempt) => ({
            _id: attempt._id,
            score: round2(attempt.summary?.score || 0),
            correct: attempt.summary?.correct || 0,
            wrong: attempt.summary?.wrong || 0,
            skipped: attempt.summary?.skipped || 0,
            total: attempt.summary?.total || 0,
            timeTakenSeconds: attempt.summary?.timeTakenSeconds || 0,
            subjectBreakdown: attempt.subjectBreakdown || [],
            ranking: attempt.ranking || null,
            createdAt: attempt.createdAt
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async mentorDashboard(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can access this view.' });
      }

      const [pendingRequests, acceptedConnections] = await Promise.all([
        MentorConnection.find({ mentor: req.user.id, status: 'pending' })
          .populate('student', 'name avatar email collegeName hscBatch stream academicStatus aspirations')
          .sort({ requestedAt: -1 })
          .lean(),
        MentorConnection.find({ mentor: req.user.id, status: 'accepted' })
          .populate('student', 'name avatar email collegeName hscBatch stream academicStatus aspirations')
          .sort({ respondedAt: -1 })
          .lean()
      ]);

      const studentIds = acceptedConnections
        .map((item) => item.student?._id)
        .filter(Boolean);

      const [attempts, practiceAttempts, pendingNotes] = await Promise.all([
        studentIds.length
          ? MockTestAttempt.find({ student: { $in: studentIds } })
            .select('student summary subjectBreakdown ranking createdAt')
            .sort({ createdAt: -1 })
            .lean()
          : [],
        studentIds.length
          ? PracticeAttempt.find({ userId: { $in: studentIds }, isDeleted: { $ne: true } })
            .select('userId title subjects chapters marks questions.subject questions.chapter questions.isCorrect questions.isAttempted createdAt')
            .sort({ createdAt: -1 })
            .limit(studentIds.length * 30)
            .lean()
          : [],
        studentIds.length
          ? MentorNote.find({
              mentor: req.user.id,
              student: { $in: studentIds },
              kind: 'homework',
              status: 'submitted'
            })
              .select('student')
              .lean()
          : []
      ]);

      const attemptsByStudent = attempts.reduce((acc, attempt) => {
        const key = String(attempt.student);
        if (!acc[key]) acc[key] = [];
        acc[key].push(attempt);
        return acc;
      }, {});

      const practiceByStudent = practiceAttempts.reduce((acc, attempt) => {
        const key = String(attempt.userId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(attempt);
        return acc;
      }, {});

      const pendingSubmissionsByStudent = (pendingNotes || []).reduce((acc, note) => {
        const key = String(note.student);
        (acc[key] || (acc[key] = [])).push(String(note._id));
        return acc;
      }, {});

      const now = Date.now();
      let activeStudents48h = 0;

      const students = acceptedConnections
        .filter((item) => item.student)
        .map((connection) => {
          const studentId = String(connection.student._id);
          const studentMocks = attemptsByStudent[studentId] || [];
          const studentPractice = practiceByStudent[studentId] || [];
          const analytics = buildStudentAttemptSummary(studentMocks);
          const lastActivity = buildLastActivity(studentPractice[0], analytics.latestAttemptAt);
          const sinceLastActivity = lastActivity.lastActivityAt
            ? now - new Date(lastActivity.lastActivityAt).getTime()
            : Infinity;

          if (sinceLastActivity <= ACTIVE_WINDOW_MS) {
            activeStudents48h += 1;
          }

          return {
            connectionId: connection._id,
            student: {
              _id: connection.student._id,
              name: connection.student.name,
              avatar: connection.student.avatar || '',
              email: connection.student.email || '',
              collegeName: connection.student.collegeName || '',
              hscBatch: connection.student.hscBatch || '',
              stream: connection.student.stream || '',
              academicStatus: connection.student.academicStatus || '',
              aspirations: Array.isArray(connection.student.aspirations) ? connection.student.aspirations : []
            },
            connectedAt: connection.respondedAt || connection.updatedAt,
            analytics,
            trajectory: buildTrajectory(studentMocks),
            lastActivityAt: lastActivity.lastActivityAt,
            lastActivitySummary: lastActivity.summary,
            activeRecently: sinceLastActivity <= ACTIVE_TODAY_MS,
            pendingSubmissions: pendingSubmissionsByStudent[studentId] || [],
            pendingSubmissionsCount: (pendingSubmissionsByStudent[studentId] || []).length
          };
        });

      const overview = buildMentorOverview(students);
      overview.activeStudents48h = activeStudents48h;
      overview.activeRate = students.length ? round2((activeStudents48h / students.length) * 100) : 0;

      return res.json({
        success: true,
        data: {
          capacity: MAX_STUDENTS_PER_MENTOR,
          cohortWeakSpots: buildCohortWeakSpots(practiceByStudent),
          pendingRequests: pendingRequests.map((item) => ({
            _id: item._id,
            requestedAt: item.requestedAt,
            student: item.student ? {
              _id: item.student._id,
              name: item.student.name,
              avatar: item.student.avatar || '',
              email: item.student.email || '',
              collegeName: item.student.collegeName || '',
              hscBatch: item.student.hscBatch || '',
              stream: item.student.stream || '',
              academicStatus: item.student.academicStatus || '',
              aspirations: Array.isArray(item.student.aspirations) ? item.student.aspirations : []
            } : null
          })).filter((item) => item.student),
          students,
          overview
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getStudentDossier(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can view student dossiers.' });
      }

      const { studentId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student selected.' });
      }

      const isConnected = await MentorConnection.exists({
        mentor: req.user.id,
        student: studentId,
        status: 'accepted'
      });
      if (!isConnected) {
        return res.status(403).json({ success: false, message: 'You are not connected with this student.' });
      }

      const [student, practiceAttempts, mockAttempts, contestResults, routineDoc, notes] = await Promise.all([
        User.findById(studentId)
          .select('name avatar email collegeName hscBatch stream academicStatus medium district division aspirations bio optionalSubject createdAt')
          .lean(),
        PracticeAttempt.find({ userId: studentId, isDeleted: { $ne: true } })
          .select('mode title subjects papers chapters topics marks questions.subject questions.chapter questions.isCorrect questions.isAttempted timing.timeTakenSeconds createdAt')
          .sort({ createdAt: -1 })
          .limit(DOSSIER_PRACTICE_LIMIT)
          .lean(),
        MockTestAttempt.find({ student: studentId })
          .select('summary subjectBreakdown ranking config createdAt')
          .sort({ createdAt: -1 })
          .limit(DOSSIER_MOCK_LIMIT)
          .lean(),
        ContestResult.find({ student: studentId, isFinished: true })
          .populate('contest', 'name date startTime')
          .sort({ submittedAt: -1 })
          .limit(DOSSIER_CONTEST_LIMIT)
          .lean(),
        StudyRoutine.findOne({ userId: studentId })
          .sort({ createdAt: -1 })
          .select('routine startDate durationDays')
          .lean(),
        MentorNote.find({ mentor: req.user.id, student: studentId })
          .sort({ createdAt: -1 })
          .limit(DOSSIER_NOTE_LIMIT)
          .lean()
      ]);

      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const streak = computeCurrentStreak(practiceAttempts.map((attempt) => attempt.createdAt));

      return res.json({
        success: true,
        data: {
          profile: {
            _id: student._id,
            name: student.name,
            avatar: student.avatar || '',
            email: student.email || '',
            collegeName: student.collegeName || '',
            hscBatch: student.hscBatch || '',
            stream: student.stream || '',
            academicStatus: student.academicStatus || '',
            medium: student.medium || '',
            district: student.district || '',
            aspirations: Array.isArray(student.aspirations) ? student.aspirations : [],
            optionalSubject: student.optionalSubject || '',
            bio: student.bio || '',
            joinedAt: student.createdAt,
            streak
          },
          overview: {
            ...buildStudentAttemptSummary(mockAttempts),
            subjectAccuracy: buildSubjectAccuracy(practiceAttempts),
            routineAdherence: buildRoutineAdherence(routineDoc),
            trajectory: buildTrajectory(mockAttempts),
            streak
          },
          practiceHistory: practiceAttempts.map((attempt) => ({
            _id: attempt._id,
            mode: attempt.mode,
            title: attempt.title || '',
            subjects: attempt.subjects || [],
            chapters: attempt.chapters || [],
            obtained: round2(attempt.marks?.obtained || 0),
            total: round2(attempt.marks?.total || 0),
            percentage: round2(attempt.marks?.percentage || 0),
            correct: attempt.marks?.correct || 0,
            incorrect: attempt.marks?.incorrect || 0,
            skipped: attempt.marks?.skipped || 0,
            timeTakenSeconds: attempt.timing?.timeTakenSeconds || 0,
            createdAt: attempt.createdAt
          })),
          mockTests: mockAttempts.map((attempt) => ({
            _id: attempt._id,
            score: round2(attempt.summary?.score || 0),
            correct: attempt.summary?.correct || 0,
            wrong: attempt.summary?.wrong || 0,
            skipped: attempt.summary?.skipped || 0,
            total: attempt.summary?.total || 0,
            timeTakenSeconds: attempt.summary?.timeTakenSeconds || 0,
            ranking: attempt.ranking || null,
            subjectBreakdown: attempt.subjectBreakdown || [],
            createdAt: attempt.createdAt
          })),
          contests: contestResults.map((result) => ({
            _id: result._id,
            contestName: result.contest?.name || 'Contest',
            contestDate: result.contest?.date || null,
            score: result.score,
            totalQuestions: result.totalQuestions,
            finalRank: result.finalRank,
            pointsEarned: result.pointsEarned,
            timeTakenSeconds: result.timeTakenSeconds,
            submittedAt: result.submittedAt
          })),
          notes: notes.map(serializeNote)
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getStudentNotes(req, res, next) {
    try {
      const { studentId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student selected.' });
      }

      // A mentor can read the notes they authored; the student can read notes
      // written about them (read-only).
      const isMentor = isMentorRole(req.user.role);
      const query = isMentor
        ? { mentor: req.user.id, student: studentId }
        : { student: req.user.id };

      if (isMentor) {
        const isConnected = await MentorConnection.exists({
          mentor: req.user.id,
          student: studentId,
          status: 'accepted'
        });
        if (!isConnected) {
          return res.status(403).json({ success: false, message: 'You are not connected with this student.' });
        }
      } else if (String(studentId) !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'You can only view your own notes.' });
      }

      const notes = await MentorNote.find(query)
        .sort({ createdAt: -1 })
        .limit(DOSSIER_NOTE_LIMIT)
        .lean();

      return res.json({ success: true, data: notes.map(serializeNote) });
    } catch (err) {
      next(err);
    }
  },

  async saveStudentNote(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can write notes.' });
      }

      const { studentId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student selected.' });
      }

      const body = String(req.body?.body || '').trim();
      if (!body) {
        return res.status(400).json({ success: false, message: 'Note text is required.' });
      }

      const isConnected = await MentorConnection.exists({
        mentor: req.user.id,
        student: studentId,
        status: 'accepted'
      });
      if (!isConnected) {
        return res.status(403).json({ success: false, message: 'You are not connected with this student.' });
      }

      const kind = req.body?.kind === 'homework' ? 'homework' : 'note';
      const target = String(req.body?.target || '').trim().slice(0, 200);
      // A deadline only means anything on an assignment.
      const dueAt = kind === 'homework'
        ? parseDueAt(req.body?.dueAt, parseTzOffset(req.body?.tzOffsetMinutes))
        : null;
      const attachments = sanitizeAttachments(req.body?.attachments);

      const note = await MentorNote.create({
        mentor: req.user.id,
        student: studentId,
        kind,
        body: body.slice(0, 2000),
        target,
        dueAt,
        attachments
      });

      const io = getSocketServer();
      const mentor = await User.findById(req.user.id).select('name avatar').lean();
      const mentorName = mentor?.name || 'Your mentor';

      // Assignments are actionable, so the student gets a durable notification
      // (which survives being offline) as well as the live My Class update.
      if (kind === 'homework') {
        await Promise.allSettled([notify(io, {
          recipient: studentId,
          actor: req.user.id,
          type: 'mentor_task',
          message: mentorName + ' assigned you: ' + (target || body.slice(0, 60)),
          preview: body.slice(0, 140)
        })]);
      }

      if (kind === 'homework') {
        const serialized = {
          ...serializeNote(note.toObject()),
          mentor: serializeClassPerson(mentor || { _id: req.user.id, name: 'Mentor', avatar: '' })
        };

        if (io) {
          try {
            io.to(`user:${String(studentId)}`).emit('class:assignment:new', serialized);
          } catch (_) {}
        }
      }

      return res.status(201).json({ success: true, message: 'Note saved.', data: serializeNote(note.toObject()) });
    } catch (err) {
      next(err);
    }
  },

  async updateStudentNote(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can update notes.' });
      }

      const { noteId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid note selected.' });
      }

      const update = {};
      if (req.body?.status && ['open', 'done'].includes(req.body.status)) {
        update.status = req.body.status;
      }
      if (typeof req.body?.body === 'string' && req.body.body.trim()) {
        update.body = req.body.body.trim().slice(0, 2000);
      }
      if (!Object.keys(update).length) {
        return res.status(400).json({ success: false, message: 'Nothing to update.' });
      }

      const note = await MentorNote.findOneAndUpdate(
        { _id: noteId, mentor: req.user.id },
        { $set: update },
        { new: true }
      ).lean();

      if (!note) {
        return res.status(404).json({ success: false, message: 'Note not found.' });
      }

      if (note.kind === 'homework') {
        const io = getSocketServer();
        const mentor = await User.findById(req.user.id).select('name avatar').lean();
        const serialized = {
          ...serializeNote(note),
          mentor: serializeClassPerson(mentor || { _id: req.user.id, name: 'Mentor', avatar: '' })
        };

        if (io) {
          try {
            io.to(`user:${String(note.student)}`).emit('class:assignment:update', serialized);
            io.to(`user:${String(req.user.id)}`).emit('class:assignment:update', serialized);
          } catch (_) {}
        }
      }

      return res.json({ success: true, message: 'Note updated.', data: serializeNote(note) });
    } catch (err) {
      next(err);
    }
  },

  async deleteStudentNote(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can delete notes.' });
      }

      const { noteId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid note selected.' });
      }

      const note = await MentorNote.findOneAndDelete({ _id: noteId, mentor: req.user.id }).lean();
      if (!note) {
        return res.status(404).json({ success: false, message: 'Note not found.' });
      }

      if (note.kind === 'homework') {
        const io = getSocketServer();
        if (io) {
          try {
            io.to(`user:${String(note.student)}`).emit('class:assignment:delete', { noteId: String(note._id) });
          } catch (_) {}
        }
      }

      return res.json({ success: true, message: 'Note removed.', data: { _id: String(noteId) } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /my-class - the student side of the classroom: who mentors them, what
   * has been announced, and every assignment with its lifecycle state. Read
   * access is derived from accepted connections, so nothing leaks once a
   * connection is declined or removed.
   */
  async myClass(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can access this view.' });
      }

      const connections = await MentorConnection.find({ student: req.user.id, status: 'accepted' })
        .populate('mentor', 'name avatar')
        .lean();

      const mentorIds = connections.map((item) => item.mentor?._id).filter(Boolean);
      if (!mentorIds.length) {
        return res.json({
          success: true,
          data: { mentors: [], announcements: [], assignments: [], notes: [], stats: { ...EMPTY_CLASS_STATS } }
        });
      }

      const [announcements, noteDocs] = await Promise.all([
        MentorAnnouncement.find({ mentor: { $in: mentorIds } })
          .populate('mentor', 'name avatar')
          .sort({ createdAt: -1 })
          .limit(CLASS_FEED_LIMIT)
          .lean(),
        MentorNote.find({ student: req.user.id, mentor: { $in: mentorIds } })
          .populate('mentor', 'name avatar')
          .sort({ createdAt: -1 })
          .limit(CLASS_ASSIGNMENT_LIMIT)
          .lean()
      ]);

      const decorate = (note) => ({ ...serializeNote(note), mentor: serializeClassPerson(note.mentor) });
      const assignments = noteDocs.filter((note) => note.kind === 'homework').map(decorate);
      const notes = noteDocs.filter((note) => note.kind !== 'homework').map(decorate);

      const now = Date.now();
      const stats = assignments.reduce((acc, item) => {
        acc.total += 1;
        if (item.status === 'done') {
          acc.done += 1;
        } else if (item.status === 'submitted') {
          acc.submitted += 1;
        } else {
          acc.todo += 1;
          if (item.dueAt && new Date(item.dueAt).getTime() < now) acc.overdue += 1;
        }
        return acc;
      }, { ...EMPTY_CLASS_STATS });

      return res.json({
        success: true,
        data: {
          mentors: connections.map((item) => serializeClassPerson(item.mentor)).filter(Boolean),
          announcements: announcements.map((item) => ({
            _id: item._id,
            message: item.message,
            attachments: Array.isArray(item.attachments) ? item.attachments : [],
            createdAt: item.createdAt,
            mentor: serializeClassPerson(item.mentor)
          })),
          assignments,
          notes,
          stats
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /assignments/:noteId/submit - the student hands work in. */
  async submitAssignment(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can submit assignments.' });
      }

      const { noteId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid assignment selected.' });
      }

      const note = await MentorNote.findOne({ _id: noteId, student: req.user.id, kind: 'homework' });
      if (!note) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }
      if (note.status === 'done') {
        return res.status(409).json({ success: false, message: 'Your mentor already marked this complete.' });
      }

      const attachments = sanitizeAttachments(req.body?.attachments);
      // The body is optional - handing in attachments or empty body is allowed.
      note.submission = {
        body: String(req.body?.body || '').trim().slice(0, 4000),
        submittedAt: new Date(),
        attachments
      };
      note.status = 'submitted';
      // A fresh hand-in supersedes the previous round of feedback.
      note.feedback = { body: '', reviewedAt: null };
      await note.save();

      const io = getSocketServer();
      const student = await User.findById(req.user.id).select('name avatar collegeName').lean();
      const studentName = student?.name || 'A student';
      const label = note.target || note.body.slice(0, 60);

      const serializedForMentor = {
        ...serializeNote(note.toObject()),
        student: {
          ...serializeClassPerson(student),
          collegeName: student?.collegeName || ''
        }
      };

      const serializedForStudent = serializeNote(note.toObject());

      // A mentor who was offline when this landed still finds it in their bell.
      await Promise.allSettled([notify(io, {
        recipient: note.mentor,
        actor: req.user.id,
        type: 'mentor_submission',
        message: studentName + ' turned in: ' + label,
        preview: (note.submission.body || '').slice(0, 140)
      })]);

      if (io) {
        try {
          io.to(`user:${String(note.mentor)}`).emit('class:assignment:submitted', serializedForMentor);
          io.to(`user:${String(note.mentor)}`).emit('class:assignment:update', serializedForMentor);
          io.to(`user:${String(note.student)}`).emit('class:assignment:update', serializedForStudent);
        } catch (_) {}
      }

      return res.json({ success: true, message: 'Submitted for review.', data: serializedForStudent });
    } catch (err) {
      next(err);
    }
  },

  /** POST /assignments/:noteId/unsubmit - take the work back before review. */
  async unsubmitAssignment(req, res, next) {
    try {
      if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can withdraw a submission.' });
      }

      const { noteId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid assignment selected.' });
      }

      const note = await MentorNote.findOne({ _id: noteId, student: req.user.id, kind: 'homework' });
      if (!note) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }
      if (note.status !== 'submitted') {
        return res.status(409).json({ success: false, message: 'This assignment is not awaiting review.' });
      }

      // The written work AND the uploaded files stay as a draft; only the
      // hand-in is undone. Replacing the whole submission object here used to
      // wipe the student's uploaded scans the moment they withdrew to fix a page.
      note.status = 'open';
      note.set('submission.submittedAt', null);
      await note.save();

      const io = getSocketServer();
      const serialized = serializeNote(note.toObject());

      if (io) {
        try {
          io.to(`user:${String(note.mentor)}`).emit('class:assignment:update', serialized);
          io.to(`user:${String(note.student)}`).emit('class:assignment:update', serialized);
        } catch (_) {}
      }

      return res.json({ success: true, message: 'Submission withdrawn.', data: serialized });
    } catch (err) {
      next(err);
    }
  },

  /** POST /assignments/:noteId/review - the mentor accepts or returns work. */
  async reviewAssignment(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can review submissions.' });
      }

      const { noteId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid assignment selected.' });
      }

      const note = await MentorNote.findOne({ _id: noteId, mentor: req.user.id, kind: 'homework' });
      if (!note) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }

      const action = req.body?.action === 'return' ? 'return' : 'approve';
      note.feedback = {
        body: String(req.body?.feedback || '').trim().slice(0, 2000),
        reviewedAt: new Date()
      };
      note.status = action === 'return' ? 'returned' : 'done';
      await note.save();

      const io = getSocketServer();
      const mentor = await User.findById(req.user.id).select('name avatar').lean();
      const mentorName = mentor?.name || 'Your mentor';
      const label = note.target || note.body.slice(0, 60);

      // The note is already committed by this point, so a notification failure
      // must never surface as "could not save review" for a review that saved.
      await Promise.allSettled([notify(io, {
        recipient: note.student,
        actor: req.user.id,
        type: 'mentor_feedback',
        message: action === 'return'
          ? `${mentorName} requested revision for: ${label}`
          : `${mentorName} marked as complete: ${label}`,
        preview: (note.feedback.body || '').slice(0, 140)
      })]);

      const serialized = {
        ...serializeNote(note.toObject()),
        mentor: serializeClassPerson(mentor || { _id: req.user.id, name: 'Mentor', avatar: '' })
      };

      if (io) {
        try {
          io.to(`user:${String(note.student)}`).emit('class:assignment:update', serialized);
          io.to(`user:${String(note.mentor)}`).emit('class:assignment:update', serialized);
        } catch (_) {}
      }

      return res.json({
        success: true,
        message: action === 'return' ? 'Returned to the student.' : 'Marked complete.',
        data: serialized
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /submissions - the mentor's review queue: every assignment they set,
   * newest hand-ins first so anything waiting on them floats to the top.
   */
  async listSubmissions(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can access this view.' });
      }

      const notes = await MentorNote.find({ mentor: req.user.id, kind: 'homework' })
        .populate('student', 'name avatar collegeName')
        .sort({ 'submission.submittedAt': -1, createdAt: -1 })
        .limit(SUBMISSION_QUEUE_LIMIT)
        .lean();

      const now = Date.now();
      const assignments = notes.filter((note) => note.student).map((note) => ({
        ...serializeNote(note),
        student: {
          ...serializeClassPerson(note.student),
          collegeName: note.student.collegeName || ''
        }
      }));

      const stats = assignments.reduce((acc, item) => {
        acc.total += 1;
        if (item.status === 'submitted') {
          acc.awaitingReview += 1;
        } else if (item.status === 'done') {
          acc.done += 1;
        } else {
          acc.outstanding += 1;
          if (item.dueAt && new Date(item.dueAt).getTime() < now) acc.overdue += 1;
        }
        return acc;
      }, { total: 0, awaitingReview: 0, outstanding: 0, done: 0, overdue: 0 });

      return res.json({ success: true, data: { assignments, stats } });
    } catch (err) {
      next(err);
    }
  },

  async postAnnouncement(req, res, next) {
    try {
      if (!isMentorRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Only mentors can post announcements.' });
      }

      const message = String(req.body?.message || '').trim();
      if (!message) {
        return res.status(400).json({ success: false, message: 'Announcement text is required.' });
      }

      const mentor = await User.findById(req.user.id).select('name avatar role').lean();
      const connections = await MentorConnection.find({ mentor: req.user.id, status: 'accepted' })
        .select('student')
        .lean();
      const recipients = connections.map((item) => item.student).filter(Boolean);

      if (!recipients.length) {
        return res.status(400).json({ success: false, message: 'You have no connected students to notify.' });
      }

      const attachments = sanitizeAttachments(req.body?.attachments);
      const trimmed = message.slice(0, 500);
      const announcement = await MentorAnnouncement.create({
        mentor: req.user.id,
        message: trimmed,
        recipientCount: recipients.length,
        attachments
      });

      const io = getSocketServer();
      const mentorName = mentor?.name || 'Your mentor';
      const announcementPayload = {
        _id: announcement._id,
        message: trimmed,
        attachments,
        createdAt: announcement.createdAt,
        mentor: serializeClassPerson(mentor || { _id: req.user.id, name: 'Mentor', avatar: '' })
      };

      await Promise.allSettled(recipients.map(async (recipient) => {
        await notify(io, {
          recipient,
          actor: req.user.id,
          type: 'mentor_announcement',
          message: `${mentorName} posted a class announcement: ${trimmed}`,
          preview: trimmed.slice(0, 140)
        });

        if (io) {
          try {
            io.to(`user:${String(recipient)}`).emit('class:announcement:new', announcementPayload);
          } catch (_) {}
        }
      }));

      return res.json({
        success: true,
        message: `Announcement sent to ${recipients.length} student${recipients.length === 1 ? '' : 's'}.`,
        data: { recipients: recipients.length, announcement: announcementPayload }
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /upload - upload classwork / announcement attachment (PDF or image) */
  async uploadAttachment(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided for upload.' });
      }

      // Classroom uploads belong to the classroom. Mentors always qualify; a
      // student qualifies once a mentor has accepted them. Without this the
      // route is open file hosting for any registered account.
      if (!isMentorRole(req.user.role)) {
        const inAClass = await MentorConnection.exists({ student: req.user.id, status: 'accepted' });
        if (!inAClass) {
          return res.status(403).json({
            success: false,
            message: 'You need an accepted mentor connection before uploading class files.'
          });
        }
      }

      const uploaded = await processClassUpload(req.file, req.user?.id);
      return res.json({
        success: true,
        message: 'File uploaded successfully.',
        data: uploaded
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = mentorController;
