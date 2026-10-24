import { test, expect } from '@playwright/test';

async function login(page, email = 'cliente@example.com', password = 'ClienteDemo2026!') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
const card = (page, name) =>
  page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: `Plano ${name}`, exact: true }) });
test('catalog prices/limits, selection change, reload, provisional next step and responsive layouts', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page).toHaveURL('/app/onboarding/plan');
  await expect(page.getByRole('heading', { name: 'Escolha seu plano' })).toBeVisible();
  await expect(page.locator('.gf-plan-option')).toHaveCount(2);
  const catalog = await (await page.request.get('/api/plans')).json();
  expect(catalog.map((plan) => plan.priceCents)).toEqual([2299, 3299]);
  await expect(card(page, 'Individual')).toContainText('22,99');
  await expect(card(page, 'Individual')).toContainText('1 profissional ativo');
  await expect(card(page, 'Equipe')).toContainText('32,99');
  await expect(card(page, 'Equipe')).toContainText('Profissionais ativos ilimitados');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  await card(page, 'Individual').click();
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeChecked();
  await card(page, 'Equipe').click();
  await expect(page.getByRole('radio', { name: 'Plano Equipe', exact: true })).toBeChecked();
  await expect(
    page.getByRole('radio', { name: 'Plano Individual', exact: true }),
  ).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Plano Equipe', exact: true })).toBeChecked();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({ path: `test-results/gradefy-plans-${width}.png`, fullPage: true });
  }
  const submitted = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/onboarding/plan-selection') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  expect((await submitted).postDataJSON()).toEqual({ planCode: 'team' });
  await expect(page).toHaveURL('/app/onboarding/niche');
  await expect(page.getByRole('status')).toContainText('Plano Equipe selecionado.');
  await expect(page.getByText(/Seu teste grátis ainda não começou/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Plano Equipe selecionado.');
  await page.getByRole('link', { name: 'Alterar plano' }).click();
  await card(page, 'Individual').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plano Individual selecionado.');
  expect(errors).toEqual([]);
});
test('onboarding is protected and existing Igor owner stays in the existing access flow', async ({
  page,
}) => {
  await page.goto('/app/onboarding/plan');
  await expect(page).toHaveURL('/app/login');
  await login(page, 'admin@igorbarberclub.com.br', 'IgorDemo2026!');
  await expect(page).toHaveURL('/app/dashboard');
  await expect(page.locator('.gf-desktop-company')).toContainText('Igor Barber Club');
  await page.goto('/app/onboarding/next');
  await expect(page).toHaveURL('/app/dashboard');
  expect(
    (
      await page.request.post('/api/onboarding/plan-selection', { data: { planCode: 'team' } })
    ).status(),
  ).toBe(409);
  await page.goto('/admin');
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await expect(page.locator('.gf-app')).toHaveCount(0);
});
test('corrupt/manipulated preferences never alter prices or share choices between signed in users', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeVisible();
  const { user } = await (await page.request.get('/api/auth/me?scope=gradefy')).json();
  const storageKey = `gradefy:onboarding:v1:${user.id}`;
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ version: 1, planCode: 'invalid' })),
    storageKey,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, planCode: 'team', priceCents: 1, trialStartedAt: '2026' }),
      ),
    storageKey,
  );
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Plano Equipe', exact: true })).toBeChecked();
  await expect(card(page, 'Equipe')).toContainText('32,99');
  const manipulated = await page.request.post('/api/onboarding/plan-selection', {
    data: { planCode: 'team', priceCents: 1 },
  });
  expect(manipulated.status()).toBe(400);
  await card(page, 'Individual').click();
  const created = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Outra',
      email: `other-plan-${Date.now()}@example.com`,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(created.status()).toBe(201);
  await page.goto('/app/onboarding/plan');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey)).toEqual({
    version: 1,
    planCode: 'individual',
  });
});
test('catalog and validation failures recover without losing selection or entering the next step', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/api/plans', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: 'Catálogo temporariamente indisponível.' } })
      : route.continue(),
  );
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Catálogo temporariamente indisponível.');
  unavailable = false;
  await page.getByRole('button', { name: 'Carregar planos novamente' }).click();
  await card(page, 'Individual').click();
  let reject = true;
  await page.route('**/api/onboarding/plan-selection', (route) =>
    reject
      ? route.fulfill({ status: 409, json: { error: 'Plano indisponível.' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Plano indisponível.');
  await expect(page).toHaveURL('/app/onboarding/plan');
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeChecked();
  reject = false;
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/niche');
});
