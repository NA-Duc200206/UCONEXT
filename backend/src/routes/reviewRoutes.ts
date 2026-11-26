import { Router } from 'express';
import { reviewController } from '../controllers/reviewController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { addReviewSchema, productIdParamSchema } from '../schemas/review';
import { idParamSchema } from '../schemas/common';

const router = Router();

router.get('/product/:productId', validate({ params: productIdParamSchema }), reviewController.getProductReviews);
router.post('/', authenticateToken, validate({ body: addReviewSchema }), reviewController.addReview);
router.delete('/:id', authenticateToken, validate({ params: idParamSchema }), reviewController.deleteReview);

export default router;
