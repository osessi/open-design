import { SignJWT, jwtVerify } from 'jose';

export interface JwtClaims {
  sub: string;
  email: string;
  workspaces: Array<{ id: string; role: 'owner' | 'admin' | 'member' }>;
}

const ALG = 'HS256';

export async function signSessionJwt(
  claims: JwtClaims,
  secret: Uint8Array,
  expiresIn = '30d',
): Promise<string> {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifySessionJwt(
  token: string,
  secret: Uint8Array,
): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtClaims;
}

export function jwtSecretFromEnv(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const raw = env.AUTH_JWT_SECRET ?? env.JWT_SECRET;
  if (!raw) throw new Error('AUTH_JWT_SECRET is required');
  return new TextEncoder().encode(raw);
}
