import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('home lists all four released sets', async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('.setcard')).toHaveCount(4);
  await expect(page.getByRole('img',{name:'Origins',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Vendetta',exact:true})).toBeVisible();
});

test('Origins tracker loads the deployed fallback and local image', async ({page}) => {
  await page.route('https://docs.google.com/**', route => route.abort());
  await page.route('**/backups/origins.csv', route => route.fulfill({
    status: 200,
    contentType: 'text/csv',
    body: fs.readFileSync('backups/origins.csv', 'utf8'),
  }));
  await page.goto('/tracker.html?set=origins');
  await expect(page.locator('#fallbackName')).toHaveText('Origins');
  await expect(page.locator('.item').first()).toBeVisible({timeout:15000});
  const localImage=page.locator(
    'img[data-src*="img/origins/"], img[src*="/img/origins/"]'
  ).first();
  await expect(localImage).toBeAttached();
});
