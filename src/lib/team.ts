import { connectDB } from '@/lib/db';
import { AccountModel } from '@/models/Account';
import { hashPassword } from '@/lib/password';
import { destroyAllSessionsForAccount } from '@/lib/auth';
import { SECTION_HREFS, type Role } from '@/lib/permissions';

export interface AccountItem {
  id: string;
  username: string;
  role: Role;
  allowedSections: string[];
  createdAt: string;
}

function toItem(doc: {
  _id: unknown;
  username: string;
  role: string;
  allowedSections: string[];
  createdAt: Date;
}): AccountItem {
  return {
    id: String(doc._id),
    username: doc.username,
    role: doc.role as Role,
    allowedSections: doc.allowedSections,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Every account, oldest first. */
export async function listAccounts(): Promise<AccountItem[]> {
  await connectDB();
  const docs = await AccountModel.find().sort({ createdAt: 1 }).lean();
  return docs.map(toItem);
}

export async function createAccount(input: {
  username: string;
  password: string;
  role: Role;
  allowedSections?: string[];
}): Promise<AccountItem> {
  await connectDB();
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error('Username is required');
  if (!input.password || input.password.length < 6) throw new Error('Password must be at least 6 characters');
  const existing = await AccountModel.findOne({ username }).lean();
  if (existing) throw new Error('That username is already taken');

  const { hash, salt } = await hashPassword(input.password);
  // Only meaningful for VIEWER — Owner/Manager get their role's full set automatically.
  const allowedSections =
    input.role === 'VIEWER' ? (input.allowedSections ?? []).filter((s) => SECTION_HREFS.includes(s)) : [];
  const doc = await AccountModel.create({
    username,
    passwordHash: hash,
    passwordSalt: salt,
    role: input.role,
    allowedSections,
  });
  return toItem(doc.toObject());
}

export async function updateAccount(
  id: string,
  changes: { role?: Role; allowedSections?: string[]; password?: string },
): Promise<void> {
  await connectDB();
  const account = await AccountModel.findById(id);
  if (!account) throw new Error('Account not found');

  if (changes.role !== undefined && changes.role !== 'VIEWER' && account.role === 'OWNER' && changes.role !== 'OWNER') {
    const ownerCount = await AccountModel.countDocuments({ role: 'OWNER' });
    if (ownerCount <= 1) throw new Error('Cannot demote the last Owner account');
  }

  let changed = false;
  if (changes.role !== undefined && changes.role !== account.role) {
    account.role = changes.role;
    changed = true;
  }
  if (changes.allowedSections !== undefined) {
    account.allowedSections = changes.allowedSections.filter((s) => SECTION_HREFS.includes(s));
    changed = true;
  }
  if (changes.password) {
    if (changes.password.length < 6) throw new Error('Password must be at least 6 characters');
    const { hash, salt } = await hashPassword(changes.password);
    account.passwordHash = hash;
    account.passwordSalt = salt;
    changed = true;
  }
  if (!changed) return;
  await account.save();
  // Any of the above changes this account's access or credentials — force a
  // fresh login everywhere so the change takes effect immediately, instead
  // of silently staying stale until it happens to log out on its own.
  await destroyAllSessionsForAccount(id);
}

export async function deleteAccount(id: string): Promise<void> {
  await connectDB();
  const account = await AccountModel.findById(id).lean();
  if (!account) return;
  if (account.role === 'OWNER') {
    const ownerCount = await AccountModel.countDocuments({ role: 'OWNER' });
    if (ownerCount <= 1) throw new Error('Cannot delete the last Owner account');
  }
  await AccountModel.deleteOne({ _id: id });
  await destroyAllSessionsForAccount(id);
}
