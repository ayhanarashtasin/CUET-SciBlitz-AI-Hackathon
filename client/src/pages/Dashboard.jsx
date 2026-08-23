import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLanguage } from '../hooks/useLanguage';
import { usePlan } from '../hooks/usePlan';
import useSocket from '../hooks/useSocket';
import { HiCalendar, HiAcademicCap, HiTrash, HiOutlineClock } from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import {
  fetchMentorDashboard,
  respondToMentorRequest,
  postMentorAnnouncement
} from '../services/mentorApi';
import { getDashboardActivity, getStats } from '../services/practiceApi';
import { getMyRating } from '../services/contestApi';
import httpClient from '../services/httpClient';
import {
  ContestRatingSection,
  DailyProgressSection,
  StudentProfileSection
} from '../components/dashboard/StudentDashboardSections';
import MentorCommandBar from '../components/mentor/dashboard/MentorCommandBar';
import MentorPendingQueue from '../components/mentor/dashboard/MentorPendingQueue';
import MentorStudentRoster from '../components/mentor/dashboard/MentorStudentRoster';
import CohortInsightsRadar from '../components/mentor/dashboard/CohortInsightsRadar';
import StudentDossierDrawer from '../components/mentor/dashboard/StudentDossierDrawer';
import MentorDashboardSkeleton from '../components/mentor/dashboard/MentorDashboardSkeleton';
import { buildStudentAnalytics } from '../utils/dashboardAnalytics';
import './Dashboard.css';
import '../components/mentor/dashboard/MentorDashboard.css';

const EMPTY_RATING_DATA = {
  current: 0,
  max: 0,
  contestPoints: 0,
  contestsPlayed: 0,
  unrated: false,
  history: []
};

const EMPTY_MENTOR_DASHBOARD = {
  capacity: 30,
  cohortWeakSpots: [],
  pendingRequests: [],
  students: [],
  overview: {
    totalStudents: 0,
    activeStudents: 0,
    activeStudents48h: 0,
    activeRate: 0,
    totalAttempts: 0,
    averageStudentScore: 0,
    averageRanking: null,
    subjectInsights: []
  }
};

/**
 * studentId -> Set(noteId) of assignments waiting on this mentor.
 *
 * Keyed by note id rather than held as a plain counter so that every socket
 * event is idempotent: a duplicated "submitted" cannot double-count, and an
 * unsubmit, a review or a status toggle always removes exactly the right entry
 * instead of blindly decrementing a number that has drifted.
 */
function seedPendingSubmissions(students = []) {
  return students.reduce((acc, entry) => {
    const id = String(entry.student?._id || '');
    if (id) acc[id] = new Set(entry.pendingSubmissions || []);
    return acc;
  }, {});
}

let dashboardUserRequest = null;

function requestDashboardUser() {
  if (dashboardUserRequest) return dashboardUserRequest;

  const request = httpClient.request('/auth/me');
  dashboardUserRequest = request;
  request.finally(() => {
    if (dashboardUserRequest === request) dashboardUserRequest = null;
  }).catch(() => {});
  return request;
}

function storeAuthFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return null;

  const name = params.get('name');
  const email = params.get('email');
  const avatar = params.get('avatar');
  const role = params.get('role');

  localStorage.setItem('topkorbo_token', token);
  if (name) localStorage.setItem('topkorbo_name', decodeURIComponent(name));
  if (email) localStorage.setItem('topkorbo_email', decodeURIComponent(email));
  if (avatar) localStorage.setItem('topkorbo_avatar', decodeURIComponent(avatar));
  if (role) localStorage.setItem('topkorbo_role', role);

  window.history.replaceState({}, document.title, window.location.pathname);
  return token;
}

function persistDashboardUser(user) {
  localStorage.setItem('topkorbo_name', user.name);
  localStorage.setItem('topkorbo_avatar', user.avatar);
  localStorage.setItem('topkorbo_email', user.email);
  localStorage.setItem('topkorbo_role', user.role);
  localStorage.setItem('topkorbo_collegeName', user.collegeName);
  localStorage.setItem('topkorbo_hscBatch', user.hscBatch);
  localStorage.setItem('topkorbo_username', user.username);
}

function signOutDashboardUser() {
  localStorage.removeItem('topkorbo_token');
  localStorage.removeItem('topkorbo_name');
  localStorage.removeItem('topkorbo_avatar');
  localStorage.removeItem('topkorbo_email');
  localStorage.removeItem('topkorbo_phone');
  localStorage.removeItem('topkorbo_collegeName');
  localStorage.removeItem('topkorbo_hscBatch');
  localStorage.removeItem('topkorbo_username');
  window.location.href = '/';
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function requestDashboardContests(authToken, role) {
  const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const endpoint = role === 'teacher' ? '/contests/mine' : '/contests/upcoming';
  const response = await fetch(`${backendBaseUrl}${endpoint}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to load contests.');
  }
  return payload.data || [];
}

export default function Dashboard() {
  const { language } = useLanguage();
  const [user, setUser] = useState(() => ({
    name: localStorage.getItem('topkorbo_name') || 'Student',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'student',
    collegeName: localStorage.getItem('topkorbo_collegeName') || '',
    hscBatch: localStorage.getItem('topkorbo_hscBatch') || '',
    username: localStorage.getItem('topkorbo_username') || ''
  }));
  const [upcomingContests, setUpcomingContests] = useState([]);
  const [mentorDashboard, setMentorDashboard] = useState(EMPTY_MENTOR_DASHBOARD);
  const [practiceStats, setPracticeStats] = useState(null);
  const [studentActivityDays, setStudentActivityDays] = useState([]);
  const [ratingData, setRatingData] = useState(EMPTY_RATING_DATA);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [respondingRequestId, setRespondingRequestId] = useState('');
  const [dossierStudentId, setDossierStudentId] = useState(null);
  const [pendingByStudent, setPendingByStudent] = useState({});

  const navigate = useNavigate();
  const { refresh: refreshPlan } = usePlan();

  const activeTab = 'dashboard';
  const isMentor = user.role === 'tutor' || user.role === 'teacher';
  const isTeacher = user.role === 'teacher';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      refreshPlan();
      if (isMentor) {
        toast.success('🎉 Congratulations! Your Mentor Pro subscription is active! All features are unlocked.');
      } else {
        toast.success('🎉 Congratulations! Your TopKorbo Pro subscription is active! All features are unlocked.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshPlan, isMentor]);

  const handleDeleteContest = async (contestId, contestName) => {
    const confirmMessage = language === 'en'
      ? `Delete "${contestName}"? This will also remove all its questions.`
      : `"${contestName}" মুছে ফেলতে চান? এর সাথে সব প্রশ্নও মুছে যাবে।`;
    if (!window.confirm(confirmMessage)) return;

    const token = localStorage.getItem('topkorbo_token');
    if (!token) return;

    const previous = upcomingContests;
    setUpcomingContests((prev) => prev.filter((contest) => contest._id !== contestId));

    try {
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/contests/${contestId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (!resData.success) {
        setUpcomingContests(previous);
        toast.error(resData.message || 'Failed to delete contest');
      }
    } catch (err) {
      console.error('Error deleting contest:', err);
      setUpcomingContests(previous);
      toast.error('Network error while deleting contest');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tokenFromUrl = storeAuthFromUrl();
    const token = tokenFromUrl || localStorage.getItem('topkorbo_token');
    if (!token) {
      window.location.href = '/';
      return undefined;
    }

    const loadDashboard = async () => {
      try {
        setDashboardError('');
        const userData = await requestDashboardUser();
        if (cancelled || !userData) return;

        const nextUser = {
          name: userData.name,
          avatar: userData.avatar || '',
          email: userData.email,
          role: userData.role,
          collegeName: userData.collegeName || '',
          hscBatch: userData.hscBatch || '',
          username: userData.username || ''
        };

        setUser(nextUser);
        persistDashboardUser(nextUser);

        if (nextUser.role === 'student') {
          const [statsResult, activityResult, ratingResult] = await Promise.allSettled([
            getStats(),
            getDashboardActivity(getBrowserTimeZone()),
            getMyRating()
          ]);
          if (cancelled) return;

          if (statsResult.status === 'fulfilled') {
            setPracticeStats(statsResult.value);
          } else {
            console.warn('Practice stats unavailable:', statsResult.reason);
          }
          if (activityResult.status === 'fulfilled') {
            setStudentActivityDays(activityResult.value?.days || []);
          } else {
            console.warn('Dashboard activity unavailable:', activityResult.reason);
          }
          if (ratingResult.status === 'fulfilled' && ratingResult.value) {
            setRatingData(ratingResult.value);
          } else if (ratingResult.status === 'rejected') {
            console.warn('Contest rating unavailable:', ratingResult.reason);
          }
        } else {
          const [mentorResult, contestsResult] = await Promise.allSettled([
            fetchMentorDashboard(),
            nextUser.role === 'teacher'
              ? requestDashboardContests(token, nextUser.role)
              : Promise.resolve([])
          ]);
          if (cancelled) return;

          if (mentorResult.status === 'rejected') throw mentorResult.reason;
          setMentorDashboard(mentorResult.value || EMPTY_MENTOR_DASHBOARD);
          setPendingByStudent(seedPendingSubmissions(mentorResult.value?.students));
          if (contestsResult.status === 'fulfilled') {
            setUpcomingContests(contestsResult.value);
          } else {
            console.warn('Dashboard contests unavailable:', contestsResult.reason);
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401 || err?.status === 403) {
          signOutDashboardUser();
          return;
        }
        console.error('Error fetching user data on dashboard:', err);
        setDashboardError(err.message || 'Failed to load dashboard data.');
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const studentAnalytics = useMemo(
    () => buildStudentAnalytics(studentActivityDays),
    [studentActivityDays]
  );

  const getRemainingTime = (contest) => {
    const offsets = {
      'Asia/Dhaka': '+06:00',
      'Asia/Kolkata': '+05:30',
      'Asia/Dubai': '+04:00',
      'Europe/London': '+00:00',
      'America/New_York': '-05:00',
      'Asia/Tokyo': '+09:00',
      'Asia/Singapore': '+08:00',
      'Australia/Sydney': '+10:00'
    };

    const tz = contest.startTime?.timezone || 'Asia/Dhaka';
    const offset = offsets[tz] || '+06:00';
    let hour = contest.startTime?.hour || 12;
    const minute = contest.startTime?.minute || 0;
    const period = contest.startTime?.period || 'AM';

    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const pad = (num) => String(num).padStart(2, '0');
    const startStr = `${contest.date}T${pad(hour)}:${pad(minute)}:00${offset}`;
    const startDate = new Date(startStr);
    const now = new Date();
    const diffTime = startDate - now;

    if (diffTime <= 0) {
      const durationHours = contest.duration?.hours || 0;
      const durationMinutes = contest.duration?.minutes || 0;
      const endDate = new Date(startDate.getTime() + (durationHours * 60 * 60 * 1000) + (durationMinutes * 60 * 1000));

      if (now <= endDate) {
        return language === 'en' ? 'Running now' : 'চলমান রয়েছে';
      }
      return language === 'en' ? 'Ended' : 'শেষ হয়েছে';
    }

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) return language === 'en' ? `${diffDays} day${diffDays > 1 ? 's' : ''} left` : `${diffDays} দিন বাকি`;
    if (diffHours > 0) return language === 'en' ? `${diffHours} hour${diffHours > 1 ? 's' : ''} left` : `${diffHours} ঘণ্টা বাকি`;
    return language === 'en' ? `${diffMinutes} min${diffMinutes > 1 ? 's' : ''} left` : `${diffMinutes} মিনিট বাকি`;
  };

  const handleRequestResponse = useCallback(async (connectionId, action) => {
    setRespondingRequestId(connectionId);

    // Drop the card immediately. Waiting on a full dashboard refetch before
    // acknowledging the tap reads as a broken button on a phone connection.
    setMentorDashboard((prev) => ({
      ...prev,
      pendingRequests: (prev.pendingRequests || [])
        .filter((request) => String(request._id) !== String(connectionId))
    }));

    try {
      await respondToMentorRequest(connectionId, action);
      toast.success(action === 'accepted' ? 'Student added to your roster.' : 'Request declined.');

      // Accepting produces a roster card with analytics we do not hold locally.
      if (action === 'accepted') {
        const mentorData = await fetchMentorDashboard();
        setMentorDashboard(mentorData || EMPTY_MENTOR_DASHBOARD);
        setPendingByStudent(seedPendingSubmissions(mentorData?.students));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update request.');
      // The card we optimistically removed may still be pending — re-sync.
      try {
        const mentorData = await fetchMentorDashboard();
        setMentorDashboard(mentorData || EMPTY_MENTOR_DASHBOARD);
        setPendingByStudent(seedPendingSubmissions(mentorData?.students));
      } catch {
        // Leave the optimistic view; the toast already explained the failure.
      }
    } finally {
      setRespondingRequestId('');
    }
  }, []);

  const handleLaunchLiveClass = () => navigate('/mentor/live-class');

  const handlePostAnnouncement = async (message, attachments = []) => {
    try {
      const result = await postMentorAnnouncement(message, attachments);
      const count = result?.data?.recipients || result?.recipients;
      toast.success(count
        ? `Announcement sent to ${count} student${count === 1 ? '' : 's'}.`
        : 'Announcement sent.');
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to send announcement.');
      return false;
    }
  };

  const renderStudentWorkspace = () => (
    <div className="student-dashboard-grid">
      <StudentProfileSection
        user={user}
        practiceStats={practiceStats}
        ratingData={ratingData}
        progressStats={studentAnalytics.stats}
      />
      <ContestRatingSection ratingData={ratingData} />
      <DailyProgressSection analytics={studentAnalytics} />
    </div>
  );
  const { on } = useSocket();

  /** Adds or removes one assignment from a student's waiting-for-review set. */
  const markPending = useCallback((studentId, noteId, isPending) => {
    if (!studentId || !noteId) return;
    setPendingByStudent((prev) => {
      const key = String(studentId);
      const id = String(noteId);
      const current = prev[key] || new Set();
      if (current.has(id) === isPending) return prev; // already correct — no re-render
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return { ...prev, [key]: next };
    });
  }, []);

  const handleAssignmentReviewed = useCallback((studentId, noteId) => {
    markPending(studentId, noteId, false);
  }, [markPending]);

  // Closing the dossier must be referentially stable: the drawer's focus-trap
  // effect depends on it, and an inline arrow made that effect tear down on
  // every dashboard re-render, yanking focus out of the feedback box mid-typing.
  const handleCloseDossier = useCallback(() => setDossierStudentId(null), []);

  useEffect(() => {
    if (!isMentor) return undefined;

    const offSubmitted = on('class:assignment:submitted', (note) => {
      markPending(note.studentId || note.student?._id, note._id, true);
    });

    // Covers unsubmit, review and the plain status toggle in one place, because
    // the set is rebuilt from the note's own status rather than nudged by ±1.
    const offUpdate = on('class:assignment:update', (note) => {
      markPending(note.studentId || note.student?._id, note._id, note.status === 'submitted');
    });

    const offRequest = on('mentor:request:new', (request) => {
      setMentorDashboard((prev) => {
        const already = (prev.pendingRequests || [])
          .some((item) => String(item._id) === String(request._id));
        if (already) return prev;
        return { ...prev, pendingRequests: [request, ...(prev.pendingRequests || [])] };
      });
    });

    return () => {
      offSubmitted && offSubmitted();
      offUpdate && offUpdate();
      offRequest && offRequest();
    };
  }, [isMentor, on, markPending]);

  // The roster reads its badge counts from the live set, not the seeded number.
  const rosterStudents = useMemo(
    () => (mentorDashboard.students || []).map((entry) => {
      const pending = pendingByStudent[String(entry.student?._id || '')];
      return pending ? { ...entry, pendingSubmissionsCount: pending.size } : entry;
    }),
    [mentorDashboard.students, pendingByStudent]
  );

  const renderMentorWorkspace = () => (
    <div className="mc-workspace">
      <MentorCommandBar
        mentorName={user.name}
        overview={mentorDashboard.overview}
        capacity={mentorDashboard.capacity}
        pendingCount={mentorDashboard.pendingRequests.length}
        onLaunchLiveClass={handleLaunchLiveClass}
        onPostAnnouncement={handlePostAnnouncement}
      />
      <MentorPendingQueue
        requests={mentorDashboard.pendingRequests}
        respondingRequestId={respondingRequestId}
        onRespond={handleRequestResponse}
      />
      <CohortInsightsRadar weakSpots={mentorDashboard.cohortWeakSpots} />
      <MentorStudentRoster
        students={rosterStudents}
        onOpenDossier={setDossierStudentId}
      />
    </div>
  );

  return (
    <div className="dashboard-container">
      <Sidebar activeTab={activeTab} user={user} />

      <main className={`dashboard-main${isMentor ? ' dashboard-main--mentor' : ''}`}>
        <div className={`dashboard-workspace ${isTeacher ? 'dashboard-workspace--teacher' : ''}`}>
          <div className="dashboard-workspace__body">
            {dashboardError ? <div className="dashboard-empty dashboard-empty--error">{dashboardError}</div> : null}
            {dashboardLoading
              ? (isMentor ? <MentorDashboardSkeleton /> : <div className="dashboard-empty">Loading dashboard...</div>)
              : null}
            {!dashboardLoading && !dashboardError && (isMentor ? renderMentorWorkspace() : renderStudentWorkspace())}
          </div>

          {isTeacher && (
            <div className="dashboard-upcoming-contests">
              <div className="upcoming-contests-header">
                <h3>{language === 'en' ? 'Upcoming contest' : 'আসন্ন কনটেস্ট'}</h3>
              </div>
              <div className="upcoming-contests-list">
                {upcomingContests.length === 0 ? (
                  <div className="upcoming-contests-empty">
                    <span className="empty-icon"><HiCalendar size={24} /></span>
                    <p>{language === 'en' ? 'No upcoming contests' : 'কোনো আসন্ন কনটেস্ট নেই'}</p>
                  </div>
                ) : (
                  upcomingContests.map((contest) => (
                    <div key={contest._id} className="contest-card-upcoming">
                      <div className="contest-card-upcoming__header">
                        <span className="contest-badge-icon"><HiAcademicCap size={16} /></span>
                        <h4 className="contest-title" title={contest.name}>{contest.name}</h4>
                        <button
                          type="button"
                          className="contest-card-upcoming__delete"
                          title={language === 'en' ? 'Delete contest' : 'কনটেস্ট মুছুন'}
                          aria-label="Delete contest"
                          onClick={() => handleDeleteContest(contest._id, contest.name)}
                        >
                          <HiTrash size={16} />
                        </button>
                      </div>
                      <div className="contest-card-upcoming__details">
                        <div className="contest-detail-item">
                          <span className="detail-icon"><HiOutlineClock size={15} /></span>
                          <span className="detail-value">{getRemainingTime(contest)}</span>
                        </div>
                        <div className="contest-detail-item">
                          <span className="detail-icon"><HiOutlineClock size={15} /></span>
                          <span className="detail-value">
                            {contest.startTime?.hour}:{String(contest.startTime?.minute).padStart(2, '0')} {contest.startTime?.period} ({contest.startTime?.timezone})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {dossierStudentId && (
          <StudentDossierDrawer
            key={dossierStudentId}
            studentId={dossierStudentId}
            onClose={handleCloseDossier}
            onAssignmentReviewed={handleAssignmentReviewed}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
