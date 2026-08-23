/**
 * AiQuestionHelper.jsx
 *
 * Standalone teacher helper page. The teacher pastes a question (typed or
 * uploaded as an image) and the AI converts it into a structured LaTeX
 * representation that they can copy into the existing Upload Question form
 * manually. This page is intentionally isolated — it never auto-fills the
 * Upload Question form. The teacher copies the LaTeX output and pastes it
 * themselves.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import katex from 'katex';
import {
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineClipboardCopy,
  HiOutlineRefresh,
  HiOutlineX,
  HiOutlineCheck,
  HiOutlineExclamationCircle,
  HiOutlineUpload
} from 'react-icons/hi';
import Sidebar from '../components/layout/Sidebar';
import { aiApi } from '../services/aiApi';
import './AiQuestionHelper.css';

// Keep the raw-file cap a bit under the server's 7 MB base64 ceiling (base64
// inflates by 4/3, so 5 MB raw ≈ 6.7 MB base64).
const MAX_IMAGE_BYTES_RAW = 5 * 1024 * 1024;

const PLACEHOLDER_LATEX =
  'e.g. Find the value of $\\displaystyle\\int_0^1 \\frac{x^2+1}{x^4+1}\\,dx$.';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:([^;]+);base64,(.*)$/)
    : null;
  return {
    mimeType: match ? match[1] : 'image/png',
    base64: match ? match[2] : ''
  };
}

function safeKatexHtml(latex) {
  if (!latex || typeof latex !== 'string') return '';
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      output: 'html'
    });
  } catch (_) {
    return '';
  }
}

function buildFullLatex(data) {
  if (!data) return '';
  const parts = [data.questionText || ''];
  if (Array.isArray(data.options) && data.options.length > 0) {
    parts.push('');
    data.options.forEach((opt) => {
      parts.push(`${opt.label}) ${opt.text}`);
    });
  }
  if (data.solution && data.solution.trim().length > 0) {
    parts.push('');
    parts.push('Solution:');
    parts.push(data.solution);
  }
  return parts.join('\n');
}

export default function AiQuestionHelper() {
  const [user] = useState({
    name: localStorage.getItem('topkorbo_name') || 'Teacher',
    avatar: localStorage.getItem('topkorbo_avatar') || '',
    email: localStorage.getItem('topkorbo_email') || '',
    role: localStorage.getItem('topkorbo_role') || 'teacher'
  });

  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const fileInputRef = useRef(null);
  const copyResetTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const imagePreviewSrc = useMemo(
    () => (image ? `data:${image.mimeType};base64,${image.base64}` : ''),
    [image]
  );

  const hasInput = inputText.trim().length > 0 || !!image;

  const canSubmit = hasInput && !isLoading;

  const activeTab = 'ai-helper';

  const handleImageFile = useCallback(async (file) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      toast.error('Please choose an image (PNG, JPG) or PDF document.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES_RAW) {
      toast.error('File is too large. Please use a file under ~5 MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { mimeType, base64 } = splitDataUrl(dataUrl);
      setImage({ mimeType: isPdf ? 'application/pdf' : mimeType, base64, name: file.name, isPdf });
      setErrorMsg('');
    } catch (err) {
      console.error('[AiQuestionHelper] failed to read file', err);
      toast.error('Could not read the selected file.');
    }
  }, []);

  const onFileInputChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleImageFile(file);
    // Reset value so picking the same file again still triggers `change`.
    event.target.value = '';
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const clearImage = () => {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsLoading(true);
    setErrorMsg('');
    setExtracted(null);

    const payload = {};
    const trimmed = inputText.trim();
    if (trimmed) payload.text = trimmed;
    if (image) {
      payload.imageBase64 = image.base64;
      payload.mimeType = image.mimeType;
    }

    try {
      const result = await aiApi.extract(payload);
      if (!result || !result.extracted) {
        throw new Error('AI returned an empty result.');
      }
      setExtracted(result.extracted);
      toast.success('Question extracted. Review the LaTeX below and copy.');
    } catch (err) {
      const message = err?.message || 'Could not extract the question.';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setInputText('');
    setImage(null);
    setExtracted(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = async (value, fieldKey) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      toast.success('Copied to clipboard');
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => setCopiedField(''), 1500);
    } catch (err) {
      console.error('[AiQuestionHelper] clipboard copy failed', err);
      toast.error('Copy failed — please select and copy manually.');
    }
  };

  // Compute every katex preview once per extracted result. KeTeX rendering
  // is non-trivial; we don't want to repeat it on every keystroke or option
  // re-render.
  const rendered = useMemo(() => {
    if (!extracted) return null;
    const fullSource = buildFullLatex(extracted);
    return {
      question: safeKatexHtml(extracted.questionText),
      solution: safeKatexHtml(extracted.solution || ''),
      fullSource,
      fullHtml: safeKatexHtml(fullSource),
      options: (extracted.options || []).map((opt) => ({
        ...opt,
        html: safeKatexHtml(opt.text)
      }))
    };
  }, [extracted]);

  return (
    <div className="dashboard-container">
      <Sidebar activeTab={activeTab} user={user} />

      <main className="dashboard-main">
        <div className="dashboard-workspace dashboard-workspace--teacher">
          <div className="aih-page">
            <section className="aih-card aih-card--input">
              <div className="aih-card__header">
                <div className="aih-card__title">
                  <HiOutlineDocumentText />
                  <h3>Source Question</h3>
                </div>
                <p className="aih-card__desc">
                  Provide either a typed question, an image of a question, or
                  both. The AI will return a structured LaTeX representation.
                </p>
              </div>

              <div className="aih-card__body">
                <label className="aih-field-label" htmlFor="aih-text-input">
                  Type or paste the question
                </label>
                <textarea
                  id="aih-text-input"
                  className="aih-textarea"
                  rows={6}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={PLACEHOLDER_LATEX}
                  disabled={isLoading}
                />

                <div className="aih-divider">
                  <span>or</span>
                </div>

                <div
                  className={`aih-dropzone ${isDragging ? 'aih-dropzone--active' : ''}`}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current && fileInputRef.current.click();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={onFileInputChange}
                    style={{ display: 'none' }}
                  />

                  {image ? (
                    <div className="aih-dropzone__preview">
                      {image.isPdf ? (
                        <div style={{ padding: '24px', textAlign: 'center' }}>
                          <HiOutlineDocumentText size={48} style={{ color: '#C08552', margin: '0 auto 8px' }} />
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mc-n900, #2C2420)' }}>{image.name}</div>
                          <span style={{ fontSize: '11px', color: 'var(--mc-n500, #8A7A70)' }}>PDF Document</span>
                        </div>
                      ) : (
                        <img src={imagePreviewSrc} alt="Uploaded question" />
                      )}
                      <div className="aih-dropzone__meta">
                        <span className="aih-dropzone__name">
                          {image.isPdf ? <HiOutlineDocumentText /> : <HiOutlinePhotograph />}
                          {image?.name || (image.isPdf ? 'document.pdf' : 'image')}
                        </span>
                        <button
                          type="button"
                          className="aih-dropzone__remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearImage();
                          }}
                          aria-label="Remove file"
                        >
                          <HiOutlineX />
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="aih-dropzone__empty">
                      <HiOutlineUpload size={28} />
                      <p>
                        <strong>Click to upload</strong> or drag &amp; drop an
                        image or PDF of the question
                      </p>
                      <span className="aih-dropzone__hint">
                        PNG, JPG, handwritten photo, or PDF question paper — up to ~5 MB
                      </span>
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <div className="aih-error">
                    <HiOutlineExclamationCircle />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="aih-actions">
                  <button
                    type="button"
                    className="aih-btn aih-btn--ghost"
                    onClick={handleReset}
                    disabled={isLoading || (!inputText && !image)}
                  >
                    <HiOutlineRefresh />
                    Clear
                  </button>
                  <button
                    type="button"
                    className="aih-btn aih-btn--primary"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {isLoading ? (
                      <>
                        <span className="aih-spinner" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        Extract Question
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

            <section className="aih-card aih-card--output">
              <div className="aih-card__header">
                <div className="aih-card__title">
                  <h3>Extracted LaTeX</h3>
                </div>
                <p className="aih-card__desc">
                  Copy the LaTeX below and paste it into the Upload Question
                  form yourself. This page does not auto-fill any form.
                </p>
              </div>

              <div className="aih-card__body">
                {!extracted && !isLoading && (
                  <div className="aih-empty">
                    <p>
                      Submit a question to see its LaTeX version here. Each
                      part (stem, options, solution) can be copied
                      individually, or copy the whole thing at once.
                    </p>
                  </div>
                )}

                {isLoading && (
                  <div className="aih-loading">
                    <span className="aih-spinner aih-spinner--lg" />
                    <p>Reading the question and converting it to LaTeX…</p>
                  </div>
                )}

                {extracted && !isLoading && rendered && (
                  <div className="aih-result">
                    <ResultBlock
                      label="Question"
                      latex={extracted.questionText}
                      previewHtml={rendered.question}
                      fieldKey="questionText"
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />

                    {Array.isArray(extracted.options) && extracted.options.length > 0 && (
                      <div className="aih-options">
                        <div className="aih-options__title">
                          Options ({extracted.options.length})
                          {extracted.correctOption && (
                            <span className="aih-options__correct">
                              Correct: {extracted.correctOption}
                            </span>
                          )}
                        </div>
                        <ul className="aih-options__list">
                          {rendered.options.map((opt) => {
                            const isCorrect =
                              extracted.correctOption &&
                              opt.label.toUpperCase() ===
                                extracted.correctOption.toUpperCase();
                            return (
                              <li
                                key={opt.label}
                                className={`aih-option ${
                                  isCorrect ? 'aih-option--correct' : ''
                                }`}
                              >
                                <div className="aih-option__label">{opt.label}</div>
                                <div className="aih-option__body">
                                  <div
                                    className="aih-katex"
                                    dangerouslySetInnerHTML={{ __html: opt.html }}
                                  />
                                  <button
                                    type="button"
                                    className="aih-copy-mini"
                                    onClick={() =>
                                      copyToClipboard(
                                        `${opt.label}) ${opt.text}`,
                                        `opt-${opt.label}`
                                      )
                                    }
                                    title={`Copy option ${opt.label}`}
                                  >
                                    {copiedField === `opt-${opt.label}` ? (
                                      <HiOutlineCheck />
                                    ) : (
                                      <HiOutlineClipboardCopy />
                                    )}
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {extracted.solution && extracted.solution.trim().length > 0 && (
                      <ResultBlock
                        label="Solution"
                        latex={extracted.solution}
                        previewHtml={rendered.solution}
                        fieldKey="solution"
                        copiedField={copiedField}
                        onCopy={copyToClipboard}
                      />
                    )}

                    <div className="aih-copy-all">
                      <button
                        type="button"
                        className="aih-btn aih-btn--secondary"
                        onClick={() =>
                          copyToClipboard(rendered.fullSource, 'all')
                        }
                      >
                        {copiedField === 'all' ? (
                          <>
                            <HiOutlineCheck /> Copied — paste it into the form
                          </>
                        ) : (
                          <>
                            <HiOutlineClipboardCopy /> Copy full LaTeX
                          </>
                        )}
                      </button>
                      <span className="aih-copy-all__hint">
                        Opens your clipboard — paste it into the Upload
                        Question form yourself.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function ResultBlock({ label, latex, previewHtml, fieldKey, copiedField, onCopy }) {
  return (
    <div className="aih-result-block">
      <div className="aih-result-block__header">
        <span className="aih-result-block__label">{label}</span>
        <button
          type="button"
          className="aih-copy-mini"
          onClick={() => onCopy(latex, fieldKey)}
          title={`Copy ${label} LaTeX`}
        >
          {copiedField === fieldKey ? <HiOutlineCheck /> : <HiOutlineClipboardCopy />}
          <span>{copiedField === fieldKey ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div
        className="aih-katex aih-katex--block"
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
      <details className="aih-source">
        <summary>Show LaTeX source</summary>
        <pre>
          <code>{latex}</code>
        </pre>
      </details>
    </div>
  );
}
