import { z } from 'zod';

const environmentSchema = z
  .object({
    APP_ENV: z.enum(['local', 'production']),
    APP_BASE_URL: z.url(),
    DATABASE_URL: z
      .url()
      .refine((value) =>
        ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      ),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32)
      .refine(
        (value) => !value.startsWith('REPLACE_'),
        'Replace the example secret',
      ),
    MAIL_MODE: z.enum(['local', 'resend']),
    MAIL_OUTBOX_DIR: z.string().min(1).default('.local/mail'),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z
      .string()
      .min(3)
      .regex(/^[^\r\n]+$/u)
      .default('3BONT FANTASY <noreply@example.invalid>'),
  })
  .superRefine((value, context) => {
    const url = new URL(value.APP_BASE_URL);
    if (value.APP_ENV === 'production') {
      if (url.protocol !== 'https:')
        context.addIssue({
          code: 'custom',
          path: ['APP_BASE_URL'],
          message: 'Production requires HTTPS',
        });
      if (value.MAIL_MODE !== 'resend')
        context.addIssue({
          code: 'custom',
          path: ['MAIL_MODE'],
          message: 'Production requires a delivery transport',
        });
      if (value.MAIL_FROM.includes('example.invalid'))
        context.addIssue({
          code: 'custom',
          path: ['MAIL_FROM'],
          message: 'Configure a verified sender',
        });
    } else if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      context.addIssue({
        code: 'custom',
        path: ['APP_BASE_URL'],
        message: 'Local mode is restricted to loopback origins',
      });
    if (value.MAIL_MODE === 'resend' && !value.RESEND_API_KEY)
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Resend credentials required',
      });
  });
export type ApplicationConfiguration = z.infer<typeof environmentSchema>;
export function parseApplicationConfiguration(
  environment: NodeJS.ProcessEnv,
): ApplicationConfiguration {
  return environmentSchema.parse(environment);
}
