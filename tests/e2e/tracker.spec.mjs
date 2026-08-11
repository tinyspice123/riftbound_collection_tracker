import { test, expect } from '@playwright/test';

test('home lists all four released sets', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('.setcard')).toHaveCount(4);
  await expect(page.getByText('Origins',{exact:true})).toBeVisible();
  await expect(page.getByText('Vendetta',{exact:true})).toBeVisible();
});

test('Origins tracker loads the deployed fallback and local image', async ({page}) => {
  await page.route('https://docs.google.com/**', route => route.abort());
  await page.goto('/tracker.html?set=origins');
  await expect(page.locator('#fallbackName')).toHaveText('Origins');
  await expect(page.locator('.card,.row').first()).toBeVisible({timeout:15000});
  await expect(page.locator('img[src^="img/origins/"]').first()).toBeAttached();
});
