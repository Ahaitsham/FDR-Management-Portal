const multer = require('multer');
const { sha256 } = require('../utils/storage');

const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF, JPEG and PNG documents are allowed'));
    cb(null, true);
  }
}).single('document');

function uploadDocument(req, res, next) {
  upload(req, res, err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large (max 5 MB)' });
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ message: 'Unexpected file field' });
      return res.status(400).json({ message: 'Only PDF, JPEG and PNG documents are allowed' });
    }
    next();
  });
}

function detectedType(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

function verifyFileSignature(req, res, next) {
  if (!req.file) return next();
  const mimeType = detectedType(req.file.buffer);
  if (!mimeType || mimeType !== req.file.mimetype) return res.status(400).json({ message: 'File content does not match its type' });
  req.file.verifiedMimeType = mimeType;
  next();
}

function fileDetails(file) {
  if (!file) return null;
  return { buffer: file.buffer, mimeType: file.verifiedMimeType, sizeBytes: file.size, fileHash: sha256(file.buffer) };
}

module.exports = { uploadDocument, verifyFileSignature, fileDetails };
