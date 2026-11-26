import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';
import { sendSafeError } from '../middleware/errorHandler';

export const aiController = {
  async getStatus(_req: AuthenticatedRequest, res: Response) {
    return res.status(200).json(aiService.getStatus());
  },

  async chat(req: AuthenticatedRequest, res: Response) {
    try {
      const { message, history, context } = req.body || {};
      const result = await aiService.chat(message, req.user, { history, context });
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500, {
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.provider ? { provider: error.provider } : {}),
        ...(error?.model ? { model: error.model } : {}),
      });
    }
  },

  async getHistory(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const result = await aiService.getHistory(String(req.user._id));
      return res.status(200).json(result);
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async clearHistory(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?._id) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const result = await aiService.clearHistory(String(req.user._id));
      return res.status(200).json({
        message: 'Chat history cleared.',
        ...result
      });
    } catch (error: any) {
      return sendSafeError(res, error, 500);
    }
  },

  async getProductSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const productId = String(req.params.productId || '');
      const insights = await aiService.getProductInsights(productId);
      return res.status(200).json(insights);
    } catch (error: any) {
      return sendSafeError(res, error, 500, {
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.provider ? { provider: error.provider } : {}),
        ...(error?.model ? { model: error.model } : {}),
      });
    }
  }
};
