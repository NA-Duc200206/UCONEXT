import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController';
import { authenticateToken, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditLogsQuerySchema } from '../schemas/misc';

const router = Router();

router.get('/dashboard', authenticateToken, isAdmin, analyticsController.getDashboard);
router.get('/audit-logs', authenticateToken, isAdmin, validate({ query: auditLogsQuerySchema }), analyticsController.getAuditLogs);

export default router;
