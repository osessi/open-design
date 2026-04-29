import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { TaskMessageRequest } from '@open-design/shared';
import { getDb } from '@open-design/db/client';
import { authenticateBearer } from '@/lib/auth/bearer';
import { broadcastTaskMessage } from '@/lib/realtime';

// Daemon streams agent stdout/stderr/agent-events back here. Cloud persists
// each chunk and fans it out to subscribed browser SSE listeners.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const auth = await authenticateBearer(req);
  if (!auth || auth.via !== 'daemon' || !auth.daemonId) {
    return NextResponse.json({ error: 'daemon token required' }, { status: 401 });
  }
  const { taskId } = await params;
  const body = TaskMessageRequest.safeParse({
    ...(await req.json().catch(() => ({}))),
    taskId,
  });
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  // Verify the task is leased to this daemon.
  const [task] = await (db as any)
    .select()
    .from(s.agentTask)
    .where(and(eq(s.agentTask.id, taskId), eq(s.agentTask.leasedByDaemonId, auth.daemonId)))
    .limit(1);
  if (!task) return NextResponse.json({ error: 'not your task' }, { status: 403 });

  await (db as any).insert(s.taskMessage).values({
    id: nanoid(),
    taskId,
    seq: body.data.seq,
    kind: body.data.kind,
    payload: body.data.payload as any,
    createdAt: new Date(),
  });

  if (body.data.kind === 'end') {
    const status = (body.data.payload as { ok?: boolean })?.ok === false ? 'failed' : 'succeeded';
    await (db as any)
      .update(s.agentTask)
      .set({ status, updatedAt: new Date() })
      .where(eq(s.agentTask.id, taskId));
  } else if (body.data.kind === 'status' && task.status === 'claimed') {
    await (db as any)
      .update(s.agentTask)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(s.agentTask.id, taskId));
  }

  broadcastTaskMessage(taskId, {
    seq: body.data.seq,
    kind: body.data.kind,
    payload: body.data.payload,
  });

  return NextResponse.json({ ok: true });
}
