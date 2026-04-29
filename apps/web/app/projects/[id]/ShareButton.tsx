'use client';
import { useState } from 'react';

export default function ShareButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<'view' | 'comment' | 'edit'>('view');
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await fetch(`/api/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setBusy(false);
    if (r.ok) {
      const j = await r.json();
      setUrl(j.url);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
      >
        Share
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-80 rounded border border-white/10 bg-black/90 p-3 shadow-xl">
          <p className="mb-2 text-xs text-[var(--muted)]">
            Anyone with the link will get the selected role.
          </p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'view' | 'comment' | 'edit')}
            className="mb-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm"
          >
            <option value="view">View</option>
            <option value="comment">Comment</option>
            <option value="edit">Edit</option>
          </select>
          <button
            onClick={create}
            disabled={busy}
            className="mb-2 w-full rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create link'}
          </button>
          {url ? (
            <div>
              <input
                readOnly
                value={url}
                className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="mt-1 text-xs text-[var(--muted)] underline"
              >
                Copy
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
