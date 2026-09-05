import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiVolumeUp,
  HiBookOpen,
  HiPencilAlt,
  HiChatAlt2,
  HiAcademicCap
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import './IeltsPrep.css';

export default function IeltsPrep() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Student',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'student',
  });

  // Auth Guard
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
          });
        }
      } catch (err) {
        console.error('Error fetching user data in IELTS Prep:', err);
      }
    };

    fetchUserData();
  }, [navigate]);

  // Guard role
  if (user.role !== 'student') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Access Denied</h2>
        <p>IELTS Preparation is only available for students.</p>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="ielts-prep-container">
      <Sidebar activeTab="ielts-prep" user={user} />

      <main className="ielts-prep-main">
        {/* Header */}

        {/* Content Workspace */}
        <div className="ielts-prep-workspace">
          <div className="ielts-prep-workspace__body">

            {/* ================= Overview & Info ================= */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="ielts-overview-card"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                <HiAcademicCap size={32} style={{ color: 'var(--sky-blue)' }} />
                <h1 className="ielts-title">
                  {language === 'en' ? 'IELTS Academic & General' : 'আইইএলটিএস একাডেমিক ও জেনারেল'}
                </h1>
              </div>

              <p className="ielts-description">
                {language === 'en'
                  ? "The International English Language Testing System (IELTS) is the world's most popular high-stakes English language proficiency test for study, work, and migration. It assesses your abilities in four key communication areas: Listening, Reading, Writing, and Speaking."
                  : "ইন্টারন্যাশনাল ইংলিশ ল্যাঙ্গুয়েজ টেস্টিং সিস্টেম (IELTS) পড়াশোনা, কর্মসংস্থান বা অভিবাসনের জন্য বিশ্বের সর্বাধিক জনপ্রিয় উচ্চ-মানের ইংরেজি ভাষা দক্ষতা পরীক্ষা। এটি চারটি প্রধান যোগাযোগের ক্ষেত্রে আপনার দক্ষতা মূল্যায়ন করে: লিসেনিং, রিডিং, রাইটিং এবং স্পিকিং।"}
              </p>

              {/* Mark Distribution Section */}
              <div className="ielts-distribution-section">
                <div className="ielts-grid-4">
                  {/* Writing */}
                  <div className="ielts-dist-card" onClick={() => navigate('/ielts-prep/writing')} style={{ cursor: 'pointer' }}>
                    <div className="ielts-dist-icon"><HiPencilAlt size={24} /></div>
                    <h4>{language === 'en' ? 'Writing' : 'রাইটিং'}</h4>
                    <span className="ielts-dist-detail">
                      {language === 'en' ? '2 Tasks (Report/Essay)' : '২টি টাস্ক (রিপোর্ট/রচনা)'}
                    </span>
                    <span className="ielts-dist-duration">
                      {language === 'en' ? '60 Mins' : '৬০ মিনিট'}
                    </span>
                  </div>

                  {/* Speaking */}
                  <div className="ielts-dist-card" onClick={() => navigate('/ielts-prep/speaking')} style={{ cursor: 'pointer' }}>
                    <div className="ielts-dist-icon"><HiChatAlt2 size={24} /></div>
                    <h4>{language === 'en' ? 'Speaking' : 'স্পিকিং'}</h4>
                    <span className="ielts-dist-detail">
                      {language === 'en' ? '3 Parts (Face-to-Face)' : '৩টি পার্ট (সাক্ষাৎকার)'}
                    </span>
                    <span className="ielts-dist-duration">
                      {language === 'en' ? '11-14 Mins' : '১১-১৪ মিনিট'}
                    </span>
                  </div>

                  {/* Listening */}
                  <div className="ielts-dist-card" onClick={() => navigate('/ielts-prep/listening')} style={{ cursor: 'pointer' }}>
                    <div className="ielts-dist-icon"><HiVolumeUp size={24} /></div>
                    <h4>{language === 'en' ? 'Listening' : 'লিসেনিং'}</h4>
                    <span className="ielts-dist-detail">
                      {language === 'en' ? '4 Sections | 40 Questions' : '৪টি সেকশন | ৪০টি প্রশ্ন'}
                    </span>
                    <span className="ielts-dist-duration">
                      {language === 'en' ? '30 Mins' : '৩০ মিনিট'}
                    </span>
                  </div>

                  {/* Reading */}
                  <div className="ielts-dist-card" onClick={() => navigate('/ielts-prep/reading')} style={{ cursor: 'pointer' }}>
                    <div className="ielts-dist-icon"><HiBookOpen size={24} /></div>
                    <h4>{language === 'en' ? 'Reading' : 'রিডিং'}</h4>
                    <span className="ielts-dist-detail">
                      {language === 'en' ? '3 Passages | 40 Questions' : '৩টি প্যাসেজ | ৪০টি প্রশ্ন'}
                    </span>
                    <span className="ielts-dist-duration">
                      {language === 'en' ? '60 Mins' : '৬০ মিনিট'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}
