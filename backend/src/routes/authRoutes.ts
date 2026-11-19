import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/authController';
import { authenticateToken, isAdmin } from '../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.post('/firebase', authLimiter, authController.loginWithFirebase);
router.post('/google', authLimiter, authController.loginWithGoogle);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.get('/me', authenticateToken, authController.getProfile);
router.put('/me', authenticateToken, authController.updateProfile);
router.put('/password', authLimiter, authenticateToken, authController.changePassword);
router.put('/cart', authenticateToken, authController.syncCart);
router.put('/preferences', authenticateToken, authController.updatePreferences);
router.get('/addresses', authenticateToken, authController.getAddresses);
router.post('/addresses', authenticateToken, authController.addAddress);
router.put('/addresses/:addressId', authenticateToken, authController.updateAddress);
router.delete('/addresses/:addressId', authenticateToken, authController.deleteAddress);
router.get('/recently-viewed', authenticateToken, authController.getRecentlyViewed);
router.post('/recently-viewed/:productId', authenticateToken, authController.recordRecentlyViewed);
router.delete('/recently-viewed', authenticateToken, authController.clearRecentlyViewed);

// Admin User Management
router.get('/users', authenticateToken, isAdmin, authController.getAllUsers);
router.put('/users/:id/role', authenticateToken, isAdmin, authController.updateUserRole);

export default router;
