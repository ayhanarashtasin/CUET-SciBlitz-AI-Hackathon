import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { 
  HiPencilAlt, 
  HiArrowLeft, 
  HiUpload, 
  HiCheckCircle, 
  HiX, 
  HiDocumentText, 
  HiPhotograph, 
  HiTrash,
  HiAcademicCap,
  HiVideoCamera,
  HiPlay,
  HiPlus,
  HiExternalLink
} from 'react-icons/hi';
import { motion } from 'framer-motion';
import Sidebar from '../components/layout/Sidebar';
import toast from 'react-hot-toast';
import './IeltsWritingUpload.css';

export default function IeltsWritingUpload() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    id: localStorage.getItem('topkorbo_id') || '',
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

  const [activeSubOption, setActiveSubOption] = useState(null); // null, 'tutorials', 'questions'
  const [setName, setSetName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('bank'); // 'bank' or 'upload'
  const [dbSets, setDbSets] = useState([]);
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [selectedSetForDetails, setSelectedSetForDetails] = useState(null);

  // Tutorials State
  const [tutorials, setTutorials] = useState(() => {
    try {
      const saved = localStorage.getItem('topkorbo_writing_tutorials');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out legacy dummy items
        return parsed.filter(t => !['tut-1', 'tut-2', 'tut-3'].includes(t.id));
      }
    } catch {}
    return [];
  });

  const [isAddingTutorial, setIsAddingTutorial] = useState(false);
  const [selectedTutorialForView, setSelectedTutorialForView] = useState(null);
  const [tutCategoryFilter, setTutCategoryFilter] = useState('all');
  const [newTutTitle, setNewTutTitle] = useState('');
  const [newTutCategory, setNewTutCategory] = useState('Task 1');
  const [newTutVideoUrl, setNewTutVideoUrl] = useState('');
  const [newTutDescription, setNewTutDescription] = useState('');
  const [newTutDuration, setNewTutDuration] = useState('15 mins');

  const filteredTutorials = tutorials.filter(tut => {
    if (tutCategoryFilter === 'all') return true;
    return (tut.category || '').toLowerCase() === tutCategoryFilter.toLowerCase();
  });

  const handleAddTutorial = (e) => {
    e.preventDefault();
    if (!newTutTitle.trim()) {
      toast.error(language === 'en' ? 'Please enter a tutorial title' : 'টিউটোরিয়াল শিরোনাম দিন');
      return;
    }
    const newTut = {
      id: `tut-${Date.now()}`,
      title: newTutTitle.trim(),
      category: newTutCategory,
      duration: newTutDuration.trim() || '15 mins',
      videoUrl: newTutVideoUrl.trim() || '',
      description: newTutDescription.trim() || '',
      createdAt: new Date().toISOString(),
      instructor: user.name || 'Teacher'
    };

    const updated = [newTut, ...tutorials];
    setTutorials(updated);
    try {
      localStorage.setItem('topkorbo_writing_tutorials', JSON.stringify(updated));
    } catch {}

    toast.success(language === 'en' ? 'Tutorial published successfully!' : 'টিউটোরিয়াল সফলভাবে প্রকাশিত হয়েছে!');
    setIsAddingTutorial(false);
    setNewTutTitle('');
    setNewTutVideoUrl('');
    setNewTutDescription('');
  };

  const handleDeleteTutorial = (tutId, e) => {
    e.stopPropagation();
    const updated = tutorials.filter(t => t.id !== tutId);
    setTutorials(updated);
    try {
      localStorage.setItem('topkorbo_writing_tutorials', JSON.stringify(updated));
    } catch {}
    toast.success(language === 'en' ? 'Tutorial removed' : 'টিউটোরিয়াল মুছে ফেলা হয়েছে');
  };

  const handleBackNavigation = () => {
    if (selectedSetForDetails) {
      setSelectedSetForDetails(null);
    } else if (selectedTutorialForView) {
      setSelectedTutorialForView(null);
    } else if (viewMode === 'upload') {
      setViewMode('bank');
    } else if (activeSubOption !== null) {
      setActiveSubOption(null);
    } else {
      navigate('/ielts-teacher');
    }
  };

  // Task 1 and Task 2 states
  const [task1Type, setTask1Type] = useState('text'); // 'pdf', 'text', or 'image'
  const [task1Text, setTask1Text] = useState('');
  const [task1Pdf, setTask1Pdf] = useState(null);
  const [task1Image, setTask1Image] = useState(null);

  const [task2Type, setTask2Type] = useState('text'); // 'pdf', 'text', or 'image'
  const [task2Text, setTask2Text] = useState('');
  const [task2Pdf, setTask2Pdf] = useState(null);
  const [task2Image, setTask2Image] = useState(null);

  // Auth Guard & User Identity Fetch
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
            id: u._id,
            name: u.name,
            avatar: u.avatar || '',
            email: u.email,
            role: u.role,
          });
          localStorage.setItem('topkorbo_id', u._id);
        }
      } catch (err) {
        console.error('Error fetching user data in IELTS Writing Upload:', err);
      }
    };

    fetchUserData();
  }, [navigate]);

  // Fetch writing sets
  const fetchSets = async () => {
    try {
      setIsLoadingSets(true);
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${backendBaseUrl}/ielts/writing/sets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await response.json();
      if (response.ok && resData.success) {
        setDbSets(resData.data || []);
      }
    } catch (err) {
      console.error('Error fetching writing sets:', err);
    } finally {
      setIsLoadingSets(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'bank') {
      fetchSets();
    }
  }, [viewMode]);

  const handleDeleteSet = async (setId, e) => {
    e.stopPropagation(); // Prevent opening details modal

    const confirmMsg = language === 'en'
      ? 'Are you sure you want to delete this question set?'
      : 'আপনি কি নিশ্চিত যে আপনি এই প্রশ্ন সেটটি মুছে ফেলতে চান?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const response = await fetch(`${backendBaseUrl}/ielts/writing/sets/${setId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        toast.success(
          language === 'en'
            ? 'Question set deleted successfully!'
            : 'প্রশ্ন সেট সফলভাবে মুছে ফেলা হয়েছে!'
        );
        // Refresh list
        fetchSets();
      } else {
        toast.error(
          resData.message || (language === 'en' ? 'Failed to delete question set.' : 'প্রশ্ন সেট মুছতে ব্যর্থ হয়েছে।')
        );
      }
    } catch (err) {
      console.error('Error deleting writing set:', err);
      toast.error(
        language === 'en' ? 'Network error. Please try again.' : 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।'
      );
    }
  };

  const handleFileChange = (task, type, file) => {
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
      if (task === 1) {
        setTask1Pdf(file);
      } else {
        setTask2Pdf(file);
      }
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
      if (task === 1) {
        setTask1Image(file);
      } else {
        setTask2Image(file);
      }
    }
  };

  const handleRemoveFile = (task, type) => {
    if (task === 1) {
      if (type === 'pdf') setTask1Pdf(null);
      else setTask1Image(null);
    } else {
      if (type === 'pdf') setTask2Pdf(null);
      else setTask2Image(null);
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

    // Task 1 validations
    if (task1Type === 'pdf' && !task1Pdf) {
      toast.error(
        language === 'en'
          ? 'Please upload a PDF file for Task 1'
          : 'অনুগ্রহ করে টাস্ক ১-এর জন্য একটি পিডিএফ ফাইল আপলোড করুন'
      );
      return;
    }
    if (task1Type === 'image' && !task1Image) {
      toast.error(
        language === 'en'
          ? 'Please upload a picture file for Task 1'
          : 'অনুগ্রহ করে টাস্ক ১-এর জন্য একটি ছবি আপলোড করুন'
      );
      return;
    }
    if (task1Type === 'text' && !task1Text.trim()) {
      toast.error(
        language === 'en'
          ? 'Please enter a text prompt for Task 1'
          : 'অনুগ্রহ করে টাস্ক ১-এর জন্য টেক্সট প্রম্পট লিখুন'
      );
      return;
    }

    // Task 2 validations
    if (task2Type === 'pdf' && !task2Pdf) {
      toast.error(
        language === 'en'
          ? 'Please upload a PDF file for Task 2'
          : 'অনুগ্রহ করে টাস্ক ২-এর জন্য একটি পিডিএফ ফাইল আপলোড করুন'
      );
      return;
    }
    if (task2Type === 'image' && !task2Image) {
      toast.error(
        language === 'en'
          ? 'Please upload a picture file for Task 2'
          : 'অনুগ্রহ করে টাস্ক ২-এর জন্য একটি ছবি আপলোড করুন'
      );
      return;
    }
    if (task2Type === 'text' && !task2Text.trim()) {
      toast.error(
        language === 'en'
          ? 'Please enter a text prompt for Task 2'
          : 'অনুগ্রহ করে টাস্ক ২-এর জন্য টেক্সট প্রম্পট লিখুন'
      );
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(
      language === 'en'
        ? 'Uploading writing question set to server...'
        : 'সার্ভারে রাইটিং প্রশ্ন সেট আপলোড করা হচ্ছে...'
    );

    try {
      const token = localStorage.getItem('topkorbo_token');
      const backendBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      const formData = new FormData();
      formData.append('setName', setName.trim());
      formData.append('task1Type', task1Type);
      formData.append('task2Type', task2Type);

      if (task1Type === 'pdf') {
        formData.append('task1Pdf', task1Pdf);
      } else if (task1Type === 'image') {
        formData.append('task1Image', task1Image);
      } else {
        formData.append('task1Text', task1Text.trim());
      }

      if (task2Type === 'pdf') {
        formData.append('task2Pdf', task2Pdf);
      } else if (task2Type === 'image') {
        formData.append('task2Image', task2Image);
      } else {
        formData.append('task2Text', task2Text.trim());
      }

      const response = await fetch(`${backendBaseUrl}/ielts/writing/upload`, {
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
            ? 'IELTS Writing question set submitted successfully!'
            : 'আইইএলটিএস রাইটিং প্রশ্ন সেট সফলভাবে সাবমিট হয়েছে!',
          { id: toastId }
        );
        setSetName('');
        setTask1Text('');
        setTask2Text('');
        setTask1Pdf(null);
        setTask2Pdf(null);
        setTask1Image(null);
        setTask2Image(null);
        setViewMode('bank');
      } else {
        toast.error(
          resData.message || (language === 'en' ? 'Failed to upload question set.' : 'প্রশ্ন সেট আপলোড করতে ব্যর্থ হয়েছে।'),
          { id: toastId }
        );
      }
    } catch (err) {
      console.error('Error submitting writing set:', err);
      toast.error(
        language === 'en' ? 'Network error. Please try again.' : 'নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।',
        { id: toastId }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ielts-writing-upload-page">
      <Sidebar activeTab="ielts-teacher-writing" user={user} />

      <main className="ielts-writing-upload-content">
        {/* Header */}
        <div className="ielts-writing-upload-header">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="ielts-writing-upload-back-btn"
            title={language === 'en' ? 'Go Back' : 'পিছনে যান'}
          >
            <HiArrowLeft size={20} />
          </button>
          <div className="ielts-writing-upload-header-text">
            <h2>
              {activeSubOption === 'tutorials'
                ? (language === 'en' ? 'Writing Tutorials' : 'রাইটিং টিউটোরিয়াল')
                : activeSubOption === 'questions'
                ? (language === 'en' ? 'Writing Questions' : 'রাইটিং প্রশ্নাবলী')
                : (language === 'en' ? 'Writing Resource Center' : 'রাইটিং রিসোর্স সেন্টার')}
            </h2>
            <p>
              {activeSubOption === 'tutorials'
                ? (language === 'en' ? 'Upload and manage video masterclasses, essay blueprints, and task guides.' : 'ভিডিও মাস্টারক্লাস, প্রবন্ধের গঠন এবং টাস্ক নির্দেশিকা আপলোড ও পরিচালনা করুন।')
                : activeSubOption === 'questions'
                ? (language === 'en' ? 'Create, manage, and upload question sets to the Writing Question Bank.' : 'রাইটিং প্রশ্ন ব্যাংকে প্রশ্ন সেট তৈরি, পরিচালনা এবং আপলোড করুন।')
                : (language === 'en' ? 'Select whether to manage instructional tutorials or writing test questions.' : 'টিউটোরিয়াল পরিচালনা করবেন নাকি রাইটিং প্রশ্নাবলী পরিচালনা করবেন তা নির্বাচন করুন।')}
            </p>
          </div>
        </div>

        {/* Workspace */}
        <div className="ielts-writing-upload-workspace">
          <div className="ielts-writing-upload-container">

            {/* Selection Menu (2 Options) */}
            {activeSubOption === null && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="ielts-writing-options-grid"
              >
                {/* Option 1: Writing tutorials */}
                <div
                  className="ielts-writing-option-card"
                  onClick={() => setActiveSubOption('tutorials')}
                >
                  <div className="ielts-writing-option-icon">
                    <HiAcademicCap />
                  </div>
                  <h3>
                    {language === 'en' ? 'Writing tutorials' : 'রাইটিং টিউটোরিয়াল'}
                  </h3>
                  <p>
                    {language === 'en'
                      ? 'Upload, publish, and organize video masterclasses, task 1 & 2 templates, and band criteria guides.'
                      : 'স্ট্রাকচার্ড ভিডিও লেসন, প্রবন্ধের গঠন এবং টাস্ক নির্দেশিকা আপলোড ও পরিচালনা করুন।'}
                  </p>
                  <button className="ielts-writing-select-btn">
                    {language === 'en' ? 'Manage Tutorials' : 'টিউটোরিয়াল পরিচালনা করুন'}
                  </button>
                </div>

                {/* Option 2: Questions */}
                <div
                  className="ielts-writing-option-card"
                  onClick={() => setActiveSubOption('questions')}
                >
                  <div className="ielts-writing-option-icon">
                    <HiPencilAlt />
                  </div>
                  <h3>
                    {language === 'en' ? 'Questions' : 'প্রশ্নাবলী'}
                  </h3>
                  <p>
                    {language === 'en'
                      ? 'Create, manage, and upload question sets to the Writing Question Bank.'
                      : 'রাইটিং প্রশ্ন ব্যাংকে প্রশ্ন সেট তৈরি, পরিচালনা এবং আপলোড করুন।'}
                  </p>
                  <button className="ielts-writing-select-btn">
                    {language === 'en' ? 'Manage Questions' : 'প্রশ্নাবলী পরিচালনা করুন'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Option 1: Writing Tutorials View */}
            {activeSubOption === 'tutorials' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ width: '100%' }}
              >
                <div className="ielts-bank-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0 }}>{language === 'en' ? 'Writing Tutorials & Masterclasses' : 'রাইটিং টিউটোরিয়াল ও মাস্টারক্লাস'}</h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['all', 'Task 1', 'Task 2', 'Strategy'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setTutCategoryFilter(cat)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            border: '1px solid',
                            borderColor: tutCategoryFilter.toLowerCase() === cat.toLowerCase() ? 'var(--sky-blue)' : 'rgba(192, 133, 82, 0.2)',
                            background: tutCategoryFilter.toLowerCase() === cat.toLowerCase() ? 'var(--sky-blue)' : 'rgba(255, 255, 255, 0.8)',
                            color: tutCategoryFilter.toLowerCase() === cat.toLowerCase() ? '#ffffff' : 'var(--text-primary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {cat === 'all' ? (language === 'en' ? 'All' : 'সব') : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="ielts-writing-submit-btn-cta"
                    style={{ padding: '12px 24px', fontSize: '0.95rem', borderRadius: '50px', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setIsAddingTutorial(true)}
                  >
                    <HiPlus size={18} />
                    <span>{language === 'en' ? 'Upload New Tutorial' : 'নতুন টিউটোরিয়াল যোগ করুন'}</span>
                  </button>
                </div>

                {filteredTutorials.length === 0 ? (
                  <div className="ielts-bank-empty">
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontStyle: 'italic' }}>
                      {language === 'en' ? 'No tutorials found in this category.' : 'এই ক্যাটাগরিতে কোনো টিউটোরিয়াল নেই।'}
                    </p>
                  </div>
                ) : (
                  <div className="ielts-tutorials-grid">
                    {filteredTutorials.map((tut) => (
                      <div
                        key={tut.id}
                        className="ielts-tutorial-card"
                        onClick={() => setSelectedTutorialForView(tut)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="ielts-tutorial-thumbnail">
                          <div className="ielts-tutorial-play-btn">
                            <HiPlay size={24} style={{ marginLeft: '2px' }} />
                          </div>
                          <span className="ielts-tutorial-badge">{tut.category}</span>
                        </div>
                        <div className="ielts-tutorial-info">
                          <h4>{tut.title}</h4>
                          <p>{tut.description}</p>
                          <div className="ielts-tutorial-footer">
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              ⏱ {tut.duration} · 👤 {tut.instructor}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteTutorial(tut.id, e)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                              }}
                              title={language === 'en' ? 'Delete tutorial' : 'টিউটোরিয়াল মুছুন'}
                            >
                              <HiTrash size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Tutorial Modal */}
                {isAddingTutorial && (
                  <div className="ielts-clean-modal-overlay" onClick={() => setIsAddingTutorial(false)}>
                    <div className="ielts-clean-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                      <div className="ielts-clean-modal-header">
                        <h3>{language === 'en' ? 'Upload Writing Tutorial' : 'রাইটিং টিউটোরিয়াল আপলোড করুন'}</h3>
                        <button type="button" className="ielts-clean-modal-close" onClick={() => setIsAddingTutorial(false)}>
                          <HiX size={20} />
                        </button>
                      </div>
                      <form onSubmit={handleAddTutorial} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                            {language === 'en' ? 'Tutorial Title' : 'টিউটোরিয়াল শিরোনাম'} *
                          </label>
                          <input
                            type="text"
                            value={newTutTitle}
                            onChange={(e) => setNewTutTitle(e.target.value)}
                            placeholder={language === 'en' ? 'e.g. Task 1 Line Graph & Chart Analysis' : 'যেমনঃ টাস্ক ১ গ্রাফ ও চার্ট অ্যানালাইসিস'}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid rgba(192, 133, 82, 0.2)',
                              fontSize: '0.92rem',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                            required
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                              {language === 'en' ? 'Category' : 'ক্যাটাগরি'}
                            </label>
                            <select
                              value={newTutCategory}
                              onChange={(e) => setNewTutCategory(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1.5px solid rgba(192, 133, 82, 0.2)',
                                fontSize: '0.92rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            >
                              <option value="Task 1">Task 1</option>
                              <option value="Task 2">Task 2</option>
                              <option value="Strategy">Strategy & Criteria</option>
                              <option value="Vocabulary">Vocabulary</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                              {language === 'en' ? 'Estimated Duration' : 'সময়কাল'}
                            </label>
                            <input
                              type="text"
                              value={newTutDuration}
                              onChange={(e) => setNewTutDuration(e.target.value)}
                              placeholder="e.g. 20 mins"
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1.5px solid rgba(192, 133, 82, 0.2)',
                                fontSize: '0.92rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                            {language === 'en' ? 'Video Embed URL / Link' : 'ভিডিও লিঙ্ক / এমবেড ইউআরএল'}
                          </label>
                          <input
                            type="text"
                            value={newTutVideoUrl}
                            onChange={(e) => setNewTutVideoUrl(e.target.value)}
                            placeholder="e.g. https://www.youtube.com/embed/..."
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid rgba(192, 133, 82, 0.2)',
                              fontSize: '0.92rem',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '6px' }}>
                            {language === 'en' ? 'Tutorial Description & Key Takeaways' : 'বিবরণ ও মূল শিক্ষণীয় বিষয়'}
                          </label>
                          <textarea
                            rows={3}
                            value={newTutDescription}
                            onChange={(e) => setNewTutDescription(e.target.value)}
                            placeholder={language === 'en' ? 'Key concepts covered in this lesson...' : 'এই পাঠে আলোচিত মূল ধারণাগুলো...'}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid rgba(192, 133, 82, 0.2)',
                              fontSize: '0.92rem',
                              outline: 'none',
                              boxSizing: 'border-box',
                              resize: 'vertical'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => setIsAddingTutorial(false)}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '8px',
                              border: '1px solid rgba(75, 46, 43, 0.2)',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            {language === 'en' ? 'Cancel' : 'বাতিল'}
                          </button>
                          <button
                            type="submit"
                            style={{
                              padding: '10px 22px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'var(--sky-blue)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {language === 'en' ? 'Publish Tutorial' : 'টিউটোরিয়াল প্রকাশ করুন'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* View Tutorial Video Modal */}
                {selectedTutorialForView && (
                  <div className="ielts-clean-modal-overlay" onClick={() => setSelectedTutorialForView(null)}>
                    <div className="ielts-clean-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
                      <div className="ielts-clean-modal-header">
                        <div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sky-blue)', textTransform: 'uppercase' }}>
                            {selectedTutorialForView.category}
                          </span>
                          <h3 style={{ margin: '2px 0 0 0' }}>{selectedTutorialForView.title}</h3>
                        </div>
                        <button type="button" className="ielts-clean-modal-close" onClick={() => setSelectedTutorialForView(null)}>
                          <HiX size={20} />
                        </button>
                      </div>
                      <div style={{ padding: '24px' }}>
                        {selectedTutorialForView.videoUrl && (
                          <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: '12px', overflow: 'hidden', background: '#000', marginBottom: '16px' }}>
                            <iframe
                              src={selectedTutorialForView.videoUrl}
                              title={selectedTutorialForView.title}
                              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                              allowFullScreen
                            />
                          </div>
                        )}
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {selectedTutorialForView.description}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(192, 133, 82, 0.1)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>⏱ {selectedTutorialForView.duration}</span>
                          <span>Instructor: {selectedTutorialForView.instructor}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Option 2: Questions View */}
            {activeSubOption === 'questions' && (
              viewMode === 'bank' ? (
                <div style={{ width: '100%' }}>
                  <div className="ielts-bank-header">
                    <h3>{language === 'en' ? 'Available Question Sets' : 'বিদ্যমান প্রশ্ন সেটসমূহ'}</h3>
                    <button
                      type="button"
                      className="ielts-writing-submit-btn-cta"
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
                                <span>📝 Task 1 ({set.task1?.type}), Task 2 ({set.task2?.type})</span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                <button 
                                  type="button"
                                  className="ielts-view-clean-btn"
                                  style={{
                                    background: 'rgba(192, 133, 82, 0.08)',
                                    border: '1px solid rgba(192, 133, 82, 0.15)',
                                    color: 'var(--text-primary)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.82rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s',
                                  }}
                                >
                                  <span>{language === 'en' ? 'View Question Set' : 'প্রশ্ন বিবরণী দেখুন'}</span>
                                </button>

                                {(set.creator?._id === user.id || set.creator === user.id) && (
                                  <button 
                                    type="button"
                                    className="ielts-delete-set-btn"
                                    onClick={(e) => handleDeleteSet(set._id, e)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.08)',
                                      border: '1px solid rgba(239, 68, 68, 0.15)',
                                      color: '#ef4444',
                                      padding: '6px 10px',
                                      borderRadius: '8px',
                                      fontSize: '0.82rem',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      transition: 'all 0.2s',
                                    }}
                                    title={language === 'en' ? 'Delete' : 'মুছে ফেলুন'}
                                  >
                                    <HiTrash size={15} />
                                  </button>
                                )}
                              </div>
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
                              {/* Task 1 Section */}
                              <div className="ielts-clean-task-section">
                                <h4>Task 1 ({selectedSetForDetails.task1?.type === 'text' ? (language === 'en' ? 'Text' : 'টেক্সট') : selectedSetForDetails.task1?.type === 'pdf' ? 'PDF' : (language === 'en' ? 'Image' : 'ছবি')})</h4>
                                
                                <div className="ielts-original-prompt-container">
                                  {selectedSetForDetails.task1?.type === 'pdf' && selectedSetForDetails.task1?.pdfUrl && (
                                    <div className="ielts-modal-pdf-container">
                                      <iframe 
                                        src={getFullFileUrl(selectedSetForDetails.task1.pdfUrl)} 
                                        width="100%" 
                                        height="380px" 
                                        style={{ border: '1px solid rgba(192, 133, 82, 0.15)', borderRadius: '12px' }} 
                                        title="Task 1 PDF"
                                      />
                                    </div>
                                  )}

                                  {selectedSetForDetails.task1?.type === 'image' && selectedSetForDetails.task1?.imageUrl && (
                                    <div className="ielts-modal-image-container" style={{ textAlign: 'center' }}>
                                      <img 
                                        src={getFullFileUrl(selectedSetForDetails.task1.imageUrl)} 
                                        alt="Task 1 Prompt"
                                        style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '12px', border: '1px solid rgba(192, 133, 82, 0.15)' }} 
                                      />
                                    </div>
                                  )}

                                  {selectedSetForDetails.task1?.type === 'text' && (
                                    <div className="ielts-clean-prompt-box">
                                      {selectedSetForDetails.task1?.textPrompt}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Task 2 Section */}
                              <div className="ielts-clean-task-section" style={{ marginTop: '24px' }}>
                                <h4>Task 2 ({selectedSetForDetails.task2?.type === 'text' ? (language === 'en' ? 'Text' : 'টেক্সট') : selectedSetForDetails.task2?.type === 'pdf' ? 'PDF' : (language === 'en' ? 'Image' : 'ছবি')})</h4>
                                
                                <div className="ielts-original-prompt-container">
                                  {selectedSetForDetails.task2?.type === 'pdf' && selectedSetForDetails.task2?.pdfUrl && (
                                    <div className="ielts-modal-pdf-container">
                                      <iframe 
                                        src={getFullFileUrl(selectedSetForDetails.task2.pdfUrl)} 
                                        width="100%" 
                                        height="380px" 
                                        style={{ border: '1px solid rgba(192, 133, 82, 0.15)', borderRadius: '12px' }} 
                                        title="Task 2 PDF"
                                      />
                                    </div>
                                  )}

                                  {selectedSetForDetails.task2?.type === 'image' && selectedSetForDetails.task2?.imageUrl && (
                                    <div className="ielts-modal-image-container" style={{ textAlign: 'center' }}>
                                      <img 
                                        src={getFullFileUrl(selectedSetForDetails.task2.imageUrl)} 
                                        alt="Task 2 Prompt"
                                        style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '12px', border: '1px solid rgba(192, 133, 82, 0.15)' }} 
                                      />
                                    </div>
                                  )}

                                  {selectedSetForDetails.task2?.type === 'text' && (
                                    <div className="ielts-clean-prompt-box">
                                      {selectedSetForDetails.task2?.textPrompt}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* viewMode === 'upload': Upload Form */
                <div style={{ width: '100%' }}>
                  <div className="ielts-bank-header">
                    <h3>{language === 'en' ? 'Upload New Writing Question Set' : 'নতুন রাইটিং প্রশ্ন সেট আপলোড করুন'}</h3>
                    <button
                      type="button"
                      className="ielts-view-clean-btn"
                      style={{
                        background: 'rgba(192, 133, 82, 0.08)',
                        border: '1px solid rgba(192, 133, 82, 0.15)',
                        color: 'var(--text-primary)',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.88rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                      onClick={() => setViewMode('bank')}
                    >
                      {language === 'en' ? '← Back to Question Bank' : '← প্রশ্ন ব্যাংকে ফিরে যান'}
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="ielts-writing-upload-form">
                    {/* Set Name Input */}
                    <div className="ielts-writing-form-group">
                      <label className="ielts-writing-label">
                        {language === 'en' ? 'Question Set Name' : 'প্রশ্ন সেটের নাম'}
                        <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        value={setName}
                        onChange={(e) => setSetName(e.target.value)}
                        placeholder={
                          language === 'en'
                            ? 'e.g. Cambridge IELTS 19 - Test 1'
                            : 'যেমনঃ কেমব্রিজ আইইএলটিএস ১৯ - টেস্ট ১'
                        }
                        className="ielts-writing-input"
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Task 1 & Task 2 Columns */}
                    <div className="ielts-writing-tasks-container">
                      {/* Task 1 Box */}
                      <div className="ielts-writing-task-card">
                        <div className="ielts-writing-task-header">
                          <span className="ielts-writing-task-badge">Task 1</span>
                          <span className="ielts-writing-task-subtitle">
                            {language === 'en' ? 'Report / Summary (150+ words)' : 'রিপোর্ট / সারসংক্ষেপ (১৫০+ শব্দ)'}
                          </span>
                        </div>

                        {/* Format Tabs */}
                        <div className="ielts-writing-format-tabs">
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task1Type === 'text' ? 'active' : ''}`}
                            onClick={() => setTask1Type('text')}
                          >
                            <HiPencilAlt size={16} />
                            <span>{language === 'en' ? 'Text' : 'টেক্সট'}</span>
                          </button>
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task1Type === 'pdf' ? 'active' : ''}`}
                            onClick={() => setTask1Type('pdf')}
                          >
                            <HiDocumentText size={16} />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task1Type === 'image' ? 'active' : ''}`}
                            onClick={() => setTask1Type('image')}
                          >
                            <HiPhotograph size={16} />
                            <span>{language === 'en' ? 'Picture' : 'ছবি'}</span>
                          </button>
                        </div>

                        {/* Task 1 Input Body */}
                        {task1Type === 'text' && (
                          <div className="ielts-writing-input-area">
                            <textarea
                              value={task1Text}
                              onChange={(e) => setTask1Text(e.target.value)}
                              placeholder={
                                language === 'en'
                                  ? 'Enter Task 1 instructions, chart descriptions or topic prompt...'
                                  : 'টাস্ক ১ এর নির্দেশনা বা প্রশ্নের বিবরণ লিখুন...'
                              }
                              className="ielts-writing-textarea"
                              rows={8}
                              disabled={isSubmitting}
                            />
                          </div>
                        )}

                        {task1Type === 'pdf' && (
                          <div className="ielts-writing-file-upload-area">
                            {task1Pdf ? (
                              <div className="ielts-writing-file-preview">
                                <HiDocumentText size={32} className="ielts-writing-file-icon active" />
                                <span className="ielts-writing-file-name">{task1Pdf.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(1, 'pdf')}
                                  className="ielts-writing-remove-file-btn"
                                  title={language === 'en' ? 'Remove PDF' : 'পিডিএফ মুছুন'}
                                >
                                  <HiTrash size={16} />
                                </button>
                              </div>
                            ) : (
                              <label className="ielts-writing-file-dropzone">
                                <HiDocumentText size={36} className="ielts-writing-file-icon" />
                                <span className="ielts-writing-file-label">
                                  {language === 'en' ? 'Upload Task 1 PDF' : 'টাস্ক ১ পিডিএফ আপলোড করুন'}
                                </span>
                                <span className="ielts-writing-file-sublabel">(.pdf)</span>
                                <input
                                  type="file"
                                  accept=".pdf"
                                  onChange={(e) => handleFileChange(1, 'pdf', e.target.files[0])}
                                  className="ielts-writing-file-input"
                                  disabled={isSubmitting}
                                />
                              </label>
                            )}
                          </div>
                        )}

                        {task1Type === 'image' && (
                          <div className="ielts-writing-file-upload-area">
                            {task1Image ? (
                              <div className="ielts-writing-file-preview image-preview-wrapper">
                                <img
                                  src={URL.createObjectURL(task1Image)}
                                  alt="Task 1 Preview"
                                  className="ielts-writing-image-preview"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(1, 'image')}
                                  className="ielts-writing-remove-file-btn"
                                  title={language === 'en' ? 'Remove Image' : 'ছবি মুছুন'}
                                >
                                  <HiTrash size={16} />
                                </button>
                              </div>
                            ) : (
                              <label className="ielts-writing-file-dropzone">
                                <HiPhotograph size={36} className="ielts-writing-file-icon" />
                                <span className="ielts-writing-file-label">
                                  {language === 'en' ? 'Upload Task 1 Picture' : 'টাস্ক ১ ছবি আপলোড করুন'}
                                </span>
                                <span className="ielts-writing-file-sublabel">(.png, .jpg, .jpeg, .webp, .gif)</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleFileChange(1, 'image', e.target.files[0])}
                                  className="ielts-writing-file-input"
                                  disabled={isSubmitting}
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Task 2 Box */}
                      <div className="ielts-writing-task-card">
                        <div className="ielts-writing-task-header">
                          <span className="ielts-writing-task-badge">Task 2</span>
                          <span className="ielts-writing-task-subtitle">
                            {language === 'en' ? 'Essay (250+ words)' : 'প্রবন্ধ (২৫০+ শব্দ)'}
                          </span>
                        </div>

                        {/* Format Tabs */}
                        <div className="ielts-writing-format-tabs">
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task2Type === 'text' ? 'active' : ''}`}
                            onClick={() => setTask2Type('text')}
                          >
                            <HiPencilAlt size={16} />
                            <span>{language === 'en' ? 'Text' : 'টেক্সট'}</span>
                          </button>
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task2Type === 'pdf' ? 'active' : ''}`}
                            onClick={() => setTask2Type('pdf')}
                          >
                            <HiDocumentText size={16} />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            className={`ielts-writing-tab-btn ${task2Type === 'image' ? 'active' : ''}`}
                            onClick={() => setTask2Type('image')}
                          >
                            <HiPhotograph size={16} />
                            <span>{language === 'en' ? 'Picture' : 'ছবি'}</span>
                          </button>
                        </div>

                        {/* Task 2 Input Body */}
                        {task2Type === 'text' && (
                          <div className="ielts-writing-input-area">
                            <textarea
                              value={task2Text}
                              onChange={(e) => setTask2Text(e.target.value)}
                              placeholder={
                                language === 'en'
                                  ? 'Enter Task 2 essay topic, prompt statement, and discussion requirements...'
                                  : 'টাস্ক ২ এর প্রবন্ধের বিষয় ও নির্দেশনা লিখুন...'
                              }
                              className="ielts-writing-textarea"
                              rows={8}
                              disabled={isSubmitting}
                            />
                          </div>
                        )}

                        {task2Type === 'pdf' && (
                          <div className="ielts-writing-file-upload-area">
                            {task2Pdf ? (
                              <div className="ielts-writing-file-preview">
                                <HiDocumentText size={32} className="ielts-writing-file-icon active" />
                                <span className="ielts-writing-file-name">{task2Pdf.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(2, 'pdf')}
                                  className="ielts-writing-remove-file-btn"
                                  title={language === 'en' ? 'Remove PDF' : 'পিডিএফ মুছুন'}
                                >
                                  <HiTrash size={16} />
                                </button>
                              </div>
                            ) : (
                              <label className="ielts-writing-file-dropzone">
                                <HiDocumentText size={36} className="ielts-writing-file-icon" />
                                <span className="ielts-writing-file-label">
                                  {language === 'en' ? 'Upload Task 2 PDF' : 'টাস্ক ২ পিডিএফ আপলোড করুন'}
                                </span>
                                <span className="ielts-writing-file-sublabel">(.pdf)</span>
                                <input
                                  type="file"
                                  accept=".pdf"
                                  onChange={(e) => handleFileChange(2, 'pdf', e.target.files[0])}
                                  className="ielts-writing-file-input"
                                  disabled={isSubmitting}
                                />
                              </label>
                            )}
                          </div>
                        )}

                        {task2Type === 'image' && (
                          <div className="ielts-writing-file-upload-area">
                            {task2Image ? (
                              <div className="ielts-writing-file-preview image-preview-wrapper">
                                <img
                                  src={URL.createObjectURL(task2Image)}
                                  alt="Task 2 Preview"
                                  className="ielts-writing-image-preview"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(2, 'image')}
                                  className="ielts-writing-remove-file-btn"
                                  title={language === 'en' ? 'Remove Image' : 'ছবি মুছুন'}
                                >
                                  <HiTrash size={16} />
                                </button>
                              </div>
                            ) : (
                              <label className="ielts-writing-file-dropzone">
                                <HiPhotograph size={36} className="ielts-writing-file-icon" />
                                <span className="ielts-writing-file-label">
                                  {language === 'en' ? 'Upload Task 2 Picture' : 'টাস্ক ২ ছবি আপলোড করুন'}
                                </span>
                                <span className="ielts-writing-file-sublabel">(.png, .jpg, .jpeg, .webp, .gif)</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleFileChange(2, 'image', e.target.files[0])}
                                  className="ielts-writing-file-input"
                                  disabled={isSubmitting}
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit Question Set Button */}
                    <div className="ielts-writing-submit-container">
                      <button
                        type="submit"
                        className="ielts-writing-submit-btn-cta"
                        disabled={isSubmitting}
                      >
                        <HiCheckCircle size={22} />
                        <span>
                          {isSubmitting
                            ? (language === 'en' ? 'Submitting Question Set...' : 'প্রশ্ন সেট সাবমিট হচ্ছে...')
                            : (language === 'en' ? 'Submit Question Set' : 'প্রশ্ন সেট সাবমিট করুন')}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

