import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { RegisterDaemonRequest } from '@open-design/shared';
import { generateDaemonToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import { authenticateBearer } from '@/lib/auth/bearer';

// Called by `od daemon` once at startup. Authenticated by the user's PAT.
// Returns a workspace-scoped daemon token (`od_dt_…`) that all subsequent
// daemon requests use. The PAT is only the bootstrap.
export async function POST(req: Request) {
  const auth = await authenticateBearer(req);
  if (!auth || auth.via !== 'pat') {
    return NextResponse.json({ error: 'PAT required' }, { status: 401 });
  }
  const body = RegisterDaemonRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  const [membership] = await (db as any)
    .select()
    .from(s.member)
    .where(eq(s.member.userId, auth.userId))
    .limit(1);
  // Auto-pick the first workspace if the request didn't specify one — for
  // the common case where users have one personal workspace.
  const workspaceId = body.data.workspaceId || membership?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: 'no workspace' }, { status: 400 });

  const tok = generateDaemonToken();
  const id = nanoid();
  await (db as any).insert(s.daemonRegistration).values({
    id,
    workspaceId,
    userId: auth.userId,
    hostname: body.data.hostname,
    platform: body.data.platform,
    os: body.data.os,
    cliVersion: body.data.cliVersion,
    runtimes: body.data.runtimes,
    tokenPrefix: tok.prefix,
    tokenHash: tok.hash,
    lastSeenAt: new Date(),
    createdAt: new Date(),
  });

  return NextResponse.json({
    id,
    workspaceId,
    daemonToken: tok.token,
  });
}
