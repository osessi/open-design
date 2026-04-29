import { redirect } from 'next/navigation';
import { eq, isNull, and } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';

export default async function DaemonSettingsPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const daemons = await (db as any)
    .select({
      id: s.daemonRegistration.id,
      hostname: s.daemonRegistration.hostname,
      platform: s.daemonRegistration.platform,
      os: s.daemonRegistration.os,
      cliVersion: s.daemonRegistration.cliVersion,
      runtimes: s.daemonRegistration.runtimes,
      lastSeenAt: s.daemonRegistration.lastSeenAt,
    })
    .from(s.daemonRegistration)
    .where(and(eq(s.daemonRegistration.userId, session.sub), isNull(s.daemonRegistration.revokedAt)));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Paired daemons</h1>
      <pre className="mb-8 overflow-x-auto rounded border border-white/10 bg-black/40 p-4 text-sm">
{`# install
npm i -g @open-design/cli

# this opens a browser, signs you in, and stores a PAT
od login

# start the daemon (registers, then claims tasks for this account)
od daemon`}
      </pre>
      <h2 className="mb-3 text-sm uppercase tracking-wider text-[var(--muted)]">Devices</h2>
      <ul className="space-y-2">
        {daemons.map((d: any) => (
          <li key={d.id} className="rounded border border-white/10 p-3 text-sm">
            <div className="font-medium">{d.hostname}</div>
            <div className="text-[var(--muted)]">{d.os} · {d.platform} · CLI {d.cliVersion}</div>
            <div className="text-[var(--muted)]">runtimes: {d.runtimes.filter((r: { available: boolean }) => r.available).map((r: { name: string }) => r.name).join(', ') || '—'}</div>
            <div className="text-[var(--muted)]">last seen: {new Date(d.lastSeenAt).toLocaleString()}</div>
          </li>
        ))}
        {daemons.length === 0 ? <li className="text-[var(--muted)]">No daemons paired yet.</li> : null}
      </ul>
    </main>
  );
}
