import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { ROLES } from '@/lib/permissions';

/**
 * One logged-in session. The cookie holds only `_id` (the token) — role and
 * allowedSections are copied here at login/permission-change time so
 * middleware can authorize with a single lookup instead of a join. Editing
 * an account's role or permissions deletes all of its sessions (see
 * lib/auth.ts) so the change takes effect immediately — a forced re-login —
 * instead of silently staying stale until the account happens to log out on
 * its own. A Mongo TTL index expires stale rows automatically, no cron needed.
 */
const SessionSchema = new Schema({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  allowedSections: { type: [String], default: [] },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Session = InferSchemaType<typeof SessionSchema>;

export const SessionModel: Model<Session> =
  (mongoose.models.Session as Model<Session>) || mongoose.model<Session>('Session', SessionSchema);
