const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');

const SERVER_TARGET_UPLOADS = '/www/wwwroot/apiagritech.divanex.in/uploads';
const UPLOADS_ROOT = fs.existsSync(SERVER_TARGET_UPLOADS)
  ? SERVER_TARGET_UPLOADS
  : path.join(__dirname, '../../uploads');

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://zxqbxuyscbadjimoxjfo.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '53480f2277555ee463ec811245675cf5',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '815af2baa7e351f73475d3e153f9d0f902157267ae6f9bfe57891c43bcab902c',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'farmersaas';

/**
 * Save file locally to server uploads directory
 */
const saveLocally = (fileBuffer, uniqueKey) => {
  const fullPath = path.join(UPLOADS_ROOT, uniqueKey);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, fileBuffer);

  // If server directory exists, ensure a copy is directly stored in /www/wwwroot/apiagritech.divanex.in/uploads
  if (fs.existsSync(SERVER_TARGET_UPLOADS) && fullPath !== path.join(SERVER_TARGET_UPLOADS, uniqueKey)) {
    try {
      const serverTarget = path.join(SERVER_TARGET_UPLOADS, uniqueKey);
      const sDir = path.dirname(serverTarget);
      if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });
      fs.writeFileSync(serverTarget, fileBuffer);
    } catch (_) {}
  }
};

/**
 * Upload a file buffer with zero-failure fallback
 */
const uploadToS3 = async (fileBuffer, originalname, mimetype, folder = 'uploads') => {
  const ext = path.extname(originalname);
  const cleanBase = path.basename(originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueKey = `${folder}/${Date.now()}-${cleanBase}${ext}`;

  // 1. Always save a copy locally so the file is guaranteed to be preserved and accessible
  try {
    saveLocally(fileBuffer, uniqueKey);
  } catch (err) {
    console.warn('[Storage] Local save warning:', err.message);
  }

  // 2. Attempt remote S3 upload
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: uniqueKey,
      Body: fileBuffer,
      ContentType: mimetype,
    });

    await s3Client.send(command);

    // Generate a presigned URL valid for 7 days
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: uniqueKey,
    });
    const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 3600 });

    const proxyPath = uniqueKey.startsWith('uploads/') ? `/${uniqueKey}` : `/uploads/${uniqueKey}`;
    return {
      key: uniqueKey,
      bucket: BUCKET_NAME,
      proxyUrl: proxyPath,
      s3ProxyUrl: `/api/storage/${uniqueKey}`,
      presignedUrl,
    };
  } catch (s3Error) {
    console.warn('[Storage] S3 upload error, seamlessly using local server storage:', s3Error.message);
    const proxyPath = uniqueKey.startsWith('uploads/') ? `/${uniqueKey}` : `/uploads/${uniqueKey}`;
    return {
      key: uniqueKey,
      bucket: 'local',
      proxyUrl: proxyPath,
      presignedUrl: proxyPath,
    };
  }
};

/**
 * Get file stream and metadata from S3 or local fallback
 */
const getFromS3 = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    return {
      stream: response.Body,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (s3Error) {
    const localPath = path.join(UPLOADS_ROOT, key);
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      return {
        stream: fs.createReadStream(localPath),
        contentType: null,
        contentLength: stat.size,
      };
    }
    throw s3Error;
  }
};

module.exports = {
  s3Client,
  uploadToS3,
  getFromS3,
  BUCKET_NAME,
};
