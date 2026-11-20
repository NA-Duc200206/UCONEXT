import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';

export const aiController = {
  async getStatus(_req: AuthenticatedRequest, res: Response) {
    return res.status(200).json(aiService.getStatus());
  },

  async chat(req: AuthenticatedRequest, res: Response) {
    try {
      const { message, history, context } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ message: 'Message is required.', code: 'BAD_REQUEST' });
      }
      if (message.trim().length > 1000) {
        return res.status(400).json({
          message: 'Message is too long (maximum 1000 characters).',
          code: 'BAD_REQUEST'
        });
      }

      const result = await aiService.chat(message, req.user, { history, context });
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'AI Assistant currently unavailable.',
        code: error.code || 'AI_ERROR',
        provider: error.provider,
        model: error.model
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
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to load AI chat history.',
        error: error.message
      });
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
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to clear AI chat history.',
        error: error.message
      });
    }
  },

  async getProductSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const productId = String(req.params.productId || '');
      const insights = await aiService.getProductInsights(productId);
      return res.status(200).json(insights);
    } catch (error: any) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Failed to generate AI product insights.',
        code: error.code || 'AI_ERROR',
        provider: error.provider,
        model: error.model
      });
    }
  }
};
