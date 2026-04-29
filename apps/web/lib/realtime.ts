// In-process pub/sub for SSE fan-out. Per-task subscriber sets indexed by
// taskId; the daemon-message route publishes here and the SSE endpoint subscribes.
//
// In a multi-instance deployment, swap this module for Redis Pub/Sub or
// Postgres LISTEN/NOTIFY (BAR set: keep the same call signature).
type Sub = (msg: { seq: number; kind: string; payload: unknown }) => void;

const subs = new Map<string, Set<Sub>>();
const daemonWakeups = new Map<string, Set<Sub>>(); // keyed by daemon id

export function subscribeTask(taskId: string, fn: Sub): () => void {
  let set = subs.get(taskId);
  if (!set) {
    set = new Set();
    subs.set(taskId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subs.delete(taskId);
  };
}

export function broadcastTaskMessage(taskId: string, msg: { seq: number; kind: string; payload: unknown }) {
  const set = subs.get(taskId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(msg);
    } catch {
      // swallow
    }
  }
}

export function subscribeDaemonWakeups(daemonId: string, fn: Sub): () => void {
  let set = daemonWakeups.get(daemonId);
  if (!set) {
    set = new Set();
    daemonWakeups.set(daemonId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) daemonWakeups.delete(daemonId);
  };
}

export function wakeDaemon(daemonId: string, msg: { seq: number; kind: string; payload: unknown }) {
  const set = daemonWakeups.get(daemonId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(msg);
    } catch {
      // swallow
    }
  }
}
