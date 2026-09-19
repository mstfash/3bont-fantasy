import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { monitorPageHealth } from './browser-health.mjs';

// Read-only checks against the local preview; no credentials or fixture mutation.
const base = 'http://127.0.0.1:3100';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const cases = [];
let passed = false;
try {
  for (const locale of ['en', 'ar']) {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext();
      try {
        await context.addCookies([
          { name: 'fantasy-theme', value: theme, url: base },
        ]);
        const page = await context.newPage();
        const assertHealthy = monitorPageHealth(page, base);
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          for (const route of [
            '',
            '/login',
            '/register',
            '/how-to-play',
            '/playbook',
            '/competitions/cairo-demo',
            '/competitions/cairo-demo/rules',
          ]) {
            const path = `/${locale}${route}`;
            const response = await page.goto(`${base}${path}`);
            assert.equal(response.status(), 200, path);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute(
              'dir',
              locale === 'ar' ? 'rtl' : 'ltr',
            );
            await expect(page.locator('html')).toHaveAttribute(
              'data-theme',
              theme,
            );
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
              `Overflow at ${path}`,
            );
            const logos = page.locator('.brand-logo:visible');
            assert.ok(await logos.count(), `Visible logo at ${path}`);
            await logos.evaluateAll((images) =>
              Promise.all(images.map((image) => image.decode())),
            );
            assertHealthy();
            cases.push({
              path,
              locale,
              theme,
              width: viewport.width,
              status: 'passed',
            });
          }
        }
        for (const route of ['/dashboard', '/profile', '/security', '/admin']) {
          await page.goto(`${base}/${locale}${route}`);
          await expect(page).toHaveURL(
            new RegExp(`/${locale}/login(?:\\?|$)`, 'u'),
          );
        }
        const absent = await page.goto(
          `${base}/${locale}/competitions/nonexistent-smoke-competition`,
        );
        assert.equal(absent.status(), 404);
        const health = await page.request.get(`${base}/api/health`);
        assert.equal(health.status(), 200);
        assert.deepEqual(await health.json(), { status: 'ready' });
        assert.equal(health.headers()['cache-control'], 'no-store');
        assertHealthy();
        console.log(
          `Public smoke: ${locale}/${theme}, desktop/mobile, authentication boundaries and readiness passed.`,
        );
      } finally {
        await context.close();
      }
    }
  }
  passed = true;
} finally {
  await browser.close();
  await mkdir('artifacts/verification', { recursive: true });
  await writeFile(
    'artifacts/verification/public-smoke.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        base,
        status: passed ? 'passed' : 'failed',
        cases,
        additionalChecks: [
          'anonymous protected-page redirects',
          'missing competition 404',
          'readiness contract',
          'visible brand assets',
          'no browser crashes or HTTP 5xx',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}
