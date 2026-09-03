import { httpClient } from './httpClient';

const { request, buildHeaders } = httpClient;

/**
 * Fetch the authenticated user's active study routine and currently running focus session.
 * 
 * Flow:
 * - Triggered automatically on StudyRoutinePage mount (`loadRoutineData`).
 * - Sends a GET request to `/study-routine`.
 * - Injects the user's JWT from localStorage via `buildHeaders()`.
 * 
 * @returns {Promise<{ routine: Object|null, activeSession: Object|null }>}
 *   `routine`: The user's StudyRoutine document (or null if they haven't generated one yet).
 *   `activeSession`: Any currently active focus timer session (or null if none running).
 */
export function getRoutine() {
  return request('/study-routine', {
    headers: buildHeaders()
  });
}

/**
 * Save student profile preferences and generate the initial 7-day study routine.
 * 
 * Flow:
 * - Triggered when the user clicks "Generate My AI Study Routine" at the end of the 6-step wizard.
 * - Sends a POST request to `/study-routine` with profile inputs (subjects, times, goals).
 * - Backend uses Groq LLM (or a deterministic fallback) to generate day-by-day study slots.
 * - Set with an extended 60-second timeout to accommodate LLM inference latency.
 * 
 * @param {Object} data - Payload containing `{ studentProfile: formData }`.
 * @returns {Promise<Object>} The newly created/updated StudyRoutine document.
 */
export function saveRoutine(data) {
  return request('/study-routine', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
    timeoutMs: 60000
  });
}

/**
 * Overwrite or replace the routine days array or student profile in MongoDB.
 * 
 * Flow:
 * - Used when manual batch reorganizations or full schedule edits occur.
 * - Sends a PUT request to `/study-routine`.
 * 
 * @param {Object} data - Payload containing `{ routine?, studentProfile?, examInfo? }`.
 * @returns {Promise<Object>} The updated StudyRoutine document.
 */
export function replaceRoutine(data) {
  return request('/study-routine', {
    method: 'PUT',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
}

/**
 * Permanently delete the user's study routine and cancel any active focus sessions.
 * 
 * Flow:
 * - Triggered when the user clicks the "Delete Routine" button and confirms the prompt.
 * - Sends a DELETE request to `/study-routine`.
 * - Backend removes the StudyRoutine record and marks any active sessions as 'abandoned'.
 * - UI resets back to Step 1 of the Profiling Wizard.
 * 
 * @returns {Promise<null>}
 */
export function deleteRoutine() {
  return request('/study-routine', {
    method: 'DELETE',
    headers: buildHeaders()
  });
}

/**
 * Toggle the completion status (completed: true/false) of a specific study segment.
 * 
 * Flow:
 * - Triggered when the user clicks the checkbox on any routine segment card in Day/Week views.
 * - Sends a PATCH request to `/study-routine/:dayIndex/:segmentId/toggle`.
 * - Backend flips the segment's `completed` flag and stamps `completedAt`.
 * - UI updates the card styling (green/strikethrough) and re-calculates progress metrics.
 * 
 * @param {number|string} dayIndex - Day number (e.g. 1) or array index.
 * @param {string} segmentId - Unique ID of the segment sub-document.
 * @returns {Promise<{ routine: Object, day: Object, segment: Object }>}
 */
export function toggleSegment(dayIndex, segmentId) {
  return request(`/study-routine/${dayIndex}/${segmentId}/toggle`, {
    method: 'PATCH',
    headers: buildHeaders()
  });
}

/**
 * Update the details of a single routine segment (subject, chapter, task, duration, time).
 * 
 * Flow:
 * - Triggered when the user submits the "Edit Routine Segment" modal dialog.
 * - Sends a PUT request to `/study-routine/:dayIndex/:segmentId`.
 * - Backend updates the segment's fields within the parent day array.
 * 
 * @param {number|string} dayIndex - Day number or array index.
 * @param {string} segmentId - ID of the segment being edited.
 * @param {Object} data - Fields to update (e.g., `{ subject, chapter, task, time, priority }`).
 * @returns {Promise<{ routine: Object, day: Object, segment: Object }>}
 */
export function editSegment(dayIndex, segmentId, data) {
  return request(`/study-routine/${dayIndex}/${segmentId}`, {
    method: 'PUT',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
}

/**
 * Retrieve aggregated study statistics, streaks, and subject distributions.
 * 
 * Flow:
 * - Triggered on page load and whenever segments are completed or focus sessions finish.
 * - Sends a GET request to `/study-routine/stats`.
 * - Backend aggregates planned vs completed minutes, calculates study streaks,
 *   and derives subject mastery ratios.
 * 
 * @returns {Promise<{
 *   totalSegments: number,
 *   completedSegments: number,
 *   upcomingSegments: number,
 *   completionPercentage: number,
 *   totalPlannedHours: number,
 *   totalCompletedHours: number,
 *   currentStreak: number,
 *   subjectDistribution: Array<Object>,
 *   dailyCompletion: Array<Object>,
 *   recentSessions: Array<Object>
 * }>}
 */
export function getStats() {
  return request('/study-routine/stats', {
    headers: buildHeaders()
  });
}

/**
 * Start a live focus timer session (Pomodoro / Study Tracker).
 * 
 * Flow:
 * - Triggered when the user clicks "Start Focus" on an upcoming routine segment.
 * - Sends a POST request to `/study-routine/session/start`.
 * - Backend marks any previous active session as 'abandoned' and persists a new 'active' StudySession.
 * - UI activates the persistent ticking timer bar at the top of the dashboard.
 * 
 * @param {Object} data - `{ routineId?, segmentId?, subject, chapter? }`.
 * @returns {Promise<Object>} The newly created StudySession document.
 */
export function startSession(data) {
  return request('/study-routine/session/start', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
}

/**
 * Stop and finalize the active focus timer session.
 * 
 * Flow:
 * - Triggered when the user clicks "Stop & Complete" or "Stop" on the focus timer bar.
 * - Sends a POST request to `/study-routine/session/stop`.
 * - Backend computes elapsed duration in minutes, sets session status to 'completed',
 *   and optionally marks the associated routine segment as completed.
 * - UI halts the timer ticker and recalculates stats.
 * 
 * @param {Object} [data={}] - `{ segmentId?, markCompleted?: boolean }`.
 * @returns {Promise<{ session: Object, routine: Object|null }>}
 */
export function stopSession(data = {}) {
  return request('/study-routine/session/stop', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
}

/**
 * Preview or test routine generation directly without persisting to the database.
 * 
 * Flow:
 * - Sends a POST request to `/study-routine/ai/chat`.
 * - Subject to rate limiting (`aiLimiter`) and user plan quota checks (`enforceAiQuota`).
 * 
 * @param {Object} studentProfile - Complete profiling form data.
 * @returns {Promise<{ routine: Array<Object> }>}
 */
export function aiGenerate(studentProfile) {
  return request('/study-routine/ai/chat', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ studentProfile }),
    timeoutMs: 90000
  });
}

/**
 * Modify the current routine via natural language instructions to the AI Study Coach.
 * 
 * Flow:
 * - Triggered from the floating AI assistant drawer when the student enters a command
 *   (e.g., "Swap Physics and Chemistry on Tuesday" or "Make tomorrow lighter").
 * - Sends a POST request to `/study-routine/ai/modify`.
 * - Backend instructs Groq LLM to intelligently shift or balance slots while preserving
 *   completed tasks, saves changes, and returns a friendly reply message.
 * 
 * @param {string} message - Natural language request from the user.
 * @param {Array<Object>} currentRoutine - Array of current day objects.
 * @returns {Promise<{ reply: string, routine: Array<Object> }>}
 */
export function aiModify(message, currentRoutine) {
  return request('/study-routine/ai/modify', {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, currentRoutine }),
    timeoutMs: 60000
  });
}

/**
 * Generate the next 7 days adaptively based on past completion rates and subject mastery.
 * 
 * Flow:
 * - Triggered when the user clicks "Generate Next 7 Days" in the dashboard.
 * - Sends a POST request to `/study-routine/ai/generate-week`.
 * - Backend analyzes historical completion percentages: assigns remedial revision slots
 *   to subjects with <50% completion, advances chapters for subjects with >80% completion,
 *   and appends Days 8-14 to the routine in MongoDB.
 * 
 * @returns {Promise<Object>} The updated StudyRoutine document with extended days.
 */
export function aiGenerateWeek() {
  return request('/study-routine/ai/generate-week', {
    method: 'POST',
    headers: buildHeaders(),
    timeoutMs: 60000
  });
}

export default {
  getRoutine,
  saveRoutine,
  replaceRoutine,
  deleteRoutine,
  toggleSegment,
  editSegment,
  getStats,
  startSession,
  stopSession,
  aiGenerate,
  aiModify,
  aiGenerateWeek
};
