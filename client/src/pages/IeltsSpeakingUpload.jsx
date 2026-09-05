import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { HiChatAlt2, HiArrowLeft, HiClipboardCheck, HiUpload } from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import './IeltsSpeakingUpload.css';

const MOCK_SPEAKING_SETS = [
  {
    _id: 'speaking_mock_1',
    setName: 'Speaking Mock Set 1: Travel & Holidays',
    creator: 'TopKorbo Prep Team',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    partsCount: 3,
  },
  {
    _id: 'speaking_mock_2',
    setName: 'Speaking Mock Set 2: Technology & Modern Life',
    creator: 'Prof. S. Rahman',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    partsCount: 3,
  }
];

export default function IeltsSpeakingUpload() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Teacher',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'teacher',
  });

  const [activeSubOption, setActiveSubOption] = useState(null); // null (menu), 'questions', 'requests'
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [speakingViewMode, setSpeakingViewMode] = useState('bank'); // 'bank' or 'upload'
  const [meetingLinks, setMeetingLinks] = useState({});

  // Auth Guard
  useEffect(() => {
    const token = localStorage.getItem('topkorbo_token');
    if (!token) {
      navigate('/');
      return;
    }
    const role = localStorage.getItem('topkorbo_role');
    if (role !== 'teacher') {
      navigate('/dashboard');
      return;
    }
  }, [navigate]);

  useEffect(() => {
    if (activeSubOption === 'requests') {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const fetchRequests = async () => {
        try {
          setLoadingRequests(true);
          const res = await fetch(`${backendBaseUrl}/ielts/appointments`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const resData = await res.json();
          if (resData.success) {
            setRequests(resData.data);
          }
        } catch (err) {
          console.error('Error fetching speaking test requests:', err);
          toast.error(language === 'en' ? 'Failed to fetch test requests.' : 'টেস্ট অনুরোধসমূহ লোড করতে ব্যর্থ হয়েছে।');
        } finally {
          setLoadingRequests(false);
        }
      };

      fetchRequests();
    }
  }, [activeSubOption, language]);
  const handleUpdateStatus = async (appointmentId, status) => {
    let meetingLink = '';
    if (status === 'accepted') {
      const link = meetingLinks[appointmentId] || '';
      const trimmed = link.trim();
      if (!trimmed) {
        toast.error(language === 'en' ? 'Meeting link is required to accept this appointment.' : 'অ্যাপয়েন্টমেন্ট গ্রহণ করতে মিটিং লিঙ্ক আবশ্যক।');
        return;
      }
      if (!/^https?:\/\/\S+/i.test(trimmed)) {
        toast.error(language === 'en' ? 'Please enter a valid URL (starting with http:// or https://) in the meeting link field.' : 'অনুগ্রহ করে মিটিং লিঙ্ক ফিল্ডে একটি সঠিক ইউআরএল প্রবেশ করান (http:// বা https:// দিয়ে শুরু)।');
        return;
      }
      meetingLink = trimmed;
    }

    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const res = await fetch(`${backendBaseUrl}/ielts/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, meetingLink })
      });

      const resData = await res.json();
      if (resData.success) {
        toast.success(
          status === 'accepted'
            ? (language === 'en' ? 'Appointment approved!' : 'অ্যাপয়েন্টমেন্ট অনুমোদিত হয়েছে!')
            : (language === 'en' ? 'Appointment declined!' : 'অ্যাপয়েন্টমেন্ট প্রত্যাখ্যাত হয়েছে!')
        );
        
        // Update state locally
        setRequests(prev => 
          prev.map(app => app._id === appointmentId ? { ...app, status, meetingLink } : app)
        );
      } else {
        toast.error(resData.message || (language === 'en' ? 'Failed to update request.' : 'অনুরোধ আপডেট করতে ব্যর্থ হয়েছে।'));
      }
    } catch (err) {
      console.error('Error updating appointment status:', err);
      toast.error(language === 'en' ? 'An error occurred.' : 'একটি ত্রুটি ঘটেছে।');
    }
  };

  const handleBackToMenu = () => {
    setActiveSubOption(null);
    setSpeakingViewMode('bank');
  };

  return (
    <div className="ielts-speaking-upload-page">
      <Sidebar activeTab="ielts-teacher-speaking" user={user} />

      <main className="ielts-speaking-upload-content">
        {/* Header */}
        <div className="ielts-speaking-upload-header">
          <button
            type="button"
            onClick={() => navigate('/ielts-teacher')}
            className="ielts-speaking-upload-back-btn"
            title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
          >
            <HiArrowLeft size={20} />
          </button>
          <div className="ielts-speaking-upload-header-text">
            <h2>{language === 'en' ? 'Speaking Question Designer' : 'স্পিকিং প্রশ্ন ডিজাইনার'}</h2>
            <p>
              {language === 'en'
                ? 'Create, manage, and upload question sets to the Speaking Question Bank.'
                : 'স্পিকিং প্রশ্ন ব্যাংকে প্রশ্ন সেট তৈরি, পরিচালনা এবং আপলোড করুন।'}
            </p>
          </div>
        </div>

        {/* Workspace */}
        <div className="ielts-speaking-upload-workspace">
          <div className="ielts-speaking-upload-container">

            {activeSubOption === null && (
              /* Selection Menu */
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="ielts-speaking-options-grid"
              >
                {/* Option 1: Speaking test questions */}
                <div
                  className="ielts-speaking-option-card"
                  onClick={() => setActiveSubOption('questions')}
                >
                  <div className="ielts-speaking-option-icon">
                    <HiChatAlt2 />
                  </div>
                  <h3>
                    {language === 'en' ? 'Speaking test questions' : 'স্পিকিং টেস্ট প্রশ্নাবলী'}
                  </h3>
                  <p>
                    {language === 'en'
                      ? 'Upload mock speaking topics, cue cards, and part 1/3 questions.'
                      : 'মক স্পিকিং টপিক, কিউ কার্ড এবং পার্ট ১/৩ এর প্রশ্ন যোগ করুন।'}
                  </p>
                  <button className="ielts-speaking-select-btn">
                    {language === 'en' ? 'Manage Questions' : 'প্রশ্নাবলী পরিচালনা করুন'}
                  </button>
                </div>

                {/* Option 2: Test requests */}
                <div
                  className="ielts-speaking-option-card"
                  onClick={() => setActiveSubOption('requests')}
                >
                  <div className="ielts-speaking-option-icon">
                    <HiClipboardCheck />
                  </div>
                  <h3>
                    {language === 'en' ? 'Test requests' : 'টেস্ট অনুরোধসমূহ'}
                  </h3>
                  <p>
                    {language === 'en'
                      ? 'Review booked appointments and mock test evaluation requests.'
                      : 'বুক করা অ্যাপয়েন্টমেন্ট এবং মক টেস্ট মূল্যায়নের অনুরোধগুলো দেখুন।'}
                  </p>
                  <button className="ielts-speaking-select-btn">
                    {language === 'en' ? 'View Requests' : 'অনুরোধসমূহ দেখুন'}
                  </button>
                </div>
              </motion.div>
            )}

            {activeSubOption === 'questions' && (
              speakingViewMode === 'bank' ? (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ width: '100%' }}
                >
                  <div className="ielts-bank-header">
                    <h3>{language === 'en' ? 'Available Question Sets' : 'বিদ্যমান প্রশ্ন সেটসমূহ'}</h3>
                    <button 
                      type="button" 
                      className="ielts-speaking-select-btn" 
                      style={{ padding: '12px 24px', fontSize: '0.95rem', borderRadius: '50px', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }} 
                      onClick={() => setSpeakingViewMode('upload')}
                    >
                      <HiUpload size={16} />
                      <span>{language === 'en' ? 'Upload new question' : 'নতুন প্রশ্ন আপলোড করুন'}</span>
                    </button>
                  </div>

                  <div className="ielts-bank-grid">
                    {MOCK_SPEAKING_SETS.map((set) => (
                      <div key={set._id} className="ielts-bank-card">
                        <div className="ielts-bank-card-info">
                          <h4>{set.setName}</h4>
                          <div className="ielts-bank-card-meta">
                            <span>👤 {set.creator}</span>
                            <span>📅 {new Date(set.createdAt).toLocaleDateString()}</span>
                            <span>💬 {set.partsCount} Parts</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                /* Speaking test questions view placeholder */
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="ielts-speaking-subview-card"
                >
                  <div className="ielts-speaking-placeholder-icon">
                    <HiChatAlt2 />
                  </div>
                  <h3>
                    {language === 'en' ? 'Speaking test questions' : 'স্পিকিং টেস্ট প্রশ্নাবলী'}
                  </h3>
                  <p>
                    {language === 'en'
                      ? 'Speaking questions manager is coming soon! Content details will be loaded here.'
                      : 'স্পিকিং প্রশ্ন ম্যানেজার শীঘ্রই আসছে! কন্টেন্ট বিবরণ এখানে লোড করা হবে।'}
                  </p>
                  <button 
                    type="button" 
                    onClick={() => setSpeakingViewMode('bank')} 
                    className="ielts-speaking-select-btn" 
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: '0.88rem', 
                      borderRadius: '50px', 
                      border: '1.5px solid rgba(75, 46, 43, 0.2)',
                      fontWeight: 700,
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      marginTop: '1rem'
                    }}
                  >
                    {language === 'en' ? 'Back to Question Bank' : 'প্রশ্ন ব্যাংকে ফিরে যান'}
                  </button>
                </motion.div>
              )
            )}

            {activeSubOption === 'requests' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="ielts-teacher-requests-view"
              >
                {loadingRequests ? (
                  <div className="ielts-teacher-loading">
                    <p>{language === 'en' ? 'Loading speaking test requests...' : 'টেস্ট অনুরোধসমূহ লোড হচ্ছে...'}</p>
                  </div>
                ) : requests.length === 0 ? (
                  <div className="ielts-teacher-empty-state">
                    <HiClipboardCheck size={48} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <p>{language === 'en' ? 'No speaking test requests found.' : 'কোনো স্পিকিং টেস্টের অনুরোধ পাওয়া যায়নি।'}</p>
                  </div>
                ) : (
                  <div className="ielts-teacher-requests-container">
                    
                    {/* Pending Section */}
                    <div className="ielts-requests-section">
                      <h4 className="ielts-requests-section-title">
                        {language === 'en' ? 'Pending Requests' : 'নতুন অনুরোধসমূহ'}
                      </h4>
                      
                      {requests.filter(r => r.status === 'pending').length === 0 ? (
                        <p className="ielts-no-requests-msg">
                          {language === 'en' ? 'No pending requests.' : 'কোনো নতুন অনুরোধ নেই।'}
                        </p>
                      ) : (
                        <div className="ielts-requests-grid">
                          {requests.filter(r => r.status === 'pending').map(req => (
                            <div key={req._id} className="ielts-request-card animate-fade-in">
                              <div className="ielts-request-card__header">
                                <span className="ielts-request-badge pending">
                                  {language === 'en' ? 'Pending' : 'অপেক্ষমান'}
                                </span>
                                <span className="ielts-request-date">
                                  📅 {req.date} &nbsp;|&nbsp; ⏰ {req.timeSlot}
                                </span>
                              </div>
                              
                              <div className="ielts-request-student">
                                <div className="ielts-request-student-avatar">
                                  {req.student?.avatar ? (
                                    <img src={req.student.avatar} alt={req.student.name} />
                                  ) : (
                                    req.student?.name?.charAt(0).toUpperCase() || 'S'
                                  )}
                                </div>
                                <div className="ielts-request-student-details">
                                  <h5>{req.student?.name || 'Unknown Student'}</h5>
                                  <p>📧 {req.student?.email || 'N/A'}</p>
                                </div>
                              </div>
                              
                              {req.message && (
                                <p className="ielts-request-message">
                                  <strong>{language === 'en' ? 'Message:' : 'বার্তা:'}</strong> {req.message}
                                </p>
                              )}

                              <div className="ielts-meeting-link-input-wrapper" style={{ marginTop: '12px', marginBottom: '16px' }}>
                                <label htmlFor={`link-input-${req._id}`} style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                  {language === 'en' ? 'Meeting Link (Required to Accept):' : 'মিটিং লিঙ্ক (গ্রহণের জন্য আবশ্যক):'}
                                </label>
                                <input 
                                  id={`link-input-${req._id}`}
                                  type="text" 
                                  placeholder="e.g. https://meet.google.com/abc-defg-hij" 
                                  value={meetingLinks[req._id] || ''}
                                  onChange={(e) => setMeetingLinks(prev => ({ ...prev, [req._id]: e.target.value }))}
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(75, 46, 43, 0.15)',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                  }}
                                />
                              </div>
                              
                              <div className="ielts-request-actions">
                                <button 
                                  className="ielts-btn-decline"
                                  onClick={() => handleUpdateStatus(req._id, 'rejected')}
                                >
                                  {language === 'en' ? 'Decline' : 'প্রত্যাখ্যান'}
                                </button>
                                <button 
                                  className="ielts-btn-approve"
                                  onClick={() => handleUpdateStatus(req._id, 'accepted')}
                                >
                                  {language === 'en' ? 'Accept' : 'অনুমোদন'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Request History Section */}
                    <div className="ielts-requests-section" style={{ marginTop: '2.5rem' }}>
                      <h4 className="ielts-requests-section-title">
                        {language === 'en' ? 'Request History' : 'পূর্ববর্তী অনুরোধসমূহ'}
                      </h4>
                      
                      {requests.filter(r => r.status !== 'pending').length === 0 ? (
                        <p className="ielts-no-requests-msg">
                          {language === 'en' ? 'No previous requests in history.' : 'কোনো পূর্ববর্তী অনুরোধের ইতিহাস নেই।'}
                        </p>
                      ) : (
                        <div className="ielts-requests-grid">
                          {requests.filter(r => r.status !== 'pending').map(req => (
                            <div key={req._id} className="ielts-request-card historical">
                              <div className="ielts-request-card__header">
                                <span className={`ielts-request-badge ${req.status}`}>
                                  {req.status === 'accepted' ? (language === 'en' ? 'Accepted' : 'গৃহীত') : (language === 'en' ? 'Declined' : 'প্রত্যাখ্যাত')}
                                </span>
                                <span className="ielts-request-date">
                                  📅 {req.date} &nbsp;|&nbsp; ⏰ {req.timeSlot}
                                </span>
                              </div>
                              
                              <div className="ielts-request-student">
                                <div className="ielts-request-student-avatar">
                                  {req.student?.avatar ? (
                                    <img src={req.student.avatar} alt={req.student.name} />
                                  ) : (
                                    req.student?.name?.charAt(0).toUpperCase() || 'S'
                                  )}
                                </div>
                                <div className="ielts-request-student-details">
                                  <h5>{req.student?.name || 'Unknown Student'}</h5>
                                  <p>📧 {req.student?.email || 'N/A'}</p>
                                </div>
                              </div>
                              
                              {req.message && (
                                <p className="ielts-request-message">
                                  <strong>{language === 'en' ? 'Message:' : 'বার্তা:'}</strong> {req.message}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </motion.div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
