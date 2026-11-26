import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService';
import { sendSafeError } from '../middleware/errorHandler';

export const paymentController = {
  getMethods(_req: Request, res: Response) {
    return res.status(200).json(paymentService.getAvailableMethods());
  },

  async createPaymentUrl(req: any, res: Response) {
    try {
      const { id } = req.params;
      const ipAddr = req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const paymentUrl = await paymentService.createPaymentUrl(
        id,
        ipAddr as string,
        req.user?._id?.toString(),
        req.user?.role
      );
      return res.status(200).json({ paymentUrl });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async verifyPayment(req: Request, res: Response) {
    try {
      const result = await paymentService.verifyPayment(req.query);
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500, { success: false });
    }
  },

  async vnpayIpn(req: Request, res: Response) {
    try {
      const result = await paymentService.handleIpn(req.query);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error('[VNPAY IPN Error]', error);
      return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
  }
};
