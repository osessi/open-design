import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@open-design/db/client';
import { authenticateBearer } from '@/lib/auth/bearer';

export async function POST(req: Request) {
  const auth = await authenticateBearer(req);
  if (!auth || auth.via !== 'daemon' || !auth.daemonId) {
    return NextResponse.json({ error: 'daemon token required' }, { status: 401 });
  }
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  await (db as any)
    .update(s.daemonRegistration)
    .set({ lastSeenAt: new Date() })
    .where(eq(s.daemonRegistration.id, auth.daemonId));
  return NextResponse.json({ ok: true });
}
