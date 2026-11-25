import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { authenticateToken, isAdmin } from '../middleware/auth';

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

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `prod_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
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

const avatarRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many avatar upload attempts. Please try again later.' },
});

const singleImageUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ message: err.message });
    }
    return res.status(err.statusCode || 400).json({
      message: err.message || 'Invalid image upload.',
    });
  });
};

const handleImageUpload = (req: any, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file uploaded.' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  return res.status(200).json({
    message: 'Image uploaded successfully.',
    imageUrl,
  });
};

router.post('/upload', authenticateToken, isAdmin, singleImageUpload, handleImageUpload);
router.post('/avatar', authenticateToken, avatarRateLimiter, singleImageUpload, handleImageUpload);

export default router;
