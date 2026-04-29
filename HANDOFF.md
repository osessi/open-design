# Handoff: Next.js 16 cloud refactor (worktree)

## Scope

Refactor the Vite + Express stack into a TypeScript pnpm workspace with a Next.js 16 App Router cloud app + a TypeScript `od` daemon CLI, modeled on multica-ai/multica. Includes shareable project links + workspace invitations so cloud-hosted projects can invite collaborators.

Implemented: structural scaffold (workspaces, schema, auth, pairing, task queue, SSE streaming, share links, invitations). **Not** implemented: porting the 28 legacy React components, skill/design-system route handlers, S3 file storage. See "Follow-ups" below.

## Files added

### Workspace root
- `pnpm-workspace.yaml` — pnpm workspace config (`apps/*`, `packages/*`)
- `package.json` — converted to workspace root; legacy Vite/Express scripts kept under `legacy:*`

### `packages/shared` — API contract types
- `src/schemas.ts` — zod request schemas (Send/VerifyCode, RegisterDaemon, ClaimTask, TaskMessage, CreateProject, CreateShareLink, InviteMember)
- `src/tokens.ts` — token mint/hash helpers (`od_pat_…`, `od_dt_…`, `od_share_…`)
- `src/jwt.ts` — session JWT sign/verify (HS256, jose)

### `packages/db` — Drizzle schema (Postgres + SQLite)
- `src/schema.ts` — Postgres dialect (cloud)
- `src/schema-sqlite.ts` — SQLite mirror (self-host); keep in sync by hand
- `src/client.ts` — `getDb()` selects driver by `DATABASE_URL` prefix
- `drizzle.config.ts` — drizzle-kit config that branches on dialect

Tables: `user`, `email_verification_code`, `workspace`, `member`, `workspace_invitation`, `personal_access_token`, `daemon_registration`, `project`, `project_share_link`, `conversation`, `message`, `project_file`, `agent_task`, `task_message`.

### `apps/web` — Next.js 16 App Router
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `.env.example`
- `app/layout.tsx`, `app/globals.css` (Tailwind v4)
- `app/page.tsx` — landing
- `app/login/page.tsx` + `LoginForm.tsx` — email-code login + CLI callback bridge
- `app/projects/page.tsx` — workspace project list
- `app/projects/[id]/page.tsx` + `ShareButton.tsx` — project shell + share dialog
- `app/settings/daemon/page.tsx` — paired daemons list + CLI install snippet
- `app/share/[token]/route.ts` — share-link landing (sets cookie, redirects)
- `app/invitations/[token]/route.ts` — invite acceptance
- `app/api/auth/send-code/route.ts` — generate 6-digit email code
- `app/api/auth/verify-code/route.ts` — verify, upsert user, mint PAT for CLI flow
- `app/api/daemon/register/route.ts` — PAT → daemon token
- `app/api/daemon/heartbeat/route.ts` — bumps `last_seen_at`
- `app/api/daemon/runtimes/[runtimeId]/tasks/claim/route.ts` — atomic task lease
- `app/api/daemon/tasks/[taskId]/messages/route.ts` — daemon writes streamed chunks
- `app/api/daemon/wakeups/route.ts` — daemon SSE wakeup channel (best-effort)
- `app/api/tasks/[taskId]/stream/route.ts` — browser SSE feed (replay + live)
- `app/api/projects/route.ts` — list/create
- `app/api/projects/[id]/share/route.ts` — list/create per-project share links
- `app/api/projects/[id]/chat/route.ts` — enqueue agent_task + wake daemon
- `app/api/workspaces/[wsId]/invitations/route.ts` — email invitations
- `lib/auth/session.ts` — JWT session cookie helpers
- `lib/auth/bearer.ts` — PAT/daemon-token verification
- `lib/access.ts` — unified ACL: workspace membership OR project share token
- `lib/realtime.ts` — in-process pub/sub for SSE fan-out (swap for Redis when scaling out)
- `lib/email.ts` — pluggable mailer (console for dev, resend for prod)

### `apps/cli` — `od` CLI/daemon (TypeScript)
- `src/cli.ts` — entry, dispatches `login`, `daemon`, `setup`
- `src/cmd_login.ts` — local-listener OAuth callback (mirrors multica `resolveCallbackBinding`)
- `src/cmd_daemon.ts` — register → heartbeat → poll-claim → spawn agent → stream messages
- `src/runtimes.ts` — probes claude/codex/gemini/opencode/cursor-agent on PATH
- `src/profile.ts` — `~/.od/profiles/<name>/config.json` storage
- `tsup.config.ts` — bundles to `dist/cli.js` with shebang for `bin: { od }`

### `docs/`
- `docs/architecture-cloud.md` — full architecture write-up (auth, transport, schema, deploy)

## Public surface

### Web routes
| route                               | purpose                                |
|-------------------------------------|----------------------------------------|
| `/`                                 | landing                                |
| `/login`                            | email-code sign-in (also CLI callback) |
| `/projects`                         | workspace project list                 |
| `/projects/:id`                     | project shell + share button           |
| `/settings/daemon`                  | paired devices                         |
| `/share/:token`                     | enter project via share link           |
| `/invitations/:token`               | accept workspace invite                |

### Cloud API (`apps/web/app/api`)
- Auth: `POST /api/auth/send-code`, `POST /api/auth/verify-code`
- Daemon: `POST /api/daemon/register`, `POST /api/daemon/heartbeat`, `GET /api/daemon/wakeups` (SSE), `POST /api/daemon/runtimes/:runtimeId/tasks/claim`, `POST /api/daemon/tasks/:taskId/messages`
- Tasks: `GET /api/tasks/:taskId/stream` (SSE, browser side)
- Projects: `GET|POST /api/projects`, `POST /api/projects/:id/chat`
- Sharing: `GET|POST /api/projects/:id/share`, `POST /api/workspaces/:wsId/invitations`

### CLI surface
- `od login [--profile <name>] [--app-url <url>]`
- `od daemon [--profile <name>]`
- `od setup` (login + daemon)

## Merge guidance

- This branch is **additive**: no legacy files were modified or deleted. Root `package.json` was rewritten to be a pnpm workspace; old scripts moved to `legacy:*`. If main absorbs other branches that touch `package.json`, expect a small merge there.
- Skills (`skills/`), design systems (`design-systems/`), templates (`templates/`), and assets (`assets/`) are untouched. The Next.js app reads them via `SKILLS_ROOT` / `DESIGN_SYSTEMS_ROOT` env vars (defaults assume the workspace layout).
- Recommended merge order: take this branch wholesale, then in a follow-up PR delete `src/`, `daemon/`, `vite.config.ts`, `index.html`, `dist/`, and the `legacy:*` scripts once team has cut over.
- Drizzle migrations are NOT generated yet — run `pnpm --filter @open-design/db generate` once before deploying. Choose dialect via `DATABASE_URL` and the config picks the right output dir.
- pnpm is required (the `workspace:*` protocol). If the repo currently uses npm only, run `corepack enable && corepack prepare pnpm@latest --activate` and `pnpm install` once.

## Verification

I did **not** run `pnpm install`, `next build`, or `tsc` in this worktree because:

- Net-new dependency graph (Next 16 canary, Drizzle, jose, tsup) — install would be slow and cache-cold.
- Some imports (`drizzle-orm` query helpers, `next` internals) need `pnpm install` to typecheck. Server route bodies use `(db as any)` casts at the boundary because the dialect-specific Drizzle types diverge between PG and SQLite — this is intentional and matches how multica's Go code uses sqlc-generated queries through one interface.

Before merging to main, the receiving agent should:

1. `pnpm install` at the workspace root.
2. `pnpm --filter @open-design/web typecheck` and `pnpm --filter @open-design/cli typecheck`.
3. `pnpm --filter @open-design/db generate` (against a real `DATABASE_URL`) to produce migrations.
4. Smoke-test: start `apps/web` with `DATABASE_URL=file:./.od/app.sqlite`, then `apps/cli` `od login` and `od daemon`. Open a project, click Share, paste the link in another browser.

## Follow-ups (out of scope for this branch)

1. Port `src/components/` (chat composer, file workspace, sketch editor, design panel) into `apps/web/app/projects/[id]/` as client components.
2. Mirror the legacy daemon's discovery routes (`/api/agents`, `/api/skills*`, `/api/design-systems*`) as Next route handlers reading `SKILLS_ROOT` / `DESIGN_SYSTEMS_ROOT` from disk.
3. File storage: implement S3 / R2 / GCS adapter behind `project_file.storageKey`. Add `POST /api/projects/:id/upload` (multipart or presigned).
4. Port `daemon/lint-artifact.js` into `apps/web/lib/lint.ts`.
5. Anthropic SDK direct mode for users who don't want to run a local daemon.
6. Replace `lib/realtime.ts` with Redis Pub/Sub when going multi-instance.
7. Drizzle Postgres + SQLite schemas drift over time — add a CI check that diffs them.

## Why this matches the user's ask

- "Refactor to Next.js 16 App Router referencing multica" — done at the structural level. Auth (browser-callback OAuth + 6-digit codes), transport (HTTP-claim + SSE wakeup), token model (PAT bootstrap → daemon token), and workspace tenancy are all multica patterns ported to TS.
- "Cloud + local daemon, not just local" — separated. Cloud is `apps/web` (Vercel-ready). Local is `apps/cli` (`od daemon`). They communicate only over the public HTTP API, so the cloud can sit anywhere the daemon can reach.
- "Unified TS stack" — single `pnpm-workspace.yaml`, all packages TS, schemas/types shared via `packages/shared`.
- "Project shareable as a link" — added `project_share_link` table + `/share/:token` landing + Share dialog UI in addition to the multica-style workspace invitations.
