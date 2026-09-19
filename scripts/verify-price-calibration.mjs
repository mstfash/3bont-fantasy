import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { priceCalibrationReportSchema } from '../packages/contracts/dist/index.js';
import { calibratePrices } from '../packages/domain/dist/index.js';
const source =
  process.argv[2] ??
  new URL(
    '../artifacts/verification/price-calibration-synthetic.json',
    import.meta.url,
  );
if ((await stat(source)).size > 12 * 1024 * 1024)
  throw new Error('Report exceeds the calibration evidence limit');
const report = priceCalibrationReportSchema.parse(
  JSON.parse(await readFile(source, 'utf8')),
);
assert.equal(
  report.basisFingerprint,
  createHash('sha256').update(JSON.stringify(report.basis)).digest('hex'),
);
assert.deepEqual(
  report.output,
  calibratePrices(
    report.basis.players,
    report.basis.rounds,
    report.basis.squad,
    report.candidates,
    report.basis.cutoff,
  ),
);
console.log(
  'Evidence fingerprint and every simulated policy result verified. This does not certify source accuracy or approve automatic pricing.',
);
