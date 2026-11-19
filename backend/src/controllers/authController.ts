import { Request, Response } from 'express';
import { authService } from '../services/authService';

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || '';
      const result = await authService.login(email, password, ipAddress);

      return res.status(200).json({
        message: 'Login successful.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Login failed.',
        error: error.message
      });
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || '';
      const result = await authService.register(name, email, password, ipAddress);

      return res.status(201).json({
        message: 'Registration successful.',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Registration failed.',
        error: error.message
      });
    }
  },

  async getProfile(req: any, res: Response) {
    try {
      const formattedUser = await authService.getProfile(req.user);
      return res.status(200).json({ user: formattedUser });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to retrieve profile.',
        error: error.message
      });
    }
  },

  async syncCart(req: any, res: Response) {
    try {
      const { cart } = req.body;
      await authService.syncCart(req.user, cart);
      return res.status(200).json({ message: 'Cart synchronized successfully.' });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to sync cart.',
        error: error.message
      });
    }
  },

  async updateProfile(req: any, res: Response) {
    try {
      const updated = await authService.updateProfile(req.user, req.body);
      return res.status(200).json({ message: 'Profile updated successfully.', user: updated });
    } catch (error: any) {
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to update profile.',
        error: error.message
      });
    }
  },

  async changePassword(req: any, res: Response) {
    try {
      await authService.changePassword(req.user, req.body);
      return res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error: any) {
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to change password.',
        error: error.message
      });
    }
  },

  async getAllUsers(req: Request, res: Response) {
    try {
      const users = await authService.getAllUsers();
      return res.status(200).json({ users });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to retrieve users.',
        error: error.message
      });
    }
  },

  async updateUserRole(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { role } = req.body;
      const user = await authService.updateUserRole(id, role);
      return res.status(200).json({ message: 'User role updated successfully.', user });
    } catch (error: any) {
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to update user role.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to update preferences.',
        error: error.message
      });
    }
  },

  async getAddresses(req: any, res: Response) {
    try {
      const addresses = await authService.getAddresses(req.user);
      return res.status(200).json({ addresses });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to retrieve saved addresses.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to add address.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to update address.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to delete address.',
        error: error.message
      });
    }
  },

  async getRecentlyViewed(req: any, res: Response) {
    try {
      const products = await authService.getRecentlyViewed(req.user._id.toString());
      return res.status(200).json({ products });
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to retrieve recently viewed products.',
        error: error.message
      });
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
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Failed to record recently viewed product.',
        error: error.message
      });
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
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to clear recently viewed history.',
        error: error.message
      });
    }
  }
};
