import { expect, test, type Page } from '@playwright/test';

async function todoCount(page: Page): Promise<number> {
  const badge = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /To do/ });
  const text = (await badge.textContent()) ?? '';
  return Number(/\d+/.exec(text)?.[0] ?? 0);
}

test('a missing price is typed straight from the menu', async ({ page }) => {
  await page.goto('/menu');
  await expect(page.getByText('Items costed')).toBeVisible(); // past the loading skeleton
  const fix = page.getByRole('link', { name: /^Fix the costing for/ }).first();
  test.skip((await fix.count()) === 0, 'Every dish on the dev menu is already priced');
  const before = await todoCount(page);
  await fix.click();
  await expect(page.getByRole('heading', { level: 1, name: /^Prices for/ })).toBeVisible();

  const row = page.locator('ol > li').first();
  await row.getByLabel('Pack size').fill('1');
  await row.getByLabel('Price for the whole pack').fill('$12.50');
  await expect(row.getByText(/^Works out to \$/)).toBeVisible();
  await row.getByLabel('Price for the whole pack').press('Enter');
  await expect(page.getByText('1 price saved')).toBeVisible();

  await page.goto('/menu');
  await expect(page.getByText('Items costed')).toBeVisible();
  expect(await todoCount(page)).toBeLessThan(before);
});

test('a recipe saves the lines that are done and asks before leaving a blank one', async ({ page }) => {
  const name = `E2E check ${Date.now()}`;
  await page.goto('/recipes');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create and open' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  await page.getByRole('button', { name: '+ Add ingredient' }).click();
  await page.getByLabel('Search ingredients').fill('a');
  await page.getByRole('region', { name: 'Ingredient pool' }).getByRole('listitem').getByRole('button').last().click();
  await page.keyboard.type('150');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '+ Add another ingredient' }).click();
  await page.getByRole('region', { name: 'Ingredient pool' }).getByRole('listitem').getByRole('button').first().click();
  await expect(page.getByText(/Saved, but line 2 needs a quantity/)).toBeVisible();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: '← Recipes' }).click();
  await expect(page).toHaveURL(/\/recipes\/.+/);

  await page.reload();
  await expect(page.getByText(/added without a quantity and not saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Moved to the trash' })).toBeVisible();
});

test('a stocktake count is saved', async ({ page }) => {
  await page.goto('/stock/count');
  const fresh = page.getByRole('button', { name: 'Start a fresh count' });
  if (await fresh.isVisible()) await fresh.click();
  const first = page.getByPlaceholder('Count').first();
  await first.fill('2');
  await page.getByRole('button', { name: 'Save 1 count' }).click();
  await expect(page.getByText(/1 item counted and saved/)).toBeVisible();
});

test('a price typed with no connection is kept, with a clear message', async ({ page }) => {
  await page.goto('/ingredients');
  await page.getByRole('link').filter({ hasText: /\$|No price/ }).first().click();
  await page.route('**/*', (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue()));
  const price = page.getByLabel('Price for the whole pack');
  await page.getByLabel('Pack size').fill('2');
  await price.fill('9.90');
  await page.getByRole('button', { name: 'Save price' }).click();
  const warning = page.getByRole('button', { name: 'Yes, save it' });
  if (await warning.isVisible().catch(() => false)) await warning.click();
  await expect(page.getByText(/No connection\. Nothing was lost/)).toBeVisible();
  await expect(price).toHaveValue('9.90');
});
