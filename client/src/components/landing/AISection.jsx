import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useLanguage } from '../../hooks/useLanguage';
import { HiOutlineDocumentText, HiOutlineAdjustments, HiOutlineLightningBolt } from 'react-icons/hi';
import AiIcon from '../common/AiIcon';
import './AISection.css';

const CHAT_MESSAGES = [
  { role: 'user', key: 'আমাকে SN1 vs SN2 reaction এর পার্থক্য বুঝিয়ে দাও' },
  { role: 'ai', key: 'চলো ভাবি! প্রথমে বলো — একটি nucleophile যখন carbon কে attack করে, তখন কি leaving group আগে চলে যায়, নাকি একই সাথে?' },
  { role: 'user', key: 'আমার মনে হয় দুইভাবেই হতে পারে...' },
  { role: 'ai', key: 'একদম ঠিক! যখন leaving group আগে চলে যায় → carbocation তৈরি হয় → তখন SN1। আর যখন একই ধাপে nucleophile attack + leaving → SN2। এখন বলো, কোন ক্ষেত্রে tertiary carbon ভালো কাজ করবে?' },
];

export default function AISection() {
  const { t } = useLanguage();
  const { ref, inView } = useInView({ threshold: 0.2, triggerOnce: true });
  const [visibleMessages, setVisibleMessages] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const interval = setInterval(() => {
      setVisibleMessages(prev => {
        if (prev >= CHAT_MESSAGES.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [inView]);

  const features = [
    { icon: <AiIcon size={20} />, title: t('ai.tutor'), color: '#8B5CF6' },
    { icon: <HiOutlineDocumentText />, title: t('ai.evaluator'), color: '#3B82F6' },
    { icon: <HiOutlineAdjustments />, title: t('ai.adaptive'), color: '#10B981' },
    { icon: <HiOutlineLightningBolt />, title: t('ai.question_maker'), color: '#F59E0B' },
  ];

  return (
    <section className="ai-section section" id="ai" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="section-title">{t('ai.title')}</h2>
          <p className="section-subtitle">{t('ai.subtitle')}</p>
        </motion.div>

        <div className="ai-section__layout">
          <motion.div
            className="ai-section__chat"
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            <div className="ai-section__chat-header">
              <div className="ai-section__chat-avatar">
                <AiIcon themeColors style={{ width: '100%', height: '100%' }} className="ai-section__chat-avatar-svg" />
              </div>
              <div>
                <span className="ai-section__chat-name">TopKorbo AI Tutor</span>
                <span className="ai-section__chat-status">Online</span>
              </div>
            </div>
            <div className="ai-section__chat-body">
              {CHAT_MESSAGES.slice(0, visibleMessages).map((msg, i) => (
                <motion.div
                  key={i}
                  className={`ai-section__message ai-section__message--${msg.role}`}
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  {msg.key}
                </motion.div>
              ))}
              {visibleMessages < CHAT_MESSAGES.length && visibleMessages > 0 && (
                <div className="ai-section__typing">
                  <span className="ai-section__typing-dot"></span>
                  <span className="ai-section__typing-dot"></span>
                  <span className="ai-section__typing-dot"></span>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            className="ai-section__features"
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.5, duration: 0.7 }}
          >
            {features.map((f, i) => (
              <div className="ai-section__feature-badge" key={i}>
                <span className="ai-section__feature-icon" style={{ color: f.color, background: f.color + '12' }}>
                  {f.icon}
                </span>
                <span className="ai-section__feature-label">{f.title}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
