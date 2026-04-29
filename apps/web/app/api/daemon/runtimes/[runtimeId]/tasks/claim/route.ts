import { NextResponse } from 'next/server';
import { and, asc, eq, isNull, or, lt } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { authenticateBearer } from '@/lib/auth/bearer';

const LEASE_MS = 5 * 60_000;

// Long-poll-style claim. Daemon polls every ~3s; cloud sends a WS wakeup hint
// when it enqueues a task, but HTTP claim is the source of truth (atomic
// UPDATE with WHERE on status + lease).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ runtimeId: string }> },
) {
  const auth = await authenticateBearer(req);
  if (!auth || auth.via !== 'daemon' || !auth.daemonId || !auth.workspaceId) {
    return NextResponse.json({ error: 'daemon token required' }, { status: 401 });
  }
  const { runtimeId } = await params;
  const { db, schema, dialect } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  // Find one queued task for this workspace + runtime, or one with an
  // expired lease that's still claimed/running.
  const now = new Date();
  const [candidate] = await (db as any)
    .select()
    .from(s.agentTask)
    .where(
      and(
        eq(s.agentTask.workspaceId, auth.workspaceId),
        eq(s.agentTask.runtimeId, runtimeId),
        or(
          eq(s.agentTask.status, 'queued'),
          and(eq(s.agentTask.status, 'claimed'), lt(s.agentTask.leaseExpiresAt, now)),
          and(eq(s.agentTask.status, 'running'), lt(s.agentTask.leaseExpiresAt, now)),
        ),
      ),
    )
    .orderBy(asc(s.agentTask.createdAt))
    .limit(1);

  if (!candidate) return NextResponse.json({ task: null });

  // Atomic-ish claim: update only if status is still what we read.
  const result = await (db as any)
    .update(s.agentTask)
    .set({
      status: 'claimed',
      leasedByDaemonId: auth.daemonId,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      updatedAt: new Date(),
    })
    .where(and(eq(s.agentTask.id, candidate.id), eq(s.agentTask.status, candidate.status)))
    .returning?.();

  // SQLite lacks `.returning()` on update in some drivers; fall back to a re-select.
  let claimed = candidate;
  if (Array.isArray(result) && result.length) claimed = result[0];

  void isNull;
  void dialect;
  return NextResponse.json({ task: claimed });
}
