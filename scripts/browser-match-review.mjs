import assert from 'node:assert/strict';
export async function reviewedMatchPost(page, base, command) {
  const preview = await page.request.post(`${base}/api/v1/admin/matches`, {
    headers: { Origin: base },
    data: { kind: 'preview', command },
  });
  assert.equal(
    preview.status(),
    200,
    'Match review must succeed before applying',
  );
  const result = await preview.json();
  assert.equal(result.kind, 'preview');
  return page.request.post(`${base}/api/v1/admin/matches`, {
    headers: { Origin: base },
    data: {
      kind: 'apply',
      command,
      expectedFingerprint: result.preview.fingerprint,
    },
  });
}
