import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import {
  HiVolumeUp,
  HiBookOpen,
  HiUpload,
  HiArrowLeft,
  HiCheckCircle,
  HiX
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import toast from 'react-hot-toast';
import './IeltsListeningUpload.css';

export default function IeltsListeningUpload() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Teacher',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'teacher',
  });

  const [setName, setSetName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('bank'); // 'bank' or 'upload'
  const [dbSets, setDbSets] = useState([]);
  const [isLoadingSets, setIsLoadingSets] = useState(true);

  // Files state
  const [sectionFiles, setSectionFiles] = useState({
    1: { audio: null, pdf: null },
    2: { audio: null, pdf: null },
    3: { audio: null, pdf: null },
    4: { audio: null, pdf: null }
  });

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

  // Fetch Listening Sets
  const fetchSets = async () => {
    try {
      setIsLoadingSets(true);
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/ielts/listening/sets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setDbSets(resData.data || []);
      }
    } catch (err) {
      console.error('Error fetching listening sets:', err);
    } finally {
      setIsLoadingSets(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'bank') {
      fetchSets();
    }
  }, [viewMode]);

  const handleFileChange = (section, type, file) => {
    if (!file) return;
    
    // Check extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (type === 'audio') {
      const allowedAudio = ['.mp3', '.wav', '.ogg', '.m4a'];
      if (!allowedAudio.includes(ext)) {
        toast.error(language === 'en' ? 'Only Audio files are allowed (.mp3, .wav, .ogg, .m4a)' : 'শুধুমাত্র অডিও ফাইল আপলোড করা যাবে (.mp3, .wav, .ogg, .m4a)');
        return;
      }
    } else if (type === 'pdf') {
      if (ext !== '.pdf') {
        toast.error(language === 'en' ? 'Only PDF files are allowed' : 'শুধুমাত্র পিডিএফ ফাইল আপলোড করা যাবে');
        return;
      }
    }

    setSectionFiles(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [type]: file
      }
    }));
  };

  const handleRemoveFile = (section, type) => {
    setSectionFiles(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [type]: null
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!setName.trim()) {
      toast.error(language === 'en' ? 'Please provide a Question Set Name' : 'অনুগ্রহ করে প্রশ্ন সেটের নাম দিন');
      return;
    }

    // Validate that we have audio and pdf for all 4 sections
    const missing = [];
    for (let sec = 1; sec <= 4; sec++) {
      if (!sectionFiles[sec].audio) {
        missing.push(`Section ${sec} Audio`);
      }
      if (!sectionFiles[sec].pdf) {
        missing.push(`Section ${sec} PDF`);
      }
    }

    if (missing.length > 0) {
      toast.error(
        language === 'en'
          ? `Please upload files for all sections. Missing: ${missing.join(', ')}`
          : `অনুগ্রহ করে প্রতিটি সেকশনের ফাইলগুলো আপলোড করুন। ঘাটতি রয়েছে: ${missing.join(', ')}`
      );
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(language === 'en' ? 'Uploading question set to server...' : 'সার্ভারে প্রশ্ন সেট আপলোড করা হচ্ছে...');

    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const formData = new FormData();
      formData.append('setName', setName.trim());

      // Append files: section1_audio, section1_pdf, etc.
      for (let sec = 1; sec <= 4; sec++) {
        formData.append(`section${sec}_audio`, sectionFiles[sec].audio);
        formData.append(`section${sec}_pdf`, sectionFiles[sec].pdf);
      }

      const response = await fetch(`${backendBaseUrl}/ielts/listening/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        toast.success(
          language === 'en'
            ? 'IELTS Listening question set submitted successfully!'
            : 'আইইএলটিএস লিসেনিং প্রশ্ন সেট সফলভাবে সাবমিট হয়েছে!',
          { id: toastId }
        );
        setSetName('');
        setSectionFiles({
          1: { audio: null, pdf: null },
          2: { audio: null, pdf: null },
          3: { audio: null, pdf: null },
          4: { audio: null, pdf: null }
        });
        setViewMode('bank');
      } else {
        toast.error(resData.message || (language === 'en' ? 'Failed to upload question set.' : 'প্রশ্ন সেট আপলোড করতে ব্যর্থ হয়েছে।'), { id: toastId });
      }
    } catch (err) {
      console.error('Error submitting listening set:', err);
      toast.error(language === 'en' ? 'Network error. Please try again.' : 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ielts-upload-page">
      <Sidebar activeTab="ielts-teacher-listening" user={user} />

      <main className="ielts-upload-content">
        {/* Header */}
        <div className="ielts-upload-header">
          <button
            type="button"
            onClick={() => navigate('/ielts-teacher')}
            className="ielts-upload-back-btn"
            title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
          >
            <HiArrowLeft size={20} />
          </button>
          <div className="ielts-upload-header-text">
            <h2>{language === 'en' ? 'Listening Question Designer' : 'লিসেনিং প্রশ্ন ডিজাইনার'}</h2>
            <p>
              {language === 'en'
                ? 'Create, manage, and upload question sets to the Listening Question Bank.'
                : 'লিসেনিং প্রশ্ন ব্যাংকে প্রশ্ন সেট তৈরি, পরিচালনা এবং আপলোড করুন।'}
            </p>
          </div>
        </div>

        {/* Workspace */}
        <div className="ielts-upload-workspace">
          {viewMode === 'bank' ? (
            <div className="ielts-bank-container">
              <div className="ielts-bank-header">
                <h3>{language === 'en' ? 'Available Question Sets' : 'বিদ্যমান প্রশ্ন সেটসমূহ'}</h3>
                <button 
                  type="button" 
                  className="ielts-listening-submit-btn-cta" 
                  onClick={() => setViewMode('upload')}
                >
                  <HiUpload size={16} style={{ marginRight: '6px' }} />
                  <span>{language === 'en' ? 'Upload new question' : 'নতুন প্রশ্ন আপলোড করুন'}</span>
                </button>
              </div>

              {isLoadingSets ? (
                <div style={{ textAlign: 'center', padding: '50px 0' }}>
                  <p>{language === 'en' ? 'Loading question bank...' : 'প্রশ্ন ব্যাংক লোড হচ্ছে...'}</p>
                </div>
              ) : dbSets.length === 0 ? (
                <div className="ielts-bank-empty">
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontStyle: 'italic' }}>
                    {language === 'en' ? 'No question sets uploaded yet.' : 'এখনো কোনো প্রশ্ন সেট আপলোড করা হয়নি।'}
                  </p>
                </div>
              ) : (
                <div className="ielts-bank-grid">
                  {dbSets.map((set) => (
                    <div key={set._id} className="ielts-bank-card">
                      <div className="ielts-bank-card-info">
                        <h4>{set.setName}</h4>
                        <div className="ielts-bank-card-meta">
                          <span>👤 {set.creator?.name || 'Educator'}</span>
                          <span>📅 {new Date(set.createdAt).toLocaleDateString()}</span>
                          <span>🎧 {set.sections?.length || 4} Sections</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="ielts-upload-form-container">
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Question Set Title Card */}
                <div className="ielts-upload-card">
                  <h3>{language === 'en' ? 'General Information' : 'সাধারণ তথ্য'}</h3>
                  <div className="ielts-input-group">
                    <label htmlFor="set-name-input">
                      {language === 'en' ? 'Question Set Name / Title' : 'প্রশ্ন সেটের নাম / শিরোনাম'}
                    </label>
                    <input
                      id="set-name-input"
                      type="text"
                      value={setName}
                      onChange={(e) => setSetName(e.target.value)}
                      placeholder={
                        language === 'en'
                          ? 'e.g. Cambridge IELTS 18 Practice Test 1'
                          : 'যেমনঃ ক্যামব্রিজ আইইএলটিএস ১৮ প্র্যাকটিস টেস্ট ১'
                      }
                      className="ielts-set-name-input"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Sections Upload Grid Card */}
                <div className="ielts-upload-card">
                  <h3>{language === 'en' ? 'Section Uploads (4 Sections Required)' : 'সেকশন আপলোড (৪টি সেকশন আবশ্যক)'}</h3>
                  
                  <div className="ielts-sections-list">
                    {[1, 2, 3, 4].map((section) => (
                      <div key={section} className="ielts-section-row">
                        
                        {/* Section Badge */}
                        <div className="ielts-section-badge">
                          {language === 'en' ? `Section ${section}` : `সেকশন ${section}`}
                        </div>

                        {/* Audio Upload Box */}
                        {sectionFiles[section].audio ? (
                          <div className="ielts-file-upload-box has-file">
                            <button
                              type="button"
                              className="ielts-modal-close"
                              style={{ position: 'absolute', top: '8px', right: '8px' }}
                              onClick={() => handleRemoveFile(section, 'audio')}
                              disabled={isSubmitting}
                            >
                              <HiX size={16} />
                            </button>
                            <HiVolumeUp size={28} className="ielts-file-icon" />
                            <span className="ielts-file-label" style={{ color: '#38b000' }}>
                              {language === 'en' ? 'Audio Selected' : 'অডিও সিলেক্টেড'}
                            </span>
                            <span className="ielts-file-info">{sectionFiles[section].audio.name}</span>
                          </div>
                        ) : (
                          <div className="ielts-file-upload-box">
                            <HiVolumeUp size={28} className="ielts-file-icon" />
                            <span className="ielts-file-label">
                              {language === 'en' ? 'Upload Audio' : 'অডিও আপলোড করুন'}
                            </span>
                            <span className="ielts-file-info">(.mp3, .wav, .ogg)</span>
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={(e) => handleFileChange(section, 'audio', e.target.files[0])}
                              className="ielts-file-input"
                              disabled={isSubmitting}
                            />
                          </div>
                        )}

                        {/* PDF Upload Box */}
                        {sectionFiles[section].pdf ? (
                          <div className="ielts-file-upload-box has-file">
                            <button
                              type="button"
                              className="ielts-modal-close"
                              style={{ position: 'absolute', top: '8px', right: '8px' }}
                              onClick={() => handleRemoveFile(section, 'pdf')}
                              disabled={isSubmitting}
                            >
                              <HiX size={16} />
                            </button>
                            <HiBookOpen size={28} className="ielts-file-icon" />
                            <span className="ielts-file-label" style={{ color: '#38b000' }}>
                              {language === 'en' ? 'PDF Selected' : 'পিডিএফ সিলেক্টেড'}
                            </span>
                            <span className="ielts-file-info">{sectionFiles[section].pdf.name}</span>
                          </div>
                        ) : (
                          <div className="ielts-file-upload-box">
                            <HiBookOpen size={28} className="ielts-file-icon" />
                            <span className="ielts-file-label">
                              {language === 'en' ? 'Upload PDF' : 'পিডিএফ আপলোড করুন'}
                            </span>
                            <span className="ielts-file-info">(.pdf)</span>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => handleFileChange(section, 'pdf', e.target.files[0])}
                              className="ielts-file-input"
                              disabled={isSubmitting}
                            />
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                </div>

                {/* Form Actions */}
                <div className="ielts-listening-form-actions">
                  <button
                    type="button"
                    className="ielts-listening-cancel-btn"
                    onClick={() => setViewMode('bank')}
                    disabled={isSubmitting}
                  >
                    {language === 'en' ? 'Cancel' : 'বাতিল'}
                  </button>
                  <button
                    type="submit"
                    className="ielts-listening-submit-btn"
                    disabled={isSubmitting}
                  >
                    <HiCheckCircle size={20} style={{ marginRight: '6px' }} />
                    <span>
                      {isSubmitting
                        ? (language === 'en' ? 'Submitting...' : 'সাবমিট হচ্ছে...')
                        : (language === 'en' ? 'Submit Question Set' : 'প্রশ্ন সেট সাবমিট করুন')}
                    </span>
                  </button>
                </div>

              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
