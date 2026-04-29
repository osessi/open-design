// Long-running daemon. Registers with the cloud (PAT → daemon token), opens
// an SSE wakeup channel, polls the claim endpoint, runs claimed tasks via
// the matching local agent CLI, streams stdout/stderr/agent events back.
import { hostname, platform, type } from 'node:os';
import { execa } from 'execa';
import { loadProfile, saveProfile } from './profile.js';
import { detectRuntimes, type DetectedRuntime } from './runtimes.js';

const VERSION = '0.2.0';
const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 15_000;

interface AgentTask {
  id: string;
  workspaceId: string;
  projectId: string;
  runtimeId: string;
  payload: {
    systemPrompt: string;
    message: string;
    cwdHint?: string;
  };
}

export async function daemon({ profile }: { profile: string }): Promise<void> {
  const p = await loadProfile(profile);
  if (!p.pat) throw new Error('No PAT for this profile. Run `od login` first.');

  const runtimes = await detectRuntimes();
  if (!p.daemonToken) {
    const reg = await register(p, runtimes);
    p.daemonToken = reg.daemonToken;
    p.daemonId = reg.id;
    p.workspaceId = reg.workspaceId;
    await saveProfile(p);
    // eslint-disable-next-line no-console
    console.log(`Registered daemon ${reg.id} on workspace ${reg.workspaceId}`);
  }
  const auth = `Bearer ${p.daemonToken}`;

  // Heartbeat loop.
  const hb = setInterval(() => {
    fetch(`${p.appUrl}/api/daemon/heartbeat`, { method: 'POST', headers: { authorization: auth } })
      .catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  // Wakeup SSE — best-effort. Drops are fine; the polling loop is authoritative.
  startWakeupListener(p.appUrl, auth).catch(() => {});

  // Polling loop, one task at a time per runtime that's available.
  const availableRuntimes = runtimes.filter((r) => r.available);
  // eslint-disable-next-line no-console
  console.log(`Polling for tasks on runtimes: ${availableRuntimes.map((r) => r.id).join(', ') || '(none available)'}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let didWork = false;
    for (const r of availableRuntimes) {
      const task = await claimNext(p.appUrl, auth, r.id);
      if (!task) continue;
      didWork = true;
      // eslint-disable-next-line no-console
      console.log(`Claimed task ${task.id} (${r.id})`);
      await runTask(p.appUrl, auth, task, r);
    }
    if (!didWork) await sleep(POLL_INTERVAL_MS);
  }

  void hb;
}

async function register(p: { appUrl: string; pat?: string }, runtimes: DetectedRuntime[]) {
  const res = await fetch(`${p.appUrl}/api/daemon/register`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${p.pat}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId: '', // server picks default workspace if blank
      hostname: hostname(),
      platform: platform(),
      os: type(),
      cliVersion: VERSION,
      runtimes,
    }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; workspaceId: string; daemonToken: string };
}

async function claimNext(appUrl: string, auth: string, runtimeId: string): Promise<AgentTask | null> {
  const res = await fetch(`${appUrl}/api/daemon/runtimes/${runtimeId}/tasks/claim`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { task: AgentTask | null };
  return j.task;
}

async function runTask(appUrl: string, auth: string, task: AgentTask, runtime: DetectedRuntime) {
  let seq = 0;
  const post = (kind: string, payload: unknown) =>
    fetch(`${appUrl}/api/daemon/tasks/${task.id}/messages`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ seq: seq++, kind, payload }),
    }).catch(() => {});

  await post('status', { status: 'running' });
  try {
    const args = buildArgs(runtime, task);
    const child = execa(runtime.bin, args, {
      cwd: task.payload.cwdHint ?? process.cwd(),
      env: { ...process.env },
      reject: false,
    });
    child.stdout?.on('data', (b: Buffer) => post('stdout', b.toString('utf8')));
    child.stderr?.on('data', (b: Buffer) => post('stderr', b.toString('utf8')));
    const { exitCode } = await child;
    await post('end', { ok: exitCode === 0, exitCode });
  } catch (err) {
    await post('end', { ok: false, error: (err as Error).message });
  }
}

function buildArgs(runtime: DetectedRuntime, task: AgentTask): string[] {
  // Minimal, agent-specific command shapes. Mirror daemon/agents.js as needed.
  if (runtime.id === 'claude') {
    return [
      '--system-prompt', task.payload.systemPrompt,
      '--output-format', 'stream-json',
      '-p', task.payload.message,
    ];
  }
  return [task.payload.message];
}

async function startWakeupListener(appUrl: string, auth: string) {
  const res = await fetch(`${appUrl}/api/daemon/wakeups`, {
    headers: { authorization: auth, accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      // We don't act on wakeups directly; the polling loop will pick up the
      // task within POLL_INTERVAL_MS. Wakeups exist mostly for latency.
      void line;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
