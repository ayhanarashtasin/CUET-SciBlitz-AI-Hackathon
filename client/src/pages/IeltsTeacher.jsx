import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiVolumeUp,
  HiBookOpen,
  HiPencilAlt,
  HiChatAlt2
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import './IeltsTeacher.css';

export default function IeltsTeacher() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Teacher',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'teacher',
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
        console.error('Error fetching user data in IELTS Teacher:', err);
      }
    };

    fetchUserData();
  }, [navigate]);

  if (user.role !== 'teacher') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Access Denied</h2>
        <p>IELTS Teacher Portal is only available for teachers.</p>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    );
  }



  return (
    <div className="ielts-teacher-container">
      <Sidebar activeTab="ielts-teacher" user={user} />

      <main className="ielts-teacher-main">
        {/* Header */}

        {/* Content Workspace */}
        <div className="ielts-teacher-workspace">
          <div className="ielts-teacher-workspace__body">
            <h1 className="ielts-teacher-section-title">
              {language === 'en' ? 'IELTS Segment Question Bank' : 'আইইএলটিএস সেগমেন্ট প্রশ্ন ব্যাংক'}
            </h1>
            <p className="ielts-teacher-subtitle">
              {language === 'en'
                ? 'Select a segment to add mock test questions, audio transcription references, or writing essay prompts.'
                : 'মক টেস্ট প্রশ্ন, অডিও ট্রান্সক্রিপশন রেফারেন্স অথবা রাইটিং রচনার বিষয় যোগ করতে একটি সেগমেন্ট বেছে নিন।'}
            </p>

            {/* Grid layout containing the 4 segments side-by-side */}
            <div className="ielts-teacher-grid">
              
              {/* Listening Card */}
              <div 
                className="ielts-teacher-card" 
                onClick={() => navigate('/ielts-teacher/listening/upload')}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="ielts-teacher-icon"><HiVolumeUp size={32} /></div>
                  <h3>{language === 'en' ? 'Listening' : 'লিসেনিং'}</h3>
                  <p className="ielts-teacher-desc">
                    {language === 'en'
                      ? 'Upload questions, transcripts, and answer sheets. Supports fill-in-the-blanks, MCQs, and labeling tasks.'
                      : 'লিসেনিং প্রশ্ন, ট্রান্সক্রিপ্ট এবং উত্তরপত্র আপলোড করুন। শূন্যস্থান পূরণ, এমসিকিউ এবং লেবেলিং টাস্ক সমর্থন করে।'}
                  </p>
                </div>
              </div>

              {/* Reading Card */}
              <div 
                className="ielts-teacher-card" 
                onClick={() => navigate('/ielts-teacher/reading/upload')}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="ielts-teacher-icon"><HiBookOpen size={32} /></div>
                  <h3>{language === 'en' ? 'Reading' : 'রিডিং'}</h3>
                  <p className="ielts-teacher-desc">
                    {language === 'en'
                      ? 'Input comprehension passages (academic or general) and design corresponding multiple choice or heading matching questions.'
                      : 'রিডিং প্যাসেজ ইনপুট দিন এবং সেই অনুযায়ী মাল্টিপল চয়েস বা হেডিং ম্যাচিং সংক্রান্ত প্রশ্নাবলী ডিজাইন করুন।'}
                  </p>
                </div>
              </div>

              {/* Writing Card */}
              <div 
                className="ielts-teacher-card" 
                onClick={() => navigate('/ielts-teacher/writing/upload')}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="ielts-teacher-icon"><HiPencilAlt size={32} /></div>
                  <h3>{language === 'en' ? 'Writing' : 'রাইটিং'}</h3>
                  <p className="ielts-teacher-desc">
                    {language === 'en'
                      ? 'Add essay prompts (Task 2) and visual description tasks (Task 1 charts/diagrams) along with high-scoring model answers.'
                      : 'রচনা লেখার টাস্ক এবং চার্ট বা ডায়াগ্রাম বর্ণনার টাস্ক যুক্ত করুন, সাথে আদর্শ মডেল উত্তরপত্রও সরবরাহ করুন।'}
                  </p>
                </div>
              </div>

              {/* Speaking Card */}
              <div 
                className="ielts-teacher-card" 
                onClick={() => navigate('/ielts-teacher/speaking/upload')}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="ielts-teacher-icon"><HiChatAlt2 size={32} /></div>
                  <h3>{language === 'en' ? 'Speaking' : 'স্পিকিং'}</h3>
                  <p className="ielts-teacher-desc">
                    {language === 'en'
                      ? 'Upload speaking prompts, cue cards, and introductory questions. Provide points or structures for band-9 replies.'
                      : 'স্পিকিং প্রম্পট, কিউ কার্ড এবং সাক্ষাৎকার সংক্রান্ত প্রশ্ন যোগ করুন। ব্যান্ড-৯ মানের উত্তরের জন্য রূপরেখা প্রদান করুন।'}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>


      </main>
    </div>
  );
}
