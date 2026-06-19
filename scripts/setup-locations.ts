/**
 * Ensures the system locations exist. Safe to run repeatedly (idempotent upsert).
 *   MAIN        your sellable warehouse stock
 *   QUARANTINE  returns landed but not yet graded
 *   DAMAGED     graded-damaged / write-off
 *
 * Run:  npm run setup:locations
 */
import { config } from 'dotenv';
import { connectDB } from '@/lib/db';
import { LocationModel } from '@/models/Location';
import { SystemLocation } from '@/lib/constants';
import mongoose from 'mongoose';

config({ path: '.env.local' });

const SYSTEM_LOCATIONS = [
  { code: SystemLocation.MAIN, name: 'Main Warehouse', kind: 'SELLABLE' as const },
  { code: SystemLocation.QUARANTINE, name: 'Returns Quarantine', kind: 'QUARANTINE' as const },
  { code: SystemLocation.DAMAGED, name: 'Damaged / Write-off', kind: 'DAMAGED' as const },
];

export async function ensureSystemLocations() {
  await connectDB();
  for (const loc of SYSTEM_LOCATIONS) {
    await LocationModel.updateOne(
      { code: loc.code },
      { $setOnInsert: { name: loc.name, kind: loc.kind, active: true } },
      { upsert: true },
    );
  }
}

async function main() {
  await ensureSystemLocations();
  const all = await LocationModel.find().lean();
  console.log('Locations:');
  for (const l of all) console.log(`  ${l.code.padEnd(11)} ${l.kind.padEnd(10)} ${l.name}`);
}

// Run as a script only when invoked directly (not when imported by import.ts).
if (process.argv[1] && process.argv[1].endsWith('setup-locations.ts')) {
  main()
    .then(() => mongoose.connection.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
