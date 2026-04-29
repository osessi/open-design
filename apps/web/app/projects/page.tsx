import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, inArray } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';

export default async function ProjectsIndex() {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');
  const wsIds = session.workspaces.map((w) => w.id);
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const projects = wsIds.length
    ? await (db as any)
        .select()
        .from(s.project)
        .where(inArray(s.project.workspaceId, wsIds))
        .orderBy(desc(s.project.updatedAt))
    : [];
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Projects</h1>
      <ul className="space-y-2">
        {projects.map((p: { id: string; name: string }) => (
          <li key={p.id}>
            <Link className="block rounded border border-white/10 p-3 hover:bg-white/5" href={`/projects/${p.id}`}>
              {p.name}
            </Link>
          </li>
        ))}
        {projects.length === 0 ? <li className="text-[var(--muted)]">No projects yet.</li> : null}
      </ul>
    </main>
  );
}
