'use client';

import { useState } from 'react';
import { Panel } from '@/components/ui';

/** A free-text scratchpad — type anything, hit Save, it's there next time. */
export function NotesPanel({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Notes" actions={<span className="text-xs text-neutral-400">{saved ? 'Saved' : 'Unsaved changes'}</span>}>
      <div className="px-5 py-4">
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
        <div className="mt-2 flex justify-end">
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
