import { Router } from 'express';
import { wishlistController } from '../controllers/wishlistController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', wishlistController.getWishlist);
router.post('/toggle', wishlistController.toggleWishlist);
router.post('/:productId', wishlistController.toggleWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

export default router;

