import { Types } from 'mongoose';
import { AuditLog } from '../models';

export interface RecordAuditParams {
  userId?: string;
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}

export interface QueryAuditParams {
  page?: string | number;
  limit?: string | number;
  action?: string;
  targetType?: string;
}

export const auditService = {
  async record(params: RecordAuditParams): Promise<void> {
    const { userId, action, targetType, targetId, oldValue, newValue, ipAddress } = params;
    if (!userId || !Types.ObjectId.isValid(String(userId))) {
      return;
    }
    try {
      await AuditLog.create({
        userId: new Types.ObjectId(String(userId)) as any,
        action,
        targetType,
        targetId: String(targetId),
        oldValue,
        newValue,
        ipAddress: ipAddress || '',
      });
    } catch (err) {
      console.error('Failed to record audit log:', err);
    }
  },

  async getLogs(params: QueryAuditParams = {}) {
    const parsedPage = parseInt(String(params.page ?? '1'), 10);
    const parsedLimit = parseInt(String(params.limit ?? '20'), 10);
    const pageNum = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limitNum = Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 20;

    const query: Record<string, any> = {};
    if (params.action && typeof params.action === 'string' && params.action.trim() && params.action !== 'all') {
      query.action = params.action.trim();
    }
    if (
      params.targetType &&
      typeof params.targetType === 'string' &&
      params.targetType.trim() &&
      params.targetType !== 'all'
    ) {
      query.targetType = params.targetType.trim();
    }

    const skip = (pageNum - 1) * limitNum;
    const [logsRaw, totalLogs] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(query),
    ]);

    const logs = logsRaw.map((doc) => {
      const obj = doc.toObject();
      return {
        ...obj,
        id: obj._id,
        user: obj.userId,
      };
    });

    return {
      logs,
      totalLogs,
      totalPages: Math.max(1, Math.ceil(totalLogs / limitNum)),
      currentPage: pageNum,
      limit: limitNum,
    };
  },
};
