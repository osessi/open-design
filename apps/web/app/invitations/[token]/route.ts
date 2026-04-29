import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { hashToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import { getSessionFromCookies, setSessionCookie } from '@/lib/auth/session';

// Invite acceptance. If the user isn't signed in, we route them to /login
// with a return URL; once signed in, we add them to the workspace.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSessionFromCookies();
  const tokenHash = hashToken(token);
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  const [invite] = await (db as any)
    .select()
    .from(s.workspaceInvitation)
    .where(and(eq(s.workspaceInvitation.tokenHash, tokenHash), eq(s.workspaceInvitation.status, 'pending')))
    .limit(1);
  if (!invite) return new NextResponse('Invite no longer valid', { status: 410 });
  if (new Date(invite.expiresAt) < new Date()) {
    await (db as any).update(s.workspaceInvitation).set({ status: 'expired' }).where(eq(s.workspaceInvitation.id, invite.id));
    return new NextResponse('Invite expired', { status: 410 });
  }

  if (!session) {
    const base = new URL(req.url).origin;
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(`/invitations/${token}`)}`, 303);
  }
  if (session.email.toLowerCase() !== invite.inviteeEmail) {
    return new NextResponse(`This invite is for ${invite.inviteeEmail}. Sign in as that user.`, { status: 403 });
  }

  // Idempotent: only insert membership if not already present.
  const [existing] = await (db as any)
    .select()
    .from(s.member)
    .where(and(eq(s.member.workspaceId, invite.workspaceId), eq(s.member.userId, session.sub)))
    .limit(1);
  if (!existing) {
    await (db as any).insert(s.member).values({
      workspaceId: invite.workspaceId,
      userId: session.sub,
      role: invite.role,
      createdAt: new Date(),
    });
  }
  await (db as any)
    .update(s.workspaceInvitation)
    .set({ status: 'accepted', inviteeUserId: session.sub })
    .where(eq(s.workspaceInvitation.id, invite.id));

  // Refresh the JWT so the new workspace shows up on subsequent requests.
  const updated = {
    ...session,
    workspaces: [...session.workspaces.filter((w) => w.id !== invite.workspaceId), { id: invite.workspaceId, role: invite.role }],
  };
  await setSessionCookie(updated);

  const base = new URL(req.url).origin;
  return NextResponse.redirect(`${base}/projects`, 303);
}
