// Bearer token verification used by /api/daemon/* and /api/cli/* routes.
// Two token shapes are accepted:
//   - Personal Access Token (`od_pat_…`)  — used during CLI bootstrap (login → daemon register)
//   - Daemon Token (`od_dt_…`)            — minted on `/api/daemon/register`, used by long-running daemon
import { hashToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import { eq, isNull } from 'drizzle-orm';

export interface AuthedUser {
  userId: string;
  workspaceId?: string;
  daemonId?: string;
  via: 'pat' | 'daemon';
}

export async function authenticateBearer(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  const tokenHash = hashToken(token);
  const { db, schema, dialect } = await getDb();
  // Cast the schema once; concrete query shape is identical across dialects.
  const s = schema as typeof import('@open-design/db/schema');

  if (token.startsWith('od_dt_')) {
    const [row] = await (db as any)
      .select()
      .from(s.daemonRegistration)
      .where(eq(s.daemonRegistration.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, workspaceId: row.workspaceId, daemonId: row.id, via: 'daemon' };
  }
  if (token.startsWith('od_pat_')) {
    const [row] = await (db as any)
      .select()
      .from(s.personalAccessToken)
      .where(eq(s.personalAccessToken.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
    return { userId: row.userId, via: 'pat' };
  }
  void isNull; // silence unused import
  void dialect;
  return null;
}
