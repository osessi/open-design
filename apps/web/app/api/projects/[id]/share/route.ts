import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { CreateShareLinkRequest } from '@open-design/shared';
import { generateShareLinkToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';
import { resolveProjectAccess } from '@/lib/access';

// Per-project public share links. Three roles: view / comment / edit.
// Anyone with the URL can open the project at the share's role; revoke from
// settings to invalidate. Multica uses workspace invites for collaboration;
// we add this lighter primitive on top so users can share a single project
// without giving full workspace membership.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await resolveProjectAccess(id, session);
  if (!access.ok || access.via !== 'member') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const rows = await (db as any)
    .select({
      id: s.projectShareLink.id,
      role: s.projectShareLink.role,
      tokenPrefix: s.projectShareLink.tokenPrefix,
      expiresAt: s.projectShareLink.expiresAt,
      createdAt: s.projectShareLink.createdAt,
      lastUsedAt: s.projectShareLink.lastUsedAt,
    })
    .from(s.projectShareLink)
    .where(and(eq(s.projectShareLink.projectId, id), isNull(s.projectShareLink.revokedAt)));
  return NextResponse.json({ links: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const access = await resolveProjectAccess(id, session);
  if (!access.ok || access.via !== 'member' || access.role === 'member') {
    // Only owner/admin of the workspace can create share links.
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = CreateShareLinkRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const tok = generateShareLinkToken();
  const linkId = nanoid();
  const expiresAt = body.data.expiresInDays
    ? new Date(Date.now() + body.data.expiresInDays * 24 * 60 * 60_000)
    : null;
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  await (db as any).insert(s.projectShareLink).values({
    id: linkId,
    projectId: id,
    role: body.data.role,
    tokenPrefix: tok.prefix,
    tokenHash: tok.hash,
    createdByUserId: session.sub,
    expiresAt,
    createdAt: new Date(),
  });

  const base = process.env.PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = `${base}/share/${tok.token}`;
  return NextResponse.json({ id: linkId, url, role: body.data.role, expiresAt });
}
