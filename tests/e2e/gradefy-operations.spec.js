import { test, expect } from '@playwright/test';

test('operational wizard persists services, owner and breaks, deliberately starts trial, stays unpublished', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = `operations-${Date.now()}@example.com`;
  const signup = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Ana Proprietária',
      email,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(signup.status()).toBe(201);
  const created = await page.request.post('/api/onboarding/business', {
    data: {
      name: 'Espaço Ana',
      slug: `espaco-ana-${Date.now()}`,
      phone: '21999998888',
      city: 'Rio de Janeiro',
      region: 'RJ',
      planCode: 'individual',
      nicheCode: 'barbershop',
      templateCode: 'barber-classic',
    },
  });
  expect(created.status()).toBe(201);
  const { company } = await created.json();
  await page.goto('/app/onboarding/operations');
  await expect(page.getByRole('heading', { name: 'Novo serviço' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page.getByText('Nenhum serviço cadastrado. Adicione seu primeiro atendimento.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Corte', exact: true }).click();
  expect((await (await page.request.get('/api/onboarding/operations')).json()).services).toEqual(
    [],
  );
  await page.getByLabel('Preço (R$)', { exact: true }).fill('30,00');
  await page.getByLabel('Duração (minutos)', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Cadastrar serviço', exact: true }).click();
  await expect(page.locator('.gf-resource-row')).toContainText('40 min');
  await page.getByRole('button', { name: 'Editar Corte', exact: true }).click();
  await page.getByLabel('Descrição (opcional)', { exact: true }).fill('Corte profissional');
  await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo serviço' })).toBeVisible();
  await page.getByRole('button', { name: 'Desativar', exact: true }).click();
  await expect(page.locator('.gf-resource-row')).toContainText('Inativo');
  await page.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(page.locator('.gf-resource-row')).toContainText('Ativo');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo profissional' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('checkbox', { name: 'Eu também atendo (vincular minha conta)', exact: true })
    .check();
  await page.getByRole('checkbox', { name: 'Corte', exact: true }).check();
  await page.getByRole('button', { name: 'Cadastrar profissional', exact: true }).click();
  await expect(page.locator('.gf-resource-row')).toContainText('Ana Proprietária');
  await page.getByLabel('Nome do profissional', { exact: true }).fill('Excedente');
  await page.getByRole('checkbox', { name: 'Corte', exact: true }).check();
  await page.getByRole('button', { name: 'Cadastrar profissional', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('limite de profissionais');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Expediente por profissional' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Terça-feira', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Terça-feira', exact: true }).check();
  await page.getByLabel('Abertura da agenda', { exact: true }).selectOption('auto');
  await page.getByRole('button', { name: 'Adicionar pausa — Terça-feira', exact: true }).click();
  await page.getByLabel('Início da pausa 1 — Terça-feira', { exact: true }).fill('12:20');
  await page.getByLabel('Fim da pausa 1 — Terça-feira', { exact: true }).fill('14:00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/gradefy-hours-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar horários', exact: true }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revise sua configuração' })).toBeVisible();
  await expect(page.locator('.gf-review')).toContainText('12:20–14:00');
  const before = (await (await page.request.get('/api/onboarding/business')).json()).company;
  expect(before.trial).toBeNull();
  expect(before.currentStep).toBe('review');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/gradefy-operations-${width}.png`,
        fullPage: true,
      });
  }
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Revise sua configuração' })).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(page).toHaveURL('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.goto('/app/onboarding/operations');
  await expect(page.getByRole('heading', { name: 'Revise sua configuração' })).toBeVisible();
  let first = null;
  const keys = [];
  await page.route('**/api/onboarding/operations/complete', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      const r = await route.fetch();
      expect(r.status()).toBe(200);
      first = await r.json();
      await route.abort('failed');
    } else await route.continue();
  });
  const finish = page.getByRole('button', {
    name: 'Concluir configuração e iniciar 7 dias grátis',
    exact: true,
  });
  await finish.click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await finish.click();
  await expect(page).toHaveURL('/app/onboarding/complete');
  await expect(page.getByRole('heading', { name: 'Sua empresa está configurada!' })).toBeVisible();
  await expect(page.getByText('7 dias gratuitos ativos.', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const after = (await (await page.request.get('/api/onboarding/business')).json()).company;
  expect(after.trial).toEqual(first.company.trial);
  expect(Date.parse(after.trial.trial_ends_at) - Date.parse(after.trial.trial_started_at)).toBe(
    604800000,
  );
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  await page.getByRole('link', { name: 'Personalizar meu site', exact: true }).click();
  await expect(page).toHaveURL('/app/meu-site');
  await expect(page.getByRole('heading', { name: 'Meu Site', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meu Site' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});
