import mongoose from 'mongoose';

/**
 * Serverless-safe Mongoose connection.
 *
 * On Vercel each invocation may reuse a warm Lambda; without caching we'd open a
 * new connection per request and exhaust Atlas's pool. We stash the connection
 * (and the in-flight promise) on `globalThis` so it survives hot reloads in dev
 * and warm starts in production.
 */

type Cached = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as { _mongoose?: Cached };

const cached: Cached = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to .env.local (see .env.example).');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      // Fail fast instead of buffering queries while disconnected.
      bufferCommands: false,
      // Keep the serverless pool small.
      maxPoolSize: 10,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // allow a retry on the next call
    throw err;
  }

  return cached.conn;
}

/** Start a session for multi-document transactions (needs a replica set / Atlas). */
export async function startSession() {
  const conn = await connectDB();
  return conn.startSession();
}
