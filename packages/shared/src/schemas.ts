import { z } from 'zod';

export const SendCodeRequest = z.object({
  email: z.string().email(),
});

export const VerifyCodeRequest = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  cliCallback: z.string().url().optional(),
  cliState: z.string().min(8).optional(),
});

export const RegisterDaemonRequest = z.object({
  workspaceId: z.string(),
  hostname: z.string(),
  platform: z.string(),
  os: z.string(),
  cliVersion: z.string(),
  runtimes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      bin: z.string(),
      version: z.string().optional(),
      available: z.boolean(),
    }),
  ),
});

export const ClaimTaskRequest = z.object({
  runtimeId: z.string(),
});

export const TaskMessageRequest = z.object({
  taskId: z.string(),
  kind: z.enum(['stdout', 'stderr', 'agent', 'status', 'end']),
  payload: z.unknown(),
  seq: z.number().int().nonnegative(),
});

export const CreateProjectRequest = z.object({
  name: z.string().min(1).max(120),
  workspaceId: z.string(),
  skillId: z.string().optional(),
  designSystemId: z.string().optional(),
  pendingPrompt: z.string().optional(),
});

export const CreateShareLinkRequest = z.object({
  role: z.enum(['view', 'comment', 'edit']),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const InviteMemberRequest = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

export type SendCodeRequest = z.infer<typeof SendCodeRequest>;
export type VerifyCodeRequest = z.infer<typeof VerifyCodeRequest>;
export type RegisterDaemonRequest = z.infer<typeof RegisterDaemonRequest>;
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequest>;
export type TaskMessageRequest = z.infer<typeof TaskMessageRequest>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;
export type CreateShareLinkRequest = z.infer<typeof CreateShareLinkRequest>;
export type InviteMemberRequest = z.infer<typeof InviteMemberRequest>;

export const TaskStatus = z.enum([
  'queued',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const ShareRole = z.enum(['view', 'comment', 'edit']);
export type ShareRole = z.infer<typeof ShareRole>;

export const MemberRole = z.enum(['owner', 'admin', 'member']);
export type MemberRole = z.infer<typeof MemberRole>;
