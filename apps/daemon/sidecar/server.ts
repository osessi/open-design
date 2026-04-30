import type { Server } from "node:http";

import {
  createJsonIpcServer,
  type DaemonStatusSnapshot,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

import { startServer } from "../server.js";

const DAEMON_PORT_ENV = "OD_PORT";
const TOOLS_DEV_PARENT_PID_ENV = "OD_TOOLS_DEV_PARENT_PID";

export type DaemonSidecarHandle = {
  status(): Promise<DaemonStatusSnapshot>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
};

function parsePort(value: string | undefined): number {
  if (value == null || value.trim().length === 0) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${DAEMON_PORT_ENV} must be an integer between 1 and 65535`);
  }
  return port;
}

async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function attachParentMonitor(stop: () => Promise<void>): void {
  const parentPid = Number(process.env[TOOLS_DEV_PARENT_PID_ENV]);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;

  const timer = setInterval(() => {
    if (isProcessAlive(parentPid)) return;
    clearInterval(timer);
    void stop().finally(() => process.exit(0));
  }, 1000);
  timer.unref();
}

export async function startDaemonSidecar(_runtime: SidecarRuntimeContext): Promise<DaemonSidecarHandle> {
  const started = await startServer({ port: parsePort(process.env[DAEMON_PORT_ENV]), returnServer: true });
  if (typeof started === "string") {
    throw new Error("daemon startServer did not return a server handle");
  }

  const state: DaemonStatusSnapshot = {
    pid: process.pid,
    state: "running",
    updatedAt: new Date().toISOString(),
    url: started.url,
  };
  let ipcServer: JsonIpcServerHandle | null = null;
  let stopped = false;
  let resolveStopped!: () => void;
  const stoppedPromise = new Promise<void>((resolveStop) => {
    resolveStopped = resolveStop;
  });

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    state.state = "stopped";
    state.updatedAt = new Date().toISOString();
    await ipcServer?.close().catch(() => undefined);
    await closeHttpServer(started.server).catch(() => undefined);
    resolveStopped();
  }

  attachParentMonitor(stop);

  ipcServer = await createJsonIpcServer({
    socketPath: _runtime.ipc,
    handler: async (message: { type?: string }) => {
      if (message?.type === "status") return { ...state };
      if (message?.type === "shutdown") {
        setImmediate(() => {
          void stop().finally(() => process.exit(0));
        });
        return { accepted: true };
      }
      throw new Error(`unknown daemon sidecar message: ${message?.type}`);
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stop().finally(() => process.exit(0));
    });
  }

  return {
    async status() {
      return { ...state };
    },
    stop,
    waitUntilStopped() {
      return stoppedPromise;
    },
  };
}
