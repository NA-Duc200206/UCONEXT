import { Router } from 'express';
import { aiController } from '../controllers/aiController';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';
import { aiChatLimiter, aiSummaryLimiter } from '../middleware/rateLimits';
import { validate } from '../middleware/validate';
import { aiChatSchema, aiProductParamSchema } from '../schemas/ai';

const router = Router();

router.get('/status', aiController.getStatus);
router.post('/chat', optionalAuthenticateToken, aiChatLimiter, validate({ body: aiChatSchema }), aiController.chat);
router.get('/history', authenticateToken, aiController.getHistory);
router.delete('/history', authenticateToken, aiController.clearHistory);
router.get('/products/:productId/summary', optionalAuthenticateToken, aiSummaryLimiter, validate({ params: aiProductParamSchema }), aiController.getProductSummary);

export default router;
