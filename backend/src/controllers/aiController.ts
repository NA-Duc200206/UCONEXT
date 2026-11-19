import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { aiService } from '../services/aiService';

export const aiController = {
  async chat(req: AuthenticatedRequest, res: Response) {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: 'Message is required.' });
      }

      const result = await aiService.chat(message, req.user);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({
        message: 'AI Assistant currently unavailable.',
        error: error.message
      });
    }
  }
};

