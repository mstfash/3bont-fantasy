import { expect } from '@playwright/test';
/** Bound image readiness checks; Chrome's decode() promise can remain pending after navigation. */
export async function waitForVisibleImages(page) {
  await expect
    .poll(
      () =>
        page
          .locator('img:visible')
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      {
        timeout: 10_000,
        message: 'Visible images should finish loading successfully',
      },
    )
    .toBe(true);
}
