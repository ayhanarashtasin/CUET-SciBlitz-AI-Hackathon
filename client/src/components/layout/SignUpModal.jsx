import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiArrowLeft, HiCheckCircle } from 'react-icons/hi';
import { FcGoogle } from 'react-icons/fc';
import { useLanguage } from '../../hooks/useLanguage';
import httpClient from '../../services/httpClient';
import { clearAuthStorage } from '../../utils/authStorage';
import './SignUpModal.css';

const GUEST_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_GUEST_LOGIN !== 'false';
const GUEST_ADMIN_ENABLED = import.meta.env.VITE_ENABLE_GUEST_ADMIN !== 'false';

export default function SignUpModal({ isOpen, onClose, initialMode = 'signup' }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(initialMode === 'login' ? 'login' : 'choose'); // 'choose', 'login', 'google', 'profile_form', 'success'
  const [role, setRole] = useState(null); // 'student' or 'tutor'

  // Form State
  const [formData, setFormData] = useState({
    fullName: 'Ayhan Arash Tasin',
    email: 'ayhan.arash.tasin@g.bracu.ac.bd',
    avatar: '', // Google URL or Base64 custom upload
    collegeName: '',
    hscBatch: '2025',
    stream: 'Science',
    academicStatus: 'HSC 2nd Year',
    medium: 'Bangla Medium',
    district: 'Dhaka',
    division: 'Dhaka',
    areaName: '',
    phoneNumber: '',
    aspirations: [],
    // Tutor specific fields
    studentIdNumber: '',
    studentIdCardPhoto: '',
    nidPhoto: '',
    ieltsScore: '',
    ieltsTrf: '',
    interestedToGuide: [],
    universityName: '',
    department: '',
    currentYearSemester: '',
    admissionAchievement: '',
    dob: '',
    gender: ''
  });

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [profileSubStep, setProfileSubStep] = useState(1);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    };
  }, [isOpen]);

  // Handle URL callback token in real life production.
  // This effect intentionally hydrates modal/auth state from OAuth redirect params.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const callbackRole = params.get('role');
      const callbackForumRole = params.get('forumRole');
      const profileName = params.get('name');
      const profileEmail = params.get('email');
      const profileAvatar = params.get('avatar');
      const signupRequired = params.get('signupRequired') === 'true';

      if (signupRequired) {
        clearAuthStorage();
        setRole(null);
        setStep('choose');
        setProfileSubStep(1);
        setErrorMsg('');

        // Dynamically pre-populate Google profile details for after role selection.
        setFormData(prev => ({
          ...prev,
          fullName: profileName ? decodeURIComponent(profileName) : prev.fullName,
          email: profileEmail ? decodeURIComponent(profileEmail) : prev.email,
          avatar: profileAvatar ? decodeURIComponent(profileAvatar) : prev.avatar
        }));

        // Clean up URL query parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (token) {
        localStorage.setItem('topkorbo_token', token);
        if (profileName) localStorage.setItem('topkorbo_name', decodeURIComponent(profileName));
        if (profileAvatar) localStorage.setItem('topkorbo_avatar', decodeURIComponent(profileAvatar));
        if (profileEmail) localStorage.setItem('topkorbo_email', decodeURIComponent(profileEmail));
        if (callbackRole) localStorage.setItem('topkorbo_role', callbackRole);
        if (callbackForumRole) localStorage.setItem('topkorbo_forum_role', decodeURIComponent(callbackForumRole));

        setRole(callbackRole || 'student');
        setStep('profile_form');

        // Dynamically pre-populate Google profile details inside the form
        setFormData(prev => ({
          ...prev,
          fullName: profileName ? decodeURIComponent(profileName) : prev.fullName,
          email: profileEmail ? decodeURIComponent(profileEmail) : prev.email,
          avatar: profileAvatar ? decodeURIComponent(profileAvatar) : prev.avatar
        }));

        // Clean up URL query parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  const handleClose = () => {
    // SECURITY PATCH: If there's a token in localStorage, but they close the modal before completing the registration steps (step !== 'success'),
    // it means they are attempting to bypass the profile completion or phone verification. We must clear their session to prevent illegal access!
    if (localStorage.getItem('topkorbo_token') && step !== 'success') {
      clearAuthStorage();
      onClose();
      window.location.reload();
      return;
    }

    onClose();
    setTimeout(() => {
      setStep(initialMode === 'login' ? 'login' : 'choose');
      setRole(null);
      setOauthLoading(false);
      setGuestLoading('');
      setErrorMsg('');
      setFormData({
        fullName: 'Ayhan Arash Tasin',
        email: 'ayhan.arash.tasin@g.bracu.ac.bd',
        avatar: '',
        collegeName: '',
        hscBatch: '2025',
        stream: 'Science',
        academicStatus: 'HSC 2nd Year',
        medium: 'Bangla Medium',
        district: 'Dhaka',
        division: 'Dhaka',
        areaName: '',
        phoneNumber: '',
        aspirations: [],
        // Tutor specific fields
        studentIdNumber: '',
        studentIdCardPhoto: '',
        nidPhoto: '',
        ieltsScore: '',
        ieltsTrf: '',
        interestedToGuide: [],
        universityName: '',
        currentYearSemester: '',
        admissionAchievement: '',
        dob: '',
        gender: ''
      });
    }, 300);
  };

  const handleOptionClick = (chosenRole) => {
    setRole(chosenRole);
    setStep('google');
  };

  const continueToGoogleAuth = async (targetUrl) => {
    setErrorMsg('');
    setOauthLoading(true);
    try {
      await httpClient.warmupBackend({ timeoutMs: 15000 });
      window.location.href = targetUrl;
    } catch (err) {
      setErrorMsg(err?.message || httpClient.BACKEND_DELAYED_MESSAGE);
      setOauthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    await continueToGoogleAuth(`${backendBaseUrl}/auth/google?role=${role}&action=signup`);
  };

  const handleGoogleLogIn = async () => {
    const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    await continueToGoogleAuth(`${backendBaseUrl}/auth/google?action=login`);
  };

  const handleGuestLogin = async (guestType) => {
    setErrorMsg('');
    setGuestLoading(guestType);

    try {
      const data = await httpClient.request('/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ guestType })
      });

      const forumRole = data.forumRole || (guestType === 'admin' ? 'admin' : 'user');

      clearAuthStorage();
      localStorage.setItem('topkorbo_token', data.token);
      localStorage.setItem('topkorbo_name', data.name);
      localStorage.setItem('topkorbo_email', data.email);
      localStorage.setItem('topkorbo_avatar', data.avatar || '');
      localStorage.setItem('topkorbo_role', data.role);
      localStorage.setItem('topkorbo_forum_role', forumRole);
      localStorage.setItem('topkorbo_guest', 'true');

      window.location.assign(forumRole === 'admin' ? '/admin/dashboard' : '/dashboard');
    } catch (err) {
      setErrorMsg(err?.message || 'Guest login is unavailable right now. Please try again.');
      setGuestLoading('');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatar: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheckboxChange = (aspirationName) => {
    setFormData(prev => {
      const exists = prev.aspirations.includes(aspirationName);
      const updated = exists
        ? prev.aspirations.filter(a => a !== aspirationName)
        : [...prev.aspirations, aspirationName];
      return { ...prev, aspirations: updated };
    });
  };

  const handleIdCardUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, studentIdCardPhoto: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTrfUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setErrorMsg('Please upload a PDF file for IELTS TRF.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, ieltsTrf: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGuideCheckboxChange = (guideArea) => {
    setFormData(prev => {
      const exists = prev.interestedToGuide.includes(guideArea);
      const updated = exists
        ? prev.interestedToGuide.filter(g => g !== guideArea)
        : [...prev.interestedToGuide, guideArea];
      return { ...prev, interestedToGuide: updated };
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    let requestBody;

    if (role === 'tutor') {
      if (profileSubStep === 1) {
        // STRICT VALIDATION: Step 1
        if (!formData.fullName.trim()) {
          setErrorMsg('Full Name is required.');
          setLoading(false);
          return;
        }
        if (!formData.studentIdNumber.trim()) {
          setErrorMsg('Student ID Number is required.');
          setLoading(false);
          return;
        }
        if (!formData.studentIdCardPhoto) {
          setErrorMsg('Student ID Photo upload is required.');
          setLoading(false);
          return;
        }
        if (formData.interestedToGuide.length === 0) {
          setErrorMsg('Please select at least one Guide Area (Interested to Guide).');
          setLoading(false);
          return;
        }
        setProfileSubStep(2);
        setLoading(false);
        return;
      }

      // STRICT VALIDATION: Step 2 (and full check)
      if (!formData.fullName.trim()) {
        setErrorMsg('Full Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.studentIdNumber.trim()) {
        setErrorMsg('Student ID Number is required.');
        setLoading(false);
        return;
      }
      if (!formData.studentIdCardPhoto) {
        setErrorMsg('Student ID Photo upload is required.');
        setLoading(false);
        return;
      }
      if (formData.interestedToGuide.length === 0) {
        setErrorMsg('Please select at least one Guide Area (Interested to Guide).');
        setLoading(false);
        return;
      }

      // Conditionally validate IELTS
      if (formData.interestedToGuide.includes('IELTS')) {
        if (!formData.ieltsScore.trim()) {
          setErrorMsg('IELTS Score is required.');
          setLoading(false);
          return;
        }
        if (!formData.ieltsTrf) {
          setErrorMsg('IELTS Test Report Form (TRF) PDF upload is required.');
          setLoading(false);
          return;
        }
      }

      if (!formData.collegeName.trim()) {
        setErrorMsg('College Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.hscBatch) {
        setErrorMsg('HSC Batch selection is required.');
        setLoading(false);
        return;
      }
      if (!formData.universityName.trim()) {
        setErrorMsg('University Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.department.trim()) {
        setErrorMsg('Department Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.currentYearSemester.trim()) {
        setErrorMsg('Current Year / Semester is required.');
        setLoading(false);
        return;
      }
      if (!formData.admissionAchievement.trim()) {
        setErrorMsg('Admission Achievement description is required.');
        setLoading(false);
        return;
      }

      requestBody = {
        name: formData.fullName,
        dob: formData.dob || undefined,
        gender: formData.gender || undefined,
        studentIdNumber: formData.studentIdNumber,
        studentIdCardPhoto: formData.studentIdCardPhoto,
        nidPhoto: formData.nidPhoto,
        ieltsScore: formData.interestedToGuide.includes('IELTS') ? formData.ieltsScore : '',
        ieltsTrf: formData.interestedToGuide.includes('IELTS') ? formData.ieltsTrf : '',
        interestedToGuide: formData.interestedToGuide,
        collegeName: formData.collegeName,
        hscBatch: formData.hscBatch,
        universityName: formData.universityName,
        department: formData.department,
        currentYearSemester: formData.currentYearSemester,
        admissionAchievement: formData.admissionAchievement,
        avatar: formData.avatar
      };
    } else {
      // STRICT VALIDATION: Student portion
      if (!formData.fullName.trim()) {
        setErrorMsg('Full Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.collegeName.trim()) {
        setErrorMsg('College Name is required.');
        setLoading(false);
        return;
      }
      if (!formData.hscBatch) {
        setErrorMsg('HSC Batch selection is required.');
        setLoading(false);
        return;
      }
      if (!formData.stream) {
        setErrorMsg('Group / Stream selection is required.');
        setLoading(false);
        return;
      }
      if (!formData.academicStatus) {
        setErrorMsg('Academic Status selection is required.');
        setLoading(false);
        return;
      }
      if (!formData.medium) {
        setErrorMsg('Version / Medium selection is required.');
        setLoading(false);
        return;
      }
      if (!formData.district.trim()) {
        setErrorMsg('District is required.');
        setLoading(false);
        return;
      }
      if (!formData.division.trim()) {
        setErrorMsg('Division is required.');
        setLoading(false);
        return;
      }
      if (!formData.areaName.trim()) {
        setErrorMsg('Area Name is required.');
        setLoading(false);
        return;
      }
      if (formData.aspirations.length === 0) {
        setErrorMsg('Please select at least one Aspiration / Goal.');
        setLoading(false);
        return;
      }

      requestBody = {
        name: formData.fullName,
        collegeName: formData.collegeName,
        hscBatch: formData.hscBatch,
        stream: formData.stream,
        academicStatus: formData.academicStatus,
        medium: formData.medium,
        district: formData.district,
        division: formData.division,
        areaName: formData.areaName,
        aspirations: formData.aspirations,
        avatar: formData.avatar
      };
    }

    try {
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('topkorbo_token');

      // Make a secure POST call to save details in MongoDB
      const response = await fetch(`${backendBaseUrl}/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || 'mock_development_token'}`
        },
        body: JSON.stringify(requestBody)
      });

      const resData = await response.json();
      if (resData.success) {
        localStorage.setItem('topkorbo_name', resData.data.name || formData.fullName);
        localStorage.setItem('topkorbo_avatar', resData.data.avatar || formData.avatar);
        localStorage.setItem('topkorbo_email', resData.data.email || formData.email);
        setStep('phone_verification');
      } else {
        // Fallback for simulation if not running server
        console.warn('Backend returned error or not responding, showing simulation phone verification');
        localStorage.setItem('topkorbo_name', formData.fullName);
        localStorage.setItem('topkorbo_avatar', formData.avatar);
        localStorage.setItem('topkorbo_email', formData.email);
        setStep('phone_verification');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
      // Fallback for local demo environment to make sure user sees phone verification
      localStorage.setItem('topkorbo_name', formData.fullName);
      localStorage.setItem('topkorbo_avatar', formData.avatar);
      localStorage.setItem('topkorbo_email', formData.email);
      setStep('phone_verification');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!formData.phoneNumber.trim()) {
      setErrorMsg('Phone number is required.');
      setLoading(false);
      return;
    }
    if (formData.phoneNumber.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit phone number.');
      setLoading(false);
      return;
    }

    try {
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('topkorbo_token');

      // Make a secure POST call to save phone number in MongoDB
      const response = await fetch(`${backendBaseUrl}/auth/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || 'mock_development_token'}`
        },
        body: JSON.stringify({
          phoneNumber: `+880${formData.phoneNumber}`
        })
      });

      const resData = await response.json();
      if (resData.success) {
        setStep('success');
      } else {
        console.warn('Backend not responding, showing simulation success');
        setStep('success');
      }
    } catch (err) {
      console.error('Error saving phone number:', err);
      setStep('success');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSkip = () => {
    handleClose();
    window.location.href = role === 'tutor' ? '/setting' : '/dashboard';
  };

  const handleSuccessRedirect = () => {
    handleClose();
    window.location.href = role === 'tutor' ? '/setting' : '/dashboard';
  };

  return (
    <AnimatePresence>
      <div className="signup-modal__overlay-wrapper">
        {/* Backdrop overlay */}
        <motion.div
          className="signup-modal__overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(step === 'profile_form' || step === 'phone_verification') ? undefined : handleClose}
        />

        {/* Modal Dialog */}
        <motion.div
          className={`signup-modal__dialog ${step === 'profile_form' ? 'signup-modal__dialog--large' : ''}`}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        >
          {/* Back button */}
          {(step === 'google' || step === 'guest' || step === 'profile_form' || step === 'phone_verification') && (
            <button
              className="signup-modal__back-btn"
              onClick={() => {
                if (step === 'phone_verification') setStep('profile_form');
                else if (step === 'profile_form') setStep('google');
                else if (step === 'guest') setStep('login');
                else setStep('choose');
              }}
              aria-label="Go Back"
            >
              <HiArrowLeft size={20} />
            </button>
          )}

          {/* Close button */}
          {step !== 'profile_form' && step !== 'phone_verification' && (
            <button className="signup-modal__close-btn" onClick={handleClose} aria-label={t('signup.close')}>
              <HiX size={22} />
            </button>
          )}

          <AnimatePresence mode="wait">

            {/* Step 1: Role Selection */}
            {step === 'choose' && (
              <motion.div
                key="choose"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                className="signup-modal__step-container"
              >
                <div className="signup-modal__header">
                  <h3 className="signup-modal__title">{t('signup.title')}</h3>
                  <p className="signup-modal__subtitle">{t('signup.subtitle')}</p>
                  {errorMsg && (
                    <div className="signup-modal__warning-banner" style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(192, 133, 82, 0.1)', border: '1px solid rgba(192, 133, 82, 0.3)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', lineHeight: '1.4' }}>
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>

                <div className="signup-modal__options-grid">
                  <motion.div
                    className="signup-modal__option-card signup-modal__option-card--student"
                    whileHover={{ y: -6, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOptionClick('student')}
                  >
                    <div className="signup-modal__option-icon-container">
                      <svg viewBox="0 0 100 100" fill="none" className="signup-modal__option-svg" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="studentSvgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#C08552" />
                            <stop offset="100%" stopColor="#8C5A3C" />
                          </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="45" stroke="url(#studentSvgGrad)" strokeWidth="3" opacity="0.3" />
                        <path d="M20 40 L50 25 L80 40 L50 55 Z" fill="url(#studentSvgGrad)" stroke="url(#studentSvgGrad)" strokeWidth="3" strokeLinejoin="round" />
                        <path d="M32 46 V62 C32 68 50 74 50 74 C50 74 68 68 68 62 V46" stroke="url(#studentSvgGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <path d="M74 44 V65 M70 65 H78" stroke="url(#studentSvgGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="74" cy="65" r="2" fill="url(#studentSvgGrad)" />
                      </svg>
                    </div>
                    <h4 className="signup-modal__option-title">{t('signup.student.title')}</h4>
                    <p className="signup-modal__option-desc">{t('signup.student.desc')}</p>
                  </motion.div>

                  <motion.div
                    className="signup-modal__option-card signup-modal__option-card--tutor"
                    whileHover={{ y: -6, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOptionClick('tutor')}
                  >
                    <div className="signup-modal__option-icon-container">
                      <svg viewBox="0 0 100 100" fill="none" className="signup-modal__option-svg" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="tutorSvgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#D4A373" />
                            <stop offset="100%" stopColor="#4B2E2B" />
                          </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="45" stroke="url(#tutorSvgGrad)" strokeWidth="3" opacity="0.3" />
                        <rect x="25" y="28" width="50" height="34" rx="4" stroke="url(#tutorSvgGrad)" strokeWidth="3" fill="none" />
                        <path d="M42 62 L32 78 M58 62 L68 78" stroke="url(#tutorSvgGrad)" strokeWidth="3" strokeLinecap="round" />
                        <path d="M40 70 H60" stroke="url(#tutorSvgGrad)" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M50 36 C47 36 45 38 45 41 C45 43 47 44 48 46 V49 H52 V46 C53 44 55 43 55 41 C55 38 53 36 50 36 Z" stroke="url(#tutorSvgGrad)" strokeWidth="2" strokeLinejoin="round" fill="url(#tutorSvgGrad)" fillOpacity="0.1" />
                        <path d="M48 51 H52" stroke="url(#tutorSvgGrad)" strokeWidth="2" />
                      </svg>
                    </div>
                    <h4 className="signup-modal__option-title">{t('signup.tutor.title')}</h4>
                    <p className="signup-modal__option-desc">{t('signup.tutor.desc')}</p>
                  </motion.div>
                </div>

                <div style={{ marginTop: '32px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setStep('login'); setErrorMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--sky-blue)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', padding: '0' }}
                  >
                    Log In
                  </button>
                </div>
              </motion.div>
            )}

            {/* Login Step */}
            {step === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="signup-modal__step-container"
              >
                <div className="signup-modal__header">
                  <h3 className="signup-modal__title">Welcome Back</h3>
                  <p className="signup-modal__subtitle">Continue your arena journey to academic success</p>
                </div>

                <div className="signup-modal__google-wrapper" style={{ marginTop: '16px' }}>
                  <motion.button
                    className="signup-modal__google-btn"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={oauthLoading}
                    onClick={handleGoogleLogIn}
                  >
                    <FcGoogle className="signup-modal__google-icon" />
                    <span>Continue with Google</span>
                  </motion.button>
                </div>

                {GUEST_LOGIN_ENABLED && <div style={{ marginTop: '18px' }}>
                  <motion.button
                    className="signup-modal__google-btn"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setStep('guest'); setErrorMsg(''); }}
                  >
                    <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>G</span>
                    <span>Login as a Guest</span>
                  </motion.button>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.45 }}>
                    Temporary judge access with Pro Plus features enabled.
                  </p>
                </div>}

                <div style={{ marginTop: '32px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  New to TopKorbo?{' '}
                  <button
                    type="button"
                    onClick={() => { setStep('choose'); setErrorMsg(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--sky-blue)', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', padding: '0' }}
                  >
                    Sign Up
                  </button>
                </div>
              </motion.div>
            )}

            {/* Guest Role Selection */}
            {step === 'guest' && (
              <motion.div
                key="guest"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="signup-modal__step-container"
              >
                <div className="signup-modal__header">
                  <h3 className="signup-modal__title">Login as a Guest</h3>
                  <p className="signup-modal__subtitle">Choose a demo role. Each guest account has Pro Plus access for judging.</p>
                  {errorMsg && (
                    <div className="signup-modal__warning-banner" style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(192, 133, 82, 0.1)', border: '1px solid rgba(192, 133, 82, 0.3)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', lineHeight: '1.4' }}>
                      <span>!</span>
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>

                <div className="signup-modal__options-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  {[
                    { type: 'student', title: 'Student', desc: 'Learner dashboard, contests, mock tests, AI tools.' },
                    { type: 'mentor', title: 'Mentor', desc: 'Mentor live classes and guidance flows.' },
                    { type: 'tutor', title: 'Tutor', desc: 'Approved tutor tools for uploads and teaching.' },
                    { type: 'admin', title: 'Admin', desc: 'Admin dashboard, moderation, users, and platform controls.' }
                  ]
                    .filter((item) => item.type !== 'admin' || GUEST_ADMIN_ENABLED)
                    .map((item) => (
                    <motion.button
                      key={item.type}
                      type="button"
                      className={`signup-modal__option-card ${item.type === 'student' ? 'signup-modal__option-card--student' : 'signup-modal__option-card--tutor'}`}
                      whileHover={{ y: -6, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!!guestLoading}
                      onClick={() => handleGuestLogin(item.type)}
                      style={{ border: 'none', textAlign: 'left', width: '100%' }}
                    >
                      <div className="signup-modal__option-icon-container" style={{ width: 54, height: 54, fontSize: '1.6rem', display: 'grid', placeItems: 'center' }}>
                        {item.type === 'student' ? 'S' : item.type === 'mentor' ? 'M' : item.type === 'admin' ? 'A' : 'T'}
                      </div>
                      <h4 className="signup-modal__option-title">{guestLoading === item.type ? 'Preparing...' : item.title}</h4>
                      <p className="signup-modal__option-desc">{item.desc}</p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Continue with Google */}
            {step === 'google' && (
              <motion.div
                key="google"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="signup-modal__google-step"
              >
                <div className="signup-modal__header">
                  <h3 className="signup-modal__title">
                    {role === 'student' ? t('signup.student.title') : t('signup.tutor.title')}
                  </h3>
                  <p className="signup-modal__subtitle">{t('signup.google.desc')}</p>
                </div>

                <div className="signup-modal__google-wrapper">
                  <motion.button
                    className="signup-modal__google-btn"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={oauthLoading}
                    onClick={handleGoogleSignIn}
                  >
                    <FcGoogle className="signup-modal__google-icon" />
                    <span>{t('signup.google')}</span>
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Student/Mentor Profile Details Form */}
            {step === 'profile_form' && (
              <motion.div
                key="profile_form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="signup-modal__form-container"
              >
                <h3 className="signup-modal__title">Complete Your Profile</h3>
                <p className="signup-modal__subtitle">
                  {role === 'tutor'
                    ? 'Verify your identity and academic details to start guiding'
                    : 'Tell us about your academic goals to customize TopKorbo'}
                </p>

                <form className="signup-modal__form" onSubmit={handleFormSubmit}>
                  {role === 'tutor' ? (
                    profileSubStep === 1 ? (
                      <>
                        {/* Page 1 Left Column: Basic Information */}
                        <div className="signup-modal__form-left">
                          <h4 className="signup-modal__form-section-title">1. Basic Information</h4>

                          <div className="signup-modal__avatar-preview-container">
                            <div className="signup-modal__avatar-circle-wrapper">
                              <div className="signup-modal__avatar-circle">
                                {formData.avatar ? (
                                  <img src={formData.avatar} referrerPolicy="no-referrer" alt="Profile" className="signup-modal__avatar-img" />
                                ) : (
                                  <span>👨‍🏫</span>
                                )}
                              </div>
                              <label htmlFor="profile-pic-upload" className="signup-modal__avatar-upload-overlay">
                                <span>Upload</span>
                              </label>
                              <input
                                type="file"
                                id="profile-pic-upload"
                                accept="image/*"
                                onChange={handleImageUpload}
                                style={{ display: 'none' }}
                              />
                            </div>
                            <div className="signup-modal__avatar-info">
                              <label className="signup-modal__label signup-modal__avatar-label" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '0.85rem' }}>Full Name</label>
                              <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                                placeholder="Your Name"
                                style={{ marginBottom: '12px' }}
                              />
                              <label className="signup-modal__label signup-modal__avatar-label" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '0.85rem' }}>Email Address</label>
                              <input
                                type="text"
                                name="email"
                                value={formData.email}
                                className="signup-modal__input signup-modal__input--readonly"
                                readOnly
                              />
                            </div>
                          </div>

                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Gender (optional)</label>
                            <select
                              name="gender"
                              value={formData.gender}
                              onChange={handleInputChange}
                              className="signup-modal__select"
                            >
                              <option value="">Select Gender</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                            </select>
                          </div>

                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Date of Birth (optional)</label>
                            <input
                              type="date"
                              name="dob"
                              value={formData.dob}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                            />
                          </div>
                        </div>

                        {/* Page 1 Right Column: Identity Verification & Interested to Guide */}
                        <div className="signup-modal__form-right-fields">
                          <h4 className="signup-modal__form-section-title">2. Identity Verification</h4>

                          <div className="signup-modal__input-row">
                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">Student ID Number</label>
                              <input
                                type="text"
                                name="studentIdNumber"
                                placeholder="e.g. 21101424"
                                value={formData.studentIdNumber}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                              />
                            </div>

                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">Student ID Photo</label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '40px' }}>
                                <label htmlFor="id-card-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', background: 'rgba(230, 204, 178, 0.15)', border: '1px solid rgba(230, 204, 178, 0.4)', color: 'var(--text-primary)', display: 'inline-flex', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontWeight: '600', fontSize: '0.85rem' }}>
                                  {formData.studentIdCardPhoto ? 'Change Photo' : 'Upload ID Photo'}
                                </label>
                                <input
                                  type="file"
                                  id="id-card-upload"
                                  accept="image/*"
                                  onChange={handleIdCardUpload}
                                  style={{ display: 'none' }}
                                />
                                {formData.studentIdCardPhoto && (
                                  <span style={{ fontSize: '1.2rem', color: '#10B981' }}>✅</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {formData.studentIdCardPhoto && (
                            <div className="signup-modal__form-group" style={{ marginBottom: '16px', width: '100%' }}>
                              <label className="signup-modal__label" style={{ fontSize: '0.80rem', color: 'var(--text-muted)', display: 'block', textAlign: 'left', marginBottom: '4px' }}>ID Photo Preview</label>
                              <div style={{ width: '100%', height: '140px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid rgba(230, 204, 178, 0.5)', background: '#fcf8f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={formData.studentIdCardPhoto} alt="Student ID Card Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                              </div>
                            </div>
                          )}

                          <h4 className="signup-modal__form-section-title">3. Interested to Guide</h4>
                          <div className="signup-modal__form-group" style={{ marginBottom: '16px' }}>
                            <div className="signup-modal__checkbox-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                              {['Medical', 'Engineering', 'University', 'Academic', 'IELTS'].map((guideArea) => (
                                <label className="signup-modal__checkbox-label" key={guideArea}>
                                  <input
                                    type="checkbox"
                                    checked={formData.interestedToGuide.includes(guideArea)}
                                    onChange={() => handleGuideCheckboxChange(guideArea)}
                                    className="signup-modal__checkbox"
                                  />
                                  <span>{guideArea}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {errorMsg && <p className="signup-modal__error-text">{errorMsg}</p>}

                          <div className="signup-modal__form-actions" style={{ marginTop: '24px' }}>
                            <button
                              type="submit"
                              className="btn btn-primary btn-lg signup-modal__submit-btn"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Page 2 Left Column: Academic Information */}
                      <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Section 4: Academic Information */}
                        <div>
                          <h4 className="signup-modal__form-section-title">4. Academic Information</h4>

                          <div className="signup-modal__input-row">
                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">College Name</label>
                              <input
                                type="text"
                                name="collegeName"
                                placeholder="e.g. Notre Dame College"
                                value={formData.collegeName}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                              />
                            </div>

                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">HSC Batch</label>
                              <select
                                name="hscBatch"
                                value={formData.hscBatch}
                                onChange={handleInputChange}
                                className="signup-modal__select"
                              >
                                <option value="2020">HSC 2020</option>
                                <option value="2021">HSC 2021</option>
                                <option value="2022">HSC 2022</option>
                                <option value="2023">HSC 2023</option>
                                <option value="2024">HSC 2024</option>
                                <option value="2025">HSC 2025</option>
                              </select>
                            </div>
                          </div>

                          <div className="signup-modal__input-row">
                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">University Name</label>
                              <input
                                type="text"
                                name="universityName"
                                placeholder="e.g. BUET"
                                value={formData.universityName}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                              />
                            </div>

                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">Department</label>
                              <input
                                type="text"
                                name="department"
                                placeholder="e.g. CSE"
                                value={formData.department}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                              />
                            </div>
                          </div>

                          <div className="signup-modal__input-row">
                            <div className="signup-modal__form-group">
                              <label className="signup-modal__label">Current Year / Semester</label>
                              <input
                                type="text"
                                name="currentYearSemester"
                                placeholder="e.g. 3rd Year 2nd Semester"
                                value={formData.currentYearSemester}
                                onChange={handleInputChange}
                                className="signup-modal__input"
                                required
                              />
                            </div>

                            <div className="signup-modal__form-group" style={{ opacity: 0, pointerEvents: 'none' }}>
                              <label className="signup-modal__label">Placeholder</label>
                              <input type="text" className="signup-modal__input" readOnly />
                            </div>
                          </div>

                          {/* Conditional IELTS verification fields */}
                          {formData.interestedToGuide.includes('IELTS') && (
                            <div className="signup-modal__input-row" style={{ background: 'rgba(56, 189, 248, 0.04)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(56, 189, 248, 0.3)', marginBottom: '20px' }}>
                              <div className="signup-modal__form-group">
                                <label className="signup-modal__label" style={{ color: 'var(--sky-blue)' }}>IELTS Score</label>
                                <input
                                  type="text"
                                  name="ieltsScore"
                                  placeholder="e.g. 7.5"
                                  value={formData.ieltsScore}
                                  onChange={handleInputChange}
                                  className="signup-modal__input"
                                  required
                                />
                              </div>

                              <div className="signup-modal__form-group">
                                <label className="signup-modal__label" style={{ color: 'var(--sky-blue)' }}>IELTS Test Report Form (TRF) PDF</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '40px', height: 'auto', flexWrap: 'wrap' }}>
                                  <label htmlFor="trf-pdf-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', background: 'rgba(230, 204, 178, 0.15)', border: '1px solid rgba(230, 204, 178, 0.4)', color: 'var(--text-primary)', display: 'inline-flex', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontWeight: '600', fontSize: '0.85rem' }}>
                                    {formData.ieltsTrf ? 'Change PDF' : 'Upload TRF PDF'}
                                  </label>
                                  <input
                                    type="file"
                                    id="trf-pdf-upload"
                                    accept="application/pdf"
                                    onChange={handleTrfUpload}
                                    style={{ display: 'none' }}
                                  />
                                  {formData.ieltsTrf && (
                                    <span style={{ fontSize: '0.85rem', color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <span>✅ Loaded</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Section 5: Academic or Admission Achievements */}
                        <div>
                          <h4 className="signup-modal__form-section-title">5. Academic or Admission Achievements</h4>

                          <div className="signup-modal__form-group" style={{ marginBottom: '16px' }}>
                            <label className="signup-modal__label">Academic or Admission Achievement Section Description (BIO)</label>
                            <textarea
                              name="admissionAchievement"
                              placeholder="Describe your achievements (e.g. BUET 45th merit position, IELTS 8.0, Medical Admission score 78.5). This will be showcased on your mentor public BIO profile."
                              value={formData.admissionAchievement}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              rows={4}
                              required
                              style={{ resize: 'vertical', minHeight: '100px', lineHeight: '1.4', padding: '10px 14px' }}
                            />
                          </div>
                        </div>

                        {errorMsg && <p className="signup-modal__error-text" style={{ marginTop: '0' }}>{errorMsg}</p>}

                        <div className="signup-modal__form-actions" style={{ display: 'flex', gap: '15px', marginTop: '12px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => { setProfileSubStep(1); setErrorMsg(''); }}
                            className="btn btn-secondary btn-lg"
                            style={{ width: '150px', cursor: 'pointer', background: 'rgba(230, 204, 178, 0.15)', border: '1px solid rgba(230, 204, 178, 0.4)', color: 'var(--text-primary)', fontWeight: '600' }}
                          >
                            Back
                          </button>
                          <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary btn-lg signup-modal__submit-btn"
                            style={{ width: '200px' }}
                          >
                            {loading ? 'Saving...' : 'Next'}
                          </button>
                        </div>
                      </div>
                      </>
                    )
                  ) : (
                    <>
                      {/* Left Column: Basic Information */}
                      <div className="signup-modal__form-left">
                        <h4 className="signup-modal__form-section-title">Basic Information</h4>

                        <div className="signup-modal__avatar-preview-container">
                          <div className="signup-modal__avatar-circle-wrapper">
                            <div className="signup-modal__avatar-circle">
                              {formData.avatar ? (
                                <img src={formData.avatar} referrerPolicy="no-referrer" alt="Profile" className="signup-modal__avatar-img" />
                              ) : (
                                <span>🎓</span>
                              )}
                            </div>
                            <label htmlFor="profile-pic-upload" className="signup-modal__avatar-upload-overlay">
                              <span>Upload</span>
                            </label>
                            <input
                              type="file"
                              id="profile-pic-upload"
                              accept="image/*"
                              onChange={handleImageUpload}
                              style={{ display: 'none' }}
                            />
                          </div>
                          <div className="signup-modal__avatar-info">
                            <label className="signup-modal__label signup-modal__avatar-label" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '0.85rem' }}>Full Name</label>
                            <input
                              type="text"
                              name="fullName"
                              value={formData.fullName}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              required
                              placeholder="Your Name"
                              style={{ marginBottom: '12px' }}
                            />
                            <label className="signup-modal__label signup-modal__avatar-label" style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '0.85rem' }}>Email Address</label>
                            <input
                              type="text"
                              name="email"
                              value={formData.email}
                              className="signup-modal__input signup-modal__input--readonly"
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="signup-modal__form-group">
                          <label className="signup-modal__label">Version / Medium</label>
                          <div className="signup-modal__radio-group">
                            {['Bangla Medium', 'English Version', 'English Medium'].map((item) => (
                              <label className="signup-modal__radio-label" key={item}>
                                <input
                                  type="radio"
                                  name="medium"
                                  value={item}
                                  checked={formData.medium === item}
                                  onChange={handleInputChange}
                                  className="signup-modal__radio"
                                />
                                <span>{item}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Academic & Location */}
                      <div className="signup-modal__form-right-fields">
                        <h4 className="signup-modal__form-section-title">Academic Details</h4>

                        <div className="signup-modal__input-row">
                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">College Name</label>
                            <input
                              type="text"
                              name="collegeName"
                              placeholder="e.g. Notre Dame College"
                              value={formData.collegeName}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              required
                            />
                          </div>

                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">HSC Batch</label>
                            <select
                              name="hscBatch"
                              value={formData.hscBatch}
                              onChange={handleInputChange}
                              className="signup-modal__select"
                            >
                              <option value="2024">HSC 2024</option>
                              <option value="2025">HSC 2025</option>
                              <option value="2026">HSC 2026</option>
                              <option value="2027">HSC 2027</option>
                            </select>
                          </div>
                        </div>

                        <div className="signup-modal__input-row">
                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Group / Stream</label>
                            <div className="signup-modal__radio-row">
                              {['Science', 'Business Studies', 'Humanities'].map((item) => (
                                <label className="signup-modal__radio-label" key={item}>
                                  <input
                                    type="radio"
                                    name="stream"
                                    value={item}
                                    checked={formData.stream === item}
                                    onChange={handleInputChange}
                                    className="signup-modal__radio"
                                  />
                                  <span>{item}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Academic Status</label>
                            <select
                              name="academicStatus"
                              value={formData.academicStatus}
                              onChange={handleInputChange}
                              className="signup-modal__select"
                            >
                              <option value="HSC 1st Year">HSC 1st Year</option>
                              <option value="HSC 2nd Year">HSC 2nd Year</option>
                              <option value="HSC Passed">HSC Passed</option>
                              <option value="Admission Candidate">Admission Candidate</option>
                            </select>
                          </div>
                        </div>

                        <h4 className="signup-modal__form-section-title">Location</h4>
                        <div className="signup-modal__input-row signup-modal__input-row--three">
                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">District</label>
                            <input
                              type="text"
                              name="district"
                              placeholder="e.g. Dhaka"
                              value={formData.district}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              required
                            />
                          </div>
                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Division</label>
                            <input
                              type="text"
                              name="division"
                              placeholder="e.g. Dhaka"
                              value={formData.division}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              required
                            />
                          </div>
                          <div className="signup-modal__form-group">
                            <label className="signup-modal__label">Area Name</label>
                            <input
                              type="text"
                              name="areaName"
                              placeholder="e.g. Cantonment"
                              value={formData.areaName}
                              onChange={handleInputChange}
                              className="signup-modal__input"
                              required
                            />
                          </div>
                        </div>

                        <h4 className="signup-modal__form-section-title">Aspirations & Goals</h4>
                        <div className="signup-modal__form-group">
                          <div className="signup-modal__checkbox-grid">
                            {['Engineering', 'University', 'Medical'].map((aspiration) => (
                              <label className="signup-modal__checkbox-label" key={aspiration}>
                                <input
                                  type="checkbox"
                                  checked={formData.aspirations.includes(aspiration)}
                                  onChange={() => handleCheckboxChange(aspiration)}
                                  className="signup-modal__checkbox"
                                />
                                <span>{aspiration}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {errorMsg && <p className="signup-modal__error-text">{errorMsg}</p>}

                        <div className="signup-modal__form-actions">
                          <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary btn-lg signup-modal__submit-btn"
                          >
                            {loading ? 'Saving...' : 'Next'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </form>
              </motion.div>
            )}

            {/* Step 3.5: Phone Verification Form */}
            {step === 'phone_verification' && (
              <motion.div
                key="phone_verification"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="signup-modal__step-container signup-modal__phone-container"
              >
                <div className="signup-modal__header">
                  <h3 className="signup-modal__title">Phone Verification</h3>
                  <p className="signup-modal__subtitle">
                    Enter your phone number to secure your account and receive alerts.
                  </p>
                </div>

                <form className="signup-modal__phone-form" onSubmit={handlePhoneSubmit} style={{ width: '100%' }}>
                  <div className="signup-modal__form-group" style={{ width: '100%', maxWidth: '360px', margin: '0 auto 20px auto' }}>
                    <label className="signup-modal__label" style={{ display: 'block', textAlign: 'left', marginBottom: '6px' }}>Phone Number</label>
                    <div className="signup-modal__phone-input-wrapper" style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(230, 204, 178, 0.7)', borderRadius: 'var(--radius-sm)', background: 'var(--white)', overflow: 'hidden' }}>
                      <span className="signup-modal__phone-prefix" style={{ padding: '10px 14px', background: 'rgba(230, 204, 178, 0.15)', borderRight: '1px solid rgba(230, 204, 178, 0.7)', fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>+880</span>
                      <input
                        type="tel"
                        name="phoneNumber"
                        placeholder="1XXXXXXXXX"
                        pattern="[0-9]{10}"
                        value={formData.phoneNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val.length <= 10) {
                            setFormData(prev => ({ ...prev, phoneNumber: val }));
                          }
                        }}
                        className="signup-modal__input"
                        style={{ border: 'none', borderRadius: '0', padding: '10px 14px', flex: '1' }}
                        required
                      />
                    </div>
                    <span className="signup-modal__input-hint" style={{ display: 'block', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Format: 10-digit number (e.g. 1712345678)</span>
                  </div>

                  {errorMsg && <p className="signup-modal__error-text">{errorMsg}</p>}

                  <div className="signup-modal__phone-actions" style={{ display: 'flex', gap: '16px', width: '100%', maxWidth: '360px', margin: '24px auto 0 auto' }}>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary btn-lg signup-modal__verify-btn"
                      style={{ flex: '2' }}
                    >
                      {loading ? 'Verifying...' : 'Verify Phone'}
                    </button>
                    <button
                      type="button"
                      onClick={handlePhoneSkip}
                      className="btn btn-secondary btn-lg signup-modal__skip-btn"
                      style={{ flex: '1', background: 'rgba(230, 204, 178, 0.15)', border: '1px solid rgba(230, 204, 178, 0.4)', color: 'var(--text-primary)' }}
                    >
                      Skip
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Step 4: Success Screen */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="signup-modal__success-step"
              >
                <div className="signup-modal__success-icon">
                  <HiCheckCircle size={80} color="var(--sky-blue)" />
                </div>
                <h3 className="signup-modal__title">Welcome Aboard, {formData.fullName}!</h3>
                <p className="signup-modal__subtitle">
                  {role === 'tutor'
                    ? "Your mentor profile has been fully registered. You are ready to share your expertise, guide students, and make an impact in Bangladesh's #1 competitive EdTech platform."
                    : "Your student profile has been fully registered. You've earned your starter rank and early access to Bangladesh's #1 competitive EdTech platform."
                  }
                </p>
                <button className="btn btn-primary btn-lg signup-modal__success-btn" onClick={handleSuccessRedirect}>
                  Enter the Arena
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
