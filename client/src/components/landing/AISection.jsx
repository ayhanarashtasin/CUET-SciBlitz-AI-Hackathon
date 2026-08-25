import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import {
  HiOutlineArrowRight,
  HiOutlineBookOpen,
  HiOutlineCalendar,
  HiOutlineChatAlt2,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { useLanguage } from '../../hooks/useLanguage';
import AiIcon from '../common/AiIcon';
import './AISection.css';

const CAPABILITY_CONFIG = [
  {
    id: 'question',
    Icon: HiOutlineChatAlt2,
    href: '/qbank',
  },
  {
    id: 'evaluation',
    Icon: HiOutlineDocumentText,
    href: '/mock-test',
  },
  {
    id: 'reading',
    Icon: HiOutlineBookOpen,
    href: '/reading-books',
  },
  {
    id: 'routine',
    Icon: HiOutlineCalendar,
    href: '/study-routine',
  },
];

export default function AISection() {
  const { t } = useLanguage();
  const { ref, inView } = useInView({ threshold: 0.16, triggerOnce: true });
  const prefersReducedMotion = useReducedMotion();
  const tabRefs = useRef([]);
  const [activeId, setActiveId] = useState(CAPABILITY_CONFIG[0].id);
  const [displayedPrompt, setDisplayedPrompt] = useState('');
  const [displayedReply, setDisplayedReply] = useState('');
  const [phase, setPhase] = useState('STUDENT_TYPING'); // 'STUDENT_TYPING' | 'STUDENT_SENT' | 'AI_THINKING' | 'AI_TYPING' | 'COMPLETE'
  const [replayKey, setReplayKey] = useState(0);

  const capabilities = CAPABILITY_CONFIG.map((capability) => ({
    ...capability,
    title: t(`ai.capability.${capability.id}.title`),
    description: t(`ai.capability.${capability.id}.description`),
    context: t(`ai.capability.${capability.id}.context`),
    prompt: t(`ai.capability.${capability.id}.prompt`),
    reply: t(`ai.capability.${capability.id}.reply`),
    tags: [1, 2, 3].map((number) => t(`ai.capability.${capability.id}.tag_${number}`)),
    action: t(`ai.capability.${capability.id}.action`),
  }));

  const activeCapability = capabilities.find(({ id }) => id === activeId) || capabilities[0];

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedPrompt(activeCapability.prompt);
      setDisplayedReply(activeCapability.reply);
      setPhase('COMPLETE');
      return;
    }

    if (!inView) return;

    let isMounted = true;
    let timerId = null;
    const fullPrompt = activeCapability.prompt || '';
    const fullReply = activeCapability.reply || '';

    // Step 0: Reset states
    setDisplayedPrompt('');
    setDisplayedReply('');
    setPhase('STUDENT_TYPING');

    let promptIndex = 0;
    let replyIndex = 0;

    // Step 1: Live type student prompt
    const typePromptChar = () => {
      if (!isMounted) return;
      if (promptIndex < fullPrompt.length) {
        promptIndex += 1;
        setDisplayedPrompt(fullPrompt.slice(0, promptIndex));

        const char = fullPrompt[promptIndex - 1];
        const delay = (char === '?' || char === '.' || char === '!' || char === '।')
          ? 90
          : (char === ',' || char === ';')
          ? 45
          : (char === ' ')
          ? 22
          : 15;

        timerId = setTimeout(typePromptChar, delay);
      } else {
        // Step 2: Student message sent
        setPhase('STUDENT_SENT');
        timerId = setTimeout(startAiThinking, 280);
      }
    };

    // Step 3: AI Tutor analyzes & prepares response
    const startAiThinking = () => {
      if (!isMounted) return;
      setPhase('AI_THINKING');
      timerId = setTimeout(startAiTyping, 420);
    };

    // Step 4: AI Tutor streams response
    const startAiTyping = () => {
      if (!isMounted) return;
      setPhase('AI_TYPING');

      const typeReplyChar = () => {
        if (!isMounted) return;
        if (replyIndex < fullReply.length) {
          replyIndex += 1;
          setDisplayedReply(fullReply.slice(0, replyIndex));

          const char = fullReply[replyIndex - 1];
          const delay = (char === '.' || char === '?' || char === '!' || char === '।')
            ? 110
            : (char === ',' || char === ';' || char === ':')
            ? 50
            : (char === ' ')
            ? 22
            : 16;

          timerId = setTimeout(typeReplyChar, delay);
        } else {
          // Step 5: Finished
          setPhase('COMPLETE');
        }
      };

      typeReplyChar();
    };

    // Short initial delay before student starts typing
    timerId = setTimeout(typePromptChar, 100);

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [activeCapability.prompt, activeCapability.reply, activeId, inView, prefersReducedMotion, replayKey]);

  const selectTab = (index) => {
    const nextCapability = capabilities[index];
    if (!nextCapability) return;
    if (nextCapability.id === activeId) {
      setReplayKey((prev) => prev + 1);
    } else {
      setActiveId(nextCapability.id);
    }
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex = null;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % capabilities.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + capabilities.length) % capabilities.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = capabilities.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(nextIndex);
  };

  const revealFromBelow = prefersReducedMotion
    ? { initial: false, animate: {} }
    : {
        initial: { opacity: 0, y: 24 },
        animate: inView ? { opacity: 1, y: 0 } : {},
      };

  return (
    <section className="ai-section section" id="ai" ref={ref} aria-labelledby="ai-section-title">
      <div className="container">
        <motion.div
          className="ai-section__heading"
          {...revealFromBelow}
          transition={{ duration: 0.55 }}
        >
          <span className="ai-section__eyebrow">
            <AiIcon size={18} aria-hidden="true" />
            {t('ai.eyebrow')}
          </span>
          <h2 className="section-title" id="ai-section-title">{t('ai.title')}</h2>
          <p className="section-subtitle">{t('ai.subtitle')}</p>
        </motion.div>

        <div className="ai-section__layout">
          <motion.div
            className="ai-section__capabilities"
            role="tablist"
            aria-label={t('ai.capabilities_label')}
            aria-orientation="vertical"
            {...revealFromBelow}
            transition={{ delay: prefersReducedMotion ? 0 : 0.08, duration: 0.55 }}
          >
            {capabilities.map(({ id, Icon, title, description }, index) => {
              const isActive = id === activeCapability.id;

              return (
                <button
                  className={`ai-section__capability ai-section__capability--${id}${isActive ? ' is-active' : ''}`}
                  id={`ai-capability-tab-${id}`}
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="ai-capability-panel"
                  tabIndex={isActive ? 0 : -1}
                  ref={(node) => { tabRefs.current[index] = node; }}
                  onClick={() => setActiveId(id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  <span className="ai-section__capability-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="ai-section__capability-copy">
                    <span className="ai-section__capability-title">{title}</span>
                    <span className="ai-section__capability-description">{description}</span>
                  </span>
                  <HiOutlineArrowRight className="ai-section__capability-arrow" aria-hidden="true" />
                </button>
              );
            })}
          </motion.div>

          <motion.div
            className="ai-section__workspace"
            {...revealFromBelow}
            transition={{ delay: prefersReducedMotion ? 0 : 0.16, duration: 0.6 }}
          >
            <div className="ai-section__workspace-header">
              <div className="ai-section__workspace-identity">
                <span className="ai-section__workspace-avatar">
                  <AiIcon themeColors size={32} aria-hidden="true" />
                </span>
                <span>
                  <strong>{t('ai.preview_title')}</strong>
                  <small>{t('ai.preview_subtitle')}</small>
                </span>
              </div>
              <span className="ai-section__implemented-badge">
                <HiOutlineCheckCircle aria-hidden="true" />
                {t('ai.implemented')}
              </span>
            </div>

            <motion.div
              className="ai-section__workspace-body"
              id="ai-capability-panel"
              key={activeCapability.id}
              role="tabpanel"
              aria-labelledby={`ai-capability-tab-${activeCapability.id}`}
              aria-live="polite"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="ai-section__context-rail">
                <span>{t('ai.context_label')}</span>
                <strong>{activeCapability.context}</strong>
              </div>

              <div className="ai-section__conversation" aria-label={t('ai.example_label')}>
                {/* Student message with live typing */}
                <div className={`ai-section__message ai-section__message--user${phase === 'STUDENT_TYPING' ? ' is-typing' : ''}`}>
                  <div className="ai-section__message-meta">
                    <span className="ai-section__message-author ai-section__message-author--user">
                      {t('ai.student_label')}
                    </span>
                    {phase === 'STUDENT_TYPING' && (
                      <span className="ai-section__user-typing-badge" aria-hidden="true">
                        <span>Typing</span>
                        <span className="ai-section__dots-mini">...</span>
                      </span>
                    )}
                    {phase !== 'STUDENT_TYPING' && (
                      <span className="ai-section__sent-badge" aria-hidden="true">
                        <HiOutlineCheck size={12} />
                        <span>Sent</span>
                      </span>
                    )}
                  </div>
                  <p>
                    {displayedPrompt}
                    {phase === 'STUDENT_TYPING' && (
                      <span className="ai-section__cursor ai-section__cursor--user" aria-hidden="true" />
                    )}
                  </p>
                </div>

                {/* AI Tutor message appearing after student sends */}
                {(phase !== 'STUDENT_TYPING' || prefersReducedMotion) && (
                  <motion.div
                    className={`ai-section__message ai-section__message--ai${phase === 'AI_TYPING' ? ' is-streaming' : ''}`}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                  >
                    <div className="ai-section__message-meta">
                      <span className="ai-section__message-author">
                        <AiIcon size={15} aria-hidden="true" />
                        {t('ai.tutor_label')}
                      </span>
                      {phase === 'AI_TYPING' && (
                        <span className="ai-section__live-badge" aria-hidden="true">
                          <span className="ai-section__live-dot" />
                          <span>Live Typing</span>
                        </span>
                      )}
                      {phase === 'COMPLETE' && (
                        <button
                          type="button"
                          className="ai-section__replay-btn"
                          onClick={() => setReplayKey((prev) => prev + 1)}
                          title="Replay full interaction"
                          aria-label="Replay full conversation demo"
                        >
                          <HiOutlineRefresh aria-hidden="true" />
                          <span>Replay</span>
                        </button>
                      )}
                    </div>

                    {phase === 'AI_THINKING' ? (
                      <div className="ai-section__typing-indicator" aria-label="AI Tutor is thinking">
                        <span className="ai-section__typing-dot" />
                        <span className="ai-section__typing-dot" />
                        <span className="ai-section__typing-dot" />
                      </div>
                    ) : (
                      <p>
                        {displayedReply}
                        {phase === 'AI_TYPING' && (
                          <span className="ai-section__cursor" aria-hidden="true" />
                        )}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="ai-section__grounding">
                <span className="ai-section__grounding-label">{t('ai.uses_label')}</span>
                <div className="ai-section__tags">
                  {activeCapability.tags.map((tag) => (
                    <span className="ai-section__tag" key={tag}>{tag}</span>
                  ))}
                </div>
              </div>

              <Link className="ai-section__action" to={activeCapability.href}>
                {activeCapability.action}
                <HiOutlineArrowRight aria-hidden="true" />
              </Link>
            </motion.div>
          </motion.div>
        </div>

        <p className="ai-section__access-note">{t('ai.access_note')}</p>
      </div>
    </section>
  );
}
