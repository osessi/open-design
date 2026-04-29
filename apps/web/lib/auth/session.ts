import { cookies } from 'next/headers';
import { jwtSecretFromEnv, signSessionJwt, verifySessionJwt, type JwtClaims } from '@open-design/shared/jwt';

const COOKIE = 'od_session';

export async function getSessionFromCookies(): Promise<JwtClaims | null> {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  if (!raw) return null;
  try {
    return await verifySessionJwt(raw, jwtSecretFromEnv());
  } catch {
    return null;
  }
}

export async function setSessionCookie(claims: JwtClaims): Promise<string> {
  const token = await signSessionJwt(claims, jwtSecretFromEnv());
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return token;
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}
