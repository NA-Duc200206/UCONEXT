import { Request, Response } from 'express';
import { categoryService } from '../services/categoryService';
import { sendSafeError } from '../middleware/errorHandler';

export const categoryController = {
  async getAll(_req: Request, res: Response) {
    try {
      const categories = await categoryService.getAll();
      return res.status(200).json({ categories });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async create(req: any, res: Response) {
    try {
      const { name, description } = req.body || {};
      const category = await categoryService.create(
        name,
        description,
        req.user?._id?.toString(),
        req.ip
      );
      return res.status(201).json({ message: 'Category created successfully.', category });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async update(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      const { name, description } = req.body || {};
      const category = await categoryService.update(
        id,
        name,
        description,
        req.user?._id?.toString(),
        req.ip
      );
      return res.status(200).json({ message: 'Category updated successfully.', category });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async delete(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      await categoryService.delete(id, req.user?._id?.toString(), req.ip);
      return res.status(200).json({ message: 'Category deleted successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },
};
