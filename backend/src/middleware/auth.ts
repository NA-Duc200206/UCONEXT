import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { User } from '../models';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Authentication token not found. Please log in.' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026');
    } catch {
      return res.status(401).json({ message: 'Authentication token is invalid or expired.' });
    }

    if (!decoded?.id || !Types.ObjectId.isValid(String(decoded.id))) {
      return res.status(401).json({ message: 'Authentication token payload is invalid.' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: 'User does not exist.' });
    }

    const currentTokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
    if (typeof decoded.tv !== 'number' || decoded.tv !== currentTokenVersion) {
      return res.status(401).json({ message: 'Authentication token has been revoked.' });
    }

    req.user = user;
    return next();
  } catch (error: any) {
    return res.status(500).json({ message: 'System authentication error.' });
  }
};

export const isAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied. Administrator only.' });
};

export const isCustomer = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user && (req.user.role === 'customer' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied.' });
};

export const optionalAuthenticateToken = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026');
    if (decoded?.id && Types.ObjectId.isValid(String(decoded.id))) {
      const user = await User.findById(decoded.id);
      const currentTokenVersion = typeof user?.tokenVersion === 'number' ? user.tokenVersion : 0;
      if (user && typeof decoded.tv === 'number' && decoded.tv === currentTokenVersion) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid/expired token for optional auth endpoints
  }
  return next();
};
