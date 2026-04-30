import { APP_KEYS, bootstrapSidecarRuntime } from "@open-design/sidecar";

import { startWebSidecar } from "./server.js";

async function main(): Promise<void> {
  const runtime = bootstrapSidecarRuntime(process.argv.slice(2), process.env, {
    app: APP_KEYS.WEB,
  });
  const server = await startWebSidecar(runtime);

  process.stdout.write(`${JSON.stringify(await server.status(), null, 2)}\n`);
  await server.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
