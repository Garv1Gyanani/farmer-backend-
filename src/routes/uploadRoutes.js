const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { uploadToS3 } = require('../services/s3Service');

// POST /api/upload - Upload any file directly with resilient storage
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a file to upload.' });
    }

    const folder = req.body.folder || 'general';
    const s3Result = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );

    const rawHost = req.headers['x-forwarded-host'] || req.get('host') || '';
    const isLocalProxy = /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(rawHost);
    const baseUrl = isLocalProxy
      ? (process.env.PUBLIC_API_URL || 'https://apiagritech.divanex.in')
      : `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${rawHost}`;
    const absoluteFileUrl = s3Result.proxyUrl.startsWith('http')
      ? s3Result.proxyUrl
      : `${baseUrl.replace(/\/$/, '')}${s3Result.proxyUrl}`;

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      fileUrl: absoluteFileUrl,
      relativeUrl: s3Result.proxyUrl,
      presignedUrl: s3Result.presignedUrl,
      key: s3Result.key,
      bucket: s3Result.bucket,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
