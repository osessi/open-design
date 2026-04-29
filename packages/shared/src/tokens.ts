import { randomBytes, createHash } from 'node:crypto';

const PAT_PREFIX = 'od_pat_';
const DAEMON_TOKEN_PREFIX = 'od_dt_';
const SHARE_LINK_PREFIX = 'od_share_';

export function generatePat(): { token: string; prefix: string; hash: string } {
  return makeToken(PAT_PREFIX, 32);
}

export function generateDaemonToken(): { token: string; prefix: string; hash: string } {
  return makeToken(DAEMON_TOKEN_PREFIX, 32);
}

export function generateShareLinkToken(): { token: string; prefix: string; hash: string } {
  return makeToken(SHARE_LINK_PREFIX, 18);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 12);
}

function makeToken(prefix: string, byteLen: number) {
  const raw = randomBytes(byteLen).toString('base64url');
  const token = `${prefix}${raw}`;
  return {
    token,
    prefix: tokenPrefix(token),
    hash: hashToken(token),
  };
}

export const TOKEN_PREFIXES = {
  pat: PAT_PREFIX,
  daemon: DAEMON_TOKEN_PREFIX,
  share: SHARE_LINK_PREFIX,
};
