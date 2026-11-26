import { Router } from 'express';
import { wishlistController } from '../controllers/wishlistController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { toggleWishlistBodySchema } from '../schemas/misc';
import { productIdParamSchema } from '../schemas/review';

const router = Router();

router.use(authenticateToken);

router.get('/', wishlistController.getWishlist);
router.post('/toggle', validate({ body: toggleWishlistBodySchema }), wishlistController.toggleWishlist);
router.post('/:productId', validate({ params: productIdParamSchema }), wishlistController.toggleWishlist);
router.delete('/:productId', validate({ params: productIdParamSchema }), wishlistController.removeFromWishlist);

export default router;
