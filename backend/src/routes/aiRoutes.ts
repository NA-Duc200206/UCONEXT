import { Router } from 'express';
import { aiController } from '../controllers/aiController';
import { optionalAuthenticateToken } from '../middleware/auth';

const router = Router();

router.post('/chat', optionalAuthenticateToken, aiController.chat);

export default router;

