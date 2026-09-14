'use client';

import { FormEvent, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { dateOnly } from '@/lib/format';
import { SECTIONS, ROLES, type Role } from '@/lib/permissions';
import type { AccountItem } from '@/lib/team';

const input =
  'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const roleTone: Record<Role, 'good' | 'default' | 'warn'> = { OWNER: 'good', MANAGER: 'default', VIEWER: 'warn' };
const roleLabel: Record<Role, string> = { OWNER: 'Owner', MANAGER: 'Manager', VIEWER: 'Viewer' };

function sectionsLabel(role: Role, allowedSections: string[]) {
  if (role === 'OWNER') return 'All sections';
  if (allowedSections.length === 0) return 'None yet';
  return SECTIONS.filter((s) => allowedSections.includes(s.href))
    .map((s) => s.label)
    .join(', ');
}

/** A checkbox grid for picking a Viewer's allowed sections — shared by the add-form and the edit row. */
function SectionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(href: string) {
    onChange(value.includes(href) ? value.filter((v) => v !== href) : [...value, href]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <label
          key={s.href}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            value.includes(s.href)
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200'
              : 'border-black/15 text-neutral-600 dark:border-white/20 dark:text-neutral-300'
          }`}
        >
          <input type="checkbox" checked={value.includes(s.href)} onChange={() => toggle(s.href)} className="accent-brand-600" />
          {s.label}
        </label>
      ))}
    </div>
  );
}

interface EditDraft {
  role: Role;
  allowedSections: string[];
  password: string;
}

/** Owner-only: create/edit/delete Manager and Viewer accounts, and pick each one's allowed sections. */
export function TeamPanel({ initialAccounts }: { initialAccounts: AccountItem[] }) {
  const ask = useConfirm();
  const toast = useToast();
  const [accounts, setAccounts] = useState(initialAccounts);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('MANAGER');
  const [allowedSections, setAllowedSections] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addAccount(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 6) {
      toast.error('Enter a username and a password of at least 6 characters');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role, allowedSections: role !== 'OWNER' ? allowedSections : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts((prev) => [...prev, data.account as AccountItem]);
        setUsername('');
        setPassword('');
        setRole('MANAGER');
        setAllowedSections([]);
        toast.success('Account created ✓');
      } else {
        toast.error(data?.error || 'Could not create account');
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(a: AccountItem) {
    setEditingId(a.id);
    setDraft({ role: a.role, allowedSections: a.allowedSections, password: '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(a: AccountItem) {
    if (!draft) return;
    if (draft.password && draft.password.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/accounts/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: draft.role,
          allowedSections: draft.allowedSections,
          password: draft.password || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, role: draft.role, allowedSections: draft.role !== 'OWNER' ? draft.allowedSections : [] } : x)),
        );
        toast.success(`Updated ✓ — ${a.username} will need to log in again for this to take effect`);
        cancelEdit();
      } else {
        toast.error(data?.error || 'Could not update account');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: AccountItem) {
    const ok = await ask({
      title: 'Delete this account?',
      description: 'This cannot be undone. Any of their sessions are ended immediately.',
      details: [
        { label: 'Username', value: a.username },
        { label: 'Role', value: roleLabel[a.role] },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/accounts/${a.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts((prev) => prev.filter((x) => x.id !== a.id));
        toast.success('Account deleted ✓');
      } else {
        toast.error(data?.error || 'Could not delete account');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Team</h1>
        <p className="text-sm text-neutral-500">
          Create Manager and Viewer logins, and pick which sections each one can access — everything else is
          blocked, page and API, even by URL. Manager can edit within their sections; Viewer can only look, never
          change anything, even by calling the API directly.
        </p>
      </div>

      <form onSubmit={addAccount} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. priya" className={input} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Password
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={input}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={input}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={adding}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={15} /> {adding ? 'Adding…' : 'Add account'}
          </button>
        </div>
        {role !== 'OWNER' ? (
          <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
            <div className="mb-2 text-xs text-neutral-500">
              Sections this account can access {role === 'VIEWER' ? '(view only)' : '(can edit)'}
            </div>
            <SectionPicker value={allowedSections} onChange={setAllowedSections} />
          </div>
        ) : null}
      </form>

      <Panel title={`Accounts (${accounts.length})`}>
        <Table head={<><Th>Username</Th><Th>Role</Th><Th>Sections</Th><Th>Created</Th><Th right>Action</Th></>}>
          {accounts.map((a) => {
            const editing = editingId === a.id;
            const busy = busyId === a.id;
            if (editing && draft) {
              return (
                <Tr key={a.id}>
                  <Td colSpan={5}>
                    <div className="space-y-3 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium">{a.username}</span>
                        <select
                          value={draft.role}
                          onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
                          className={input}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel[r]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={draft.password}
                          onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                          placeholder="New password (leave blank to keep current)"
                          className={`${input} min-w-[16rem] flex-1`}
                        />
                      </div>
                      {draft.role !== 'OWNER' ? (
                        <div>
                          <div className="mb-1.5 text-xs text-neutral-500">
                            Sections {draft.role === 'VIEWER' ? '(view only)' : '(can edit)'}
                          </div>
                          <SectionPicker value={draft.allowedSections} onChange={(v) => setDraft({ ...draft, allowedSections: v })} />
                        </div>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => saveEdit(a)}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                        >
                          <Check size={13} /> Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
                        >
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  </Td>
                </Tr>
              );
            }
            return (
              <Tr key={a.id}>
                <Td>{a.username}</Td>
                <Td>
                  <Badge tone={roleTone[a.role]}>{roleLabel[a.role]}</Badge>
                </Td>
                <Td className="text-neutral-500">{sectionsLabel(a.role, a.allowedSections)}</Td>
                <Td className="text-neutral-500">{dateOnly(a.createdAt)}</Td>
                <Td right>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => startEdit(a)}
                      disabled={busy}
                      className="inline-flex size-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => remove(a)}
                      disabled={busy}
                      className="inline-flex size-7 items-center justify-center rounded-md text-red-600 transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}
