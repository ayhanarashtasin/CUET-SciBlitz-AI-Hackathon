const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');
const { cloudinary, isCloudinaryEnabled } = require('../config/cloudinary');

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENTS_PER_RECORD = 5;
const LOCAL_CLASS_DIR = path.resolve(__dirname, '..', 'uploads', 'class');
const CLOUDINARY_FOLDER = 'topkorbo/class';

const storage = multer.memoryStorage();

/**
 * Accepted upload kinds. SVG is deliberately excluded: it is an active document
 * format that executes script when opened directly, and the Cloudinary delivery
 * origin does not carry the `sandbox` CSP that protects the local /uploads path.
 * Nothing in the classroom flow needs it — mentors attach question sheets and
 * students hand in scans/photos.
 */
const FILE_KINDS = [
  {
    fileType: 'pdf',
    mimes: ['application/pdf'],
    exts: ['.pdf'],
    // %PDF-
    matches: (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-'
  },
  {
    fileType: 'image',
    mimes: ['image/jpeg', 'image/pjpeg'],
    exts: ['.jpg', '.jpeg'],
    matches: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  },
  {
    fileType: 'image',
    mimes: ['image/png'],
    exts: ['.png'],
    matches: (buf) =>
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    fileType: 'image',
    mimes: ['image/webp'],
    exts: ['.webp'],
    matches: (buf) =>
      buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
      buf.subarray(8, 12).toString('latin1') === 'WEBP'
  }
];

const ALLOWED_MIMES = new Set(FILE_KINDS.flatMap((kind) => kind.mimes));
const ALLOWED_EXTS = new Set(FILE_KINDS.flatMap((kind) => kind.exts));

function badRequest(msg) {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
}

/**
 * Gate on the declared type BEFORE buffering. Both the MIME type and the file
 * extension must be allowed *and* describe the same kind of file — checking
 * either one alone lets a caller spoof past the other. The buffer contents are
 * verified separately in `processClassUpload`, because multer's fileFilter runs
 * before any bytes have arrived.
 */
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase().split(';')[0].trim();

  if (!ALLOWED_MIMES.has(mime) || !ALLOWED_EXTS.has(ext)) {
    return cb(badRequest('Only PDF, JPG, PNG and WEBP files are allowed.'), false);
  }

  const kind = FILE_KINDS.find((item) => item.mimes.includes(mime));
  if (!kind || !kind.exts.includes(ext)) {
    return cb(badRequest('The file extension does not match its content type.'), false);
  }

  return cb(null, true);
}

const classUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10 }
});

/** Strips directory separators and anything non-portable from a display name. */
function safeDisplayName(originalName, fallback) {
  const base = path.basename(String(originalName || '')).replace(/[\r\n\t]/g, '');
  return (base || fallback).slice(0, 150);
}

/**
 * Verifies the buffered bytes really are what the request claimed, then stores
 * the file on Cloudinary (when configured) or under /uploads/class/<userId>/.
 */
async function processClassUpload(file, userId = 'common') {
  if (!file || !file.buffer || !file.buffer.length) {
    throw badRequest('No file content received.');
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  const kind = FILE_KINDS.find((item) => item.mimes.includes(mime) && item.exts.includes(ext));

  if (!kind) {
    throw badRequest('Unsupported file type.');
  }
  // Magic-byte check: the real defence against a renamed .html/.exe/.svg.
  if (!kind.matches(file.buffer)) {
    throw badRequest('The file contents do not match its type. Please re-export and try again.');
  }

  const isPdf = kind.fileType === 'pdf';
  const originalName = safeDisplayName(file.originalname, isPdf ? 'document.pdf' : `attachment${ext}`);
  // Never let a user id shape the path — it is an ObjectId, but assert it.
  const ownerKey = /^[a-fA-F0-9]{24}$/.test(String(userId || '')) ? String(userId) : 'common';
  const stem = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  if (isCloudinaryEnabled) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_FOLDER,
          resource_type: isPdf ? 'raw' : 'image',
          public_id: `${stem}-${originalName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        },
        (err, result) => {
          if (err) return reject(err);
          resolve({
            url: result.secure_url,
            name: originalName,
            fileType: kind.fileType,
            size: file.size
          });
        }
      );
      stream.end(file.buffer);
    });
  }

  const userDir = path.join(LOCAL_CLASS_DIR, ownerKey);
  // Belt-and-braces: the resolved directory must stay inside the class root.
  if (!path.resolve(userDir).startsWith(path.resolve(LOCAL_CLASS_DIR))) {
    throw badRequest('Invalid upload target.');
  }
  await fsp.mkdir(userDir, { recursive: true });

  const safeName = `${stem}${ext}`;
  await fsp.writeFile(path.join(userDir, safeName), file.buffer);

  return {
    url: `/uploads/class/${ownerKey}/${safeName}`,
    name: originalName,
    fileType: kind.fileType,
    size: file.size
  };
}

/**
 * Attachment metadata arrives as plain JSON on the note/submission/announcement
 * endpoints, so it can be forged regardless of how well the upload route is
 * guarded. Every persisted attachment must therefore point back at a URL this
 * server actually produced — anything else (an attacker-controlled host, a
 * `javascript:`/`data:` URI, a tracking pixel) is dropped here.
 */
const LOCAL_URL_RE = /^\/uploads\/class\/[a-f0-9]{24}\/[A-Za-z0-9._-]+$/i;
const CLOUDINARY_HOST = 'res.cloudinary.com';
const CLOUDINARY_PATH_RE = /^[A-Za-z0-9._/-]+$/;

function isTrustedAttachmentUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (LOCAL_URL_RE.test(url)) return true;

  // Parse rather than pattern-match the host: exact hostname equality cannot be
  // fooled by look-alikes ("res-cloudinary.com", "res.cloudinary.com.evil.tld")
  // the way a hand-escaped regex can.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === CLOUDINARY_HOST &&
    !parsed.search &&
    CLOUDINARY_PATH_RE.test(parsed.pathname) &&
    parsed.pathname.includes(`/${CLOUDINARY_FOLDER}/`)
  );
}

function sanitizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.slice(0, MAX_ATTACHMENTS_PER_RECORD).reduce((acc, item) => {
    if (!item || typeof item !== 'object') return acc;

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url || !isTrustedAttachmentUrl(url)) return acc;

    const size = Number(item.size);
    acc.push({
      url,
      name: safeDisplayName(item.name, 'attachment'),
      fileType: ['image', 'pdf', 'file'].includes(item.fileType) ? item.fileType : 'file',
      size: Number.isFinite(size) && size > 0 ? Math.min(Math.round(size), MAX_FILE_SIZE) : 0
    });
    return acc;
  }, []);
}

module.exports = {
  classUploadMiddleware,
  processClassUpload,
  sanitizeAttachments,
  isTrustedAttachmentUrl,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS_PER_RECORD
};
