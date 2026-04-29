// Project ACL helper. A user can access a project if they are a member of
// its workspace OR if the request carries a valid project share token in
// the `od_share` cookie / `?share=` query param.
import { cookies } from 'next/headers';
import { eq, and, isNull } from 'drizzle-orm';
import { hashToken } from '@open-design/shared/tokens';
import { getDb } from '@open-design/db/client';
import type { JwtClaims } from '@open-design/shared/jwt';
import type { ShareRole } from '@open-design/shared';

export type ProjectAccess =
  | { ok: true; via: 'member'; role: 'owner' | 'admin' | 'member' }
  | { ok: true; via: 'share'; role: ShareRole }
  | { ok: false; reason: 'unauthorized' | 'not_found' };

export async function resolveProjectAccess(
  projectId: string,
  session: JwtClaims | null,
  shareToken?: string | null,
): Promise<ProjectAccess> {
  const { db, schema } = await getDb();
  const s = schema as typeof import('@open-design/db/schema');
  const [project] = await (db as any)
    .select()
    .from(s.project)
    .where(eq(s.project.id, projectId))
    .limit(1);
  if (!project) return { ok: false, reason: 'not_found' };

  if (session) {
    const ws = session.workspaces.find((w) => w.id === project.workspaceId);
    if (ws) return { ok: true, via: 'member', role: ws.role };
  }

  if (!shareToken) {
    const c = await cookies();
    shareToken = c.get('od_share')?.value ?? null;
  }
  if (shareToken) {
    const tokenHash = hashToken(shareToken);
    const [link] = await (db as any)
      .select()
      .from(s.projectShareLink)
      .where(
        and(
          eq(s.projectShareLink.tokenHash, tokenHash),
          eq(s.projectShareLink.projectId, projectId),
          isNull(s.projectShareLink.revokedAt),
        ),
      )
      .limit(1);
    if (link) {
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return { ok: false, reason: 'unauthorized' };
      }
      return { ok: true, via: 'share', role: link.role as ShareRole };
    }
  }

  return { ok: false, reason: 'unauthorized' };
}
