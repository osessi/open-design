import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { VerifyCodeRequest } from '@open-design/shared';
import { generatePat } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import { setSessionCookie } from '@/lib/auth/session';

export async function POST(req: Request) {
  const body = VerifyCodeRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { email, code, cliCallback, cliState } = body.data;
  const codeHash = createHash('sha256').update(code).digest('hex');
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  const [match] = await (db as any)
    .select()
    .from(s.emailVerificationCode)
    .where(
      and(
        eq(s.emailVerificationCode.email, email.toLowerCase()),
        eq(s.emailVerificationCode.codeHash, codeHash),
        gt(s.emailVerificationCode.expiresAt, new Date()),
        isNull(s.emailVerificationCode.consumedAt),
      ),
    )
    .orderBy(desc(s.emailVerificationCode.createdAt))
    .limit(1);

  if (!match) return NextResponse.json({ error: 'invalid or expired code' }, { status: 401 });

  await (db as any)
    .update(s.emailVerificationCode)
    .set({ consumedAt: new Date() })
    .where(eq(s.emailVerificationCode.id, match.id));

  // Upsert user.
  let [user] = await (db as any)
    .select()
    .from(s.user)
    .where(eq(s.user.email, email.toLowerCase()))
    .limit(1);
  if (!user) {
    const id = nanoid();
    await (db as any).insert(s.user).values({
      id,
      email: email.toLowerCase(),
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    user = { id, email: email.toLowerCase() };
    // Bootstrap a personal workspace so the user has somewhere to drop projects.
    const wsId = nanoid();
    await (db as any).insert(s.workspace).values({
      id: wsId,
      slug: `${email.split('@')[0]}-${wsId.slice(0, 4)}`.toLowerCase(),
      name: `${email.split('@')[0]}'s workspace`,
      ownerId: id,
      createdAt: new Date(),
    });
    await (db as any).insert(s.member).values({
      workspaceId: wsId,
      userId: id,
      role: 'owner',
      createdAt: new Date(),
    });
  }

  // Resolve memberships for the JWT.
  const memberships: Array<{ workspaceId: string; role: 'owner' | 'admin' | 'member' }> =
    await (db as any)
      .select({ workspaceId: s.member.workspaceId, role: s.member.role })
      .from(s.member)
      .where(eq(s.member.userId, user.id));

  const claims = {
    sub: user.id as string,
    email: user.email as string,
    workspaces: memberships.map((m) => ({ id: m.workspaceId, role: m.role })),
  };
  await setSessionCookie(claims);

  // CLI bootstrap path: mint a PAT and bounce back to the local listener.
  if (cliCallback && cliState) {
    const pat = generatePat();
    await (db as any).insert(s.personalAccessToken).values({
      id: nanoid(),
      userId: user.id,
      name: `cli-${new Date().toISOString().slice(0, 10)}`,
      tokenPrefix: pat.prefix,
      tokenHash: pat.hash,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
      createdAt: new Date(),
    });
    const cb = new URL(cliCallback);
    cb.searchParams.set('token', pat.token);
    cb.searchParams.set('state', cliState);
    cb.searchParams.set('user_id', user.id);
    cb.searchParams.set('email', user.email);
    return NextResponse.json({ ok: true, cliRedirect: cb.toString() });
  }

  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
