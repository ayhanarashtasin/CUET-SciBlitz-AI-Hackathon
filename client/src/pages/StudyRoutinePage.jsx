/**
 * TopKorbo — Study Routine & Planner Page
 * Comprehensive EdTech study planner for Bangladeshi students.
 * Features a dynamic sliding-card wizard for student profiling and an interactive dashboard.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  HiCalendar,
  HiClock,
  HiCheckCircle,
  HiPlay,
  HiPause,
  HiStop,
  HiPencil,
  HiTrash,
  HiChevronLeft,
  HiChevronRight,
  HiPlus,
  HiX,
  HiRefresh,
  HiChartBar,
  HiBookOpen,
  HiLightningBolt,
  HiAcademicCap,
  HiInformationCircle,
  HiCheck,
  HiArrowRight,
  HiArrowLeft
} from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  format,
  differenceInDays,
  isSameDay,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import { useLanguage } from '../hooks/useLanguage';
import studyRoutineApi from '../services/studyRoutineApi';
import { calculateDaysUntilExam, formatRemainingTimeline, todayKey } from '../utils/dateHelpers';
import './StudyRoutinePage.css';

// --------------------------------------------------------------------------
// Constants & Subject Stream Configurations
// --------------------------------------------------------------------------

const STREAM_SUBJECTS = {
  Science: ['Physics', 'Chemistry', 'Higher Math', 'Biology', 'Bangla', 'English', 'ICT'],
  'Business Studies': ['Accounting', 'Business Organization & Management', 'Finance & Banking', 'Economics', 'Bangla', 'English', 'ICT'],
  Humanities: ['Civics & Good Governance', 'Economics', 'History', 'Islamic History', 'Sociology', 'Bangla', 'English', 'ICT']
};

const MOTIVATION_OPTIONS = [
  'Good grades',
  'Family expectations',
  'Dream university',
  'Self-improvement',
  'Career goals',
  'Competition with peers'
];

const CHALLENGE_OPTIONS = [
  "Can't focus for long",
  "Don't know where to start",
  'Too much syllabus',
  'Procrastination',
  'No proper schedule',
  'Social media distraction'
];

const DAYS_OF_WEEK = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Chapter lists per subject per paper (1st/2nd). Used in Step 3 for chapter selection.
const MOCK_CHAPTERS = {
  Physics: {
    '1st Paper': [
      'Physical World and Measurement', 'Vector', 'Dynamics', 'Newtonian Mechanics',
      'Work, Energy & Power', 'Gravitation & Gravity', 'Stress & Strain',
      'Periodic Motion', 'Waves', 'Ideal Gas & Kinetic Theory'
    ],
    '2nd Paper': [
      'Heat & Thermodynamics', 'Electrostatics', 'Current Electricity', 'Magnetic Effect of Current',
      'Electromagnetic Induction', 'Alternating Current', 'Geometric Optics',
      'Physical Optics', 'Modern Physics & Atom Model', 'Nuclear Physics & Radioactivity',
      'Semiconductor & Electronics'
    ]
  },
  Chemistry: {
    '1st Paper': [
      'Environmental Chemistry', 'Qualitative Chemistry', 'Mole',
      'Atomic Structure', 'Chemical Bond'
    ],
    '2nd Paper': [
      'Chemical Changes', 'Industrial Chemistry', 'Electrochemistry',
      'Organic Chemistry', 'Biochemistry'
    ]
  },
  'Higher Math': {
    '1st Paper': [
      'Matrix and Determinant', 'Vector', 'Straight Line', 'Circle',
      'Permutation and Combination', 'Trigonometric Ratios',
      'Trigonometric Ratios of Associated Angles', 'Functions and Graphs',
      'Differentiation', 'Integration'
    ],
    '2nd Paper': [
      'Real Numbers and Inequalities', 'Linear Programming', 'Complex Numbers',
      'Polynomial and Polynomial Equations', 'Binomial Expansion',
      'Conic Sections', 'Inverse Trigonometric Functions and Trigonometric Equations',
      'Statics', 'Motion in a Plane', 'Probability'
    ]
  },
  Biology: {
    '1st Paper': [
      'Cell and Its Structure', 'Cell Division', 'Cell Chemistry', 'Microorganism',
      'Algae and Fungi', 'Bryophyta and Pteridophyta', 'Gymsomperm and Angiosperm',
      'Tissue and Tissue System', 'Plant Physiology', 'Plant Reproduction',
      'Biotechnology', 'Environment, Distribution and Conservation of Organisms'
    ],
    '2nd Paper': [
      'Animal Diversity and Classification', 'Introduction to Animals',
      'Human Physiology: Digestion and Absorption', 'Human Physiology: Blood and Circulation',
      'Human Physiology: Breathing and Respiration', 'Human Physiology: Waste and Excretion',
      'Human Physiology: Locomotion and Movement', 'Human Physiology: Coordination and Control',
      'Continuation of Human Life', 'Defense of Human Body',
      'Genetics and Evolution', 'Animal Behavior'
    ]
  },
  Bangla: {
    '1st Paper': ['গদ্য', 'পদ্য', 'নাটক', 'উপন্যাস', 'ছোটগল্প', 'প্রবন্ধ', 'ভাষা ও ব্যাকরণ'],
    '2nd Paper': ['বাংলা ব্যাকরণ', 'ভাব-সম্প্রসারণ', 'পত্র লিখন', 'প্রবন্ধ রচনা', 'সারমর্ম/সারাংশ', 'অনুবাদ', 'বাংলা বানানের নিয়ম']
  },
  English: {
    '1st Paper': ['Comprehension', 'Vocabulary', 'Grammar', 'Reading Skills', 'Prose', 'Poetry', 'Short Stories', 'Composition'],
    '2nd Paper': ['Grammar — Tenses', 'Grammar — Modifiers', 'Grammar — Connectors', 'Grammar — Sentence Patterns', 'Formal Letter/Application', 'Paragraph Writing', 'Essay Writing', 'Report Writing', 'Completing Story', 'Email Writing']
  },
  ICT: {
    '1st Paper': ['World and ICT', 'Communication System', 'Number System & Digital Devices', 'Web Design — HTML', 'Programming Basics', 'Database Management'],
    '2nd Paper': []
  }
};

const WIZARD_STEPS = [
  { id: 1, label: 'Academic', title: '1. Academic Information' },
  { id: 2, label: 'Exam Target', title: '2. Exam Target' },
  { id: 3, label: 'Subjects', title: '3. Subjects & Weak Areas' },
  { id: 4, label: 'Schedule', title: '4. Daily Schedule & Availability' },
  { id: 5, label: 'Habits', title: '5. Study Habits & Preferences' },
  { id: 6, label: 'Goals', title: '6. Motivation & Goals' }
];

/**
 * Fast, hardware-accelerated slide animation variants for smooth 60fps transitions
 */
const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.16, ease: 'easeOut' }
    }
  },
  exit: (direction) => ({
    x: direction < 0 ? 24 : -24,
    opacity: 0,
    transition: {
      x: { duration: 0.12, ease: [0.4, 0, 1, 1] },
      opacity: { duration: 0.1, ease: 'easeIn' }
    }
  })
};

/**
 * Generate a deterministic, aesthetically pleasing HSL color scheme for a subject badge.
 * Uses a string hashing algorithm on the subject name to guarantee the same subject
 * always receives the identical hue across all views and cards.
 * 
 * @param {string} [subjectName=''] - Name of the subject (e.g., 'Physics', 'Higher Math').
 * @returns {{ bg: string, border: string, text: string, accent: string }} HSL color styles.
 */
function getSubjectColor(subjectName = '') {
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsl(${hue}, 85%, 96%)`,
    border: `hsl(${hue}, 65%, 80%)`,
    text: `hsl(${hue}, 80%, 25%)`,
    accent: `hsl(${hue}, 70%, 45%)`
  };
}

/**
 * Format elapsed seconds into a standard digital timer string:
 * - HH:MM:SS (if elapsed time is 1 hour or more)
 * - MM:SS (if under 1 hour)
 * 
 * @param {number} [seconds=0] - Number of seconds elapsed in active study session.
 * @returns {string} Zero-padded formatted time display.
 */
function formatTimerDisplay(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function StudyRoutinePage() {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [user] = useState(() => ({
    name: localStorage.getItem('topkorbo_name') || 'Student',
    role: localStorage.getItem('topkorbo_role') || 'student'
  }));

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [routineDoc, setRoutineDoc] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [activeView, setActiveView] = useState('day'); // 'day' | 'week' | 'month' | 'stats'
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Focus Timer & Active Session
  const [activeSession, setActiveSession] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const timerIntervalRef = useRef(null);

  // Sliding Card Wizard States
  const [currentStep, setCurrentStep] = useState(1);
  const [slideDirection, setSlideDirection] = useState(1);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // 28-Field Profiling Form State
  const [formData, setFormData] = useState({
    academicLevel: 'HSC 2nd Year',
    stream: 'Science',
    medium: 'Bangla Medium',
    institution: '',
    examTarget: 'HSC Board Exam',
    examDate: '',
    targetGpa: 'GPA 5.00',
    planDuration: '30 days',
    subjects: ['Physics', 'Chemistry', 'Higher Math', 'Biology'],
    subjectPapers: {
      Physics: ['1st Paper', '2nd Paper'],
      Chemistry: ['1st Paper', '2nd Paper'],
      'Higher Math': ['1st Paper', '2nd Paper'],
      Biology: ['1st Paper']
    },
    subjectChapters: {},
    weakSubjects: ['Higher Math'],
    subjectConfidence: {
      Physics: 3,
      Chemistry: 4,
      'Higher Math': 2,
      Biology: 4
    },
    wakeUpTime: '06:00',
    sleepTime: '23:00',
    unavailableBlocks: [
      { startTime: '09:00', endTime: '13:30', label: 'College' }
    ],
    studyDaysPerWeek: '6',
    restDays: ['Friday'],
    dailyStudyHours: '5-6 hours',
    bestStudyTime: 'Morning',
    focusDuration: '45 min',
    subjectMixing: 'Mix 2-3 subjects',
    breakScheduling: 'Short breaks (15 min) between sessions',
    motivations: ['Dream university', 'Good grades'],
    challenges: ["Can't focus for long", 'Procrastination'],
    additionalNotes: '',
    preferredStartDate: new Date().toISOString().split('T')[0]
  });

  // Chapter input tag state
  const [newChapterInput, setNewChapterInput] = useState({});

  // Floating AI Chat Sidebar
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: "Hi! I'm your TopKorbo Study Coach. Need any changes to your routine? Feel free to ask me to adjust study slots, swap subjects, or make a day lighter!"
    }
  ]);
  const [aiInputText, setAiInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Edit Segment Modal
  const [editSegmentModal, setEditSegmentModal] = useState(null);

  // --------------------------------------------------------------------------
  // Data Fetching Functions
  // --------------------------------------------------------------------------

  /**
   * loadRoutineData
   * Fetches the user's StudyRoutine document and any running focus session from the server.
   * If a session is currently running, restores elapsed seconds so the live timer resumes seamlessly.
   * If an existing profile is found, pre-populates the 28-field form state.
   */
  const loadRoutineData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await studyRoutineApi.getRoutine();
      if (data && data.routine) {
        setRoutineDoc(data.routine);
        if (data.activeSession) {
          setActiveSession(data.activeSession);
          const elapsed = Math.max(
            0,
            Math.floor((Date.now() - new Date(data.activeSession.startedAt).getTime()) / 1000)
          );
          setTimerSeconds(elapsed);
        }

        if (data.routine.studentProfile && Object.keys(data.routine.studentProfile).length > 0) {
          setFormData((prev) => ({
            ...prev,
            ...data.routine.studentProfile
          }));
        }
      } else {
        setRoutineDoc(null);
      }
    } catch (err) {
      console.warn('[StudyRoutinePage] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * loadStats
   * Fetches aggregate study metrics (planned/completed hours, streaks, subject distribution)
   * to keep the dashboard progress bars and statistics cards accurate.
   */
  const loadStats = useCallback(async () => {
    try {
      const stats = await studyRoutineApi.getStats();
      if (stats) setStatsData(stats);
    } catch (err) {
      console.warn('[StudyRoutinePage] Stats load error:', err);
    }
  }, []);

  // Check auth token and fetch initial routine and stats data on component mount
  useEffect(() => {
    const token = localStorage.getItem('topkorbo_token');
    if (!token) {
      navigate('/login');
      return;
    }
    loadRoutineData();
    loadStats();
  }, [loadRoutineData, loadStats, navigate]);

  /**
   * Focus Timer Tick Effect
   * Runs a 1-second interval ticker when an active focus session exists and is not paused.
   * Increments `timerSeconds` locally without needing continuous server pings.
   */
  useEffect(() => {
    if (activeSession && !isTimerPaused) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeSession, isTimerPaused]);

  // --------------------------------------------------------------------------
  // Sliding Wizard Handlers & Exam Date Countdown
  // --------------------------------------------------------------------------

  /**
   * calculatedExamDays
   * Memoized computation of calendar days remaining until the target exam date.
   * Returns a positive integer, or null if no valid exam date has been selected.
   */
  const calculatedExamDays = useMemo(() => {
    return calculateDaysUntilExam(formData.examDate);
  }, [formData.examDate]);

  /**
   * handleExamDateChange
   * Triggered when the student selects or alters their target exam date in Step 2.
   * Automatically updates the overall plan duration (e.g., "45 days") to match the
   * remaining days until the exam, and clears any validation errors.
   * 
   * @param {string} dateVal - YYYY-MM-DD date string.
   */
  const handleExamDateChange = (dateVal) => {
    const days = calculateDaysUntilExam(dateVal);
    let updatedDuration = formData.planDuration;
    if (days !== null && days > 0) {
      updatedDuration = `${days} days`;
    }

    setFormData((prev) => ({
      ...prev,
      examDate: dateVal,
      planDuration: updatedDuration
    }));

    if (formErrors.examDate) {
      setFormErrors((prev) => ({ ...prev, examDate: null }));
    }
  };

  /**
   * handleStartDateChange
   * Updates the preferred starting date for the study routine schedule.
   * 
   * @param {string} startDateVal - YYYY-MM-DD date string.
   */
  const handleStartDateChange = (startDateVal) => {
    setFormData((prev) => ({
      ...prev,
      preferredStartDate: startDateVal
    }));
  };

  /**
   * validateStep
   * Validates form inputs for a specific wizard step before permitting navigation to the next card.
   * Checks mandatory academic info, future exam dates, selected subjects, and wake/sleep times.
   * 
   * @param {number} step - Wizard step number (1 to 6).
   * @returns {boolean} True if the step's inputs are valid, false if errors exist.
   */
  const validateStep = (step) => {
    const errors = {};
    if (step === 1) {
      if (!formData.academicLevel) errors.academicLevel = 'Academic level is required';
      if (!formData.stream) errors.stream = 'Stream is required';
    } else if (step === 2) {
      if (!formData.examTarget) errors.examTarget = 'Exam target is required';
      if (!formData.examDate) {
        errors.examDate = 'Approximate exam date is required';
      } else {
        const days = calculateDaysUntilExam(formData.examDate);
        if (days !== null && days <= 0) {
          errors.examDate = 'Exam date must be in the future';
        }
      }
      if (!formData.targetGpa) errors.targetGpa = 'Target GPA or score is required';
    } else if (step === 3) {
      if (!formData.subjects || formData.subjects.length === 0) {
        errors.subjects = 'Please select at least 1 subject';
      }
    } else if (step === 4) {
      if (!formData.wakeUpTime) errors.wakeUpTime = 'Wake-up time is required';
      if (!formData.sleepTime) errors.sleepTime = 'Sleep time is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * handleNextStep
   * Advances the wizard to the subsequent step (card slides right to left).
   * Blocks transition if required inputs in the current step fail validation.
   */
  const handleNextStep = () => {
    if (!validateStep(currentStep)) {
      toast.error('Please complete all required fields in this step');
      return;
    }
    setSlideDirection(1);
    setCurrentStep((prev) => Math.min(6, prev + 1));
  };

  /**
   * handlePrevStep
   * Reverts the wizard to the previous step (card slides left to right).
   */
  const handlePrevStep = () => {
    setSlideDirection(-1);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  /**
   * handleJumpToStep
   * Direct jump to a specific wizard step via top progress step indicators.
   * Backward jumps are always permitted; forward jumps require validating the current step.
   * 
   * @param {number} targetStep - Step number to navigate to (1-6).
   */
  const handleJumpToStep = (targetStep) => {
    if (targetStep < currentStep || validateStep(currentStep)) {
      setSlideDirection(targetStep > currentStep ? 1 : -1);
      setCurrentStep(targetStep);
    }
  };

  /**
   * handleStreamChange
   * Triggered when the student selects a stream (Science, Business Studies, Humanities).
   * Automatically populates the default subjects and weak areas for that stream.
   * 
   * @param {'Science'|'Business Studies'|'Humanities'} stream - Selected stream.
   */
  const handleStreamChange = (stream) => {
    const defaultSubs = STREAM_SUBJECTS[stream] || [];
    setFormData((prev) => ({
      ...prev,
      stream,
      subjects: defaultSubs.slice(0, 4),
      weakSubjects: [defaultSubs[0] || '']
    }));
  };

  /**
   * handleSubjectToggle
   * Adds or removes a subject from the student's study plan in Step 3.
   * 
   * @param {string} subj - Subject name (e.g. 'Physics').
   */
  const handleSubjectToggle = (subj) => {
    setFormData((prev) => {
      const exists = prev.subjects.includes(subj);
      const updated = exists ? prev.subjects.filter((s) => s !== subj) : [...prev.subjects, subj];
      return { ...prev, subjects: updated };
    });
  };

  /**
   * handlePaperToggle
   * Toggles inclusion of 1st Paper vs 2nd Paper for a given subject.
   * 
   * @param {string} subj - Subject name.
   * @param {'1st Paper'|'2nd Paper'} paper - Paper title.
   */
  const handlePaperToggle = (subj, paper) => {
    setFormData((prev) => {
      const currentPapers = prev.subjectPapers[subj] || [];
      const exists = currentPapers.includes(paper);
      const updatedPapers = exists
        ? currentPapers.filter((p) => p !== paper)
        : [...currentPapers, paper];
      return {
        ...prev,
        subjectPapers: {
          ...prev.subjectPapers,
          [subj]: updatedPapers
        }
      };
    });
  };

  /**
   * handleAddChapterTag
   * Adds a chapter focus tag to a specific subject (from typing or selecting a suggested chapter).
   * 
   * @param {string} subj - Subject name.
   * @param {string} [directValue] - Direct tag value to add (if selected from list).
   */
  const handleAddChapterTag = (subj, directValue) => {
    const tag = directValue || (newChapterInput[subj] || '').trim();
    if (!tag) return;
    setFormData((prev) => {
      const currentList = prev.subjectChapters[subj] || [];
      if (currentList.includes(tag)) return prev;
      return {
        ...prev,
        subjectChapters: {
          ...prev.subjectChapters,
          [subj]: [...currentList, tag]
        }
      };
    });
    if (!directValue) {
      setNewChapterInput((prev) => ({ ...prev, [subj]: '' }));
    }
  };

  /**
   * handleRemoveChapterTag
   * Removes a chapter tag from a subject's focus list.
   * 
   * @param {string} subj - Subject name.
   * @param {string} tagToRemove - Chapter title string.
   */
  const handleRemoveChapterTag = (subj, tagToRemove) => {
    setFormData((prev) => {
      const currentList = prev.subjectChapters[subj] || [];
      return {
        ...prev,
        subjectChapters: {
          ...prev.subjectChapters,
          [subj]: currentList.filter((t) => t !== tagToRemove)
        }
      };
    });
  };

  /**
   * handleAddUnavailableBlock
   * Appends a new default busy time block (e.g. college or coaching) to prevent scheduling conflicts.
   */
  const handleAddUnavailableBlock = () => {
    setFormData((prev) => ({
      ...prev,
      unavailableBlocks: [
        ...prev.unavailableBlocks,
        { startTime: '15:00', endTime: '17:00', label: 'Coaching' }
      ]
    }));
  };

  /**
   * handleRemoveUnavailableBlock
   * Deletes an unavailable time block by index.
   * 
   * @param {number} index - Index of block to delete.
   */
  const handleRemoveUnavailableBlock = (index) => {
    setFormData((prev) => ({
      ...prev,
      unavailableBlocks: prev.unavailableBlocks.filter((_, i) => i !== index)
    }));
  };

  /**
   * handleRestDayToggle
   * Toggles a day of the week as a designated rest/break day.
   * 
   * @param {string} day - Day name (e.g. 'Friday', 'Saturday').
   */
  const handleRestDayToggle = (day) => {
    setFormData((prev) => {
      const exists = prev.restDays.includes(day);
      const updated = exists ? prev.restDays.filter((d) => d !== day) : [...prev.restDays, day];
      return { ...prev, restDays: updated };
    });
  };

  /**
   * handleGenerateRoutineSubmit
   * Form submission handler for the 6-step profiling wizard.
   * Validates all essential fields, dispatches the POST `/api/study-routine` request,
   * saves the generated routine document, closes the wizard, and refreshes statistics.
   * 
   * @param {React.FormEvent} [e] - Form submission event.
   */
  const handleGenerateRoutineSubmit = async (e) => {
    e?.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      toast.error('Please verify that all steps are completed');
      return;
    }

    setFormSubmitting(true);
    try {
      const result = await studyRoutineApi.saveRoutine({ studentProfile: formData });
      if (result) {
        setRoutineDoc(result);
        setIsEditingProfile(false);
        toast.success('Your personalized AI study routine is ready!');
        loadStats();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to generate study routine. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Dashboard Action Handlers
  // --------------------------------------------------------------------------

  /**
   * handleToggleSegment
   * Toggles completion status (completed: true/false) of a specific routine segment.
   * Calls PATCH `/api/study-routine/:dayIndex/:segmentId/toggle`, updates state, and recalculates stats.
   * 
   * @param {number} dayNum - Day index number.
   * @param {string} segmentId - ID of the segment being toggled.
   */
  const handleToggleSegment = async (dayNum, segmentId) => {
    try {
      const res = await studyRoutineApi.toggleSegment(dayNum, segmentId);
      if (res && res.routine) {
        setRoutineDoc(res.routine);
        loadStats();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update segment');
    }
  };

  /**
   * handleStartFocusTimer
   * Initiates a live focus timer study session for a chosen routine segment.
   * Calls POST `/api/study-routine/session/start`, resets the local seconds counter to 0,
   * and renders the ticking live session bar across the top of the page.
   * 
   * @param {number} dayIndex - Index of current routine day.
   * @param {Object} segment - Routine segment being studied.
   */
  const handleStartFocusTimer = async (dayIndex, segment) => {
    try {
      const session = await studyRoutineApi.startSession({
        routineId: routineDoc?._id,
        segmentId: segment._id || segment.id,
        subject: segment.subject,
        chapter: segment.chapter
      });
      setActiveSession(session);
      setIsTimerPaused(false);
      setTimerSeconds(0);
      toast.success(`Focus session started for ${segment.subject}!`);
    } catch (err) {
      toast.error(err.message || 'Could not start focus timer');
    }
  };

  /**
   * handleStopFocusTimer
   * Halts the active study focus session and commits elapsed minutes to the database.
   * Calls POST `/api/study-routine/session/stop`, optionally marks the underlying
   * routine segment as complete, and reloads user statistics.
   * 
   * @param {boolean} [markCompleted=true] - Whether to mark the segment completed.
   */
  const handleStopFocusTimer = async (markCompleted = true) => {
    try {
      const res = await studyRoutineApi.stopSession({
        segmentId: activeSession?.segmentId,
        markCompleted
      });
      setActiveSession(null);
      setIsTimerPaused(false);
      setTimerSeconds(0);
      if (res && res.routine) {
        setRoutineDoc(res.routine);
      }
      toast.success(`Focus session saved! Great job staying focused.`);
      loadStats();
    } catch (err) {
      toast.error(err.message || 'Error ending session');
    }
  };

  /**
   * handleDeleteRoutine
   * Prompts the student with a confirmation dialog and deletes their entire study routine.
   * Calls DELETE `/api/study-routine`, cancels active sessions, and resets the UI to Step 1.
   */
  const handleDeleteRoutine = async () => {
    if (!window.confirm('Are you sure you want to delete your study routine? This cannot be undone.')) {
      return;
    }
    try {
      await studyRoutineApi.deleteRoutine();
      setRoutineDoc(null);
      setActiveSession(null);
      setCurrentStep(1);
      toast.success('Study routine deleted.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete routine');
    }
  };

  /**
   * handleSaveEditSegment
   * Submits the segment edit modal dialog.
   * Calls PUT `/api/study-routine/:dayIndex/:segmentId` to persist updated subject, chapter,
   * task, or timing adjustments, then closes the modal.
   * 
   * @param {React.FormEvent} e - Form submission event.
   */
  const handleSaveEditSegment = async (e) => {
    e.preventDefault();
    if (!editSegmentModal) return;
    const { dayIndex, segment } = editSegmentModal;
    try {
      const res = await studyRoutineApi.editSegment(dayIndex, segment._id || segment.id, segment);
      if (res && res.routine) {
        setRoutineDoc(res.routine);
        toast.success('Segment updated!');
      }
      setEditSegmentModal(null);
    } catch (err) {
      toast.error(err.message || 'Failed to edit segment');
    }
  };

  /**
   * handleGenerateNextWeek
   * Requests the AI to generate the next 7 days (Days 8-14) of the adaptive routine.
   * Analyzes subject completion rates from past days to adjust difficulty,
   * calls POST `/api/study-routine/ai/generate-week`, and appends new days.
   */
  const handleGenerateNextWeek = async () => {
    const confirmGen = window.confirm(
      'Generate the next 7 days based on your completion performance and progress?'
    );
    if (!confirmGen) return;

    const loadingToast = toast.loading('AI is building your next 7-day adaptive routine...');
    try {
      const res = await studyRoutineApi.aiGenerateWeek();
      if (res) {
        setRoutineDoc(res);
        toast.success('Next 7-day routine added successfully!', { id: loadingToast });
        loadStats();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to generate next week', { id: loadingToast });
    }
  };

  // --------------------------------------------------------------------------
  // AI Chat Assistant Handlers
  // --------------------------------------------------------------------------

  /**
   * handleSendAiMessage
   * Sends natural language instructions to the AI Study Coach (e.g., "Make tomorrow lighter").
   * Dispatches POST `/api/study-routine/ai/modify`, displays AI responses in the chat drawer,
   * and updates the live routine schedule seamlessly without page reloads.
   * 
   * @param {string} [textToSend] - Optional direct prompt (used by suggested chip buttons).
   */
  const handleSendAiMessage = async (textToSend) => {
    const query = textToSend || aiInputText;
    if (!query.trim()) return;

    const userMsg = { id: Date.now(), sender: 'user', text: query };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInputText('');
    setAiLoading(true);

    try {
      const res = await studyRoutineApi.aiModify(query, routineDoc?.routine);
      if (res) {
        if (res.routine) {
          setRoutineDoc((prev) => (prev ? { ...prev, routine: res.routine } : prev));
          loadStats();
        }
        const aiReply = {
          id: Date.now() + 1,
          sender: 'ai',
          text: res.reply || "I've updated your schedule according to your request!"
        };
        setAiMessages((prev) => [...prev, aiReply]);
      }
    } catch (err) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: "I'm sorry, I couldn't modify the routine right now. Please try again."
        }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Calculated Dashboard Stats (Memoized)
  // --------------------------------------------------------------------------
  const currentDaysList = useMemo(() => routineDoc?.routine || [], [routineDoc]);

  const selectedDay = useMemo(() => {
    if (!currentDaysList.length) return null;
    return currentDaysList[selectedDayIndex] || currentDaysList[0];
  }, [currentDaysList, selectedDayIndex]);

  const overallProgress = useMemo(() => {
    let total = 0;
    let completed = 0;
    currentDaysList.forEach((day) => {
      if (!day.isRest && Array.isArray(day.segments)) {
        day.segments.forEach((s) => {
          total++;
          if (s.completed) completed++;
        });
      }
    });
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [currentDaysList]);

  const daysToExam = useMemo(() => {
    const examDateStr = routineDoc?.examInfo?.examDate || routineDoc?.studentProfile?.examDate;
    if (!examDateStr) return null;
    const diff = differenceInDays(new Date(examDateStr), new Date());
    return diff >= 0 ? diff : 0;
  }, [routineDoc]);

  // If page is loading initially
  if (loading) {
    return (
      <div className="dashboard-container study-routine-page">
        <Sidebar user={user} activeTab="study-routine" />
        <main className="study-routine-main">
          <div className="sr-content-wrapper">
            <div className="sr-loading-state">
              <div className="sr-spinner" />
              <div className="sr-loading-text">Loading your study routine...</div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Sliding Card Wizard (If no routine exists or editing profile)
  // --------------------------------------------------------------------------
  if (!routineDoc || isEditingProfile) {
    return (
      <div className="dashboard-container study-routine-page">
        <Sidebar user={user} activeTab="study-routine" />
        <main className="study-routine-main">
          <div className="sr-content-wrapper">
            <div className="sr-wizard-container">
              <div className="sr-wizard-header">
                <h2>{isEditingProfile ? 'Edit Study Profile' : 'Build Your Custom AI Study Routine'}</h2>
                <p>
                  Complete the 6 sliding steps below. Our AI will craft an optimized, realistic daily routine for your syllabus.
                </p>
                {isEditingProfile && (
                  <button
                    type="button"
                    className="sr-btn sr-btn--secondary"
                    style={{ marginTop: '12px' }}
                    onClick={() => setIsEditingProfile(false)}
                  >
                    ← Back to Dashboard
                  </button>
                )}
              </div>

            {/* Step Navigation Rail */}
            <div className="sr-step-rail">
              {WIZARD_STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                return (
                  <button
                    type="button"
                    key={step.id}
                    className={`sr-step-item ${isActive ? 'sr-step-item--active' : ''} ${
                      isCompleted ? 'sr-step-item--completed' : ''
                    }`}
                    onClick={() => handleJumpToStep(step.id)}
                  >
                    <span className="sr-step-number">
                      {isCompleted ? '✓' : step.id}
                    </span>
                    <span className="sr-step-label">{step.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="sr-wizard-progress-bar-wrap">
              <div
                className="sr-wizard-progress-bar-fill"
                style={{ width: `${(currentStep / 6) * 100}%` }}
              />
            </div>

            {formSubmitting ? (
              <div className="sr-loading-state">
                <div className="sr-spinner" />
                <div className="sr-loading-text">Our AI is building your personalized routine...</div>
                <div className="sr-loading-subtext">
                  Balancing subject priorities, study breaks, and exam targets.
                </div>
              </div>
            ) : (
              <div className="sr-card-deck-wrapper">
                <AnimatePresence mode="wait" custom={slideDirection}>
                  <motion.div
                    key={currentStep}
                    custom={slideDirection}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="sr-sliding-card"
                  >
                    <div className="sr-card-badge">
                      Step {currentStep} of 6 · {WIZARD_STEPS[currentStep - 1]?.title}
                    </div>

                    {/* CARD 1: Academic Information */}
                    {currentStep === 1 && (
                      <div>
                        <div className="sr-section-title">
                          <span>Academic Information</span>
                        </div>
                        <div className="sr-grid-2">
                          <div className="sr-form-group">
                            <label className="sr-label">
                              Academic Level <span className="sr-required">*</span>
                            </label>
                            <select
                              className="sr-select"
                              value={formData.academicLevel}
                              onChange={(e) => setFormData({ ...formData, academicLevel: e.target.value })}
                              required
                            >
                              <option value="HSC 1st Year">HSC 1st Year</option>
                              <option value="HSC 2nd Year">HSC 2nd Year</option>
                              <option value="Admission Candidate">Admission Candidate</option>
                              <option value="University Student">University Student</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">
                              Stream / Group <span className="sr-required">*</span>
                            </label>
                            <select
                              className="sr-select"
                              value={formData.stream}
                              onChange={(e) => handleStreamChange(e.target.value)}
                              required
                            >
                              <option value="Science">Science</option>
                              <option value="Business Studies">Business Studies</option>
                              <option value="Humanities">Humanities</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Medium</label>
                            <select
                              className="sr-select"
                              value={formData.medium}
                              onChange={(e) => setFormData({ ...formData, medium: e.target.value })}
                            >
                              <option value="Bangla Medium">Bangla Medium</option>
                              <option value="English Medium">English Medium</option>
                              <option value="English Version">English Version</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Institution Name</label>
                            <input
                              type="text"
                              className="sr-input"
                              placeholder="e.g. Notre Dame College, Dhaka College"
                              value={formData.institution}
                              onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD 2: Exam Target */}
                    {currentStep === 2 && (
                      <div>
                        <div className="sr-section-title">
                          <span>Exam Target & Timeline</span>
                        </div>
                        <div className="sr-grid-2">
                          <div className="sr-form-group">
                            <label className="sr-label">
                              Preparing for which exam? <span className="sr-required">*</span>
                            </label>
                            <select
                              className="sr-select"
                              value={formData.examTarget}
                              onChange={(e) => setFormData({ ...formData, examTarget: e.target.value })}
                              required
                            >
                              <option value="HSC Board Exam">HSC Board Exam</option>
                              <option value="Admission Test (Medical)">Admission Test (Medical)</option>
                              <option value="Admission Test (Engineering)">Admission Test (Engineering)</option>
                              <option value="Admission Test (University)">Admission Test (University)</option>
                              <option value="Test Exam">Test Exam</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">
                              Approximate Exam Date <span className="sr-required">*</span>
                            </label>
                            <input
                              type="date"
                              className="sr-input"
                              value={formData.examDate}
                              min={todayKey()}
                              onChange={(e) => handleExamDateChange(e.target.value)}
                              required
                            />
                            {calculatedExamDays !== null && calculatedExamDays > 0 && (
                              <div className="sr-date-countdown-badge">
                                <HiClock className="sr-countdown-icon" size={15} />
                                <span>
                                  <strong>{calculatedExamDays} {calculatedExamDays === 1 ? 'day' : 'days'}</strong> remaining (~{formatRemainingTimeline(calculatedExamDays)})
                                </span>
                              </div>
                            )}
                            {formErrors.examDate && (
                              <span style={{ color: '#CF1322', fontSize: '0.8rem' }}>{formErrors.examDate}</span>
                            )}
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">
                              Target GPA / Score <span className="sr-required">*</span>
                            </label>
                            <input
                              type="text"
                              className="sr-input"
                              placeholder="e.g. GPA 5.00, BUET Top 500, Medical Merit"
                              value={formData.targetGpa}
                              onChange={(e) => setFormData({ ...formData, targetGpa: e.target.value })}
                              required
                            />
                          </div>

                          <div className="sr-form-group">
                            <div className="sr-label-with-action">
                              <label className="sr-label">Plan Duration</label>
                              {calculatedExamDays !== null && calculatedExamDays > 0 && (
                                <button
                                  type="button"
                                  className="sr-link-btn"
                                  onClick={() => setFormData((prev) => ({ ...prev, planDuration: `${calculatedExamDays} days` }))}
                                  title="Sync plan duration with exact counted days until exam"
                                >
                                  <span>Sync ({calculatedExamDays}d)</span>
                                </button>
                              )}
                            </div>
                            
                            <input
                              type="text"
                              className="sr-input"
                              placeholder="e.g. 30 days, 45 days"
                              value={formData.planDuration}
                              onChange={(e) => setFormData({ ...formData, planDuration: e.target.value })}
                              required
                            />

                            {/* Quick Preset Duration Chips */}
                            <div className="sr-chips-grid" style={{ marginTop: '6px' }}>
                              {calculatedExamDays !== null && calculatedExamDays > 0 && (
                                <button
                                  type="button"
                                  className={`sr-chip ${formData.planDuration === `${calculatedExamDays} days` ? 'sr-chip--selected' : ''}`}
                                  onClick={() => setFormData((prev) => ({ ...prev, planDuration: `${calculatedExamDays} days` }))}
                                >
                                  ⚡ {calculatedExamDays} days (Auto)
                                </button>
                              )}
                              {['15 days', '30 days', '45 days', '60 days', '90 days'].map((dur) => (
                                <button
                                  type="button"
                                  key={dur}
                                  className={`sr-chip ${formData.planDuration === dur ? 'sr-chip--selected' : ''}`}
                                  onClick={() => setFormData((prev) => ({ ...prev, planDuration: dur }))}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>

                            {calculatedExamDays !== null && calculatedExamDays > 0 ? (
                              <div className="sr-plan-duration-hint">
                                {formData.planDuration === `${calculatedExamDays} days` ? (
                                  <span className="sr-text-success">
                                    ✓ Automatically filled from exam date ({calculatedExamDays} days remaining)
                                  </span>
                                ) : (
                                  <span className="sr-text-muted">
                                    Exam in {calculatedExamDays} days ({formatRemainingTimeline(calculatedExamDays)}) · Custom duration
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="sr-plan-duration-hint">
                                <span className="sr-text-muted">
                                  Select an approximate exam date above to automatically compute and fill duration
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD 3: Subjects & Weak Areas */}
                    {currentStep === 3 && (
                      <div>
                        <div className="sr-section-title">
                          <span>Subjects, Chapters & Weak Areas</span>
                        </div>

                        <div className="sr-form-group">
                          <label className="sr-label">
                            Select Subjects <span className="sr-required">*</span>
                          </label>
                          <div className="sr-chips-grid">
                            {(STREAM_SUBJECTS[formData.stream] || []).map((sub) => {
                              const isSelected = formData.subjects.includes(sub);
                              return (
                                <button
                                  type="button"
                                  key={sub}
                                  className={`sr-chip ${isSelected ? 'sr-chip--selected' : ''}`}
                                  onClick={() => handleSubjectToggle(sub)}
                                >
                                  {isSelected ? '✓ ' : '+ '} {sub}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Subject configurations */}
                        {formData.subjects.map((sub) => (
                          <div key={sub} className="sr-subject-config-box">
                            <div className="sr-subject-config-header">
                              <span>{sub}</span>
                              <span style={{ fontSize: '0.85rem', color: '#8c7b79' }}>
                                Confidence: {formData.subjectConfidence[sub] || 3}/5
                              </span>
                            </div>

                            <div className="sr-paper-checkboxes">
                              {['1st Paper', '2nd Paper'].map((p) => {
                                const checked = (formData.subjectPapers[sub] || []).includes(p);
                                return (
                                  <label key={p} className="sr-checkbox-label">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handlePaperToggle(sub, p)}
                                    />
                                    <span className="sr-checkbox-custom" />
                                    <span>{p}</span>
                                  </label>
                                );
                              })}
                            </div>

                            <div className="sr-form-group" style={{ marginBottom: '12px' }}>
                              <label className="sr-label" style={{ fontSize: '0.82rem' }}>
                                Key Chapters to Cover:
                              </label>
                              <div className="sr-tag-input-container">
                                {(formData.subjectChapters[sub] || []).map((chap) => (
                                  <span key={chap} className="sr-tag-pill">
                                    {chap}
                                    <button
                                      type="button"
                                      className="sr-tag-remove"
                                      onClick={() => handleRemoveChapterTag(sub, chap)}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {(() => {
                                  const currentSet = new Set(formData.subjectChapters[sub] || []);
                                  const selectedPapers = formData.subjectPapers[sub] || [];
                                  const uniqueChapters = selectedPapers
                                    .flatMap((p) => MOCK_CHAPTERS[sub]?.[p] || [])
                                    .filter((ch) => !currentSet.has(ch));
                                  if (uniqueChapters.length === 0) return null;
                                  return (
                                    <select
                                      className="sr-chapter-select"
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          handleAddChapterTag(sub, e.target.value);
                                          e.target.value = '';
                                        }
                                      }}
                                    >
                                      <option value="" disabled>Select chapter...</option>
                                      {uniqueChapters.map((ch) => (
                                        <option key={ch} value={ch}>{ch}</option>
                                      ))}
                                    </select>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Confidence slider */}
                            <div className="sr-form-group" style={{ marginBottom: 0 }}>
                              <div className="sr-slider-row">
                                <span style={{ fontSize: '0.8rem', color: '#8c7b79' }}>Weak (1)</span>
                                <input
                                  type="range"
                                  min="1"
                                  max="5"
                                  className="sr-range-slider"
                                  value={formData.subjectConfidence[sub] || 3}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      subjectConfidence: {
                                        ...formData.subjectConfidence,
                                        [sub]: Number(e.target.value)
                                      }
                                    })
                                  }
                                />
                                <span style={{ fontSize: '0.8rem', color: '#8c7b79' }}>Strong (5)</span>
                                <span
                                  className="sr-slider-value-badge"
                                  style={{
                                    background:
                                      (formData.subjectConfidence[sub] || 3) <= 2
                                        ? '#FFF1F0'
                                        : (formData.subjectConfidence[sub] || 3) === 3
                                        ? '#FFFBE6'
                                        : '#F6FFED',
                                    color:
                                      (formData.subjectConfidence[sub] || 3) <= 2
                                        ? '#CF1322'
                                        : (formData.subjectConfidence[sub] || 3) === 3
                                        ? '#D48806'
                                        : '#389E0D'
                                  }}
                                >
                                  {(formData.subjectConfidence[sub] || 3) <= 2
                                    ? 'Needs Work'
                                    : (formData.subjectConfidence[sub] || 3) === 3
                                    ? 'Moderate'
                                    : 'Confident'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="sr-form-group" style={{ marginTop: '20px' }}>
                          <label className="sr-label">
                            Which subjects are WEAKEST? (Will receive high priority slots)
                          </label>
                          <div className="sr-chips-grid">
                            {formData.subjects.map((sub) => {
                              const isWeak = formData.weakSubjects.includes(sub);
                              return (
                                <button
                                  type="button"
                                  key={sub}
                                  className={`sr-chip ${isWeak ? 'sr-chip--selected' : ''}`}
                                  onClick={() => {
                                    const exists = formData.weakSubjects.includes(sub);
                                    setFormData({
                                      ...formData,
                                      weakSubjects: exists
                                        ? formData.weakSubjects.filter((s) => s !== sub)
                                        : [...formData.weakSubjects, sub]
                                    });
                                  }}
                                >
                                  {isWeak ? 'Weak' : '+ '} {sub}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD 4: Daily Schedule & Availability */}
                    {currentStep === 4 && (
                      <div>
                        <div className="sr-section-title">
                          <span>Daily Schedule & Availability</span>
                        </div>
                        <div className="sr-grid-2">
                          <div className="sr-form-group">
                            <label className="sr-label">
                              Wake-up Time <span className="sr-required">*</span>
                            </label>
                            <input
                              type="time"
                              className="sr-input"
                              value={formData.wakeUpTime}
                              onChange={(e) => setFormData({ ...formData, wakeUpTime: e.target.value })}
                              required
                            />
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">
                              Sleep Time <span className="sr-required">*</span>
                            </label>
                            <input
                              type="time"
                              className="sr-input"
                              value={formData.sleepTime}
                              onChange={(e) => setFormData({ ...formData, sleepTime: e.target.value })}
                              required
                            />
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Study Days Per Week</label>
                            <select
                              className="sr-select"
                              value={formData.studyDaysPerWeek}
                              onChange={(e) => setFormData({ ...formData, studyDaysPerWeek: e.target.value })}
                            >
                              <option value="5">5 days</option>
                              <option value="6">6 days</option>
                              <option value="7">7 days (All week)</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Daily Target Study Hours</label>
                            <select
                              className="sr-select"
                              value={formData.dailyStudyHours}
                              onChange={(e) => setFormData({ ...formData, dailyStudyHours: e.target.value })}
                            >
                              <option value="3-4 hours">3-4 hours</option>
                              <option value="5-6 hours">5-6 hours</option>
                              <option value="7-8 hours">7-8 hours</option>
                              <option value="9-10 hours">9-10 hours</option>
                              <option value="10+ hours">10+ hours</option>
                            </select>
                          </div>
                        </div>

                        {/* Rest Days */}
                        <div className="sr-form-group" style={{ marginTop: '12px' }}>
                          <label className="sr-label">Rest / Lighter Days</label>
                          <div className="sr-chips-grid">
                            {DAYS_OF_WEEK.map((d) => {
                              const isRest = formData.restDays.includes(d);
                              return (
                                <button
                                  type="button"
                                  key={d}
                                  className={`sr-chip ${isRest ? 'sr-chip--selected' : ''}`}
                                  onClick={() => handleRestDayToggle(d)}
                                >
                                  {isRest ? 'Rest' : ''} {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Unavailable Blocks */}
                        <div className="sr-form-group" style={{ marginTop: '16px' }}>
                          <div className="sr-time-blocks-header">
                            <label className="sr-label">Unavailable Time Blocks (College, Coaching, Tuition)</label>
                            <button
                              type="button"
                              className="sr-btn sr-btn--secondary"
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                              onClick={handleAddUnavailableBlock}
                            >
                              + Add Time Block
                            </button>
                          </div>

                          {formData.unavailableBlocks.map((block, idx) => (
                            <div key={idx} className="sr-repeater-row">
                              <div className="sr-repeater-times">
                                <input
                                  type="time"
                                  className="sr-input"
                                  aria-label="Start Time"
                                  value={block.startTime}
                                  onChange={(e) => {
                                    const updated = [...formData.unavailableBlocks];
                                    updated[idx].startTime = e.target.value;
                                    setFormData({ ...formData, unavailableBlocks: updated });
                                  }}
                                />
                                <span className="sr-repeater-sep">to</span>
                                <input
                                  type="time"
                                  className="sr-input"
                                  aria-label="End Time"
                                  value={block.endTime}
                                  onChange={(e) => {
                                    const updated = [...formData.unavailableBlocks];
                                    updated[idx].endTime = e.target.value;
                                    setFormData({ ...formData, unavailableBlocks: updated });
                                  }}
                                />
                              </div>
                              <div className="sr-repeater-info">
                                <input
                                  type="text"
                                  className="sr-input"
                                  placeholder="Label (e.g. College)"
                                  aria-label="Time block label"
                                  value={block.label}
                                  onChange={(e) => {
                                    const updated = [...formData.unavailableBlocks];
                                    updated[idx].label = e.target.value;
                                    setFormData({ ...formData, unavailableBlocks: updated });
                                  }}
                                />
                                <button
                                  type="button"
                                  className="sr-btn sr-btn--danger sr-repeater-del-btn"
                                  aria-label="Remove time block"
                                  onClick={() => handleRemoveUnavailableBlock(idx)}
                                >
                                  <HiTrash />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CARD 5: Study Habits & Preferences */}
                    {currentStep === 5 && (
                      <div>
                        <div className="sr-section-title">
                          <span>Study Habits & Preferences</span>
                        </div>
                        <div className="sr-grid-2">
                          <div className="sr-form-group">
                            <label className="sr-label">Best Time to Study</label>
                            <select
                              className="sr-select"
                              value={formData.bestStudyTime}
                              onChange={(e) => setFormData({ ...formData, bestStudyTime: e.target.value })}
                            >
                              <option value="Early Morning">Early Morning (5 AM - 8 AM)</option>
                              <option value="Morning">Morning (8 AM - 12 PM)</option>
                              <option value="Afternoon">Afternoon (2 PM - 5 PM)</option>
                              <option value="Evening">Evening (6 PM - 9 PM)</option>
                              <option value="Late Night">Late Night (10 PM - 1 AM)</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Focus Duration per Stretch</label>
                            <select
                              className="sr-select"
                              value={formData.focusDuration}
                              onChange={(e) => setFormData({ ...formData, focusDuration: e.target.value })}
                            >
                              <option value="25 min (Pomodoro)">25 min (Pomodoro)</option>
                              <option value="45 min">45 min</option>
                              <option value="60 min">60 min</option>
                              <option value="90 min">90 min</option>
                              <option value="2+ hours">2+ hours</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Subject Mixing Style</label>
                            <select
                              className="sr-select"
                              value={formData.subjectMixing}
                              onChange={(e) => setFormData({ ...formData, subjectMixing: e.target.value })}
                            >
                              <option value="Single subject per day">Single subject per day</option>
                              <option value="Mix 2-3 subjects">Mix 2-3 subjects</option>
                              <option value="Mix as many as possible">Mix as many as possible</option>
                            </select>
                          </div>

                          <div className="sr-form-group">
                            <label className="sr-label">Break Scheduling</label>
                            <select
                              className="sr-select"
                              value={formData.breakScheduling}
                              onChange={(e) => setFormData({ ...formData, breakScheduling: e.target.value })}
                            >
                              <option value="Short breaks (15 min) between sessions">
                                Short breaks (15 min) between sessions
                              </option>
                              <option value="Long breaks (30 min) after every 2 sessions">
                                Long breaks (30 min) after every 2 sessions
                              </option>
                              <option value="Minimal breaks">Minimal breaks</option>
                              <option value="No breaks">No breaks</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD 6: Motivation & Goals */}
                    {currentStep === 6 && (
                      <div className="sr-professional-slide">
                        <div className="sr-section-title">
                          <span>Motivation, Challenges & Launch</span>
                        </div>

                        <div className="sr-form-group">
                          <label className="sr-label">What motivates you?</label>
                          <div className="sr-chips-grid">
                            {MOTIVATION_OPTIONS.map((opt) => {
                              const selected = formData.motivations.includes(opt);
                              return (
                                <button
                                  type="button"
                                  key={opt}
                                  className={`sr-chip sr-chip--professional ${selected ? 'sr-chip--selected' : ''}`}
                                  onClick={() => {
                                    const exists = formData.motivations.includes(opt);
                                    setFormData({
                                      ...formData,
                                      motivations: exists
                                        ? formData.motivations.filter((m) => m !== opt)
                                        : [...formData.motivations, opt]
                                    });
                                  }}
                                >
                                  <span className="sr-chip-icon">{selected ? <HiCheck /> : <HiPlus />}</span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="sr-form-group" style={{ marginTop: '16px' }}>
                          <label className="sr-label">Biggest Challenges</label>
                          <div className="sr-chips-grid">
                            {CHALLENGE_OPTIONS.map((opt) => {
                              const selected = formData.challenges.includes(opt);
                              return (
                                <button
                                  type="button"
                                  key={opt}
                                  className={`sr-chip sr-chip--professional ${selected ? 'sr-chip--selected' : ''}`}
                                  onClick={() => {
                                    const exists = formData.challenges.includes(opt);
                                    setFormData({
                                      ...formData,
                                      challenges: exists
                                        ? formData.challenges.filter((c) => c !== opt)
                                        : [...formData.challenges, opt]
                                    });
                                  }}
                                >
                                  <span className="sr-chip-icon">{selected ? <HiCheck /> : <HiPlus />}</span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="sr-form-group" style={{ marginTop: '16px' }}>
                          <label className="sr-label">Preferred Start Date</label>
                          <input
                            type="date"
                            className="sr-input"
                            value={formData.preferredStartDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                          />
                        </div>

                        <div className="sr-form-group" style={{ marginTop: '16px' }}>
                          <label className="sr-label">Additional Instructions for AI (Optional)</label>
                          <textarea
                            className="sr-textarea"
                            placeholder="e.g., Please give more time to Organic Chemistry on weekends, keep Friday mornings free for prayer/family..."
                            value={formData.additionalNotes}
                            onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Sliding Wizard Navigation Bottom Bar */}
                <div className="sr-wizard-nav-bar">
                  <button
                    type="button"
                    className="sr-btn sr-btn--secondary"
                    disabled={currentStep === 1}
                    onClick={handlePrevStep}
                  >
                    <HiArrowLeft />
                    <span>Previous Step</span>
                  </button>

                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#5c4d4c' }}>
                    Step {currentStep} of 6
                  </span>

                  {currentStep < 6 ? (
                    <button
                      type="button"
                      className="sr-btn sr-btn--primary"
                      onClick={handleNextStep}
                    >
                      <span>Continue</span>
                      <HiArrowRight />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="sr-generate-btn"
                      style={{ padding: '12px 28px', fontSize: '1rem' }}
                      disabled={formSubmitting}
                      onClick={handleGenerateRoutineSubmit}
                    >
                      <span>Generate My Routine</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

  // --------------------------------------------------------------------------
  // RENDER: Routine Dashboard View
  // --------------------------------------------------------------------------
  return (
    <div className="dashboard-container study-routine-page">
      <Sidebar user={user} activeTab="study-routine" />

      <main className="study-routine-main">
        <div className="sr-content-wrapper">
          {/* Header Hero Card */}
          <section className="sr-hero">
            <div className="sr-hero__header">
              <div className="sr-hero__title-area">
                <div className="sr-hero__kicker">
                  <HiAcademicCap size={18} />
                  <span>Smart Academic Planner</span>
                </div>
                <h1 className="sr-hero__title">
                  {routineDoc?.studentProfile?.examTarget || 'Study Routine & Dashboard'}
                </h1>
                <p className="sr-hero__subtitle">
                  Level: {routineDoc?.studentProfile?.academicLevel || 'HSC'} · Stream: {routineDoc?.studentProfile?.stream || 'Science'}
                </p>
              </div>

              <div className="sr-hero__meta-badges">
                {daysToExam !== null && (
                  <span className="sr-badge sr-badge--accent">
                    {daysToExam} days until exam
                  </span>
                )}
                {routineDoc?.studentProfile?.targetGpa && (
                  <span className="sr-badge">
                    Target: {routineDoc.studentProfile.targetGpa}
                  </span>
                )}
                {statsData?.currentStreak > 0 && (
                  <span className="sr-badge sr-badge--urgent">
                    {statsData.currentStreak} day streak
                  </span>
                )}
              </div>

              <div className="sr-hero__actions">
                <button
                  type="button"
                  className="sr-btn sr-btn--secondary"
                  onClick={() => {
                    setCurrentStep(1);
                    setIsEditingProfile(true);
                  }}
                  title="Edit profile and regenerate"
                >
                  <HiPencil />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn--secondary"
                  onClick={handleGenerateRoutineSubmit}
                  title="Regenerate routine with fresh AI schedule"
                >
                  <HiRefresh />
                  <span>Regenerate</span>
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn--danger"
                  onClick={handleDeleteRoutine}
                  title="Delete routine"
                  aria-label="Delete routine"
                >
                  <HiTrash />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="sr-hero__progress-box">
              <div className="sr-progress-info">
                <span className="sr-progress-label">Total Curriculum Progress</span>
                <span className="sr-progress-metric">
                  {overallProgress.completed} of {overallProgress.total} tasks completed ({overallProgress.percentage}%)
                </span>
              </div>
              <div className="sr-progress-bar-container">
                <div
                  className="sr-progress-bar-fill"
                  style={{ width: `${overallProgress.percentage}%` }}
                />
              </div>
            </div>
          </section>

          {/* View Switcher Tabs */}
          <div className="sr-view-tabs">
            <button
              type="button"
              className={`sr-tab-btn ${activeView === 'day' ? 'sr-tab-btn--active' : ''}`}
              onClick={() => setActiveView('day')}
            >
              <HiClock />
              <span>Day View</span>
            </button>
            <button
              type="button"
              className={`sr-tab-btn ${activeView === 'week' ? 'sr-tab-btn--active' : ''}`}
              onClick={() => setActiveView('week')}
            >
              <HiCalendar />
              <span>Week View</span>
            </button>
            <button
              type="button"
              className={`sr-tab-btn ${activeView === 'month' ? 'sr-tab-btn--active' : ''}`}
              onClick={() => setActiveView('month')}
            >
              <HiBookOpen />
              <span>Month View</span>
            </button>
            <button
              type="button"
              className={`sr-tab-btn ${activeView === 'stats' ? 'sr-tab-btn--active' : ''}`}
              onClick={() => setActiveView('stats')}
            >
              <HiChartBar />
              <span>Analytics & Stats</span>
            </button>
          </div>

          {/* Active Focus Session Banner (if running) */}
          {activeSession && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="sr-active-session-banner"
            >
              <div className="sr-active-session-info">
                <div className="sr-pulse-dot" />
                <div className="sr-active-session-text">
                  <strong className="sr-active-session-subject">
                    Live Focus Session: {activeSession.subject}
                  </strong>
                  {activeSession.chapter && (
                    <span className="sr-active-session-chapter">
                      ({activeSession.chapter})
                    </span>
                  )}
                </div>
              </div>

              <div className="sr-active-session-controls">
                <div className={`sr-timer-badge ${isTimerPaused ? 'sr-timer-badge--paused' : ''}`}>
                  {formatTimerDisplay(timerSeconds)}
                  {isTimerPaused && <span className="sr-timer-paused-label">Paused</span>}
                </div>
                <button
                  type="button"
                  className={`sr-btn ${isTimerPaused ? 'sr-btn--primary' : 'sr-btn--secondary'}`}
                  onClick={() => {
                    setIsTimerPaused((prev) => !prev);
                    toast(isTimerPaused ? 'Focus timer resumed' : 'Focus timer paused', {
                      icon: isTimerPaused ? '▶' : '⏸'
                    });
                  }}
                  title={isTimerPaused ? 'Resume focus timer' : 'Pause focus timer (does not save to database)'}
                >
                  {isTimerPaused ? <HiPlay size={16} /> : <HiPause size={16} />}
                  <span>{isTimerPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  type="button"
                  className="sr-btn sr-btn--primary sr-btn--session-complete"
                  onClick={() => handleStopFocusTimer(true)}
                  title="Stop timer, complete task, and save progress to database"
                >
                  <HiStop size={16} />
                  <span>Complete & Save</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ------------------------------------------------------------------
              VIEW 1: Day View
             ------------------------------------------------------------------ */}
          {activeView === 'day' && (
            <div className="sr-day-view">
              {/* Day Nav Bar */}
              <div className="sr-day-nav">
                <button
                  type="button"
                  className="sr-day-nav__btn sr-day-nav__btn--prev"
                  disabled={selectedDayIndex <= 0}
                  onClick={() => setSelectedDayIndex((prev) => Math.max(0, prev - 1))}
                  aria-label="Previous day"
                >
                  <HiChevronLeft />
                  <span className="sr-day-nav__btn-text">Previous Day</span>
                </button>

                <div className="sr-day-nav__current">
                  <span className="sr-day-nav__title">
                    Day {selectedDay?.day || selectedDayIndex + 1}
                    {selectedDay?.isRest ? ' (Rest Day)' : ''}
                  </span>
                  <span className="sr-day-nav__date">
                    {selectedDay?.dayDate
                      ? format(new Date(selectedDay.dayDate), 'EEEE, MMMM d, yyyy')
                      : 'Scheduled Date'}
                  </span>
                </div>

                <div className="sr-day-nav__actions">
                  <button
                    type="button"
                    className="sr-day-nav__btn sr-day-nav__btn--today"
                    onClick={() => {
                      const todayIdx = currentDaysList.findIndex((d) =>
                        isSameDay(new Date(d.dayDate), new Date())
                      );
                      setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
                    }}
                  >
                    <span>Today</span>
                  </button>
                  <button
                    type="button"
                    className="sr-day-nav__btn sr-day-nav__btn--next"
                    disabled={selectedDayIndex >= currentDaysList.length - 1}
                    onClick={() =>
                      setSelectedDayIndex((prev) =>
                        Math.min(currentDaysList.length - 1, prev + 1)
                      )
                    }
                    aria-label="Next day"
                  >
                    <span className="sr-day-nav__btn-text">Next Day</span>
                    <HiChevronRight />
                  </button>
                </div>
              </div>

              {/* Rest Day Message */}
              {selectedDay?.isRest ? (
                <div className="sr-rest-day-card">
                  <div className="sr-rest-icon"><HiCalendar size={48} /></div>
                  <h3 className="sr-rest-title">Rest & Rejuvenation Day</h3>
                  <p className="sr-rest-desc">
                    You’ve earned this break! Rest is a vital part of effective memory consolidation.
                    Spend time on light reading, physical exercise, or your favorite hobby.
                  </p>
                </div>
              ) : (
                /* Timeline Schedule */
                <div className="sr-timeline">
                  {(!selectedDay?.segments || selectedDay.segments.length === 0) && (
                    <div className="sr-section-card" style={{ textAlign: 'center', padding: '40px' }}>
                      <p style={{ color: '#8c7b79' }}>No segments scheduled for this day.</p>
                    </div>
                  )}

                  {selectedDay?.segments?.map((seg) => {
                    const colors = getSubjectColor(seg.subject);
                    const isThisSessionActive =
                      activeSession &&
                      (activeSession.segmentId === seg._id || activeSession.segmentId === seg.id);

                    return (
                      <motion.div
                        key={seg._id || seg.id}
                        layout
                        className={`sr-segment-card ${
                          seg.completed ? 'sr-segment-card--completed' : ''
                        } ${isThisSessionActive ? 'sr-segment-card--active-timer' : ''}`}
                      >
                        <div className="sr-segment-left">
                          {/* Custom Completion Checkbox Button */}
                          <button
                            type="button"
                            className={`sr-checkbox-custom ${
                              seg.completed ? 'sr-checkbox-custom--checked' : ''
                            }`}
                            onClick={() =>
                              handleToggleSegment(selectedDay.day, seg._id || seg.id)
                            }
                            title={seg.completed ? 'Mark incomplete' : 'Mark complete'}
                            aria-label={seg.completed ? 'Mark incomplete' : 'Mark complete'}
                          >
                            {seg.completed && <HiCheck size={16} />}
                          </button>

                          <div className="sr-segment-content">
                            <div className="sr-segment-meta">
                              <span className="sr-time-badge">
                                <HiClock />
                                <span>{seg.time} ({seg.estimatedMinutes || 60}m)</span>
                              </span>

                              <span
                                className="sr-subject-badge"
                                style={{
                                  background: colors.bg,
                                  color: colors.text,
                                  border: `1px solid ${colors.border}`
                                }}
                              >
                                {seg.subject}
                              </span>

                              {seg.paper && (
                                <span className="sr-badge sr-badge--paper">
                                  {seg.paper}
                                </span>
                              )}

                              {seg.priority && (
                                <span className={`sr-priority-badge sr-priority-badge--${seg.priority}`}>
                                  {seg.priority}
                                </span>
                              )}
                            </div>

                            <div className="sr-segment-title">
                              {seg.chapter ? `${seg.chapter}` : seg.subject}
                            </div>

                            <div className="sr-segment-task">{seg.task}</div>
                          </div>
                        </div>

                        <div className="sr-segment-right">
                          {isThisSessionActive ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                className={`sr-btn ${isTimerPaused ? 'sr-btn--primary' : 'sr-btn--secondary'}`}
                                style={{ minHeight: '34px', padding: '6px 10px', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setIsTimerPaused((prev) => !prev);
                                  toast(isTimerPaused ? 'Focus timer resumed' : 'Focus timer paused', {
                                    icon: isTimerPaused ? '▶' : '⏸'
                                  });
                                }}
                                title={isTimerPaused ? 'Resume timer' : 'Pause timer (does not save to database)'}
                              >
                                {isTimerPaused ? <HiPlay size={14} /> : <HiPause size={14} />}
                                <span>{isTimerPaused ? 'Resume' : 'Pause'}</span>
                              </button>
                              <button
                                type="button"
                                className="sr-btn sr-btn--primary sr-btn--active-stop"
                                style={{ minHeight: '34px', padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={() => handleStopFocusTimer(true)}
                                title="Stop and save session to database"
                              >
                                <HiStop size={14} />
                                <span>Stop ({formatTimerDisplay(timerSeconds)})</span>
                              </button>
                            </div>
                          ) : (
                            !seg.completed && (
                              <button
                                type="button"
                                className="sr-btn sr-btn--secondary sr-btn--start-focus"
                                onClick={() => handleStartFocusTimer(selectedDay.day, seg)}
                                title="Start stopwatch focus timer for this segment"
                              >
                                <HiPlay />
                                <span>Start Focus</span>
                              </button>
                            )
                          )}

                          <button
                            type="button"
                            className="sr-btn sr-btn--secondary sr-btn--icon-only"
                            onClick={() =>
                              setEditSegmentModal({
                                dayIndex: selectedDay.day,
                                segment: { ...seg }
                              })
                            }
                            title="Edit segment"
                            aria-label="Edit segment"
                          >
                            <HiPencil size={16} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------------
              VIEW 2: Week View
             ------------------------------------------------------------------ */}
          {activeView === 'week' && (
            <div className="sr-week-wrapper">
              <div className="sr-week-mobile-hint">
                <span>← Swipe horizontally to explore 7-day schedule · Tap day to inspect →</span>
              </div>
              <div className="sr-week-grid">
            {currentDaysList.map((day, idx) => {
              const dayDate = day.dayDate ? new Date(day.dayDate) : null;
              const isToday = dayDate ? isSameDay(dayDate, new Date()) : false;
              const completedCount = (day.segments || []).filter((s) => s.completed).length;
              const totalCount = (day.segments || []).length;
              const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={day.day || idx}
                  className={`sr-week-col ${isToday ? 'sr-week-col--current' : ''}`}
                  onClick={() => {
                    setSelectedDayIndex(idx);
                    setActiveView('day');
                  }}
                >
                  <div className="sr-week-col__header">
                    <div className="sr-week-col__day-name">
                      Day {day.day} {isToday ? '· Today' : ''}
                    </div>
                    <div className="sr-week-col__date">
                      {dayDate ? format(dayDate, 'EEE, MMM d') : ''}
                    </div>
                  </div>

                  {day.isRest ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#8c7b79', fontSize: '0.85rem' }}>
                      Rest Day
                    </div>
                  ) : (
                    <div className="sr-week-col__segments">
                      {(day.segments || []).map((seg, sIdx) => {
                        const colors = getSubjectColor(seg.subject);
                        return (
                          <div
                            key={sIdx}
                            className="sr-week-seg-block"
                            style={{
                              background: colors.bg,
                              borderColor: colors.accent,
                              color: colors.text,
                              opacity: seg.completed ? 0.6 : 1
                            }}
                          >
                            <span className="sr-week-seg-time">
                              {seg.time ? seg.time.split('-')[0] : ''} {seg.subject}
                            </span>
                            <span className="sr-week-seg-task">
                              {seg.completed ? 'Done: ' : ''}
                              {seg.chapter || seg.task}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="sr-week-col__footer">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                      <span>Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="sr-subject-bar-track">
                      <div
                        className="sr-subject-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100 ? '#52c41a' : '#C08552'
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

        {/* ------------------------------------------------------------------
            VIEW 3: Month View
           ------------------------------------------------------------------ */}
        {activeView === 'month' && (
          <div className="sr-month-view">
            <div className="sr-month-nav">
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>
                Routine Calendar Overview
              </h3>
              <span style={{ fontSize: '0.9rem', color: '#5c4d4c' }}>
                Heatmap indicates task completion percentage
              </span>
            </div>

            <div className="sr-month-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="sr-month-day-head">
                  {d}
                </div>
              ))}

              {currentDaysList.map((day, idx) => {
                const dayDate = day.dayDate ? new Date(day.dayDate) : new Date();
                const total = (day.segments || []).length;
                const completed = (day.segments || []).filter((s) => s.completed).length;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                let cellBg = '#FFFDFB';
                let cellBorder = 'rgba(140, 90, 60, 0.15)';
                if (day.isRest) {
                  cellBg = '#F7EBE1';
                } else if (pct === 100) {
                  cellBg = '#F6FFED';
                  cellBorder = '#B7EB8F';
                } else if (pct >= 50) {
                  cellBg = '#FEFFE6';
                  cellBorder = '#FFF566';
                }

                return (
                  <div
                    key={idx}
                    className="sr-month-cell"
                    style={{ background: cellBg, borderColor: cellBorder }}
                    onClick={() => {
                      setSelectedDayIndex(idx);
                      setActiveView('day');
                    }}
                  >
                    <div className="sr-month-cell-header">
                      <span className="sr-month-cell-date">{format(dayDate, 'd')}</span>
                      <span
                        className="sr-month-cell-badge"
                        style={{
                          background: day.isRest ? '#E6CCB2' : pct === 100 ? '#52c41a' : '#C08552',
                          color: '#FFFFFF'
                        }}
                      >
                        {day.isRest ? 'Rest' : `${pct}%`}
                      </span>
                    </div>

                    {!day.isRest && (
                      <div style={{ fontSize: '0.75rem', color: '#5c4d4c', marginTop: '6px' }}>
                        {completed}/{total} tasks done
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            VIEW 4: Stats & Analytics Panel
           ------------------------------------------------------------------ */}
        {activeView === 'stats' && (
          <div>
            <div className="sr-stats-grid">
              <div className="sr-stat-card">
                <div className="sr-stat-card__icon"><HiChartBar size={24} /></div>
                <span className="sr-stat-card__label">Active Daily Streak</span>
                <span className="sr-stat-card__value">
                  {statsData?.currentStreak || 0} {statsData?.currentStreak === 1 ? 'Day' : 'Days'}
                </span>
                <span className="sr-stat-card__sub">Keep completing at least 1 task daily!</span>
              </div>

              <div className="sr-stat-card">
                <div className="sr-stat-card__icon"><HiClock size={24} /></div>
                <span className="sr-stat-card__label">Total Planned Hours</span>
                <span className="sr-stat-card__value">
                  {statsData?.totalPlannedHours || 0}h
                </span>
                <span className="sr-stat-card__sub">
                  Completed: {statsData?.totalCompletedHours || 0}h
                </span>
              </div>

              <div className="sr-stat-card">
                <div className="sr-stat-card__icon"><HiCheckCircle size={24} /></div>
                <span className="sr-stat-card__label">Completion Rate</span>
                <span className="sr-stat-card__value">
                  {statsData?.completionPercentage || 0}%
                </span>
                <span className="sr-stat-card__sub">
                  {statsData?.completedSegments || 0} of {statsData?.totalSegments || 0} segments done
                </span>
              </div>
            </div>

            {/* Subject Distribution Breakdown */}
            <div className="sr-subject-stats-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>
                  Subject Hours & Mastery Distribution
                </h3>
                <button
                  type="button"
                  className="sr-btn sr-btn--primary"
                  onClick={handleGenerateNextWeek}
                >
                  <span>Generate Next Week</span>
                </button>
              </div>

              {(statsData?.subjectDistribution || []).map((item) => {
                const colors = getSubjectColor(item.subject);
                return (
                  <div key={item.subject} className="sr-subject-row">
                    <div className="sr-subject-row-header">
                      <span style={{ fontWeight: 700, color: colors.text }}>
                        {item.subject} ({item.completedSegments}/{item.totalSegments} tasks)
                      </span>
                      <span>
                        {item.completedHours}h / {item.plannedHours}h ({item.completionRate}%)
                      </span>
                    </div>
                    <div className="sr-subject-bar-track">
                      <div
                        className="sr-subject-bar-fill"
                        style={{
                          width: `${item.completionRate}%`,
                          background: colors.accent
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            Floating AI Chat Button & Slide-out Drawer
           ------------------------------------------------------------------ */}
        <button
          type="button"
          className="sr-ai-floating-btn"
          onClick={() => setIsAiDrawerOpen(true)}
          title="Open AI Study Assistant"
        >
          <span>AI Study Coach</span>
        </button>

        <AnimatePresence>
          {isAiDrawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="sr-drawer-overlay"
                onClick={() => setIsAiDrawerOpen(false)}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="sr-drawer"
              >
                <div className="sr-drawer__header">
                  <h3 className="sr-drawer__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>AI Routine Coach</span>
                  </h3>
                  <button
                    type="button"
                    className="sr-drawer__close-btn"
                    onClick={() => setIsAiDrawerOpen(false)}
                  >
                    <HiX />
                  </button>
                </div>

                <div className="sr-drawer__body">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`sr-chat-bubble ${
                        msg.sender === 'user' ? 'sr-chat-bubble--user' : 'sr-chat-bubble--ai'
                      }`}
                    >
                      {msg.text}
                    </div>
                  ))}

                  {aiLoading && (
                    <div                       className="sr-chat-bubble sr-chat-bubble--ai" style={{ fontStyle: 'italic' }}>
                      Analyzing routine and adapting schedule...
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  <div className="sr-chip-suggestions">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8c7b79' }}>
                      Suggested Modifications:
                    </span>
                    <button
                      type="button"
                      className="sr-chip-btn"
                      onClick={() => handleSendAiMessage('Swap Physics and Chemistry on Tuesday')}
                    >
                      Swap Physics and Chemistry on Tuesday
                    </button>
                    <button
                      type="button"
                      className="sr-chip-btn"
                      onClick={() => handleSendAiMessage('Clear Thursday evening for revision')}
                    >
                      Clear Thursday evening for revision
                    </button>
                    <button
                      type="button"
                      className="sr-chip-btn"
                      onClick={() => handleSendAiMessage('Add 1.5 hours of Biology daily')}
                    >
                      Add 1.5 hours of Biology daily
                    </button>
                    <button
                      type="button"
                      className="sr-chip-btn"
                      onClick={() => handleSendAiMessage("Make tomorrow lighter, I'm tired")}
                    >
                      Make tomorrow lighter, I'm tired
                    </button>
                    <button
                      type="button"
                      className="sr-chip-btn"
                      onClick={() => handleSendAiMessage('Give me study tips for memorization')}
                    >
                      Give me study tips for memorization
                    </button>
                  </div>
                </div>

                <div className="sr-drawer__footer">
                  <input
                    type="text"
                    className="sr-chat-input"
                    placeholder="Tell AI what to change in routine..."
                    value={aiInputText}
                    onChange={(e) => setAiInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !aiLoading) {
                        e.preventDefault();
                        handleSendAiMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="sr-chat-send-btn"
                    disabled={aiLoading || !aiInputText.trim()}
                    onClick={() => handleSendAiMessage()}
                  >
                    <HiLightningBolt />
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ------------------------------------------------------------------
            Edit Segment Modal
           ------------------------------------------------------------------ */}
        {editSegmentModal && (
          <div className="sr-modal-overlay" onClick={() => setEditSegmentModal(null)}>
            <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sr-modal__header">
                <h3 className="sr-modal__title">Edit Routine Segment</h3>
                <button
                  type="button"
                  className="sr-drawer__close-btn"
                  onClick={() => setEditSegmentModal(null)}
                >
                  <HiX />
                </button>
              </div>

              <form onSubmit={handleSaveEditSegment}>
                <div className="sr-form-group">
                  <label className="sr-label">Subject</label>
                  <input
                    type="text"
                    className="sr-input"
                    value={editSegmentModal.segment.subject || ''}
                    onChange={(e) =>
                      setEditSegmentModal({
                        ...editSegmentModal,
                        segment: { ...editSegmentModal.segment, subject: e.target.value }
                      })
                    }
                    required
                  />
                </div>

                <div className="sr-form-group">
                  <label className="sr-label">Chapter / Topic</label>
                  <input
                    type="text"
                    className="sr-input"
                    value={editSegmentModal.segment.chapter || ''}
                    onChange={(e) =>
                      setEditSegmentModal({
                        ...editSegmentModal,
                        segment: { ...editSegmentModal.segment, chapter: e.target.value }
                      })
                    }
                  />
                </div>

                <div className="sr-form-group">
                  <label className="sr-label">Task Description</label>
                  <textarea
                    className="sr-textarea"
                    value={editSegmentModal.segment.task || ''}
                    onChange={(e) =>
                      setEditSegmentModal({
                        ...editSegmentModal,
                        segment: { ...editSegmentModal.segment, task: e.target.value }
                      })
                    }
                    required
                  />
                </div>

                <div className="sr-grid-2">
                  <div className="sr-form-group">
                    <label className="sr-label">Time Slot</label>
                    <input
                      type="text"
                      className="sr-input"
                      value={editSegmentModal.segment.time || ''}
                      onChange={(e) =>
                        setEditSegmentModal({
                          ...editSegmentModal,
                          segment: { ...editSegmentModal.segment, time: e.target.value }
                        })
                      }
                    />
                  </div>

                  <div className="sr-form-group">
                    <label className="sr-label">Priority</label>
                    <select
                      className="sr-select"
                      value={editSegmentModal.segment.priority || 'medium'}
                      onChange={(e) =>
                        setEditSegmentModal({
                          ...editSegmentModal,
                          segment: { ...editSegmentModal.segment, priority: e.target.value }
                        })
                      }
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button
                    type="button"
                    className="sr-btn sr-btn--secondary"
                    onClick={() => setEditSegmentModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="sr-btn sr-btn--primary">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
