import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useLanguage } from '../../hooks/useLanguage';
import './QuestionBank.css';

function InstitutionInsignia({ id, color, name, fallbackUrl }) {
  const [imgError, setImgError] = useState(false);

  if (!imgError && fallbackUrl) {
    return (
      <img
        src={fallbackUrl}
        alt={`${name} Logo`}
        width="52"
        height="52"
        loading="lazy"
        decoding="async"
        onError={() => setImgError(true)}
        style={{ width: '52px', height: '52px', objectFit: 'contain' }}
      />
    );
  }

  // High-performance vector badge fallback
  return (
    <svg
      viewBox="0 0 64 64"
      width="52"
      height="52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`${name} insignia`}
      role="img"
    >
      <circle cx="32" cy="32" r="30" fill={`${color}15`} stroke={color} strokeWidth="2.5" />
      <path
        d="M32 14 L46 22 V36 C46 44 32 50 32 50 C32 50 18 44 18 36 V22 Z"
        fill={`${color}25`}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <text
        x="32"
        y="35"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize="11"
        fontWeight="800"
        fontFamily="sans-serif"
      >
        {id}
      </text>
    </svg>
  );
}

const SOURCES = [
  { 
    id: 'BUET',
    name: 'BUET', 
    count: '12,400+', 
    color: '#dc2626',
    fallbackUrl: 'https://www.buet.ac.bd/web/assets/img/BImages/logoBIRN.png'
  },
  { 
    id: 'DU',
    name: 'DU', 
    count: '18,200+', 
    color: '#3b82f6',
    fallbackUrl: 'https://www.freelogovectors.net/wp-content/uploads/2023/03/dhaka-university-logo-freelogovectors.net_.png'
  },
  { 
    id: 'DMC',
    name: 'Medical', 
    count: '22,800+', 
    color: '#22c55e',
    fallbackUrl: 'https://mampower.net/assets/uploads/page/original/dmc.png'
  },
  { 
    id: 'CUET',
    name: 'CUET', 
    count: '8,500+', 
    color: '#f59e0b',
    fallbackUrl: 'https://cuet.ac.bd/assets/images/logo.png'
  },
  { 
    id: 'RU',
    name: 'RU', 
    count: '9,100+', 
    color: '#8b5cf6',
    fallbackUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSN8MFxhDCSTud5gJ_nj5aGxwFXdX6A8HGyiw&s'
  },
  { 
    id: 'SUST',
    name: 'SUST', 
    count: '6,300+', 
    color: '#14b8a6',
    fallbackUrl: 'https://www.sanirepo.com/uploads/users/images/untitled-design-2-1748236321.png'
  },
  { 
    id: 'DB',
    name: 'HSC Dhaka', 
    count: '15,000+', 
    color: '#ec4899',
    fallbackUrl: 'https://www.dhakaeducationboard.gov.bd/site/assets/custom/img/logog.gif'
  },
  { 
    id: 'RB',
    name: 'HSC Rajshahi', 
    count: '11,200+', 
    color: '#f97316',
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fa/Board_of_Intermediate_and_Secondary_Education-Rajshahi_Logo.jpg/330px-Board_of_Intermediate_and_Secondary_Education-Rajshahi_Logo.jpg'
  },
];

export default function QuestionBank() {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({ threshold: 0.15, triggerOnce: true });

  return (
    <section className="qbank section" id="questionbank" ref={ref} aria-label="Question Bank Sources">
      <div className="container">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }}
        >
          <h2 className="section-title">{t('questionbank.title')}</h2>
          <p className="section-subtitle">{t('questionbank.subtitle')}</p>
        </motion.div>

        <motion.div
          className="qbank__filter-bar"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, duration: 0.5 }}
          aria-hidden="true"
        >
          <span className="qbank__filter-chip qbank__filter-chip--active">Physics</span>
          <span className="qbank__filter-arrow">→</span>
          <span className="qbank__filter-chip qbank__filter-chip--active">Optics</span>
          <span className="qbank__filter-arrow">→</span>
          <span className="qbank__filter-chip qbank__filter-chip--active">Refraction</span>
        </motion.div>

        <div className="qbank__grid">
          {SOURCES.map((source, i) => (
            <motion.div
              className="qbank__source-card card"
              key={source.name}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3 + i * 0.06, duration: 0.5 }}
            >
              <div className="qbank__source-icon-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '54px', marginBottom: '12px' }}>
                <InstitutionInsignia 
                  id={source.id} 
                  color={source.color} 
                  name={source.name} 
                  fallbackUrl={source.fallbackUrl} 
                />
              </div>
              <h4 className="qbank__source-name">{source.name}</h4>
              <span className="qbank__source-count" style={{ color: source.color }}>
                {source.count}
              </span>
              <span className="qbank__source-label">Questions</span>
            </motion.div>
          ))}
        </div>

        <div className="qbank__categories">
          {[t('questionbank.hsc'), t('questionbank.admission'), t('questionbank.college'), t('questionbank.custom')].map((cat, i) => (
            <span className="qbank__category-badge" key={i}>{cat}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
