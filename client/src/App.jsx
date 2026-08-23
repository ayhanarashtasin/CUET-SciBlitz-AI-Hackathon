/**
 * Root application component for the TopKorbo client.
 *
 * Defines all client-side routes, wraps the app in the language provider and
 * router, and renders global chrome (Navbar, Footer, toast notifications).
 * Heavy page components are code-split via React.lazy so each route only
 * downloads its own bundle on first visit, keeping the initial payload small.
 * The forum routes are nested inside a shared ForumShell layout that provides
 * sidebar navigation and context for the community feature.
 */

import { Component, lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import BackendStatusBanner from './components/system/BackendStatusBanner';
// The landing page is the LCP element for first-time visitors, so it stays in
// the entry bundle. Every other route is code-split with lazyWithRetry so a given
// page only downloads its own JS/CSS (and heavy deps like react-pdf, katex,
// framer-motion, socket.io) when it is actually visited, with automatic retry.
import LandingPage from './pages/LandingPage';
import GlobalNotificationListener from './components/notifications/GlobalNotificationListener';
import lazyWithRetry from './utils/lazyWithRetry';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Contests = lazyWithRetry(() => import('./pages/Contests'));
const Leaderboard = lazyWithRetry(() => import('./pages/Leaderboard'));
const BecomeTeacher = lazyWithRetry(() => import('./pages/BecomeTeacher'));
const Setting = lazyWithRetry(() => import('./pages/Setting'));
const UploadQuestion = lazyWithRetry(() => import('./pages/UploadQuestion'));
const QuestionBank = lazyWithRetry(() => import('./pages/QuestionBank'));
const BoardQuestionsView = lazyWithRetry(() => import('./pages/BoardQuestionsView'));
const VarsityWrittenView = lazyWithRetry(() => import('./pages/VarsityWrittenView'));
const MockTest = lazyWithRetry(() => import('./pages/MockTest'));
const MockTestExam = lazyWithRetry(() => import('./pages/MockTestExam'));
const Battle = lazyWithRetry(() => import('./pages/Battle'));
const MakeContestQuestion = lazyWithRetry(() => import('./pages/MakeContestQuestion'));
const MakeContestQuestionNext = lazyWithRetry(() => import('./pages/MakeContestQuestionNext'));
const MakeContestQuestionNextTwo = lazyWithRetry(() => import('./pages/MakeContestQuestionNextTwo'));
const MakeContestQuestionChooseQBank = lazyWithRetry(() => import('./pages/MakeContestQuestionChooseQBank'));
const MakeContestQuestionConfirm = lazyWithRetry(() => import('./pages/MakeContestQuestionConfirm'));
const Pricing = lazyWithRetry(() => import('./pages/Pricing'));
const MentorPricing = lazyWithRetry(() => import('./pages/MentorPricing'));
const PaymentStatus = lazyWithRetry(() => import('./pages/PaymentStatus'));
const ReadingBooks = lazyWithRetry(() => import('./pages/ReadingBooks'));
const UploadBook = lazyWithRetry(() => import('./pages/UploadBook'));
const ReadingBookView = lazyWithRetry(() => import('./pages/ReadingBookView'));
const PracticeHistory = lazyWithRetry(() => import('./pages/PracticeHistory'));
const StudyRoutinePage = lazyWithRetry(() => import('./pages/StudyRoutinePage'));
const FindMentor = lazyWithRetry(() => import('./pages/FindMentor'));
const MyClass = lazyWithRetry(() => import('./pages/MyClass'));
const MentorLiveClass = lazyWithRetry(() => import('./pages/MentorLiveClass'));
const StudentLiveClass = lazyWithRetry(() => import('./pages/StudentLiveClass'));
const IeltsPrep = lazyWithRetry(() => import('./pages/IeltsPrep'));
const IeltsTeacher = lazyWithRetry(() => import('./pages/IeltsTeacher'));
const IeltsListeningUpload = lazyWithRetry(() => import('./pages/IeltsListeningUpload'));
const IeltsReadingUpload = lazyWithRetry(() => import('./pages/IeltsReadingUpload'));
const IeltsWritingUpload = lazyWithRetry(() => import('./pages/IeltsWritingUpload'));
const IeltsSpeakingUpload = lazyWithRetry(() => import('./pages/IeltsSpeakingUpload'));
const IeltsListening = lazyWithRetry(() => import('./pages/IeltsListening'));
const IeltsReading = lazyWithRetry(() => import('./pages/IeltsReading'));
const CheatingVerify = lazyWithRetry(() => import('./pages/CheatingVerify'));
const Support = lazyWithRetry(() => import('./pages/Support'));
const SupportTicketDetails = lazyWithRetry(() => import('./pages/SupportTicketDetails'));
const IeltsWriting = lazyWithRetry(() => import('./pages/IeltsWriting'));
const IeltsSpeaking = lazyWithRetry(() => import('./pages/IeltsSpeaking'));
const IeltsListeningPractice = lazyWithRetry(() => import('./pages/IeltsListeningPractice'));
const IeltsReadingPractice = lazyWithRetry(() => import('./pages/IeltsReadingPractice'));
const IeltsWritingPractice = lazyWithRetry(() => import('./pages/IeltsWritingPractice'));
const IeltsWritingDemo = lazyWithRetry(() => import('./pages/IeltsWritingDemo'));
const IeltsSpeakingPractice = lazyWithRetry(() => import('./pages/IeltsSpeakingPractice'));
const IeltsSpeakingDemo = lazyWithRetry(() => import('./pages/IeltsSpeakingDemo'));

// === Forum / Community ===
const ForumShell = lazyWithRetry(() => import('./components/forum/ForumShell'));
const Forum = lazyWithRetry(() => import('./pages/Forum'));
const ForumPostDetail = lazyWithRetry(() => import('./pages/ForumPostDetail'));
const ForumCompose = lazyWithRetry(() => import('./pages/ForumCompose'));
const ForumSearch = lazyWithRetry(() => import('./pages/ForumSearch'));
const ForumUserProfile = lazyWithRetry(() => import('./pages/ForumUserProfile'));
const ForumBookmarks = lazyWithRetry(() => import('./pages/ForumBookmarks'));
import { renderAdminRoutes } from './admin/routes/AdminRoutes';

import './styles/index.css';
import './styles/animations.css';
import './pages/Dashboard.css';
import './styles/forum.css';

function LandingShell({ initialAuthMode = null }) {
  return (
    <>
      <Navbar initialAuthMode={initialAuthMode} />
      <LandingPage />
      <Footer />
    </>
  );
}

function AppContent() {
  return (
    <>
      <BackendStatusBanner />
      <GlobalNotificationListener />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
            fontWeight: '500',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }
        }}
      />
      <PaywallListener />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={<LandingShell />}
          />
          <Route path="/signup" element={<LandingShell initialAuthMode="signup" />} />
          <Route path="/login" element={<LandingShell initialAuthMode="login" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contests" element={<Contests />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/qbank" element={<QuestionBank />} />
          <Route path="/qbank/source-questions" element={<BoardQuestionsView />} />
          <Route path="/qbank/varsity-written" element={<VarsityWrittenView />} />
          <Route path="/setting" element={<Setting />} />
          <Route path="/settings" element={<Setting />} />
          <Route path="/teacher" element={<BecomeTeacher />} />
          <Route path="/upload-question" element={<UploadQuestion />} />
          <Route path="/mock-test" element={<MockTest />} />
          <Route path="/mock-test/exam" element={<MockTestExam />} />
          <Route path="/study-routine" element={<StudyRoutinePage />} />
          <Route path="/practice-history" element={<PracticeHistory />} />
          <Route path="/student/find-mentor" element={<FindMentor />} />
          <Route path="/my-class" element={<MyClass />} />
          <Route path="/battle" element={<Battle />} />
          <Route path="/make-contest-question" element={<MakeContestQuestion />} />
          <Route path="/make-contest-question/next" element={<MakeContestQuestionNext />} />
          <Route path="/make-contest-question/next-two" element={<MakeContestQuestionNextTwo />} />
          <Route path="/make-contest-question/choose-qbank" element={<MakeContestQuestionChooseQBank />} />
          <Route path="/make-contest-question/confirm" element={<MakeContestQuestionConfirm />} />
          <Route path="/cheating-verify" element={<CheatingVerify />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/mentor-pricing" element={<MentorPricing />} />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route path="/reading-books" element={<ReadingBooks />} />
          <Route path="/reading-books/upload" element={<UploadBook />} />
          <Route path="/reading-books/:bookId/:chapterId" element={<ReadingBookView />} />
          <Route path="/mentor/live-class" element={<MentorLiveClass />} />
          <Route path="/student/live-class" element={<StudentLiveClass />} />
          <Route path="/ielts-prep" element={<IeltsPrep />} />
          <Route path="/ielts-teacher" element={<IeltsTeacher />} />
          <Route path="/ielts-teacher/listening/upload" element={<IeltsListeningUpload />} />
          <Route path="/ielts-teacher/reading/upload" element={<IeltsReadingUpload />} />
          <Route path="/ielts-teacher/writing/upload" element={<IeltsWritingUpload />} />
          <Route path="/ielts-teacher/speaking/upload" element={<IeltsSpeakingUpload />} />
          <Route path="/ielts-prep/listening" element={<IeltsListening />} />
          <Route path="/ielts-prep/reading" element={<IeltsReading />} />
          <Route path="/ielts-prep/writing" element={<IeltsWriting />} />
          <Route path="/ielts-prep/speaking" element={<IeltsSpeaking />} />
          <Route path="/ielts-prep/listening/practice" element={<IeltsListeningPractice />} />
          <Route path="/ielts-prep/reading/practice" element={<IeltsReadingPractice />} />
          <Route path="/ielts-prep/writing/practice" element={<IeltsWritingPractice />} />
          <Route path="/ielts-prep/writing/demo" element={<IeltsWritingDemo />} />
          <Route path="/ielts-prep/speaking/practice" element={<IeltsSpeakingPractice />} />
          <Route path="/ielts-prep/speaking/demo" element={<IeltsSpeakingDemo />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/:ticketId" element={<SupportTicketDetails />} />

          {renderAdminRoutes()}

          {/* Forum routes are nested under ForumShell, which provides the
              shared sidebar layout, forum context, and real-time socket
              connection for all community pages. */}
          <Route element={<ForumShell />}>
            <Route path="/forum" element={<Forum />} />
            <Route path="/forum/compose" element={<ForumCompose />} />
            <Route path="/forum/post/:id" element={<ForumPostDetail />} />
            <Route path="/forum/search" element={<ForumSearch />} />
            <Route path="/forum/bookmarks" element={<ForumBookmarks />} />
            <Route path="/forum/u/:id" element={<ForumUserProfile />} />
          </Route>

        </Routes>
      </Suspense>
    </>
  );
}

/**
 * PaywallListener — routes the user to /pricing when any API call reports a
 * plan limit / upgrade-required response (see utils/paywall.js, which toasts
 * and dispatches the `topkorbo:paywall` event).
 */
function PaywallListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const onPaywall = () => navigate('/pricing');
    window.addEventListener('topkorbo:paywall', onPaywall);
    return () => window.removeEventListener('topkorbo:paywall', onPaywall);
  }, [navigate]);
  return null;
}

/**
 * Lightweight fallback shown while a lazily-loaded route chunk downloads.
 * Intentionally minimal (no heavy deps) so it never delays the first paint.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div className="route-fallback-spinner" />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <Router>
        <ForumErrorBoundary>
          <AppContent />
        </ForumErrorBoundary>
      </Router>
    </LanguageProvider>
  );
}

/**
 * ForumErrorBoundary — surfaces render errors instead of a blank white page.
 * Logs diagnostics for developers while keeping production error details
 * out of the rendered page.
 */
class ForumErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ForumErrorBoundary]', error, info);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.__lastForumError = { message: String(error?.message || error), stack: error?.stack, info };
    }
  }
  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };
  handleHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            maxWidth: 600,
            margin: '60px auto',
            padding: '32px 24px',
            borderRadius: 16,
            background: '#fffdfb',
            border: '1px solid #e6ccb2',
            boxShadow: '0 10px 30px rgba(140, 90, 60, 0.1)',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#fff1f0',
              color: '#cf1322',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              margin: '0 auto 16px'
            }}
          >
            ⚠️
          </div>
          <h2 style={{ margin: '0 0 8px', color: '#251817', fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem' }}>
            Something went wrong rendering this page
          </h2>
          <p style={{ margin: '0 0 20px', color: '#5c4d4c', fontSize: '0.95rem', lineHeight: 1.5 }}>
            A temporary component or network issue occurred while loading this view.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #C08552, #8C5A3C)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(140, 90, 60, 0.25)'
              }}
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: '#f7ebe1',
                color: '#4b2e2b',
                border: '1px solid #e6ccb2',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
