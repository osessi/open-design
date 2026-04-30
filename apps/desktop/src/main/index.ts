import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import {
  APP_KEYS,
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  inspectWebRuntime,
  type DesktopClickInput,
  type DesktopEvalInput,
  type DesktopScreenshotInput,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

import { createDesktopRuntime } from "./runtime.js";

const TOOLS_DEV_PARENT_PID_ENV = "OD_TOOLS_DEV_PARENT_PID";

export type DesktopMainOptions = {
  beforeShutdown?: () => Promise<void>;
  discoverWebUrl?: () => Promise<string | null>;
};

function isDirectEntry(): boolean {
  const entryPath = process.argv[1];
  if (entryPath == null || entryPath.length === 0 || entryPath.startsWith("--")) return false;

  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
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

function createWebDiscovery(runtime: SidecarRuntimeContext): () => Promise<string | null> {
  return async () => {
    const web = await inspectWebRuntime({ base: runtime.base, namespace: runtime.namespace }, 600);
    return web?.url ?? null;
  };
}

export async function runDesktopMain(
  runtime: SidecarRuntimeContext,
  options: DesktopMainOptions = {},
): Promise<void> {
  await app.whenReady();

  const desktop = await createDesktopRuntime({
    discoverUrl: options.discoverWebUrl ?? createWebDiscovery(runtime),
  });
  let ipcServer: JsonIpcServerHandle | null = null;
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await options.beforeShutdown?.().catch((error: unknown) => {
      console.error("desktop beforeShutdown failed", error);
    });
    await ipcServer?.close().catch(() => undefined);
    await desktop.close().catch(() => undefined);
    app.quit();
  }

  attachParentMonitor(shutdown);

  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: { input?: unknown; type?: string }) => {
      switch (message?.type) {
        case "status":
          return desktop.status();
        case "eval":
          return await desktop.eval(message.input as DesktopEvalInput);
        case "screenshot":
          return await desktop.screenshot(message.input as DesktopScreenshotInput);
        case "console":
          return desktop.console();
        case "click":
          return await desktop.click(message.input as DesktopClickInput);
        case "shutdown":
          setImmediate(() => {
            void shutdown().finally(() => process.exit(0));
          });
          return { accepted: true };
        default:
          throw new Error(`unknown desktop sidecar message: ${message?.type}`);
      }
    },
  });

  app.on("window-all-closed", () => {
    void shutdown().finally(() => process.exit(0));
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown().finally(() => process.exit(0));
    });
  }
}

if (isDirectEntry()) {
  const runtime = bootstrapSidecarRuntime(process.argv.slice(2), process.env, {
    app: APP_KEYS.DESKTOP,
  });

  void runDesktopMain(runtime).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
