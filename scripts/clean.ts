/**
 * Reset the database to a clean slate: empties EVERY collection, then re-creates
 * the system locations (MAIN / QUARANTINE / DAMAGED) so the app is immediately
 * usable. Runs against whatever MONGODB_URI is set in .env.local.
 *
 *   npm run clean
 *
 * Use this to clear demo/test data before entering real data.
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { ensureSystemLocations } from './setup-locations';

config({ path: '.env.local' });

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  // Safety guard: this permanently deletes ALL data. Require explicit confirmation
  // so it can never wipe a live database by accident.
  if (process.env.CONFIRM_CLEAN !== 'yes') {
    console.log(`Refusing to clean "${mongoose.connection.name}" without confirmation.`);
    console.log('This permanently deletes ALL data. If you are sure, run:\n');
    console.log('  CONFIRM_CLEAN=yes npm run clean\n');
    return;
  }

  console.log(`Cleaning database: ${mongoose.connection.name}\n`);

  const collections = await db.listCollections().toArray();
  let total = 0;
  for (const c of collections) {
    const res = await db.collection(c.name).deleteMany({});
    total += res.deletedCount ?? 0;
    if (res.deletedCount) console.log(`  removed ${String(res.deletedCount).padStart(5)}  ${c.name}`);
  }
  console.log(`\nTotal documents removed: ${total}`);

  await ensureSystemLocations();
  console.log('Re-created system locations (MAIN / QUARANTINE / DAMAGED).');
  console.log('\nClean slate ready. Add real data via the Stock Log, Products page, or `npm run import`.');
}

main()
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
