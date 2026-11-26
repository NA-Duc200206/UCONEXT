import { Request, Response } from 'express';
import { analyticsService } from '../services/analyticsService';
import { auditService } from '../services/auditService';
import { sendSafeError } from '../middleware/errorHandler';

export const analyticsController = {
  async getDashboard(_req: Request, res: Response) {
    try {
      const data = await analyticsService.getDashboardStats();
      return res.status(200).json(data);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getAuditLogs(req: Request, res: Response) {
    try {
      const data = await auditService.getLogs(req.query as any);
      return res.status(200).json(data);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },
};
