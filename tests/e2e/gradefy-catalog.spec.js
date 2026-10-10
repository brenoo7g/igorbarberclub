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
async function chooseNiche(page) {
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Barbearia', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/template');
}
test('real niche/template flow, readonly preview, reload and back navigation, responsive and Igor preserved', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await expect(page.getByRole('heading', { name: 'Qual é o seu negócio?' })).toBeVisible();
  for (const name of ['Salão de beleza', 'Manicure / Nail Designer', 'Estúdio de tatuagem'])
    await expect(page.getByRole('radio', { name, exact: true })).toBeDisabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await chooseNiche(page);
  await expect(page.getByRole('heading', { name: 'Barber Classic' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Prévia do site Barber Classic' })).toBeVisible();
  expect(
    await page
      .getByRole('img', { name: 'Prévia do site Barber Classic' })
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: /Visualizar Barber Classic/ }).click();
  const preview = await popupPromise;
  await expect(preview).toHaveURL('/preview/barber-classic');
  await expect(preview.getByText('[Nome da sua barbearia]', { exact: true }).first()).toBeVisible();
  await preview.getByRole('link', { name: 'Agendar horário', exact: true }).first().click();
  await expect(preview.getByText('Preview', { exact: true })).toBeVisible();
  await preview.close();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({ path: `test-results/gradefy-template-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Escolher este template' }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
  await expect(
    page.getByRole('heading', { name: 'Agora vamos configurar seu negócio.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.gf-business-choices')).toContainText('Barber Classic');
  await page.getByRole('link', { name: 'Alterar template' }).click();
  await expect(page.getByText('Selecionado', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Alterar segmento' }).click();
  await expect(page.getByRole('radio', { name: 'Barbearia', exact: true })).toBeChecked();
  await page.getByRole('link', { name: 'Alterar plano' }).click();
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeChecked();
  await page.goto('/app/onboarding/next');
  await expect(page).toHaveURL('/app/onboarding/niche');
  expect(await (await page.request.get('/api/companies')).json()).toEqual([]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await expect(page.locator('.gf-app')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tampered drafts cannot bypass catalog; steps are protected and failures can be retried', async ({
  page,
}) => {
  for (const step of ['niche', 'template', 'setup']) {
    await page.goto(`/app/onboarding/${step}`);
    await expect(page).toHaveURL('/app/login');
  }
  await start(page);
  const { user } = await (await page.request.get('/api/auth/me?scope=gradefy')).json();
  const key = `gradefy:onboarding:v1:${user.id}`;
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          planCode: 'individual',
          nicheCode: 'fake',
          templateCode: 'barber-classic',
        }),
      ),
    key,
  );
  await page.goto('/app/onboarding/setup');
  await expect(page).toHaveURL('/app/onboarding/niche');
  await chooseNiche(page);
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          planCode: 'individual',
          nicheCode: 'barbershop',
          templateCode: 'fake',
        }),
      ),
    key,
  );
  await page.goto('/app/onboarding/setup');
  await expect(page).toHaveURL('/app/onboarding/template');
  let rejected = true;
  await page.route('**/api/onboarding/template-selection', (route) =>
    rejected
      ? route.fulfill({ status: 409, json: { error: 'Template indisponível.' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Escolher este template' }).click();
  await expect(page.getByRole('alert')).toContainText('Template indisponível.');
  await expect(page).toHaveURL('/app/onboarding/template');
  rejected = false;
  await page.getByRole('button', { name: 'Escolher este template' }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
  let unavailable = true;
  await page.route('**/api/onboarding/catalog', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: 'Catálogo indisponível.' } })
      : route.continue(),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Catálogo indisponível.');
  unavailable = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(
    page.getByRole('heading', { name: 'Agora vamos configurar seu negócio.' }),
  ).toBeVisible();
  const created = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Outra pessoa',
      email: `catalog-${Date.now()}@example.com`,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(created.status()).toBe(201);
  await page.goto('/app/onboarding/setup');
  await expect(page).toHaveURL('/app/onboarding/plan');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key)).toEqual({
    version: 1,
    planCode: 'individual',
    nicheCode: 'barbershop',
    templateCode: 'barber-classic',
  });
});
