import { useLanguage } from '../../hooks/useLanguage';
import { FaGithub, FaFacebookF, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import { HiHeart } from 'react-icons/hi';
import './Footer.css';

export default function Footer() {
  const { t } = useLanguage();

  const columns = [
    {
      title: t('footer.platform'),
      links: [
        { label: t('footer.features'), href: '#features' },
        { label: t('footer.arena'), href: '#arena' },
        { label: t('footer.ai_tutor'), href: '#ai' },
        { label: t('footer.battle_arena'), href: '#battle' },
      ]
    },
    {
      title: t('footer.resources'),
      links: [
        { label: t('footer.blog'), href: '#' },
        { label: t('footer.docs'), href: '#' },
        { label: t('footer.help'), href: '#' },
        { label: t('footer.community'), href: '#' },
      ]
    },
    {
      title: t('footer.company'),
      links: [
        { label: t('footer.about'), href: '#' },
        { label: t('footer.careers'), href: '#' },
        { label: t('footer.contact'), href: '#' },
        { label: t('footer.press'), href: '#' },
      ]
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.privacy'), href: '#' },
        { label: t('footer.terms'), href: '#' },
        { label: t('footer.cookies'), href: '#' },
      ]
    }
  ];

  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <h3 className="footer__logo">TopKorbo</h3>
            <p className="footer__tagline">
              {t('footer.made_in').replace('❤️', '')}
              <HiHeart className="footer__heart" />
            </p>
            <div className="footer__socials">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="Visit TopKorbo on Facebook"><FaFacebookF aria-hidden="true" /></a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="Visit TopKorbo on YouTube"><FaYoutube aria-hidden="true" /></a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="Visit TopKorbo on LinkedIn"><FaLinkedinIn aria-hidden="true" /></a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="Visit TopKorbo on GitHub"><FaGithub aria-hidden="true" /></a>
            </div>
          </div>

          {columns.map((col, i) => (
            <div className="footer__column" key={i}>
              <h4 className="footer__column-title">{col.title}</h4>
              <ul className="footer__column-links">
                {col.links.map((link, j) => (
                  <li key={j}>
                    <a href={link.href} className="footer__column-link">{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
