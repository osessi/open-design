import { describe, expect, it } from "vitest";

import { APP_KEYS, SIDECAR_SOURCES } from "@open-design/sidecar";

import {
  createSidecarStampArgs,
  matchesSidecarProcess,
  readSidecarStampFromCommand,
} from "./index.js";

const stamp = {
  app: APP_KEYS.DESKTOP,
  ipc: "/tmp/open-design/ipc/stamp-boundary-a/desktop.sock",
  mode: "dev" as const,
  namespace: "stamp-boundary-a",
  source: SIDECAR_SOURCES.TOOLS_DEV,
};

describe("sidecar process stamp primitives", () => {
  it("serializes only the five stamp flags", () => {
    const args = createSidecarStampArgs(stamp);

    expect(args).toHaveLength(5);
    expect(args.join(" ")).toContain("--od-stamp-app=desktop");
    expect(args.join(" ")).toContain("--od-stamp-mode=dev");
    expect(args.join(" ")).toContain("--od-stamp-namespace=stamp-boundary-a");
    expect(args.join(" ")).toContain("--od-stamp-ipc=/tmp/open-design/ipc/stamp-boundary-a/desktop.sock");
    expect(args.join(" ")).toContain("--od-stamp-source=tools-dev");
    expect(args.join(" ")).not.toContain("runtime-token");
    expect(args.join(" ")).not.toContain("od-proc-role");
  });

  it("reads and matches stamped process commands", () => {
    const command = ["node", "desktop.js", ...createSidecarStampArgs(stamp)].join(" ");

    expect(readSidecarStampFromCommand(command)).toEqual(stamp);
    expect(matchesSidecarProcess({ command }, { app: APP_KEYS.DESKTOP, namespace: stamp.namespace, source: SIDECAR_SOURCES.TOOLS_DEV })).toBe(true);
    expect(matchesSidecarProcess({ command }, { namespace: "stamp-boundary-b" })).toBe(false);
    expect(matchesSidecarProcess({ command }, { source: SIDECAR_SOURCES.TOOLS_PACK })).toBe(false);
  });
});
