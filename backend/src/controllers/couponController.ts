import { Request, Response } from 'express';
import { couponService } from '../services/couponService';
import { sendSafeError } from '../middleware/errorHandler';

export const couponController = {
  async getActiveCoupons(_req: Request, res: Response) {
    try {
      const coupons = await couponService.getActiveCoupons();
      return res.status(200).json({ coupons });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async validateCoupon(req: any, res: Response) {
    try {
      const { code, orderAmount } = req.body;
      const result = await couponService.validateCoupon(code, Number(orderAmount), req.user?._id?.toString());
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getAll(_req: Request, res: Response) {
    try {
      const coupons = await couponService.getAll();
      return res.status(200).json({ coupons });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async create(req: any, res: Response) {
    try {
      const coupon = await couponService.create(req.body, req.user?._id?.toString(), req.ip);
      return res.status(201).json({ message: 'Coupon created successfully.', coupon });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async update(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      const coupon = await couponService.update(id, req.body, req.user?._id?.toString(), req.ip);
      return res.status(200).json({ message: 'Coupon updated successfully.', coupon });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async delete(req: any, res: Response) {
    try {
      const id = req.params.id as string;
      await couponService.delete(id, req.user?._id?.toString(), req.ip);
      return res.status(200).json({ message: 'Coupon deleted successfully.' });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
