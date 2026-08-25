import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';
import { getAuthToken } from '../../utils/authStorage';
import { HiArrowRight, HiPlay } from 'react-icons/hi';
import { FiUsers, FiBookOpen, FiAward } from 'react-icons/fi';
import './HeroSection.css';

export default function HeroSection() {
  const { t } = useLanguage();
  const isLoggedIn = Boolean(getAuthToken());
  const prefersReducedMotion = useReducedMotion();

  const wordVariants = {
    hidden: prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: prefersReducedMotion ? { duration: 0 } : { delay: 0.3 + i * 0.15, duration: 0.6, ease: [0.4, 0, 0.2, 1] }
    })
  };

  const trustItems = [
    { icon: <FiUsers aria-hidden="true" />, label: t('hero.trust_students') },
    { icon: <FiBookOpen aria-hidden="true" />, label: t('hero.trust_questions') },
    { icon: <FiAward aria-hidden="true" />, label: t('hero.trust_universities') },
  ];

  return (
    <section className="hero" id="hero" aria-label="Hero Introduction">
      {/* Decorative shapes */}
      <div className="hero__shapes" aria-hidden="true">
        <div className="hero__shape hero__shape--1"></div>
        <div className="hero__shape hero__shape--2"></div>
        <div className="hero__shape hero__shape--3"></div>
        <div className="hero__shape hero__shape--4"></div>
        <div className="hero__shape hero__shape--5"></div>
      </div>

      <div className="container hero__container">
        <motion.div
          className="hero__content"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* Title */}
          <h1 className="hero__title">
            <motion.span custom={0} variants={wordVariants} initial="hidden" animate="visible">
              {t('hero.title_1')}{' '}
            </motion.span>
            <motion.span custom={1} variants={wordVariants} initial="hidden" animate="visible" className="gradient-text">
              {t('hero.title_2')}{' '}
            </motion.span>
            <motion.span custom={2} variants={wordVariants} initial="hidden" animate="visible">
              {t('hero.title_3')}
            </motion.span>
          </h1>

          {/* Subtitle */}
          <motion.p
            className="hero__subtitle"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.7, duration: 0.6 }}
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="hero__ctas"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.9, duration: 0.6 }}
          >
            {isLoggedIn ? (
              <button
                type="button"
                className="btn btn-primary btn-lg hero__cta-primary hero__cta-primary--disabled"
                disabled
              >
                {t('hero.cta_primary')}
                <HiArrowRight aria-hidden="true" />
              </button>
            ) : (
              <Link to="/signup" className="btn btn-primary btn-lg hero__cta-primary">
                {t('hero.cta_primary')}
                <HiArrowRight aria-hidden="true" />
              </Link>
            )}
            <a 
              href="#features" 
              className="btn btn-secondary btn-lg hero__cta-secondary"
              aria-label="Explore TopKorbo Features"
            >
              <HiPlay aria-hidden="true" />
              {t('hero.cta_secondary')}
            </a>
          </motion.div>

          {/* Trust Strip */}
          <motion.div
            className="hero__trust"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 1.1, duration: 0.6 }}
          >
            {trustItems.map((item, i) => (
              <div className="hero__trust-item" key={i}>
                <span className="hero__trust-icon">{item.icon}</span>
                <span className="hero__trust-label">{item.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Rating mockup card */}
        <motion.div
          className="hero__visual"
          initial={prefersReducedMotion ? false : { opacity: 0, x: 60, rotateY: -10 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.6, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          aria-label="Student ranking mockup"
        >
          <div className="hero__rating-card glass-card">
            <div className="hero__rating-header">
              <div className="hero__rating-avatar" aria-hidden="true">🎓</div>
              <div>
                <div className="hero__rating-name">Rafiq Ahmed</div>
                <div className="hero__rating-institution">Notre Dame College</div>
              </div>
            </div>
            <div className="hero__rating-stats">
              <div className="hero__rating-current">
                <span className="hero__rating-label">Rating</span>
                <span className="hero__rating-value">1847</span>
                <span className="hero__rating-rank badge badge-blue">Expert</span>
              </div>
              <motion.div
                className="hero__rating-delta"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: 1.5, duration: 0.5 }}
              >
                <span className="hero__delta-positive">▲ +253</span>
                <span className="hero__delta-arrow" aria-hidden="true">→</span>
                <span className="hero__rating-new">2100</span>
                <span className="badge badge-warm">Master</span>
              </motion.div>
            </div>
            <div className="hero__rating-bar">
              <motion.div
                className="hero__rating-fill"
                initial={prefersReducedMotion ? { width: '78%' } : { width: '0%' }}
                animate={{ width: '78%' }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: 1.2, duration: 1.5, ease: 'easeOut' }}
              />
            </div>
            <div className="hero__streak">
              <span><span aria-hidden="true">🔥 </span>14 Day Streak</span>
              <span className="hero__streak-grid" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className="hero__streak-dot hero__streak-dot--active" />
                ))}
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className="hero__streak-dot" />
                ))}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
