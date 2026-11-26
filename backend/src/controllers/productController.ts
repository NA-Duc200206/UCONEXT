import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { productService } from '../services/productService';
import { sendSafeError } from '../middleware/errorHandler';

export const productController = {
  async getRecommended(req: AuthenticatedRequest, res: Response) {
    try {
      const limitParam = req.query.limit ? Number(req.query.limit) : 8;
      const result = await productService.getRecommended(req.user, limitParam);
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },
  async getAll(req: Request, res: Response) {
    try {
      const result = await productService.getAll(req.query as any);
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const result = await productService.getById(id);
      return res.status(200).json({ product: result });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async create(req: any, res: Response) {
    try {
      const product = await productService.create(req.body, req.user?._id?.toString(), req.ip);
      return res.status(201).json({ message: 'Product added successfully.', product });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async update(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      const product = await productService.update(id, req.body, req.user?._id?.toString(), req.ip);
      return res.status(200).json({ message: 'Product updated successfully.', product });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async delete(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      await productService.delete(id, req.user?._id?.toString(), req.ip);
      return res.status(200).json({ message: 'Product deleted successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
