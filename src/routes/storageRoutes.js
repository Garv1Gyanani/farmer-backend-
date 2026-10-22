const express = require('express');
const router = express.Router();
const { getFromS3 } = require('../services/s3Service');

// Stream file from S3 bucket via permanent proxy URL
router.get('/*', async (req, res, next) => {
  try {
    const key = req.params[0];
    if (!key) {
      return res.status(400).json({ success: false, message: 'File key required' });
    }

    const { stream, contentType, contentLength } = await getFromS3(key);

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    stream.pipe(res);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: 'File not found in S3 bucket' });
    }
    next(error);
  }
});

module.exports = router;
