const multer = require('multer');
const path = require('path');

// Store file in memory buffer for instant S3 bucket upload
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|pdf|txt|csv|doc|docx/;
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype.includes('text');

  if (ext || mime) {
    return cb(null, true);
  }
  cb(new Error('File type not supported. Allowed formats: images (jpeg, png, webp), PDF, CSV, TXT documents.'));
};

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter,
});

module.exports = upload;
