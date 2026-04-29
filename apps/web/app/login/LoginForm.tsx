'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  cliCallback?: string;
  cliState?: string;
}

export default function LoginForm({ cliCallback, cliState }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'enter-email' | 'enter-code' | 'done'>('enter-email');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const r = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Failed to send code');
      return;
    }
    setStage('enter-code');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const r = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code, cliCallback, cliState }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Verification failed');
      return;
    }
    const j = await r.json();
    if (cliCallback && cliState && j.cliRedirect) {
      window.location.href = j.cliRedirect;
      setStage('done');
      return;
    }
    router.push('/projects');
  }

  return (
    <form
      onSubmit={stage === 'enter-email' ? sendCode : verifyCode}
      className="flex flex-col gap-3"
    >
      {cliCallback ? (
        <p className="rounded border border-white/10 bg-white/5 p-3 text-sm text-[var(--muted)]">
          You're signing in to authorize the local <code>od</code> CLI on this device. After you
          verify, we'll redirect back to your terminal.
        </p>
      ) : null}

      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={stage !== 'enter-email'}
        className="rounded border border-white/10 bg-black/40 px-3 py-2"
      />
      {stage !== 'enter-email' ? (
        <input
          required
          inputMode="numeric"
          pattern="\\d{6}"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          autoFocus
          className="rounded border border-white/10 bg-black/40 px-3 py-2"
        />
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-[var(--accent)] px-4 py-2 font-medium disabled:opacity-50"
      >
        {stage === 'enter-email' ? 'Send code' : stage === 'enter-code' ? 'Verify' : 'Redirecting…'}
      </button>
    </form>
  );
}
