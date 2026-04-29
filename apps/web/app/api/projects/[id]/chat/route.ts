import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';
import { resolveProjectAccess } from '@/lib/access';
import { wakeDaemon } from '@/lib/realtime';

const Body = z.object({
  message: z.string().min(1),
  systemPrompt: z.string().default(''),
  runtimeId: z.string(),
});

// Enqueues an agent_task for the project. The cloud doesn't run the agent;
// it persists a row, wakes any paired daemon for that workspace+runtime,
// and returns the task id. The browser then opens
// /api/tasks/<id>/stream (SSE) to watch progress in real time.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await resolveProjectAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (access.role === 'view') return NextResponse.json({ error: 'view-only' }, { status: 403 });

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const [project] = await (db as any).select().from(s.project).where(eq(s.project.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const taskId = nanoid();
  const now = new Date();
  await (db as any).insert(s.agentTask).values({
    id: taskId,
    workspaceId: project.workspaceId,
    projectId: id,
    runtimeId: body.data.runtimeId,
    requestedByUserId: session.sub,
    payload: {
      systemPrompt: body.data.systemPrompt,
      message: body.data.message,
    },
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  });

  // Best-effort wake of any registered daemon in this workspace.
  const daemons = await (db as any)
    .select({ id: s.daemonRegistration.id })
    .from(s.daemonRegistration)
    .where(eq(s.daemonRegistration.workspaceId, project.workspaceId));
  for (const d of daemons) {
    wakeDaemon(d.id, { seq: 0, kind: 'task_available', payload: { taskId, runtimeId: body.data.runtimeId } });
  }

  return NextResponse.json({ taskId });
}
