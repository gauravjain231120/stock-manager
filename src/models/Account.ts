import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { ROLES } from '@/lib/permissions';

/**
 * A login. Owner/Manager get their role's fixed set of sections
 * automatically; a Viewer's `allowedSections` is the explicit, admin-picked
 * subset of sidebar sections this specific account can see and use —
 * everything else, page or API, is denied server-side regardless of what
 * URL is typed (see src/lib/permissions.ts).
 */
const AccountSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    /** Only meaningful for VIEWER — ignored for OWNER/MANAGER, which get their role's full set. */
    allowedSections: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type Account = InferSchemaType<typeof AccountSchema>;

export const AccountModel: Model<Account> =
  (mongoose.models.Account as Model<Account>) || mongoose.model<Account>('Account', AccountSchema);
