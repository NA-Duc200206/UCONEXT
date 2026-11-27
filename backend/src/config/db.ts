import mongoose from 'mongoose';
import { logger } from './logger';

let mongoServer: { getUri: () => string; stop: () => Promise<boolean> } | null = null;

export const connectDB = async (): Promise<void> => {
  try {
    const connStr = process.env.MONGODB_URI || 'mongodb://localhost:27017/nova_commerce';
    const isRemote = connStr.startsWith('mongodb+srv://') || Boolean(process.env.MONGODB_URI);
    const timeoutMs = isRemote ? 10000 : 2000;

    try {
      logger.info('Connecting to MongoDB');
      await mongoose.connect(connStr, { serverSelectionTimeoutMS: timeoutMs });
      logger.info('MongoDB connected successfully');
    } catch (localErr: any) {
      if (process.env.NODE_ENV === 'production') {
        throw localErr;
      }
      logger.warn(
        { err: localErr },
        'Primary MongoDB connection failed; starting MongoMemoryServer fallback (non-persistent)'
      );
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create();
      const uri = mongoServer.getUri();
      logger.info({ uri }, 'Connecting to in-memory MongoDB');
      await mongoose.connect(uri);
      logger.info('In-memory MongoDB connected successfully');
    }
  } catch (error: any) {
    logger.fatal({ err: error }, 'MongoDB connection error');
    process.exit(1);
  }
};

export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  const client: any = mongoose.connection.getClient?.();
  const topologyType: string | undefined = client?.topology?.description?.type;
  const supportsTransactions =
    topologyType === 'ReplicaSetWithPrimary' ||
    topologyType === 'Sharded' ||
    topologyType === 'LoadBalanced';

  if (!supportsTransactions) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
