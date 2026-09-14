import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { ROLES } from '@/lib/permissions';

/**
 * A login. Owner gets every section automatically; a Manager or Viewer's
 * `allowedSections` is the explicit, admin-picked subset of sidebar sections
 * this specific account can see and use (Manager can edit within them,
 * Viewer is read-only) — everything else, page or API, is denied
 * server-side regardless of what URL is typed (see src/lib/permissions.ts).
 */
const AccountSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    /** Only meaningful for MANAGER/VIEWER — ignored for OWNER, which always gets every section. */
    allowedSections: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type Account = InferSchemaType<typeof AccountSchema>;

export const AccountModel: Model<Account> =
  (mongoose.models.Account as Model<Account>) || mongoose.model<Account>('Account', AccountSchema);
