import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuLayoutDashboard,
  LuMessageSquare,
  LuCalendarDays,
  LuBookOpen,
  LuCircleHelp,
  LuClipboardCheck,
  LuHistory,
  LuSearch,
  LuGraduationCap,
  LuVideo,
  LuSwords,
  LuTrophy,
  LuLanguages,
  LuSparkles,
  LuHeadphones,
  LuShieldAlert,
  LuAward,
  LuUpload,
  LuChevronDown,
  LuVolume2,
  LuPencil,
  LuMic,
  LuMenu,
  LuX,
  LuLock,
  LuSettings,
  LuPanelLeftClose,
  LuPanelLeftOpen
} from 'react-icons/lu';
import { useLanguage } from '../../hooks/useLanguage';
import { usePlan } from '../../hooks/usePlan';
import './Sidebar.css';

export default function Sidebar({ activeTab, user }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { isMentorPro, plan: currentPlan, planExpiresAt, planIsTrial } = usePlan();

  // Defensive safeUser defaults
  const safeUser = useMemo(() => ({
    name: 'Student',
    avatar: '',
    role: 'student',
    ...(user || {})
  }), [user]);

  const isMentor = safeUser.role === 'tutor' || safeUser.role === 'mentor';
  const isTeacher = safeUser.role === 'teacher';
  const isStudent = !isMentor && !isTeacher;

  // Plan info label for mentors & teachers
  const planInfoText = useMemo(() => {
    if (isMentor || isTeacher) {
      if (isTeacher) return language === 'en' ? 'Institutional Teacher' : 'প্রাতিষ্ঠানিক শিক্ষক';
      if (!isMentorPro) return language === 'en' ? 'Free (Requests Only)' : 'ফ্রি প্ল্যান';

      const labelMap = {
        mentor_pro: language === 'en' ? 'Mentor Pro (1M)' : 'মেন্টর প্রো (১ মাস)',
        mentor_3months: language === 'en' ? 'Mentor Pro (3M)' : 'মেন্টর প্রো (৩ মাস)',
        mentor_6months: language === 'en' ? 'Mentor Pro (6M)' : 'মেন্টর প্রো (৬ মাস)',
        mentor_yearly: language === 'en' ? 'Mentor Pro (1Y)' : 'মেন্টর প্রো (১ বছর)'
      };
      const planName = planIsTrial
        ? (language === 'en' ? 'Mentor Pro Trial' : 'প্রো ট্রায়াল')
        : (labelMap[currentPlan] || 'Mentor Pro');

      if (!planExpiresAt) return planName;
      const daysLeft = Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return `${planName} · ${daysLeft}d`;
    }
    return null;
  }, [isMentor, isTeacher, isMentorPro, planIsTrial, currentPlan, planExpiresAt, language]);

  const userInitial = useMemo(() => {
    return (safeUser.name && safeUser.name.length)
      ? safeUser.name.charAt(0).toUpperCase()
      : 'S';
  }, [safeUser.name]);

  // Sidebar collapse state (desktop only)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('topkorbo_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Mobile viewport tracking (<= 768px)
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  });

  // Mobile menu open state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll and handle Escape key when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          setIsMobileMenuOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isMobileMenuOpen]);

  // Unread class badge
  const [hasUnreadClass, setHasUnreadClass] = useState(() => {
    try {
      return localStorage.getItem('topkorbo_class_unread') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (activeTab === 'my-class') {
      setHasUnreadClass(false);
      try {
        localStorage.removeItem('topkorbo_class_unread');
      } catch {}
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

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const nextVal = !prev;
      try {
        localStorage.setItem('topkorbo_sidebar_collapsed', String(nextVal));
      } catch {}
      return nextVal;
    });
  }, []);

  // Collapsed icon mode ONLY takes effect on desktop viewports
  const isCollapsedMode = isSidebarCollapsed && !isMobile;

  // ── Helper to check if item is currently active ──
  const isItemActive = useCallback((itemId) => {
    if (activeTab === itemId) return true;
    if (itemId === 'ielts-prep' && ['ielts-reading', 'ielts-listening', 'ielts-writing', 'ielts-speaking'].includes(activeTab)) {
      return true;
    }
    if (itemId === 'contests' && activeTab === 'make-contest-question' && !isTeacher) {
      return true;
    }
    if (isTeacher) {
      if (itemId === 'ielts-teacher-listening' && (activeTab === 'ielts-teacher-listening' || (typeof window !== 'undefined' && window.location.pathname.includes('/ielts-teacher/listening')))) return true;
      if (itemId === 'ielts-teacher-reading' && (activeTab === 'ielts-teacher-reading' || (typeof window !== 'undefined' && window.location.pathname.includes('/ielts-teacher/reading')))) return true;
      if (itemId === 'ielts-teacher-writing' && (activeTab === 'ielts-teacher-writing' || (typeof window !== 'undefined' && window.location.pathname.includes('/ielts-teacher/writing')))) return true;
      if (itemId === 'ielts-teacher-speaking' && (activeTab === 'ielts-teacher-speaking' || (typeof window !== 'undefined' && window.location.pathname.includes('/ielts-teacher/speaking')))) return true;
      if (itemId === 'ielts-teacher' && activeTab === 'ielts-teacher' && typeof window !== 'undefined' && window.location.pathname === '/ielts-teacher') return true;
    }
    return false;
  }, [activeTab, isTeacher]);

  // ── Section Definitions according to requirements ──
  // Main, Learning, Guideline, Compete, More
  const sections = useMemo(() => {
    const mainItems = [
      {
        id: 'dashboard',
        label: t('db.menu.dashboard') || (language === 'en' ? 'Dashboard' : 'ড্যাশবোর্ড'),
        icon: <LuLayoutDashboard size={18} />,
        path: '/dashboard'
      },
      {
        id: 'forum',
        label: t('db.menu.forum') || (language === 'en' ? 'Community' : 'কমিউনিটি'),
        icon: <LuMessageSquare size={18} />,
        path: '/forum'
      }
    ];

    if (!isMentor) {
      mainItems.push({
        id: 'study-routine',
        label: language === 'en' ? 'Study Routine' : 'স্টাডি রুটিন',
        icon: <LuCalendarDays size={18} />,
        path: '/study-routine'
      });
    }

    const learningItems = [];
    if (!isMentor) {
      learningItems.push({
        id: 'reading-books',
        label: t('db.menu.reading_books') || (language === 'en' ? 'Reading Books' : 'বইসমূহ'),
        icon: <LuBookOpen size={18} />,
        path: '/reading-books'
      });
    }
    learningItems.push({
      id: 'qbank',
      label: t('db.menu.qbank') || (language === 'en' ? 'Question Bank' : 'প্রশ্ন ব্যাংক'),
      icon: <LuCircleHelp size={18} />,
      path: '/qbank'
    });
    learningItems.push({
      id: 'mock-test',
      label: t('db.menu.mock_test') || (language === 'en' ? 'Mock Test' : 'মক টেস্ট'),
      icon: <LuClipboardCheck size={18} />,
      path: '/mock-test'
    });
    if (!isMentor) {
      learningItems.push({
        id: 'practice-history',
        label: t('db.menu.practice_history') || (language === 'en' ? 'Practice History' : 'অনুশীলন ইতিহাস'),
        icon: <LuHistory size={18} />,
        path: '/practice-history'
      });
    }
    if (isTeacher) {
      learningItems.push({
        id: 'upload-question',
        label: t('db.menu.upload_question') || (language === 'en' ? 'Upload Question' : 'প্রশ্ন আপলোড'),
        icon: <LuUpload size={18} />,
        path: '/upload-question'
      });
    }

    const guidelineItems = [];
    if (isStudent) {
      guidelineItems.push({
        id: 'find-mentor',
        label: language === 'en' ? 'Find Mentor' : 'মেন্টর খুঁজুন',
        icon: <LuSearch size={18} />,
        path: '/student/find-mentor'
      });
      guidelineItems.push({
        id: 'my-class',
        label: language === 'en' ? 'My Class' : 'আমার ক্লাস',
        icon: <LuGraduationCap size={18} />,
        path: '/my-class',
        hasBadge: hasUnreadClass && activeTab !== 'my-class'
      });
    }
    guidelineItems.push({
      id: 'live-class',
      label: language === 'en' ? 'Live Class' : 'লাইভ ক্লাস',
      icon: <LuVideo size={18} />,
      path: isStudent ? '/student/live-class' : '/mentor/live-class'
    });
    if (isMentor || isTeacher) {
      guidelineItems.push({
        id: 'teacher',
        label: t('db.menu.teacher') || (language === 'en' ? 'Teacher Portal' : 'শিক্ষক পোর্টাল'),
        icon: <LuAward size={18} />,
        path: '/teacher'
      });
    }

    const competeItems = [
      {
        id: 'battle',
        label: t('db.menu.battle') || (language === 'en' ? 'Battle' : 'ব্যাটল'),
        icon: <LuSwords size={18} />,
        path: '/battle'
      }
    ];
    if (isStudent) {
      competeItems.push({
        id: 'contests',
        label: language === 'en' ? 'Contests' : 'কনটেস্টসমূহ',
        icon: <LuTrophy size={18} />,
        path: '/contests'
      });
    } else if (isTeacher) {
      competeItems.push({
        id: 'make-contest-question',
        label: language === 'en' ? 'Contests' : 'কনটেস্টসমূহ',
        icon: <LuTrophy size={18} />,
        path: '/make-contest-question'
      });
      competeItems.push({
        id: 'cheating-verify',
        label: language === 'en' ? 'Cheating Verify' : 'চিটিং যাচাই',
        icon: <LuShieldAlert size={18} />,
        path: '/cheating-verify'
      });
    }

    const moreItems = [];
    if (isStudent) {
      moreItems.push({
        id: 'ielts-prep',
        label: language === 'en' ? 'IELTS' : 'আইইএলটিএস',
        icon: <LuLanguages size={18} />,
        path: '/ielts-prep'
      });
    } else if (isTeacher) {
      moreItems.push({
        id: 'ielts-teacher-group',
        label: language === 'en' ? 'IELTS' : 'আইইএলটিএস',
        icon: <LuLanguages size={18} />,
        path: '/ielts-teacher',
        children: [
          {
            id: 'ielts-teacher-listening',
            label: language === 'en' ? 'Listening' : 'লিসেনিং',
            icon: <LuVolume2 size={16} />,
            path: '/ielts-teacher/listening/upload'
          },
          {
            id: 'ielts-teacher-reading',
            label: language === 'en' ? 'Reading' : 'রিডিং',
            icon: <LuBookOpen size={16} />,
            path: '/ielts-teacher/reading/upload'
          },
          {
            id: 'ielts-teacher-writing',
            label: language === 'en' ? 'Writing' : 'রাইটিং',
            icon: <LuPencil size={16} />,
            path: '/ielts-teacher/writing/upload'
          },
          {
            id: 'ielts-teacher-speaking',
            label: language === 'en' ? 'Speaking' : 'স্পিকিং',
            icon: <LuMic size={16} />,
            path: '/ielts-teacher/speaking/upload'
          }
        ]
      });
    }

    const plansAndMoreItems = [
      {
        id: 'pricing',
        label: language === 'en' ? 'Premium Plans' : 'প্রিমিয়াম প্ল্যান',
        icon: <LuSparkles size={18} />,
        path: '/pricing',
        tag: 'PRO'
      },
      {
        id: 'support',
        label: language === 'en' ? 'Support' : 'সাপোর্ট',
        icon: <LuHeadphones size={18} />,
        path: '/support'
      }
    ];

    return [
      {
        key: 'main',
        title: language === 'en' ? 'Main' : 'প্রধান',
        items: mainItems
      },
      {
        key: 'learning',
        title: language === 'en' ? 'Learning' : 'শিক্ষা',
        items: learningItems
      },
      {
        key: 'guideline',
        title: language === 'en' ? 'Guideline' : 'গাইডলাইন',
        items: guidelineItems
      },
      {
        key: 'compete',
        title: language === 'en' ? 'Compete' : 'প্রতিযোগিতা',
        items: competeItems
      },
      {
        key: 'ielts-hub',
        title: language === 'en' ? 'IELTS Hub' : 'আইইএলটিএস হাব',
        items: moreItems
      },
      {
        key: 'plans-and-more',
        title: language === 'en' ? 'Plans and more' : 'প্ল্যান এবং অন্যান্য',
        items: plansAndMoreItems
      }
    ].filter(section => section.items.length > 0);
  }, [t, language, isMentor, isTeacher, isStudent, hasUnreadClass, activeTab]);

  // ── Accordion State: MAIN expanded by default; persisted across navigation ──
  const DEFAULT_EXPANDED = { main: true, learning: false, guideline: false, compete: false, 'ielts-hub': false, 'plans-and-more': false };
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('topkorbo_sidebar_expanded') || 'null');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        return { ...DEFAULT_EXPANDED, ...stored };
      }
    } catch {
      /* corrupted storage — fall back to defaults */
    }
    return { ...DEFAULT_EXPANDED };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('topkorbo_sidebar_expanded', JSON.stringify(expandedSections));
    } catch {
      /* storage unavailable — accordion still works for this mount */
    }
  }, [expandedSections]);

  // ── IELTS Teacher sub-dropdown accordion state ──
  const [isIeltsSubOpen, setIsIeltsSubOpen] = useState(true);

  useEffect(() => {
    if (isTeacher && (activeTab?.startsWith('ielts-teacher') || (typeof window !== 'undefined' && window.location.pathname.includes('/ielts-teacher')))) {
      setIsIeltsSubOpen(true);
    }
  }, [activeTab, isTeacher]);

  // ── Automatically keep the section containing activeTab expanded ──
  useEffect(() => {
    if (!activeTab) return;
    for (const section of sections) {
      if (section.items.some(item => isItemActive(item.id) || (item.children && item.children.some(child => isItemActive(child.id))))) {
        setExpandedSections(prev => {
          if (prev[section.key]) return prev;
          return { ...prev, [section.key]: true };
        });
        break;
      }
    }
  }, [activeTab, sections, isItemActive]);

  // Toggle individual section accordion with non-blocking instant state update
  const handleSectionToggle = useCallback((sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  }, []);

  // ── Menu Item Click Handler ──
  const handleMenuClick = useCallback((item) => {
    const isLockedForTutor = isMentor && !isMentorPro &&
      item.id !== 'dashboard' && item.id !== 'pricing' && item.id !== 'support';

    if (isLockedForTutor) {
      navigate('/pricing');
      return;
    }

    if (item.id === 'qbank') {
      try {
        sessionStorage.removeItem('qbank_selected_subject_id');
        sessionStorage.removeItem('qbank_selected_prep_stream');
        sessionStorage.removeItem('qbank_selected_source_context');
      } catch {}
      window.dispatchEvent(new Event('reset-qbank'));
    }

    navigate(item.path);
    setIsMobileMenuOpen(false);
  }, [isMentor, isMentorPro, navigate]);

  // ── Render single menu navigation item ──
  const renderMenuItem = (item, isInsideTree = true) => {
    const isLockedForTutor = isMentor && !isMentorPro &&
      item.id !== 'dashboard' && item.id !== 'pricing' && item.id !== 'support';

    // Item has sub-dropdown children (e.g. IELTS for teachers)
    if (item.children && item.children.length > 0) {
      const isSubExpanded = isIeltsSubOpen;
      const isAnyChildActive = item.children.some(child => isItemActive(child.id));
      const isParentActive = isItemActive(item.id) || (typeof window !== 'undefined' && window.location.pathname === item.path);

      return (
        <li key={item.id} className="dashboard-sidebar__menu-li">
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
            <button
              type="button"
              onClick={() => {
                navigate(item.path);
                setIsMobileMenuOpen(false);
              }}
              className={`dashboard-sidebar__menu-btn ${
                isParentActive ? 'dashboard-sidebar__menu-btn--active' : ''
              } ${isInsideTree ? 'dashboard-sidebar__menu-btn--nested' : ''}`}
              style={{ flex: 1, paddingRight: '32px' }}
              aria-current={isParentActive ? 'page' : undefined}
            >
              {isParentActive && (
                <span className="dashboard-sidebar__active-indicator" aria-hidden="true" />
              )}
              <span className="dashboard-sidebar__menu-icon">
                {item.icon}
              </span>
              <span className="dashboard-sidebar__menu-label">
                {item.label}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsIeltsSubOpen(prev => !prev);
              }}
              aria-label={isSubExpanded ? (language === 'en' ? 'Collapse IELTS' : 'আইইএলটিএস বন্ধ করুন') : (language === 'en' ? 'Expand IELTS' : 'আইইএলটিএস খুলুন')}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isAnyChildActive ? 'var(--sky-blue, #C08552)' : '#A3938F',
                borderRadius: '4px',
                zIndex: 2,
              }}
            >
              <LuChevronDown
                size={14}
                style={{
                  transform: isSubExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </button>
          </div>

          {/* Sub-menu accordion items */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: isSubExpanded ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}
          >
            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              <ul className="dashboard-sidebar__menu" style={{
                marginLeft: '18px',
                paddingLeft: '8px',
                borderLeft: '1.5px solid rgba(192, 133, 82, 0.2)',
                marginTop: '3px',
                marginBottom: '4px',
                gap: '2px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {item.children.map(child => {
                  const childActive = isItemActive(child.id);
                  return (
                    <li key={child.id} className="dashboard-sidebar__menu-li">
                      <button
                        type="button"
                        onClick={() => handleMenuClick(child)}
                        className={`dashboard-sidebar__menu-btn ${
                          childActive ? 'dashboard-sidebar__menu-btn--active' : ''
                        }`}
                        style={{
                          fontSize: '0.82rem',
                          padding: '6px 8px',
                          color: childActive ? '#8C5230' : '#6E5A56',
                        }}
                        aria-current={childActive ? 'page' : undefined}
                      >
                        {childActive && (
                          <span className="dashboard-sidebar__active-indicator" aria-hidden="true" />
                        )}
                        <span className="dashboard-sidebar__menu-icon" style={{ width: '15px', height: '15px', marginRight: '8px' }}>
                          {child.icon}
                        </span>
                        <span className="dashboard-sidebar__menu-label">
                          {child.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </li>
      );
    }

    const active = isItemActive(item.id);

    return (
      <li key={item.id} className="dashboard-sidebar__menu-li">
        <button
          type="button"
          onClick={() => handleMenuClick(item)}
          className={`dashboard-sidebar__menu-btn ${
            active ? 'dashboard-sidebar__menu-btn--active' : ''
          } ${isLockedForTutor ? 'dashboard-sidebar__menu-btn--locked' : ''} ${
            isInsideTree ? 'dashboard-sidebar__menu-btn--nested' : ''
          }`}
          aria-current={active ? 'page' : undefined}
        >
          {active && (
            <span className="dashboard-sidebar__active-indicator" aria-hidden="true" />
          )}

          <span className="dashboard-sidebar__menu-icon">
            {item.icon}
            {item.hasBadge && (
              <span className="dashboard-sidebar__unread-dot" />
            )}
          </span>

          <span className="dashboard-sidebar__menu-label">
            {item.label}
          </span>

          {item.hasBadge && (
            <span className="dashboard-sidebar__badge-new">NEW</span>
          )}

          {item.tag && (
            <span className="dashboard-sidebar__badge-tag">{item.tag}</span>
          )}

          {isLockedForTutor && (
            <LuLock
              className="dashboard-sidebar__menu-lock"
              title="Requires Mentor Pro Plan"
            />
          )}

          {/* Floating tooltip for desktop collapsed mode */}
          <div className="dashboard-sidebar__menu-tooltip" aria-hidden="true">
            <span className="tooltip-title">{item.label}</span>
            {item.tag && <span className="tooltip-tag">{item.tag}</span>}
          </div>
        </button>
      </li>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="dashboard-mobile-topbar">
        <div className="dashboard-sidebar__logo-container">
          <a href="/" className="dashboard-sidebar__logo" title="TopKorbo Home">
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
            <div className="dashboard-sidebar__logo-brand">
              <span className="dashboard-sidebar__logo-text">TopKorbo</span>
              <span className="dashboard-sidebar__logo-badge">EDTECH</span>
            </div>
          </a>
        </div>

        <button
          className="dashboard-mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          type="button"
        >
          {isMobileMenuOpen ? <LuX size={22} /> : <LuMenu size={22} />}
        </button>
      </header>

      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div
          className="dashboard-mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Aside */}
      <aside
        className={`dashboard-sidebar ${
          isCollapsedMode ? 'dashboard-sidebar--collapsed' : ''
        } ${isMobileMenuOpen ? 'dashboard-sidebar--mobile-open' : ''}`}
        aria-label="Main Navigation"
      >
        {/* Mobile-Only Drawer Header with Brand Logo & Close (X) Button */}
        <div className="dashboard-sidebar__mobile-header">
          <a href="/" className="dashboard-sidebar__logo" title="TopKorbo Home" onClick={() => setIsMobileMenuOpen(false)}>
            <svg viewBox="0 0 100 100" fill="none" className="dashboard-sidebar__logo-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="dbLogoGradMobileDrawer" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#C08552" />
                  <stop offset="35%" stopColor="#D4A373" />
                  <stop offset="70%" stopColor="#8C5A3C" />
                  <stop offset="100%" stopColor="#4B2E2B" />
                </linearGradient>
              </defs>
              <path d="M 28,45 C 28,45 28,58 50,68 C 72,58 72,45 72,45" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.2)" />
              <path d="M 50,15 L 90,36 L 50,57 L 10,36 Z" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="4.5" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.55)" />
              <path d="M 50,19 L 82,36 L 50,53 L 18,36 Z" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="1" strokeLinejoin="round" fill="url(#dbLogoGradMobileDrawer)" fillOpacity="0.08" />
              <path d="M 37,25 H 63 M 50,25 V 45" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 37,25 V 29 M 63,25 V 29" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 44,28 V 44" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M 44,36 L 55,28 M 44,36 L 55,44" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 50,36 C 40,30 20,25 18,32 L 18,50" stroke="url(#dbLogoGradMobileDrawer)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="18" cy="52" r="3.5" fill="url(#dbLogoGradMobileDrawer)" />
              <path d="M 14,55 H 22 L 24,78 H 12 Z" fill="url(#dbLogoGradMobileDrawer)" />
            </svg>
            <div className="dashboard-sidebar__logo-brand">
              <span className="dashboard-sidebar__logo-text">TopKorbo</span>
              <span className="dashboard-sidebar__logo-badge">EDTECH</span>
            </div>
          </a>

          <button
            type="button"
            className="dashboard-sidebar__close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label={language === 'en' ? 'Close sidebar menu' : 'সাইডবার মেনু বন্ধ করুন'}
          >
            <LuX size={19} />
          </button>
        </div>

        {/* Desktop Brand Header */}
        <div className="dashboard-sidebar__logo-container desktop-only-logo">
          <a href="/" className="dashboard-sidebar__logo" title="TopKorbo Home">
            <svg viewBox="0 0 100 100" fill="none" className="dashboard-sidebar__logo-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="dbLogoGradDesktop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#C08552" />
                  <stop offset="35%" stopColor="#D4A373" />
                  <stop offset="70%" stopColor="#8C5A3C" />
                  <stop offset="100%" stopColor="#4B2E2B" />
                </linearGradient>
              </defs>
              <path d="M 28,45 C 28,45 28,58 50,68 C 72,58 72,45 72,45" stroke="url(#dbLogoGradDesktop)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.2)" />
              <path d="M 50,15 L 90,36 L 50,57 L 10,36 Z" stroke="url(#dbLogoGradDesktop)" strokeWidth="4.5" strokeLinejoin="round" fill="rgba(37, 24, 23, 0.55)" />
              <path d="M 50,19 L 82,36 L 50,53 L 18,36 Z" stroke="url(#dbLogoGradDesktop)" strokeWidth="1" strokeLinejoin="round" fill="url(#dbLogoGradDesktop)" fillOpacity="0.08" />
              <path d="M 37,25 H 63 M 50,25 V 45" stroke="url(#dbLogoGradDesktop)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 37,25 V 29 M 63,25 V 29" stroke="url(#dbLogoGradDesktop)" strokeWidth="3" strokeLinecap="round" />
              <path d="M 44,28 V 44" stroke="url(#dbLogoGradDesktop)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M 44,36 L 55,28 M 44,36 L 55,44" stroke="url(#dbLogoGradDesktop)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 50,36 C 40,30 20,25 18,32 L 18,50" stroke="url(#dbLogoGradDesktop)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="18" cy="52" r="3.5" fill="url(#dbLogoGradDesktop)" />
              <path d="M 14,55 H 22 L 24,78 H 12 Z" fill="url(#dbLogoGradDesktop)" />
            </svg>
            <div className="dashboard-sidebar__logo-brand">
              <span className="dashboard-sidebar__logo-text">TopKorbo</span>
              <span className="dashboard-sidebar__logo-badge">EDTECH</span>
            </div>
          </a>

          <button
            type="button"
            className="dashboard-sidebar__toggle-btn"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? (language === 'en' ? 'Expand sidebar' : 'সাইডবার প্রসারিত করুন') : (language === 'en' ? 'Collapse sidebar' : 'সাইডবার সঙ্কুচিত করুন')}
          >
            {isSidebarCollapsed ? (
              <LuPanelLeftOpen className="dashboard-sidebar__toggle-icon" size={17} />
            ) : (
              <LuPanelLeftClose className="dashboard-sidebar__toggle-icon" size={17} />
            )}
            <div className="dashboard-sidebar__toggle-tooltip" aria-hidden="true">
              {isSidebarCollapsed
                ? (language === 'en' ? 'Expand sidebar' : 'সাইডবার খুলুন')
                : (language === 'en' ? 'Collapse sidebar' : 'সাইডবার বন্ধ করুন')}
            </div>
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <nav className="dashboard-sidebar__nav">
          <div className="dashboard-sidebar__accordion-container">
            {sections.map((section) => {
              const isExpanded = !!expandedSections[section.key];
              const hasActiveChild = section.items.some(item => isItemActive(item.id) || (item.children && item.children.some(child => isItemActive(child.id))));

              if (isCollapsedMode) {
                return (
                  <div key={section.key} className="dashboard-sidebar__section dashboard-sidebar__section--collapsed-mode">
                    <div className="dashboard-sidebar__collapsed-items">
                      <ul className="dashboard-sidebar__menu">
                        {section.items.map(item => {
                          if (item.children && item.children.length > 0) {
                            return item.children.map(child => renderMenuItem(child, false));
                          }
                          return renderMenuItem(item, false);
                        })}
                      </ul>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={section.key}
                  className={`dashboard-sidebar__section ${
                    hasActiveChild ? 'dashboard-sidebar__section--has-active' : ''
                  } ${isExpanded ? 'dashboard-sidebar__section--expanded' : 'dashboard-sidebar__section--collapsed'}`}
                >
                  {/* Collapsible Accordion Header */}
                  <button
                    type="button"
                    onClick={() => handleSectionToggle(section.key)}
                    className={`dashboard-sidebar__section-header ${
                      hasActiveChild ? 'dashboard-sidebar__section-header--active' : ''
                    }`}
                    aria-expanded={isExpanded}
                    aria-controls={`sidebar-section-${section.key}`}
                  >
                    <div className="dashboard-sidebar__section-header-left">
                      <span className="dashboard-sidebar__section-title">
                        {section.title}
                      </span>
                    </div>

                    <div className="dashboard-sidebar__section-header-right">
                      {hasActiveChild && !isExpanded && (
                        <span className="dashboard-sidebar__active-dot-badge" title="Contains active page" />
                      )}
                      <LuChevronDown
                        className={`dashboard-sidebar__section-chevron ${
                          isExpanded ? 'dashboard-sidebar__section-chevron--open' : ''
                        }`}
                        size={14}
                      />
                    </div>
                  </button>

                  {/* Accordion Content with Ultra-Smooth Hardware-Accelerated CSS Grid Transition */}
                  <div
                    id={`sidebar-section-${section.key}`}
                    className={`dashboard-sidebar__section-body ${
                      isExpanded ? 'dashboard-sidebar__section-body--expanded' : ''
                    }`}
                  >
                    <div className="dashboard-sidebar__section-inner">
                      <ul className="dashboard-sidebar__menu dashboard-sidebar__menu--tree">
                        {section.items.map(item => renderMenuItem(item, true))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Footer: User Profile & Quick Settings */}
        <div className="dashboard-sidebar__footer">
          <div
            className="dashboard-sidebar__profile"
            onClick={() => navigate('/setting')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/setting');
              }
            }}
            title={language === 'en' ? 'User Settings' : 'ব্যবহারকারী সেটিংস'}
          >
            <div className="dashboard-sidebar__avatar-wrapper">
              {safeUser.avatar ? (
                <img
                  src={safeUser.avatar}
                  referrerPolicy="no-referrer"
                  alt="Profile"
                  className="dashboard-sidebar__avatar"
                />
              ) : (
                <div className="dashboard-sidebar__avatar-placeholder">
                  {userInitial}
                </div>
              )}
            </div>

            <div className="dashboard-sidebar__user-info">
              <div className="dashboard-sidebar__user-name-row">
                <h4 className="dashboard-sidebar__user-name">{safeUser.name}</h4>
              </div>
              <div className="dashboard-sidebar__user-role-row">
                {planInfoText ? (
                  <span className={`dashboard-sidebar__user-plan ${isMentorPro ? 'is-active-pro' : ''}`}>
                    {planInfoText}
                  </span>
                ) : (
                  <span className="dashboard-sidebar__user-role-label">
                    {safeUser.role ? (safeUser.role.charAt(0).toUpperCase() + safeUser.role.slice(1)) : 'Student'}
                  </span>
                )}
              </div>
            </div>

            <div className="dashboard-sidebar__settings-icon" title={language === 'en' ? 'Settings' : 'সেটিংস'}>
              <LuSettings size={16} />
            </div>

            {/* Profile Tooltip for Collapsed Sidebar */}
            <div className="dashboard-sidebar__menu-tooltip dashboard-sidebar__profile-tooltip" aria-hidden="true">
              <span className="tooltip-title">{safeUser.name}</span>
              <span className="tooltip-tag">{safeUser.role || 'Student'}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

