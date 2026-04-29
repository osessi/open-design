import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { CreateProjectRequest } from '@open-design/shared';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const wsIds = session.workspaces.map((w) => w.id);
  if (!wsIds.length) return NextResponse.json({ projects: [] });
  const rows = await (db as any)
    .select()
    .from(s.project)
    .where(inArray(s.project.workspaceId, wsIds))
    .orderBy(desc(s.project.updatedAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = CreateProjectRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  if (!session.workspaces.some((w) => w.id === body.data.workspaceId)) {
    return NextResponse.json({ error: 'not a member of workspace' }, { status: 403 });
  }

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const id = nanoid();
  const now = new Date();
  await (db as any).insert(s.project).values({
    id,
    workspaceId: body.data.workspaceId,
    name: body.data.name,
    skillId: body.data.skillId ?? null,
    designSystemId: body.data.designSystemId ?? null,
    pendingPrompt: body.data.pendingPrompt ?? null,
    metadata: null,
    createdByUserId: session.sub,
    createdAt: now,
    updatedAt: now,
  });
  void and;
  void eq;
  return NextResponse.json({ project: { id, name: body.data.name, workspaceId: body.data.workspaceId } });
}
