import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test as setup } from '@playwright/test';

const email = process.env.E2E_EMAIL;

/** Reads the code the dev server "emailed", the way a person reads their inbox. */
async function codeSentAfter(since: number): Promise<string> {
  const file = join(process.cwd(), '.next', 'dev-mail', `${email!.toLowerCase().replace(/[^a-z0-9@.+-]/g, '_')}.json`);
  for (let i = 0; i < 40; i++) {
    try {
      const mail = JSON.parse(await readFile(file, 'utf8')) as { subject: string; at: number };
      if (mail.at >= since) return /^(\d{6})/.exec(mail.subject)![1];
    } catch {
      /* not written yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('No sign-in code arrived. Is the dev server running locally (not on Vercel)?');
}

const STATE = 'e2e/.auth/state.json';

setup('sign in with an emailed code', async ({ browser, page }) => {
  if (!email) throw new Error('Set E2E_EMAIL to an address on the dev team list');
  if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run browser tests against production');

  // Still signed in from the last run? Codes are limited to 5 an hour, so do not ask for one each time.
  if (await access(STATE).then(() => true, () => false)) {
    const saved = await browser.newContext({ storageState: STATE });
    const check = await saved.newPage();
    await check.goto('/menu');
    const signedIn = !check.url().includes('/sign-in');
    await saved.close();
    if (signedIn) return;
  }

  await page.goto('/sign-in');
  await page.getByLabel('Your email').fill(email);
  const since = Date.now();
  await page.getByRole('button', { name: /email me a code/i }).click();
  await page.getByLabel('Code').fill(await codeSentAfter(since));
  await page.getByLabel('Code').press('Enter');
  await expect(page).not.toHaveURL(/sign-in/);
  await page.context().storageState({ path: STATE });
});
