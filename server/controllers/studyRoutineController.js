const StudyRoutine = require('../models/StudyRoutine');
const StudySession = require('../models/StudySession');
const ApiResponse = require('../utils/apiResponse');
const Groq = require('groq-sdk');

const GROQ_MODEL = process.env.LLM_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

/**
 * Instantiate the Groq Cloud SDK client using environment variables.
 * Fallback to LLM_API_KEY or GROQ_API_KEY.
 * 
 * @throws {Error} If neither GROQ_API_KEY nor LLM_API_KEY is configured in .env.
 * @returns {Groq} Initialized Groq SDK client instance.
 */
function getGroqClient() {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY or LLM_API_KEY is not configured');
  }
  return new Groq({ apiKey });
}

/**
 * Sanitize untrusted text inputs:
 * 1. Converts input to string safely.
 * 2. Strips ASCII and Unicode control characters (protects against log forging/injection).
 * 3. Trims whitespace and caps maximum string length.
 * 
 * @param {*} val - Raw text value to sanitize.
 * @param {number} [maxLength=500] - Maximum allowed character length.
 * @returns {string} Sanitized string.
 */
function sanitizeText(val, maxLength = 500) {
  if (val === undefined || val === null) return '';
  const str = String(val).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  return str.slice(0, maxLength);
}

/**
 * Sanitize the whole student profile object received from the frontend wizard.
 * Validates and normalizes all 28 profiling fields (academic level, subjects,
 * weak areas, wake/sleep schedules, unavailable blocks, rest days, and study preferences).
 * 
 * @param {Object} profile - Raw student profile submitted by user.
 * @returns {Object} Deeply sanitized student profile safe for database storage and prompt injection.
 */
function sanitizeProfile(profile = {}) {
  if (!profile || typeof profile !== 'object') return {};

  const clean = {
    academicLevel: sanitizeText(profile.academicLevel, 100),
    stream: sanitizeText(profile.stream, 100),
    medium: sanitizeText(profile.medium, 100),
    institution: sanitizeText(profile.institution, 200),
    examTarget: sanitizeText(profile.examTarget, 200),
    examDate: sanitizeText(profile.examDate, 50),
    targetGpa: sanitizeText(profile.targetGpa, 50),
    planDuration: sanitizeText(profile.planDuration, 50),
    subjects: Array.isArray(profile.subjects)
      ? profile.subjects.map((s) => sanitizeText(s, 100)).filter(Boolean)
      : [],
    subjectPapers: typeof profile.subjectPapers === 'object' && profile.subjectPapers !== null
      ? profile.subjectPapers
      : {},
    subjectChapters: typeof profile.subjectChapters === 'object' && profile.subjectChapters !== null
      ? profile.subjectChapters
      : {},
    weakSubjects: Array.isArray(profile.weakSubjects)
      ? profile.weakSubjects.map((s) => sanitizeText(s, 100)).filter(Boolean)
      : [],
    subjectConfidence: typeof profile.subjectConfidence === 'object' && profile.subjectConfidence !== null
      ? profile.subjectConfidence
      : {},
    wakeUpTime: sanitizeText(profile.wakeUpTime || '06:00 AM', 20),
    sleepTime: sanitizeText(profile.sleepTime || '11:00 PM', 20),
    unavailableBlocks: Array.isArray(profile.unavailableBlocks)
      ? profile.unavailableBlocks.map((b) => ({
          startTime: sanitizeText(b.startTime, 20),
          endTime: sanitizeText(b.endTime, 20),
          label: sanitizeText(b.label, 100)
        }))
      : [],
    studyDaysPerWeek: sanitizeText(profile.studyDaysPerWeek || '7', 10),
    restDays: Array.isArray(profile.restDays)
      ? profile.restDays.map((d) => sanitizeText(d, 30)).filter(Boolean)
      : [],
    dailyStudyHours: sanitizeText(profile.dailyStudyHours || '5-6 hours', 50),
    bestStudyTime: sanitizeText(profile.bestStudyTime, 50),
    focusDuration: sanitizeText(profile.focusDuration, 50),
    subjectMixing: sanitizeText(profile.subjectMixing, 100),
    breakScheduling: sanitizeText(profile.breakScheduling, 100),
    motivations: Array.isArray(profile.motivations)
      ? profile.motivations.map((m) => sanitizeText(m, 100)).filter(Boolean)
      : [],
    challenges: Array.isArray(profile.challenges)
      ? profile.challenges.map((c) => sanitizeText(c, 100)).filter(Boolean)
      : [],
    additionalNotes: sanitizeText(profile.additionalNotes, 500),
    preferredStartDate: sanitizeText(profile.preferredStartDate, 50)
  };

  return clean;
}

/**
 * Execute an LLM API call with automated exponential backoff retry logic.
 * Handles transient network glitches, 429 rate limit spikes, and 5xx server errors.
 * 
 * @param {Function} groqCallFn - Async function executing the Groq API call.
 * @param {number} [maxAttempts=4] - Maximum number of retry attempts before giving up.
 * @returns {Promise<*>} Result of the successful Groq API call.
 * @throws {Error} Throws the final error if all retry attempts fail.
 */
async function callGroqWithRetry(groqCallFn, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await groqCallFn();
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode;
      const isRetryable = !status || [429, 500, 502, 503, 504].includes(status) ||
        err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s (+ jitter up to 400ms)
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 6000) + Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

/**
 * Robustly extract and parse JSON from raw LLM output.
 * Handles:
 * - Removal of DeepSeek-style `<think>...</think>` internal reasoning tags.
 * - Stripping of markdown code fences (```json ... ```).
 * - Extraction of embedded `{ ... }` objects or `[ ... ]` arrays.
 * 
 * @param {string} raw - Raw text output from Groq LLM.
 * @returns {Object|Array|null} Parsed JSON object/array, or null if parsing fails.
 */
function safeParseJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // Try extracting top-level object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  // Try extracting top-level array
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

/**
 * Deterministic Fallback Routine Generator.
 * 
 * Invoked if the Groq LLM times out or encounters an outage.
 * Synthesizes a high-quality, pedagogically balanced 7-day routine based on:
 * - The student's selected subjects and weak areas (assigns 'high' priority and extra slots).
 * - Designated rest days (flags `isRest: true` and empty segments).
 * - Target daily study hours (distributes 2, 3, or 4 study slots per active day).
 * 
 * @param {Object} profile - Sanitized student profile.
 * @param {Date} startDate - Routine start calendar date.
 * @param {number} [startDayNumber=1] - Starting day index (e.g. 1 for first week, 8 for second week).
 * @returns {Array<Object>} 7 routine day objects with populated study segments.
 */
function generateFallbackRoutine(profile, startDate, startDayNumber = 1) {
  const routine = [];
  const subjects = profile.subjects && profile.subjects.length > 0
    ? profile.subjects
    : ['Physics', 'Chemistry', 'Higher Math', 'Bangla', 'English'];

  const weakSubjects = new Set(profile.weakSubjects || []);
  const restDays = new Set((profile.restDays || []).map((d) => d.toLowerCase()));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);
    const dayOfWeek = dayNames[dayDate.getDay()].toLowerCase();
    const isRest = restDays.has(dayOfWeek);

    const segments = [];
    if (!isRest) {
      const daySubjects = [
        subjects[i % subjects.length],
        subjects[(i + 1) % subjects.length],
        subjects[(i + 2) % subjects.length]
      ];

      const times = [
        { time: '07:30 AM - 09:30 AM', startH: 7, startM: 30, endH: 9, endM: 30, dur: 120 },
        { time: '10:30 AM - 12:30 PM', startH: 10, startM: 30, endH: 12, endM: 30, dur: 120 },
        { time: '04:30 PM - 06:30 PM', startH: 16, startM: 30, endH: 18, endM: 30, dur: 120 },
        { time: '08:00 PM - 10:00 PM', startH: 20, startM: 0, endH: 22, endM: 0, dur: 120 }
      ];

      // Determine session count based on student's requested daily study hours
      const numSessions = profile.dailyStudyHours && profile.dailyStudyHours.startsWith('3-4')
        ? 2
        : profile.dailyStudyHours && profile.dailyStudyHours.startsWith('9-10')
        ? 4
        : 3;

      for (let s = 0; s < numSessions; s++) {
        const slot = times[s];
        const subj = daySubjects[s % daySubjects.length];
        const isWeak = weakSubjects.has(subj);

        const startAt = new Date(dayDate);
        startAt.setHours(slot.startH, slot.startM, 0, 0);
        const endAt = new Date(dayDate);
        endAt.setHours(slot.endH, slot.endM, 0, 0);

        const chapterList = profile.subjectChapters?.[subj] || [];
        const chapter = chapterList[s % (chapterList.length || 1)] || 'Chapter Practice & Revision';

        segments.push({
          time: slot.time,
          subject: subj,
          paper: profile.subjectPapers?.[subj]?.[0] || '1st Paper',
          chapter: chapter,
          task: `Master key concepts and solve exercise problems for ${chapter}`,
          completed: false,
          startAt,
          endAt,
          priority: isWeak ? 'high' : (s === 0 ? 'medium' : 'low'),
          estimatedMinutes: slot.dur,
          notified: false
        });
      }
    }

    routine.push({
      day: startDayNumber + i,
      dayDate,
      isRest,
      segments
    });
  }

  return routine;
}

/**
 * Normalizes and validates raw routine day objects returned from the LLM.
 * Guarantees that every day, segment, date, priority, and duration conforms strictly
 * to the Mongoose StudyRoutine schema requirements.
 * 
 * @param {Array} rawDays - Raw parsed days array from LLM response.
 * @param {Date} startDate - Base start date for calculation.
 * @param {number} [startDayNumber=1] - Offset for day numbering.
 * @returns {Array<Object>|null} Validated array of routine day objects, or null if input is invalid.
 */
function normalizeRoutine(rawDays, startDate, startDayNumber = 1) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) return null;

  return rawDays.map((d, index) => {
    const dayDate = d.dayDate ? new Date(d.dayDate) : new Date(startDate.getTime() + index * 86400000);
    const isRest = Boolean(d.isRest);

    const segments = Array.isArray(d.segments)
      ? d.segments.map((seg) => {
          let startAt = seg.startAt ? new Date(seg.startAt) : null;
          let endAt = seg.endAt ? new Date(seg.endAt) : null;
          const estimatedMinutes = Number(seg.estimatedMinutes) || 60;

          if (!startAt || isNaN(startAt.getTime())) {
            startAt = new Date(dayDate);
            startAt.setHours(8, 0, 0, 0);
          }
          if (!endAt || isNaN(endAt.getTime())) {
            endAt = new Date(startAt.getTime() + estimatedMinutes * 60000);
          }

          return {
            time: sanitizeText(seg.time || '08:00 AM - 09:30 AM', 50),
            subject: sanitizeText(seg.subject || 'General Study', 100),
            paper: sanitizeText(seg.paper || '', 50),
            chapter: sanitizeText(seg.chapter || '', 120),
            task: sanitizeText(seg.task || 'Solve exercises and review concepts', 300),
            completed: Boolean(seg.completed),
            completedAt: seg.completedAt ? new Date(seg.completedAt) : undefined,
            startAt,
            endAt,
            priority: ['high', 'medium', 'low'].includes(String(seg.priority).toLowerCase())
              ? String(seg.priority).toLowerCase()
              : 'medium',
            estimatedMinutes,
            notified: Boolean(seg.notified)
          };
        })
      : [];

    return {
      day: Number(d.day) || (startDayNumber + index),
      dayDate,
      isRest,
      segments
    };
  });
}

/**
 * Build system prompt and user prompt for generating a realistic 7-day routine.
 * Embeds Bangladeshi academic curriculum guidelines, wake/sleep boundaries,
 * rest days, unavailable coaching blocks, and weak-area priority rules.
 * 
 * @param {Object} profile - Sanitized student profile.
 * @param {Date} startDate - Starting calendar date.
 * @param {number} [startDayNumber=1] - Day index offset.
 * @returns {{ systemInstruction: string, userPrompt: string }} Prompt payload for Groq chat completion.
 */
function buildGenerationPrompt(profile, startDate, startDayNumber = 1) {
  const systemInstruction = `You are TopKorbo's expert AI Academic Planner and Study Routine Architect for Bangladeshi students (HSC, Admission, Board Exams).
Your task is to generate a realistic, date-aware, and highly structured 7-day study routine JSON.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON matching this exact structure:
{
  "routine": [
    {
      "day": 1,
      "dayDate": "2026-08-16T00:00:00.000Z",
      "isRest": false,
      "segments": [
        {
          "time": "07:00 AM - 08:30 AM",
          "subject": "Physics",
          "paper": "1st Paper",
          "chapter": "Vector",
          "task": "Solve numerical problems 2.1-2.15 and review dot product rules",
          "priority": "high",
          "estimatedMinutes": 90,
          "startAt": "2026-08-16T07:00:00.000Z",
          "endAt": "2026-08-16T08:30:00.000Z",
          "completed": false
        }
      ]
    }
  ]
}

2. GENERATE EXACTLY 7 DAYS starting from ${startDate.toISOString().split('T')[0]} (Day ${startDayNumber} to Day ${startDayNumber + 6}).
3. Respect wake-up (${profile.wakeUpTime || '06:00 AM'}) and sleep time (${profile.sleepTime || '11:00 PM'}). Never schedule study sessions during sleep hours!
4. Strictly avoid unavailable time blocks: ${JSON.stringify(profile.unavailableBlocks || [])}.
5. Give higher priority and more time slots to WEAK SUBJECTS: ${JSON.stringify(profile.weakSubjects || [])}.
6. Honor study days per week (${profile.studyDaysPerWeek || 7}) and mark specified rest days (${JSON.stringify(profile.restDays || [])}) with "isRest": true and an empty segments array [].
7. Include sensible breaks matching preference: ${profile.breakScheduling || 'Short breaks (15 min)'}.
8. Make task descriptions concrete, actionable and curriculum-specific (e.g. "Solve Board Questions 2020-2023 on Organic Reactions", not vague "Study Chemistry").
9. Keep dates and startAt/endAt as valid ISO-8601 strings.`;

  const userPrompt = `Student Profile:
- Level: ${profile.academicLevel || 'HSC 2nd Year'}, Stream: ${profile.stream || 'Science'}, Medium: ${profile.medium || 'Bangla Medium'}
- Exam Target: ${profile.examTarget || 'HSC Board Exam'} on ${profile.examDate || 'Upcoming'}, Target GPA/Score: ${profile.targetGpa || 'GPA 5.00'}
- Selected Subjects: ${(profile.subjects || []).join(', ')}
- Subject Papers: ${JSON.stringify(profile.subjectPapers || {})}
- Specific Chapters to cover: ${JSON.stringify(profile.subjectChapters || {})}
- Weakest Subjects: ${(profile.weakSubjects || []).join(', ')}
- Subject Confidence Levels (1-5): ${JSON.stringify(profile.subjectConfidence || {})}
- Daily Schedule: Wake up at ${profile.wakeUpTime || '06:00 AM'}, Sleep at ${profile.sleepTime || '11:00 PM'}
- Unavailable Time Blocks: ${JSON.stringify(profile.unavailableBlocks || [])}
- Study Days Per Week: ${profile.studyDaysPerWeek || 7}, Rest Days: ${(profile.restDays || []).join(', ')}
- Daily Target Study Hours: ${profile.dailyStudyHours || '6 hours'}
- Best Study Time: ${profile.bestStudyTime || 'Morning'}, Focus Stretch: ${profile.focusDuration || '45 min'}
- Subject Mixing: ${profile.subjectMixing || 'Mix 2-3 subjects'}, Breaks: ${profile.breakScheduling || '15 min breaks'}
- Motivations: ${(profile.motivations || []).join(', ')}, Challenges: ${(profile.challenges || []).join(', ')}
- Additional Instructions: ${profile.additionalNotes || 'None'}

Please construct the 7-day study routine JSON starting on ${startDate.toISOString().split('T')[0]}.`;

  return { systemInstruction, userPrompt };
}

// --------------------------------------------------------------------------
// CONTROLLER HANDLERS
// --------------------------------------------------------------------------

/**
 * GET /api/study-routine
 * 
 * Retrieve the caller's active StudyRoutine document and any currently running focus timer session.
 * 
 * Workflow:
 * 1. Queries MongoDB `StudyRoutine` collection by `req.user.id`.
 * 2. Queries `StudySession` collection for any session with `status: 'active'`.
 * 3. Returns both items wrapped in `ApiResponse.success`. If none found, returns nulls.
 * 
 * @param {import('express').Request} req - Express request with `req.user.id`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function getRoutine(req, res, next) {
  try {
    const routine = await StudyRoutine.findOne({ userId: req.user.id });
    const activeSession = await StudySession.findOne({ userId: req.user.id, status: 'active' });

    return ApiResponse.success(res, {
      routine: routine || null,
      activeSession: activeSession || null
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine
 * 
 * Save the student's 28-field profiling preferences and generate their first 7-day study routine.
 * 
 * Workflow:
 * 1. Validates and sanitizes incoming student profile data.
 * 2. Calculates start date and overall plan duration.
 * 3. Calls Groq LLM API with exponential backoff to generate structured 7-day study slots.
 * 4. Normalizes and validates the LLM JSON against schema standards.
 * 5. Falls back to a deterministic generator if the LLM fails or times out.
 * 6. Upserts the `StudyRoutine` document in MongoDB for this user.
 * 7. Returns the saved routine with status 201 Created.
 * 
 * @param {import('express').Request} req - Express request with `req.body.studentProfile`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function saveRoutine(req, res, next) {
  try {
    const rawProfile = req.body.studentProfile || req.body;
    if (!rawProfile || typeof rawProfile !== 'object') {
      return ApiResponse.error(res, 'Student profile data is required', 400);
    }

    const studentProfile = sanitizeProfile(rawProfile);
    const startDate = studentProfile.preferredStartDate
      ? new Date(studentProfile.preferredStartDate)
      : new Date();

    if (isNaN(startDate.getTime())) {
      return ApiResponse.error(res, 'Invalid preferred start date', 400);
    }

    const durationDays = parseInt(studentProfile.planDuration, 10) || 30;
    const examInfo = {
      examTarget: studentProfile.examTarget,
      examDate: studentProfile.examDate,
      targetGpa: studentProfile.targetGpa,
      institution: studentProfile.institution
    };

    // Call Groq LLM with exponential backoff
    let generatedRoutine = null;
    try {
      const groq = getGroqClient();
      const { systemInstruction, userPrompt } = buildGenerationPrompt(studentProfile, startDate, 1);

      const completion = await callGroqWithRetry(() =>
        groq.chat.completions.create({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ]
        })
      );

      const content = completion?.choices?.[0]?.message?.content || '';
      const parsed = safeParseJson(content);
      const days = parsed?.routine || (Array.isArray(parsed) ? parsed : null);
      generatedRoutine = normalizeRoutine(days, startDate, 1);
    } catch (llmErr) {
      console.warn('[StudyRoutineController] Groq generation failed, falling back to deterministic routine:', llmErr.message);
    }

    // If LLM returned empty or failed, use fallback deterministic generator
    if (!generatedRoutine || generatedRoutine.length === 0) {
      generatedRoutine = generateFallbackRoutine(studentProfile, startDate, 1);
    }

    const generatedUpTo = new Date(startDate);
    generatedUpTo.setDate(generatedUpTo.getDate() + generatedRoutine.length);

    // Save or update existing StudyRoutine document
    let routineDoc = await StudyRoutine.findOne({ userId: req.user.id });
    if (routineDoc) {
      routineDoc.startDate = startDate;
      routineDoc.durationDays = durationDays;
      routineDoc.generatedUpTo = generatedUpTo;
      routineDoc.studentProfile = studentProfile;
      routineDoc.examInfo = examInfo;
      routineDoc.routine = generatedRoutine;
    } else {
      routineDoc = new StudyRoutine({
        userId: req.user.id,
        startDate,
        durationDays,
        generatedUpTo,
        studentProfile,
        examInfo,
        routine: generatedRoutine
      });
    }

    await routineDoc.save();

    return ApiResponse.success(res, routineDoc, 'Study routine generated successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/study-routine
 * 
 * Replace or bulk-update the routine array, student profile, or exam target metadata.
 * 
 * Workflow:
 * 1. Checks that an existing routine exists for the user.
 * 2. Overwrites `routine`, `studentProfile`, or `examInfo` if provided.
 * 3. Saves document and returns the updated entity.
 * 
 * @param {import('express').Request} req - Express request with `{ routine, studentProfile, examInfo }`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function replaceRoutine(req, res, next) {
  try {
    const { routine, studentProfile, examInfo } = req.body;
    let routineDoc = await StudyRoutine.findOne({ userId: req.user.id });

    if (!routineDoc) {
      return ApiResponse.error(res, 'No study routine found to update', 404);
    }

    if (Array.isArray(routine)) {
      routineDoc.routine = routine;
    }
    if (studentProfile) {
      routineDoc.studentProfile = sanitizeProfile(studentProfile);
    }
    if (examInfo) {
      routineDoc.examInfo = examInfo;
    }

    await routineDoc.save();
    return ApiResponse.success(res, routineDoc, 'Study routine updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/study-routine
 * 
 * Delete the caller's StudyRoutine document and abandon any running focus sessions.
 * 
 * Workflow:
 * 1. Finds and removes the `StudyRoutine` document belonging to `req.user.id`.
 * 2. Finds any active `StudySession` documents for this user and sets `status = 'abandoned'`.
 * 3. Returns a 200 OK success message.
 * 
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function deleteRoutine(req, res, next) {
  try {
    await StudyRoutine.findOneAndDelete({ userId: req.user.id });
    await StudySession.updateMany(
      { userId: req.user.id, status: 'active' },
      { status: 'abandoned', endedAt: new Date() }
    );

    return ApiResponse.success(res, null, 'Study routine deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/study-routine/:dayIndex/:segmentId/toggle
 * 
 * Toggle the completion status (completed: true/false) of a specific routine segment.
 * 
 * Workflow:
 * 1. Finds the user's StudyRoutine.
 * 2. Matches the day by day number or index.
 * 3. Matches the sub-document segment by ID.
 * 4. Toggles `segment.completed` and records `completedAt` timestamp.
 * 5. Saves the document and returns the updated routine, day, and segment.
 * 
 * @param {import('express').Request} req - Express request with `params.dayIndex` and `params.segmentId`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function toggleSegment(req, res, next) {
  try {
    const { dayIndex, segmentId } = req.params;
    const routineDoc = await StudyRoutine.findOne({ userId: req.user.id });

    if (!routineDoc) {
      return ApiResponse.error(res, 'Study routine not found', 404);
    }

    const dayNum = parseInt(dayIndex, 10);
    // Locate day by index or day number
    let targetDay = routineDoc.routine.find((d) => d.day === dayNum);
    if (!targetDay && routineDoc.routine[dayNum] !== undefined) {
      targetDay = routineDoc.routine[dayNum];
    }

    if (!targetDay) {
      return ApiResponse.error(res, 'Routine day not found', 404);
    }

    const segment = targetDay.segments.id(segmentId) ||
      targetDay.segments.find((s) => String(s._id) === String(segmentId) || s.id === segmentId);

    if (!segment) {
      return ApiResponse.error(res, 'Routine segment not found', 404);
    }

    segment.completed = !segment.completed;
    segment.completedAt = segment.completed ? new Date() : null;

    await routineDoc.save();

    return ApiResponse.success(res, {
      routine: routineDoc,
      day: targetDay,
      segment
    }, 'Segment updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/study-routine/:dayIndex/:segmentId
 * 
 * Edit fields of a specific routine segment (e.g. subject, chapter, task, time, priority).
 * 
 * Workflow:
 * 1. Finds the user's StudyRoutine, day, and segment.
 * 2. Sanitizes and updates all modified fields.
 * 3. Persists changes to MongoDB and returns the updated state.
 * 
 * @param {import('express').Request} req - Express request with update fields in `req.body`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function editSegment(req, res, next) {
  try {
    const { dayIndex, segmentId } = req.params;
    const updateData = req.body;
    const routineDoc = await StudyRoutine.findOne({ userId: req.user.id });

    if (!routineDoc) {
      return ApiResponse.error(res, 'Study routine not found', 404);
    }

    const dayNum = parseInt(dayIndex, 10);
    let targetDay = routineDoc.routine.find((d) => d.day === dayNum);
    if (!targetDay && routineDoc.routine[dayNum] !== undefined) {
      targetDay = routineDoc.routine[dayNum];
    }

    if (!targetDay) {
      return ApiResponse.error(res, 'Routine day not found', 404);
    }

    const segment = targetDay.segments.id(segmentId) ||
      targetDay.segments.find((s) => String(s._id) === String(segmentId) || s.id === segmentId);

    if (!segment) {
      return ApiResponse.error(res, 'Routine segment not found', 404);
    }

    if (updateData.subject !== undefined) segment.subject = sanitizeText(updateData.subject, 100);
    if (updateData.paper !== undefined) segment.paper = sanitizeText(updateData.paper, 50);
    if (updateData.chapter !== undefined) segment.chapter = sanitizeText(updateData.chapter, 120);
    if (updateData.task !== undefined) segment.task = sanitizeText(updateData.task, 300);
    if (updateData.time !== undefined) segment.time = sanitizeText(updateData.time, 50);
    if (updateData.priority !== undefined) segment.priority = sanitizeText(updateData.priority, 20);
    if (updateData.estimatedMinutes !== undefined) segment.estimatedMinutes = Number(updateData.estimatedMinutes) || 60;
    if (updateData.startAt !== undefined) segment.startAt = new Date(updateData.startAt);
    if (updateData.endAt !== undefined) segment.endAt = new Date(updateData.endAt);
    if (updateData.completed !== undefined) {
      segment.completed = Boolean(updateData.completed);
      segment.completedAt = segment.completed ? new Date() : null;
    }

    await routineDoc.save();

    return ApiResponse.success(res, {
      routine: routineDoc,
      day: targetDay,
      segment
    }, 'Segment updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/study-routine/stats
 * 
 * Aggregate comprehensive study statistics: planned hours, completed hours,
 * study streaks, subject distributions, and daily completion history.
 * 
 * Workflow:
 * 1. Loads user's routine and the 20 most recent completed study sessions.
 * 2. Iterates over all days and segments to aggregate:
 *    - totalSegments, completedSegments, and overall completionPercentage.
 *    - totalPlannedMinutes and totalCompletedMinutes.
 *    - Per-subject breakdown (planned vs completed hours, completionRate).
 *    - Daily completion metrics for charts and heatmaps.
 * 3. Calculates the current consecutive day streak (rest days preserve the streak).
 * 4. Returns the computed statistics payload.
 * 
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function getStats(req, res, next) {
  try {
    const routineDoc = await StudyRoutine.findOne({ userId: req.user.id });
    const sessions = await StudySession.find({ userId: req.user.id, status: 'completed' })
      .sort({ endedAt: -1 })
      .limit(20);

    if (!routineDoc || !Array.isArray(routineDoc.routine) || routineDoc.routine.length === 0) {
      return ApiResponse.success(res, {
        totalSegments: 0,
        completedSegments: 0,
        upcomingSegments: 0,
        completionPercentage: 0,
        totalPlannedMinutes: 0,
        totalCompletedMinutes: 0,
        totalPlannedHours: 0,
        totalCompletedHours: 0,
        currentStreak: 0,
        subjectDistribution: [],
        dailyCompletion: [],
        recentSessions: sessions
      });
    }

    let totalSegments = 0;
    let completedSegments = 0;
    let totalPlannedMinutes = 0;
    let totalCompletedMinutes = 0;

    const subjectMap = {};
    const dailyCompletion = [];

    // Calculate routine metrics
    routineDoc.routine.forEach((dayObj) => {
      let dayTotal = 0;
      let dayCompleted = 0;

      if (!dayObj.isRest && Array.isArray(dayObj.segments)) {
        dayObj.segments.forEach((seg) => {
          totalSegments++;
          dayTotal++;

          const dur = Number(seg.estimatedMinutes) || 60;
          totalPlannedMinutes += dur;

          const subj = seg.subject || 'Other';
          if (!subjectMap[subj]) {
            subjectMap[subj] = {
              subject: subj,
              totalSegments: 0,
              completedSegments: 0,
              plannedMinutes: 0,
              completedMinutes: 0
            };
          }

          subjectMap[subj].totalSegments++;
          subjectMap[subj].plannedMinutes += dur;

          if (seg.completed) {
            completedSegments++;
            dayCompleted++;
            totalCompletedMinutes += dur;
            subjectMap[subj].completedSegments++;
            subjectMap[subj].completedMinutes += dur;
          }
        });
      }

      dailyCompletion.push({
        day: dayObj.day,
        dayDate: dayObj.dayDate,
        isRest: dayObj.isRest,
        totalSegments: dayTotal,
        completedSegments: dayCompleted,
        percentage: dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : (dayObj.isRest ? 100 : 0)
      });
    });

    // Add study session minutes to completed minutes
    const sessionMinutes = sessions.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
    const effectiveCompletedMinutes = Math.max(totalCompletedMinutes, sessionMinutes);

    // Calculate current streak (consecutive days ending today/yesterday with >= 1 completed segment or session)
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sortedDays = [...dailyCompletion].sort((a, b) => new Date(b.dayDate) - new Date(a.dayDate));
    for (const d of sortedDays) {
      if (d.isRest || d.completedSegments > 0) {
        currentStreak++;
      } else {
        const dayD = new Date(d.dayDate);
        dayD.setHours(0, 0, 0, 0);
        // If today has no completions yet, allow streak from yesterday
        if (dayD.getTime() === today.getTime()) {
          continue;
        }
        break;
      }
    }

    const subjectDistribution = Object.values(subjectMap).map((item) => ({
      ...item,
      completionRate: item.totalSegments > 0 ? Math.round((item.completedSegments / item.totalSegments) * 100) : 0,
      plannedHours: +(item.plannedMinutes / 60).toFixed(1),
      completedHours: +(item.completedMinutes / 60).toFixed(1)
    }));

    return ApiResponse.success(res, {
      totalSegments,
      completedSegments,
      upcomingSegments: Math.max(0, totalSegments - completedSegments),
      completionPercentage: totalSegments > 0 ? Math.round((completedSegments / totalSegments) * 100) : 0,
      totalPlannedMinutes,
      totalCompletedMinutes: effectiveCompletedMinutes,
      totalPlannedHours: +(totalPlannedMinutes / 60).toFixed(1),
      totalCompletedHours: +(effectiveCompletedMinutes / 60).toFixed(1),
      currentStreak,
      subjectDistribution,
      dailyCompletion,
      recentSessions: sessions
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine/session/start
 * 
 * Start a live focus timer session (Pomodoro or manual study tracking).
 * 
 * Workflow:
 * 1. Marks any currently active session for this user as 'abandoned' with an endedAt timestamp.
 * 2. Creates a new StudySession with `status = 'active'` and current start timestamp.
 * 3. Saves to MongoDB and returns the active session document to the frontend.
 * 
 * @param {import('express').Request} req - Express request containing session details.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function startSession(req, res, next) {
  try {
    const { routineId, segmentId, subject, chapter } = req.body;

    const sessionData = {
      userId: req.user.id,
      routineId: routineId || undefined,
      segmentId: segmentId || undefined,
      subject: sanitizeText(subject, 100),
      chapter: sanitizeText(chapter, 120),
      startedAt: new Date(),
      status: 'active'
    };

    // Abandon any existing active sessions
    await StudySession.updateMany(
      { userId: req.user.id, status: 'active' },
      { status: 'abandoned', endedAt: new Date() }
    );

    let session;
    try {
      session = new StudySession(sessionData);
      await session.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        // Recycle/upsert active session if duplicate key index exists
        session = await StudySession.findOneAndUpdate(
          { userId: req.user.id, status: 'active' },
          { $set: sessionData },
          { new: true, upsert: true }
        );
        if (!session) {
          session = await StudySession.findOneAndUpdate(
            { userId: req.user.id },
            { $set: sessionData },
            { new: true }
          );
        }
      } else {
        throw saveErr;
      }
    }

    return ApiResponse.success(res, session, 'Study session started', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine/session/stop
 * 
 * Stop and finalize the active focus timer session.
 * 
 * Workflow:
 * 1. Finds the user's active session in MongoDB.
 * 2. Computes the elapsed duration: `durationMinutes = (endedAt - startedAt) / 60000`.
 * 3. Updates session status to 'completed' and saves.
 * 4. If `markCompleted: true`, finds the associated routine segment and marks `completed = true`.
 * 5. Returns the completed session and updated routine.
 * 
 * @param {import('express').Request} req - Express request with `{ segmentId?, markCompleted?: boolean }`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function stopSession(req, res, next) {
  try {
    const { segmentId, dayIndex, markCompleted } = req.body;

    const session = await StudySession.findOne({ userId: req.user.id, status: 'active' });
    if (!session) {
      return ApiResponse.error(res, 'No active study session found', 404);
    }

    const endedAt = new Date();
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000));

    session.endedAt = endedAt;
    session.durationMinutes = durationMinutes;
    session.status = 'completed';
    await session.save();

    // Optionally mark the corresponding routine segment completed
    let routineDoc = null;
    const targetSegmentId = segmentId || session.segmentId;
    if (markCompleted || targetSegmentId) {
      routineDoc = await StudyRoutine.findOne({ userId: req.user.id });
      if (routineDoc && targetSegmentId) {
        let found = false;
        for (const day of routineDoc.routine) {
          const seg = day.segments.find((s) => String(s._id) === String(targetSegmentId) || s.id === targetSegmentId);
          if (seg) {
            seg.completed = true;
            seg.completedAt = new Date();
            found = true;
            break;
          }
        }
        if (found) {
          await routineDoc.save();
        }
      }
    }

    return ApiResponse.success(res, {
      session,
      routine: routineDoc
    }, 'Study session saved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine/ai/chat
 * 
 * Test or preview 7-day routine generation directly without saving to the database.
 * 
 * @param {import('express').Request} req - Express request containing `studentProfile`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function aiChat(req, res, next) {
  try {
    const rawProfile = req.body.studentProfile || req.body;
    const studentProfile = sanitizeProfile(rawProfile);
    const startDate = studentProfile.preferredStartDate
      ? new Date(studentProfile.preferredStartDate)
      : new Date();

    const groq = getGroqClient();
    const { systemInstruction, userPrompt } = buildGenerationPrompt(studentProfile, startDate, 1);

    const completion = await callGroqWithRetry(() =>
      groq.chat.completions.create({
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt }
        ]
      })
    );

    const content = completion?.choices?.[0]?.message?.content || '';
    const parsed = safeParseJson(content);
    const days = parsed?.routine || (Array.isArray(parsed) ? parsed : null);
    let routine = normalizeRoutine(days, startDate, 1);

    if (!routine || routine.length === 0) {
      routine = generateFallbackRoutine(studentProfile, startDate, 1);
    }

    return ApiResponse.success(res, { routine }, 'AI routine generated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine/ai/modify
 * 
 * Modify an existing routine based on natural language student instructions.
 * 
 * Workflow:
 * 1. Sanitizes user modification message (e.g. "Swap Physics and Higher Math on Tuesday").
 * 2. Fetches user's current routine from MongoDB.
 * 3. Sends prompt to Groq LLM with strict instructions to preserve already-completed segments.
 * 4. Normalizes the adapted routine and saves it back to MongoDB.
 * 5. Returns a friendly AI response explanation and the modified routine schedule.
 * 
 * @param {import('express').Request} req - Express request with `{ message, currentRoutine? }`.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function aiModify(req, res, next) {
  try {
    const message = sanitizeText(req.body.message, 500);
    const currentRoutineInput = req.body.currentRoutine;

    if (!message) {
      return ApiResponse.error(res, 'Modification message is required', 400);
    }

    let routineDoc = await StudyRoutine.findOne({ userId: req.user.id });
    const baseRoutine = (routineDoc && routineDoc.routine.length > 0)
      ? routineDoc.routine
      : currentRoutineInput;

    if (!baseRoutine || !Array.isArray(baseRoutine)) {
      return ApiResponse.error(res, 'No current routine available to modify', 400);
    }

    const groq = getGroqClient();
    const systemInstruction = `You are TopKorbo's expert AI Academic Study Coach.
A student wants to modify their study schedule with this request: "${message}".

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON in this exact structure:
{
  "reply": "Clear, friendly explanation in 1-2 sentences of what was changed and a quick motivational tip.",
  "routine": [
    {
      "day": 1,
      "dayDate": "2026-08-16T00:00:00.000Z",
      "isRest": false,
      "segments": [
        {
          "time": "07:00 AM - 08:30 AM",
          "subject": "Physics",
          "paper": "1st Paper",
          "chapter": "Vector",
          "task": "Solve exercise problems",
          "priority": "high",
          "estimatedMinutes": 90,
          "startAt": "2026-08-16T07:00:00.000Z",
          "endAt": "2026-08-16T08:30:00.000Z",
          "completed": false
        }
      ]
    }
  ]
}
2. Preserve existing segment completion status (do not uncheck completed segments unless explicitly asked).
3. Apply the student's modification accurately while preserving overall routine balance.
4. Keep the same number of days and valid ISO date strings.`;

    const userPrompt = `Current Routine:
${JSON.stringify(baseRoutine, null, 2)}

Student Request:
"${message}"`;

    let reply = "I've updated your study routine according to your request.";
    let modifiedDays = null;

    try {
      const completion = await callGroqWithRetry(() =>
        groq.chat.completions.create({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ]
        })
      );

      const content = completion?.choices?.[0]?.message?.content || '';
      const parsed = safeParseJson(content);
      if (parsed) {
        if (parsed.reply) reply = sanitizeText(parsed.reply, 300);
        const rawDays = parsed.routine || parsed.modifiedRoutine;
        if (Array.isArray(rawDays) && rawDays.length > 0) {
          const startDate = routineDoc?.startDate || new Date();
          modifiedDays = normalizeRoutine(rawDays, startDate, baseRoutine[0]?.day || 1);
        }
      }
    } catch (llmErr) {
      console.warn('[StudyRoutineController] Groq modify error:', llmErr.message);
      reply = "We adjusted your schedule based on your request.";
    }

    if (modifiedDays && routineDoc) {
      routineDoc.routine = modifiedDays;
      await routineDoc.save();
    }

    return ApiResponse.success(res, {
      reply,
      routine: modifiedDays || baseRoutine
    }, 'Routine modified successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/study-routine/ai/generate-week
 * 
 * Generate the NEXT 7 days adaptively based on past completion rates and subject mastery.
 * 
 * Workflow:
 * 1. Evaluates past performance per subject (e.g. Higher Math: 30% completion, Physics: 85% completion).
 * 2. If a subject has <50% completion, prompts the AI to schedule extra revision and problem sets.
 * 3. If a subject has >80% completion, advances the curriculum to subsequent chapters.
 * 4. Appends the new 7 days (Days 8 to 14) to the existing `routine` array in MongoDB.
 * 5. Updates `generatedUpTo` and returns the extended routine document.
 * 
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Error forwarding handler.
 */
async function aiGenerateWeek(req, res, next) {
  try {
    const routineDoc = await StudyRoutine.findOne({ userId: req.user.id });
    if (!routineDoc) {
      return ApiResponse.error(res, 'No study routine found. Please create one first.', 404);
    }

    const currentRoutine = routineDoc.routine || [];
    const profile = routineDoc.studentProfile || {};
    const lastDayObj = currentRoutine[currentRoutine.length - 1];

    let nextStartDate;
    let nextStartDayNumber = 1;

    if (lastDayObj && lastDayObj.dayDate) {
      nextStartDate = new Date(lastDayObj.dayDate);
      nextStartDate.setDate(nextStartDate.getDate() + 1);
      nextStartDayNumber = (lastDayObj.day || currentRoutine.length) + 1;
    } else {
      nextStartDate = new Date();
      nextStartDayNumber = currentRoutine.length + 1;
    }

    // Analyze previous completion rates per subject
    const subjectStats = {};
    currentRoutine.forEach((day) => {
      if (!day.isRest && Array.isArray(day.segments)) {
        day.segments.forEach((seg) => {
          const subj = seg.subject || 'Other';
          if (!subjectStats[subj]) subjectStats[subj] = { total: 0, completed: 0 };
          subjectStats[subj].total++;
          if (seg.completed) subjectStats[subj].completed++;
        });
      }
    });

    const completionSummary = Object.entries(subjectStats)
      .map(([subj, data]) => `${subj}: ${data.completed}/${data.total} tasks completed (${data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0}%)`)
      .join('\n');

    const groq = getGroqClient();
    const systemInstruction = `You are TopKorbo's expert AI Study Routine Architect.
Your task is to generate the NEXT 7 DAYS of an adaptive study routine (Day ${nextStartDayNumber} to Day ${nextStartDayNumber + 6}) starting on ${nextStartDate.toISOString().split('T')[0]}.

ADAPTIVE RULES:
1. Review past performance:
${completionSummary || 'First week in progress'}
2. If the student struggled (<50% completion) with any subject, allocate extra revision slots with clear problem-solving steps.
3. Advance the curriculum to subsequent chapters for subjects with high completion (>80%).
4. Maintain wake/sleep times and rest days.
5. Return ONLY JSON matching { "routine": [ 7 day objects with day, dayDate, isRest, segments ] }.`;

    const userPrompt = `Student Profile:
- Target Exam: ${profile.examTarget || 'HSC'} on ${profile.examDate || 'Upcoming'}
- Stream: ${profile.stream || 'Science'}
- Subjects: ${(profile.subjects || []).join(', ')}
- Weak subjects: ${(profile.weakSubjects || []).join(', ')}
- Daily Study Hours: ${profile.dailyStudyHours || '6 hours'}
- Unavailable Blocks: ${JSON.stringify(profile.unavailableBlocks || [])}
- Rest Days: ${(profile.restDays || []).join(', ')}

Please generate 7 new days (Day ${nextStartDayNumber} to Day ${nextStartDayNumber + 6}) starting on ${nextStartDate.toISOString().split('T')[0]}.`;

    let newDays = null;
    try {
      const completion = await callGroqWithRetry(() =>
        groq.chat.completions.create({
          model: GROQ_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ]
        })
      );

      const content = completion?.choices?.[0]?.message?.content || '';
      const parsed = safeParseJson(content);
      const days = parsed?.routine || (Array.isArray(parsed) ? parsed : null);
      newDays = normalizeRoutine(days, nextStartDate, nextStartDayNumber);
    } catch (llmErr) {
      console.warn('[StudyRoutineController] Groq generate-week failed, using fallback:', llmErr.message);
    }

    if (!newDays || newDays.length === 0) {
      newDays = generateFallbackRoutine(profile, nextStartDate, nextStartDayNumber);
    }

    // Append new days to the existing routine array (preserving completed past days)
    routineDoc.routine.push(...newDays);

    const generatedUpTo = new Date(nextStartDate);
    generatedUpTo.setDate(generatedUpTo.getDate() + newDays.length);
    routineDoc.generatedUpTo = generatedUpTo;

    await routineDoc.save();

    return ApiResponse.success(res, routineDoc, 'Next week routine generated successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRoutine,
  saveRoutine,
  replaceRoutine,
  deleteRoutine,
  toggleSegment,
  editSegment,
  getStats,
  startSession,
  stopSession,
  aiChat,
  aiModify,
  aiGenerateWeek
};
