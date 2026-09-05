import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiPencilAlt,
  HiArrowLeft,
  HiArrowRight,
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import './IeltsWriting.css';

export default function IeltsWriting() {
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
        console.error('Error fetching user data in IELTS Writing:', err);
      }
    };

    fetchUserData();
  }, [navigate]);

  // Guard role
  if (user.role !== 'student') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Access Denied</h2>
        <p>IELTS Writing is only available for students.</p>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="ielts-writing-container">
      <Sidebar activeTab="ielts-prep" user={user} />

      <main className="ielts-writing-main">
        {/* Header */}
        <header className="ielts-writing-header">
          <div className="ielts-writing-header__left">
            <button
              onClick={() => navigate('/ielts-prep')}
              className="ielts-writing-back-btn"
              title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
            >
              <HiArrowLeft size={20} />
            </button>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                {language === 'en' ? 'IELTS Writing' : 'আইইএলটিএস রাইটিং'}
              </h2>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="ielts-writing-workspace">
          <div className="ielts-writing-workspace__body">

            {/* Hero / Description Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="ielts-writing-hero"
            >
              <div className="ielts-writing-hero__icon-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="ielts-writing-hero__icon">
                    <HiPencilAlt size={32} />
                  </div>
                  <h1>{language === 'en' ? 'Writing Section Overview' : 'রাইটিং সেকশন ওভারভিউ'}</h1>
                </div>
                <button
                  onClick={() => navigate('/ielts-prep/writing/practice')}
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

              <div className="ielts-writing-description">
                <p><strong>There are 2 tasks.</strong></p>

                {/* Grid layout for Task 1 and Task 2 */}
                <div className="ielts-writing-grid-2">
                  <div className="ielts-writing-sub-section">
                    <h3>Task 1 (20 minutes)</h3>
                    <p><strong>Academic IELTS</strong></p>
                    <p>Describe:</p>
                    <ul>
                      <li>Graph</li>
                      <li>Chart</li>
                      <li>Table</li>
                      <li>Map</li>
                      <li>Process</li>
                    </ul>
                    <p><strong>Minimum 150 words</strong></p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Worth 1/3 of the Writing score.
                    </p>

                    <p style={{ marginTop: '1.25rem' }}><strong>General Training IELTS</strong></p>
                    <p>Write a letter (formal, semi-formal, or informal).</p>
                  </div>

                  <div className="ielts-writing-sub-section">
                    <h3>Task 2 (40 minutes)</h3>
                    <p><strong>Essay writing</strong> (Academic &amp; GT are similar format, but academic topics are more formal).</p>
                    <p><strong>Minimum 250 words</strong></p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Worth 2/3 of the Writing score.
                    </p>

                    <p style={{ marginTop: '1.25rem' }}><strong>Essay types:</strong></p>
                    <ul>
                      <li>Opinion (Agree/Disagree)</li>
                      <li>Discussion (Discuss both views)</li>
                      <li>Advantages / Disadvantages</li>
                      <li>Problem / Solution</li>
                      <li>Direct Questions</li>
                    </ul>
                  </div>
                </div>

                {/* Assessment Criteria Table */}
                <div style={{ marginTop: '2rem' }}>
                  <p><strong>Writing is assessed on 4 criteria:</strong></p>
                  <table className="ielts-criteria-table">
                    <thead>
                      <tr>
                        <th>Criteria</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Task Achievement (Task 1) / Task Response (Task 2)</strong></td>
                        <td>How well you answered all parts of the prompt with proper detail and development.</td>
                      </tr>
                      <tr>
                        <td><strong>Coherence & Cohesion</strong></td>
                        <td>Logical organization, paragraphing, and effective use of linking devices.</td>
                      </tr>
                      <tr>
                        <td><strong>Lexical Resource</strong></td>
                        <td>The range and accuracy of words and collocations used.</td>
                      </tr>
                      <tr>
                        <td><strong>Grammatical Range & Accuracy</strong></td>
                        <td>The variety of sentence structure and number of grammar mistakes.</td>
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
