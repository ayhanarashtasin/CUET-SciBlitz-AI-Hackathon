import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useLanguage } from '../../hooks/useLanguage';
import { GiSwordClash, GiShield, GiCastle, GiSpikyExplosion } from 'react-icons/gi';
import { FaUserGraduate, FaFire, FaAtom, FaBullseye, FaBomb, FaShieldAlt, FaCrown, FaBolt, FaFlask } from 'react-icons/fa';
import './BattleArena.css';

const SQUAD_ALPHA = [
  { name: 'Tasnim A.', variant: 'blue' },
  { name: 'Ayesha B.', variant: 'pink' },
  { name: 'Sajjad K.', variant: 'green' },
  { name: 'Maria T.', variant: 'purple' },
  { name: 'Fahim M.', variant: 'orange' }
];

const SQUAD_OMEGA = [
  { name: 'Rafiq H.', variant: 'orange' },
  { name: 'Farhana Y.', variant: 'pink' },
  { name: 'Nabil S.', variant: 'blue' },
  { name: 'Tanvir R.', variant: 'teal' },
  { name: 'Sadia Z.', variant: 'purple' }
];

const RAID_EVENTS = [
  { text: "Tasnim A. is on a 5-streak!", type: "streak" },
  { text: "Rafiq H. solved a hard Physics question!", type: "physics" },
  { text: "Ayesha B. earned double points!", type: "points" },
  { text: "Sajjad K. triggered a chain reaction!", type: "bomb" },
  { text: "Farhana Y. blocked an incoming strike!", type: "shield" },
  { text: "Maria T. climbed to Rank 3!", type: "rank" },
  { text: "Nabil S. answered correctly in 0.4s!", type: "speed" },
  { text: "Rafiq H. is on a 10-streak!", type: "streak" },
  { text: "Fahim M. solved a Chemistry challenge!", type: "chemistry" },
  { text: "Sadia Z. got perfect accuracy!", type: "accuracy" }
];

function PlayerAvatar({ variant = "blue", size = "md" }) {
  const gradients = {
    orange: 'linear-gradient(135deg, #f97316, #dd6b20)',
    blue: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    green: 'linear-gradient(135deg, #10b981, #059669)',
    purple: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    pink: 'linear-gradient(135deg, #ec4899, #db2777)',
    teal: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    amber: 'linear-gradient(135deg, #f59e0b, #d97706)',
  };

  const selectedGradient = gradients[variant] || gradients.blue;

  const sizeClasses = {
    xs: { width: '26px', height: '26px', fontSize: '11px' },
    sm: { width: '32px', height: '32px', fontSize: '14px' },
    md: { width: '40px', height: '40px', fontSize: '18px' },
    lg: { width: '80px', height: '80px', fontSize: '36px' },
  };

  const style = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className="battle__avatar-logo"
      style={{
        width: style.width,
        height: style.height,
        background: selectedGradient,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontSize: style.fontSize,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        border: '2px solid rgba(255, 255, 255, 0.95)',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <FaUserGraduate />
    </div>
  );
}

export default function BattleArena() {
  const { t } = useLanguage();
  const { ref, inView } = useInView({ threshold: 0.2, triggerOnce: true });
  const prefersReducedMotion = useReducedMotion();
  const [score1, setScore1] = useState(140);
  const [score2, setScore2] = useState(125);
  const [timer, setTimer] = useState(45);
  const [activeMode, setActiveMode] = useState(0);
  const [raidEvents, setRaidEvents] = useState([RAID_EVENTS[0], RAID_EVENTS[1], RAID_EVENTS[2]]);

  useEffect(() => {
    if (!inView || prefersReducedMotion) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setScore1(prev => prev + Math.floor(Math.random() * 30 + 10));
      setScore2(prev => prev + Math.floor(Math.random() * 25 + 8));
      setTimer(prev => (prev > 5 ? prev - Math.floor(Math.random() * 5 + 1) : 45));
    }, 2000);
    return () => clearInterval(interval);
  }, [inView, prefersReducedMotion]);

  useEffect(() => {
    if (activeMode !== 3 || prefersReducedMotion) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setRaidEvents(prev => {
        const lastEvent = prev[prev.length - 1];
        const lastIdx = RAID_EVENTS.findIndex(e => e.text === lastEvent.text);
        const nextIdx = (lastIdx + 1) % RAID_EVENTS.length;
        return [...prev.slice(1), RAID_EVENTS[nextIdx]];
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [activeMode, prefersReducedMotion]);

  const getEventIcon = (type) => {
    switch (type) {
      case 'streak': return { icon: <FaFire />, color: '#f97316' };
      case 'physics': return { icon: <FaAtom />, color: '#3b82f6' };
      case 'points': return { icon: <FaBullseye />, color: '#22c55e' };
      case 'bomb': return { icon: <FaBomb />, color: '#ef4444' };
      case 'shield': return { icon: <FaShieldAlt />, color: '#eab308' };
      case 'rank': return { icon: <FaCrown />, color: '#eab308' };
      case 'speed': return { icon: <FaBolt />, color: '#a855f7' };
      case 'chemistry': return { icon: <FaFlask />, color: '#06b6d4' };
      case 'accuracy': return { icon: <FaBullseye />, color: '#10b981' };
      default: return { icon: <FaUserGraduate />, color: '#3b82f6' };
    }
  };

  const modes = [
    { label: t('battle.1v1'), icon: <GiSwordClash size={18} /> },
    { label: t('battle.5v5'), icon: <GiShield size={16} /> },
    { label: t('battle.10v10'), icon: <GiCastle size={16} /> },
    { label: t('battle.20'), icon: <GiSpikyExplosion size={16} /> }
  ];

  return (
    <section className="battle section" id="battle" ref={ref}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="section-title">{t('battle.title')}</h2>
          <p className="section-subtitle">{t('battle.subtitle')}</p>
        </motion.div>

        <motion.div
          className="battle__arena-card"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.3, duration: 0.7 }}
        >
          <div className="battle__versus">
            {activeMode === 0 && (
              /* 1v1 Duel */
              <>
                <div className="battle__player">
                  <PlayerAvatar variant="blue" size="lg" />
                  <span className="battle__player-name">Tasnim A.</span>
                  <motion.span
                    className="battle__player-score"
                    key={score1}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                  >
                    {score1}
                  </motion.span>
                </div>

                <div className="battle__vs-emblem">
                  <span className="battle__vs-text">VS</span>
                  <span className="battle__timer">00:{timer.toString().padStart(2, '0')}</span>
                </div>

                <div className="battle__player">
                  <PlayerAvatar variant="orange" size="lg" />
                  <span className="battle__player-name">Rafiq H.</span>
                  <motion.span
                    className="battle__player-score"
                    key={score2}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                  >
                    {score2}
                  </motion.span>
                </div>
              </>
            )}

            {activeMode === 1 && (
              /* Squad 5v5 */
              <>
                <div className="battle__team battle__team--left">
                  <span className="battle__team-badge">SQUAD ALPHA</span>
                  <motion.span
                    className="battle__team-score"
                    key={score1 * 4 + 120}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                  >
                    {score1 * 4 + 120}
                  </motion.span>
                  <div className="battle__team-members">
                    {SQUAD_ALPHA.map((m, idx) => {
                      const isAnswering = (timer % 5) === idx;
                      return (
                        <div key={idx} className={`battle__member ${isAnswering ? 'battle__member--active' : ''}`}>
                          <PlayerAvatar variant={m.variant} size="md" />
                          <span className="battle__member-name">{m.name.split(' ')[0]}</span>
                          {isAnswering && (
                            <span
                              className="battle__member-ping"
                              style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                background: '#ffffff',
                                color: '#f59e0b',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 5px rgba(0, 0, 0, 0.15)',
                                border: '1px solid rgba(230, 204, 178, 0.4)',
                                fontSize: '10px',
                              }}
                            >
                              <FaBolt />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="battle__vs-emblem">
                  <span className="battle__vs-text">VS</span>
                  <span className="battle__timer">00:{timer.toString().padStart(2, '0')}</span>
                </div>

                <div className="battle__team battle__team--right">
                  <span className="battle__team-badge">SQUAD OMEGA</span>
                  <motion.span
                    className="battle__team-score"
                    key={score2 * 4 + 105}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                  >
                    {score2 * 4 + 105}
                  </motion.span>
                  <div className="battle__team-members">
                    {SQUAD_OMEGA.map((m, idx) => {
                      const isAnswering = ((timer + 2) % 5) === idx;
                      return (
                        <div key={idx} className={`battle__member ${isAnswering ? 'battle__member--active' : ''}`}>
                          <PlayerAvatar variant={m.variant} size="md" />
                          <span className="battle__member-name">{m.name.split(' ')[0]}</span>
                          {isAnswering && (
                            <span
                              className="battle__member-ping"
                              style={{
                                position: 'absolute',
                                top: '-6px',
                                right: '-6px',
                                background: '#ffffff',
                                color: '#f59e0b',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 5px rgba(0, 0, 0, 0.15)',
                                border: '1px solid rgba(230, 204, 178, 0.4)',
                                fontSize: '10px',
                              }}
                            >
                              <FaBolt />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {activeMode === 2 && (
              /* Platoon 10v10 */
              <>
                <div className="battle__team battle__team--left">
                  <span className="battle__team-badge">CRIMSON PLATOON</span>
                  <motion.span
                    className="battle__team-score"
                    key={score1 * 8 + 320}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                  >
                    {score1 * 8 + 320}
                  </motion.span>
                  <div className="battle__platoon-grid">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const isFlashing = (timer + idx) % 4 === 0;
                      return (
                        <div key={idx} className={`battle__platoon-slot ${isFlashing ? 'battle__platoon-slot--active' : ''}`} style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }}>
                          <PlayerAvatar variant={idx % 2 === 0 ? 'pink' : 'purple'} size="sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="battle__vs-emblem">
                  <span className="battle__vs-text">VS</span>
                  <span className="battle__timer">00:{timer.toString().padStart(2, '0')}</span>
                </div>

                <div className="battle__team battle__team--right">
                  <span className="battle__team-badge">COBALT PLATOON</span>
                  <motion.span
                    className="battle__team-score"
                    key={score2 * 8 + 290}
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                  >
                    {score2 * 8 + 290}
                  </motion.span>
                  <div className="battle__platoon-grid">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const isFlashing = (timer - idx) % 4 === 0;
                      return (
                        <div key={idx} className={`battle__platoon-slot ${isFlashing ? 'battle__platoon-slot--active' : ''}`} style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0 }}>
                          <PlayerAvatar variant={idx % 2 === 0 ? 'blue' : 'green'} size="sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {activeMode === 3 && (
              /* Grand Raid 20 */
              <div className="battle__raid-layout">
                <div className="battle__raid-leaderboard">
                  <span className="battle__raid-title">Raid Leaderboard</span>
                  <div className="battle__raid-ranks">
                    <div className="battle__raid-rank-item">
                      <span className="battle__raid-rank-num">1</span>
                      <PlayerAvatar variant="blue" size="sm" />
                      <span className="battle__raid-rank-name">Tasnim A.</span>
                      <span className="battle__raid-rank-score">{score1 + 120} pts</span>
                    </div>
                    <div className="battle__raid-rank-item">
                      <span className="battle__raid-rank-num">2</span>
                      <PlayerAvatar variant="orange" size="sm" />
                      <span className="battle__raid-rank-name">Rafiq H.</span>
                      <span className="battle__raid-rank-score">{score2 + 95} pts</span>
                    </div>
                    <div className="battle__raid-rank-item">
                      <span className="battle__raid-rank-num">3</span>
                      <PlayerAvatar variant="pink" size="sm" />
                      <span className="battle__raid-rank-name">Ayesha B.</span>
                      <span className="battle__raid-rank-score">{score1 - 15} pts</span>
                    </div>
                  </div>
                </div>

                <div className="battle__vs-emblem">
                  <span className="battle__vs-text battle__raid-text"><span>RAID</span></span>
                  <span className="battle__timer">00:{timer.toString().padStart(2, '0')}</span>
                </div>

                <div className="battle__raid-feed">
                  <span className="battle__raid-title">Live Raid Feed</span>
                  <div className="battle__feed-container">
                    <AnimatePresence mode="popLayout">
                      {raidEvents.map((evt, idx) => {
                        const { icon, color } = getEventIcon(evt.type);
                        return (
                          <motion.div
                            key={evt.text}
                            className="battle__feed-item"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.3 }}
                            style={{ borderLeftColor: color, display: 'flex', alignItems: 'center', gap: '8px' }}
                          >
                            <span style={{ color, display: 'flex', alignItems: 'center', fontSize: '14px' }}>{icon}</span>
                            <span>{evt.text}</span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="battle__info">
            <div className="battle__modes">
              <span className="battle__info-label">{t('battle.modes')}</span>
              <div className="battle__mode-list">
                {modes.map((m, i) => (
                  <button
                    className={`battle__mode-badge ${activeMode === i ? 'battle__mode-badge--active' : ''}`}
                    key={i}
                    onClick={() => setActiveMode(i)}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
