import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let fallbackServer: MongoMemoryServer | null = null;

export async function connectTestDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const sharedUri = process.env.TEST_MONGO_URI;
  if (sharedUri) {
    await mongoose.connect(sharedUri);
    return;
  }

  fallbackServer = await MongoMemoryServer.create();
  await mongoose.connect(fallbackServer.getUri());
}

export async function clearTestDB() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

export async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (fallbackServer) {
    await fallbackServer.stop();
    fallbackServer = null;
  }
}
