const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://zxqbxuyscbadjimoxjfo.storage.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '53480f2277555ee463ec811245675cf5',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '815af2baa7e351f73475d3e153f9d0f902157267ae6f9bfe57891c43bcab902c',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'farmersaas';

/**
 * Upload a file buffer directly to S3
 */
const uploadToS3 = async (fileBuffer, originalname, mimetype, folder = 'uploads') => {
  const ext = path.extname(originalname);
  const cleanBase = path.basename(originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueKey = `${folder}/${Date.now()}-${cleanBase}${ext}`;

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

  return {
    key: uniqueKey,
    bucket: BUCKET_NAME,
    proxyUrl: `/api/storage/${uniqueKey}`,
    presignedUrl,
  };
};

/**
 * Get file stream and metadata from S3
 */
const getFromS3 = async (key) => {
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
};

module.exports = {
  s3Client,
  uploadToS3,
  getFromS3,
  BUCKET_NAME,
};
