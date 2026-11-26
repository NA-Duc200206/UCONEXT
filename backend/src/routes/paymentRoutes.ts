import { Router } from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';

const router = Router();

router.get('/methods', paymentController.getMethods);
router.post('/create-payment-url/:id', authenticateToken, validate({ params: idParamSchema }), paymentController.createPaymentUrl);
router.get('/verify-payment', paymentController.verifyPayment);
router.get('/vnpay_ipn', paymentController.vnpayIpn);

export default router;
