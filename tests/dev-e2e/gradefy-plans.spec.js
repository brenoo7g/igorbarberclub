import { test, expect } from '@playwright/test';

test('real dev:test-access backend and Vite proxy load plans, continue, persist and preserve Igor', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const config = await (await page.request.get('/api/config')).json();
  expect(config.demo).toBe(true);
  expect(config.testGuestAccess).toBe(true);
  expect(config.notifications).toEqual({ email: false, whatsapp: false });
  expect((await page.request.get('/api/plans')).status()).toBe(401);
  await page.goto('/app/onboarding/plan');
  await expect(page).toHaveURL('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/plan');
  const response = await page.request.get('/api/plans');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([
    {
      code: 'individual',
      name: 'Individual',
      priceCents: 2299,
      currency: 'BRL',
      billingInterval: 'month',
      trialDays: 7,
      maxProfessionals: 1,
    },
    {
      code: 'team',
      name: 'Equipe',
      priceCents: 3299,
      currency: 'BRL',
      billingInterval: 'month',
      trialDays: 7,
      maxProfessionals: null,
    },
  ]);
  await expect(page.locator('.gf-plan-option')).toHaveCount(2);
  const individual = page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Plano Individual', exact: true }) });
  const team = page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Plano Equipe', exact: true }) });
  await expect(individual).toContainText('22,99');
  await expect(team).toContainText('32,99');
  await individual.click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/niche');
  await expect(page.getByRole('status')).toContainText('Plano Individual selecionado.');
  await page.getByRole('link', { name: 'Alterar plano' }).click();
  await team.click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plano Equipe selecionado.');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Plano Equipe selecionado.');
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Barbearia', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/template');
  await expect(page.getByRole('heading', { name: 'Barber Classic' })).toBeVisible();
  await page.getByRole('button', { name: 'Escolher este template' }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Agora vamos configurar seu negócio.' }),
  ).toBeVisible();
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Empresa de Teste');
  await page.getByLabel('Nome público / slug', { exact: true }).fill('empresa-de-teste');
  await page.getByLabel('Telefone', { exact: true }).fill('21999998888');
  await page.getByLabel('Cidade', { exact: true }).fill('Rio de Janeiro');
  await page.getByLabel('Estado', { exact: true }).selectOption('RJ');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu negócio está em configuração.' }),
  ).toBeVisible();
  const pending = await (await page.request.get('/api/onboarding/business')).json();
  expect(pending.company.plan.code).toBe('team');
  await page.reload();
  await expect(page.locator('.gf-setup-summary')).toContainText('Empresa de Teste');
  expect(await (await page.request.get('/api/companies')).json()).toEqual([]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await expect(page.locator('.service-card')).toHaveCount(4);
  await expect(page.locator('.gf-app')).toHaveCount(0);
  expect(errors).toEqual([]);
});
