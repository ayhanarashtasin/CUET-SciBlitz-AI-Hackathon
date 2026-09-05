import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiBookOpen,
  HiArrowLeft,
  HiArrowRight,
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import './IeltsReading.css';

export default function IeltsReading() {
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
        console.error('Error fetching user data in IELTS Reading:', err);
      }
    };

    fetchUserData();
  }, [navigate]);

  // Guard role
  if (user.role !== 'student') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Access Denied</h2>
        <p>IELTS Reading is only available for students.</p>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="ielts-reading-container">
      <Sidebar activeTab="ielts-prep" user={user} />

      <main className="ielts-reading-main">
        {/* Header */}
        <header className="ielts-reading-header">
          <div className="ielts-reading-header__left">
            <button
              onClick={() => navigate('/ielts-prep')}
              className="ielts-reading-back-btn"
              title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
            >
              <HiArrowLeft size={20} />
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {language === 'en' ? 'IELTS Reading' : 'আইইএলটিএস রিডিং'}
              </h2>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="ielts-reading-workspace">
          <div className="ielts-reading-workspace__body">

            {/* Hero / Description Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="ielts-reading-hero"
            >
              <div className="ielts-reading-hero__icon-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="ielts-reading-hero__icon">
                    <HiBookOpen size={32} />
                  </div>
                  <h1>{language === 'en' ? 'Reading Section Overview' : 'রিডিং সেকশন ওভারভিউ'}</h1>
                </div>
                <button
                  onClick={() => navigate('/ielts-prep/reading/practice')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 22px',
                    background: 'var(--sky-blue, #C08552)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(192, 133, 82, 0.3)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(192, 133, 82, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(192, 133, 82, 0.3)';
                  }}
                >
                  <span>{language === 'en' ? 'Start Preparation' : 'প্রস্তুতি শুরু করুন'}</span>
                  <HiArrowRight size={18} />
                </button>
              </div>

              <div className="ielts-reading-description">
                <p><strong>⏱ Time:</strong> 60 minutes</p>

                <p><strong>Three passages.</strong></p>

                <p><strong>Question types:</strong></p>
                <ul>
                  <li>True/False/Not Given</li>
                  <li>Yes/No/Not Given</li>
                  <li>Matching headings</li>
                  <li>Matching information</li>
                  <li>Fill in blanks</li>
                  <li>Multiple choice</li>
                  <li>Summary completion</li>
                </ul>

                <p><strong>Marks Distribution:</strong></p>
                <p>There are 40 questions.</p>

                <p style={{ marginTop: '1.5rem' }}><strong>Band Score Conversion Table (Academic):</strong></p>
                <div className="ielts-band-table-container">
                  <table className="ielts-band-table">
                    <thead>
                      <tr>
                        <th>Correct Answers</th>
                        <th>Band Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>39–40</td>
                        <td className="band-highlight">9.0</td>
                      </tr>
                      <tr>
                        <td>37–38</td>
                        <td className="band-highlight">8.5</td>
                      </tr>
                      <tr>
                        <td>35–36</td>
                        <td className="band-highlight">8.0</td>
                      </tr>
                      <tr>
                        <td>33–34</td>
                        <td className="band-highlight">7.5</td>
                      </tr>
                      <tr>
                        <td>30–32</td>
                        <td className="band-highlight">7.0</td>
                      </tr>
                      <tr>
                        <td>27–29</td>
                        <td className="band-highlight">6.5</td>
                      </tr>
                      <tr>
                        <td>23–26</td>
                        <td className="band-highlight">6.0</td>
                      </tr>
                      <tr>
                        <td>19–22</td>
                        <td className="band-highlight">5.5</td>
                      </tr>
                      <tr>
                        <td>15–18</td>
                        <td className="band-highlight">5.0</td>
                      </tr>
                      <tr>
                        <td>13–14</td>
                        <td className="band-highlight">4.5</td>
                      </tr>
                      <tr>
                        <td>10–12</td>
                        <td className="band-highlight">4.0</td>
                      </tr>
                      <tr>
                        <td>0–9</td>
                        <td className="band-highlight">3.5 or below</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}
