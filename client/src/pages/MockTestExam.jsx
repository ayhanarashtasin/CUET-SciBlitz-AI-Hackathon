import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../hooks/useLanguage";
import useSocket from "../hooks/useSocket";
import {
  HiArrowLeft,
  HiBookmark,
  HiCheckCircle,
  HiChevronDown,
  HiX,
  HiClock,
  HiEye,
  HiCamera,
  HiPaperAirplane,
  HiPaperClip,
} from "react-icons/hi";
import katex from "katex";
import "katex/dist/katex.min.css";
import { sanitizeHtml } from "../utils/safeHtml";
import Confetti from "react-confetti";
import toast from "react-hot-toast";
import { createMockTestAttempt } from "../services/mockTestApi";
import { buildAttemptPayload, submitAttempt as savePracticeAttempt } from "../services/practiceApi";
import { submitAnswer as submitContestAnswer } from "../services/contestApi";
import ProctorPipCamera from "../components/proctor/ProctorPipCamera";
import "./MockTestExam.css";

// ── Contest anti-cheat tuning ────────────────────────────────────────────────
// How many tab switches / focus losses a student is merely WARNED about. The
// contest only ends on the one after that, i.e. the 3rd switch when this is 2.
const MAX_TAB_SWITCH_WARNINGS = 2;
// One real tab switch fires BOTH `blur` and `visibilitychange`, and alt-tabbing
// back can fire another pair. Collapse everything inside this window into a
// single counted violation, otherwise "2 allowed" silently becomes "1 allowed".
const TAB_SWITCH_DEDUPE_MS = 1500;
// The browser's camera-permission prompt takes focus away from the page, which
// looks exactly like a tab switch. Suppress detection for the whole permission
// phase plus this settle window after it ends (focus returns a beat late).
const PROCTOR_PERMISSION_GRACE_MS = 2500;
// Ceiling on that suppression so a student cannot park an unanswered permission
// prompt on screen and then alt-tab freely for the whole exam.
const PROCTOR_GRACE_CEILING_MS = 60000;
// Proctor statuses during which the camera permission prompt may be on screen.
const PROCTOR_PERMISSION_STATUSES = new Set(["idle", "requesting_camera"]);

// ── Tab-switch counter storage ───────────────────────────────────────────────
// Keyed PER CONTEST and kept in localStorage, not sessionStorage, because the
// count has to outlive everything a student can do short of finishing the
// attempt: leaving the exam back to /contests and re-joining, reloading, or
// reopening the contest in a fresh tab. A per-contest key also means starting a
// DIFFERENT contest naturally begins at zero without clearing anything.
const TAB_SWITCH_KEY_PREFIX = "topkorbo_tab_switches:";
// Abandoned attempts would otherwise leave their key behind forever.
const TAB_SWITCH_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

function readTabSwitchCount(contestId) {
  if (!contestId) return 0;
  try {
    const raw = localStorage.getItem(TAB_SWITCH_KEY_PREFIX + contestId);
    if (!raw) return 0;
    const record = JSON.parse(raw);
    if (!record || typeof record.count !== "number") return 0;
    if (Date.now() - (record.updatedAt || 0) > TAB_SWITCH_RECORD_TTL_MS) {
      localStorage.removeItem(TAB_SWITCH_KEY_PREFIX + contestId);
      return 0;
    }
    return record.count;
  } catch {
    return 0;
  }
}

function writeTabSwitchCount(contestId, count) {
  if (!contestId) return;
  try {
    localStorage.setItem(
      TAB_SWITCH_KEY_PREFIX + contestId,
      JSON.stringify({ count, updatedAt: Date.now() })
    );
  } catch {
    // Storage full or blocked — the in-memory ref still enforces the limit for
    // this session, so keep going rather than breaking the exam.
  }
}

// Called only when an attempt genuinely ends (submitted, auto-submitted, or
// disqualified) — never on contest entry, which is what let a student reset
// their used warnings just by leaving and re-joining.
function clearTabSwitchCount(contestId) {
  if (!contestId) return;
  try {
    localStorage.removeItem(TAB_SWITCH_KEY_PREFIX + contestId);
  } catch {
    // Ignore — nothing depends on the removal succeeding.
  }
}

// One-time sweep of records left behind by abandoned attempts.
function pruneTabSwitchRecords() {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(TAB_SWITCH_KEY_PREFIX)) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key));
        if (Date.now() - (record?.updatedAt || 0) > TAB_SWITCH_RECORD_TTL_MS) stale.push(key);
      } catch {
        stale.push(key); // Unparseable — drop it.
      }
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore — pruning is housekeeping, never required for correctness.
  }
}

// The contest id is needed before `config` state has hydrated, so read it
// straight from the persisted config the contest page wrote.
function readStoredContestId() {
  try {
    const raw = sessionStorage.getItem("mock_exam_config");
    return raw ? JSON.parse(raw)?.contestId || null : null;
  } catch {
    return null;
  }
}

// ── Abbreviation Maps ───────────────────────────────────────────────────────
// Used to render compact source tags on questions (e.g., "DB-24" for Dhaka Board 2024).
// These mirror the server-side tag schema for board/college/university sources.

const BOARD_ABBRS = {
  Dhaka: "DB",
  Comilla: "CB",
  Rajshahi: "RB",
  Jessore: "JB",
  Chittagong: "CtgB",
  Sylhet: "SB",
  Barishal: "BB",
  Dinajpur: "DjB",
  Mymensingh: "MB",
  Madrasa: "MadB",
  Technical: "TB",
};

const UNIV_ABBRS = {
  "Dhaka University": "DU",
  "Chittagong University": "CU",
  "Rajshahi University": "RU",
  "Jahangirnagar University": "JU",
  "Agriculture (Cluster)": "AGRI",
  "GST (Cluster)": "GST",
  "CKRUET (Cluster)": "CKRUET",
  "IBA (DU)": "IBA",
};

const COLLEGE_ABBRS = {
  "Notre Dame College": "NDC",
  "Adamjee Cantonment College": "ACC",
  "Rajuk Uttara Model College": "RUMC",
  "Holy Cross College": "HCC",
  "Viqarunnisa Noon School & College": "VNSC",
  "Dhaka Residential Model College": "DRMC",
  "Dhaka College": "DC",
  "Birshreshtha Noor Mohammad Public College": "BNMPC",
  "BAF Shaheen College Dhaka": "BSCD",
  "St. Joseph Higher Secondary School": "SJHSS",
  "Abdul Kadir Mollah City College": "AKCC",
  "Government Hazi Mohammad Mohsin College": "GHMMC",
  "Chittagong College": "ChC",
  "Rajshahi College": "RC",
  "Government Azizul Haque College": "GAHC",
  "Ananda Mohan College": "AMC",
  "Cumilla Victoria Government College": "CVGC",
  "Government Brojomohun College": "GBC",
  "MC College": "MCC",
  "Government Edward College": "GEC",
};

const autoCollegeAbbr = (name) => {
  if (!name) return "";
  const skip = new Set(["and", "&", "of", "the", "al"]);
  return name
    .split(/[\s.]+/)
    .filter((w) => w.length > 0 && !skip.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
};

const formatSessionYear = (year) => {
  if (!year) return "";
  const yearStr = String(year).trim();
  if (yearStr.includes("-")) {
    const parts = yearStr.split("-");
    const y1 = parts[0].trim().slice(-2);
    const y2 = parts[1].trim().slice(-2);
    return `${y1}-${y2}`;
  }
  if (yearStr.includes("/")) {
    const parts = yearStr.split("/");
    const y1 = parts[0].trim().slice(-2);
    const y2 = parts[1].trim().slice(-2);
    return `${y1}-${y2}`;
  }
  return yearStr.slice(-2);
};

const getTagAbbreviation = (tag) => {
  if (!tag) return "";
  const yearStr = tag.year ? String(tag.year).slice(-2) : "";

  if (tag.category === "board") {
    const boardAbbr =
      BOARD_ABBRS[tag.board] ||
      (tag.board ? `${tag.board.charAt(0).toUpperCase()}B` : "");
    return yearStr ? `${boardAbbr}-${yearStr}` : boardAbbr;
  } else if (tag.category === "college") {
    const college = tag.college || "";
    const collegeAbbr = COLLEGE_ABBRS[college] || autoCollegeAbbr(college);
    return yearStr ? `${collegeAbbr}-${yearStr}` : collegeAbbr;
  } else {
    // admission / university
    const univ = tag.university || "";
    const univAbbr = UNIV_ABBRS[univ] || univ;
    const sessionYear = formatSessionYear(tag.year);
    return sessionYear ? `${univAbbr} · ${sessionYear}` : univAbbr;
  }
};

const getTagTitle = (tag) => {
  if (!tag) return "";
  if (tag.category === "board") {
    return `${tag.board} Board${tag.year ? ` - ${tag.year}` : ""}`;
  } else if (tag.category === "college") {
    return `${tag.college}${tag.year ? ` - ${tag.year}` : ""}`;
  } else {
    return `${tag.university}${tag.unit ? ` (${tag.unit})` : ""}${tag.year ? ` - ${tag.year}` : ""}`;
  }
};

/**
 * MockTestExam – The main exam interface for mock tests, QBank exams, and contests.
 *
 * Features:
 *   - Countdown timer with auto-submit on expiry
 *   - Question navigation with colored dots (answered/not/flagged)
 *   - MCQ option selection with instant visual feedback
 *   - Written/CQ answer upload via camera capture or file upload
 *   - KaTeX math rendering in question text
 *   - Review mode with answer filtering and AI evaluation display
 *   - AI explanation modal (manual solution, AI explanation, tutor chat, video)
 *   - Contest anti-cheat: tab switch/blur/screenshot detection
 *   - Real-time contest leaderboard via Socket.IO
 *
 * All exam state is persisted to sessionStorage for crash recovery.
 * The timer stores an end timestamp (not a countdown) so it survives page refreshes.
 */
export default function MockTestExam() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  // ── Core Exam State ────────────────────────────────────────────────────────
  // questions/config come from sessionStorage (set by MockTest.jsx wizard).
  // answers tracks the current selection per question key.
  // writtenAnswers stores base64 image data for handwritten CQ/written answers.
  const [questions, setQuestions] = useState([]);
  const [config, setConfig] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [attemptRanking, setAttemptRanking] = useState(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [explanationModalQuestion, setExplanationModalQuestion] =
    useState(null);
  const [explanationTab, setExplanationTab] = useState("manual");
  const [filterType, setFilterType] = useState("all");
  const [fromQbank, setFromQbank] = useState(false);
  const [writtenAnswers, setWrittenAnswers] = useState({});
  const [aiEvaluations, setAiEvaluations] = useState({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [activeCameraQuestionKey, setActiveCameraQuestionKey] = useState(null);

  // ── AI Explanation State ───────────────────────────────────────────────────
  // aiExplanations stores the generated explanation text per question.
  // aiChatThreads stores the full chat history per question for the tutor feature.
  const [aiExplanations, setAiExplanations] = useState({});
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainImage, setAiExplainImage] = useState(null);
  const [aiChatThreads, setAiChatThreads] = useState({});
  const [followUpText, setFollowUpText] = useState("");
  const [followUpImage, setFollowUpImage] = useState(null);
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  // videoRef/streamRef: webcam stream management for camera capture
  // hasCheatedRef: prevents multiple disqualification submissions
  // lastMetaTimeRef: detects Windows+PrtScn screenshot combo
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const aiExplainFileRef = useRef(null);
  const followUpFileRef = useRef(null);
  const hasCheatedRef = useRef(false);
  const lastMetaTimeRef = useRef(0);

  // ── Tab-switch tolerance ───────────────────────────────────────────────────
  // Counted across reloads via sessionStorage so refreshing the page cannot
  // reset a student's used-up warnings mid-contest.
  const [tabSwitchCount, setTabSwitchCount] = useState(() =>
    readTabSwitchCount(readStoredContestId())
  );
  const tabSwitchCountRef = useRef(tabSwitchCount);

  // Drop records left behind by attempts that were never finished.
  useEffect(() => {
    pruneTabSwitchRecords();
  }, []);
  const lastTabSwitchAtRef = useRef(0);
  // Timestamp until which focus loss is attributed to the camera-permission
  // prompt rather than to cheating. Starts suppressed: the prompt is shown
  // within a few hundred ms of the exam screen mounting, and the proctor
  // reports its real status a tick later.
  const proctorGraceUntilRef = useRef(Number.POSITIVE_INFINITY);
  const proctorGraceCeilingRef = useRef(0);

  // ── Navigation State ───────────────────────────────────────────────────────
  // Tracks which question is active, which have been submitted (contest mode),
  // and which have been visited (for the colored-dot navigator).
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [submittedQuestionKeys, setSubmittedQuestionKeys] = useState({});
  const [visitedQuestionIndexes, setVisitedQuestionIndexes] = useState(new Set([0]));

  const { socket, connected, on, emit } = useSocket();
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    console.log("[Client Socket] Connection status:", connected, "Socket:", !!socket);
    if (!socket || !connected || !config?.contestId || config?.isPractice || isReviewMode) return;

    console.log("[Client Socket] Joining contest:", config.contestId);
    emit("join:contest", config.contestId);

    const offLeaderboard = on("contest:leaderboard", (data) => {
      console.log("[Client Socket] Received leaderboard:", data);
      setLeaderboard(data || []);
    });

    return () => {
      console.log("[Client Socket] Leaving contest:", config.contestId);
      emit("leave:contest", config.contestId);
      offLeaderboard && offLeaderboard();
    };
  }, [socket, connected, config?.contestId, isReviewMode, emit, on]);

  useEffect(() => {
    const storedQuestions = sessionStorage.getItem("mock_exam_questions");
    const storedConfig = sessionStorage.getItem("mock_exam_config");
    const storedFromQbank =
      sessionStorage.getItem("mock_exam_from_qbank") === "true";

    let isContest = false;
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        if (parsed.contestId) isContest = true;
      } catch (_) { }
    }

    if (!storedQuestions || !storedConfig) {
      navigate(isContest ? "/contests" : storedFromQbank ? "/qbank" : "/mock-test");
      return;
    }

    try {
      const parsedQuestions = JSON.parse(storedQuestions);
      const parsedConfig = JSON.parse(storedConfig);
      setQuestions(parsedQuestions);
      setConfig(parsedConfig);
      setFromQbank(storedFromQbank);

      const savedAnswers = sessionStorage.getItem("mock_exam_answers");
      if (savedAnswers) {
        try {
          setAnswers(JSON.parse(savedAnswers));
        } catch (_) { }
      }

      const savedWrittenAnswers = sessionStorage.getItem(
        "mock_exam_written_answers",
      );
      if (savedWrittenAnswers) {
        try {
          setWrittenAnswers(JSON.parse(savedWrittenAnswers));
        } catch (_) { }
      }

      const savedAiEvals = sessionStorage.getItem("mock_exam_ai_evals");
      if (savedAiEvals) {
        try {
          setAiEvaluations(JSON.parse(savedAiEvals));
        } catch (_) { }
      }

      const wasSubmitted =
        sessionStorage.getItem("mock_exam_submitted") === "true";
      const wasReview =
        sessionStorage.getItem("mock_exam_review_mode") === "true";

      // ── Restore contest navigation state ─────────────────────────────────
      const savedSubmittedKeys = sessionStorage.getItem("mock_exam_submitted_keys");
      let parsedSubmittedKeys = {};
      if (savedSubmittedKeys) {
        try {
          parsedSubmittedKeys = JSON.parse(savedSubmittedKeys);
          setSubmittedQuestionKeys(parsedSubmittedKeys);
        } catch (_) { }
      }
      const savedVisitedIndexes = sessionStorage.getItem("mock_exam_visited_indexes");
      if (savedVisitedIndexes) {
        try {
          setVisitedQuestionIndexes(new Set(JSON.parse(savedVisitedIndexes)));
        } catch (_) { }
      }
      const savedActiveIdx = sessionStorage.getItem("mock_exam_active_idx");
      if (savedActiveIdx) {
        let restoredIdx = parseInt(savedActiveIdx, 10);
        if (parsedConfig?.contestId && !wasReview) {
          const key = parsedQuestions[restoredIdx] ? (parsedQuestions[restoredIdx]._id || `question-${restoredIdx}`) : `question-${restoredIdx}`;
          if (parsedSubmittedKeys[key]) {
            const firstUnsubmitted = parsedQuestions.findIndex((q, idx) => {
              const k = q._id || `question-${idx}`;
              return !parsedSubmittedKeys[k];
            });
            if (firstUnsubmitted !== -1) {
              restoredIdx = firstUnsubmitted;
            }
          }
        }
        setActiveQuestionIndex(restoredIdx);
      } else if (parsedConfig?.contestId && !wasReview) {
        const firstUnsubmitted = parsedQuestions.findIndex((q, idx) => {
          const k = q._id || `question-${idx}`;
          return !parsedSubmittedKeys[k];
        });
        if (firstUnsubmitted !== -1) {
          setActiveQuestionIndex(firstUnsubmitted);
        }
      }

      if (wasSubmitted) {
        setIsSubmitted(true);
        setIsReviewMode(true);
        const savedTimeLeft = sessionStorage.getItem("mock_exam_time_left");
        setTimeLeft(savedTimeLeft ? parseInt(savedTimeLeft, 10) : 0);
        return;
      }

      const savedEndTime = sessionStorage.getItem("mock_exam_end_time");
      if (savedEndTime) {
        const remaining = Math.round(
          (parseInt(savedEndTime, 10) - Date.now()) / 1000,
        );
        if (remaining <= 0) {
          setTimeLeft(0);
          setIsSubmitted(true);
          setIsReviewMode(true);
          sessionStorage.setItem("mock_exam_submitted", "true");
          sessionStorage.setItem("mock_exam_review_mode", "true");
          sessionStorage.setItem("mock_exam_time_left", "0");
        } else {
          setTimeLeft(remaining);
        }
      } else {
        const endTime = Date.now() + parsedConfig.duration * 60 * 1000;
        sessionStorage.setItem("mock_exam_end_time", endTime.toString());
        setTimeLeft(parsedConfig.duration * 60);
      }
    } catch (e) {
      console.error("Failed to parse exam data", e);
      navigate(isContest ? "/contests" : storedFromQbank ? "/qbank" : "/mock-test");
    }
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sessionStorage.setItem("mock_exam_answers", JSON.stringify(answers));
    }
  }, [answers]);

  // ── Persist contest navigation state on changes ─────────────────────────
  useEffect(() => {
    sessionStorage.setItem("mock_exam_submitted_keys", JSON.stringify(submittedQuestionKeys));
  }, [submittedQuestionKeys]);

  useEffect(() => {
    sessionStorage.setItem("mock_exam_visited_indexes", JSON.stringify(Array.from(visitedQuestionIndexes)));
  }, [visitedQuestionIndexes]);

  useEffect(() => {
    sessionStorage.setItem("mock_exam_active_idx", String(activeQuestionIndex));
  }, [activeQuestionIndex]);

  const isContestActive = !!(config?.contestId && !config?.isPractice && !isReviewMode && !isSubmitted);

  // The AI proctor tells us when the camera-permission prompt is on screen.
  // That prompt takes focus away from the page, which is indistinguishable from
  // a tab switch — and used to end the contest the instant a student entered it.
  // While the proctor is in a permission state we suppress focus-loss detection
  // entirely, then keep it suppressed for a short settle window afterwards.
  const handleProctorStatusChange = useCallback((nextStatus) => {
    const now = Date.now();
    if (PROCTOR_PERMISSION_STATUSES.has(nextStatus)) {
      proctorGraceUntilRef.current = Number.POSITIVE_INFINITY;
      if (!proctorGraceCeilingRef.current) {
        proctorGraceCeilingRef.current = now + PROCTOR_GRACE_CEILING_MS;
      }
    } else {
      // Camera settled (active / camera_ready / camera_only) or failed (error).
      // Focus is coming back to the page — give it a moment, then arm.
      proctorGraceUntilRef.current = now + PROCTOR_PERMISSION_GRACE_MS;
      proctorGraceCeilingRef.current = 0;
    }
  }, []);

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const submittedQuestionKeysRef = useRef(submittedQuestionKeys);
  useEffect(() => {
    submittedQuestionKeysRef.current = submittedQuestionKeys;
  }, [submittedQuestionKeys]);

  const submitDisqualification = async (reason) => {
    toast.error(
      language === "en"
        ? `Contest ended automatically due to cheating detection: ${reason}`
        : `কনটেস্টটি স্বয়ংক্রিয়ভাবে বন্ধ হয়ে গেছে: ${reason}`
    );

    try {
      const token = localStorage.getItem("topkorbo_token") || localStorage.getItem("token");
      const backendBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      await fetch(`${backendBaseUrl}/contests/${config.contestId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          score: 0,
          totalQuestions: questions.length,
          timeTakenSeconds: Math.max(0, (config?.duration || 0) * 60 - timeLeftRef.current),
          answersSubmitted: Object.keys(submittedQuestionKeysRef.current).length,
          answers: answersRef.current,
          isDisqualified: true,
          disqualificationReason: reason
        }),
      });
    } catch (err) {
      console.error("Error submitting disqualification:", err);
    }

    // Clean up session storage
    [
      "mock_test_step",
      "mock_test_subject_ids",
      "mock_test_chapters",
      "mock_test_selected_topics",
      "mock_exam_standard",
      "mock_question_type",
      "mock_total_questions",
      "mock_exam_duration",
      "mock_negative_marking",
      "mock_exam_questions",
      "mock_exam_config",
      "mock_exam_from_qbank",
      "mock_exam_answers",
      "mock_exam_end_time",
      "mock_exam_submitted",
      "mock_exam_review_mode",
      "mock_exam_time_left",
      "mock_exam_written_answers",
      "mock_exam_ai_evals",
      "mock_exam_submitted_keys",
      "mock_exam_visited_indexes",
      "mock_exam_active_idx",
    ].forEach((key) => sessionStorage.removeItem(key));
    // The attempt is over, so its tab-switch allowance can be released.
    clearTabSwitchCount(config?.contestId);

    navigate("/contests");
  };

  // ── Contest Anti-Cheat ─────────────────────────────────────────────────────
  // Detects tab switching, window blur, screenshots, and print attempts.
  // On violation, automatically submits the contest with score 0 and redirects.
  useEffect(() => {
    if (!isContestActive) return;

    // Arm the ceiling on the camera-permission grace period the moment the
    // contest goes live, so the grace can never outlive the prompt itself.
    if (!proctorGraceCeilingRef.current) {
      proctorGraceCeilingRef.current = Date.now() + PROCTOR_GRACE_CEILING_MS;
    }

    const handleViolation = (reason) => {
      if (hasCheatedRef.current) return;
      hasCheatedRef.current = true;
      submitDisqualification(reason);
    };

    // True while the camera-permission prompt is (or may still be) stealing
    // focus from the page. Focus loss in that window is the browser's doing,
    // not the student's, so it must never count as a tab switch.
    const isInProctorGrace = () => {
      const now = Date.now();
      if (proctorGraceCeilingRef.current && now > proctorGraceCeilingRef.current) {
        return false;
      }
      return now < proctorGraceUntilRef.current;
    };

    // A tab switch is warned about MAX_TAB_SWITCH_WARNINGS times and only ends
    // the contest on the one after that.
    const registerTabSwitch = (reason) => {
      if (hasCheatedRef.current) return;
      if (isInProctorGrace()) return;

      const now = Date.now();
      // One real tab switch fires both `blur` and `visibilitychange`; collapse
      // them so a single switch costs a single warning.
      if (now - lastTabSwitchAtRef.current < TAB_SWITCH_DEDUPE_MS) return;
      lastTabSwitchAtRef.current = now;

      // Read the persisted value rather than trusting the in-memory ref: the
      // student may have left the exam and re-joined since the last switch, in
      // which case this component remounted with a fresh ref.
      const contestId = config?.contestId;
      const count = Math.max(readTabSwitchCount(contestId), tabSwitchCountRef.current) + 1;
      tabSwitchCountRef.current = count;
      setTabSwitchCount(count);
      writeTabSwitchCount(contestId, count);

      if (count > MAX_TAB_SWITCH_WARNINGS) {
        handleViolation(
          language === "en"
            ? `${reason} (${count} times — limit is ${MAX_TAB_SWITCH_WARNINGS})`
            : `${reason} (${count} বার — সর্বোচ্চ ${MAX_TAB_SWITCH_WARNINGS} বার অনুমোদিত)`
        );
        return;
      }

      const remaining = MAX_TAB_SWITCH_WARNINGS - count;
      toast.error(
        language === "en"
          ? `Warning ${count}/${MAX_TAB_SWITCH_WARNINGS}: ${reason}. ${
              remaining === 0
                ? "Switching away once more will end your contest."
                : `You may switch away ${remaining} more time before the contest ends.`
            }`
          : `সতর্কতা ${count}/${MAX_TAB_SWITCH_WARNINGS}: ${reason}। ${
              remaining === 0
                ? "আর একবার ট্যাব পরিবর্তন করলে কনটেস্ট শেষ হয়ে যাবে।"
                : `কনটেস্ট শেষ হওয়ার আগে আপনি আর ${remaining} বার ট্যাব পরিবর্তন করতে পারবেন।`
            }`,
        { duration: 6000, icon: "⚠️" }
      );
    };

    // Window lost focus (tab switch, alt-tab, minimization)
    const handleBlur = () => {
      registerTabSwitch(
        language === "en"
          ? "Window lost focus / minimised / tab changed"
          : "উইন্ডো ফোকাস হারিয়েছে / মিনিমাইজ করা হয়েছে / ট্যাব পরিবর্তন করা হয়েছে"
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        registerTabSwitch(
          language === "en"
            ? "Tab switched or window minimised"
            : "ট্যাব পরিবর্তন করা হয়েছে বা উইন্ডো মিনিমাইজ করা হয়েছে"
        );
      }
    };

    // Screenshot Keydown / Print Screen Detection
    const handleKeyDown = (e) => {
      const isPrtScn = e.key === "PrintScreen" || e.key === "PrtScn" || e.key === "Snapshot" || e.keyCode === 44;
      const isMeta = e.key === "Meta" || e.keyCode === 91 || e.keyCode === 92;

      if (isMeta) {
        lastMetaTimeRef.current = Date.now();
      }

      if (isPrtScn) {
        e.preventDefault();
        handleViolation(
          language === "en"
            ? "PrintScreen / Screenshot attempt detected"
            : "স্ক্রিনশট নেওয়ার চেষ্টা সনাক্ত করা হয়েছে"
        );
      }

      // Check if PrtScn was typed right after Windows key (within 2 seconds)
      if (isPrtScn && (Date.now() - lastMetaTimeRef.current < 2000)) {
        handleViolation(
          language === "en"
            ? "Screenshot attempt detected (Windows + PrtScn)"
            : "স্ক্রিনশট নেওয়ার চেষ্টা সনাক্ত করা হয়েছে (Windows + PrtScn)"
        );
      }

      // Windows Snipping Tool: Meta + Shift + S
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "s") {
        handleViolation(
          language === "en"
            ? "Screenshot attempt detected (Meta + Shift + S)"
            : "স্ক্রিনশট নেওয়ার চেষ্টা সনাক্ত করা হয়েছে (Meta + Shift + S)"
        );
      }

      // Print: Ctrl + P or Cmd + P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handleViolation(
          language === "en"
            ? "Print attempt detected"
            : "প্রিন্ট করার চেষ্টা সনাক্ত করা হয়েছে"
        );
      }
    };

    const handleKeyUp = (e) => {
      const isPrtScn = e.key === "PrintScreen" || e.key === "PrtScn" || e.key === "Snapshot" || e.keyCode === 44;

      if (isPrtScn) {
        handleViolation(
          language === "en"
            ? "PrintScreen / Screenshot attempt detected (keyup)"
            : "স্ক্রিনশট নেওয়ার চেষ্টা সনাক্ত করা হয়েছে (keyup)"
        );
      }

      if (isPrtScn && (Date.now() - lastMetaTimeRef.current < 2000)) {
        handleViolation(
          language === "en"
            ? "Screenshot attempt detected (Windows + PrtScn)"
            : "স্ক্রিনশট নেওয়ার চেষ্টা সনাক্ত করা হয়েছে (Windows + PrtScn)"
        );
      }
    };

    // Prevent copying question text during contests
    const preventCopy = (e) => {
      e.preventDefault();
      toast.error(
        language === "en"
          ? "Copying questions is disabled during the contest!"
          : "কনটেস্ট চলাকালীন প্রশ্ন কপি করা যাবে না!"
      );
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
    };

    // Attach listeners
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("selectstart", preventCopy);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("selectstart", preventCopy);
    };
  }, [isContestActive, language, config, questions]);

  const getQuestionKey = (question, index) =>
    question._id || `question-${index}`;

  // Finds the next question that hasn't been submitted yet (for contest mode).
  // Searches forward first, then wraps around to the beginning.
  const findNextUnsubmittedIndex = (currentIndex, currentSubmittedKeys) => {
    // 1. Search forward from currentIndex + 1
    for (let i = currentIndex + 1; i < questions.length; i++) {
      const key = getQuestionKey(questions[i], i);
      if (!currentSubmittedKeys[key]) {
        return i;
      }
    }
    // 2. Search backward from 0 to currentIndex - 1
    for (let i = 0; i < currentIndex; i++) {
      const key = getQuestionKey(questions[i], i);
      if (!currentSubmittedKeys[key]) {
        return i;
      }
    }
    return -1;
  };

  const findPrevUnsubmittedIndex = (currentIndex, currentSubmittedKeys) => {
    // 1. Search backward from currentIndex - 1 to 0
    for (let i = currentIndex - 1; i >= 0; i--) {
      const key = getQuestionKey(questions[i], i);
      if (!currentSubmittedKeys[key]) {
        return i;
      }
    }
    // 2. Search backward from questions.length - 1 to currentIndex + 1
    for (let i = questions.length - 1; i > currentIndex; i--) {
      const key = getQuestionKey(questions[i], i);
      if (!currentSubmittedKeys[key]) {
        return i;
      }
    }
    return -1;
  };

  const getCorrectOptionIndex = (question) => {
    if (!Array.isArray(question.options)) return -1;
    return question.options.findIndex((option) => option.isCorrect);
  };

  // ── Result Computation ─────────────────────────────────────────────────────
  // Computes score, correct/wrong/skipped counts from the answers map.
  // For MCQ: +1 for correct, -0.25 for wrong (if negative marking), 0 for skipped.
  // For written/CQ: uses AI evaluation score (0-1) or 0 if not uploaded.
  const resultStats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    let score = 0;

    questions.forEach((question, index) => {
      const key = getQuestionKey(question, index);
      const selectedIndex = answers[key];
      const correctIndex = getCorrectOptionIndex(question);

      if (question.type === "mcq") {
        if (selectedIndex === undefined || selectedIndex === null) {
          skipped += 1;
          return;
        }

        if (selectedIndex === correctIndex) {
          correct += 1;
          score += 1;
        } else {
          wrong += 1;
          if (config?.negativeMarking) score -= 0.25;
        }
      } else if (question.type === "written" || question.type === "cq") {
        const isUploaded = !!writtenAnswers[key];
        const evalData = aiEvaluations[key];
        // Use actual marks (e.g. 8 out of 10) not ratio score (e.g. 0.8)
        const scoreVal = evalData ? (parseFloat(evalData.marks) || 0) : 0;

        if (isUploaded) {
          score += scoreVal;
          if (scoreVal > 0) {
            correct += 1;
          } else {
            wrong += 1;
          }
        } else {
          skipped += 1;
        }
      }
    });

    const writtenUploadedCount = Object.keys(writtenAnswers).length;

    return {
      correct,
      wrong,
      skipped,
      score: Math.max(0, score),
      total: questions.length,
      timeTakenSeconds: Math.max(0, (config?.duration || 0) * 60 - timeLeft),
      writtenUploadedCount,
    };
  }, [answers, config, questions, timeLeft, writtenAnswers, aiEvaluations]);

  // Groups results by subject for the analytics/ranking breakdown.
  // Returns [{ subject, correct, wrong, skipped, total, score }]
  const buildSubjectBreakdown = (evaluationMap = aiEvaluations) => {
    const subjectMap = new Map();

    questions.forEach((question, index) => {
      const key = getQuestionKey(question, index);
      const subject = question.subject || "Mixed";
      const current = subjectMap.get(subject) || {
        subject,
        correct: 0,
        wrong: 0,
        skipped: 0,
        total: 0,
        score: 0,
      };

      current.total += 1;

      if (question.type === "mcq") {
        const selectedIndex = answers[key];
        const correctIndex = getCorrectOptionIndex(question);

        if (selectedIndex === undefined || selectedIndex === null) {
          current.skipped += 1;
        } else if (selectedIndex === correctIndex) {
          current.correct += 1;
          current.score += 1;
        } else {
          current.wrong += 1;
          if (config?.negativeMarking) current.score -= 0.25;
        }
      } else {
        const isUploaded = !!writtenAnswers[key];
        // Use actual marks (e.g. 8) not ratio score (e.g. 0.8)
        const scoreVal = evaluationMap[key]
          ? parseFloat(evaluationMap[key].marks) || 0
          : 0;

        if (!isUploaded) {
          current.skipped += 1;
        } else if (scoreVal > 0) {
          current.correct += 1;
          current.score += scoreVal;
        } else {
          current.wrong += 1;
        }
      }

      subjectMap.set(subject, current);
    });

    return Array.from(subjectMap.values()).map((entry) => ({
      ...entry,
      score: Math.max(0, Math.round(entry.score * 100) / 100),
    }));
  };

  // ── Timer ──────────────────────────────────────────────────────────────────
  // Uses setInterval to count down every second. When timeLeft hits 0,
  // handleSubmit is called automatically. The timer stores an end timestamp
  // in sessionStorage so it survives page refreshes.
  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitted, timeLeft]);


  const handleContestQuestionBack = () => {
    const prevIdx = findPrevUnsubmittedIndex(activeQuestionIndex, submittedQuestionKeys);
    if (prevIdx !== -1) {
      setActiveQuestionIndex(prevIdx);
      setVisitedQuestionIndexes((prev) => {
        const next = new Set(prev);
        next.add(prevIdx);
        return next;
      });
    }
  };

  const handleContestQuestionSubmit = async (index) => {
    const key = getQuestionKey(questions[index], index);
    if (answers[key] === undefined) {
      toast.error(language === "en" ? "Please select an option first." : "দয়া করে প্রথমে একটি উত্তর নির্বাচন করুন।");
      return;
    }

    const updatedSubmittedKeys = { ...submittedQuestionKeys, [key]: true };
    setSubmittedQuestionKeys(updatedSubmittedKeys);

    const countSubmitted = Object.keys(updatedSubmittedKeys).length;

    // Live, point-based scoring: grade this single answer server-side. A correct
    // answer awards points (and locks the question); a wrong answer applies a
    // penalty. The leaderboard then updates in real time via socket.
    let liveAnswerResult;
    if (!config?.isPractice) {
      try {
        liveAnswerResult = await submitContestAnswer(config.contestId, key, answers[key]);
        if (liveAnswerResult?.correct) {
          toast.success(
            language === "en"
              ? `Correct! +${liveAnswerResult.pointsDelta} pts (total ${liveAnswerResult.livePoints})`
              : `সঠিক! +${liveAnswerResult.pointsDelta} (মোট ${liveAnswerResult.livePoints})`,
            { duration: 1800 }
          );
        } else {
          toast.error(
            language === "en"
              ? `Wrong — penalty applied (total ${liveAnswerResult?.livePoints ?? 0} pts)`
              : `ভুল — পেনাল্টি (মোট ${liveAnswerResult?.livePoints ?? 0})`,
            { duration: 1800 }
          );
        }
      } catch (err) {
        console.error("Error saving intermediate progress:", err);
      }
    } else {
      toast.success(language === "en" ? `Question ${index + 1} Saved!` : `প্রশ্ন ${index + 1} সেভ হয়েছে!`, { duration: 1500 });
    }

    // Check if ALL answers are now submitted
    if (countSubmitted === questions.length) {
      if (config?.isPractice) {
        handleSubmit();
      } else {
        // Clear session storage for this exam
        [
          "mock_test_step",
          "mock_test_subject_ids",
          "mock_test_chapters",
          "mock_test_selected_topics",
          "mock_exam_standard",
          "mock_question_type",
          "mock_total_questions",
          "mock_exam_duration",
          "mock_negative_marking",
          "mock_exam_questions",
          "mock_exam_config",
          "mock_exam_from_qbank",
          "mock_exam_answers",
          "mock_exam_end_time",
          "mock_exam_submitted",
          "mock_exam_review_mode",
          "mock_exam_time_left",
          "mock_exam_written_answers",
          "mock_exam_ai_evals",
          "mock_exam_submitted_keys",
          "mock_exam_visited_indexes",
          "mock_exam_active_idx",
        ].forEach((key) => sessionStorage.removeItem(key));
        // The attempt is over, so its tab-switch allowance can be released.
        clearTabSwitchCount(config?.contestId);

        // Redirect directly to /contests
        navigate("/contests");
      }
      return;
    }

    // Go to next unsubmitted question
    const nextUnsubmitted = findNextUnsubmittedIndex(index, updatedSubmittedKeys);
    if (nextUnsubmitted !== -1) {
      setActiveQuestionIndex(nextUnsubmitted);
      setVisitedQuestionIndexes((prev) => {
        const next = new Set(prev);
        next.add(nextUnsubmitted);
        return next;
      });
    }
  };

  const handleContestQuestionNext = (index) => {
    const nextUnsubmitted = findNextUnsubmittedIndex(index, submittedQuestionKeys);
    if (nextUnsubmitted !== -1) {
      setActiveQuestionIndex(nextUnsubmitted);
      setVisitedQuestionIndexes((prev) => {
        const next = new Set(prev);
        next.add(nextUnsubmitted);
        return next;
      });
    } else {
      toast.info(language === "en" ? "This is the last unsubmitted question." : "এটিই শেষ অসাবমিটকৃত প্রশ্ন।");
    }
  };

  // ── Submit Handler ─────────────────────────────────────────────────────────
  // Handles exam submission for both mock tests and contests.
  // Flow:
  //   1. Evaluate written answers via AI (if any)
  //   2. Save the attempt to practice history (POST /api/practice)
  //   3. Save to mock test attempts for ranking (POST /api/mock-tests/attempts)
  //   4. For contests: submit to contest endpoint and redirect
  //   5. For mock tests: show result modal, then allow review mode
  const handleSubmit = async () => {
    if (isSubmitted || isEvaluating) return;

    let latestEvals = aiEvaluations;
    const writtenKeys = Object.keys(writtenAnswers);
    if (writtenKeys.length > 0) {
      setIsEvaluating(true);
      try {
        const payload = writtenKeys.map((key) => ({
          questionId: key,
          studentImageBase64: writtenAnswers[key],
        }));
        const backendBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const res = await fetch(`${backendBaseUrl}/evaluate/written`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("topkorbo_token") || localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ answers: payload }),
        });
        if (res.ok) {
          const evalData = await res.json();
          latestEvals = evalData;
          setAiEvaluations(evalData);
          sessionStorage.setItem("mock_exam_ai_evals", JSON.stringify(evalData));
        }
      } catch (err) {
        console.error("AI Evaluation error", err);
      }
      setIsEvaluating(false);
    }

    try {
      const durationMinutes =
        (config && (config.duration || config.durationMinutes)) || 0;
      const endTimeStr = sessionStorage.getItem("mock_exam_end_time");
      const examStartedAt = endTimeStr
        ? Number(endTimeStr) - durationMinutes * 60 * 1000
        : Date.now();
      const mode = "mock_test";
      const title = (() => {
        const subs = Array.isArray(config?.subjects) && config.subjects.length
          ? config.subjects.join(", ")
          : "";
        const papers = Array.isArray(config?.papers) && config.papers.length
          ? ` (${config.papers.join(", ")})`
          : "";
        return `Mock Test${subs ? " · " + subs : ""}${papers} · ${questions.length} Q`;
      })();

      const attemptPayload = buildAttemptPayload({
        mode,
        title,
        contestId: config?.contestId || null,
        config,
        questions,
        answers,
        writtenAnswers,
        writtenEvaluations: latestEvals,
        startedAt: examStartedAt,
        durationMinutes,
        negativeMarking: !!config?.negativeMarking
      });

      await savePracticeAttempt(attemptPayload);
    } catch (err) {
      console.warn("[practice] failed to persist attempt:", err);
      const reason =
        err?.message ||
        err?.payload?.message ||
        (err?.status === 401 ? "Not signed in" : null) ||
        (err?.status === 0 ? "Server unreachable" : null) ||
        "Please retry from Practice History.";
      toast.error("Could not save attempt to history. " + reason);
    }

    try {
      const attempt = await createMockTestAttempt({
        config: {
          standards: Array.isArray(config?.standards) ? config.standards : [],
          questionType: config?.questionType || "",
          duration: config?.duration || 0,
          negativeMarking: !!config?.negativeMarking,
          totalQuestions: config?.totalQuestions || questions.length,
        },
        summary: {
          ...resultStats,
          timeTakenSeconds: Math.max(0, (config?.duration || 0) * 60 - timeLeft),
        },
        subjectBreakdown: buildSubjectBreakdown(latestEvals),
      });
      setAttemptRanking(attempt?.ranking || null);
    } catch (err) {
      console.error("Failed to save mock test attempt", err);
    }

    if (config?.contestId && !config?.isPractice) {
      let finalScore = 0;
      questions.forEach((question, index) => {
        const key = getQuestionKey(question, index);
        if (!submittedQuestionKeys[key]) return; // Only score submitted answers
        const selectedIndex = answers[key];
        const correctIndex = getCorrectOptionIndex(question);

        if (question.type === "mcq") {
          if (selectedIndex !== undefined && selectedIndex !== null) {
            if (selectedIndex === correctIndex) {
              finalScore += 1;
            } else {
              if (config?.negativeMarking) finalScore -= 0.25;
            }
          }
        } else if (question.type === "written" || question.type === "cq") {
          const isUploaded = !!writtenAnswers[key];
          const scoreVal = latestEvals[key] ? parseFloat(latestEvals[key].score) || 0 : 0;
          if (isUploaded) {
            finalScore += scoreVal;
          }
        }
      });
      finalScore = Math.max(0, finalScore);

      try {
        const token = localStorage.getItem("topkorbo_token") || localStorage.getItem("token");
        const backendBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        await fetch(`${backendBaseUrl}/contests/${config.contestId}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            score: finalScore,
            totalQuestions: questions.length,
            timeTakenSeconds: Math.max(0, (config?.duration || 0) * 60 - timeLeft),
            answersSubmitted: Object.keys(submittedQuestionKeys).length,
            answers: answers
          }),
        });
      } catch (err) {
        console.error("Error submitting contest result:", err);
      }

      // Clear session storage for this exam
      [
        "mock_test_step",
        "mock_test_subject_ids",
        "mock_test_chapters",
        "mock_test_selected_topics",
        "mock_exam_standard",
        "mock_question_type",
        "mock_total_questions",
        "mock_exam_duration",
        "mock_negative_marking",
        "mock_exam_questions",
        "mock_exam_config",
        "mock_exam_from_qbank",
        "mock_exam_answers",
        "mock_exam_end_time",
        "mock_exam_submitted",
        "mock_exam_review_mode",
        "mock_exam_time_left",
        "mock_exam_written_answers",
        "mock_exam_ai_evals",
        "mock_exam_submitted_keys",
        "mock_exam_visited_indexes",
        "mock_exam_active_idx",
      ].forEach((key) => sessionStorage.removeItem(key));
      // The attempt is over, so its tab-switch allowance can be released.
      clearTabSwitchCount(config?.contestId);

      navigate("/contests");
      return;
    }

    setIsSubmitted(true);
    setShowResultModal(true);
    sessionStorage.setItem("mock_exam_submitted", "true");
    sessionStorage.setItem("mock_exam_time_left", String(timeLeft));
  };

  const handleContinueToReview = () => {
    setShowResultModal(false);
    setIsReviewMode(true);
    sessionStorage.setItem("mock_exam_review_mode", "true");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStartAgain = () => {
    const isContest = !!config?.contestId;
    [
      "mock_test_step",
      "mock_test_subject_ids",
      "mock_test_chapters",
      "mock_test_selected_topics",
      "mock_exam_standard",
      "mock_question_type",
      "mock_total_questions",
      "mock_exam_duration",
      "mock_negative_marking",
      "mock_exam_questions",
      "mock_exam_config",
      "mock_exam_from_qbank",
      "mock_exam_answers",
      "mock_exam_end_time",
      "mock_exam_submitted",
      "mock_exam_review_mode",
      "mock_exam_time_left",
      "mock_exam_written_answers",
      "mock_exam_ai_evals",
    ].forEach((key) => sessionStorage.removeItem(key));
    // The attempt is over, so its tab-switch allowance can be released.
    clearTabSwitchCount(config?.contestId);
    navigate(isContest ? "/contests" : fromQbank ? "/qbank" : "/mock-test");
  };

  const handleOptionSelect = (questionId, optionIndex) => {
    if (isSubmitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  // Client-side image processing: resizes to max 800x800 and compresses to JPEG 0.7
  // to reduce base64 payload size before storing in sessionStorage.
  const processImageFile = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        callback(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleWrittenFileChange = (e, questionKey) => {
    const file = e.target.files[0];
    if (!file) return;

    processImageFile(file, (dataUrl) => {
      setWrittenAnswers((prev) => {
        const updated = { ...prev, [questionKey]: dataUrl };
        sessionStorage.setItem(
          "mock_exam_written_answers",
          JSON.stringify(updated),
        );
        return updated;
      });
    });
  };

  const handleRemoveWrittenFile = (questionKey) => {
    setWrittenAnswers((prev) => {
      const updated = { ...prev };
      delete updated[questionKey];
      sessionStorage.setItem(
        "mock_exam_written_answers",
        JSON.stringify(updated),
      );
      return updated;
    });
  };

  // ── Camera Capture ─────────────────────────────────────────────────────────
  // Activates the device camera (prefers back-facing for document capture),
  // captures a photo, resizes it, and stores as base64 in writtenAnswers.
  const startCamera = async (questionKey) => {
    setActiveCameraQuestionKey(questionKey);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch (envErr) {
        console.warn(
          "Could not access environment camera, trying fallback...",
          envErr,
        );
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert(
        language === "en"
          ? "Unable to access device camera. Please check permissions."
          : "ক্যামেরা অ্যাক্সেস করা যাচ্ছে না। দয়া করে পারমিশন চেক করুন।",
      );
      setActiveCameraQuestionKey(null);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setActiveCameraQuestionKey(null);
  };

  const capturePhoto = (questionKey) => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let finalWidth = width;
      let finalHeight = height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          finalHeight *= MAX_WIDTH / width;
          finalWidth = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          finalWidth *= MAX_HEIGHT / height;
          finalHeight = MAX_HEIGHT;
        }
      }

      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, finalWidth, finalHeight);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

      setWrittenAnswers((prev) => {
        const updated = { ...prev, [questionKey]: dataUrl };
        sessionStorage.setItem(
          "mock_exam_written_answers",
          JSON.stringify(updated),
        );
        return updated;
      });

      stopCamera();
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const toBnNum = (numStr) => {
    const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return String(numStr).replace(/\d/g, (d) => bnDigits[d]);
  };

  const formatDisplayNumber = (value) => {
    const normalized = Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(/\.?0+$/, "");
    return language === "en" ? normalized : toBnNum(normalized);
  };

  // ── Math Rendering ─────────────────────────────────────────────────────────
  // Converts $...$ (inline) and $$...$$ (display) LaTeX delimiters to HTML
  // using KaTeX. Non-math text is sanitized before HTML injection.
  const renderMath = (text) => {
    if (!text) return { __html: "" };

    const renderedText = text
      .replace(/\$\$([\s\S]+?)\$\$/g, (match, p1) => {
        try {
          return katex.renderToString(p1.trim(), {
            displayMode: true,
            throwOnError: false,
          });
        } catch (e) {
          return match;
        }
      })
      .replace(/\$([^\$]+)\$/g, (match, p1) => {
        try {
          return katex.renderToString(p1.trim(), {
            displayMode: false,
            throwOnError: false,
          });
        } catch (e) {
          return match;
        }
      });

    // Non-math text is interpolated raw, so sanitize before injecting as HTML.
    return { __html: sanitizeHtml(renderedText) };
  };

  // Renders Markdown with inline LaTeX math support.
  // Used for AI-generated explanations that contain both text formatting and math.
  // Process: extract math blocks → render markdown → restore math blocks → sanitize HTML
  const renderMarkdownWithMath = (text) => {
    if (!text) return { __html: "" };

    // Normalize double backslashes to single backslashes for LaTeX commands/symbols
    const normalizedText = text.replace(/\\\\([a-zA-Z\d_{}%])/g, '\\$1');

    const mathBlocks = [];

    // 1. Extract and render display math: $$...$$ and \[...\]
    let processed = normalizedText.replace(/\$\$([\s\S]+?)\$\$/g, (match, p1) => {
      try {
        const rendered = katex.renderToString(p1.trim(), {
          displayMode: true,
          throwOnError: false,
        });
        const index = mathBlocks.length;
        mathBlocks.push(rendered);
        return `%%MATH_BLOCK_${index}%%`;
      } catch (e) {
        return match;
      }
    });

    processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (match, p1) => {
      try {
        const rendered = katex.renderToString(p1.trim(), {
          displayMode: true,
          throwOnError: false,
        });
        const index = mathBlocks.length;
        mathBlocks.push(rendered);
        return `%%MATH_BLOCK_${index}%%`;
      } catch (e) {
        return match;
      }
    });

    // 2. Extract and render inline math: $...$ and \(...\)
    processed = processed.replace(/\$([^\$]+)\$/g, (match, p1) => {
      try {
        const rendered = katex.renderToString(p1.trim(), {
          displayMode: false,
          throwOnError: false,
        });
        const index = mathBlocks.length;
        mathBlocks.push(rendered);
        return `%%MATH_BLOCK_${index}%%`;
      } catch (e) {
        return match;
      }
    });

    processed = processed.replace(/\\\((.+?)\\\)/g, (match, p1) => {
      try {
        const rendered = katex.renderToString(p1.trim(), {
          displayMode: false,
          throwOnError: false,
        });
        const index = mathBlocks.length;
        mathBlocks.push(rendered);
        return `%%MATH_BLOCK_${index}%%`;
      } catch (e) {
        return match;
      }
    });

    processed = processed
      .replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:700;color:#4F46E5;margin:16px 0 6px;border-bottom:1px solid #E2E8F0;padding-bottom:4px;">$1</div>')
      .replace(/^## (.+)$/gm, '<div style="font-size:17px;font-weight:700;color:#1E293B;margin:20px 0 8px;border-bottom:2px solid #6366F1;padding-bottom:6px;">$1</div>')
      .replace(/^# (.+)$/gm, '<div style="font-size:19px;font-weight:800;color:#1E293B;margin:20px 0 10px;border-bottom:2px solid #6366F1;padding-bottom:6px;">$1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1E293B;">$1</strong>')
      .replace(/^(\d+)\.\s/gm, '<span style="display:inline-block;background:#6366F1;color:#FFF;font-weight:700;font-size:13px;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;margin-right:8px;">$1</span>')
      .replace(/^[-•]\s(.+)$/gm, '<div style="display:flex;align-items:flex-start;gap:8px;margin:4px 0;"><span style="color:#6366F1;font-weight:bold;margin-top:2px;">•</span><span>$1</span></div>')
      .replace(/\n\n/g, '<div style="margin:12px 0;"></div>')
      .replace(/\n/g, '<br/>');

    // 4. Restore the math blocks
    mathBlocks.forEach((renderedMath, index) => {
      processed = processed.replace(`%%MATH_BLOCK_${index}%%`, () => renderedMath);
    });

    // Markdown + interpolated text is built as a raw string, so sanitize it.
    return { __html: sanitizeHtml(processed) };
  };

  // Sends a follow-up message in the AI tutor chat.
  // Maintains the full conversation thread per question for context.
  const handleSendFollowUp = async () => {
    if (!explanationModalQuestion || isSendingFollowUp) return;
    const text = followUpText.trim();
    if (!text && !followUpImage) return;

    const qId = explanationModalQuestion._id;
    const currentThread = aiChatThreads[qId] || [];

    // 1. Construct the new user message
    const userMessage = {
      role: "user",
      content: text,
      image: followUpImage || undefined
    };

    setAiChatThreads(prev => ({
      ...prev,
      [qId]: [...currentThread, userMessage]
    }));

    setFollowUpText("");
    setFollowUpImage(null);
    setIsSendingFollowUp(true);

    try {
      const backendBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${backendBaseUrl}/evaluate/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("topkorbo_token") || localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          questionId: qId,
          history: currentThread,
          message: text,
          studentImageBase64: userMessage.image
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiChatThreads(prev => ({
          ...prev,
          [qId]: [
            ...(prev[qId] || []),
            { role: "assistant", content: data.response }
          ]
        }));
      } else {
        const errData = await res.json().catch(() => ({}));
        setAiChatThreads(prev => ({
          ...prev,
          [qId]: [
            ...(prev[qId] || []),
            { role: "assistant", content: `Error: ${errData.msg || "Failed to send message."}` }
          ]
        }));
      }
    } catch (err) {
      setAiChatThreads(prev => ({
        ...prev,
        [qId]: [
          ...(prev[qId] || []),
          { role: "assistant", content: `Network Error: ${err.message}` }
        ]
      }));
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  const getOptionPrefix = (index) => {
    if (language === "en") {
      return ["A", "B", "C", "D"][index] || "";
    }
    return ["ক", "খ", "গ", "ঘ"][index] || "";
  };

  // Returns the visual state of an MCQ option in review mode: 'correct' | 'wrong' | ''
  const getOptionState = (question, questionIndex, optionIndex) => {
    if (!isReviewMode) return "";
    const key = getQuestionKey(question, questionIndex);
    const selectedIndex = answers[key];
    const correctIndex = getCorrectOptionIndex(question);

    if (optionIndex === correctIndex) return "correct";
    if (optionIndex === selectedIndex && selectedIndex !== correctIndex)
      return "wrong";
    return "";
  };

  if (questions.length === 0 || !config) {
    return <div className="exam-loading">Loading...</div>;
  }

  const answeredCount = config?.contestId ? Object.keys(submittedQuestionKeys).length : Object.keys(answers).length;
  const totalCount = questions.length;
  const timeLabel =
    language === "en"
      ? `${Math.ceil(resultStats.timeTakenSeconds / 60)} min`
      : `${toBnNum(Math.ceil(resultStats.timeTakenSeconds / 60))} মিনিট`;

  return (
    <div
      className={`exam-room-container ${showResultModal ? "exam-room-container--dimmed" : ""} ${isContestActive ? "no-copy-select" : ""}`}
    >
      {/* AI Proctor: floating PiP camera for mobile phone detection during live contests */}
      <ProctorPipCamera
        contestId={config?.contestId}
        enabled={isContestActive}
        maxViolations={3}
        onStatusChange={handleProctorStatusChange}
        onViolation={(violation) => {
          toast.error(
            language === "en"
              ? `⚠️ Mobile phone detected (${violation.confidence ? Math.round(violation.confidence * 100) + '% confidence' : ''}). A screenshot has been sent to the proctor.`
              : `⚠️ মোবাইল ফোন শনাক্ত হয়েছে! একটি স্ক্রিনশট প্রক্টরের কাছে পাঠানো হয়েছে।`,
            { duration: 5000, icon: "🚨" }
          );
        }}
      />

      {/* Tab-switch allowance. Rendered from persisted state so a student who
          reloads still sees how many warnings they have already used. */}
      {isContestActive && tabSwitchCount > 0 && (
        <div
          className={`exam-tab-switch-meter ${
            tabSwitchCount >= MAX_TAB_SWITCH_WARNINGS ? "exam-tab-switch-meter--critical" : ""
          }`}
          role="status"
        >
          <span className="exam-tab-switch-meter__count">
            {tabSwitchCount}/{MAX_TAB_SWITCH_WARNINGS}
          </span>
          <span className="exam-tab-switch-meter__label">
            {language === "en"
              ? tabSwitchCount >= MAX_TAB_SWITCH_WARNINGS
                ? "Tab switches used — one more ends the contest"
                : "Tab switches used"
              : tabSwitchCount >= MAX_TAB_SWITCH_WARNINGS
                ? "ট্যাব পরিবর্তন — আর একবারেই কনটেস্ট শেষ"
                : "ট্যাব পরিবর্তন ব্যবহৃত"}
          </span>
        </div>
      )}

      <div className="exam-layout-wrapper">
        <div className="exam-main-content">
          <header
            className={`exam-header-card ${isReviewMode ? "exam-header-card--review" : ""}`}
          >
            {isReviewMode && (
              <button
                type="button"
                className="exam-back-btn"
                onClick={() => navigate(config?.contestId ? "/contests" : fromQbank ? "/qbank" : "/mock-test")}
              >
                <HiArrowLeft size={22} />
              </button>
            )}
            <h1 className="exam-title">
              {config?.contestId
                ? config.standard
                : fromQbank
                  ? language === "en"
                    ? "Question Bank Exam"
                    : "প্রশ্নব্যাংক পরীক্ষা"
                  : language === "en"
                    ? "Mock Test"
                    : "মক পরীক্ষা"}
            </h1>
            {fromQbank && config?.sourceLabel && (
              <p className="exam-source-label">{config.sourceLabel}</p>
            )}

            {isReviewMode ? (
              <>
                <div className="exam-report-cards">
                  <div className="exam-report-card exam-report-card--score">
                    <span>
                      {language === "en" ? "Points earned" : "পয়েন্ট পেয়েছো"}
                    </span>
                    <strong>★ {formatDisplayNumber(resultStats.score)}</strong>
                  </div>
                  <div className="exam-report-card exam-report-card--marks">
                    {questions.some((q) => q.type === "written") ? (
                      <>
                        <span>
                          {language === "en"
                            ? "Written Uploaded"
                            : "আপলোড করা উত্তর"}
                        </span>
                        <strong>
                          📁 {formatDisplayNumber(resultStats.writtenUploadedCount)}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span>{language === "en" ? "Marks" : "মার্কস"}</span>
                        <strong>
                          ● {formatDisplayNumber(resultStats.correct)} /{" "}
                          {formatDisplayNumber(resultStats.total)}
                        </strong>
                      </>
                    )}
                  </div>
                  <div className="exam-report-card exam-report-card--time">
                    <span>{language === "en" ? "Time taken" : "সময় নিয়েছো"}</span>
                    <strong>◉ {timeLabel}</strong>
                  </div>
                </div>
                <div className="exam-result-chips">
                  <button
                    type="button"
                    className={`exam-result-chip exam-result-chip--correct ${filterType === "correct" ? "exam-result-chip--active" : ""}`}
                    onClick={() =>
                      setFilterType((prev) =>
                        prev === "correct" ? "all" : "correct",
                      )
                    }
                  >
                    <i /> {formatDisplayNumber(resultStats.correct)}{" "}
                    {language === "en" ? "Correct" : "সঠিক"}
                  </button>
                  <button
                    type="button"
                    className={`exam-result-chip exam-result-chip--skipped ${filterType === "skipped" ? "exam-result-chip--active" : ""}`}
                    onClick={() =>
                      setFilterType((prev) =>
                        prev === "skipped" ? "all" : "skipped",
                      )
                    }
                  >
                    <i /> {formatDisplayNumber(resultStats.skipped)}{" "}
                    {language === "en" ? "Skipped" : "স্কিপ"}
                  </button>
                  <button
                    type="button"
                    className={`exam-result-chip exam-result-chip--wrong ${filterType === "wrong" ? "exam-result-chip--active" : ""}`}
                    onClick={() =>
                      setFilterType((prev) =>
                        prev === "wrong" ? "all" : "wrong",
                      )
                    }
                  >
                    <i /> {formatDisplayNumber(resultStats.wrong)}{" "}
                    {language === "en" ? "Wrong" : "ভুল"}
                  </button>
                </div>
                <button
                  type="button"
                  className="exam-start-again-btn"
                  onClick={handleStartAgain}
                >
                  {config?.contestId
                    ? language === "en"
                      ? "Back to Contests"
                      : "কনটেস্টে ফিরে যাও"
                    : fromQbank
                      ? language === "en"
                        ? "Back to Question Bank"
                        : "প্রশ্নব্যাংকে ফিরে যাও"
                      : language === "en"
                        ? "Back to Mock Test"
                        : "মক টেস্টে ফিরে যাও"}
                </button>
              </>
            ) : (
              <div className="exam-header-info">
                <div className="exam-header-badges">
                  <span className="exam-header-badge exam-header-badge--time">
                    <HiClock size={14} />
                    {language === "en"
                      ? `${config.duration} Minutes`
                      : `${toBnNum(config.duration)} মিনিট`}
                  </span>
                  <span className="exam-header-badge exam-header-badge--questions">
                    {language === "en"
                      ? `${totalCount} Questions`
                      : `${toBnNum(totalCount)} প্রশ্ন`}
                  </span>
                  <span className="exam-header-badge exam-header-badge--marks">
                    {language === "en"
                      ? "1 mark / question"
                      : "প্রতি প্রশ্নে ১ নম্বর"}
                  </span>
                  {config.negativeMarking && (
                    <span className="exam-header-badge exam-header-badge--warning">
                      {language === "en" ? "−0.25 for wrong answer" : "ভুলে −০.২৫"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </header>

          {config?.contestId && !isReviewMode && (
            <div className="exam-contest-navigation-box">
              <div className="exam-mini-boxes-title">
                {language === "en" ? "Contest Questions Navigator" : "কনটেস্ট প্রশ্ন নেভিগেটর"}
              </div>
              <div className="exam-mini-boxes-grid">
                {questions.map((q, idx) => {
                  const questionKey = getQuestionKey(q, idx);
                  const isSubmitted = !!submittedQuestionKeys[questionKey];
                  if (isSubmitted) return null;

                  const isCurrent = idx === activeQuestionIndex;
                  const isUnsubmitted = !isSubmitted && visitedQuestionIndexes.has(idx);

                  let boxClass = "mini-box--unvisited";
                  if (isCurrent) {
                    boxClass = "mini-box--active";
                  } else if (isUnsubmitted) {
                    boxClass = "mini-box--unsubmitted";
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`exam-mini-box ${boxClass}`}
                      onClick={() => {
                        setActiveQuestionIndex(idx);
                        setVisitedQuestionIndexes((prev) => {
                          const next = new Set(prev);
                          next.add(idx);
                          return next;
                        });
                      }}
                    >
                      {language === "en" ? idx + 1 : toBnNum(idx + 1)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="exam-questions-list">
            {questions
              .filter((q, qIndex) => {
                if (config?.contestId && !isReviewMode) {
                  return qIndex === activeQuestionIndex;
                }
                if (!isReviewMode || filterType === "all") return true;
                const questionKey = getQuestionKey(q, qIndex);

                if (q.type === "mcq") {
                  const selectedIndex = answers[questionKey];
                  const correctIndex = getCorrectOptionIndex(q);

                  if (filterType === "correct") {
                    return (
                      selectedIndex === correctIndex && selectedIndex !== undefined
                    );
                  }
                  if (filterType === "wrong") {
                    return (
                      selectedIndex !== undefined && selectedIndex !== correctIndex
                    );
                  }
                  if (filterType === "skipped") {
                    return selectedIndex === undefined;
                  }
                } else if (q.type === "written" || q.type === "cq") {
                  const isUploaded = !!writtenAnswers[questionKey];
                  const scoreVal = aiEvaluations[questionKey] ? parseFloat(aiEvaluations[questionKey].marks) || 0 : 0;

                  if (filterType === "correct") {
                    return isUploaded && scoreVal > 0;
                  }
                  if (filterType === "wrong") {
                    return isUploaded && scoreVal === 0;
                  }
                  if (filterType === "skipped") {
                    return !isUploaded;
                  }
                }
                return true;
              })
              .map((q, qIndex) => {
                const actualIndex = questions.findIndex(
                  (origQ) => origQ._id === q._id || origQ === q,
                );
                const questionKey = getQuestionKey(q, actualIndex);

                return (
                  <div key={questionKey} className="exam-question-card">
                    {isReviewMode && (
                      <div className="exam-question-actions-top">
                        {q.tags && q.tags.length > 0 && (
                          <div className="exam-question-tags-wrapper">
                            {q.tags.map((tag, tIdx) => {
                              const abbr = getTagAbbreviation(tag);
                              if (!abbr) return null;
                              return (
                                <span
                                  key={tIdx}
                                  className={`exam-question-tag exam-question-tag--${tag.category}`}
                                  title={getTagTitle(tag)}
                                >
                                  {abbr}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          className="exam-explanation-btn"
                          onClick={() => {
                            setExplanationModalQuestion(q);
                            setExplanationTab("manual");
                          }}
                          title={
                            language === "en"
                              ? "Show Explanation"
                              : "ব্যাখ্যা দেখুন"
                          }
                        >
                          <HiEye size={20} />
                        </button>
                      </div>
                    )}

                    <div className="exam-question-top">
                      <div className="exam-question-text-wrapper">
                        <span className="exam-question-number">
                          {language === "en"
                            ? `${actualIndex + 1}. `
                            : `${toBnNum(actualIndex + 1)}. `}
                        </span>
                        <span
                          className="exam-question-text"
                          dangerouslySetInnerHTML={renderMath(q.questionText)}
                        />
                      </div>
                    </div>

                    {q.imageUrl && (
                      <div className="exam-question-image">
                        <img src={q.imageUrl} alt="Question figure" />
                      </div>
                    )}

                    {q.type === "mcq" && q.options && (
                      <div className="exam-options-grid">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = answers[questionKey] === optIdx;
                          const optionState = getOptionState(
                            q,
                            actualIndex,
                            optIdx,
                          );
                          return (
                            <button
                              key={optIdx}
                              className={`exam-option-btn ${isSelected ? "exam-option-btn--selected" : ""} ${optionState ? `exam-option-btn--${optionState}` : ""}`}
                              onClick={() =>
                                handleOptionSelect(questionKey, optIdx)
                              }
                              type="button"
                            >
                              <div
                                className={`exam-option-prefix ${isSelected ? "exam-option-prefix--selected" : ""} ${optionState ? `exam-option-prefix--${optionState}` : ""}`}
                              >
                                {getOptionPrefix(optIdx)}
                              </div>
                              <div
                                className="exam-option-text"
                                dangerouslySetInnerHTML={renderMath(opt.text)}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === "written" && q.options && q.options.length > 0 && (
                      <div className="exam-options-grid">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = answers[questionKey] === optIdx;
                          const optionState = getOptionState(
                            q,
                            actualIndex,
                            optIdx,
                          );
                          return (
                            <button
                              key={optIdx}
                              className={`exam-option-btn ${isSelected ? "exam-option-btn--selected" : ""} ${optionState ? `exam-option-btn--${optionState}` : ""}`}
                              onClick={() =>
                                handleOptionSelect(questionKey, optIdx)
                              }
                              type="button"
                              disabled={isSubmitted}
                            >
                              <div
                                className={`exam-option-prefix ${isSelected ? "exam-option-prefix--selected" : ""} ${optionState ? `exam-option-prefix--${optionState}` : ""}`}
                              >
                                {getOptionPrefix(optIdx)}
                              </div>
                              <div
                                className="exam-option-text"
                                dangerouslySetInnerHTML={renderMath(opt.text)}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === "written" && (
                      <div className="exam-written-upload-section">
                        <p className="exam-written-upload-title">
                          {language === "en"
                            ? "Upload Written Response:"
                            : "লিখিত উত্তর আপলোড করুন:"}
                        </p>

                        {!isSubmitted && (
                          <div className="exam-written-upload-controls">
                            <label className="exam-written-upload-label">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleWrittenFileChange(e, questionKey)
                                }
                                style={{ display: "none" }}
                              />
                              <div className="exam-written-upload-btn">
                                <svg
                                  className="exam-upload-icon"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                  style={{
                                    width: "20px",
                                    height: "20px",
                                    marginRight: "8px",
                                  }}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                  ></path>
                                </svg>
                                <span>
                                  {writtenAnswers[questionKey]
                                    ? language === "en"
                                      ? "Change Image"
                                      : "ছবি পরিবর্তন করুন"
                                    : language === "en"
                                      ? "Choose Image"
                                      : "ছবি নির্বাচন করুন"}
                                </span>
                              </div>
                            </label>

                            <button
                              type="button"
                              className="exam-written-camera-btn"
                              onClick={() => startCamera(questionKey)}
                            >
                              <svg
                                className="exam-camera-icon"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  marginRight: "8px",
                                }}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                ></path>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                ></path>
                              </svg>
                              <span>
                                {language === "en"
                                  ? "Use Camera"
                                  : "ক্যামেরা ব্যবহার করুন"}
                              </span>
                            </button>
                          </div>
                        )}

                        {writtenAnswers[questionKey] && (
                          <div className="exam-written-preview-container">
                            <img
                              src={writtenAnswers[questionKey]}
                              alt="Written Answer Preview"
                              className="exam-written-preview-img"
                            />
                            {!isSubmitted && (
                              <button
                                type="button"
                                className="exam-written-remove-btn"
                                onClick={() => handleRemoveWrittenFile(questionKey)}
                                title={
                                  language === "en"
                                    ? "Remove Image"
                                    : "ছবি মুছে ফেলুন"
                                }
                              >
                                <HiX size={16} />
                              </button>
                            )}
                          </div>
                        )}

                        {isReviewMode && aiEvaluations[questionKey] && (
                          <div className="exam-ai-eval-box" style={{ marginTop: '16px', padding: '12px', backgroundColor: '#F0FDF4', borderLeft: '4px solid #22C55E', borderRadius: '4px' }}>
                            <h4 style={{ margin: '0 0 8px 0', color: '#166534', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {language === "en" ? "AI Evaluation" : "এআই মূল্যায়ন"}
                            </h4>
                            <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#15803D' }}>
                              {language === "en" ? "Marks: " : "প্রাপ্ত নম্বর: "}
                              {aiEvaluations[questionKey].marks ?? aiEvaluations[questionKey].score}
                              {aiEvaluations[questionKey].totalMarks ? ` / ${aiEvaluations[questionKey].totalMarks}` : ''}
                            </div>
                            <div style={{ color: '#166534', fontSize: '14px' }}>
                              <strong>{language === "en" ? "Feedback: " : "মতামত: "}</strong>
                              <div
                                style={{ display: 'inline', marginLeft: '4px', lineHeight: '1.6' }}
                                dangerouslySetInnerHTML={renderMarkdownWithMath(aiEvaluations[questionKey].feedback)}
                              />
                            </div>
                          </div>
                        )}

                        {activeCameraQuestionKey === questionKey && (
                          <div className="exam-camera-overlay">
                            <div className="exam-camera-modal">
                              <h3 className="exam-camera-modal-title">
                                {language === "en"
                                  ? "Take Answer Photo"
                                  : "উত্তর ছবি তুলুন"}
                              </h3>
                              <div className="exam-camera-video-container">
                                <video
                                  ref={videoRef}
                                  autoPlay
                                  playsInline
                                  muted
                                  className="exam-camera-video"
                                />
                              </div>
                              <div className="exam-camera-actions">
                                <button
                                  type="button"
                                  className="exam-camera-btn exam-camera-btn--capture"
                                  onClick={() => capturePhoto(questionKey)}
                                >
                                  {language === "en"
                                    ? "Capture Photo"
                                    : "ছবি তুলুন"}
                                </button>
                                <button
                                  type="button"
                                  className="exam-camera-btn exam-camera-btn--cancel"
                                  onClick={stopCamera}
                                >
                                  {language === "en" ? "Cancel" : "বাতিল"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {config?.contestId && !isReviewMode && (
                      <div className="exam-contest-actions">
                        <button
                          type="button"
                          className="btn-contest-submit"
                          onClick={() => handleContestQuestionSubmit(actualIndex)}
                          disabled={answers[questionKey] === undefined}
                        >
                          {language === "en" ? "Submit" : "সাবমিট"}
                        </button>
                        <button
                          type="button"
                          className="btn-contest-next"
                          onClick={() => handleContestQuestionNext(actualIndex)}
                        >
                          {language === "en" ? "Next" : "পরবর্তী"}
                        </button>
                        {findPrevUnsubmittedIndex(activeQuestionIndex, submittedQuestionKeys) !== -1 && (
                          <button
                            type="button"
                            className="btn-contest-back"
                            onClick={() => handleContestQuestionBack()}
                          >
                            {language === "en" ? "Back" : "পূর্ববর্তী অসাবমিটকৃত"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {config?.contestId && !config?.isPractice && !isReviewMode && (
          <aside className="exam-sidebar-leaderboard">
            <div className="leaderboard-header">
              <div className="leaderboard-title-row">
                <h3 className="leaderboard-title">
                  {language === "en" ? "Live Leaderboard" : "লাইভ লিডারবোর্ড"}
                </h3>
                <span className="live-indicator">
                  <span className="live-dot"></span>
                  <span className="live-text">{language === "en" ? "LIVE" : "লাইভ"}</span>
                </span>
              </div>
              <p className="leaderboard-subtitle">
                {language === "en" ? "Top 3 by Points" : "পয়েন্টে শীর্ষ ৩"}
              </p>
            </div>
            <div className="leaderboard-list">
              {Array.from({ length: 3 }).map((_, rankIndex) => {
                const entry = leaderboard[rankIndex];
                const rank = rankIndex + 1;
                const medalGradients = [
                  "linear-gradient(135deg, #FFE066, #F5B041)", // Gold
                  "linear-gradient(135deg, #E2E8F0, #94A3B8)", // Silver
                  "linear-gradient(135deg, #EDC9AF, #A0522D)", // Bronze
                ];

                if (entry) {
                  const currentStudentId = localStorage.getItem('topkorbo_id');
                  const currentStudentName = localStorage.getItem('topkorbo_name');
                  const entryStudentId = entry.student?._id || entry.student;
                  const entryStudentName = entry.student?.name;
                  const isOwn = (currentStudentId && String(entryStudentId) === String(currentStudentId)) ||
                    (currentStudentName && entryStudentName && entryStudentName.trim().toLowerCase() === currentStudentName.trim().toLowerCase());

                  const rawName = entryStudentName || (language === "en" ? "Anonymous" : "অজ্ঞাতনামা");
                  const studentName = isOwn
                    ? (language === "en" ? `${rawName} (You)` : `${rawName} (তুমি)`)
                    : rawName;
                  const points = entry.livePoints || 0;
                  return (
                    <div key={rankIndex} className={`leaderboard-item leaderboard-item--rank-${rank} ${isOwn ? "leaderboard-item--own" : ""}`}>
                      <div
                        className="leaderboard-rank-badge"
                        style={{ background: medalGradients[rankIndex] }}
                      >
                        {rank}
                      </div>
                      <div className="leaderboard-item-info">
                        <div className="leaderboard-student-name" title={studentName}>
                          {studentName}
                        </div>
                        <div className="leaderboard-solved-count">
                          {language === "en"
                            ? `Points: ${points}`
                            : `পয়েন্ট: ${toBnNum(points)}`}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div key={rankIndex} className="leaderboard-item leaderboard-item--empty">
                      <div className="leaderboard-rank-badge leaderboard-rank-badge--empty">
                        {rank}
                      </div>
                      <div className="leaderboard-item-info">
                        <div className="leaderboard-student-name leaderboard-student-name--empty">
                          {language === "en" ? "Waiting for solver..." : "সমাধানকারীর জন্য অপেক্ষা..."}
                        </div>
                        <div className="leaderboard-solved-count leaderboard-solved-count--empty">
                          {language === "en"
                            ? "Number of questions Solved: 0"
                            : "সমাধানকৃত প্রশ্ন সংখ্যা: ০"}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </aside>
        )}
      </div>

      {!isReviewMode && (
        <div className="exam-floating-status-box">
          <div className="exam-status-item">
            <HiClock size={20} className="exam-status-icon" />
            <span>
              {language === "en"
                ? formatTime(timeLeft)
                : toBnNum(formatTime(timeLeft))}
            </span>
          </div>
          <div className="exam-status-divider" />
          <div className="exam-status-item">
            <HiCheckCircle size={20} className="exam-status-icon" />
            <span>
              {language === "en"
                ? `${answeredCount} / ${totalCount}`
                : `${toBnNum(answeredCount)} / ${toBnNum(totalCount)}`}
            </span>
          </div>
          <button
            className="exam-submit-btn-floating"
            onClick={handleSubmit}
            type="button"
            disabled={isEvaluating}
            style={{ opacity: isEvaluating ? 0.7 : 1, cursor: isEvaluating ? "not-allowed" : "pointer" }}
          >
            {isEvaluating
              ? (language === "en" ? "Evaluating..." : "মূল্যায়ন হচ্ছে...")
              : (language === "en" ? "Submit" : "সাবমিট")}
          </button>
        </div>
      )}

      {showResultModal && (
        <div className="exam-result-overlay" role="dialog" aria-modal="true">
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
          />
          <div className="exam-result-modal">
            <button
              type="button"
              className="exam-result-close"
              onClick={handleContinueToReview}
              aria-label="Close"
            >
              <HiX size={20} />
            </button>
            <div className="exam-result-illustration" aria-hidden="true">
              <img
                src="/assets/exam_result_mascot.png"
                alt="Mascot Celebrating"
                className="exam-result-mascot-img"
              />
            </div>
            <h2>
              {language === "en" ? "Result is ready" : "দুঃখ ভরা জীবন আমার"}
            </h2>
            <p>
              {language === "en"
                ? "Review your score and see every answer."
                : "তোমার ভালো পয়েন্ট এর দেখা পাই না"}
            </p>
            <div className="exam-result-modal-cards">
              <div className="exam-report-card exam-report-card--score">
                <span>{language === "en" ? "Points" : "পয়েন্ট"}</span>
                <strong>★ {formatDisplayNumber(resultStats.score)}</strong>
              </div>
              <div className="exam-report-card exam-report-card--marks">
                {questions.some((q) => q.type === "written") ? (
                  <>
                    <span>
                      {language === "en" ? "Written Answers" : "লিখিত উত্তর"}
                    </span>
                    <strong>
                      📁 {formatDisplayNumber(resultStats.writtenUploadedCount)}
                    </strong>
                  </>
                ) : (
                  <>
                    <span>{language === "en" ? "Marks" : "মার্কস"}</span>
                    <strong>
                      ● {formatDisplayNumber(resultStats.correct)} /{" "}
                      {formatDisplayNumber(resultStats.total)}
                    </strong>
                  </>
                )}
              </div>
              <div className="exam-report-card exam-report-card--time">
                <span>{language === "en" ? "Time" : "সময়"}</span>
                <strong>◉ {timeLabel}</strong>
              </div>
            </div>
            <button
              type="button"
              className="exam-result-continue"
              onClick={handleContinueToReview}
            >
              {language === "en" ? "Continue" : "এগিয়ে যাও"}
            </button>
          </div>
        </div>
      )}

      {explanationModalQuestion && (
        <div
          className="exam-explanation-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setExplanationModalQuestion(null)}
        >
          <div
            className="exam-explanation-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="exam-explanation-close"
              onClick={() => setExplanationModalQuestion(null)}
              aria-label="Close"
            >
              <HiX size={20} />
            </button>
            <h2 className="exam-explanation-title">
              {language === "en" ? "Explanation" : "ব্যাখ্যা"}
            </h2>
            <div className="exam-explanation-question-preview">
              <strong className="exam-explanation-q-label">
                {language === "en" ? "Question: " : "প্রশ্ন: "}
              </strong>
              <div
                className="exam-explanation-q-text"
                dangerouslySetInnerHTML={renderMath(
                  explanationModalQuestion.questionText,
                )}
              />
            </div>

            <div className="exam-explanation-tabs">
              <button
                type="button"
                className={`exam-explanation-tab-btn ${explanationTab === "manual" ? "exam-explanation-tab-btn--active" : ""}`}
                onClick={() => setExplanationTab("manual")}
              >
                {language === "en"
                  ? "Manual Explanation"
                  : "ম্যানুয়াল ব্যাখ্যা"}
              </button>
              <button
                type="button"
                className={`exam-explanation-tab-btn ${explanationTab === "ai" ? "exam-explanation-tab-btn--active" : ""}`}
                onClick={() => setExplanationTab("ai")}
              >
                {language === "en" ? "AI Explanation" : "এআই ব্যাখ্যা"}
              </button>
              <button
                type="button"
                className={`exam-explanation-tab-btn ${explanationTab === "video" ? "exam-explanation-tab-btn--active" : ""}`}
                onClick={() => setExplanationTab("video")}
              >
                {language === "en" ? "Video Solution" : "ভিডিও সমাধান"}
              </button>
            </div>

            <div className="exam-explanation-content">
              {explanationTab === "manual" &&
                (() => {
                  let isCqSolution = false;
                  let parsedSolutions = [];
                  const solutionStr = explanationModalQuestion.solution;
                  try {
                    if (
                      solutionStr &&
                      (solutionStr.trim().startsWith("[") ||
                        solutionStr.trim().startsWith("{"))
                    ) {
                      const parsed = JSON.parse(solutionStr);
                      if (Array.isArray(parsed)) {
                        isCqSolution = true;
                        parsedSolutions = parsed;
                      }
                    }
                  } catch (e) {
                    // Not JSON
                  }

                  if (isCqSolution) {
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        {parsedSolutions.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              borderBottom:
                                idx < parsedSolutions.length - 1
                                  ? "1px solid #E2E8F0"
                                  : "none",
                              paddingBottom:
                                idx < parsedSolutions.length - 1 ? "12px" : "0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "flex-start",
                              }}
                            >
                              <span
                                style={{
                                  fontWeight: "700",
                                  color: "#4F46E5",
                                  minWidth: "24px",
                                }}
                              >
                                ({item.label.toLowerCase()})
                              </span>
                              <span
                                dangerouslySetInnerHTML={renderMath(item.text)}
                              />
                            </div>
                            {item.imageUrl && (
                              <div
                                style={{
                                  marginTop: "8px",
                                  maxWidth: "100%",
                                  overflow: "hidden",
                                }}
                              >
                                <img
                                  src={item.imageUrl}
                                  alt={`Solution Part ${item.label.toUpperCase()}`}
                                  style={{
                                    maxWidth: "300px",
                                    maxHeight: "200px",
                                    objectFit: "contain",
                                    borderRadius: "6px",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        className="exam-explanation-body-text"
                        dangerouslySetInnerHTML={renderMath(
                          solutionStr ||
                          (language === "en"
                            ? "No explanation added yet."
                            : "এখনও ব্যাখ্যা যোগ করা হয়নি।"),
                        )}
                      />
                      {explanationModalQuestion.solutionImageUrl && (
                        <div
                          style={{
                            marginTop: "8px",
                            maxWidth: "100%",
                            overflow: "hidden",
                          }}
                        >
                          <img
                            src={explanationModalQuestion.solutionImageUrl}
                            alt="Solution Figure"
                            style={{
                              maxWidth: "300px",
                              maxHeight: "200px",
                              objectFit: "contain",
                              borderRadius: "6px",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              {explanationTab === "ai" && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Action buttons */}
                  {!aiExplanations[explanationModalQuestion?._id] && !aiExplainLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', padding: '32px 16px' }}>
                      <p style={{ margin: '0 0 8px', color: '#64748B', fontSize: '15px', textAlign: 'center', lineHeight: '1.6' }}>
                        {language === "en"
                          ? "Get a detailed step-by-step solution from the AI Tutor. You can ask follow-up questions and upload images in the chat."
                          : "এআই টিউটরের কাছ থেকে এই প্রশ্নটির একটি বিস্তারিত সমাধান তৈরি করো। তুমি চ্যাটের মাধ্যমে পরবর্তী প্রশ্ন জিজ্ঞাসা করতে এবং ছবি আপলোড করতে পারবে।"}
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!explanationModalQuestion) return;
                          setAiExplainLoading(true);
                          try {
                            const backendBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
                            const res = await fetch(`${backendBaseUrl}/evaluate/explain`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${localStorage.getItem("topkorbo_token") || localStorage.getItem("token")}`,
                              },
                              body: JSON.stringify({
                                questionId: explanationModalQuestion._id,
                              }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setAiExplanations(prev => ({ ...prev, [explanationModalQuestion._id]: data.explanation }));

                              const initialThread = [
                                {
                                  role: "user",
                                  content: language === "en" ? "Generate a detailed solution for this question." : "এই প্রশ্নের একটি বিস্তারিত সমাধান তৈরি করো।"
                                },
                                {
                                  role: "assistant",
                                  content: data.explanation
                                }
                              ];

                              setAiChatThreads(prev => ({
                                ...prev,
                                [explanationModalQuestion._id]: initialThread
                              }));
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              setAiExplanations(prev => ({ ...prev, [explanationModalQuestion._id]: `Error: ${errData.msg || 'Failed to generate explanation.'}` }));
                            }
                          } catch (err) {
                            setAiExplanations(prev => ({ ...prev, [explanationModalQuestion._id]: `Network Error: ${err.message}` }));
                          } finally {
                            setAiExplainLoading(false);
                          }
                        }}
                        style={{
                          padding: '12px 24px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                          color: '#FFF',
                          fontSize: '15px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.45)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.35)'; }}
                      >
                        {language === "en" ? "Generate Detailed Solution" : "বিস্তারিত সমাধান তৈরি করো"}
                      </button>
                    </div>
                  )}

                  {/* Loading state */}
                  {aiExplainLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 16px' }}>
                      <div style={{
                        width: '40px', height: '40px',
                        border: '3px solid #E2E8F0',
                        borderTopColor: '#6366F1',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                      <p style={{ color: '#6366F1', fontWeight: '500', fontSize: '15px', margin: 0 }}>
                        {language === "en" ? "AI is thinking..." : "AI চিন্তা করছে..."}
                      </p>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {/* Explanation output & Tutoring Chat */}
                  {aiExplanations[explanationModalQuestion?._id] && !aiExplainLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Messages Thread */}
                      <div
                        className="ai-chat-thread-container"
                        style={{
                          maxHeight: '400px',
                          overflowY: 'auto',
                          padding: '12px',
                          border: '1px solid #F1F5F9',
                          borderRadius: '12px',
                          backgroundColor: '#FAF9F6',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px'
                        }}
                      >
                        {(aiChatThreads[explanationModalQuestion._id] || [
                          { role: "assistant", content: aiExplanations[explanationModalQuestion._id] }
                        ]).map((msg, index) => {
                          const isUser = msg.role === 'user';
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isUser ? 'flex-end' : 'flex-start',
                                alignSelf: isUser ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                gap: '4px'
                              }}
                            >
                              {/* Avatar / Name label */}
                              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', margin: isUser ? '0 8px 0 0' : '0 0 0 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                {isUser
                                  ? (language === "en" ? "You" : "তুমি")
                                  : (language === "en" ? "AI Tutor" : "এআই টিউটর")}
                              </span>

                              {/* Message bubble */}
                              <div
                                style={{
                                  background: isUser
                                    ? 'linear-gradient(135deg, #6366F1, #4F46E5)'
                                    : '#FFFFFF',
                                  color: isUser ? '#FFFFFF' : '#1E293B',
                                  border: isUser ? 'none' : '1px solid #E2E8F0',
                                  borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                                  padding: '12px 16px',
                                  boxShadow: isUser ? '0 3px 10px rgba(99, 102, 241, 0.15)' : '0 2px 6px rgba(0, 0, 0, 0.03)',
                                  fontSize: '14px',
                                  lineHeight: '1.6',
                                }}
                              >
                                {/* Thumbnail attachment if present */}
                                {msg.image && (
                                  <div style={{ marginBottom: '8px' }}>
                                    <img
                                      src={msg.image}
                                      alt="Attachment"
                                      style={{
                                        maxWidth: '180px',
                                        maxHeight: '130px',
                                        objectFit: 'contain',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)'
                                      }}
                                    />
                                  </div>
                                )}
                                <div
                                  className="chat-bubble-text"
                                  dangerouslySetInnerHTML={
                                    isUser
                                      ? { __html: sanitizeHtml(msg.content.replace(/\n/g, '<br/>')) }
                                      : renderMarkdownWithMath(msg.content)
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}

                        {/* Typing / Sending indicator */}
                        {isSendingFollowUp && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              alignSelf: 'flex-start',
                              background: '#F1F5F9',
                              borderRadius: '12px 12px 12px 2px',
                              padding: '10px 14px',
                              color: '#64748B',
                              fontSize: '13px'
                            }}
                          >
                            <div style={{
                              width: '6px', height: '6px',
                              backgroundColor: '#94A3B8',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s infinite ease-in-out both'
                            }} />
                            <div style={{
                              width: '6px', height: '6px',
                              backgroundColor: '#94A3B8',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s infinite ease-in-out both 0.2s'
                            }} />
                            <div style={{
                              width: '6px', height: '6px',
                              backgroundColor: '#94A3B8',
                              borderRadius: '50%',
                              animation: 'bounce 1.4s infinite ease-in-out both 0.4s'
                            }} />
                            <span style={{ marginLeft: '4px' }}>
                              {language === "en" ? "AI is replying..." : "AI উত্তর দিচ্ছে..."}
                            </span>
                            <style>{`
                              @keyframes bounce {
                                0%, 80%, 100% { transform: scale(0); }
                                40% { transform: scale(1.0); }
                              }
                            `}</style>
                          </div>
                        )}
                      </div>

                      {/* Chat Input & File upload Section */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Hidden follow-up image file input */}
                        <input
                          ref={followUpFileRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            processImageFile(file, (dataUrl) => {
                              setFollowUpImage(dataUrl);
                            });
                          }}
                        />

                        {/* Image Preview attachment */}
                        {followUpImage && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', position: 'relative' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <img
                                src={followUpImage}
                                alt="Attachment preview"
                                style={{ maxWidth: '100px', maxHeight: '80px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                              />
                              <button
                                type="button"
                                onClick={() => setFollowUpImage(null)}
                                style={{
                                  position: 'absolute',
                                  top: '-6px',
                                  right: '-6px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  backgroundColor: '#EF4444',
                                  color: '#FFF',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px'
                                }}
                              >
                                <HiX size={12} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Input bar */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: '1.5px solid #CBD5E1',
                            borderRadius: '10px',
                            padding: '4px 8px',
                            backgroundColor: '#FFF'
                          }}
                        >
                          {/* Image Attach Button */}
                          <button
                            type="button"
                            onClick={() => followUpFileRef.current?.click()}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#64748B',
                              cursor: 'pointer',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '6px',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            title={language === "en" ? "Attach image" : "ছবি যুক্ত করুন"}
                          >
                            <HiPaperClip size={20} />
                          </button>

                          {/* Chat Input Textarea */}
                          <textarea
                            value={followUpText}
                            onChange={(e) => setFollowUpText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendFollowUp();
                              }
                            }}
                            placeholder={language === "en" ? "Ask a follow-up question..." : "এই প্রশ্নটি সম্পর্কে কোনো কনফিউশন থাকলে জিজ্ঞাসা করো..."}
                            style={{
                              flex: 1,
                              border: 'none',
                              outline: 'none',
                              resize: 'none',
                              height: '40px',
                              maxHeight: '100px',
                              fontFamily: 'inherit',
                              fontSize: '14px',
                              color: '#1E293B',
                              padding: '8px 4px',
                            }}
                          />

                          {/* Send Button */}
                          <button
                            type="button"
                            onClick={handleSendFollowUp}
                            disabled={isSendingFollowUp || (!followUpText.trim() && !followUpImage)}
                            style={{
                              backgroundColor: (followUpText.trim() || followUpImage) && !isSendingFollowUp ? '#6366F1' : '#E2E8F0',
                              color: (followUpText.trim() || followUpImage) && !isSendingFollowUp ? '#FFF' : '#94A3B8',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '8px',
                              cursor: (followUpText.trim() || followUpImage) && !isSendingFollowUp ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                          >
                            <HiPaperAirplane size={16} style={{ transform: 'rotate(90deg)' }} />
                          </button>
                        </div>
                      </div>

                      {/* Reset / Regenerate solution */}
                      <button
                        type="button"
                        onClick={() => {
                          setAiExplanations(prev => {
                            const copy = { ...prev };
                            delete copy[explanationModalQuestion._id];
                            return copy;
                          });
                          setAiChatThreads(prev => {
                            const copy = { ...prev };
                            delete copy[explanationModalQuestion._id];
                            return copy;
                          });
                        }}
                        style={{
                          alignSelf: 'flex-start',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFF',
                          color: '#64748B',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          marginTop: '4px'
                        }}
                      >
                        {language === "en" ? "↻ Reset Conversation" : "↻ নতুন করে শুরু করো"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {explanationTab === "video" && (
                <div className="exam-explanation-placeholder">
                  <div className="exam-explanation-placeholder-badge">
                    {language === "en" ? "Coming Soon" : "শীঘ্রই আসছে"}
                  </div>
                  <p>
                    {language === "en"
                      ? "Video solution is being prepared and will be added in a future update."
                      : "ভিডিও সমাধান তৈরি করা হচ্ছে এবং শীঘ্রই যুক্ত করা হবে।"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
