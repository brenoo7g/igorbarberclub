import { test, expect } from '@playwright/test';
async function start(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Plano Individual', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/niche');
}
async function choose(page) {
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Barbearia', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
}
test('new Gradefy onboarding selects only Mini Site, skips template choice, resumes draft and preserves Igor', async ({
  page,
}) => {
  await start(page);
  for (const name of ['Salão de beleza', 'Manicure / Nail Designer', 'Estúdio de tatuagem'])
    await expect(page.getByRole('radio', { name, exact: true })).toBeDisabled();
  await expect(page.locator('body')).not.toContainText('Barber Classic');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await choose(page);
  await expect(page.locator('.gf-business-choices')).toContainText('Gradefy Mini Site');
  await expect(page.locator('body')).not.toContainText('Barber Classic');
  await page.reload();
  await expect(page.locator('.gf-business-choices')).toContainText('Gradefy Mini Site');
  await page.goto('/app/onboarding/template');
  await expect(page).toHaveURL('/app/onboarding/setup');
  await page.getByRole('link', { name: 'Alterar segmento', exact: true }).first().click();
  await expect(page.getByRole('radio', { name: 'Barbearia', exact: true })).toBeChecked();
  await page.goto('/preview/barber-classic');
  await expect(page.getByText('[Nome da sua barbearia]', { exact: true }).first()).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
});
test('protected routes, forged old template draft and catalog failures are recoverable', async ({
  page,
}) => {
  for (const step of ['niche', 'template', 'setup']) {
    await page.goto(`/app/onboarding/${step}`);
    await expect(page).toHaveURL('/app/login');
  }
  await start(page);
  const { user } = await (await page.request.get('/api/auth/me?scope=gradefy')).json();
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        `gradefy:onboarding:v1:${id}`,
        JSON.stringify({
          version: 1,
          planCode: 'individual',
          nicheCode: 'fake',
          templateCode: 'barber-classic',
        }),
      ),
    user.id,
  );
  await page.goto('/app/onboarding/setup');
  await expect(page).toHaveURL('/app/onboarding/niche');
  await choose(page);
  await expect(page.locator('.gf-business-choices')).toContainText('Gradefy Mini Site');
  let unavailable = true;
  await page.route('**/api/onboarding/catalog', async (route) => {
    if (unavailable) await route.fulfill({ status: 503, json: { error: 'Catálogo indisponível' } });
    else await route.continue();
  });
  await page.goto('/app/onboarding/niche');
  await expect(page.getByRole('alert')).toContainText('Catálogo indisponível');
  unavailable = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('radio', { name: 'Barbearia', exact: true })).toBeVisible();
});
