import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiCalendar,
  HiClock,
  HiAcademicCap,
  HiBookOpen,
  HiSearch,
  HiCollection,
  HiArrowRight,
  HiCheckCircle,
  HiBan,
  HiDocumentText,
  HiExclamationCircle,
  HiSparkles
} from 'react-icons/hi';
import { HiTrophy } from 'react-icons/hi2';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { getGlobalLeaderboard } from '../services/contestApi';
import { preloadYoloProctorModel } from '../hooks/useYoloProctor';
import './Contests.css';

// ─── Shared timezone offsets ─────────────────────────────────────────────────
const TZ_OFFSETS = {
  'Asia/Dhaka': '+06:00',
  'Asia/Kolkata': '+05:30',
  'Asia/Dubai': '+04:00',
  'Europe/London': '+00:00',
  'America/New_York': '-05:00',
  'Asia/Tokyo': '+09:00',
  'Asia/Singapore': '+08:00',
  'Australia/Sydney': '+10:00'
};

function getStartMs(c) {
  const tz = c.startTime?.timezone || 'Asia/Dhaka';
  const offset = TZ_OFFSETS[tz] || '+06:00';
  let hour = c.startTime?.hour || 12;
  const minute = c.startTime?.minute || 0;
  const period = c.startTime?.period || 'AM';
  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  const pad = (num) => String(num).padStart(2, '0');
  return new Date(`${c.date}T${pad(hour)}:${pad(minute)}:00${offset}`).getTime();
}

// ─── Filter bar sub-component ────────────────────────────────────────────────
function ContestFilterBar({ searchQuery, setSearchQuery, levelFilter, setLevelFilter, typeFilter, setTypeFilter, language }) {
  return (
    <section className="contests-filter-bar">
      <div className="contests-search-wrapper">
        <HiSearch className="contests-search-icon" size={20} />
        <input
          type="text"
          placeholder={language === 'en' ? 'Search contests...' : 'কনটেস্ট খুঁজুন...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="contests-search-input"
        />
      </div>

      <div className="contests-filters">
        <div className="contests-select-group">
          <HiAcademicCap className="select-icon" size={16} />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="contests-select"
          >
            <option value="all">{language === 'en' ? 'All Levels' : 'সকল লেভেল'}</option>
            <option value="hsc">HSC</option>
            <option value="admission">{language === 'en' ? 'Admission' : 'এডমিশন'}</option>
          </select>
        </div>

        <div className="contests-select-group">
          <HiCollection className="select-icon" size={16} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="contests-select"
          >
            <option value="all">{language === 'en' ? 'All Formats' : 'সকল ফরম্যাট'}</option>
            <option value="mcq">MCQ</option>
            <option value="cq">CQ</option>
            <option value="both">{language === 'en' ? 'Mixed' : 'মিশ্রিত'}</option>
          </select>
        </div>
      </div>
    </section>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Contests() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const getAdmissionTypeLabel = (type) => {
    if (type === 'varsity') return language === 'en' ? 'University' : 'বিশ্ববিদ্যালয়';
    if (type === 'medical') return language === 'en' ? 'Medical' : 'মেডিকেল';
    if (type === 'engineering') return language === 'en' ? 'Engineering' : 'ইঞ্জিনিয়ারিং';
    return type;
  };

  const getAdmissionSubtypeLabel = (subtype) => {
    if (!subtype) return '';
    if (subtype === 'science') return language === 'en' ? 'Science' : 'বিজ্ঞান';
    if (subtype === 'commerce') return language === 'en' ? 'Commerce' : 'ব্যবসায় শিক্ষা';
    if (subtype === 'arts') return language === 'en' ? 'Humanities' : 'মানবিক';
    if (subtype === 'iba') return 'IBA';
    return subtype;
  };

  const getSubjectLabel = (sub) => {
    const subjectMap = {
      'Physics': { en: 'Physics', bn: 'পদার্থবিজ্ঞান' },
      'Chemistry': { en: 'Chemistry', bn: 'রসায়ন' },
      'Higher Math': { en: 'Higher Math', bn: 'উচ্চতর গণিত' },
      'Biology': { en: 'Biology', bn: 'জীববিজ্ঞান' },
      'ICT': { en: 'ICT', bn: 'তথ্য ও যোগাযোগ প্রযুক্তি' },
      'English': { en: 'English', bn: 'ইংরেজি' },
      'Bangla': { en: 'Bangla', bn: 'বাংলা' }
    };
    const mapped = subjectMap[sub];
    if (mapped) {
      return language === 'en' ? mapped.en : mapped.bn;
    }
    return sub;
  };

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || '',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'student',
    collegeName: localStorage.getItem('topkorbo_collegeName') || '',
    hscBatch: localStorage.getItem('topkorbo_hscBatch') || '',
    phoneNumber: localStorage.getItem('topkorbo_phoneNumber') || '',
  });

  const [contests, setContests] = useState([]);
  const [now, setNow] = useState(new Date());

  // Registration modal state variables
  const [showRegModal, setShowRegModal] = useState(false);
  const [regContestId, setRegContestId] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCollege, setRegCollege] = useState('');
  const [regHscBatch, setRegHscBatch] = useState('');

  // Independent filters for each table
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [upcomingLevelFilter, setUpcomingLevelFilter] = useState('all');
  const [upcomingTypeFilter, setUpcomingTypeFilter] = useState('all');

  const [pastSearch, setPastSearch] = useState('');
  const [pastLevelFilter, setPastLevelFilter] = useState('all');
  const [pastTypeFilter, setPastTypeFilter] = useState('all');

  const [selectedResult, setSelectedResult] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [registeringContestId, setRegisteringContestId] = useState('');

  const activeTab = 'contests';

  // ── Leaderboard state ──────────────────────────────────────────────────────
  const [lbBy, setLbBy] = useState('points');
  const [lbRows, setLbRows] = useState([]);
  const [lbMe, setLbMe] = useState(null);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbError, setLbError] = useState('');

  // Live timer tick
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth Guard & fetch contests
  useEffect(() => {
    const token = localStorage.getItem('topkorbo_token');
    if (!token) {
      navigate('/');
      return;
    }

    const fetchUserData = async () => {
      try {
        const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const response = await fetch(`${backendBaseUrl}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.status === 401) {
          localStorage.removeItem('topkorbo_token');
          navigate('/');
          return;
        }

        const resData = await response.json();
        if (resData.success && resData.data) {
          const u = resData.data;
          setUser({
            name: u.name,
            avatar: u.avatar || '',
            email: u.email,
            role: u.role,
            collegeName: u.collegeName || '',
            hscBatch: u.hscBatch || '',
            phoneNumber: u.phoneNumber || ''
          });
          localStorage.setItem('topkorbo_name', u.name);
          localStorage.setItem('topkorbo_avatar', u.avatar || '');
          localStorage.setItem('topkorbo_email', u.email);
          localStorage.setItem('topkorbo_role', u.role);
          localStorage.setItem('topkorbo_collegeName', u.collegeName || '');
          localStorage.setItem('topkorbo_hscBatch', u.hscBatch || '');
          localStorage.setItem('topkorbo_phoneNumber', u.phoneNumber || '');
        }
      } catch (err) {
        console.error('Error fetching user data on contests page:', err);
      }
    };

    const fetchAllUpcomingContests = async () => {
      try {
        const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const response = await fetch(`${backendBaseUrl}/contests/upcoming`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const resData = await response.json();
        if (resData.success && resData.data) {
          setContests(resData.data);
        }
      } catch (err) {
        console.error('Error fetching contests:', err);
      }
    };

    fetchUserData();
    fetchAllUpcomingContests();
  }, [navigate]);

  // ── Fetch leaderboard ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLbLoading(true);
    setLbError('');
    getGlobalLeaderboard(lbBy, 50)
      .then((data) => {
        if (cancelled) return;
        setLbRows(data?.leaderboard || []);
        setLbMe(data?.me || null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Leaderboard fetch failed:', err);
        setLbError(language === 'en' ? 'Could not load the leaderboard.' : 'লিডারবোর্ড লোড করা যায়নি।');
      })
      .finally(() => {
        if (!cancelled) setLbLoading(false);
      });
    return () => { cancelled = true; };
  }, [lbBy, language]);

  const lbMetricLabel = lbBy === 'points'
    ? (language === 'en' ? 'Points' : 'পয়েন্ট')
    : (language === 'en' ? 'Rating' : 'রেটিং');
  const lbMetricValue = (row) => (lbBy === 'points' ? row.contestPoints : `${row.rating} (${row.rankTitle})`);
  const renderRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="contest-rank-medal gold" title="1st Place">
          <HiTrophy size={13} style={{ color: '#B45309' }} />
          <span>1st</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="contest-rank-medal silver" title="2nd Place">
          <HiTrophy size={13} style={{ color: '#4B5563' }} />
          <span>2nd</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="contest-rank-medal bronze" title="3rd Place">
          <HiTrophy size={13} style={{ color: '#9A3412' }} />
          <span>3rd</span>
        </span>
      );
    }
    return <span className="contest-rank-num">#{rank}</span>;
  };

  // ─── Time helpers ──────────────────────────────────────────────────────────

  const getContestTimeInfo = (contest) => {
    const tz = contest.startTime?.timezone || 'Asia/Dhaka';
    const offset = TZ_OFFSETS[tz] || '+06:00';

    let hour = contest.startTime?.hour || 12;
    const minute = contest.startTime?.minute || 0;
    const period = contest.startTime?.period || 'AM';

    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const pad = (num) => String(num).padStart(2, '0');
    const startStr = `${contest.date}T${pad(hour)}:${pad(minute)}:00${offset}`;
    const startDate = new Date(startStr);

    const durationHours = contest.duration?.hours || 0;
    const durationMinutes = contest.duration?.minutes || 0;
    const endDate = new Date(startDate.getTime() + (durationHours * 60 * 60 * 1000) + (durationMinutes * 60 * 1000));

    const diffToStart = startDate - now;
    const diffToEnd = endDate - now;

    if (diffToStart > 0) {
      const d = Math.floor(diffToStart / (1000 * 60 * 60 * 24));
      const h = Math.floor((diffToStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diffToStart % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diffToStart % (1000 * 60)) / 1000);

      let text = '';
      if (d > 0) text = `${d}d ${h}h ${m}m ${s}s`;
      else if (h > 0) text = `${h}h ${m}m ${s}s`;
      else text = `${m}m ${s}s`;

      return {
        status: 'upcoming',
        badgeText: language === 'en' ? 'Upcoming' : 'আসন্ন',
        remainingText: language === 'en' ? `Starts in: ${text}` : `শুরু হতে বাকি: ${text}`,
        startDate,
        endDate
      };
    } else if (diffToEnd > 0) {
      const h = Math.floor((diffToEnd % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diffToEnd % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diffToEnd % (1000 * 60)) / 1000);

      const text = `${h}h ${m}m ${s}s`;

      return {
        status: 'running',
        badgeText: language === 'en' ? 'Running' : 'চলমান',
        remainingText: language === 'en' ? `Ends in: ${text}` : `শেষ হতে বাকি: ${text}`,
        startDate,
        endDate
      };
    } else {
      return {
        status: 'ended',
        badgeText: language === 'en' ? 'Ended' : 'শেষ হয়েছে',
        remainingText: language === 'en' ? 'Contest has ended' : 'কনটেস্টটি শেষ হয়েছে',
        startDate,
        endDate
      };
    }
  };

  const getFormatLabel = (qtype) => {
    if (qtype === 'mcq') return language === 'en' ? 'MCQ Only' : 'শুধুমাত্র MCQ';
    if (qtype === 'cq') return language === 'en' ? 'CQ Only' : 'শুধুমাত্র CQ';
    if (qtype === 'written') return language === 'en' ? 'Written Only' : 'শুধুমাত্র লিখিত';
    return language === 'en' ? 'MCQ & Written/CQ' : 'MCQ এবং লিখিত/CQ';
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(language === 'en' ? 'en-US' : 'bn-BD', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (startTime) => {
    if (!startTime) return '';
    return `${startTime.hour}:${String(startTime.minute).padStart(2, '0')} ${startTime.period}`;
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openRegistrationModal = (contestId) => {
    setRegContestId(contestId);
    setRegName(user.name || '');
    setRegEmail(user.email || '');
    setRegPhone(user.phoneNumber || '');
    setRegCollege(user.collegeName || '');
    setRegHscBatch(user.hscBatch || '');
    setShowRegModal(true);
  };

  const handleConfirmRegistration = async (e) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regCollege.trim() || !regHscBatch.trim()) {
      toast.error(language === 'en' ? 'All fields are required' : 'সবগুলো ক্ষেত্র পূরণ করা আবশ্যক');
      return;
    }
    setRegisteringContestId(regContestId);
    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/contests/${regContestId}/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: regName.trim(),
          phoneNumber: regPhone.trim(),
          collegeName: regCollege.trim(),
          hscBatch: regHscBatch.trim()
        })
      });
      const resData = await response.json();
      if (resData.success) {
        toast.success(language === 'en' ? 'Successfully registered!' : 'সফলভাবে নিবন্ধিত হয়েছে!');
        setContests(prev => prev.map(c =>
          c._id === regContestId ? { ...c, hasRegistered: true } : c
        ));
        setUser(prev => ({
          ...prev,
          name: regName.trim(),
          phoneNumber: regPhone.trim(),
          collegeName: regCollege.trim(),
          hscBatch: regHscBatch.trim()
        }));
        localStorage.setItem('topkorbo_name', regName.trim());
        localStorage.setItem('topkorbo_collegeName', regCollege.trim());
        localStorage.setItem('topkorbo_hscBatch', regHscBatch.trim());
        localStorage.setItem('topkorbo_phoneNumber', regPhone.trim());
        setShowRegModal(false);
      } else {
        toast.error(resData.message || (language === 'en' ? 'Failed to register' : 'নিবন্ধন ব্যর্থ'));
      }
    } catch (err) {
      console.error('Error registering for contest:', err);
      toast.error(language === 'en' ? 'Network error' : 'নেটওয়ার্ক সমস্যা');
    } finally {
      setRegisteringContestId('');
    }
  };

  const handleParticipate = async (contestId, isPractice = false) => {
    const contestObj = contests.find((c) => c._id === contestId);
    if (contestObj && contestObj.hasParticipated) {
      const timeInfo = getContestTimeInfo(contestObj);
      if (timeInfo.status === 'running') {
        toast.error(
          language === 'en'
            ? 'You have already participated in this contest.'
            : 'আপনি ইতিমধ্যে এই কনটেস্টে অংশ নিয়েছেন।'
        );
        return;
      }
    }
    if (!isPractice) preloadYoloProctorModel().catch(() => {});
    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/contests/${contestId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (resData.success && resData.data) {
        const populatedContest = resData.data;

        if (!populatedContest.questions || populatedContest.questions.length === 0) {
          alert(language === 'en' ? 'This contest has no questions' : 'এই কনটেস্টে কোনো প্রশ্ন নেই');
          return;
        }

        // Clean up any old exam keys
        [
          'mock_test_step',
          'mock_test_subject_ids',
          'mock_test_chapters',
          'mock_test_selected_topics',
          'mock_exam_standard',
          'mock_question_type',
          'mock_total_questions',
          'mock_exam_duration',
          'mock_negative_marking',
          'mock_exam_questions',
          'mock_exam_config',
          'mock_exam_from_qbank',
          'mock_exam_answers',
          'mock_exam_end_time',
          'mock_exam_submitted',
          'mock_exam_review_mode',
          'mock_exam_time_left',
          'mock_exam_written_answers',
          'mock_exam_ai_evals',
          'mock_exam_submitted_keys',
          'mock_exam_visited_indexes',
          'mock_exam_active_idx'
        ].forEach((key) => sessionStorage.removeItem(key));

        sessionStorage.setItem('mock_exam_questions', JSON.stringify(populatedContest.questions));
        sessionStorage.setItem('mock_exam_config', JSON.stringify({
          duration: (populatedContest.duration.hours * 60) + populatedContest.duration.minutes,
          negativeMarking: true,
          questionType: populatedContest.questionType,
          standard: populatedContest.name,
          totalQuestions: populatedContest.questions.length,
          contestId: populatedContest._id,
          isPractice: isPractice
        }));
        sessionStorage.setItem('mock_exam_from_qbank', 'false');

        navigate('/mock-test/exam');
      } else {
        alert(resData.message || 'Failed to enter contest');
      }
    } catch (err) {
      console.error('Error starting contest exam:', err);
      alert('Network error while starting contest');
    }
  };

  const handleViewResult = async (contestId) => {
    setLoadingResult(true);
    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/contests/${contestId}/result`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (resData.success && resData.data) {
        setSelectedResult(resData.data);
        setShowResultModal(true);
      } else {
        alert(resData.message || 'Failed to fetch result');
      }
    } catch (err) {
      console.error('Error fetching contest result:', err);
      alert('Network error while fetching result');
    } finally {
      setLoadingResult(false);
    }
  };

  // ─── Filtering & sorting ──────────────────────────────────────────────────

  const filterContests = (list, search, level, type) => {
    return list.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchesLevel = level === 'all' || c.level === level;
      const matchesType = type === 'all' || c.questionType === type;
      return matchesSearch && matchesLevel && matchesType;
    });
  };

  // Partition contests by status
  const currentOrUpcoming = [];
  const past = [];

  contests.forEach((c) => {
    const timeInfo = getContestTimeInfo(c);
    if (timeInfo.status === 'ended') {
      past.push(c);
    } else {
      currentOrUpcoming.push(c);
    }
  });

  // Apply independent filters
  const filteredUpcoming = filterContests(currentOrUpcoming, upcomingSearch, upcomingLevelFilter, upcomingTypeFilter);
  const filteredPast = filterContests(past, pastSearch, pastLevelFilter, pastTypeFilter);

  // Sort upcoming: running first, then by start time ascending
  const sortedUpcoming = [...filteredUpcoming].sort((a, b) => {
    const aInfo = getContestTimeInfo(a);
    const bInfo = getContestTimeInfo(b);
    if (aInfo.status === 'running' && bInfo.status !== 'running') return -1;
    if (aInfo.status !== 'running' && bInfo.status === 'running') return 1;
    return getStartMs(a) - getStartMs(b);
  });

  // Sort past: most recently ended first
  const sortedPast = [...filteredPast].sort((a, b) => getStartMs(b) - getStartMs(a));

  // ─── Action button renderer ───────────────────────────────────────────────

  const renderActionButton = (contest, timeInfo) => {
    const isUpcoming = timeInfo.status === 'upcoming';
    const isRunning = timeInfo.status === 'running';
    const isEnded = timeInfo.status === 'ended';

    // Ended contests
    if (isEnded) {
      if (contest.hasParticipated) {
        return (
          <button
            className="contest-table-cta contest-table-cta--result"
            onClick={() => handleViewResult(contest._id)}
          >
            <span>{language === 'en' ? 'View Result' : 'ফলাফল দেখুন'}</span>
            <HiArrowRight size={14} />
          </button>
        );
      }
      return (
        <button
          className="contest-table-cta"
          onClick={() => handleParticipate(contest._id, true)}
        >
          <span>{language === 'en' ? 'Practice' : 'অনুশীলন'}</span>
          <HiArrowRight size={14} />
        </button>
      );
    }

    // Running contests
    if (isRunning) {
      if (contest.hasParticipated) {
        return (
          <button className="contest-table-cta contest-table-cta--participated" disabled>
            <HiCheckCircle size={14} />
            <span>{language === 'en' ? 'Participated' : 'অংশগ্রহণ করেছেন'}</span>
          </button>
        );
      }
      if (contest.hasRegistered) {
        return (
          <button
            className="contest-table-cta contest-table-cta--active"
            onPointerEnter={() => preloadYoloProctorModel().catch(() => {})}
            onFocus={() => preloadYoloProctorModel().catch(() => {})}
            onClick={() => handleParticipate(contest._id)}
          >
            <span>{language === 'en' ? 'Participate' : 'অংশ নিন'}</span>
            <HiArrowRight size={14} />
          </button>
        );
      }
      return (
        <button className="contest-table-cta contest-table-cta--not-registered" disabled>
          <HiBan size={14} />
          <span>{language === 'en' ? 'Not Registered' : 'নিবন্ধিত নয়'}</span>
        </button>
      );
    }

    // Upcoming contests
    if (isUpcoming) {
      if (contest.hasRegistered) {
        return (
          <button className="contest-table-cta contest-table-cta--registered" disabled>
            <HiCheckCircle size={14} />
            <span>{language === 'en' ? 'Registered' : 'নিবন্ধিত'}</span>
          </button>
        );
      }

      const isRegistrationOpen = timeInfo.startDate ? (timeInfo.startDate.getTime() - now.getTime() > 0) : false;

      if (isRegistrationOpen) {
        return (
          <button
            className="contest-table-cta contest-table-cta--register"
            onClick={() => openRegistrationModal(contest._id)}
            disabled={registeringContestId === contest._id}
          >
            {registeringContestId === contest._id ? (
              <span>{language === 'en' ? 'Registering...' : 'নিবন্ধন হচ্ছে...'}</span>
            ) : (
              <>
                <span>{language === 'en' ? 'Register' : 'নিবন্ধন করুন'}</span>
                <HiArrowRight size={14} />
              </>
            )}
          </button>
        );
      }
      // Registration closed
      return (
        <button className="contest-table-cta contest-table-cta--closed" disabled>
          <HiClock size={14} />
          <span>{language === 'en' ? 'Reg. Closed' : 'নিবন্ধন বন্ধ'}</span>
        </button>
      );
    }

    return null;
  };

  // ─── Table renderer ───────────────────────────────────────────────────────

  const renderContestTable = (contestList, emptyMsg) => {
    if (contestList.length === 0) {
      return (
        <div className="contests-empty-state">
          <div className="empty-icon-wrap">
            <HiCalendar size={36} />
          </div>
          <h3>{language === 'en' ? 'No Contests Found' : 'কোনো কনটেস্ট পাওয়া যায়নি'}</h3>
          <p>{emptyMsg}</p>
        </div>
      );
    }

    const colLabels = {
      contest: language === 'en' ? 'Contest' : 'কনটেস্ট',
      level: language === 'en' ? 'Level & Format' : 'লেভেল ও ফরম্যাট',
      subjects: language === 'en' ? 'Subjects / Units' : 'বিষয় / ইউনিট',
      duration: language === 'en' ? 'Duration' : 'সময়কাল',
      hostedBy: language === 'en' ? 'Hosted By' : 'আয়োজক',
      startTime: language === 'en' ? 'Start Time' : 'শুরুর সময়',
      countdown: language === 'en' ? 'Countdown / Status' : 'কাউন্টডাউন / স্ট্যাটাস',
      action: language === 'en' ? 'Action' : 'অ্যাকশন'
    };

    return (
      <div className="contests-table-container">
        <table className="contests-table">
          <thead>
            <tr>
              <th>{language === 'en' ? 'Contest' : 'কনটেস্ট'}</th>
              <th>{language === 'en' ? 'Level & Format' : 'লেভেল ও ফরম্যাট'}</th>
              <th>{language === 'en' ? 'Subjects / Units' : 'বিষয় / ইউনিট'}</th>
              <th>{language === 'en' ? 'Duration' : 'সময়কাল'}</th>
              <th>{language === 'en' ? 'Hosted By' : 'আয়োজক'}</th>
              <th>{language === 'en' ? 'Start Time' : 'শুরুর সময়'}</th>
              <th>{language === 'en' ? 'Countdown / Status' : 'কাউন্টডাউন / স্ট্যাটাস'}</th>
              <th className="text-right">{language === 'en' ? 'Action' : 'অ্যাকশন'}</th>
            </tr>
          </thead>
          <tbody>
            {contestList.map((contest, index) => {
              const timeInfo = getContestTimeInfo(contest);

              return (
                <motion.tr
                  key={contest._id}
                  className={`contest-row contest-row--${timeInfo.status}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  {/* Title & Badge */}
                  <td data-label={colLabels.contest}>
                    <div className="contest-name-cell">
                      <span className={`status-dot status-dot--${timeInfo.status}`}></span>
                      <div className="contest-title-wrap">
                        <span className="contest-row-title" title={contest.name}>
                          {contest.name}
                        </span>
                        <span className={`status-badge-inline status-badge-inline--${timeInfo.status}`}>
                          {timeInfo.badgeText}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Level & Format */}
                  <td data-label={colLabels.level}>
                    <div className="contest-level-format-cell">
                      <span className="capitalize-level">{contest.level}</span>
                      <span className="format-subtext">{getFormatLabel(contest.questionType)}</span>
                    </div>
                  </td>

                  {/* Subjects / Units */}
                  <td data-label={colLabels.subjects}>
                    <div className="contest-level-format-cell">
                      {contest.level === 'hsc' && (
                        <>
                          <span className="capitalize-level">
                            {contest.subjects?.map(getSubjectLabel).join(', ')}
                          </span>
                        </>
                      )}
                      {contest.level === 'admission' && (
                        <>
                          <span className="capitalize-level">
                            {getAdmissionTypeLabel(contest.admissionType)}
                          </span>
                          {contest.admissionSubtype && (
                            <span className="format-subtext">
                              {getAdmissionSubtypeLabel(contest.admissionSubtype)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>

                  {/* Duration */}
                  <td data-label={colLabels.duration}>
                    <span className="duration-text">
                      {contest.duration.hours}h {contest.duration.minutes}m
                    </span>
                  </td>

                  {/* Hosted By */}
                  <td data-label={colLabels.hostedBy}>
                    <span className="organizer-name">
                      {contest.creator ? contest.creator.name : '—'}
                    </span>
                  </td>

                  {/* Start Time */}
                  <td data-label={colLabels.startTime}>
                    <div className="start-time-cell">
                      <span className="start-date">{formatDate(contest.date)}</span>
                      <span className="start-time-sub">
                        {formatTime(contest.startTime)} ({contest.startTime?.timezone})
                      </span>
                    </div>
                  </td>

                  {/* Countdown */}
                  <td data-label={colLabels.countdown}>
                    <div className="countdown-cell">
                      <span className={`countdown-value countdown-value--${timeInfo.status}`}>
                        {timeInfo.remainingText}
                      </span>
                    </div>
                  </td>

                  {/* CTA */}
                  <td className="text-right contest-action-cell" data-label={colLabels.action}>
                    {renderActionButton(contest, timeInfo)}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="contests-page">
      <Sidebar activeTab={activeTab} user={user} />

      <main className="contests-content">
        {/* ═══════ Table 1: Current or Upcoming Contests ═══════ */}
        <section className="contests-table-section">
          <div className="contests-section-header">
            <div className="contests-section-header__icon contests-section-header__icon--active">
              <HiClock size={20} />
            </div>
            <div>
              <h2 className="contests-section-title">
                {language === 'en' ? 'Current or Upcoming Contests' : 'বর্তমান বা আসন্ন কনটেস্টসমূহ'}
              </h2>
              <p className="contests-section-subtitle">
                {language === 'en'
                  ? 'Register for upcoming contests or participate in running ones.'
                  : 'আসন্ন কনটেস্টে নিবন্ধন করুন অথবা চলমান কনটেস্টে অংশ নিন।'}
              </p>
            </div>
            <span className="contests-section-count">
              {sortedUpcoming.length} {language === 'en' ? (sortedUpcoming.length === 1 ? 'contest' : 'contests') : 'টি কনটেস্ট'}
            </span>
          </div>

          <div className="contests-card">
            <ContestFilterBar
              searchQuery={upcomingSearch}
              setSearchQuery={setUpcomingSearch}
              levelFilter={upcomingLevelFilter}
              setLevelFilter={setUpcomingLevelFilter}
              typeFilter={upcomingTypeFilter}
              setTypeFilter={setUpcomingTypeFilter}
              language={language}
            />

            {renderContestTable(
              sortedUpcoming,
              language === 'en'
                ? 'No current or upcoming contests. Check back later!'
                : 'কোনো বর্তমান বা আসন্ন কনটেস্ট নেই। পরে আবার দেখুন!'
            )}
          </div>
        </section>

        {/* ═══════ Global Leaderboard ═══════ */}
        <section className="contests-table-section contests-table-section--leaderboard">
          <div className="contests-section-header">
            <div className="contests-section-header__icon contests-section-header__icon--active">
              <HiTrophy size={20} />
            </div>
            <div>
              <h2 className="contests-section-title">
                {language === 'en' ? 'Global Leaderboard' : 'গ্লোবাল লিডারবোর্ড'}
              </h2>
              <p className="contests-section-subtitle">
                {language === 'en'
                  ? 'Ranked across all contest participants.'
                  : 'সকল কনটেস্ট অংশগ্রহণকারীর মধ্যে র‍্যাংকিং।'}
              </p>
            </div>
          </div>

          {/* Points / Rating toggle */}
          <div style={{ display: 'flex', gap: 8, margin: '4px 0 16px' }}>
            {['points', 'rating'].map((key) => (
              <button
                key={key}
                onClick={() => setLbBy(key)}
                className="contest-table-cta"
                style={{
                  cursor: 'pointer',
                  background: lbBy === key ? '#8C5A3C' : 'transparent',
                  color: lbBy === key ? '#fff' : '#8C5A3C',
                  border: '1.5px solid #8C5A3C'
                }}
              >
                {key === 'points'
                  ? (language === 'en' ? 'By Points' : 'পয়েন্ট অনুযায়ী')
                  : (language === 'en' ? 'By Rating' : 'রেটিং অনুযায়ী')}
              </button>
            ))}
          </div>

          {lbMe && (
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', marginBottom: 16, borderRadius: 12,
                background: 'rgba(140, 90, 60, 0.08)', border: '1px solid rgba(140, 90, 60, 0.25)', fontWeight: 700
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {language === 'en' ? 'Your rank' : 'আপনার র‍্যাংক'}: {renderRankBadge(lbMe.rank)}
              </span>
              <span>{lbMetricLabel}: {lbBy === 'points' ? lbMe.contestPoints : `${lbMe.rating} (${lbMe.rankTitle})`}</span>
            </div>
          )}

          <div className="contests-card">
            {lbLoading ? (
              <div className="contests-empty-state">{language === 'en' ? 'Loading…' : 'লোড হচ্ছে…'}</div>
            ) : lbError ? (
              <div className="contests-empty-state">{lbError}</div>
            ) : lbRows.length === 0 ? (
              <div className="contests-empty-state">
                {language === 'en' ? 'No ranked participants yet.' : 'এখনও কোনো র‍্যাংকড অংশগ্রহণকারী নেই।'}
              </div>
            ) : (
              <div className="contests-table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>{language === 'en' ? 'Rank' : 'র‍্যাংক'}</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>{language === 'en' ? 'Student' : 'শিক্ষার্থী'}</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>{lbMetricLabel}</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>{language === 'en' ? 'Contests' : 'কনটেস্ট'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbRows.map((row) => {
                      const isMe = lbMe && row._id && String(row._id) === String(lbMe._id);
                      return (
                        <tr key={row._id || row.rank} style={{ background: isMe ? 'rgba(140, 90, 60, 0.08)' : 'transparent' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{renderRankBadge(row.rank)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {row.name || row.username || (language === 'en' ? 'Student' : 'শিক্ষার্থী')}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{lbMetricValue(row)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{row.contestsPlayed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ═══════ Table 2: Past Contests ═══════ */}
        <section className="contests-table-section contests-table-section--past">
          <div className="contests-section-header">
            <div className="contests-section-header__icon contests-section-header__icon--past">
              <HiCalendar size={20} />
            </div>
            <div>
              <h2 className="contests-section-title">
                {language === 'en' ? 'Past Contests' : 'বিগত কনটেস্টসমূহ'}
              </h2>
              <p className="contests-section-subtitle">
                {language === 'en'
                  ? 'View results of completed contests or practice with past questions.'
                  : 'সম্পন্ন কনটেস্টের ফলাফল দেখুন অথবা বিগত প্রশ্ন দিয়ে অনুশীলন করুন।'}
              </p>
            </div>
            <span className="contests-section-count">
              {sortedPast.length} {language === 'en' ? (sortedPast.length === 1 ? 'contest' : 'contests') : 'টি কনটেস্ট'}
            </span>
          </div>

          <div className="contests-card">
            <ContestFilterBar
              searchQuery={pastSearch}
              setSearchQuery={setPastSearch}
              levelFilter={pastLevelFilter}
              setLevelFilter={setPastLevelFilter}
              typeFilter={pastTypeFilter}
              setTypeFilter={setPastTypeFilter}
              language={language}
            />

            {renderContestTable(
              sortedPast,
              language === 'en'
                ? 'No past contests to display yet.'
                : 'এখনো কোনো বিগত কনটেস্ট প্রদর্শনের জন্য নেই।'
            )}
          </div>
        </section>
      </main>

      {/* Result Modal */}
      {showResultModal && selectedResult && (
        <div className="contest-modal-overlay" onClick={() => setShowResultModal(false)}>
          <div className="contest-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="contest-modal-close" onClick={() => setShowResultModal(false)}>
              &times;
            </button>
            <div className="contest-modal-header">
              <span className="contest-modal-header-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <HiTrophy size={24} style={{ color: '#d97706' }} />
              </span>
              <h2>{language === 'en' ? 'Contest Results' : 'কনটেস্টের ফলাফল'}</h2>
            </div>

            {selectedResult.userResult?.isDisqualified ? (
              <div 
                style={{
                  background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                  border: '1.5px solid #ef4444',
                  borderRadius: '16px',
                  padding: '24px 20px',
                  textAlign: 'center',
                  marginBottom: '24px',
                  color: '#991b1b',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.08)'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px'
                }}>
                  <HiExclamationCircle size={28} />
                </div>
                <h3 style={{ margin: '0 0 8px 0', fontWeight: '800', fontSize: '1.2rem', color: '#991b1b' }}>
                  {language === 'en' ? 'Disqualified' : 'অযোগ্য ঘোষিত'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.92rem', color: '#b91c1c', fontWeight: '600', lineHeight: '1.5' }}>
                  {language === 'en' 
                    ? `You were disqualified from this contest: ${selectedResult.userResult.disqualificationReason}`
                    : `কনটেস্ট থেকে আপনাকে অযোগ্য ঘোষণা করা হয়েছে: ${selectedResult.userResult.disqualificationReason}`
                  }
                </p>
              </div>
            ) : (
              <div className="contest-metrics-grid">
                <div className="contest-metric-item score">
                  <span className="metric-label">{language === 'en' ? 'Marks Obtained' : 'প্রাপ্ত নম্বর'}</span>
                  <strong className="metric-val">
                    {selectedResult.userResult ? `${selectedResult.userResult.score} / ${selectedResult.userResult.totalQuestions}` : '—'}
                  </strong>
                </div>
                <div className="contest-metric-item percentage">
                  <span className="metric-label">{language === 'en' ? 'Percentage' : 'শতকরা হার'}</span>
                  <strong className="metric-val">
                    {selectedResult.userResult ? `${selectedResult.userResult.percentage}%` : '—'}
                  </strong>
                </div>
                <div className="contest-metric-item rank">
                  <span className="metric-label">{language === 'en' ? 'Rank' : 'র‍্যাংক/অবস্থান'}</span>
                  <strong className="metric-val">
                    {selectedResult.userResult ? `# ${selectedResult.userResult.rank}` : '—'}
                  </strong>
                </div>
                <div className="contest-metric-item time">
                  <span className="metric-label">{language === 'en' ? 'Time Taken' : 'ব্যয়িত সময়'}</span>
                  <strong className="metric-val">
                    {selectedResult.userResult ? `${Math.floor(selectedResult.userResult.timeTakenSeconds / 60)}m ${selectedResult.userResult.timeTakenSeconds % 60}s` : '—'}
                  </strong>
                </div>
                <div className="contest-metric-item score">
                  <span className="metric-label">{language === 'en' ? 'Points Earned' : 'অর্জিত পয়েন্ট'}</span>
                  <strong className="metric-val">
                    {selectedResult.userResult ? `${selectedResult.userResult.pointsEarned ?? selectedResult.userResult.livePoints ?? 0}` : '—'}
                  </strong>
                </div>
                {selectedResult.userResult && selectedResult.userResult.ratingDelta !== null && selectedResult.userResult.ratingDelta !== undefined && (
                  <div className="contest-metric-item rank">
                    <span className="metric-label">{language === 'en' ? 'Rating Change' : 'রেটিং পরিবর্তন'}</span>
                    <strong className="metric-val" style={{ color: selectedResult.userResult.ratingDelta >= 0 ? '#16a34a' : '#dc2626' }}>
                      {selectedResult.userResult.ratingDelta >= 0 ? '+' : ''}{selectedResult.userResult.ratingDelta}
                      {selectedResult.userResult.newRating !== null && selectedResult.userResult.newRating !== undefined
                        ? ` (${selectedResult.userResult.newRating})`
                        : ''}
                    </strong>
                  </div>
                )}
              </div>
            )}

            <div className="contest-leaderboard-section">
              <h3>
                <span className="leaderboard-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <HiSparkles size={18} style={{ color: '#d97706' }} />
                </span>
                {language === 'en' ? 'Leaderboard (Top 3)' : 'লিডারবোর্ড (শীর্ষ ৩)'}
              </h3>
              <div className="leaderboard-ranks">
                <div className="leaderboard-rank-row gold">
                  <span className="rank-badge">1st</span>
                  <span className="rank-name">{selectedResult.leaderboard?.first}</span>
                </div>
                <div className="leaderboard-rank-row silver">
                  <span className="rank-badge">2nd</span>
                  <span className="rank-name">{selectedResult.leaderboard?.second}</span>
                </div>
                <div className="leaderboard-rank-row bronze">
                  <span className="rank-badge">3rd</span>
                  <span className="rank-name">{selectedResult.leaderboard?.third}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration Form Modal */}
      {showRegModal && (
        <div className="contest-modal-overlay" onClick={() => setShowRegModal(false)}>
          <div className="contest-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="contest-modal-close" onClick={() => setShowRegModal(false)}>
              &times;
            </button>
            <div className="contest-modal-header">
              <span className="contest-modal-header-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <HiDocumentText size={24} style={{ color: 'var(--sky-blue)' }} />
              </span>
              <h2>{language === 'en' ? 'Contest Registration' : 'কনটেস্ট নিবন্ধন'}</h2>
            </div>

            <form onSubmit={handleConfirmRegistration} className="registration-form">
              <div className="form-group">
                <label>{language === 'en' ? 'Full Name' : 'পূর্ণ নাম'}</label>
                <input
                  type="text"
                  className="form-input"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={language === 'en' ? 'Enter your full name' : 'আপনার পূর্ণ নাম লিখুন'}
                  required
                />
              </div>

              <div className="form-group">
                <label>{language === 'en' ? 'Email Address' : 'ইমেইল ঠিকানা'}</label>
                <input
                  type="email"
                  className="form-input"
                  value={regEmail}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>{language === 'en' ? 'Phone Number' : 'ফোন নম্বর'}</label>
                <input
                  type="tel"
                  className="form-input"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder={language === 'en' ? 'Enter phone number' : 'ফোন নম্বর লিখুন'}
                  required
                />
              </div>

              <div className="form-group">
                <label>{language === 'en' ? 'College Name / Institution' : 'কলেজের নাম / শিক্ষা প্রতিষ্ঠান'}</label>
                <input
                  type="text"
                  className="form-input"
                  value={regCollege}
                  onChange={(e) => setRegCollege(e.target.value)}
                  placeholder={language === 'en' ? 'Enter college name' : 'কলেজের নাম লিখুন'}
                  required
                />
              </div>

              <div className="form-group">
                <label>{language === 'en' ? 'HSC Batch' : 'HSC ব্যাচ'}</label>
                <input
                  type="text"
                  className="form-input"
                  value={regHscBatch}
                  onChange={(e) => setRegHscBatch(e.target.value)}
                  placeholder={language === 'en' ? 'e.g. HSC 2025' : 'যেমন: HSC 2025'}
                  required
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowRegModal(false)}
                >
                  {language === 'en' ? 'Cancel' : 'বাতিল'}
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={registeringContestId !== ''}
                >
                  {registeringContestId !== '' 
                    ? (language === 'en' ? 'Registering...' : 'নিবন্ধন হচ্ছে...') 
                    : (language === 'en' ? 'Confirm Registration' : 'নিবন্ধন নিশ্চিত করুন')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
