// Postgres dialect (cloud).
// SQLite mirror lives in `./schema-sqlite.ts` — keep the two in sync by hand;
// the field shapes are identical, only the column types differ.
import { pgTable, text, timestamp, integer, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const emailVerificationCode = pgTable(
  'email_verification_code',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byEmail: index('email_verification_code_email_idx').on(t.email) }),
);

export const workspace = pgTable('workspace', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const member = pgTable(
  'member',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex('member_pk').on(t.workspaceId, t.userId),
    byUser: index('member_user_idx').on(t.userId),
  }),
);

export const workspaceInvitation = pgTable(
  'workspace_invitation',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    inviteeEmail: text('invitee_email').notNull(),
    inviteeUserId: text('invitee_user_id').references(() => user.id, { onDelete: 'set null' }),
    invitedByUserId: text('invited_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'declined', 'expired'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byWorkspace: index('workspace_invitation_workspace_idx').on(t.workspaceId),
    byEmail: index('workspace_invitation_email_idx').on(t.inviteeEmail),
  }),
);

export const personalAccessToken = pgTable(
  'personal_access_token',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index('pat_user_idx').on(t.userId),
    byHash: uniqueIndex('pat_hash_uk').on(t.tokenHash),
  }),
);

export const daemonRegistration = pgTable(
  'daemon_registration',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    platform: text('platform').notNull(),
    os: text('os').notNull(),
    cliVersion: text('cli_version').notNull(),
    runtimes: jsonb('runtimes').$type<Array<{ id: string; name: string; bin: string; version?: string; available: boolean }>>().notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byWorkspace: index('daemon_workspace_idx').on(t.workspaceId),
    byHash: uniqueIndex('daemon_hash_uk').on(t.tokenHash),
  }),
);

export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    skillId: text('skill_id'),
    designSystemId: text('design_system_id'),
    pendingPrompt: text('pending_prompt'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byWorkspace: index('project_workspace_idx').on(t.workspaceId) }),
);

export const projectShareLink = pgTable(
  'project_share_link',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['view', 'comment', 'edit'] }).notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byProject: index('share_project_idx').on(t.projectId),
    byHash: uniqueIndex('share_hash_uk').on(t.tokenHash),
  }),
);

export const conversation = pgTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byProject: index('conversation_project_idx').on(t.projectId) }),
);

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    events: jsonb('events').$type<unknown[]>(),
    attachments: jsonb('attachments').$type<unknown[]>(),
    producedFiles: jsonb('produced_files').$type<unknown[]>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ byConversation: index('message_conversation_idx').on(t.conversationId, t.position) }),
);

export const projectFile = pgTable(
  'project_file',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byProject: index('project_file_project_idx').on(t.projectId),
    nameUnique: uniqueIndex('project_file_name_uk').on(t.projectId, t.name),
  }),
);

export const agentTask = pgTable(
  'agent_task',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').references(() => conversation.id, { onDelete: 'set null' }),
    runtimeId: text('runtime_id').notNull(),
    requestedByUserId: text('requested_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<{
      systemPrompt: string;
      message: string;
      attachments?: Array<{ name: string; mime: string; storageKey: string }>;
      cwdHint?: string;
    }>().notNull(),
    status: text('status', {
      enum: ['queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled'],
    }).notNull(),
    leasedByDaemonId: text('leased_by_daemon_id').references(() => daemonRegistration.id, { onDelete: 'set null' }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStatus: index('agent_task_status_idx').on(t.workspaceId, t.runtimeId, t.status),
  }),
);

export const taskMessage = pgTable(
  'task_message',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => agentTask.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind', { enum: ['stdout', 'stderr', 'agent', 'status', 'end'] }).notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: uniqueIndex('task_message_seq_uk').on(t.taskId, t.seq),
  }),
);

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(member),
  pats: many(personalAccessToken),
}));

export const workspaceRelations = relations(workspace, ({ many, one }) => ({
  members: many(member),
  projects: many(project),
  owner: one(user, { fields: [workspace.ownerId], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  workspace: one(workspace, { fields: [project.workspaceId], references: [workspace.id] }),
  conversations: many(conversation),
  shareLinks: many(projectShareLink),
  files: many(projectFile),
}));
