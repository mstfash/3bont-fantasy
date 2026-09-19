import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IdentityMail } from './identity.ts';

export function localMailTransport(
  directory: string,
): (message: IdentityMail) => Promise<void> {
  return async (message) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, `${randomUUID()}.json`),
      JSON.stringify(
        { ...message, createdAt: new Date().toISOString() },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
  };
}

export function resendMailTransport(
  apiKey: string,
  from: string,
): (message: IdentityMail) => Promise<void> {
  return async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(
        `Email provider rejected request (${String(response.status)})`,
      );
  };
}
