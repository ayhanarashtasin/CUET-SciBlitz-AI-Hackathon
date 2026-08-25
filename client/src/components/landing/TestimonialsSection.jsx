import { useLanguage } from '../../hooks/useLanguage';
import { HiOutlineStar } from 'react-icons/hi';
import './TestimonialsSection.css';

const TESTIMONIALS = [
  { name: 'Nusrat Jahan', institution: 'Dhaka College', rating: 5, text: 'TopKorbo completely changed how I prepare for BUET. The live contests make it feel real — like a practice admission test every week!', textBn: 'TopKorbo আমার বুয়েট প্রস্তুতি পুরোপুরি বদলে দিয়েছে। লাইভ কনটেস্টগুলো সত্যিকার ভর্তি পরীক্ষার মতো লাগে!' },
  { name: 'Arif Hossain', institution: 'NDC', rating: 5, text: 'The AI tutor explains my mistakes step by step and lets me ask follow-ups without losing the question context.', textBn: 'AI টিউটর আমার ভুলগুলো ধাপে ধাপে বুঝিয়ে দেয় এবং প্রশ্নের প্রসঙ্গ না হারিয়ে ফলো-আপ করতে দেয়।' },
  { name: 'Mithila Das', institution: 'Rajshahi College', rating: 5, text: 'Battle Arena with my friends is so much fun! We learn while competing and it never feels boring.', textBn: 'বন্ধুদের সাথে ব্যাটল এরিনা অনেক মজার! প্রতিযোগিতা করতে করতে শিখি, কখনো বোরিং লাগে না।' },
  { name: 'Sabbir Khan', institution: 'Holy Cross', rating: 4, text: 'My mentor from BUET CSE helped me identify exactly where I was wasting time. My physics accuracy jumped 25% in 2 months.', textBn: 'বুয়েট CSE-র মেন্টর আমাকে দেখিয়ে দিলেন কোথায় সময় নষ্ট হচ্ছে। ২ মাসে ফিজিক্সে ২৫% উন্নতি!' },
  { name: 'Fatema Begum', institution: 'Chittagong College', rating: 5, text: 'The analytics dashboard showed me I was spending too long on easy questions. That one insight changed my strategy completely.', textBn: 'অ্যানালিটিক্স দেখাল আমি সহজ প্রশ্নে বেশি সময় দিচ্ছি। এই একটা তথ্য আমার পুরো স্ট্র্যাটেজি বদলে দিল।' },
  { name: 'Tanvir Ahmed', institution: 'DCC', rating: 5, text: 'From Pupil to Expert in 4 months! Seeing my rating climb keeps me motivated every single day.', textBn: '৪ মাসে পিউপিল থেকে এক্সপার্ট! রেটিং বাড়তে দেখলে প্রতিদিন অনুপ্রাণিত হই।' },
];

export default function TestimonialsSection() {
  const { t, language } = useLanguage();

  return (
    <section className="testimonials section" id="testimonials">
      <div className="container">
        <h2 className="section-title">{t('testimonials.title')}</h2>
        <p className="section-subtitle">{t('testimonials.subtitle')}</p>
      </div>

      <div className="testimonials__scroll-wrapper">
        <div className="testimonials__track animate-scroll-left">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t_item, i) => (
            <div className="testimonials__card glass-card" key={i}>
              <div className="testimonials__stars">
                {Array.from({ length: t_item.rating }).map((_, j) => (
                  <HiOutlineStar key={j} className="testimonials__star" />
                ))}
              </div>
              <p className="testimonials__text">
                "{language === 'bn' ? t_item.textBn : t_item.text}"
              </p>
              <div className="testimonials__author">
                <div className="testimonials__avatar">
                  {t_item.name.charAt(0)}
                </div>
                <div>
                  <span className="testimonials__name">{t_item.name}</span>
                  <span className="testimonials__inst">{t_item.institution}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
