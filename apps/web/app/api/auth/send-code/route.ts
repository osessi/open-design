import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createHash, randomInt } from 'node:crypto';
import { SendCodeRequest } from '@open-design/shared';
import { getDb } from '@open-design/db/client';
import { sendEmail } from '@/lib/email';

const CODE_TTL_MIN = 10;

export async function POST(req: Request) {
  const body = SendCodeRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = createHash('sha256').update(code).digest('hex');

  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');

  await (db as any).insert(s.emailVerificationCode).values({
    id: nanoid(),
    email: body.data.email.toLowerCase(),
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    createdAt: new Date(),
  });

  await sendEmail({
    to: body.data.email,
    subject: `Open Design sign-in code: ${code}`,
    text: `Your code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`,
  });

  return NextResponse.json({ ok: true });
}
