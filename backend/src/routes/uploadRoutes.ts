import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateToken, isAdmin } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimits';
import { sendSafeError } from '../middleware/errorHandler';
import { extractStorageKeyFromUrl, storageService } from '../services/storageService';

const router = Router();

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isAllowedImageFile(originalname: string, mimetype: string): boolean {
  if (typeof originalname !== 'string' || typeof mimetype !== 'string') {
    return false;
  }
  const ext = path.extname(originalname).toLowerCase();
  const mime = mimetype.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext) && ALLOWED_IMAGE_MIMES.has(mime);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (isAllowedImageFile(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      const error: any = new Error('Only raster image files (jpg, jpeg, png, webp, gif) are allowed.');
      error.statusCode = 400;
      cb(error);
    }
  },
});

const singleImageUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ message: err.message });
    }
    return sendSafeError(res, err, 400);
  });
};

const handleProductUpload = async (req: any, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }
    const { url, key } = await storageService.putImage(req.file.buffer, 'product');
    return res.status(200).json({
      message: 'Image uploaded successfully.',
      imageUrl: url,
      key,
    });
  } catch (error: any) {
    return sendSafeError(res, error, 500);
  }
};

const handleAvatarUpload = async (req: any, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'No image file uploaded.' });
    }
    const previousAvatarKey = extractStorageKeyFromUrl(req.user?.avatar);
    const { url, key } = await storageService.putImage(req.file.buffer, 'avatar');

    if (req.user) {
      req.user.avatar = url;
      await req.user.save();
    }

    if (previousAvatarKey && previousAvatarKey !== key) {
      storageService.deleteObject(previousAvatarKey).catch((err) => {
        console.error('Failed to remove previous avatar:', err?.message || err);
      });
    }

    return res.status(200).json({
      message: 'Image uploaded successfully.',
      imageUrl: url,
      key,
    });
  } catch (error: any) {
    return sendSafeError(res, error, 500);
  }
};

router.post('/upload', authenticateToken, isAdmin, uploadLimiter, singleImageUpload, handleProductUpload);
router.post('/avatar', authenticateToken, uploadLimiter, singleImageUpload, handleAvatarUpload);

export default router;
