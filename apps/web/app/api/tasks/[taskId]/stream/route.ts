import { eq, asc } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';
import { subscribeTask } from '@/lib/realtime';

// Browser SSE feed for a single task. Replays persisted messages (so you can
// reconnect mid-run), then streams new messages as they arrive via the
// in-process pub/sub.
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return new Response('unauthorized', { status: 401 });
  const { taskId } = await params;
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  const [task] = await (db as any)
    .select()
    .from(s.agentTask)
    .where(eq(s.agentTask.id, taskId))
    .limit(1);
  if (!task) return new Response('not found', { status: 404 });
  // ACL: must be a member of the task's workspace.
  if (!session.workspaces.some((w) => w.id === task.workspaceId)) {
    return new Response('forbidden', { status: 403 });
  }

  const persisted: Array<{ seq: number; kind: string; payload: unknown }> = await (db as any)
    .select({ seq: s.taskMessage.seq, kind: s.taskMessage.kind, payload: s.taskMessage.payload })
    .from(s.taskMessage)
    .where(eq(s.taskMessage.taskId, taskId))
    .orderBy(asc(s.taskMessage.seq));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (msg: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
      for (const m of persisted) send(m);
      const unsub = subscribeTask(taskId, (m) => send(m));
      const abort = () => {
        unsub();
        controller.close();
      };
      req.signal.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
