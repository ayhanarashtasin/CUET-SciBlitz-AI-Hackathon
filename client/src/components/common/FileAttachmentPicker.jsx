import { useRef, useState } from 'react';
import { HiPaperClip, HiX, HiOutlineDocumentText, HiOutlinePhotograph } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { uploadClassAttachment } from '../../services/mentorApi';

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// Mirrors the server allowlist exactly. SVG is excluded on purpose: it executes
// script when opened directly, and the CDN that serves attachments does not
// carry the sandbox CSP that protects locally-served uploads.
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileAttachmentPicker({
  attachments = [],
  onChange,
  disabled = false,
  maxFiles = 5,
  label = 'Attach PDF or Image'
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (event) => {
    const files = event.target.files;
    if (!files || !files.length) return;

    if (attachments.length + files.length > maxFiles) {
      toast.error(`You can attach at most ${maxFiles} files.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    const chosen = Array.from(files);
    const toastId = toast.loading(
      chosen.length > 1 ? `Uploading 0/${chosen.length}…` : 'Uploading attachment…'
    );

    // Each file is isolated. Previously one rejection aborted the whole batch,
    // discarding uploads that had already succeeded server-side: the user saw
    // an error and nothing attached, while the files sat orphaned on disk.
    const uploadedList = [];
    const failures = [];

    for (const file of chosen) {
      if (file.size > MAX_FILE_BYTES) {
        failures.push(`"${file.name}" is larger than ${MAX_FILE_MB}MB`);
        continue;
      }
      try {
        const res = await uploadClassAttachment(file);
        if (res && res.data) {
          uploadedList.push(res.data);
          if (chosen.length > 1) {
            toast.loading(`Uploading ${uploadedList.length}/${chosen.length}…`, { id: toastId });
          }
        } else {
          failures.push(`"${file.name}" could not be saved`);
        }
      } catch (err) {
        failures.push(`"${file.name}": ${err.message || 'upload failed'}`);
      }
    }

    // Keep whatever made it through, then say plainly what did not.
    if (uploadedList.length > 0) {
      onChange([...attachments, ...uploadedList]);
    }

    if (failures.length && uploadedList.length) {
      toast.error(`Attached ${uploadedList.length}, skipped ${failures.length}: ${failures[0]}`, { id: toastId });
    } else if (failures.length) {
      toast.error(failures[0], { id: toastId });
    } else {
      toast.success(
        uploadedList.length > 1 ? `${uploadedList.length} files attached.` : 'Attached successfully!',
        { id: toastId }
      );
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = (index) => {
    const next = attachments.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div className="mc-attachment-picker">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={ACCEPTED_TYPES}
        multiple
        style={{ display: 'none' }}
        disabled={disabled || uploading || attachments.length >= maxFiles}
      />

      <div className="mc-attachment-picker__controls">
        <button
          type="button"
          className="mc-attachment-btn"
          disabled={disabled || uploading || attachments.length >= maxFiles}
          onClick={() => fileInputRef.current?.click()}
          title="Upload PDF or image"
        >
          <HiPaperClip size={16} aria-hidden="true" />
          <span>{uploading ? 'Uploading…' : label}</span>
        </button>
        {attachments.length > 0 && (
          <span className="mc-attachment-picker__count">
            {attachments.length}/{maxFiles} attached
          </span>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mc-attachment-chips">
          {attachments.map((att, idx) => {
            const isPdf = att.fileType === 'pdf' || att.name?.toLowerCase().endsWith('.pdf');

            return (
              <div className="mc-attachment-chip" key={att.url || idx}>
                {isPdf ? (
                  <HiOutlineDocumentText className="mc-attachment-chip__icon mc-attachment-chip__icon--pdf" size={16} />
                ) : (
                  <HiOutlinePhotograph className="mc-attachment-chip__icon mc-attachment-chip__icon--img" size={16} />
                )}
                <span className="mc-attachment-chip__name" title={att.name}>
                  {att.name || (isPdf ? 'Document.pdf' : 'Image')}
                </span>
                {att.size ? (
                  <span className="mc-attachment-chip__size">({formatSize(att.size)})</span>
                ) : null}
                {!disabled && (
                  <button
                    type="button"
                    className="mc-attachment-chip__remove"
                    onClick={() => handleRemove(idx)}
                    title="Remove attachment"
                    aria-label="Remove attachment"
                  >
                    <HiX size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
