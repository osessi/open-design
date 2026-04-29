# Architecture: cloud UI + local daemon (Next.js 16 refactor)

> Supersedes `architecture.md` for the new stack. Legacy Vite + Express docs remain valid for the `src/` and `daemon/` directories preserved on this branch.

This branch refactors Open Design from a Vite SPA + Express daemon (localhost-only) into a cloud-deployable Next.js 16 App Router product paired with a local `od` daemon CLI. Modeled on [multica-ai/multica](https://github.com/multica-ai/multica), unified onto a TypeScript stack.

```
                                   ┌──────────────────────────┐
  ┌──────────┐                     │                          │
  │ Browser  │ ─── HTTP/SSE ─────► │  apps/web (Next.js 16)   │
  └──────────┘                     │  • Login / share / UI    │
                                   │  • Drizzle → PG/SQLite   │
                                   │  • SSE fan-out hub       │
                                   └─────────┬─▲──────────────┘
                                             │ │
                          POST /tasks claim  │ │  task_messages
                          GET /wakeups (SSE) │ │  (POST per chunk)
                                             ▼ │
                                   ┌──────────────────────────┐
                                   │  apps/cli (`od daemon`)  │
                                   │  • Profile @ ~/.od       │
                                   │  • Spawns claude/codex/… │
                                   └──────────────────────────┘
```

## Auth flow (browser-callback OAuth, no device codes)

1. `od login` binds `127.0.0.1:<rand>`, opens browser to `${WEB}/login?cli_callback=…&cli_state=…`.
2. User signs in (email 6-digit code).
3. After verify, the web app redirects to the local listener with a freshly minted **PAT** (`od_pat_…`).
4. PAT is stored at `~/.od/profiles/<name>/config.json` (mode 0600). State string is verified to prevent CSRF.

## Daemon registration

1. `od daemon` boot:
   - PAT-authenticates `POST /api/daemon/register` with hostname, OS, runtimes detected on PATH.
   - Server returns a workspace-scoped **daemon token** (`od_dt_…`). Token is hashed at rest.
2. Daemon then uses the daemon token for everything else; PAT is no longer touched until next `od login`.
3. Heartbeats every 15s (`POST /api/daemon/heartbeat`).

## Task flow

1. Browser calls `POST /api/projects/<id>/chat` → server inserts an `agent_task` row (status = `queued`) and pings the in-process pub/sub.
2. Daemon's open SSE connection on `GET /api/daemon/wakeups` receives a `task_available` hint **or** the daemon notices on the next 3s polling cycle.
3. Daemon `POST /api/daemon/runtimes/<runtimeId>/tasks/claim` performs an atomic `UPDATE … WHERE status='queued'` lease. HTTP claim is the source of truth; SSE wakeup is a latency optimization.
4. Daemon spawns the matching local agent (claude/codex/…), tees stdout/stderr to `POST /api/daemon/tasks/<taskId>/messages` chunked by `seq`.
5. Browser opens `GET /api/tasks/<taskId>/stream` (SSE). Server replays persisted `task_message` rows, then forwards new chunks live via the pub/sub.
6. On `kind: end`, the task row flips to `succeeded`/`failed`.

This mirrors multica's "HTTP-claim + WS-wakeup" hybrid, ported to TS + SSE (which Next.js route handlers support without a custom server).

## Data model (Drizzle)

Single Drizzle schema with both Postgres and SQLite mirrors. Runtime selects by `DATABASE_URL` prefix:

- `postgres://…` → cloud (Vercel/Neon/Supabase)
- `file:./.od/app.sqlite` → self-hosted single node

Tables:

| table                  | purpose                                                              |
|------------------------|----------------------------------------------------------------------|
| `user`                 | one row per signed-in human                                          |
| `email_verification_code` | 6-digit codes for email login                                     |
| `workspace` + `member` | tenancy + roles (owner/admin/member)                                 |
| `workspace_invitation` | email-based invites, 7-day TTL                                       |
| `personal_access_token`| issued during CLI login, used to bootstrap daemon                    |
| `daemon_registration`  | one per paired device (workspace-scoped daemon token, hashed)        |
| `project`              | belongs to workspace                                                 |
| `project_share_link`   | per-project token + role (view/comment/edit) + optional expiry       |
| `conversation` / `message` | chat history per project                                         |
| `project_file`         | metadata; bytes go to S3/GCS or the daemon's local disk              |
| `agent_task`           | queued/claimed/running/succeeded/failed/cancelled                    |
| `task_message`         | streamed chunks per task (replayable)                                |

## Sharing & collaboration

Two complementary primitives:

1. **Workspace invitations** (multica-style): `POST /api/workspaces/<wsId>/invitations { email, role }` mints a `od_inv_<token>` link. Accepting it via `/invitations/<token>` adds the user to the `member` table. Recommended for ongoing collaborators who should see all workspace projects.

2. **Project share links** (NEW vs multica): `POST /api/projects/<id>/share { role: view|comment|edit, expiresInDays? }` mints `${PUBLIC_APP_URL}/share/<token>`. Anyone with the link can open the project at the issued role. Cookie binds the share scope to the specific project path. Revoke from the project's settings.

The ACL helper `lib/access.ts` resolves either path uniformly: `member` first, then `share` cookie (or `?share=` query). The page returns a single `ProjectAccess` record so server components and route handlers gate identically.

## Deploy targets

### Cloud (Vercel + Postgres)

```
DATABASE_URL=postgres://…
AUTH_JWT_SECRET=…              # 32+ random bytes
PUBLIC_APP_URL=https://your-app.vercel.app
EMAIL_PROVIDER=resend
RESEND_API_KEY=…
EMAIL_FROM=Open Design <noreply@your-domain>
```

The web app is fully serverless. SSE works on Vercel (route handlers stream `text/event-stream`) within the platform timeout — for very long agent runs, host on Fly/Railway/your own infra instead.

### Self-host single node

```
DATABASE_URL=file:./.od/app.sqlite
AUTH_JWT_SECRET=…
EMAIL_PROVIDER=console
```

Run `pnpm --filter @open-design/web build && pnpm --filter @open-design/web start`. SQLite is fine up to a few hundred users.

### Multi-instance

The in-process pub/sub at `apps/web/lib/realtime.ts` is the only piece that doesn't horizontally scale. Swap for Redis Pub/Sub or Postgres `LISTEN/NOTIFY` keeping the same call signature; nothing else needs to change.

## Migration from the legacy stack

The legacy Vite + Express daemon (`src/`, `daemon/`) is preserved in this branch under the `legacy:*` npm scripts so we can run both stacks side-by-side during the transition. Skills and design-systems directories are unchanged and consumed at request time by the new Next.js app via `SKILLS_ROOT` / `DESIGN_SYSTEMS_ROOT`.

## What's NOT yet ported

These belong in follow-up PRs and are deliberately out of scope for the scaffold:

- File storage adapter (S3/GCS) for the cloud — `project_file.storageKey` is shaped for it but no upload route exists yet.
- Skill / design-system route handlers — the legacy Express endpoints aren't mirrored on Next.js yet.
- The 28 React components from `src/components/` — only the project shell page exists; chat composer / file viewer / sketch editor still need porting.
- Anti-slop linter (`daemon/lint-artifact.js`).
- Anthropic SDK browser-mode fallback.
