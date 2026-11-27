import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../config/logger';

export type ImageUploadKind = 'product' | 'avatar';

const ALLOWED_MAGIC_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_DIMENSION_BY_KIND: Record<ImageUploadKind, number> = {
  product: 2000,
  avatar: 800,
};

const LOCAL_UPLOAD_ROOT = path.resolve(__dirname, '../../public/uploads');

let cachedS3Client: S3Client | null = null;

function createStorageError(message: string, statusCode = 400) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getStorageDriver(): 'local' | 'r2' {
  const driver = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  return driver === 'r2' ? 'r2' : 'local';
}

function getR2Client(): { client: S3Client; bucket: string; publicUrl: string } {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicUrl = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw createStorageError('Object storage (R2) is not fully configured.', 500);
  }

  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  return { client: cachedS3Client, bucket, publicUrl };
}

export async function sanitizeAndReencodeImage(
  inputBuffer: Buffer,
  kind: ImageUploadKind
): Promise<Buffer> {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw createStorageError('Uploaded image file is empty.', 400);
  }

  // Inspect actual file magic bytes rather than trusting filename extension or MIME header
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(inputBuffer);
  if (!detected || !ALLOWED_MAGIC_MIMES.has(detected.mime)) {
    throw createStorageError(
      'Invalid image content. Only authentic JPEG, PNG, WebP, or GIF images are allowed.',
      400
    );
  }

  const maxDim = MAX_DIMENSION_BY_KIND[kind] || 2000;
  try {
    // Re-encode to WebP; omitting withMetadata() strips all EXIF/GPS/IPTC metadata
    return await sharp(inputBuffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw createStorageError('Uploaded file could not be decoded as a valid image.', 400);
  }
}

export function extractStorageKeyFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/')) {
    const key = trimmed.slice('/uploads/'.length);
    return key && !key.includes('..') ? key : null;
  }
  const r2PublicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (r2PublicBase && trimmed.startsWith(`${r2PublicBase}/`)) {
    const key = trimmed.slice(r2PublicBase.length + 1);
    return key && !key.includes('..') ? key : null;
  }
  return null;
}

export const storageService = {
  async putImage(buffer: Buffer, kind: ImageUploadKind): Promise<{ url: string; key: string }> {
    const processedBuffer = await sanitizeAndReencodeImage(buffer, kind);
    const key = `${kind}/${crypto.randomUUID()}.webp`;

    if (getStorageDriver() === 'r2') {
      const { client, bucket, publicUrl } = getR2Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: processedBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      return { url: `${publicUrl}/${key}`, key };
    }

    const diskPath = path.resolve(LOCAL_UPLOAD_ROOT, key);
    if (!diskPath.startsWith(LOCAL_UPLOAD_ROOT + path.sep)) {
      throw createStorageError('Invalid storage path.', 400);
    }
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, processedBuffer);
    return { url: `/uploads/${key}`, key };
  },

  async deleteObject(key: string): Promise<void> {
    if (!key || typeof key !== 'string' || key.includes('..')) return;

    if (getStorageDriver() === 'r2') {
      const { client, bucket } = getR2Client();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return;
    }

    const diskPath = path.resolve(LOCAL_UPLOAD_ROOT, key);
    if (!diskPath.startsWith(LOCAL_UPLOAD_ROOT + path.sep)) return;
    try {
      await fs.unlink(diskPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        logger.error({ err }, 'Failed to delete local media file');
      }
    }
  },
};
