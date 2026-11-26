import { Request, Response, CookieOptions } from 'express';
import { authService } from '../services/authService';
import { sendSafeError } from '../middleware/errorHandler';

const REFRESH_COOKIE_NAME = 'uc_rt';

function parseDurationMs(raw: string, fallbackMs: number): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(raw.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] || 1000);
}

function getRefreshCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = parseDurationMs(
    process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    7 * 24 * 60 * 60 * 1000
  );
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge,
  };
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

function clearRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...clearOpts } = getRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOpts);
}

function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || '';
}

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const ipAddress = getClientIp(req);
      const result = await authService.login(email, password, ipAddress);

      setRefreshCookie(res, result.refreshToken);
      return res.status(200).json({
        message: 'Login successful.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;
      const ipAddress = getClientIp(req);
      const result = await authService.register(name, email, password, ipAddress);

      setRefreshCookie(res, result.refreshToken);
      return res.status(201).json({
        message: 'Registration successful.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getProfile(req: any, res: Response) {
    try {
      const formattedUser = await authService.getProfile(req.user);
      return res.status(200).json({ user: formattedUser });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async syncCart(req: any, res: Response) {
    try {
      const { cart } = req.body;
      await authService.syncCart(req.user, cart);
      return res.status(200).json({ message: 'Cart synchronized successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async updateProfile(req: any, res: Response) {
    try {
      const updated = await authService.updateProfile(req.user, req.body);
      return res.status(200).json({ message: 'Profile updated successfully.', user: updated });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async changePassword(req: any, res: Response) {
    try {
      await authService.changePassword(req.user, req.body);
      clearRefreshCookie(res);
      return res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async loginWithFirebase(req: Request, res: Response) {
    try {
      const { idToken } = req.body || {};
      const ipAddress = getClientIp(req);
      const result = await authService.loginWithFirebase(idToken, ipAddress);

      setRefreshCookie(res, result.refreshToken);
      return res.status(200).json({
        message: 'Sign-in successful.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      const result = await authService.refreshSession(refreshToken);
      setRefreshCookie(res, result.refreshToken);
      return res.status(200).json({
        message: 'Session refreshed.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      clearRefreshCookie(res);
      return sendSafeError(res, error, 401);
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      await authService.logout(refreshToken);
      clearRefreshCookie(res);
      return res.status(200).json({ message: 'Logged out successfully.' });
    } catch (error: any) {
      clearRefreshCookie(res);
      return sendSafeError(res, error, 500);
    }
  },

  async logoutAll(req: any, res: Response) {
    try {
      await authService.logoutAll(req.user._id.toString(), getClientIp(req));
      clearRefreshCookie(res);
      return res.status(200).json({ message: 'Logged out from all sessions.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const clientOrigin = req.headers.origin;
      await authService.forgotPassword(email, clientOrigin);
      return res.status(200).json({
        message: 'If an account exists for that email, password reset instructions have been sent.'
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;
      const ipAddress = getClientIp(req);
      await authService.resetPassword(token, newPassword, ipAddress);
      clearRefreshCookie(res);
      return res.status(200).json({ message: 'Your password has been reset. Please sign in.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getAllUsers(_req: Request, res: Response) {
    try {
      const users = await authService.getAllUsers();
      return res.status(200).json({ users });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async updateUserRole(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      const { role } = req.body;
      const user = await authService.updateUserRole(id, role, req.user?._id?.toString(), getClientIp(req));
      return res.status(200).json({ message: 'User role updated successfully.', user });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async updatePreferences(req: any, res: Response) {
    try {
      const user = await authService.updatePreferences(req.user, req.body?.preferredCategories);
      return res.status(200).json({
        message: 'Preferences updated successfully.',
        preferredCategories: user.preferredCategories,
        user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getAddresses(req: any, res: Response) {
    try {
      const addresses = await authService.getAddresses(req.user);
      return res.status(200).json({ addresses });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async addAddress(req: any, res: Response) {
    try {
      const user = await authService.addAddress(req.user, req.body);
      return res.status(201).json({
        message: 'Address added successfully.',
        addresses: user.savedAddresses,
        user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async updateAddress(req: any, res: Response) {
    try {
      const addressId = req.params.addressId as string;
      const user = await authService.updateAddress(req.user, addressId, req.body);
      return res.status(200).json({
        message: 'Address updated successfully.',
        addresses: user.savedAddresses,
        user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async deleteAddress(req: any, res: Response) {
    try {
      const addressId = req.params.addressId as string;
      const user = await authService.deleteAddress(req.user, addressId);
      return res.status(200).json({
        message: 'Address deleted successfully.',
        addresses: user.savedAddresses,
        user
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getRecentlyViewed(req: any, res: Response) {
    try {
      const products = await authService.getRecentlyViewed(req.user._id.toString());
      return res.status(200).json({ products });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async recordRecentlyViewed(req: any, res: Response) {
    try {
      const productId = req.params.productId as string;
      const products = await authService.recordRecentlyViewed(req.user._id.toString(), productId);
      return res.status(200).json({
        message: 'Recently viewed updated.',
        products
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async clearRecentlyViewed(req: any, res: Response) {
    try {
      const products = await authService.clearRecentlyViewed(req.user._id.toString());
      return res.status(200).json({
        message: 'Recently viewed history cleared.',
        products
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
