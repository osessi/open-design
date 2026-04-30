import { describe, expect, it } from "vitest";

import {
  APP_KEYS,
  normalizeNamespace,
  normalizeSidecarStamp,
  readSidecarStamp,
  resolveAppIpcPath,
  resolveAppRuntimePath,
  resolveNamespaceRoot,
  resolveSourceRuntimeRoot,
  SIDECAR_SOURCES,
  STAMP_APP_FLAG,
  STAMP_IPC_FLAG,
  STAMP_MODE_FLAG,
  STAMP_NAMESPACE_FLAG,
  STAMP_SOURCE_FLAG,
} from "./index.js";

const validStamp = {
  app: APP_KEYS.WEB,
  ipc: "/tmp/open-design/ipc/contract-check/web.sock",
  mode: "dev" as const,
  namespace: "contract-check",
  source: SIDECAR_SOURCES.TOOLS_DEV,
};

describe("normalizeNamespace", () => {
  it("accepts the explicit namespace contract", () => {
    expect(normalizeNamespace("contract-check_1.alpha")).toBe("contract-check_1.alpha");
  });

  it("rejects path-like or whitespace namespaces", () => {
    expect(() => normalizeNamespace("../other")).toThrow();
    expect(() => normalizeNamespace(" contract-check")).toThrow();
    expect(() => normalizeNamespace("contract check")).toThrow();
  });
});

describe("sidecar path boundary", () => {
  it("resolves source and namespace runtime roots under project .tmp", () => {
    const sourceRoot = resolveSourceRuntimeRoot({
      projectRoot: "/repo/open-design",
      source: SIDECAR_SOURCES.TOOLS_DEV,
    });

    expect(sourceRoot).toBe("/repo/open-design/.tmp/tools-dev");
    expect(resolveNamespaceRoot({ base: sourceRoot, namespace: "contract-check" })).toBe(
      "/repo/open-design/.tmp/tools-dev/contract-check",
    );
    expect(
      resolveAppRuntimePath({
        app: APP_KEYS.WEB,
        fileName: "next",
        namespaceRoot: "/repo/open-design/.tmp/tools-dev/contract-check",
      }),
    ).toBe("/repo/open-design/.tmp/tools-dev/contract-check/web/next");
  });

  it("resolves fixed namespace app singleton IPC paths", () => {
    expect(resolveAppIpcPath({ app: APP_KEYS.WEB, namespace: "contract-check" })).toBe(
      process.platform === "win32"
        ? "\\\\.\\pipe\\open-design-contract-check-web"
        : "/tmp/open-design/ipc/contract-check/web.sock",
    );
  });
});

describe("sidecar stamp contract", () => {
  it("accepts exactly app, mode, namespace, ipc, and source", () => {
    expect(normalizeSidecarStamp(validStamp)).toEqual(validStamp);
  });

  it("rejects legacy or extra stamp fields", () => {
    expect(() => normalizeSidecarStamp({ ...validStamp, runtimeToken: "legacy" })).toThrow();
    expect(() => normalizeSidecarStamp({ ...validStamp, role: "web-sidecar" })).toThrow();
  });

  it("reads the five-field stamp from args", () => {
    expect(
      readSidecarStamp([
        `${STAMP_APP_FLAG}=${validStamp.app}`,
        `${STAMP_MODE_FLAG}=${validStamp.mode}`,
        `${STAMP_NAMESPACE_FLAG}=${validStamp.namespace}`,
        `${STAMP_IPC_FLAG}=${validStamp.ipc}`,
        `${STAMP_SOURCE_FLAG}=${validStamp.source}`,
      ]),
    ).toEqual(validStamp);
  });
});
