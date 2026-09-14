'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import type { NoteItem } from '@/lib/notes';

function preview(text: string) {
  const t = text.trim();
  if (!t) return '(empty)';
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

/** One note: title + text, each with its own Save, plus a Delete with a confirm modal. */
function NoteCard({ note, onDeleted }: { note: NoteItem; onDeleted: (id: string) => void }) {
  const ask = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text }),
      });
      if (res.ok) setSaved(true);
      else toast.error('Could not save note');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await ask({
      title: 'Delete this note?',
      description: 'This cannot be undone.',
      details: [
        { label: 'Title', value: title.trim() || 'Untitled note' },
        { label: 'Content', value: preview(text) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Note deleted ✓');
        onDeleted(note.id);
      } else {
        toast.error('Could not delete note');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Panel
      title={title.trim() || 'Untitled note'}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">{saved ? 'Saved' : 'Unsaved changes'}</span>
          <button
            onClick={remove}
            disabled={deleting}
            title="Delete note"
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      }
    >
      <div className="space-y-2 px-5 py-4">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
          placeholder="Title (optional)"
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm font-medium text-neutral-900 transition focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white"
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={6}
          placeholder="Jot anything down here…"
          className="w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 text-sm text-neutral-900 transition focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white"
        />
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={busy || saved}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Panel>
  );
}

/** The notes list: add as many as you like, each with its own title/text/save, delete any of them. */
export function NotesPanel({ initialNotes }: { initialNotes: NoteItem[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [creating, setCreating] = useState(false);

  async function addNote() {
    setCreating(true);
    try {
      const res = await fetch('/api/notes', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.note as NoteItem, ...prev]);
      }
    } finally {
      setCreating(false);
    }
  }

  function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Notes</h2>
        <button
          onClick={addNote}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={14} /> {creating ? 'Adding…' : 'New note'}
        </button>
      </div>
      {notes.length === 0 ? (
        <Panel>
          <div className="px-5 py-8 text-center text-sm text-neutral-400">No notes yet — add one above.</div>
        </Panel>
      ) : (
        notes.map((n) => <NoteCard key={n.id} note={n} onDeleted={removeNote} />)
      )}
    </div>
  );
}
