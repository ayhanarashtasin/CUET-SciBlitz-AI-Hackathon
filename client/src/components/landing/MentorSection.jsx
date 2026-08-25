import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../hooks/useLanguage';
import { HiOutlineStar, HiOutlineUserGroup, HiOutlineBadgeCheck } from 'react-icons/hi';
import './MentorSection.css';

const MENTORS = [
  { name: 'Dr. Ayesha Rahman', uni: 'BUET', dept: 'EEE', rank: '#3 Merit', rating: 4.9, students: 28, specialties: ['Physics', 'Math'], emoji: '👩‍🏫' },
  { name: 'Tanvir Hasan', uni: 'DU', dept: 'Chemistry', rank: '#7 Merit', rating: 4.8, students: 30, specialties: ['Chemistry', 'Biology'], emoji: '👨‍🔬' },
  { name: 'Sadia Islam', uni: 'DMC', dept: 'MBBS', rank: '#12 Merit', rating: 4.9, students: 25, specialties: ['Biology', 'Chemistry'], emoji: '👩‍⚕️' },
  { name: 'Rahim Uddin', uni: 'BUET', dept: 'CSE', rank: '#1 Merit', rating: 5.0, students: 30, specialties: ['Physics', 'ICT', 'Math'], emoji: '👨‍💻' },
  { name: 'Fatema Noor', uni: 'CUET', dept: 'CE', rank: '#5 Merit', rating: 4.7, students: 22, specialties: ['Math', 'Physics'], emoji: '👩‍🎓' },
];

export default function MentorSection() {
  const { t } = useLanguage();
  const prefersReducedMotion = useReducedMotion();
  const { ref, inView } = useInView({ threshold: 0.2, triggerOnce: true });

  return (
    <section className="mentors section" id="mentors" ref={ref} aria-label="Expert University Mentors">
      <div className="container">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6 }}
        >
          <h2 className="section-title">{t('mentor.title')}</h2>
          <p className="section-subtitle">{t('mentor.subtitle')}</p>
        </motion.div>

        <div className="mentors__scroll-container">
          <div className="mentors__track">
            {MENTORS.map((mentor, i) => (
              <motion.div
                className="mentors__card card"
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2 + i * 0.1, duration: 0.5 }}
              >
                <div className="mentors__card-header">
                  <div className="mentors__avatar" aria-hidden="true">{mentor.emoji}</div>
                  <span className="mentors__verified badge badge-blue">
                    <HiOutlineBadgeCheck aria-hidden="true" /> {t('mentor.verified')}
                  </span>
                </div>

                <h4 className="mentors__name">{mentor.name}</h4>
                <p className="mentors__uni">
                  {mentor.uni} • {mentor.dept}
                </p>
                <p className="mentors__rank">{mentor.rank}</p>

                <div className="mentors__rating">
                  <HiOutlineStar className="mentors__star" aria-hidden="true" />
                  <span>{mentor.rating}</span>
                  <span className="mentors__separator" aria-hidden="true">•</span>
                  <HiOutlineUserGroup aria-hidden="true" />
                  <span>{mentor.students} {t('mentor.students')}</span>
                </div>

                <div className="mentors__specialties">
                  {mentor.specialties.map((s, j) => (
                    <span className="mentors__specialty-tag" key={j}>{s}</span>
                  ))}
                </div>

                <Link 
                  to="/student/find-mentor" 
                  className={`btn ${mentor.students >= 30 ? 'btn-secondary' : 'btn-primary'} btn-sm mentors__btn`}
                  aria-label={`${mentor.students >= 30 ? 'Join waitlist for' : 'Book guidance session with'} ${mentor.name}`}
                >
                  {mentor.students >= 30 ? t('mentor.waitlist') : t('mentor.book')}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
