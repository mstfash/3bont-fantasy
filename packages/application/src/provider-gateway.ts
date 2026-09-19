import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerRequestSchema,
  type ProviderRequest,
} from '@fantasy/contracts';
import {
  reserveProviderAttempt,
  providerDispatchLeaseMs,
} from './provider-quota.ts';
import {
  recordProviderOutcome,
  type ProviderOutcome,
} from './provider-outcomes.ts';
import { CommandRejected } from './errors.ts';
const envelope = z.object({
  get: z.string(),
  parameters: z.union([
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]),
  errors: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  results: z.int().nonnegative(),
  paging: z.object({ current: z.int().positive(), total: z.int().positive() }),
  response: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
});
const headerInteger = (headers: Headers, name: string) => {
  const value = headers.get(name);
  if (value === null || !/^\d{1,10}$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= 1500000 ? number : null;
};
function redact(value: unknown, secret: string, depth = 0): unknown {
  if (depth > 30) return '[depth limit]';
  if (typeof value === 'string') return value.split(secret).join('[redacted]');
  if (Array.isArray(value))
    return value.map((v) => redact(v, secret, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key.split(secret).join('[redacted]'),
        /authorization|api.?key|token|password|secret/iu.test(key)
          ? '[redacted]'
          : redact(v, secret, depth + 1),
      ]),
    );
  return value;
}
/** The transport override is for controlled tests; runtime callers use native fetch and the fixed provider origin. */
export async function fetchProviderResource(
  db: ReturnType<typeof createDatabase>,
  input: {
    accountId: string;
    request: ProviderRequest;
    priority: 'ordinary' | 'correction';
    apiKey: string;
    collection?: { readonly batchId: string; readonly claimId: string };
  },
  transport: typeof fetch = fetch,
) {
  const request = providerRequestSchema.parse(input.request);
  if (input.apiKey.trim().length < 10)
    throw new CommandRejected('provider-key-unavailable');
  const began = performance.now(),
    attemptId = randomUUID();
  await reserveProviderAttempt(db, {
    accountId: input.accountId,
    attemptId,
    request,
    priority: input.priority,
    ...(input.collection
      ? {
          collection: {
            ...input.collection,
            allowSynthetic: transport !== fetch,
          },
        }
      : {}),
  });
  const blank = {
    status: null,
    checksum: null,
    dailyRemaining: null,
    dailyLimit: null,
    minuteRemaining: null,
    minuteLimit: null,
    retryAfterSeconds: null,
  };
  if (performance.now() - began >= providerDispatchLeaseMs) {
    await recordProviderOutcome(db, attemptId, {
      ...blank,
      outcome: 'dispatch-expired',
    });
    throw new CommandRejected('provider-dispatch-expired');
  }
  const url = new URL(`https://v3.football.api-sports.io/${request.resource}`);
  for (const [key, value] of Object.entries(request))
    if (key !== 'resource') url.searchParams.set(key, String(value));
  let outcome: ProviderOutcome;
  let observed: Omit<ProviderOutcome, 'outcome' | 'checksum' | 'payload'> =
    blank;
  try {
    const response = await transport(url, {
      method: 'GET',
      headers: { 'x-apisports-key': input.apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    observed = {
      status: response.status,
      dailyRemaining: headerInteger(
        response.headers,
        'x-ratelimit-requests-remaining',
      ),
      dailyLimit: headerInteger(response.headers, 'x-ratelimit-requests-limit'),
      minuteRemaining: headerInteger(response.headers, 'x-ratelimit-remaining'),
      minuteLimit: headerInteger(response.headers, 'x-ratelimit-limit'),
      retryAfterSeconds: headerInteger(response.headers, 'retry-after'),
    };
    const reader = response.body?.getReader(),
      parts: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 2_000_000) {
          await reader.cancel();
          throw new CommandRejected('provider-response-too-large');
        }
        parts.push(part.value);
      }
    const bytes = Buffer.concat(parts),
      checksum = createHash('sha256').update(bytes).digest('hex');
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      parsed = { unparsedBody: bytes.toString('utf8') };
    }
    const validated = envelope.safeParse(parsed);
    const rejected =
      response.status === 429
        ? 'rate-limited'
        : !response.ok
          ? 'provider-error'
          : !validated.success
            ? 'schema-invalid'
            : Object.keys(validated.data.errors).length
              ? 'provider-error'
              : 'success';
    outcome = {
      ...observed,
      checksum,
      outcome: rejected,
      payload: redact(
        validated.success ? parsed : { invalidResponse: parsed },
        input.apiKey,
      ),
    };
  } catch (error) {
    outcome = {
      ...observed,
      checksum: null,
      outcome:
        error instanceof CommandRejected ? 'schema-invalid' : 'unconfirmed',
    };
  }
  const result = await recordProviderOutcome(db, attemptId, outcome);
  return { attemptId, ...result, outcome: outcome.outcome };
}
