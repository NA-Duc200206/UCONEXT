import { Router } from 'express';
import { orderController } from '../controllers/orderController';
import { authenticateToken, isAdmin } from '../middleware/auth';
import { orderLimiter } from '../middleware/rateLimits';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderStatusSchema, refundRequestSchema } from '../schemas/order';
import { idParamSchema } from '../schemas/common';

const router = Router();

router.post('/', authenticateToken, orderLimiter, validate({ body: createOrderSchema }), orderController.create);
router.get('/my-orders', authenticateToken, orderController.getMyOrders);
router.put('/:id/cancel', authenticateToken, validate({ params: idParamSchema }), orderController.cancelOrder);
router.post('/:id/refund-request', authenticateToken, validate({ params: idParamSchema, body: refundRequestSchema }), orderController.requestRefund);
router.get('/:id', authenticateToken, validate({ params: idParamSchema }), orderController.getById);
router.get('/', authenticateToken, isAdmin, orderController.getAll);
router.put('/:id/status', authenticateToken, isAdmin, validate({ params: idParamSchema, body: updateOrderStatusSchema }), orderController.updateStatus);

export default router;
