import { useState, useEffect } from 'react';
import { HiHome, HiAcademicCap, HiBookOpen, HiUpload, HiClipboardList, HiCalendar, HiLibrary, HiChatAlt2, HiLightningBolt, HiClipboardCheck, HiVideoCamera, HiSearch, HiUserGroup, HiMenu, HiX, HiLockClosed, HiSparkles, HiSupport, HiShieldExclamation } from 'react-icons/hi';
import { useLanguage } from '../../hooks/useLanguage';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../../hooks/usePlan';
import './Sidebar.css';

export default function Sidebar({ activeTab, user }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { isMentorPro, plan: currentPlan, planExpiresAt, planIsTrial } = usePlan();

  // Defensive defaults so the sidebar never crashes if the parent passes a
  // partial `user` (e.g. during the initial render before /auth/me resolves).
  const safeUser = {
    name: 'Student',
    avatar: '',
    role: 'student',
    ...(user || {})
  };
  const isMentor = safeUser.role === 'tutor' || safeUser.role === 'mentor';

  const getPlanInfoText = () => {
    if (isMentor || safeUser.role === 'teacher') {
      if (safeUser.role === 'teacher') return 'Institutional Teacher';
      if (!isMentorPro) return 'Free Plan (Requests Only)';
      
      const labelMap = {
        mentor_pro: 'Mentor Pro (1 Month)',
        mentor_3months: 'Mentor Pro (3 Months)',
        mentor_6months: 'Mentor Pro (6 Months)',
        mentor_yearly: 'Mentor Pro (1 Year)'
      };
      const planName = planIsTrial
        ? 'Mentor Pro Trial'
        : (labelMap[currentPlan] || 'Mentor Pro');
      
      if (!planExpiresAt) return planName;
      const daysLeft = Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return `${planName} · ${daysLeft}d left`;
    }
    return null;
  };
  const userInitial = (safeUser.name && safeUser.name.length)
    ? safeUser.name.charAt(0).toUpperCase()
    : 'S';

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('topkorbo_sidebar_collapsed') === 'true'
  );
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasUnreadClass, setHasUnreadClass] = useState(
    () => localStorage.getItem('topkorbo_class_unread') === 'true'
  );

  useEffect(() => {
    if (activeTab === 'my-class') {
      setHasUnreadClass(false);
      localStorage.removeItem('topkorbo_class_unread');
    }
  }, [activeTab]);

  useEffect(() => {
    const handleUnread = () => setHasUnreadClass(true);
    window.addEventListener('topkorbo:class:unread', handleUnread);
    return () => window.removeEventListener('topkorbo:class:unread', handleUnread);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  const toggleSidebar = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    localStorage.setItem('topkorbo_sidebar_collapsed', String(nextVal));
  };

  // ── Build menu items exactly as before ──
  const menuItems = [
    { id: 'dashboard', label: t('db.menu.dashboard'), icon: <HiHome size={20} /> }
  ];

  // Community / Forum — open to every signed-in user.
  menuItems.push({
    id: 'forum',
    label: t('db.menu.forum') || 'Community',
    icon: <HiChatAlt2 size={20} />
  });

  // Reading Books: shown to students and teachers (hidden for mentors)
  if (!isMentor) {
    menuItems.push({
      id: 'reading-books',
      label: t('db.menu.reading_books'),
      icon: <HiLibrary size={20} />
    });
  }

  // Show Question Bank for students, tutors, and teachers
  if (safeUser.role === 'student' || isMentor || safeUser.role === 'teacher') {
    menuItems.push({
      id: 'qbank',
      label: t('db.menu.qbank'),
      icon: <HiBookOpen size={20} />
    });
    if (!isMentor) {
      menuItems.push({
        id: 'study-routine',
        label: language === 'en' ? 'Study Routine' : 'স্টাডি রুটিন',
        icon: <HiCalendar size={20} />
      });
    }
    menuItems.push({
      id: 'mock-test',
      label: t('db.menu.mock_test'),
      icon: <HiClipboardList size={20} />
    });
    if (safeUser.role === 'student') {
      menuItems.push({
        id: 'my-class',
        label: language === 'en' ? 'My Class' : 'আমার ক্লাস',
        icon: <HiUserGroup size={20} />
      });
      menuItems.push({
        id: 'find-mentor',
        label: 'Find Mentor',
        icon: <HiSearch size={20} />
      });

    }
    if (!isMentor) {
      menuItems.push({
        id: 'practice-history',
        label: t('db.menu.practice_history') || 'Practice History',
        icon: <HiClipboardCheck size={20} />
      });
    }
    menuItems.push({
      id: 'battle',
      label: t('db.menu.battle') || 'Battle',
      icon: <HiLightningBolt size={20} />
    });
    menuItems.push({
      id: 'live-class',
      label: 'Live Class',
      icon: <HiVideoCamera size={20} />
    });
  }

  if (safeUser.role === 'student') {
    menuItems.push({
      id: 'contests',
      label: language === 'en' ? 'Contests' : 'কনটেস্টসমূহ',
      icon: <HiCalendar size={20} />
    });
    menuItems.push({
      id: 'ielts-prep',
      label: language === 'en' ? 'IELTS Preparation' : 'আইইএলটিএস প্রস্তুতি',
      icon: <HiClipboardList size={20} />
    });
  }

  // Show teacher application tab only for tutors or approved teachers
  if (isMentor || safeUser.role === 'teacher') {
    menuItems.push({
      id: 'teacher',
      label: t('db.menu.teacher'),
      icon: <HiAcademicCap size={20} />
    });
  }

  // Show pricing plans for students and tutors
  if (safeUser.role === 'student' || isMentor) {
    menuItems.push({
      id: 'pricing',
      label: language === 'en' ? 'Premium Plans' : 'প্রিমিয়াম প্ল্যান',
      icon: <HiSparkles size={20} />
    });
  }

  // Show Upload Question and Create Contest tabs only for teachers
  if (safeUser.role === 'teacher') {
    menuItems.push({
      id: 'make-contest-question',
      label: language === 'en' ? 'Contests' : 'কনটেস্টসমূহ',
      icon: <HiCalendar size={20} />
    });

    menuItems.push({
      id: 'upload-question',
      label: t('db.menu.upload_question'),
      icon: <HiUpload size={20} />
    });

    menuItems.push({
      id: 'ielts-teacher',
      label: language === 'en' ? 'IELTS' : 'আইইএলটিএস',
      icon: <HiClipboardList size={20} />
    });

    menuItems.push({
      id: 'cheating-verify',
      label: language === 'en' ? 'Cheating Verify' : 'চিটিং যাচাই',
      icon: <HiShieldExclamation size={20} />
    });
  }

  menuItems.push({
    id: 'support',
    label: language === 'en' ? 'Support' : 'সাপোর্ট',
    icon: <HiSupport size={20} />
  });

  // ── Click handler (unchanged) ──
  const handleMenuClick = (item) => {
    const isLockedForTutor = isMentor && !isMentorPro && item.id !== 'dashboard' && item.id !== 'pricing' && item.id !== 'support';
    if (isLockedForTutor) {
      navigate('/pricing');
      return;
    }
    if (item.id === 'pricing') navigate('/pricing');
    else if (item.id === 'teacher') navigate('/teacher');
    else if (item.id === 'qbank') {
      sessionStorage.removeItem('qbank_selected_subject_id');
      sessionStorage.removeItem('qbank_selected_prep_stream');
      sessionStorage.removeItem('qbank_selected_source_context');
      window.dispatchEvent(new Event('reset-qbank'));
      navigate('/qbank');
    }
    else if (item.id === 'upload-question') navigate('/upload-question');
    else if (item.id === 'ielts-teacher') navigate('/ielts-teacher');
    else if (item.id === 'cheating-verify') navigate('/cheating-verify');
    else if (item.id === 'make-contest-question') navigate('/make-contest-question');
    else if (item.id === 'study-routine') navigate('/study-routine');
    else if (item.id === 'mock-test') navigate('/mock-test');
    else if (item.id === 'my-class') navigate('/my-class');
    else if (item.id === 'find-mentor') navigate('/student/find-mentor');
    else if (item.id === 'practice-history') navigate('/practice-history');
    else if (item.id === 'battle') navigate('/battle');
    else if (item.id === 'live-class') {
      if (safeUser.role === 'student') navigate('/student/live-class');
      else navigate('/mentor/live-class');
    }
    else if (item.id === 'contests') navigate('/contests');
    else if (item.id === 'ielts-prep') navigate('/ielts-prep');
    else if (item.id === 'reading-books') navigate('/reading-books');
    else if (item.id === 'forum') navigate('/forum');
    else if (item.id === 'support') navigate('/support');
    else navigate('/dashboard');
  };

  // ── Group menu items into logical sections ──
  // Section definitions: each section has a label and an ordered list of item IDs.
  // Items not matching any section are placed at the end under "MORE".
  const sectionDefs = [
    {
      label: language === 'en' ? 'Main' : 'প্রধান',
      ids: ['dashboard', 'forum', 'reading-books', 'qbank']
    },
    {
      label: language === 'en' ? 'Learning' : 'শিক্ষা',
      ids: ['my-class', 'study-routine', 'mock-test', 'find-mentor', 'practice-history', 'live-class', 'ielts-prep']
    },
    {
      label: language === 'en' ? 'Compete' : 'প্রতিযোগিতা',
      ids: ['battle', 'contests', 'make-contest-question']
    },
    {
      label: language === 'en' ? 'More' : 'আরও',
      ids: ['teacher', 'pricing', 'upload-question', 'ielts-teacher', 'cheating-verify', 'support']
    }
  ];

  // Build grouped sections from menu items
  const groupedSections = [];
  const placed = new Set();

  for (const section of sectionDefs) {
    const items = section.ids
      .map(id => menuItems.find(m => m.id === id))
      .filter(Boolean);
    if (items.length > 0) {
      groupedSections.push({ label: section.label, items });
      items.forEach(i => placed.add(i.id));
    }
  }

  // Catch any items not placed (safety)
  const remaining = menuItems.filter(m => !placed.has(m.id));
  if (remaining.length > 0) {
    const existingMore = groupedSections.find(s => s.label === (language === 'en' ? 'More' : 'আরও'));
    if (existingMore) {
      existingMore.items.push(...remaining);
    } else {
      groupedSections.push({ label: language === 'en' ? 'More' : 'আরও', items: remaining });
    }
  }

  // ── Render a single menu button ──
  const renderMenuItem = (item) => {
    const isLockedForTutor = isMentor && !isMentorPro && item.id !== 'dashboard' && item.id !== 'pricing' && item.id !== 'support';
    const showClassBadge = item.id === 'my-class' && hasUnreadClass && activeTab !== 'my-class';

    return (
      <li key={item.id}>
        <button
          onClick={() => handleMenuClick(item)}
          className={`dashboard-sidebar__menu-btn ${activeTab === item.id ? 'dashboard-sidebar__menu-btn--active' : ''} ${isLockedForTutor ? 'dashboard-sidebar__menu-btn--locked' : ''}`}
        >
          <span className="dashboard-sidebar__menu-icon" style={{ position: 'relative' }}>
            {item.icon}
            {showClassBadge && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#B3261E',
                  border: '1.5px solid #FAF4EE',
                  boxShadow: '0 0 6px rgba(179, 38, 30, 0.7)'
                }}
              />
            )}
          </span>
          <span className="dashboard-sidebar__menu-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {item.label}
            {showClassBadge && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(179, 38, 30, 0.15)',
                  color: '#B3261E',
                  lineHeight: '1.2'
                }}
              >
                NEW
              </span>
            )}
          </span>
          {isLockedForTutor && (
            <HiLockClosed className="dashboard-sidebar__menu-lock" title="Requires Mentor Pro Plan" />
          )}
          {/* Tooltip for collapsed state */}
          <span className="dashboard-sidebar__menu-tooltip">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="dashboard-mobile-topbar">
        <div className="dashboard-sidebar__logo-container">
          <a href="/" className="dashboard-sidebar__logo">
            <svg viewBox="0 0 100 100" fill="none" className="dashboard-sidebar__logo-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="dbLogoGradMobile" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#C08552" />
                  <stop offset="35%" stopColor="#D4A373" />
                  <stop offset="70%" stopColor="#8C5A3C" />
                  <stop offset="100%" stopColor="#4B2E2B" />
                </linearGradient>
              </defs>
              <path d="M 28,45 C 28,45 28,58 50,68 C 72,58 72,45 72,45" stroke="url(#dbLogoGradMobile)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.2)" />
              <path d="M 50,15 L 90,36 L 50,57 L 10,36 Z" stroke="url(#dbLogoGradMobile)" strokeWidth="4.5" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.55)" />
              <path d="M 50,19 L 82,36 L 50,53 L 18,36 Z" stroke="url(#dbLogoGradMobile)" strokeWidth="1" strokeLinejoin="round" fill="url(#dbLogoGradMobile)" fillOpacity="0.08" />
              <path d="M 37,25 H 63 M 50,25 V 45" stroke="url(#dbLogoGradMobile)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 37,25 V 29 M 63,25 V 29" stroke="url(#dbLogoGradMobile)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 44,28 V 44" stroke="url(#dbLogoGradMobile)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M 44,36 L 55,28 M 44,36 L 55,44" stroke="url(#dbLogoGradMobile)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 50,36 C 40,30 20,25 18,32 L 18,50" stroke="url(#dbLogoGradMobile)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="18" cy="52" r="3.5" fill="url(#dbLogoGradMobile)" />
              <path d="M 14,55 H 22 L 24,78 H 12 Z" fill="url(#dbLogoGradMobile)" />
            </svg>
            <span className="dashboard-sidebar__logo-text">𝖙𝖔𝖕ƙ𝖔𝖗𝖇𝖔</span>
          </a>
        </div>
        <button
          className="dashboard-mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <HiX size={22} /> : <HiMenu size={22} />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="dashboard-mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`dashboard-sidebar ${isSidebarCollapsed ? 'dashboard-sidebar--collapsed' : ''} ${isMobileMenuOpen ? 'dashboard-sidebar--mobile-open' : ''}`}>
        {/* Sidebar Logo */}
        <div className="dashboard-sidebar__logo-container desktop-only-logo">
        <a href="/" className="dashboard-sidebar__logo">
          <svg viewBox="0 0 100 100" fill="none" className="dashboard-sidebar__logo-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="dbLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C08552" />
                <stop offset="35%" stopColor="#D4A373" />
                <stop offset="70%" stopColor="#8C5A3C" />
                <stop offset="100%" stopColor="#4B2E2B" />
              </linearGradient>
            </defs>
            <path d="M 28,45 C 28,45 28,58 50,68 C 72,58 72,45 72,45" stroke="url(#dbLogoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.2)" />
            <path d="M 50,15 L 90,36 L 50,57 L 10,36 Z" stroke="url(#dbLogoGrad)" strokeWidth="4.5" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.55)" />
            <path d="M 50,19 L 82,36 L 50,53 L 18,36 Z" stroke="url(#dbLogoGrad)" strokeWidth="1" strokeLinejoin="round" fill="url(#dbLogoGrad)" fillOpacity="0.08" />
            <path d="M 37,25 H 63 M 50,25 V 45" stroke="url(#dbLogoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 37,25 V 29 M 63,25 V 29" stroke="url(#dbLogoGrad)" strokeWidth="3" strokeLinecap="round" />
            <path d="M 44,28 V 44" stroke="url(#dbLogoGrad)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M 44,36 L 55,28 M 44,36 L 55,44" stroke="url(#dbLogoGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 50,36 C 40,30 20,25 18,32 L 18,50" stroke="url(#dbLogoGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="18" cy="52" r="3.5" fill="url(#dbLogoGrad)" />
            <path d="M 14,55 H 22 L 24,78 H 12 Z" fill="url(#dbLogoGrad)" />
          </svg>
          <span className="dashboard-sidebar__logo-text">𝖙𝖔𝖕ƙ𝖔𝖗𝖇𝖔</span>
        </a>

        <button
          type="button"
          className="dashboard-sidebar__toggle-btn"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? t('db.menu.open_sidebar') : t('db.menu.close_sidebar')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="dashboard-sidebar__toggle-icon">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          <div className="dashboard-sidebar__toggle-tooltip">
            <span className="tooltip-action">
              {isSidebarCollapsed ? (language === 'en' ? 'Open' : 'খুলুন') : (language === 'en' ? 'Close' : 'বন্ধ করুন')}
            </span>{' '}
            <span className="tooltip-target">
              {language === 'en' ? 'sidebar' : 'সাইডবার'}
            </span>
          </div>
        </button>
      </div>

      {/* Sidebar Menu Items — Grouped by Section */}
      <nav className="dashboard-sidebar__nav">
        {groupedSections.map((section, idx) => (
          <div className="dashboard-sidebar__section-group" key={section.label}>
            <div
              className="dashboard-sidebar__section-label"
              style={idx === 0 ? { marginTop: 0 } : undefined}
            >
              {section.label}
            </div>
            <ul className="dashboard-sidebar__menu">
              {section.items.map(renderMenuItem)}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer: Profile */}
      <div className="dashboard-sidebar__footer">
        {/* Profile Badge - Click to go to Settings */}
        <div
          className="dashboard-sidebar__profile"
          onClick={() => navigate('/setting')}
          style={{ cursor: 'pointer' }}
          title={t('db.menu.settings')}
        >
          <div className="dashboard-sidebar__avatar-wrapper">
            {safeUser.avatar ? (
              <img src={safeUser.avatar} referrerPolicy="no-referrer" alt="Profile" className="dashboard-sidebar__avatar" />
            ) : (
              <div className="dashboard-sidebar__avatar-placeholder">
                {userInitial}
              </div>
            )}
          </div>
          <div className="dashboard-sidebar__user-info">
            <h4 className="dashboard-sidebar__user-name">{safeUser.name}</h4>
            {getPlanInfoText() && (
              <span className={`dashboard-sidebar__user-plan ${isMentorPro ? 'is-active-pro' : ''}`}>
                {getPlanInfoText()}
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
