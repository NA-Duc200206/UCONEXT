import { Router } from 'express';
import { couponController } from '../controllers/couponController';
import { authenticateToken, isAdmin, optionalAuthenticateToken } from '../middleware/auth';
import { couponValidateLimiter } from '../middleware/rateLimits';
import { validate } from '../middleware/validate';
import { validateCouponSchema, createCouponSchema, updateCouponSchema } from '../schemas/coupon';
import { idParamSchema } from '../schemas/common';

const router = Router();

// Public / Authenticated check
router.get('/active', couponController.getActiveCoupons);
router.post('/validate', couponValidateLimiter, optionalAuthenticateToken, validate({ body: validateCouponSchema }), couponController.validateCoupon);

// Admin CRUD
router.get('/', authenticateToken, isAdmin, couponController.getAll);
router.post('/', authenticateToken, isAdmin, validate({ body: createCouponSchema }), couponController.create);
router.put('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema, body: updateCouponSchema }), couponController.update);
router.delete('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema }), couponController.delete);

export default router;
