import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { HiBookOpen, HiArrowLeft, HiUpload, HiCheckCircle, HiX, HiDocumentText, HiPhotograph } from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import toast from 'react-hot-toast';
import './IeltsReadingUpload.css';

export default function IeltsReadingUpload() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Teacher',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'teacher',
  });

  const getFullFileUrl = (urlPath) => {
    if (!urlPath) return '';
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const serverRoot = apiBase.replace('/api', '');
    return `${serverRoot}${urlPath}`;
  };

  const [setName, setSetName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('bank'); // 'bank' or 'upload'
  const [dbSets, setDbSets] = useState([]);
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [selectedSetForDetails, setSelectedSetForDetails] = useState(null);

  // Passage 1 states (Required)
  const [passage1Type, setPassage1Type] = useState('text'); // 'pdf', 'text', or 'image'
  const [passage1Text, setPassage1Text] = useState('');
  const [passage1Pdf, setPassage1Pdf] = useState(null);
  const [passage1Image, setPassage1Image] = useState(null);

  // Passage 2 states (Optional)
  const [includePassage2, setIncludePassage2] = useState(false);
  const [passage2Type, setPassage2Type] = useState('text');
  const [passage2Text, setPassage2Text] = useState('');
  const [passage2Pdf, setPassage2Pdf] = useState(null);
  const [passage2Image, setPassage2Image] = useState(null);

  // Passage 3 states (Optional)
  const [includePassage3, setIncludePassage3] = useState(false);
  const [passage3Type, setPassage3Type] = useState('text');
  const [passage3Text, setPassage3Text] = useState('');
  const [passage3Pdf, setPassage3Pdf] = useState(null);
  const [passage3Image, setPassage3Image] = useState(null);

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

  // Fetch Reading Sets
  const fetchSets = async () => {
    try {
      setIsLoadingSets(true);
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/ielts/reading/sets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setDbSets(resData.data || []);
      }
    } catch (err) {
      console.error('Error fetching reading sets:', err);
    } finally {
      setIsLoadingSets(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'bank') {
      fetchSets();
    }
  }, [viewMode]);

  const handleFileChange = (passageNum, type, file) => {
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (type === 'pdf') {
      if (ext !== '.pdf') {
        toast.error(
          language === 'en'
            ? 'Only PDF files are allowed'
            : 'শুধুমাত্র পিডিএফ ফাইল আপলোড করা যাবে'
        );
        return;
      }
      if (passageNum === 1) setPassage1Pdf(file);
      else if (passageNum === 2) setPassage2Pdf(file);
      else if (passageNum === 3) setPassage3Pdf(file);
    } else if (type === 'image') {
      const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      if (!allowedExts.includes(ext)) {
        toast.error(
          language === 'en'
            ? 'Only image files are allowed (.png, .jpg, .jpeg, .webp, .gif)'
            : 'শুধুমাত্র ইমেজ ফাইল আপলোড করা যাবে (.png, .jpg, .jpeg, .webp, .gif)'
        );
        return;
      }
      if (passageNum === 1) setPassage1Image(file);
      else if (passageNum === 2) setPassage2Image(file);
      else if (passageNum === 3) setPassage3Image(file);
    }
  };

  const handleRemoveFile = (passageNum, type) => {
    if (passageNum === 1) {
      if (type === 'pdf') setPassage1Pdf(null);
      else setPassage1Image(null);
    } else if (passageNum === 2) {
      if (type === 'pdf') setPassage2Pdf(null);
      else setPassage2Image(null);
    } else if (passageNum === 3) {
      if (type === 'pdf') setPassage3Pdf(null);
      else setPassage3Image(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!setName.trim()) {
      toast.error(
        language === 'en'
          ? 'Please provide a Question Set Name'
          : 'অনুগ্রহ করে প্রশ্ন সেটের নাম দিন'
      );
      return;
    }

    // Passage 1 validation
    if (passage1Type === 'pdf' && !passage1Pdf) {
      toast.error(language === 'en' ? 'Please upload a PDF for Passage 1' : 'অনুগ্রহ করে প্যাসেজ ১-এর জন্য পিডিএফ ফাইল আপলোড করুন');
      return;
    }
    if (passage1Type === 'image' && !passage1Image) {
      toast.error(language === 'en' ? 'Please upload an image for Passage 1' : 'অনুগ্রহ করে প্যাসেজ ১-এর জন্য ছবি আপলোড করুন');
      return;
    }
    if (passage1Type === 'text' && !passage1Text.trim()) {
      toast.error(language === 'en' ? 'Please enter raw text for Passage 1' : 'অনুগ্রহ করে প্যাসেজ ১-এর জন্য টেক্সট লিখুন');
      return;
    }

    // Passage 2 validation
    if (includePassage2) {
      if (passage2Type === 'pdf' && !passage2Pdf) {
        toast.error(language === 'en' ? 'Please upload a PDF for Passage 2' : 'অনুগ্রহ করে প্যাসেজ ২-এর জন্য পিডিএফ ফাইল আপলোড করুন');
        return;
      }
      if (passage2Type === 'image' && !passage2Image) {
        toast.error(language === 'en' ? 'Please upload an image for Passage 2' : 'অনুগ্রহ করে প্যাসেজ ২-এর জন্য ছবি আপলোড করুন');
        return;
      }
      if (passage2Type === 'text' && !passage2Text.trim()) {
        toast.error(language === 'en' ? 'Please enter raw text for Passage 2' : 'অনুগ্রহ করে প্যাসেজ ২-এর জন্য টেক্সট লিখুন');
        return;
      }
    }

    // Passage 3 validation
    if (includePassage3) {
      if (passage3Type === 'pdf' && !passage3Pdf) {
        toast.error(language === 'en' ? 'Please upload a PDF for Passage 3' : 'অনুগ্রহ করে প্যাসেজ ৩-এর জন্য পিডিএফ ফাইল আপলোড করুন');
        return;
      }
      if (passage3Type === 'image' && !passage3Image) {
        toast.error(language === 'en' ? 'Please upload an image for Passage 3' : 'অনুগ্রহ করে প্যাসেজ ৩-এর জন্য ছবি আপলোড করুন');
        return;
      }
      if (passage3Type === 'text' && !passage3Text.trim()) {
        toast.error(language === 'en' ? 'Please enter raw text for Passage 3' : 'অনুগ্রহ করে প্যাসেজ ৩-এর জন্য টেক্সট লিখুন');
        return;
      }
    }

    setIsSubmitting(true);
    const toastId = toast.loading(
      language === 'en'
        ? 'Uploading reading question set to server...'
        : 'সার্ভারে রিডিং প্রশ্ন সেট আপলোড করা হচ্ছে...'
    );

    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const formData = new FormData();
      formData.append('setName', setName.trim());
      formData.append('passage1Type', passage1Type);

      if (passage1Type === 'pdf') {
        formData.append('passage1Pdf', passage1Pdf);
      } else if (passage1Type === 'image') {
        formData.append('passage1Image', passage1Image);
      } else {
        formData.append('passage1Text', passage1Text.trim());
      }

      if (includePassage2) {
        formData.append('passage2Type', passage2Type);
        if (passage2Type === 'pdf') {
          formData.append('passage2Pdf', passage2Pdf);
        } else if (passage2Type === 'image') {
          formData.append('passage2Image', passage2Image);
        } else {
          formData.append('passage2Text', passage2Text.trim());
        }
      }

      if (includePassage3) {
        formData.append('passage3Type', passage3Type);
        if (passage3Type === 'pdf') {
          formData.append('passage3Pdf', passage3Pdf);
        } else if (passage3Type === 'image') {
          formData.append('passage3Image', passage3Image);
        } else {
          formData.append('passage3Text', passage3Text.trim());
        }
      }

      const response = await fetch(`${backendBaseUrl}/ielts/reading/upload`, {
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
            ? 'IELTS Reading question set submitted successfully!'
            : 'আইইএলটিএস রিডিং প্রশ্ন সেট সফলভাবে সাবমিট হয়েছে!',
          { id: toastId }
        );
        // Reset states
        setSetName('');
        setPassage1Text('');
        setPassage2Text('');
        setPassage3Text('');
        setPassage1Pdf(null);
        setPassage2Pdf(null);
        setPassage3Pdf(null);
        setPassage1Image(null);
        setPassage2Image(null);
        setPassage3Image(null);
        setIncludePassage2(false);
        setIncludePassage3(false);
        setViewMode('bank');
      } else {
        toast.error(
          resData.message || (language === 'en' ? 'Failed to upload question set.' : 'প্রশ্ন সেট আপলোড করতে ব্যর্থ হয়েছে।'),
          { id: toastId }
        );
      }
    } catch (err) {
      console.error('Error submitting reading set:', err);
      toast.error(
        language === 'en' ? 'Network error. Please try again.' : 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।',
        { id: toastId }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPassagesCount = (set) => {
    let count = 0;
    if (set.passage1) count++;
    if (set.passage2) count++;
    if (set.passage3) count++;
    return count;
  };

  return (
    <div className="ielts-reading-upload-page">
      <Sidebar activeTab="ielts-teacher-reading" user={user} />

      <main className="ielts-reading-upload-content">
        {/* Header */}
        <div className="ielts-reading-upload-header">
          <button
            onClick={() => navigate('/ielts-teacher')}
            className="ielts-reading-upload-back-btn"
            title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
          >
            <HiArrowLeft size={20} />
          </button>
          <div className="ielts-reading-upload-header-text">
            <h2>{language === 'en' ? 'Reading Question Designer' : 'রিডিং প্রশ্ন ডিজাইনার'}</h2>
            <p>
              {language === 'en'
                ? 'Create, manage, and upload question sets to the Reading Question Bank.'
                : 'রিডিং প্রশ্ন ব্যাংকে প্রশ্ন সেট তৈরি, পরিচালনা এবং আপলোড করুন।'}
            </p>
          </div>
        </div>

        {/* Workspace */}
        <div className="ielts-reading-upload-workspace">
          {viewMode === 'bank' ? (
            <div className="ielts-reading-upload-container">
              <div className="ielts-bank-header">
                <h3>{language === 'en' ? 'Available Question Sets' : 'বিদ্যমান প্রশ্ন সেটসমূহ'}</h3>
                <button
                  type="button"
                  className="ielts-reading-submit-btn-cta"
                  style={{ padding: '12px 24px', fontSize: '0.95rem', borderRadius: '50px', margin: 0 }}
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
                <>
                  <div className="ielts-bank-grid">
                    {dbSets.map((set) => (
                      <div
                        key={set._id}
                        className="ielts-bank-card"
                        onClick={() => setSelectedSetForDetails(set)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="ielts-bank-card-info">
                          <h4>{set.setName}</h4>
                          <div className="ielts-bank-card-meta">
                            <span>👤 {set.creator?.name || 'Educator'}</span>
                            <span>📅 {new Date(set.createdAt).toLocaleDateString()}</span>
                            <span>📖 {getPassagesCount(set)} {language === 'en' ? 'Passages' : 'টি প্যাসেজ'}</span>
                          </div>
                          <button
                            type="button"
                            className="ielts-view-clean-btn"
                          >
                            <span>{language === 'en' ? 'View Details' : 'বিস্তারিত দেখুন'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedSetForDetails && (
                    <div className="ielts-clean-modal-overlay" onClick={() => setSelectedSetForDetails(null)}>
                      <div className="ielts-clean-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="ielts-clean-modal-header">
                          <h3>{selectedSetForDetails.setName}</h3>
                          <button type="button" className="ielts-clean-modal-close" onClick={() => setSelectedSetForDetails(null)}>
                            <HiX size={20} />
                          </button>
                        </div>
                        <div className="ielts-clean-modal-body">
                          {/* Passage 1 Section */}
                          <div className="ielts-clean-task-section">
                            <h4>Passage 1 ({selectedSetForDetails.passage1?.type === 'text' ? (language === 'en' ? 'Text' : 'টেক্সট') : selectedSetForDetails.passage1?.type === 'pdf' ? 'PDF' : (language === 'en' ? 'Image' : 'ছবি')})</h4>
                            
                            <div className="ielts-original-prompt-container">
                              {selectedSetForDetails.passage1?.type === 'pdf' && selectedSetForDetails.passage1?.pdfUrl && (
                                <div className="ielts-modal-pdf-container">
                                  <iframe
                                    src={getFullFileUrl(selectedSetForDetails.passage1.pdfUrl)}
                                    width="100%"
                                    height="380px"
                                    style={{ border: '1px solid rgba(192, 133, 82, 0.15)', borderRadius: '12px' }}
                                    title="Passage 1 PDF"
                                  />
                                </div>
                              )}

                              {selectedSetForDetails.passage1?.type === 'image' && selectedSetForDetails.passage1?.imageUrl && (
                                <div className="ielts-modal-image-container" style={{ textAlign: 'center' }}>
                                  <img
                                    src={getFullFileUrl(selectedSetForDetails.passage1.imageUrl)}
                                    alt="Passage 1 Prompt"
                                    style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '12px', border: '1px solid rgba(192, 133, 82, 0.15)' }}
                                  />
                                </div>
                              )}

                              {selectedSetForDetails.passage1?.type === 'text' && (
                                <div className="ielts-clean-prompt-box">
                                  {selectedSetForDetails.passage1?.textPrompt}
                                </div>
                              )}

                              {selectedSetForDetails.passage1?.cleanPrompt && (
                                <div style={{ marginTop: '16px' }}>
                                  <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-accent)' }}>
                                    {language === 'en' ? 'Extracted & Formatted Text:' : 'নিষ্কাশিত এবং ফরম্যাট করা টেক্সট:'}
                                  </h5>
                                  <div className="ielts-clean-prompt-box">
                                    {selectedSetForDetails.passage1.cleanPrompt}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Passage 2 Section */}
                          {selectedSetForDetails.passage2 && (
                            <div className="ielts-clean-task-section" style={{ marginTop: '24px' }}>
                              <h4>Passage 2 ({selectedSetForDetails.passage2?.type === 'text' ? (language === 'en' ? 'Text' : 'টেক্সট') : selectedSetForDetails.passage2?.type === 'pdf' ? 'PDF' : (language === 'en' ? 'Image' : 'ছবি')})</h4>
                              
                              <div className="ielts-original-prompt-container">
                                {selectedSetForDetails.passage2?.type === 'pdf' && selectedSetForDetails.passage2?.pdfUrl && (
                                  <div className="ielts-modal-pdf-container">
                                    <iframe
                                      src={getFullFileUrl(selectedSetForDetails.passage2.pdfUrl)}
                                      width="100%"
                                      height="380px"
                                      style={{ border: '1px solid rgba(192, 133, 82, 0.15)', borderRadius: '12px' }}
                                      title="Passage 2 PDF"
                                    />
                                  </div>
                                )}

                                {selectedSetForDetails.passage2?.type === 'image' && selectedSetForDetails.passage2?.imageUrl && (
                                  <div className="ielts-modal-image-container" style={{ textAlign: 'center' }}>
                                    <img
                                      src={getFullFileUrl(selectedSetForDetails.passage2.imageUrl)}
                                      alt="Passage 2 Prompt"
                                      style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '12px', border: '1px solid rgba(192, 133, 82, 0.15)' }}
                                    />
                                  </div>
                                )}

                                {selectedSetForDetails.passage2?.type === 'text' && (
                                  <div className="ielts-clean-prompt-box">
                                    {selectedSetForDetails.passage2?.textPrompt}
                                  </div>
                                )}

                                {selectedSetForDetails.passage2?.cleanPrompt && (
                                  <div style={{ marginTop: '16px' }}>
                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-accent)' }}>
                                      {language === 'en' ? 'Extracted & Formatted Text:' : 'নিষ্কাশিত এবং ফরম্যাট করা টেক্সট:'}
                                    </h5>
                                    <div className="ielts-clean-prompt-box">
                                      {selectedSetForDetails.passage2.cleanPrompt}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Passage 3 Section */}
                          {selectedSetForDetails.passage3 && (
                            <div className="ielts-clean-task-section" style={{ marginTop: '24px' }}>
                              <h4>Passage 3 ({selectedSetForDetails.passage3?.type === 'text' ? (language === 'en' ? 'Text' : 'টেক্সট') : selectedSetForDetails.passage3?.type === 'pdf' ? 'PDF' : (language === 'en' ? 'Image' : 'ছবি')})</h4>
                              
                              <div className="ielts-original-prompt-container">
                                {selectedSetForDetails.passage3?.type === 'pdf' && selectedSetForDetails.passage3?.pdfUrl && (
                                  <div className="ielts-modal-pdf-container">
                                    <iframe
                                      src={getFullFileUrl(selectedSetForDetails.passage3.pdfUrl)}
                                      width="100%"
                                      height="380px"
                                      style={{ border: '1px solid rgba(192, 133, 82, 0.15)', borderRadius: '12px' }}
                                      title="Passage 3 PDF"
                                    />
                                  </div>
                                )}

                                {selectedSetForDetails.passage3?.type === 'image' && selectedSetForDetails.passage3?.imageUrl && (
                                  <div className="ielts-modal-image-container" style={{ textAlign: 'center' }}>
                                    <img
                                      src={getFullFileUrl(selectedSetForDetails.passage3.imageUrl)}
                                      alt="Passage 3 Prompt"
                                      style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '12px', border: '1px solid rgba(192, 133, 82, 0.15)' }}
                                    />
                                  </div>
                                )}

                                {selectedSetForDetails.passage3?.type === 'text' && (
                                  <div className="ielts-clean-prompt-box">
                                    {selectedSetForDetails.passage3?.textPrompt}
                                  </div>
                                )}

                                {selectedSetForDetails.passage3?.cleanPrompt && (
                                  <div style={{ marginTop: '16px' }}>
                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-accent)' }}>
                                      {language === 'en' ? 'Extracted & Formatted Text:' : 'নিষ্কাশিত এবং ফরম্যাট করা টেক্সট:'}
                                    </h5>
                                    <div className="ielts-clean-prompt-box">
                                      {selectedSetForDetails.passage3.cleanPrompt}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="ielts-reading-upload-container">
              <form className="ielts-reading-upload-form-card" onSubmit={handleSubmit}>
                <div className="ielts-reading-upload-form-header">
                  <h3>{language === 'en' ? 'Upload New Reading Set' : 'নতুন রিডিং সেট আপলোড করুন'}</h3>
                  <button type="button" className="ielts-reading-close-btn" onClick={() => setViewMode('bank')}>
                    <HiX size={20} />
                  </button>
                </div>

                {/* Question Set Name */}
                <div className="ielts-reading-form-group">
                  <label htmlFor="setName">
                    {language === 'en' ? 'Question Set Name' : 'প্রশ্ন সেটের নাম'} <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    id="setName"
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. Academic Reading: The History of Space Travel' : 'যেমন: একাডেমিক রিডিং: মহাকাশ ভ্রমণের ইতিহাস'}
                    className="ielts-reading-form-input"
                    disabled={isSubmitting}
                  />
                </div>

                {/* Passage 1 (Required) */}
                <div className="ielts-reading-passage-block">
                  <div className="ielts-passage-block-header">
                    <h4>{language === 'en' ? 'Passage 1 (Required)' : 'প্যাসেজ ১ (আবশ্যক)'}</h4>
                  </div>

                  <div className="ielts-passage-type-selectors">
                    <button
                      type="button"
                      className={`ielts-passage-type-btn ${passage1Type === 'text' ? 'active' : ''}`}
                      onClick={() => setPassage1Type('text')}
                      disabled={isSubmitting}
                    >
                      <HiDocumentText size={18} />
                      <span>{language === 'en' ? 'Write Text' : 'টেক্সট লিখুন'}</span>
                    </button>
                    <button
                      type="button"
                      className={`ielts-passage-type-btn ${passage1Type === 'pdf' ? 'active' : ''}`}
                      onClick={() => setPassage1Type('pdf')}
                      disabled={isSubmitting}
                    >
                      <HiUpload size={18} />
                      <span>{language === 'en' ? 'Upload PDF' : 'পিডিএফ আপলোড'}</span>
                    </button>
                    <button
                      type="button"
                      className={`ielts-passage-type-btn ${passage1Type === 'image' ? 'active' : ''}`}
                      onClick={() => setPassage1Type('image')}
                      disabled={isSubmitting}
                    >
                      <HiPhotograph size={18} />
                      <span>{language === 'en' ? 'Upload Picture' : 'ছবি আপলোড'}</span>
                    </button>
                  </div>

                  <div className="ielts-passage-type-content">
                    {passage1Type === 'text' && (
                      <textarea
                        rows={8}
                        value={passage1Text}
                        onChange={(e) => setPassage1Text(e.target.value)}
                        placeholder={language === 'en' ? 'Type or paste the passage and questions here...' : 'প্যাসেজ এবং প্রশ্নাবলী এখানে লিখুন বা পেস্ট করুন...'}
                        className="ielts-reading-textarea"
                        disabled={isSubmitting}
                      />
                    )}

                    {passage1Type === 'pdf' && (
                      <div className="ielts-file-upload-zone">
                        {!passage1Pdf ? (
                          <>
                            <HiUpload size={32} style={{ color: 'var(--text-secondary)' }} />
                            <p>{language === 'en' ? 'Click or drag PDF file here to upload' : 'আপলোডের জন্য পিডিএফ ফাইলটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => handleFileChange(1, 'pdf', e.target.files[0])}
                              className="ielts-hidden-file-input"
                              disabled={isSubmitting}
                            />
                          </>
                        ) : (
                          <div className="ielts-uploaded-file-info">
                            <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                            <span>{passage1Pdf.name}</span>
                            <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(1, 'pdf')} disabled={isSubmitting}>
                              <HiX size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {passage1Type === 'image' && (
                      <div className="ielts-file-upload-zone">
                        {!passage1Image ? (
                          <>
                            <HiPhotograph size={32} style={{ color: 'var(--text-secondary)' }} />
                            <p>{language === 'en' ? 'Click or drag picture here to upload' : 'আপলোডের জন্য ছবিটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(1, 'image', e.target.files[0])}
                              className="ielts-hidden-file-input"
                              disabled={isSubmitting}
                            />
                          </>
                        ) : (
                          <div className="ielts-uploaded-file-info">
                            <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                            <span>{passage1Image.name}</span>
                            <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(1, 'image')} disabled={isSubmitting}>
                              <HiX size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Passage 2 Option */}
                <div className="ielts-passage-toggle-group">
                  <label className="ielts-passage-checkbox-label">
                    <input
                      type="checkbox"
                      checked={includePassage2}
                      onChange={(e) => setIncludePassage2(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>{language === 'en' ? 'Include Passage 2 (Optional)' : 'প্যাসেজ ২ অন্তর্ভুক্ত করুন (ঐচ্ছিক)'}</span>
                  </label>
                </div>

                {includePassage2 && (
                  <div className="ielts-reading-passage-block">
                    <div className="ielts-passage-block-header">
                      <h4>{language === 'en' ? 'Passage 2' : 'প্যাসেজ ২'}</h4>
                    </div>

                    <div className="ielts-passage-type-selectors">
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage2Type === 'text' ? 'active' : ''}`}
                        onClick={() => setPassage2Type('text')}
                        disabled={isSubmitting}
                      >
                        <HiDocumentText size={18} />
                        <span>{language === 'en' ? 'Write Text' : 'টেক্সট লিখুন'}</span>
                      </button>
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage2Type === 'pdf' ? 'active' : ''}`}
                        onClick={() => setPassage2Type('pdf')}
                        disabled={isSubmitting}
                      >
                        <HiUpload size={18} />
                        <span>{language === 'en' ? 'Upload PDF' : 'পিডিএফ আপলোড'}</span>
                      </button>
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage2Type === 'image' ? 'active' : ''}`}
                        onClick={() => setPassage2Type('image')}
                        disabled={isSubmitting}
                      >
                        <HiPhotograph size={18} />
                        <span>{language === 'en' ? 'Upload Picture' : 'ছবি আপলোড'}</span>
                      </button>
                    </div>

                    <div className="ielts-passage-type-content">
                      {passage2Type === 'text' && (
                        <textarea
                          rows={8}
                          value={passage2Text}
                          onChange={(e) => setPassage2Text(e.target.value)}
                          placeholder={language === 'en' ? 'Type or paste Passage 2 and questions here...' : 'প্যাসেজ ২ এবং প্রশ্নাবলী এখানে লিখুন বা পেস্ট করুন...'}
                          className="ielts-reading-textarea"
                          disabled={isSubmitting}
                        />
                      )}

                      {passage2Type === 'pdf' && (
                        <div className="ielts-file-upload-zone">
                          {!passage2Pdf ? (
                            <>
                              <HiUpload size={32} style={{ color: 'var(--text-secondary)' }} />
                              <p>{language === 'en' ? 'Click or drag PDF file here to upload' : 'আপলোডের জন্য পিডিএফ ফাইলটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleFileChange(2, 'pdf', e.target.files[0])}
                                className="ielts-hidden-file-input"
                                disabled={isSubmitting}
                              />
                            </>
                          ) : (
                            <div className="ielts-uploaded-file-info">
                              <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                              <span>{passage2Pdf.name}</span>
                              <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(2, 'pdf')} disabled={isSubmitting}>
                                <HiX size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {passage2Type === 'image' && (
                        <div className="ielts-file-upload-zone">
                          {!passage2Image ? (
                            <>
                              <HiPhotograph size={32} style={{ color: 'var(--text-secondary)' }} />
                              <p>{language === 'en' ? 'Click or drag picture here to upload' : 'আপলোডের জন্য ছবিটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(2, 'image', e.target.files[0])}
                                className="ielts-hidden-file-input"
                                disabled={isSubmitting}
                              />
                            </>
                          ) : (
                            <div className="ielts-uploaded-file-info">
                              <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                              <span>{passage2Image.name}</span>
                              <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(2, 'image')} disabled={isSubmitting}>
                                <HiX size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Passage 3 Option */}
                <div className="ielts-passage-toggle-group">
                  <label className="ielts-passage-checkbox-label">
                    <input
                      type="checkbox"
                      checked={includePassage3}
                      onChange={(e) => setIncludePassage3(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>{language === 'en' ? 'Include Passage 3 (Optional)' : 'প্যাসেজ ৩ অন্তর্ভুক্ত করুন (ঐচ্ছিক)'}</span>
                  </label>
                </div>

                {includePassage3 && (
                  <div className="ielts-reading-passage-block">
                    <div className="ielts-passage-block-header">
                      <h4>{language === 'en' ? 'Passage 3' : 'প্যাসেজ ৩'}</h4>
                    </div>

                    <div className="ielts-passage-type-selectors">
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage3Type === 'text' ? 'active' : ''}`}
                        onClick={() => setPassage3Type('text')}
                        disabled={isSubmitting}
                      >
                        <HiDocumentText size={18} />
                        <span>{language === 'en' ? 'Write Text' : 'টেক্সট লিখুন'}</span>
                      </button>
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage3Type === 'pdf' ? 'active' : ''}`}
                        onClick={() => setPassage3Type('pdf')}
                        disabled={isSubmitting}
                      >
                        <HiUpload size={18} />
                        <span>{language === 'en' ? 'Upload PDF' : 'পিডিএফ আপলোড'}</span>
                      </button>
                      <button
                        type="button"
                        className={`ielts-passage-type-btn ${passage3Type === 'image' ? 'active' : ''}`}
                        onClick={() => setPassage3Type('image')}
                        disabled={isSubmitting}
                      >
                        <HiPhotograph size={18} />
                        <span>{language === 'en' ? 'Upload Picture' : 'ছবি আপলোড'}</span>
                      </button>
                    </div>

                    <div className="ielts-passage-type-content">
                      {passage3Type === 'text' && (
                        <textarea
                          rows={8}
                          value={passage3Text}
                          onChange={(e) => setPassage3Text(e.target.value)}
                          placeholder={language === 'en' ? 'Type or paste Passage 3 and questions here...' : 'প্যাসেজ ৩ এবং প্রশ্নাবলী এখানে লিখুন বা পেস্ট করুন...'}
                          className="ielts-reading-textarea"
                          disabled={isSubmitting}
                        />
                      )}

                      {passage3Type === 'pdf' && (
                        <div className="ielts-file-upload-zone">
                          {!passage3Pdf ? (
                            <>
                              <HiUpload size={32} style={{ color: 'var(--text-secondary)' }} />
                              <p>{language === 'en' ? 'Click or drag PDF file here to upload' : 'আপলোডের জন্য পিডিএফ ফাইলটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleFileChange(3, 'pdf', e.target.files[0])}
                                className="ielts-hidden-file-input"
                                disabled={isSubmitting}
                              />
                            </>
                          ) : (
                            <div className="ielts-uploaded-file-info">
                              <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                              <span>{passage3Pdf.name}</span>
                              <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(3, 'pdf')} disabled={isSubmitting}>
                                <HiX size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {passage3Type === 'image' && (
                        <div className="ielts-file-upload-zone">
                          {!passage3Image ? (
                            <>
                              <HiPhotograph size={32} style={{ color: 'var(--text-secondary)' }} />
                              <p>{language === 'en' ? 'Click or drag picture here to upload' : 'আপলোডের জন্য ছবিটি ক্লিক করুন বা এখানে ড্র্যাগ করুন'}</p>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(3, 'image', e.target.files[0])}
                                className="ielts-hidden-file-input"
                                disabled={isSubmitting}
                              />
                            </>
                          ) : (
                            <div className="ielts-uploaded-file-info">
                              <HiCheckCircle size={24} style={{ color: 'var(--success)' }} />
                              <span>{passage3Image.name}</span>
                              <button type="button" className="ielts-remove-file-btn" onClick={() => handleRemoveFile(3, 'image')} disabled={isSubmitting}>
                                <HiX size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Form Actions */}
                <div className="ielts-reading-form-actions">
                  <button
                    type="button"
                    className="ielts-reading-cancel-btn"
                    onClick={() => setViewMode('bank')}
                    disabled={isSubmitting}
                  >
                    {language === 'en' ? 'Cancel' : 'বাতিল'}
                  </button>
                  <button
                    type="submit"
                    className="ielts-reading-submit-btn"
                    disabled={isSubmitting}
                  >
                    <span>{isSubmitting ? (language === 'en' ? 'Submitting...' : 'সাবমিট হচ্ছে...') : (language === 'en' ? 'Submit Question Set' : 'প্রশ্ন সেট সাবমিট করুন')}</span>
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
