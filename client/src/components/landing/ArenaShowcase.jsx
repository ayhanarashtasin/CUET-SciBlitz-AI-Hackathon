import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useLanguage } from '../../hooks/useLanguage';
import { HiOutlineTrendingUp, HiOutlineChartBar, HiOutlineFire, HiOutlineStatusOnline } from 'react-icons/hi';
import './ArenaShowcase.css';

const LEADERBOARD = [
  { rank: 1, name: 'Tasnim Akter', rating: 2341, division: 'Grandmaster', delta: '+45', color: '#dc2626' },
  { rank: 2, name: 'Arif Hossain', rating: 2198, division: 'Master', delta: '+32', color: '#f59e0b' },
  { rank: 3, name: 'Nusrat Jahan', rating: 2067, division: 'Master', delta: '+18', color: '#f59e0b' },
  { rank: 4, name: 'Rafiq Ahmed', rating: 1847, division: 'Expert', delta: '+57', color: '#3b82f6' },
  { rank: 5, name: 'Mithila Das', rating: 1756, division: 'Expert', delta: '-12', color: '#3b82f6' },
  { rank: 6, name: 'Sabbir Khan', rating: 1623, division: 'Specialist', delta: '+25', color: '#22c55e' },
  { rank: 7, name: 'Fatema Begum', rating: 1589, division: 'Specialist', delta: '+8', color: '#22c55e' },
];

export default function ArenaShowcase() {
  const { t } = useLanguage();
  const { ref, inView } = useInView({ threshold: 0.2, triggerOnce: true });
  const [activeRows, setActiveRows] = useState(LEADERBOARD);

  useEffect(() => {
    if (!inView) return;
    const interval = setInterval(() => {
      setActiveRows(prev => {
        const arr = [...prev];
        const i = Math.floor(Math.random() * (arr.length - 1)) + 1;
        if (i > 0) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        return arr.map((item, idx) => ({ ...item, rank: idx + 1 }));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [inView]);

  const featureCards = [
    { icon: <HiOutlineTrendingUp />, title: t('arena.rating_system'), desc: t('arena.rating_desc') },
    { icon: <HiOutlineChartBar />, title: t('arena.divisions'), desc: t('arena.divisions_desc') },
    { icon: <HiOutlineFire />, title: t('arena.streaks'), desc: t('arena.streaks_desc') },
    { icon: <HiOutlineStatusOnline />, title: t('arena.live'), desc: t('arena.live_desc') },
  ];

  return (
    <section className="arena section" id="arena" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="section-title">{t('arena.title')}</h2>
          <p className="section-subtitle">{t('arena.subtitle')}</p>
        </motion.div>

        <div className="arena__layout">
          <motion.div
            className="arena__leaderboard"
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            <div className="arena__board-header">
              <span className="arena__board-title">Live Standings</span>
              <span className="arena__board-live">
                <span className="arena__live-dot"></span>
                LIVE
              </span>
            </div>
            <div className="arena__board-body">
              {activeRows.map((row) => (
                <motion.div
                  key={row.name}
                  className="arena__row"
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <span className="arena__rank">#{row.rank}</span>
                  <span className="arena__name">{row.name}</span>
                  <span className="arena__rating">{row.rating}</span>
                  <span className="arena__division" style={{ color: row.color, borderColor: row.color + '30', background: row.color + '10' }}>
                    {row.division}
                  </span>
                  <span className={`arena__delta ${row.delta.startsWith('+') ? 'arena__delta--up' : 'arena__delta--down'}`}>
                    {row.delta}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="arena__features"
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.5, duration: 0.7 }}
          >
            {featureCards.map((card, i) => (
              <div className="arena__feature-card" key={i}>
                <span className="arena__feature-icon">{card.icon}</span>
                <div>
                  <h4 className="arena__feature-title">{card.title}</h4>
                  <p className="arena__feature-desc">{card.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
