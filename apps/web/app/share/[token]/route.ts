import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { hashToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';

// Magic-link landing for /share/<token>. Sets the share cookie and bounces
// to the project page. Cookie is scoped to the project path so multiple
// shares on different projects don't clobber each other.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashToken(token);
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const [link] = await (db as any)
    .select()
    .from(s.projectShareLink)
    .where(and(eq(s.projectShareLink.tokenHash, tokenHash), isNull(s.projectShareLink.revokedAt)))
    .limit(1);
  if (!link) return new NextResponse('Link is no longer valid', { status: 410 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return new NextResponse('Link has expired', { status: 410 });
  }
  await (db as any)
    .update(s.projectShareLink)
    .set({ lastUsedAt: new Date() })
    .where(eq(s.projectShareLink.id, link.id));

  const base = new URL(req.url).origin;
  const dest = `${base}/projects/${link.projectId}`;
  const res = NextResponse.redirect(dest, 303);
  res.cookies.set('od_share', token, {
    path: `/projects/${link.projectId}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
