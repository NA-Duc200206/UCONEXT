import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticateToken, isAdmin } from '../middleware/auth';
import { authLimiter, refreshLimiter } from '../middleware/rateLimits';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  registerSchema,
  firebaseLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
  updatePreferencesSchema,
  updateUserRoleSchema,
} from '../schemas/auth';
import { syncCartSchema } from '../schemas/cart';
import { addAddressSchema, updateAddressSchema, addressIdParamSchema } from '../schemas/address';
import { idParamSchema } from '../schemas/common';
import { productIdParamSchema } from '../schemas/review';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/firebase', authLimiter, validate({ body: firebaseLoginSchema }), authController.loginWithFirebase);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', authenticateToken, authController.logoutAll);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), authController.resetPassword);
router.get('/me', authenticateToken, authController.getProfile);
router.put('/me', authenticateToken, validate({ body: updateProfileSchema }), authController.updateProfile);
router.put('/password', authLimiter, authenticateToken, validate({ body: changePasswordSchema }), authController.changePassword);
router.put('/cart', authenticateToken, validate({ body: syncCartSchema }), authController.syncCart);
router.put('/preferences', authenticateToken, validate({ body: updatePreferencesSchema }), authController.updatePreferences);
router.get('/addresses', authenticateToken, authController.getAddresses);
router.post('/addresses', authenticateToken, validate({ body: addAddressSchema }), authController.addAddress);
router.put('/addresses/:addressId', authenticateToken, validate({ params: addressIdParamSchema, body: updateAddressSchema }), authController.updateAddress);
router.delete('/addresses/:addressId', authenticateToken, validate({ params: addressIdParamSchema }), authController.deleteAddress);
router.get('/recently-viewed', authenticateToken, authController.getRecentlyViewed);
router.post('/recently-viewed/:productId', authenticateToken, validate({ params: productIdParamSchema }), authController.recordRecentlyViewed);
router.delete('/recently-viewed', authenticateToken, authController.clearRecentlyViewed);

// Admin User Management
router.get('/users', authenticateToken, isAdmin, authController.getAllUsers);
router.put('/users/:id/role', authenticateToken, isAdmin, validate({ params: idParamSchema, body: updateUserRoleSchema }), authController.updateUserRole);

export default router;
