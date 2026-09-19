import { exerciseProviderSchedules } from './browser-provider-schedules.mjs';
import { exerciseProviderAcceptance } from './browser-provider-acceptance.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { normalizationFixture } from '../packages/application/tests/provider-normalization-fixture.ts';

export async function exerciseProviderNormalization(page, pool, base) {
  const f = normalizationFixture(),
    sourceIds = [],
    attemptIds = [];
  const existingAccount = (
    await pool.query('SELECT id FROM fantasy.provider_accounts LIMIT 1')
  ).rows[0];
  const accountId = existingAccount?.id ?? randomUUID();
  const windowStart = new Date(),
    windowEnd = new Date(windowStart.getTime() + 86400000);
  try {
    if (!existingAccount)
      await pool.query(
        'INSERT INTO fantasy.provider_accounts(id,provider,revision,data) VALUES($1,$2,1,$3)',
        [
          accountId,
          'api-football-direct',
          {
            id: accountId,
            provider: 'api-football-direct',
            revision: 1,
            state: 'paused',
            dailyLimit: null,
            minuteLimit: null,
            resetAnchor: null,
            evidenceReference: null,
            dedicatedKeyConfirmed: false,
            reconciledAt: null,
          },
        ],
      );
    await pool.query('INSERT INTO fantasy.seasons(id,data) VALUES($1,$2)', [
      f.fixture.seasonId,
      {
        id: f.fixture.seasonId,
        name: { ar: 'اختبار مصادر المباراة', en: 'QA normalization season' },
        startsAt: '2026-01-01T00:00:00Z',
        endsAt: '2027-01-01T00:00:00Z',
        synthetic: true,
      },
    ]);
    for (const [i, id] of [
      f.fixture.homeClubId,
      f.fixture.awayClubId,
    ].entries())
      await pool.query(
        'INSERT INTO fantasy.clubs(id,season_id,data) VALUES($1,$2,$3)',
        [
          id,
          f.fixture.seasonId,
          {
            id,
            seasonId: f.fixture.seasonId,
            name: {
              en: `Normalization Club ${i + 1}`,
              ar: `نادي اختبار ${i + 1}`,
            },
            shortName: `N${i}`,
            color: '#123456',
          },
        ],
      );
    for (const [i, id] of f.players.entries()) {
      const clubId = i < 2 ? f.fixture.homeClubId : f.fixture.awayClubId;
      await pool.query(
        'INSERT INTO fantasy.footballers(id,season_id,club_id,data) VALUES($1,$2,$3,$4)',
        [
          id,
          f.fixture.seasonId,
          clubId,
          {
            id,
            seasonId: f.fixture.seasonId,
            clubId,
            name: {
              en: `Normalization Player ${i + 1}`,
              ar: `لاعب اختبار ${i + 1}`,
            },
            defaultPosition: 'MID',
            status: 'available',
            valuation: null,
            synthetic: true,
          },
        ],
      );
    }
    await pool.query(
      'INSERT INTO fantasy.fixtures(id,season_id,kickoff,data) VALUES($1,$2,$3,$4)',
      [f.fixture.id, f.fixture.seasonId, f.fixture.kickoff, f.fixture],
    );
    await pool.query(
      'INSERT INTO fantasy.provider_quota_windows(account_id,starts_at,ends_at,ceiling,ordinary_ceiling,used,ordinary_used) VALUES($1,$2,$3,100,90,4,4)',
      [accountId, windowStart, windowEnd],
    );
    for (const [i, source] of Object.values(f.sources).entries()) {
      const evidenceId = i === 0 ? f.binding.evidenceId : randomUUID(),
        attemptId = randomUUID();
      const checksum = createHash('sha256')
        .update(JSON.stringify(source.payload))
        .digest('hex');
      sourceIds.push(evidenceId);
      attemptIds.push(attemptId);
      await pool.query(
        'INSERT INTO fantasy.provider_evidence(id,provider,resource,checksum,payload) VALUES($1,$2,$3,$4,$5)',
        [
          evidenceId,
          'api-football-direct',
          source.request.resource,
          checksum,
          source.payload,
        ],
      );
      await pool.query(
        "INSERT INTO fantasy.provider_attempts(id,account_id,window_start,request,request_fingerprint,priority,reserved_at,dispatch_expires_at,finished_at,outcome,http_status,response_checksum,evidence_id) VALUES($1,$2,$3,$4,$5,'ordinary',$3,$6,$3,'success',200,$5,$7)",
        [
          attemptId,
          accountId,
          windowStart,
          source.request,
          checksum,
          new Date(windowStart.getTime() + 5000),
          evidenceId,
        ],
      );
    }
    await pool.query(
      'INSERT INTO fantasy.provider_season_bindings(id,provider,season_id,league_id,season_year,evidence_id,data) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        f.binding.id,
        f.binding.provider,
        f.binding.seasonId,
        f.binding.leagueId,
        f.binding.seasonYear,
        f.binding.evidenceId,
        f.binding,
      ],
    );
    for (const m of f.mappings) {
      await pool.query(
        'INSERT INTO fantasy.provider_identities(id,binding_id,kind,external_id,entity_id,revision,data) VALUES($1,$2,$3,$4,$5,1,$6)',
        [m.id, m.bindingId, m.kind, m.externalId, m.entityId, m],
      );
      await pool.query(
        'INSERT INTO fantasy.provider_identity_history(mapping_id,revision,evidence_id,data) VALUES($1,1,$2,$3)',
        [m.id, m.evidenceId, m],
      );
    }
    const choose = async () => {
      for (const [i, name] of [
        'fixtureAttemptId',
        'playersAttemptId',
        'lineupsAttemptId',
        'eventsAttemptId',
      ].entries())
        await page.locator(`[name="${name}"]`).selectOption(attemptIds[i]);
    };
    await page.goto(`${base}/en/admin/matches/${f.fixture.id}`);
    await choose();
    await page
      .getByRole('button', { name: 'PREVIEW PROVIDER DATA', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Review required', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('row', {
        name: 'Normalization Player 2 — — —',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: 'Review required', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'artifacts/web/provider-normalization-en.png',
    });
    const anonymous = await fetch(`${base}/api/v1/admin/providers/normalize`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixtureId: f.fixture.id,
        fixtureAttemptId: attemptIds[0],
        playersAttemptId: attemptIds[1],
        lineupsAttemptId: attemptIds[2],
        eventsAttemptId: attemptIds[3],
      }),
    });
    assert.equal(anonymous.status, 401);
    await page
      .getByRole('button', { name: 'STAGE IN MATCH REPORT', exact: true })
      .click();
    await page
      .getByLabel('Edit footballer performance', { exact: true })
      .selectOption(f.players[0]);
    await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('60');
    await expect(
      page.getByLabel('Conceded on pitch', { exact: true }),
    ).toHaveValue('');
    await expect(
      page.locator('[name="eligibilityComplete"]'),
    ).not.toBeChecked();
    await expect(page.locator('[name="factsComplete"]')).not.toBeChecked();
    await page
      .getByLabel('Eligibility evidence and manual changes', { exact: true })
      .fill(
        'Synthetic response review: eligibility is incomplete; missing values intentionally retained',
      );
    await page
      .getByLabel('Reason and evidence source', { exact: true })
      .fill(
        'Browser proof of reviewed provider evidence and unknown statistics',
      );
    await page
      .getByRole('button', { name: 'REVIEW REPORT', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'CONFIRM & SAVE', exact: true })
      .click();
    await expect(
      page.getByLabel('Eligibility evidence and manual changes', {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Saved report sources', exact: true })
        .getByRole('link'),
    ).toHaveCount(4);
    const observations = (
      await pool.query(
        'SELECT payload,evidence_id FROM fantasy.fixture_observations WHERE fixture_id=$1',
        [f.fixture.id],
      )
    ).rows;
    assert.equal(observations.length, 1);
    assert.equal(
      observations[0].payload.performances.find(
        (p) => p.footballerId === f.players[1],
      ).statistics.minutes,
      null,
    );
    const retained = (
      await pool.query(
        'SELECT count(*)::integer AS count FROM fantasy.provider_normalization_sources WHERE report_evidence_id=$1',
        [observations[0].evidence_id],
      )
    ).rows[0].count;
    assert.equal(retained, 4);
    await page.goto(`${base}/ar/admin/matches/${f.fixture.id}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await choose();
    await page
      .getByRole('button', { name: 'معاينة بيانات المزود', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'يلزم استكمال المراجعة', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: 'يلزم استكمال المراجعة', exact: true })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/provider-normalization-ar-mobile.png',
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await exerciseProviderSchedules(page, pool, base, f.binding.id);
    await exerciseProviderAcceptance(page, pool, base, f.binding.id);
    await page.goto(`${base}/en/admin`);
    console.log(
      'Provider normalization: reviewed sources, unknown bench minutes, retained evidence, anonymous denial and Arabic mobile passed.',
    );
  } finally {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM fantasy.fact_revisions WHERE fixture_id=$1',
        [f.fixture.id],
      );
      await client.query(
        'DELETE FROM fantasy.fixture_observations WHERE fixture_id=$1',
        [f.fixture.id],
      );
      await client.query(
        'DELETE FROM fantasy.provider_evidence WHERE resource=$1',
        [`fixture:${f.fixture.id}`],
      );
      await client.query('DELETE FROM fantasy.audit_events WHERE scope_id=$1', [
        f.fixture.id,
      ]);
      await client.query(
        "DELETE FROM fantasy.commands WHERE result->>'id'=$1",
        [f.fixture.id],
      );
      await client.query(
        'DELETE FROM fantasy.audit_events WHERE scope_id IN (SELECT id::text FROM fantasy.provider_schedules WHERE binding_id=$1)',
        [f.binding.id],
      );
      await client.query(
        "DELETE FROM fantasy.commands WHERE result->>'bindingId'=$1",
        [f.binding.id],
      );
      await client.query(
        'DELETE FROM fantasy.provider_acceptance_policies WHERE binding_id=$1',
        [f.binding.id],
      );
      await client.query('DELETE FROM fantasy.audit_events WHERE scope_id=$1', [
        f.binding.id,
      ]);
      await client.query(
        'DELETE FROM fantasy.provider_schedules WHERE binding_id=$1',
        [f.binding.id],
      );
      await client.query(
        'DELETE FROM fantasy.provider_identity_history WHERE mapping_id=ANY($1::uuid[])',
        [f.mappings.map((m) => m.id)],
      );
      await client.query(
        'DELETE FROM fantasy.provider_identities WHERE binding_id=$1',
        [f.binding.id],
      );
      await client.query(
        'DELETE FROM fantasy.provider_season_bindings WHERE id=$1',
        [f.binding.id],
      );
      await client.query(
        'DELETE FROM fantasy.provider_attempts WHERE id=ANY($1::uuid[])',
        [attemptIds],
      );
      await client.query(
        'DELETE FROM fantasy.provider_evidence WHERE id=ANY($1::uuid[])',
        [sourceIds],
      );
      await client.query(
        'DELETE FROM fantasy.provider_quota_windows WHERE account_id=$1 AND starts_at=$2',
        [accountId, windowStart],
      );
      await client.query('DELETE FROM fantasy.fixtures WHERE id=$1', [
        f.fixture.id,
      ]);
      await client.query('DELETE FROM fantasy.footballers WHERE season_id=$1', [
        f.fixture.seasonId,
      ]);
      await client.query('DELETE FROM fantasy.clubs WHERE season_id=$1', [
        f.fixture.seasonId,
      ]);
      await client.query('DELETE FROM fantasy.seasons WHERE id=$1', [
        f.fixture.seasonId,
      ]);
      if (!existingAccount)
        await client.query(
          'DELETE FROM fantasy.provider_accounts WHERE id=$1',
          [accountId],
        );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
