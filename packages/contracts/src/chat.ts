import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
const accountId = z.string().min(1).max(200);
export const chatSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  revision: z.int().positive(),
  maximumLength: z.int().min(100).max(1000),
  burstLimit: z.int().min(1).max(10),
  hourlyLimit: z.int().min(1).max(120),
});
export const defaultChatSettings = {
  enabled: false,
  revision: 1,
  maximumLength: 1000,
  burstLimit: 5,
  hourlyLimit: 60,
} as const;
const common = {
  commandId: idSchema,
  competitionId: idSchema,
  groupId: idSchema,
};
const reason = z.string().trim().min(5).max(1000);
export const chatCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('post'),
    body: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine(
        (s) =>
          // Explicitly reject control characters and bidi overrides in member text.
          // eslint-disable-next-line no-control-regex
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(
            s,
          ),
        'Unsupported control character',
      ),
  }),
  z.strictObject({ ...common, kind: z.literal('delete'), messageId: idSchema }),
  z.strictObject({
    ...common,
    kind: z.literal('report'),
    messageId: idSchema,
    reason,
  }),
  z.strictObject({ ...common, kind: z.literal('mute'), muted: z.boolean() }),
  z.strictObject({
    ...common,
    kind: z.literal('block'),
    accountId,
    blocked: z.boolean(),
  }),
]);
export const chatModerationCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('configure'),
    settings: chatSettingsSchema,
    reason,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('remove'),
    messageId: idSchema,
    reason,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('timeout'),
    accountId,
    until: instantSchema.nullable(),
    reason,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('resolve-report'),
    reportId: idSchema,
    decision: z.enum(['actioned', 'dismissed']),
    reason,
  }),
]);
export const chatCommandResultSchema = z.strictObject({
  messageId: idSchema.nullable(),
  reportId: idSchema.nullable(),
});
export const chatMessageSchema = z.strictObject({
  id: idSchema,
  sequence: z.string().regex(/^\d{1,19}$/u),
  accountId,
  displayName: z.string(),
  body: z.string(),
  createdAt: instantSchema,
  removed: z.boolean(),
});
export const chatPageSchema = z.strictObject({
  settings: chatSettingsSchema,
  groupName: z.string(),
  messages: z.array(chatMessageSchema),
  hasOlder: z.boolean(),
  muted: z.boolean(),
  blocked: z.array(z.strictObject({ accountId, displayName: z.string() })),
  timeoutUntil: instantSchema.nullable(),
  canModerate: z.boolean(),
});
export const chatCursorSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/u)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export type ChatModerationCommand = z.infer<typeof chatModerationCommandSchema>;
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export type ChatPage = z.infer<typeof chatPageSchema>;
