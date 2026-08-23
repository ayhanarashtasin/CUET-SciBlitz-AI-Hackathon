import { useEffect, useState } from 'react';
import { HiOutlineDocumentText, HiExternalLink, HiX, HiOutlineBan } from 'react-icons/hi';

/**
 * Renders the files attached to an announcement, an assignment or a hand-in.
 *
 * Attachment metadata is now validated server-side before it is stored, but this
 * component is the last thing standing between a stored URL and the reader's
 * browser — and records written before that validation existed are still in the
 * database. So every URL is re-checked here too: a `javascript:` href would be an
 * XSS on click, and an arbitrary remote `<img src>` is a tracking pixel that
 * fires on render and hands the viewer's IP to whoever wrote the record.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';
const LOCAL_PREFIX = '/uploads/class/';

function isSafeAttachmentUrl(url) {
  if (typeof url !== 'string' || !url) return false;

  // Same-origin upload path. Reject any traversal or protocol-relative trick.
  if (url.startsWith(LOCAL_PREFIX)) return !url.includes('..');
  if (url.startsWith('//')) return false;

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.origin === window.location.origin) return parsed.pathname.startsWith(LOCAL_PREFIX);
    return parsed.protocol === 'https:' && parsed.hostname === CLOUDINARY_HOST;
  } catch {
    return false;
  }
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentView({ attachments = [], title = 'Attachments' }) {
  const [activeImage, setActiveImage] = useState(null);

  // Escape closes the lightbox, matching every other overlay in the product.
  useEffect(() => {
    if (!activeImage) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setActiveImage(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeImage]);

  if (!attachments || !attachments.length) return null;

  return (
    <div className="mc-attachments-view">
      {title && <span className="mc-attachments-view__title">{title} ({attachments.length}):</span>}

      <div className="mc-attachments-grid">
        {attachments.map((att, idx) => {
          const safe = isSafeAttachmentUrl(att.url);
          const isPdf = att.fileType === 'pdf' || att.name?.toLowerCase().endsWith('.pdf');

          // A record that predates server-side validation, or one that was
          // tampered with. Show that something is there, but never link to it.
          if (!safe) {
            return (
              <div
                key={att.url || idx}
                className="mc-att-card mc-att-card--blocked"
                title="This attachment was not stored by TopKorbo and has been blocked."
              >
                <div className="mc-att-card__icon">
                  <HiOutlineBan size={22} aria-hidden="true" />
                </div>
                <div className="mc-att-card__details">
                  <strong className="mc-att-card__name">Blocked attachment</strong>
                  <span className="mc-att-card__size">Untrusted source</span>
                </div>
              </div>
            );
          }

          if (isPdf) {
            return (
              <a
                key={att.url || idx}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="mc-att-card mc-att-card--pdf"
                title={`Open ${att.name || 'PDF Document'}`}
              >
                <div className="mc-att-card__icon">
                  <HiOutlineDocumentText size={22} aria-hidden="true" />
                  <span className="mc-att-card__badge">PDF</span>
                </div>
                <div className="mc-att-card__details">
                  <strong className="mc-att-card__name" title={att.name}>{att.name || 'Document.pdf'}</strong>
                  {att.size ? <span className="mc-att-card__size">{formatSize(att.size)}</span> : null}
                </div>
                <HiExternalLink className="mc-att-card__ext" size={16} aria-hidden="true" />
              </a>
            );
          }

          return (
            <button
              type="button"
              key={att.url || idx}
              className="mc-att-card mc-att-card--img"
              onClick={() => setActiveImage(att)}
              aria-label={`View image ${att.name || 'attachment'}`}
            >
              <div className="mc-att-card__thumb-wrap">
                <img
                  src={att.url}
                  alt={att.name || 'Attachment'}
                  className="mc-att-card__thumb"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="mc-att-card__details">
                <strong className="mc-att-card__name" title={att.name}>{att.name || 'Image'}</strong>
                {att.size ? <span className="mc-att-card__size">{formatSize(att.size)}</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Image Preview Lightbox Modal */}
      {activeImage && (
        <div
          className="mc-lightbox-modal"
          role="dialog"
          aria-modal="true"
          aria-label={activeImage.name || 'Image preview'}
          onClick={() => setActiveImage(null)}
        >
          <div className="mc-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="mc-lightbox-header">
              <span className="mc-lightbox-name">{activeImage.name || 'Image Preview'}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={activeImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="mc-btn mc-btn--sm"
                  title="Open original in new tab"
                >
                  <HiExternalLink size={14} aria-hidden="true" /> Open original
                </a>
                <button
                  type="button"
                  className="mc-icon-btn"
                  onClick={() => setActiveImage(null)}
                  aria-label="Close image preview"
                >
                  <HiX size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="mc-lightbox-body">
              <img
                src={activeImage.url}
                alt={activeImage.name || 'Preview'}
                className="mc-lightbox-img"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
