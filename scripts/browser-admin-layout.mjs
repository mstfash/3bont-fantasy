import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function exerciseAdminLayout(page, base) {
  const original = page.url();
  const viewport = page.viewportSize();
  try {
    await page.setViewportSize({ width: 1280, height: 500 });
    for (const locale of ['en', 'ar']) {
      await page.goto(`${base}/${locale}/admin`);
      const sidebar = page.locator('.admin-sidebar');
      const workspace = page.locator('.admin-workspace');
      await expect(sidebar).toBeVisible();
      const before = await sidebar.boundingBox();
      const content = await workspace.boundingBox();
      assert.ok(before && content);
      assert.ok(
        locale === 'ar' ? before.x > content.x : before.x < content.x,
        'Sidebar mirrors with reading direction',
      );
      assert.ok(
        await workspace.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
        'Real content must overflow for the scroll test',
      );
      await workspace.hover();
      await page.mouse.wheel(0, 600);
      await expect
        .poll(() => workspace.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      assert.deepEqual(
        await sidebar.boundingBox(),
        before,
        'Workspace scrolling must not move the sidebar',
      );
      const contentScroll = await workspace.evaluate(
        (element) => element.scrollTop,
      );
      await sidebar.hover();
      await page.mouse.wheel(0, 600);
      await expect
        .poll(() => sidebar.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      assert.equal(
        await workspace.evaluate((element) => element.scrollTop),
        contentScroll,
        'Sidebar scrolling must not move the workspace',
      );
      assert.equal(
        await page.evaluate(() => window.scrollY),
        0,
        'The document must not become a second vertical scroll container',
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    console.log(
      'Fixed sidebar, independent workspace/side navigation scrolling and mirrored RTL passed.',
    );
  } finally {
    await page.setViewportSize(viewport);
    await page.goto(original);
  }
}
