import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer as createNetServer, type AddressInfo, type Server } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const APP_KEYS = Object.freeze({
  DAEMON: "daemon",
  DESKTOP: "desktop",
  WEB: "web",
});

export type AppKey = (typeof APP_KEYS)[keyof typeof APP_KEYS];
export type SidecarMode = "dev" | "runtime";

export const SIDECAR_SOURCES = Object.freeze({
  PACKAGED: "packaged",
  TOOLS_DEV: "tools-dev",
  TOOLS_PACK: "tools-pack",
});

export type SidecarSource = string;

export type ServiceRuntimeState = "idle" | "running" | "starting" | "stopped" | "unknown";

export type DaemonStatusSnapshot = {
  pid?: number;
  state: ServiceRuntimeState;
  updatedAt?: string;
  url: string | null;
};

export type WebStatusSnapshot = {
  pid?: number;
  state: ServiceRuntimeState;
  updatedAt?: string;
  url: string | null;
};

export type DesktopRuntimeState = "idle" | "running" | "unknown";

export type DesktopStatusSnapshot = {
  pid?: number;
  state: DesktopRuntimeState;
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type DesktopEvalInput = {
  expression: string;
};

export type DesktopEvalResult = {
  error?: string;
  ok: boolean;
  value?: unknown;
};

export type DesktopScreenshotInput = {
  path: string;
};

export type DesktopScreenshotResult = {
  path: string;
};

export type DesktopConsoleEntry = {
  level: string;
  text: string;
  timestamp: string;
};

export type DesktopConsoleResult = {
  entries: DesktopConsoleEntry[];
};

export type DesktopClickInput = {
  selector: string;
};

export type DesktopClickResult = {
  clicked: boolean;
  found: boolean;
};

export const SIDECAR_BASE_ENV = "OD_SIDECAR_BASE";
export const SIDECAR_NAMESPACE_ENV = "OD_SIDECAR_NAMESPACE";
export const NAMESPACE_PREFIX_ENV = "OD_NAMESPACE_PREFIX";
export const SIDECAR_IPC_BASE_ENV = "OD_SIDECAR_IPC_BASE";
export const SIDECAR_IPC_PATH_ENV = "OD_SIDECAR_IPC_PATH";
export const SIDECAR_SOURCE_ENV = "OD_SIDECAR_SOURCE";

export const STAMP_APP_FLAG = "--od-stamp-app";
export const STAMP_IPC_FLAG = "--od-stamp-ipc";
export const STAMP_MODE_FLAG = "--od-stamp-mode";
export const STAMP_NAMESPACE_FLAG = "--od-stamp-namespace";
export const STAMP_SOURCE_FLAG = "--od-stamp-source";

export const SIDECAR_STAMP_FIELDS = ["app", "mode", "namespace", "ipc", "source"] as const;

const DEFAULT_NAMESPACE = "default";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_IPC_BASE = "/tmp/open-design/ipc";
const PROJECT_TMP_DIR_NAME = ".tmp";

export type BaseResolutionOptions = {
  base?: string | null;
  env?: NodeJS.ProcessEnv;
};

export type NamespaceResolutionOptions = {
  env?: NodeJS.ProcessEnv;
  namespace?: string | null;
};

export type RuntimePathRequest = {
  base?: string | null;
  namespace: string;
};

export type ProjectRuntimePathRequest = {
  projectRoot: string;
  source: SidecarSource;
};

export type RuntimeRootRequest = RuntimePathRequest & {
  runId: string;
};

export type AppIpcPathRequest = RuntimePathRequest & {
  app: AppKey;
  env?: NodeJS.ProcessEnv;
};

export type AppRuntimePathRequest = {
  app: AppKey;
  namespaceRoot: string;
};

export type SidecarRuntimeContext = {
  app: AppKey;
  base: string;
  ipc: string;
  mode: SidecarMode;
  namespace: string;
  source: SidecarSource;
};

export type SidecarStamp = {
  app: AppKey;
  ipc: string;
  mode: SidecarMode;
  namespace: string;
  source: SidecarSource;
};

export type SidecarStampInput = Partial<Record<(typeof SIDECAR_STAMP_FIELDS)[number], unknown>>;

export type SidecarStampCriteria = Partial<SidecarStamp>;

export type SidecarLaunchEnvRequest = {
  base: string;
  extraEnv?: NodeJS.ProcessEnv;
  stamp: SidecarStamp;
};

export type PortAllocation = {
  port: number;
  source: "dynamic" | "forced";
};

export type DevPortPlan = {
  daemon: PortAllocation;
  host: string;
  web: PortAllocation;
};

export type DevPortRequest = {
  daemonPort?: number | string | null;
  host?: string;
  webPort?: number | string | null;
};

export type JsonIpcHandler = (message: any) => unknown | Promise<unknown>;

export type JsonIpcServerHandle = {
  close(): Promise<void>;
};

export function normalizeNamespace(namespace: unknown): string {
  if (typeof namespace !== "string") throw new Error("namespace must be a string");
  const value = namespace.trim();
  if (value.length === 0) throw new Error("namespace must not be empty");
  if (value !== namespace) throw new Error("namespace must not contain leading or trailing whitespace");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`namespace contains unsupported characters: ${value}`);
  }
  if (/[\\/]/.test(value)) throw new Error(`namespace must not contain path separators: ${value}`);
  return value;
}

function isSidecarMode(value: string): value is SidecarMode {
  return value === "dev" || value === "runtime";
}

function normalizeSidecarMode(mode: unknown): SidecarMode {
  if (typeof mode !== "string" || !isSidecarMode(mode)) {
    throw new Error("sidecar mode must be dev or runtime");
  }
  return mode;
}

export function isAppKey(value: unknown): value is AppKey {
  return Object.values(APP_KEYS).includes(value as AppKey);
}

function normalizeApp(app: unknown): AppKey {
  if (!isAppKey(app)) throw new Error(`unsupported sidecar app: ${String(app)}`);
  return app;
}

export function normalizeSidecarSource(source: unknown): SidecarSource {
  if (typeof source !== "string") throw new Error("sidecar source must be a string");
  const value = source.trim();
  if (value.length === 0) throw new Error("sidecar source must not be empty");
  if (value !== source) throw new Error("sidecar source must not contain leading or trailing whitespace");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error(`sidecar source contains unsupported characters: ${value}`);
  }
  return value;
}

export function normalizeIpcPath(ipc: unknown): string {
  if (typeof ipc !== "string") throw new Error("sidecar ipc path must be a string");
  if (ipc.length === 0) throw new Error("sidecar ipc path must not be empty");
  if (ipc.trim() !== ipc) throw new Error("sidecar ipc path must not contain leading or trailing whitespace");
  if (ipc.includes("\0")) throw new Error("sidecar ipc path must not contain null bytes");
  if (isWindowsNamedPipePath(ipc)) return ipc;
  if (!isAbsolute(ipc)) throw new Error(`sidecar ipc path must be absolute: ${ipc}`);
  return ipc;
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownStampKeys(value: Record<string, unknown>, label: string): void {
  const allowed = new Set<string>(SIDECAR_STAMP_FIELDS);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.join(", ")}`);
  }
}

export function normalizeSidecarStamp(input: unknown): SidecarStamp {
  const value = assertObject(input, "sidecar stamp");
  assertKnownStampKeys(value, "sidecar stamp");
  return {
    app: normalizeApp(value.app),
    ipc: normalizeIpcPath(value.ipc),
    mode: normalizeSidecarMode(value.mode),
    namespace: normalizeNamespace(value.namespace),
    source: normalizeSidecarSource(value.source),
  };
}

export function normalizeSidecarStampCriteria(input: unknown = {}): SidecarStampCriteria {
  const value = assertObject(input, "sidecar stamp criteria");
  assertKnownStampKeys(value, "sidecar stamp criteria");
  return {
    ...(value.app == null ? {} : { app: normalizeApp(value.app) }),
    ...(value.ipc == null ? {} : { ipc: normalizeIpcPath(value.ipc) }),
    ...(value.mode == null ? {} : { mode: normalizeSidecarMode(value.mode) }),
    ...(value.namespace == null ? {} : { namespace: normalizeNamespace(value.namespace) }),
    ...(value.source == null ? {} : { source: normalizeSidecarSource(value.source) }),
  };
}

export function assertSidecarStamp(input: unknown): asserts input is SidecarStamp {
  normalizeSidecarStamp(input);
}

export function resolveNamespace(options: NamespaceResolutionOptions = {}): string {
  return normalizeNamespace(
    options.namespace ??
      options.env?.[SIDECAR_NAMESPACE_ENV] ??
      options.env?.[NAMESPACE_PREFIX_ENV] ??
      DEFAULT_NAMESPACE,
  );
}

export function resolveProjectRoot(projectRoot: string): string {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new Error("projectRoot must be a non-empty string");
  }
  return resolve(projectRoot);
}

export function resolveProjectTmpRoot({ projectRoot }: { projectRoot: string }): string {
  return join(resolveProjectRoot(projectRoot), PROJECT_TMP_DIR_NAME);
}

export function resolveSourceRuntimeRoot({ projectRoot, source }: ProjectRuntimePathRequest): string {
  return join(resolveProjectTmpRoot({ projectRoot }), normalizeSidecarSource(source));
}

export function resolveToolsDevBase(options: BaseResolutionOptions = {}): string {
  return resolve(
    options.base ??
      options.env?.[SIDECAR_BASE_ENV] ??
      resolveSourceRuntimeRoot({ projectRoot: process.cwd(), source: SIDECAR_SOURCES.TOOLS_DEV }),
  );
}

export function resolveNamespaceRoot({ base, namespace }: RuntimePathRequest): string {
  return join(resolveToolsDevBase({ base }), normalizeNamespace(namespace));
}

export function resolveRuntimeRoot({ base, namespace, runId }: RuntimeRootRequest): string {
  return join(resolveNamespaceRoot({ base, namespace }), "runs", runId);
}

export function resolvePointerPath({ base, namespace }: RuntimePathRequest): string {
  return join(resolveNamespaceRoot({ base, namespace }), "current.json");
}

export function resolveManifestPath({ runtimeRoot }: { runtimeRoot: string }): string {
  return join(runtimeRoot, "manifest.json");
}

export function resolveLogsDir({ app, runtimeRoot }: { app: AppKey; runtimeRoot: string }): string {
  return join(runtimeRoot, "logs", app);
}

export function resolveLogFilePath({ app, fileName = "latest.log", runtimeRoot }: { app: AppKey; fileName?: string; runtimeRoot: string }): string {
  return join(resolveLogsDir({ runtimeRoot, app }), fileName);
}

export function resolveAppRuntimeDir({ app, namespaceRoot }: AppRuntimePathRequest): string {
  return join(namespaceRoot, normalizeApp(app));
}

export function resolveAppRuntimePath({ app, fileName, namespaceRoot }: AppRuntimePathRequest & { fileName: string }): string {
  if (fileName.length === 0 || fileName.includes("\0") || /[\\/]/.test(fileName)) {
    throw new Error(`app runtime fileName must be a simple path segment: ${fileName}`);
  }
  return join(resolveAppRuntimeDir({ app, namespaceRoot }), fileName);
}

export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}

export function resolveAppIpcPath({ app, base, env = process.env, namespace }: AppIpcPathRequest): string {
  const normalizedApp = normalizeApp(app);
  const normalizedNamespace = normalizeNamespace(namespace);

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\open-design-${normalizedNamespace}-${normalizedApp}`;
  }

  const ipcBase = resolve(env[SIDECAR_IPC_BASE_ENV] ?? DEFAULT_IPC_BASE);
  return join(ipcBase, normalizedNamespace, `${normalizedApp}.sock`);
}

export function createSidecarLaunchEnv({ base, extraEnv = process.env, stamp }: SidecarLaunchEnvRequest): NodeJS.ProcessEnv {
  const normalizedStamp = normalizeSidecarStamp(stamp);
  return {
    ...extraEnv,
    [SIDECAR_BASE_ENV]: resolveToolsDevBase({ base }),
    [SIDECAR_IPC_PATH_ENV]: normalizedStamp.ipc,
    [SIDECAR_NAMESPACE_ENV]: normalizedStamp.namespace,
    [SIDECAR_SOURCE_ENV]: normalizedStamp.source,
  };
}

export function readFlagValue(args: readonly string[], flagName: string): string | null {
  const inlinePrefix = `${flagName}=`;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === flagName) return args[index + 1] ?? null;
    if (typeof argument === "string" && argument.startsWith(inlinePrefix)) {
      return argument.slice(inlinePrefix.length);
    }
  }
  return null;
}

export function readSidecarStamp(args: readonly string[]): SidecarStamp | null {
  try {
    return normalizeSidecarStamp({
      app: readFlagValue(args, STAMP_APP_FLAG),
      ipc: readFlagValue(args, STAMP_IPC_FLAG),
      mode: readFlagValue(args, STAMP_MODE_FLAG),
      namespace: readFlagValue(args, STAMP_NAMESPACE_FLAG),
      source: readFlagValue(args, STAMP_SOURCE_FLAG),
    });
  } catch {
    return null;
  }
}

function assertMatchingEnv(env: NodeJS.ProcessEnv, key: string, expected: string): void {
  const current = env[key];
  if (current != null && current !== expected) {
    throw new Error(`sidecar env mismatch for ${key}: expected ${expected}, received ${current}`);
  }
}

export function bootstrapSidecarRuntime(args: readonly string[], env: NodeJS.ProcessEnv, options: { app: AppKey }): SidecarRuntimeContext {
  const stamp = readSidecarStamp(args);
  if (stamp == null) throw new Error("sidecar stamp is required");
  const expectedApp = normalizeApp(options.app);
  if (stamp.app !== expectedApp) {
    throw new Error(`sidecar stamp app mismatch: expected ${expectedApp}, received ${stamp.app}`);
  }

  const base = resolveToolsDevBase({ env });
  const ipc = resolveAppIpcPath({ app: stamp.app, env, namespace: stamp.namespace });
  if (stamp.ipc !== ipc) {
    throw new Error(`sidecar ipc path mismatch: expected ${ipc}, received ${stamp.ipc}`);
  }

  assertMatchingEnv(env, SIDECAR_IPC_PATH_ENV, stamp.ipc);
  assertMatchingEnv(env, SIDECAR_NAMESPACE_ENV, stamp.namespace);
  assertMatchingEnv(env, SIDECAR_SOURCE_ENV, stamp.source);

  env[SIDECAR_IPC_PATH_ENV] = ipc;
  env[SIDECAR_NAMESPACE_ENV] = stamp.namespace;
  env[SIDECAR_SOURCE_ENV] = stamp.source;

  return {
    app: stamp.app,
    base,
    ipc,
    mode: stamp.mode,
    namespace: stamp.namespace,
    source: stamp.source,
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

async function listenOnPort(port: number, host: string): Promise<Server> {
  const server = createNetServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ port, host, exclusive: true }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function parsePort(value: number | string | null | undefined, label: string): number | null {
  if (value == null || value === "") return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${label} port must be an integer between 1 and 65535`);
  }
  return port;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function allocateForcedPort(port: number, label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  if (reserved.has(port)) {
    throw new Error(`forced ${label} port ${port} conflicts with another managed port`);
  }
  let server: Server | null = null;
  try {
    server = await listenOnPort(port, host);
  } catch (error) {
    throw new Error(`forced ${label} port ${port} is not available (${errorCode(error) ?? errorMessage(error)})`);
  } finally {
    if (server) await closeServer(server);
  }
  reserved.add(port);
  return { port, source: "forced" };
}

async function allocateDynamicPort(label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = await listenOnPort(0, host);
    const address = server.address() as AddressInfo | string | null;
    await closeServer(server);
    if (address == null || typeof address === "string") {
      throw new Error(`failed to allocate dynamic ${label} port`);
    }
    if (!reserved.has(address.port)) {
      reserved.add(address.port);
      return { port: address.port, source: "dynamic" };
    }
  }
  throw new Error(`failed to allocate dynamic ${label} port without conflict`);
}

export async function allocateDevPorts({ daemonPort, host = DEFAULT_HOST, webPort }: DevPortRequest = {}): Promise<DevPortPlan> {
  const reserved = new Set<number>();
  const forcedDaemon = parsePort(daemonPort, "daemon");
  const forcedWeb = parsePort(webPort, "web");
  return {
    daemon: forcedDaemon == null
      ? await allocateDynamicPort("daemon", host, reserved)
      : await allocateForcedPort(forcedDaemon, "daemon", host, reserved),
    host,
    web: forcedWeb == null
      ? await allocateDynamicPort("web", host, reserved)
      : await allocateForcedPort(forcedWeb, "web", host, reserved),
  };
}

export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function removePointerIfCurrent(pointerPath: string, runId: string): Promise<void> {
  const pointer = await readJsonFile<{ runId?: string }>(pointerPath);
  if (pointer?.runId === runId) await removeFile(pointerPath);
}

async function prepareIpcPath(socketPath: string): Promise<void> {
  if (isWindowsNamedPipePath(socketPath)) return;
  await mkdir(dirname(socketPath), { recursive: true });
}

export async function createJsonIpcServer({ handler, socketPath }: { handler: JsonIpcHandler; socketPath: string }): Promise<JsonIpcServerHandle> {
  await prepareIpcPath(socketPath);
  const server = createNetServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const frame = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      try {
        const result = await handler(JSON.parse(frame));
        socket.end(`${JSON.stringify({ ok: true, result })}\n`);
      } catch (error) {
        socket.end(
          `${JSON.stringify({
            ok: false,
            error: { message: errorMessage(error) },
          })}\n`,
        );
      }
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    async close() {
      await closeServer(server);
      if (!isWindowsNamedPipePath(socketPath)) await rm(socketPath, { force: true });
    },
  };
}

export async function requestJsonIpc<T = any>(socketPath: string, payload: unknown, { timeoutMs = 1500 }: { timeoutMs?: number } = {}): Promise<T> {
  return await new Promise<T>((resolveRequest, rejectRequest) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffer = "";
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      socket.destroy();
      settle(() => rejectRequest(new Error(`IPC request timed out: ${socketPath}`)));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      socket.end();
      settle(() => {
        const response = JSON.parse(buffer.slice(0, newlineIndex)) as { error?: { message?: string }; ok: boolean; result?: T };
        if (!response.ok) {
          rejectRequest(new Error(response.error?.message ?? "IPC request failed"));
          return;
        }
        resolveRequest(response.result as T);
      });
    });
    socket.on("error", (error) => {
      settle(() => rejectRequest(error));
    });
  });
}

export type AppRuntimeLookup = Pick<SidecarRuntimeContext, "base" | "namespace">;

export function resolveDaemonIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.DAEMON, base: runtime.base, namespace: runtime.namespace });
}

export function resolveWebIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.WEB, base: runtime.base, namespace: runtime.namespace });
}

export function resolveDesktopIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.DESKTOP, base: runtime.base, namespace: runtime.namespace });
}

export async function inspectDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DaemonStatusSnapshot | null> {
  try {
    return await requestJsonIpc<DaemonStatusSnapshot>(resolveDaemonIpcPath(runtime), { type: "status" }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = 35000): Promise<DaemonStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectDaemonRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("daemon did not expose status in time");
}

export async function inspectWebRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<WebStatusSnapshot | null> {
  try {
    return await requestJsonIpc<WebStatusSnapshot>(resolveWebIpcPath(runtime), { type: "status" }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForWebRuntime(runtime: AppRuntimeLookup, timeoutMs = 35000): Promise<WebStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectWebRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("web did not expose status in time");
}

export async function inspectDesktopRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DesktopStatusSnapshot | null> {
  try {
    return await requestJsonIpc<DesktopStatusSnapshot>(resolveDesktopIpcPath(runtime), { type: "status" }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDesktopRuntime(runtime: AppRuntimeLookup, timeoutMs = 15000): Promise<DesktopStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectDesktopRuntime(runtime, 800);
    if (snapshot != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("desktop did not expose status in time");
}

export const sidecar = Object.freeze({
  allocateDevPorts,
  appKeys: APP_KEYS,
  bootstrap: bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  createJsonIpcServer,
  inspectDaemonRuntime,
  inspectDesktopRuntime,
  inspectWebRuntime,
  isAppKey,
  normalizeIpcPath,
  normalizeNamespace,
  normalizeSidecarSource,
  normalizeSidecarStamp,
  normalizeSidecarStampCriteria,
  readJsonFile,
  readSidecarStamp,
  removeFile,
  removePointerIfCurrent,
  requestJsonIpc,
  resolveAppIpcPath,
  resolveAppRuntimeDir,
  resolveAppRuntimePath,
  resolveDaemonIpcPath,
  resolveDesktopIpcPath,
  resolveLogFilePath,
  resolveLogsDir,
  resolveManifestPath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolvePointerPath,
  resolveProjectRoot,
  resolveProjectTmpRoot,
  resolveRuntimeRoot,
  resolveSourceRuntimeRoot,
  resolveToolsDevBase,
  resolveWebIpcPath,
  sources: SIDECAR_SOURCES,
  waitForDaemonRuntime,
  waitForDesktopRuntime,
  waitForWebRuntime,
  writeJsonFile,
});
