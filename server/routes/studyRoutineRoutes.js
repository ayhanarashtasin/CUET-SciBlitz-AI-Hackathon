const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const aiQuota = require('../middleware/enforceAiQuota');
const { aiLimiter } = require('../middleware/rateLimiters');
const ctrl = require('../controllers/studyRoutineController');

/**
 * All study routine endpoints require an authenticated user.
 * The `auth` middleware verifies the JWT Bearer token, checks if the account
 * is active or banned, and injects `req.user`.
 */
router.use(auth);

// --------------------------------------------------------------------------
// Routine CRUD & Segment Management Endpoints
// --------------------------------------------------------------------------

/**
 * GET /api/study-routine
 * Retrieves the current authenticated user's StudyRoutine document and any running focus session.
 * Used on dashboard mount to render the schedule or direct to the setup wizard.
 */
router.get('/', ctrl.getRoutine);

/**
 * POST /api/study-routine
 * Takes the student's profiling form, generates a structured 7-day study routine via Groq LLM
 * (or deterministic fallback), and saves/upserts it to MongoDB.
 */
router.post('/', ctrl.saveRoutine);

/**
 * PUT /api/study-routine
 * Replaces or bulk-updates the routine array, student profile, or exam target metadata.
 */
router.put('/', ctrl.replaceRoutine);

/**
 * DELETE /api/study-routine
 * Deletes the user's StudyRoutine document and marks any active sessions as abandoned.
 */
router.delete('/', ctrl.deleteRoutine);

/**
 * GET /api/study-routine/stats
 * Aggregates study statistics: total planned vs completed hours, study streaks,
 * subject distribution, and recent focus sessions.
 */
router.get('/stats', ctrl.getStats);

/**
 * PATCH /api/study-routine/:dayIndex/:segmentId/toggle
 * Toggles the completion state (completed: true/false) of a specific routine segment.
 */
router.patch('/:dayIndex/:segmentId/toggle', ctrl.toggleSegment);

/**
 * PUT /api/study-routine/:dayIndex/:segmentId
 * Edits fields of a specific routine segment (e.g. subject, chapter, task, time, priority).
 */
router.put('/:dayIndex/:segmentId', ctrl.editSegment);

// --------------------------------------------------------------------------
// Live Focus Session (Pomodoro / Study Timer) Endpoints
// --------------------------------------------------------------------------

/**
 * POST /api/study-routine/session/start
 * Starts a live study focus timer. Abandons any previous active session and creates
 * a new StudySession document with status 'active'.
 */
router.post('/session/start', ctrl.startSession);

/**
 * POST /api/study-routine/session/stop
 * Halts the active study timer, computes elapsed duration, marks the session 'completed',
 * and optionally marks the associated routine segment completed.
 */
router.post('/session/stop', ctrl.stopSession);

// --------------------------------------------------------------------------
// AI-Powered Routine Generation & Adaptation Endpoints
// Protected by:
//   - `aiLimiter`: Rate limits to max 20 requests per minute to prevent cost abuse.
//   - `aiQuota`: Checks and consumes user plan credits (`aiActions`).
// --------------------------------------------------------------------------

/**
 * POST /api/study-routine/ai/chat
 * Generates and returns a 7-day study routine directly from student profile data without saving.
 */
router.post('/ai/chat', aiLimiter, aiQuota, ctrl.aiChat);

/**
 * POST /api/study-routine/ai/modify
 * Modifies an existing routine based on natural language student instructions
 * (e.g., "Swap Physics and Chemistry on Tuesday") using Groq LLM.
 */
router.post('/ai/modify', aiLimiter, aiQuota, ctrl.aiModify);

/**
 * POST /api/study-routine/ai/generate-week
 * Analyzes historical completion rates and subject mastery, and adaptively generates
 * the next 7 days of the routine (appending Days 8-14 to MongoDB).
 */
router.post('/ai/generate-week', aiLimiter, aiQuota, ctrl.aiGenerateWeek);

module.exports = router;
