import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { seedDatabase } from '../config/seed';

async function runSeedCli() {
  const isProd = process.env.NODE_ENV === 'production';
  const allowProdSeed = process.env.ALLOW_PROD_SEED?.trim().toLowerCase() === 'true';

  if (isProd && !allowProdSeed) {
    console.error('❌ Refusing to run database seed in production without ALLOW_PROD_SEED=true.');
    process.exit(1);
  }

  await connectDB();
  try {
    await seedDatabase();
  } finally {
    await mongoose.disconnect();
  }
}

runSeedCli().catch((err) => {
  console.error('❌ Seed CLI failed:', err?.message || err);
  process.exit(1);
});
