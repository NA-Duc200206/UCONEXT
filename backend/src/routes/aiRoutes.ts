import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiController } from '../controllers/aiController';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';

const router = Router();

const aiChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI assistant requests. Please wait a few minutes and try again.', code: 'AI_RATE_LIMITED' }
});

const aiSummaryLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI product insight requests. Please try again shortly.', code: 'AI_RATE_LIMITED' }
});

router.get('/status', aiController.getStatus);
router.post('/chat', aiChatLimiter, optionalAuthenticateToken, aiController.chat);
router.get('/history', authenticateToken, aiController.getHistory);
router.delete('/history', authenticateToken, aiController.clearHistory);
router.get('/products/:productId/summary', aiSummaryLimiter, optionalAuthenticateToken, aiController.getProductSummary);

export default router;
