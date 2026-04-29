import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { InviteMemberRequest } from '@open-design/shared';
import { hashToken } from '@open-design/shared/tokens';
import { randomBytes } from 'node:crypto';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies } from '@/lib/auth/session';
import { sendEmail } from '@/lib/email';

const INVITE_TTL_DAYS = 7;

export async function POST(req: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { wsId } = await params;
  const ws = session.workspaces.find((w) => w.id === wsId);
  if (!ws || ws.role === 'member') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = InviteMemberRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  const token = `od_inv_${randomBytes(24).toString('base64url')}`;
  const id = nanoid();
  await (db as any).insert(s.workspaceInvitation).values({
    id,
    workspaceId: wsId,
    inviteeEmail: body.data.email.toLowerCase(),
    inviteeUserId: null,
    invitedByUserId: session.sub,
    role: body.data.role,
    status: 'pending',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60_000),
    createdAt: new Date(),
  });

  const base = process.env.PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = `${base}/invitations/${token}`;
  await sendEmail({
    to: body.data.email,
    subject: `You've been invited to a workspace on Open Design`,
    text: `${session.email} invited you to join their workspace as ${body.data.role}.\nAccept here: ${url}\nThis link expires in ${INVITE_TTL_DAYS} days.`,
  });
  void and;
  void eq;
  return NextResponse.json({ id, url });
}
