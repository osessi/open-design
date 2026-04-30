# AGENTS.md

## Current implementation boundary

- This worktree is the active implementation target for desktop integration.
- The old desktop branch/worktree is reference-only. Copy proven files from it when useful, but do not edit that worktree.
- `apps/web` is the web runtime. Do not reintroduce `apps/nextjs`.
- `apps/daemon` is the local privileged daemon. Desktop discovers the web URL through sidecar IPC.

## Command policy

- Use `pnpm tools-dev` as the only local development lifecycle entry point.
- Do not add or use root lifecycle aliases such as `pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, or `pnpm start`.
- Quality commands may remain root scripts (`pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm test:ui`).

## tools-dev lifecycle

```bash
pnpm tools-dev                 # background start: daemon + web + desktop
pnpm tools-dev start web       # background start: daemon + web
pnpm tools-dev run web         # foreground daemon + web, used by Playwright webServer
pnpm tools-dev status
pnpm tools-dev logs
pnpm tools-dev stop
pnpm tools-dev restart
pnpm tools-dev inspect desktop status
pnpm tools-dev inspect desktop screenshot --path /tmp/open-design.png
pnpm tools-dev check
```

Port flags are authoritative:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

Internally, `tools-dev` exports `OD_PORT` for the daemon/web proxy target and `OD_WEB_PORT` for the web listener. Do not use `NEXT_PORT`.

## Sidecar stamp boundary

- Sidecar process stamps have exactly five fields: `app`, `mode`, `namespace`, `ipc`, and `source`.
- `@open-design/sidecar` owns the stamp contract, valid app/mode/source constants, namespace validation, and runtime bootstrap validation.
- `@open-design/platform` owns OS process stamp serialization, command parsing, and process matching/search primitives.
- Orchestration layers such as `tools-dev`, future `tools-pack`, and packaged launchers must call the package primitives. Do not hand-build `--od-stamp-*` args or process-scan regexes in orchestration code.
- Do not reintroduce runtime tokens, process roles, or duplicate process namespace/source args into the stamp boundary.

## Sidecar path boundary

- Default runtime files live under `<project-root>/.tmp/<source>/<namespace>/...` (for example `.tmp/tools-dev/default/logs/web/latest.log`).
- IPC sockets are namespace/app singletons at `/tmp/open-design/ipc/<namespace>/<app>.sock` on POSIX. Do not add workspace hashes or hidden runtime tokens to IPC names.
- Path and IPC resolvers belong in `@open-design/sidecar`; orchestration layers call them and app sidecar wrappers consume injected paths.
- App business logic must not import sidecar packages or branch on `runtime.mode`, `namespace`, `ipc`, or `source`. Keep sidecar awareness in `apps/<app>/sidecar` or the desktop sidecar entry wrapper.

## Validation expectations

- After package or command changes, run `pnpm install` so workspace links and generated dist entries are fresh.
- Run `pnpm typecheck` and `pnpm test` before considering the change ready.
- For web/e2e loop validation, prefer `pnpm tools-dev run web --daemon-port <port> --web-port <port>`.
- For desktop validation on a GUI-capable machine, run `pnpm tools-dev`, then inspect with `pnpm tools-dev inspect desktop status`.
- Stamp/namespace changes must also pass two concurrent namespaces with desktop `inspect eval` and `inspect screenshot` for each namespace.
- Path/log changes must include `pnpm tools-dev logs --namespace <name> --json` for each concurrent namespace and confirm log paths are under `.tmp/tools-dev/<namespace>/...`.
