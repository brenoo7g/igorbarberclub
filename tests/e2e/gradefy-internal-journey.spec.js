import { test, expect } from '@playwright/test';

const widths = [320, 360, 390, 428, 768, 1024, 1440];
const password = 'ClienteDemo2026!';
const cid = 'business-browser-team';
const headers = { 'X-Gradefy-Company-Id': cid };
async function login(page, email) {
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(
    200,
  );
}
async function register(page, email) {
  const response = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Pessoa Convidada Alpha',
      email,
      password,
      confirmPassword: password,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).user;
}
async function invitation(owner, email, role = 'professional') {
  const response = await owner.request.post('/api/admin/team/invitations', {
    headers,
    data: { email, role, ...(role === 'professional' ? { professional: { mode: 'new' } } : {}) },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function capture(page, stem, mask = []) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `test-results/internal-${stem}-${width}.png`,
        fullPage: mask.length === 0,
        maskColor: '#303567',
        mask,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('account cards preserve each actual role, company context and management restrictions', async ({
  page,
}) => {
  await login(page, 'staff-browser-primary@example.com');
  await page.goto('/app/conta');
  const professional = page.getByRole('region', {
    name: 'Acesso a Equipe de Atendimento',
    exact: true,
  });
  const manager = page.getByRole('region', { name: 'Acesso a Outra Empresa', exact: true });
  const owner = page.getByRole('region', { name: 'Acesso a Estúdio Individual', exact: true });
  await expect(professional).toContainText('Profissional');
  await expect(manager).toContainText('Gestor');
  await expect(owner).toContainText('Proprietário');
  await expect(professional.getByRole('link', { name: 'Abrir Minha Agenda' })).toHaveAttribute(
    'href',
    '/app/minha-agenda?empresa=staff-browser-a',
  );
  await expect(professional.getByRole('link', { name: 'Abrir painel empresarial' })).toHaveCount(0);
  await expect(professional.getByRole('link', { name: 'Meu Mini Site' })).toHaveCount(0);
  await expect(manager.getByRole('link', { name: 'Abrir painel empresarial' })).toHaveAttribute(
    'href',
    '/app/dashboard?empresa=staff-browser-b',
  );
  await expect(owner.getByRole('link', { name: 'Meu Mini Site' })).toHaveAttribute(
    'href',
    '/app/meu-site?empresa=staff-browser-individual',
  );
  // Draft sites never receive a public link; their authorized editor owns preview/publication.
  await expect(
    page.locator('.gf-account-companies a[href="/staff-browser-individual"]'),
  ).toHaveCount(0);
  await capture(page, 'account-multiple');
  await professional.getByRole('link', { name: 'Abrir Minha Agenda' }).click();
  await expect(page).toHaveURL('/app/minha-agenda?empresa=staff-browser-a');
  expect(
    (
      await page.request.get('/api/admin/finance', {
        headers: { 'X-Gradefy-Company-Id': 'staff-browser-a' },
      })
    ).status(),
  ).toBe(403);
});

test('owner account and recoverable errors preserve session; empty account has a next action', async ({
  page,
}) => {
  await login(page, 'business-browser-owner@example.com');
  await page.goto('/app/conta');
  await expect(page.getByRole('heading', { name: 'Seu acesso está ativo' })).toBeVisible();
  await capture(page, 'account');
  await page.route('**/api/companies', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Não foi possível carregar os estabelecimentos.' },
    }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await expect(page).toHaveURL('/app/conta');
  expect((await page.request.get('/api/auth/me?scope=gradefy')).status()).toBe(200);
  await page.unroute('**/api/companies');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('region', { name: 'Acesso a Clube Horizonte' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/app/login');
  await login(page, 'cliente@example.com');
  await page.goto('/app/conta');
  await expect(
    page.getByRole('heading', { name: 'Seu próximo passo: seu negócio.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar em uma equipe' })).toBeVisible();
});

test('sharing dialog copies full values, traps keyboard focus and returns focus on Escape', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, 'business-browser-owner@example.com');
  await page.goto('/app/equipe?empresa=' + cid);
  await page.getByLabel('E-mail do convidado').fill(`internal-share-${Date.now()}@example.test`);
  const create = page.getByRole('button', { name: 'Criar convite', exact: true });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Convite pronto' });
  await expect(dialog).toBeVisible();
  const link = await dialog.getByLabel('Link do convite').inputValue();
  const code = await dialog.getByLabel('Código do convite').inputValue();
  await capture(page, 'invite-ready', [
    dialog.getByLabel('Link do convite'),
    dialog.getByLabel('Código do convite'),
  ]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const [name, value] of [
    ['Copiar link', link],
    ['Copiar código', code],
    ['Copiar link do convite', link],
    ['Copiar código do convite', code],
  ]) {
    await dialog.getByRole('button', { name, exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
    await expect(dialog.getByRole('status')).toContainText('copiado');
  }
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();
  await expect(page.getByLabel('Código do convite')).toHaveCount(0);
  // Close while the refresh still holds the form unmounted: focus must return after it resolves.
  let release;
  const refreshGate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/admin/team', async (route) => {
    await refreshGate;
    await route.continue();
  });
  try {
    await page.getByLabel('E-mail do convidado').fill(`internal-focus-${Date.now()}@example.test`);
    const refreshing = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/admin/team' && request.method() === 'GET',
    );
    await create.click();
    await refreshing;
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    release();
    await expect(create).toBeFocused();
  } finally {
    release();
    await page.unroute('**/api/admin/team');
  }
});

test('invitation mismatch, switch account, manager acceptance and revocation use real access rules', async ({
  page,
  browser,
}) => {
  await login(page, 'business-browser-owner@example.com');
  const email = `internal-manager-${Date.now()}@example.test`;
  const invite = await invitation(page, email, 'manager');
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  try {
    await login(guest, 'cliente@example.com');
    await guest.goto(invite.link);
    await expect(guest.getByRole('alert')).toContainText('Esta conta usa outro e-mail.');
    await expect(guest.getByRole('button', { name: 'Aceitar convite' })).toHaveCount(0);
    await capture(guest, 'invite-mismatch');
    await guest.getByRole('button', { name: 'Trocar conta' }).click();
    await expect(guest.getByRole('link', { name: 'Já tenho uma conta' })).toBeVisible();
    const user = await register(guest, email);
    await guest.reload();
    await guest.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(guest.getByRole('status')).toContainText('Convite aceito com sucesso.');
    await guest.getByRole('link', { name: 'Acessar minha conta empresarial' }).click();
    await expect(guest).toHaveURL('/app/dashboard?empresa=' + cid);
    await guest.goto('/app/conta');
    await expect(guest.getByRole('region', { name: 'Acesso a Clube Horizonte' })).toContainText(
      'Gestor',
    );
    expect(
      (
        await page.request.post('/api/admin/team/members/' + user.id + '/revoke', {
          headers,
          data: { expectedRole: 'manager', expectedStatus: 'active', confirm: true },
        })
      ).status(),
    ).toBe(200);
    await guest.reload();
    await expect(guest.locator('.gf-account-company')).toHaveCount(0);
    await expect(guest.getByRole('link', { name: 'Entrar em uma equipe' })).toBeVisible();
    expect((await guest.request.get('/api/auth/me?scope=gradefy')).status()).toBe(200);
    expect((await guest.request.get('/api/admin/team', { headers })).status()).toBe(403);
    // Used/cancelled links stay unusable rather than exposing company access.
    await guest.goto(invite.link);
    await expect(guest.getByRole('alert')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('professional wizard validates seven days, independent hours, breaks and recurrence with responsive screenshots', async ({
  page,
  browser,
}) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  try {
    await login(ownerPage, 'business-browser-owner@example.com');
    const email = `internal-wizard-${Date.now()}@example.test`;
    const invite = await invitation(ownerPage, email);
    await page.goto(invite.link);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Você foi convidado para Clube Horizonte',
    );
    await capture(page, 'invite-accept');
    await register(page, email);
    await page.reload();
    await page.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(page).toHaveURL('/app/minha-agenda/configurar?empresa=' + cid);
    await expect(page.getByRole('checkbox', { name: /^Trabalhar / })).toHaveCount(7);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Escolha pelo menos um dia');
    await page.getByLabel('Trabalhar Segunda-feira', { exact: true }).check();
    await page.getByLabel('Trabalhar Terça-feira', { exact: true }).check();
    await capture(page, 'schedule-days');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Início · Segunda-feira', { exact: true }).fill('10:00');
    await page.getByLabel('Fim · Segunda-feira', { exact: true }).fill('17:00');
    await page.getByLabel('Fim · Terça-feira', { exact: true }).fill('08:00');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('horários válidos');
    await page.getByLabel('Fim · Terça-feira', { exact: true }).fill('18:00');
    await capture(page, 'schedule-hours');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page
      .getByRole('button', { name: 'Adicionar pausa · Segunda-feira', exact: true })
      .click();
    await page.getByLabel('Início da pausa 1 · Segunda-feira', { exact: true }).fill('12:20');
    await page.getByLabel('Fim da pausa 1 · Segunda-feira', { exact: true }).fill('14:00');
    await page
      .getByRole('button', { name: 'Adicionar pausa · Segunda-feira', exact: true })
      .click();
    await page.getByLabel('Início da pausa 2 · Segunda-feira', { exact: true }).fill('13:00');
    await page.getByLabel('Fim da pausa 2 · Segunda-feira', { exact: true }).fill('14:30');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('sem sobreposição');
    await page.getByLabel('Início da pausa 2 · Segunda-feira', { exact: true }).fill('15:00');
    await page.getByLabel('Fim da pausa 2 · Segunda-feira', { exact: true }).fill('15:15');
    await capture(page, 'schedule-breaks');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tudo certo?', exact: true })).toBeVisible();
    await page.getByLabel('Repetir disponibilidade automaticamente nas próximas semanas').uncheck();
    await capture(page, 'schedule-review');
    await page.getByRole('button', { name: 'Salvar minha agenda', exact: true }).click();
    await expect(page).toHaveURL('/app/minha-agenda?empresa=' + cid);
    await expect(
      page.getByRole('status').filter({ hasText: 'Sua agenda foi configurada!' }),
    ).toBeVisible();
    await expect(
      page.getByText('Agora falta o estabelecimento concluir sua ativação para receber reservas.', {
        exact: true,
      }),
    ).toBeVisible();
    const saved = await (
      await page.request.get('/api/professional/availability', { headers })
    ).json();
    expect(saved.settings.agenda_mode).toBe('manual');
    expect(saved.professional.active).toBe(0);
    expect(saved.days.find((d) => d.weekday === 1).breaks).toHaveLength(2);
    // Read-only UI state: manual release can be pending even when activation/services are complete.
    // It must not be described as a missing activation. This never mutates the test database.
    await page.route('**/api/professional/agenda?*', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.availability = {
        ...json.availability,
        active: true,
        servicesAssigned: true,
        state: 'waiting',
        pending: ['A gestão precisa liberar um período.'],
      };
      json.linkState = 'linked';
      json.editable = true;
      json.message = null;
      await route.fulfill({ response, json });
    });
    await page.reload();
    await expect(
      page.getByText('A gestão precisa liberar um período.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Agora falta o estabelecimento concluir sua ativação para receber reservas.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.unroute('**/api/professional/agenda?*');
    await page.getByRole('link', { name: 'Configurar meus horários' }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Início · Segunda-feira', { exact: true })).toHaveValue('10:00');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(
      page.getByLabel('Repetir disponibilidade automaticamente nas próximas semanas'),
    ).not.toBeChecked();
    expect((await page.request.get('/api/admin/finance', { headers })).status()).toBe(403);
  } finally {
    await owner.close();
  }
});
