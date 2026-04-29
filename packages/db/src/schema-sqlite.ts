// SQLite mirror of `schema.ts` for self-hosted / local mode.
// Field shapes match — only the column types differ. Keep in sync by hand.
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const ts = (name: string) =>
  integer(name, { mode: 'timestamp' });

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: ts('email_verified_at'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: ts('created_at').notNull(),
});

export const emailVerificationCode = sqliteTable(
  'email_verification_code',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({ byEmail: index('evc_email_idx').on(t.email) }),
);

export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => user.id),
  createdAt: ts('created_at').notNull(),
});

export const member = sqliteTable(
  'member',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    pk: uniqueIndex('member_pk').on(t.workspaceId, t.userId),
    byUser: index('member_user_idx').on(t.userId),
  }),
);

export const workspaceInvitation = sqliteTable(
  'workspace_invitation',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    inviteeEmail: text('invitee_email').notNull(),
    inviteeUserId: text('invitee_user_id').references(() => user.id),
    invitedByUserId: text('invited_by_user_id').notNull().references(() => user.id),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'declined', 'expired'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byWorkspace: index('inv_workspace_idx').on(t.workspaceId),
    byEmail: index('inv_email_idx').on(t.inviteeEmail),
  }),
);

export const personalAccessToken = sqliteTable(
  'personal_access_token',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at'),
    lastUsedAt: ts('last_used_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byUser: index('pat_user_idx').on(t.userId),
    byHash: uniqueIndex('pat_hash_uk').on(t.tokenHash),
  }),
);

export const daemonRegistration = sqliteTable(
  'daemon_registration',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    platform: text('platform').notNull(),
    os: text('os').notNull(),
    cliVersion: text('cli_version').notNull(),
    runtimes: text('runtimes', { mode: 'json' }).$type<Array<{ id: string; name: string; bin: string; version?: string; available: boolean }>>().notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byWorkspace: index('daemon_workspace_idx').on(t.workspaceId),
    byHash: uniqueIndex('daemon_hash_uk').on(t.tokenHash),
  }),
);

export const project = sqliteTable(
  'project',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    skillId: text('skill_id'),
    designSystemId: text('design_system_id'),
    pendingPrompt: text('pending_prompt'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({ byWorkspace: index('project_workspace_idx').on(t.workspaceId) }),
);

export const projectShareLink = sqliteTable(
  'project_share_link',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['view', 'comment', 'edit'] }).notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdByUserId: text('created_by_user_id').notNull().references(() => user.id),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    lastUsedAt: ts('last_used_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byProject: index('share_project_idx').on(t.projectId),
    byHash: uniqueIndex('share_hash_uk').on(t.tokenHash),
  }),
);

export const conversation = sqliteTable('conversation', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  events: text('events', { mode: 'json' }).$type<unknown[]>(),
  attachments: text('attachments', { mode: 'json' }).$type<unknown[]>(),
  producedFiles: text('produced_files', { mode: 'json' }).$type<unknown[]>(),
  startedAt: ts('started_at'),
  endedAt: ts('ended_at'),
  position: integer('position').notNull(),
  createdAt: ts('created_at').notNull(),
});

export const projectFile = sqliteTable(
  'project_file',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({
    byProject: index('project_file_project_idx').on(t.projectId),
    nameUnique: uniqueIndex('project_file_name_uk').on(t.projectId, t.name),
  }),
);

export const agentTask = sqliteTable(
  'agent_task',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').references(() => conversation.id),
    runtimeId: text('runtime_id').notNull(),
    requestedByUserId: text('requested_by_user_id').notNull().references(() => user.id),
    payload: text('payload', { mode: 'json' }).$type<{
      systemPrompt: string;
      message: string;
      attachments?: Array<{ name: string; mime: string; storageKey: string }>;
      cwdHint?: string;
    }>().notNull(),
    status: text('status', {
      enum: ['queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled'],
    }).notNull(),
    leasedByDaemonId: text('leased_by_daemon_id'),
    leaseExpiresAt: ts('lease_expires_at'),
    error: text('error'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => ({
    byStatus: index('agent_task_status_idx').on(t.workspaceId, t.runtimeId, t.status),
  }),
);

export const taskMessage = sqliteTable(
  'task_message',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull().references(() => agentTask.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind', { enum: ['stdout', 'stderr', 'agent', 'status', 'end'] }).notNull(),
    payload: text('payload', { mode: 'json' }),
    createdAt: ts('created_at').notNull(),
  },
  (t) => ({
    byTask: uniqueIndex('task_message_seq_uk').on(t.taskId, t.seq),
  }),
);
