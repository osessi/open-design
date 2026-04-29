import { authenticateBearer } from '@/lib/auth/bearer';
import { subscribeDaemonWakeups } from '@/lib/realtime';

// Best-effort SSE wakeup channel for the daemon. The daemon HOLDS this
// connection open and HTTP-claims tasks when it gets a hint frame.
// (Equivalent of multica's outbound WS hub; SSE is simpler and fits Next.js
// route handlers without a custom server.)
export async function GET(req: Request) {
  const auth = await authenticateBearer(req);
  if (!auth || auth.via !== 'daemon' || !auth.daemonId) {
    return new Response('unauthorized', { status: 401 });
  }
  const daemonId = auth.daemonId;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (msg: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
      // Initial hello so curl/eventsource sees something immediately.
      send({ kind: 'hello', daemonId });
      const unsub = subscribeDaemonWakeups(daemonId, (m) => send(m));
      // Keep-alive ping every 25s so intermediaries don't drop the connection.
      const ping = setInterval(() => send({ kind: 'ping', t: Date.now() }), 25_000);
      const abort = () => {
        clearInterval(ping);
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
