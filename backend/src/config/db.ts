import mongoose from 'mongoose';

let mongoServer: { getUri: () => string; stop: () => Promise<boolean> } | null = null;

export const connectDB = async (): Promise<void> => {
  try {
    const connStr = process.env.MONGODB_URI || 'mongodb://localhost:27017/nova_commerce';
    const isRemote = connStr.startsWith('mongodb+srv://') || Boolean(process.env.MONGODB_URI);
    const timeoutMs = isRemote ? 10000 : 2000;

    try {
      console.log(`⏳ Connecting to MongoDB...`);
      await mongoose.connect(connStr, { serverSelectionTimeoutMS: timeoutMs });
      console.log('✔ MongoDB connected successfully.');
    } catch (localErr: any) {
      if (process.env.NODE_ENV === 'production') {
        throw localErr;
      }
      console.warn(
        `⚠️ Primary MongoDB connection failed (${localErr?.message || 'unknown error'}). Starting MongoMemoryServer fallback (data will NOT persist across restarts)...`
      );
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create();
      const uri = mongoServer.getUri();
      console.log(`⏳ Connecting to in-memory MongoDB: ${uri}`);
      await mongoose.connect(uri);
      console.log('✔ In-memory MongoDB connected successfully.');
    }
  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};
