import { test, expect } from '@playwright/test';
import { addDays } from '../../server/domain.js';
const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid };
const setupPath = '/app/minha-agenda/configurar?empresa=' + cid,
  agendaPath = '/app/minha-agenda?empresa=' + cid;
async function invited(page, browser) {
  const owner = await browser.newContext();
  try {
    expect(
      (
        await owner.request.post('http://127.0.0.1:4173/api/auth/login', {
          data: { email: 'business-browser-owner@example.com', password: 'ClienteDemo2026!' },
        })
      ).status(),
    ).toBe(200);
    const email = `own-setup-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const r = await owner.request.post('http://127.0.0.1:4173/api/admin/team/invitations', {
      headers,
      data: { email, role: 'professional', professional: { mode: 'new' } },
    });
    expect(r.status()).toBe(201);
    const info = await r.json();
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            scope: 'gradefy',
            name: 'Profissional do Assistente',
            email,
            password: 'AgendaTeste2026!',
            confirmPassword: 'AgendaTeste2026!',
          },
        })
      ).status(),
    ).toBe(201);
    await page.goto(info.link);
    await page.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await expect(page).toHaveURL(setupPath);
    await expect(
      page.getByRole('heading', { name: 'Quais dias você atende?', exact: true }),
    ).toBeVisible();
    return { email, token: new URLSearchParams(new URL(info.link).hash.slice(1)).get('token') };
  } finally {
    await owner.close();
  }
}
async function review(page) {
  await page.getByLabel('Trabalhar Terça-feira', { exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Defina seus horários', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Início · Terça-feira', { exact: true }).fill('09:00');
  await page.getByLabel('Fim · Terça-feira', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar pausa · Terça-feira', exact: true }).click();
  await page.getByLabel('Início da pausa 1 · Terça-feira', { exact: true }).fill('12:20');
  await page.getByLabel('Fim da pausa 1 · Terça-feira', { exact: true }).fill('14:00');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tudo certo?', exact: true })).toBeVisible();
}
test('new invite opens four-step own setup, works at mobile/tablet/desktop and saves an inactive waiting profile', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await invited(page, browser);
  await expect(page.getByText('Clube Horizonte', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/own-schedule-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Escolha pelo menos um dia');
  await review(page);
  await expect(
    page.getByLabel('Repetir disponibilidade automaticamente nas próximas semanas'),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Salvar minha agenda', exact: true }).click();
  await expect(page).toHaveURL(agendaPath);
  await expect(page.getByText('Sua agenda foi configurada!', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Peça à gestão para associar seus serviços.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Peça à gestão para autorizar sua ativação.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Configurar meus horários', exact: true }).click();
  await expect(page.getByLabel('Trabalhar Terça-feira', { exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByLabel('Trabalhar Terça-feira', { exact: true })).toBeChecked();
  const data = await (await page.request.get('/api/professional/availability', { headers })).json();
  expect(data.settings.agenda_mode).toBe('auto');
  expect(data.professional.active).toBe(0);
  expect(data.days.find((d) => d.weekday === 2).breaks).toEqual([
    { start_time: '12:20', end_time: '14:00' },
  ]);
  expect((await page.request.get('/api/admin/finance', { headers })).status()).toBe(403);
  expect(errors).toEqual([]);
});
test('incomplete professional resumes configuration after logout, login and browser reload', async ({
  page,
  browser,
}) => {
  const { email } = await invited(page, browser);
  await page.request.post('/api/auth/logout');
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('AgendaTeste2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(setupPath);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Quais dias você atende?', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Continuar depois · Minha conta', exact: true }).click();
  await expect(page).toHaveURL('/app/conta');
  await page.getByRole('link', { name: 'Abrir Minha Agenda', exact: true }).click();
  await expect(page).toHaveURL(setupPath);
});
test('lost save response retries the same persistent key and does not duplicate availability', async ({
  page,
  browser,
}) => {
  await invited(page, browser);
  await review(page);
  const keys = [];
  let lost = false;
  await page.route('**/api/professional/availability', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      return route.abort();
    }
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Salvar minha agenda', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(setupPath);
  await page.getByRole('button', { name: 'Salvar minha agenda', exact: true }).click();
  await expect(page).toHaveURL(agendaPath);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    (await (await page.request.get('/api/professional/availability', { headers })).json()).settings
      .version,
  ).toBe(1);
});
test('recoverable availability failures and isolated 401 preserve the canonical session and allow retry', async ({
  page,
  browser,
}) => {
  await invited(page, browser);
  for (const status of [500, 403, 401]) {
    await page.route('**/api/professional/availability', (route) =>
      route.fulfill({ status, json: { error: 'Falha recuperável na configuração.' } }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Falha recuperável');
    await expect(page).toHaveURL(setupPath);
    await page.unroute('**/api/professional/availability');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByLabel('Trabalhar Terça-feira', { exact: true })).toBeVisible();
    expect((await page.request.get('/api/auth/me?scope=gradefy')).status()).toBe(200);
  }
});
test('personal block creation/removal uses the saved routine and keeps company context', async ({
  page,
  browser,
}) => {
  await invited(page, browser);
  await review(page);
  await page.getByRole('button', { name: 'Salvar minha agenda', exact: true }).click();
  await expect(page).toHaveURL(agendaPath);
  await page.getByRole('link', { name: 'Configurar meus horários', exact: true }).click();
  const data = await (await page.request.get('/api/professional/availability', { headers })).json();
  let date = addDays(data.today, 1);
  while (new Date(date + 'T12:00Z').getUTCDay() !== 2) date = addDays(date, 1);
  await page.getByLabel('Data do bloqueio pessoal', { exact: true }).fill(date);
  await page.getByLabel('Início do bloqueio pessoal', { exact: true }).fill('14:00');
  await page.getByLabel('Fim do bloqueio pessoal', { exact: true }).fill('15:00');
  await page.getByRole('button', { name: 'Criar bloqueio pessoal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bloqueio pessoal salvo');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remover bloqueio pessoal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bloqueio pessoal removido');
  await expect(
    page.getByRole('button', { name: 'Remover bloqueio pessoal', exact: true }),
  ).toHaveCount(0);
});
