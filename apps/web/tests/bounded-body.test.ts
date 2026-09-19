import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readBoundedBody,
  RequestTooLarge,
} from '../src/server/bounded-body.ts';
void test('body limits count bytes, accept exact boundaries and cancel a streaming overflow without trusting Content-Length', async () => {
  const bytes = new TextEncoder().encode('أهلاً');
  const exact = new Request('http://localhost', {
    method: 'POST',
    body: bytes,
  });
  assert.deepEqual(await readBoundedBody(exact, bytes.length), bytes);
  await assert.rejects(
    readBoundedBody(
      new Request('http://localhost', { method: 'POST', body: bytes }),
      bytes.length - 1,
    ),
    RequestTooLarge,
  );
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Length': '1' },
    body: stream,
    duplex: 'half',
  };
  const request = new Request('http://localhost', init);
  await assert.rejects(readBoundedBody(request, 7), RequestTooLarge);
  assert.equal(cancelled, true);
  assert.equal(
    (await readBoundedBody(new Request('http://localhost'), 0)).length,
    0,
  );
});
