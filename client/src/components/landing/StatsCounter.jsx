import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useLanguage } from '../../hooks/useLanguage';
import { FiUsers, FiBookOpen, FiAward, FiStar } from 'react-icons/fi';
import './StatsCounter.css';

const DEFAULT_STATS = {
  students: 52480,
  questions: 128750,
  contests: 1240,
  mentors: 385
};

function AnimatedNumber({ target, duration = 2000, inView, prefersReducedMotion }) {
  const [count, setCount] = useState(prefersReducedMotion ? target : 0);
  const started = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      setCount(target);
      return;
    }
    if (!inView || started.current) return;
    started.current = true;
    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration, prefersReducedMotion]);

  return <span>{count.toLocaleString()}</span>;
}

export default function StatsCounter() {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({ threshold: 0.3, triggerOnce: true });
  const [liveData, setLiveData] = useState(DEFAULT_STATS);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    fetch(`${apiUrl}/landing/stats`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (json?.data) {
          setLiveData(json.data);
        }
      })
      .catch(() => {
        // Fallback gracefully to default numbers on network error or offline mode
      });

    return () => controller.abort();
  }, []);

  const stats = [
    { icon: <FiUsers aria-hidden="true" />, value: liveData.students, label: t('stats.students'), suffix: '+' },
    { icon: <FiBookOpen aria-hidden="true" />, value: liveData.questions, label: t('stats.questions'), suffix: '+' },
    { icon: <FiAward aria-hidden="true" />, value: liveData.contests, label: t('stats.contests'), suffix: '+' },
    { icon: <FiStar aria-hidden="true" />, value: liveData.mentors, label: t('stats.mentors'), suffix: '+' },
  ];

  return (
    <section className="stats" ref={ref} id="stats" aria-label="TopKorbo Platform Statistics">
      <div className="container">
        <div className="stats__grid">
          {stats.map((stat, i) => (
            <div className="stats__item" key={i}>
              <span className="stats__icon">{stat.icon}</span>
              <span className="stats__value">
                <AnimatedNumber 
                  target={stat.value} 
                  inView={inView} 
                  prefersReducedMotion={prefersReducedMotion} 
                />
                {stat.suffix}
              </span>
              <span className="stats__label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
