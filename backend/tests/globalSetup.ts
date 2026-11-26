import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | null = null;

export async function setup() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.TEST_MONGO_URI = replSet.getUri();

  return async () => {
    if (replSet) {
      await replSet.stop();
      replSet = null;
    }
    delete process.env.TEST_MONGO_URI;
  };
}
