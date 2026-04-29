import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';
import { resolveProjectAccess } from '@/lib/access';
import ShareButton from './ShareButton';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromCookies();
  const access = await resolveProjectAccess(id, session);
  if (!access.ok) notFound();

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const [project] = await (db as any).select().from(s.project).where(eq(s.project.id, id)).limit(1);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-[var(--muted)]">
            Access: <code>{access.via}</code> · role <code>{access.role}</code>
          </p>
        </div>
        {access.via === 'member' && access.role !== 'member' ? (
          <ShareButton projectId={id} />
        ) : null}
      </header>

      <section className="rounded border border-white/10 p-4">
        <h2 className="mb-2 text-sm uppercase tracking-wider text-[var(--muted)]">Chat</h2>
        <p className="text-sm text-[var(--muted)]">
          Chat / file workspace UI lives here. Sends to <code>POST /api/projects/{id}/chat</code>,
          which queues an <code>agent_task</code> for a paired daemon to claim.
        </p>
      </section>
    </main>
  );
}
