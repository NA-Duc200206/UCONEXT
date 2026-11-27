import { Response } from 'express';
import { orderService } from '../services/orderService';
import { sendSafeError } from '../middleware/errorHandler';

export const orderController = {
  async create(req: any, res: Response) {
    try {
      const order = await orderService.createOrder(req.user._id, req.body);
      return res.status(201).json({
        message: 'Order placed successfully.',
        order
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getMyOrders(req: any, res: Response) {
    try {
      const orders = await orderService.getMyOrders(req.user._id);
      return res.status(200).json({ orders });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getById(req: any, res: Response) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrderById(id, req.user._id, req.user.role);
      return res.status(200).json({ order });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getAll(req: any, res: Response) {
    try {
      const orders = await orderService.getAllOrders();
      return res.status(200).json({ orders });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async updateStatus(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { status, paymentStatus } = req.body;
      const order = await orderService.updateOrderStatus(
        id,
        status,
        paymentStatus,
        req.user?._id?.toString(),
        req.ip
      );
      return res.status(200).json({
        message: 'Order status updated successfully.',
        order
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async cancelOrder(req: any, res: Response) {
    try {
      const { id } = req.params;
      const order = await orderService.cancelOrder(id, req.user._id);
      return res.status(200).json({
        message: 'Order cancelled successfully.',
        order
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async requestRefund(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};
      const order = await orderService.requestRefund(id, req.user._id, reason);
      return res.status(200).json({
        message: 'Refund request submitted successfully.',
        order
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  }
};
