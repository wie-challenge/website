import { z } from 'zod';

export const assistantPersonaSchema = z.enum([
  'PLATFORM_ADMIN',
  'NASJ_OPERATOR',
  'NASJ_COORDINATOR',
  'NASJ_FINANCE',
  'BUYER_REPRESENTATIVE',
  'ASSOCIATION_COORDINATOR',
]);
export const assistantMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  })
  .strict();
export const assistantChatSchema = z
  .object({
    language: z.enum(['en', 'fr', 'ar']),
    messages: z.array(assistantMessageSchema).min(1).max(10),
  })
  .strict()
  .refine((v) => v.messages.at(-1)?.role === 'user', 'End with a user message.')
  .refine(
    (v) => v.messages.reduce((n, m) => n + m.content.length, 0) <= 16000,
    'History too large.',
  );
export const assistantRequestSchema = z
  .object({
    version: z.literal(1),
    requestId: z.uuid(),
    deadline: z.number().int().positive(),
    personas: z.array(assistantPersonaSchema).max(6),
    chat: assistantChatSchema,
  })
  .strict();
const base = { version: z.literal(1), requestId: z.uuid(), seq: z.number().int().min(0).max(4096) };
export const assistantEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('delta'), text: z.string().min(1).max(4096) }).strict(),
  z.object({ ...base, type: z.literal('done'), provider: z.enum(['fake', 'ollama']) }).strict(),
  z
    .object({
      ...base,
      type: z.literal('error'),
      code: z.enum(['ASSISTANT_UNAVAILABLE', 'ASSISTANT_TIMEOUT']),
    })
    .strict(),
]);
export type AssistantChat = z.infer<typeof assistantChatSchema>;
export type AssistantEvent = z.infer<typeof assistantEventSchema>;
