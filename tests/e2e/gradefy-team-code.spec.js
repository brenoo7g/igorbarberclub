import { test, expect } from '@playwright/test';
const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid };
async function owner(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}
async function invite(page, email, role = 'manager') {
  const r = await page.request.post('/api/admin/team/invitations', {
    headers,
    data: { email, role },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function responsive(page, name) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/team-code-${name}-${width}.png`, fullPage: true });
  }
}
test('profile choice is discoverable, keyboard accessible, responsive and preserves owner signup', async ({
  page,
}) => {
  await page.goto('/app');
  await page.getByRole('link', { name: 'Criar minha conta', exact: true }).click();
  await expect(page).toHaveURL('/app/comecar');
  await expect(page.getByRole('heading', { name: 'Como deseja usar o Gradefy?' })).toBeVisible();
  await responsive(page, 'profile');
  const collaborator = page.getByRole('link', { name: /Sou colaborador/ });
  await collaborator.focus();
  await expect(collaborator).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/app/entrar-equipe');
  await expect(page.getByRole('heading', { name: 'Entrar em uma equipe' })).toBeVisible();
  await responsive(page, 'entry');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confira o código completo');
  await page.getByLabel('Código do convite').fill('0'.repeat(52));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('inválido');
  await page.getByRole('link', { name: 'Voltar', exact: true }).click();
  await page.getByRole('link', { name: /Sou proprietário/ }).click();
  await expect(page).toHaveURL('/app/cadastro');
  await page.getByLabel('Nome', { exact: true }).fill('Novo Proprietário');
  await page.getByLabel('E-mail', { exact: true }).fill(`owner-choice-${Date.now()}@example.com`);
  await page.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
  await page.getByLabel('Confirmação de senha', { exact: true }).fill('GradefyTeste123!');
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/plan');
  await expect(page.getByRole('heading', { name: 'Escolha seu plano' })).toBeVisible();
  expect(await (await page.request.get('/api/companies')).json()).toEqual([]);
});
test('code sharing modal exposes real metadata and both clipboard actions at all sizes', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await owner(page);
  await page.goto('/app/equipe?empresa=' + cid);
  await page.getByLabel('E-mail do convidado').fill(`share-code-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Criar convite', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Convite pronto' });
  await expect(dialog).toContainText('Clube Horizonte');
  await expect(dialog).toContainText('Gestor · Convite pendente');
  await expect(dialog).toContainText('expira em 7 dias');
  await responsive(page, 'share');
  const code = await dialog.getByLabel('Código do convite').inputValue(),
    link = await dialog.getByLabel('Link do convite').inputValue();
  await dialog.getByRole('button', { name: 'Copiar código de convite', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await dialog.getByRole('button', { name: 'Copiar link de convite', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Código do convite')).toHaveCount(0);
});
test('collaborator code survives refresh and registration and never enters owner onboarding', async ({
  page,
  browser,
}) => {
  await owner(page);
  const email = `collaborator-code-${Date.now()}@example.com`,
    invitation = await invite(page, email);
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await guest.goto('/app/comecar');
    await guest.getByRole('link', { name: /Sou colaborador/ }).click();
    await guest
      .getByLabel('Código do convite')
      .fill(invitation.code.toLowerCase().replaceAll('-', ' '));
    await guest.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(guest).toHaveURL(/\/app\/convite#token=/);
    await expect(
      guest.getByRole('heading', { name: 'Convite para Clube Horizonte' }),
    ).toBeVisible();
    await responsive(guest, 'confirmation');
    await guest.reload();
    await expect(
      guest.getByRole('heading', { name: 'Convite para Clube Horizonte' }),
    ).toBeVisible();
    await guest.getByRole('link', { name: 'Criar minha conta', exact: true }).click();
    await guest.reload();
    await guest.getByLabel('Nome', { exact: true }).fill('Colaborador Convidado');
    await guest.getByLabel('E-mail', { exact: true }).fill(email);
    await guest.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
    await guest.getByLabel('Confirmação de senha', { exact: true }).fill('GradefyTeste123!');
    await guest.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
    await expect(guest).toHaveURL(/\/app\/convite#token=/);
    expect(await (await guest.request.get('/api/companies')).json()).toEqual([]);
    await guest.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await expect(guest.getByText('Convite aceito com sucesso.', { exact: true })).toBeVisible();
    expect(
      (
        await guest.request.post('/api/team/invitations/inspect', {
          data: { code: invitation.code },
        })
      ).status(),
    ).toBe(410);
    await guest.getByRole('link', { name: 'Acessar minha conta empresarial' }).click();
    await expect(guest).toHaveURL('/app/dashboard?empresa=' + cid);
    const companies = await (await guest.request.get('/api/companies')).json();
    expect(companies.map((c) => c.id)).toEqual([cid]);
    await guest.goto('/');
    await expect(
      guest.getByRole('banner').getByRole('link', { name: 'Igor Barber Club — início' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
test('existing account can join by code; professional gets no financial access and conventional login is retained', async ({
  page,
  browser,
}) => {
  await owner(page);
  const email = `existing-code-${Date.now()}@example.com`;
  const invitation = await invite(page, email, 'professional');
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    const registration = await guest.request.post('/api/auth/register', {
      data: {
        scope: 'gradefy',
        name: 'Existing Colleague',
        email,
        password: 'GradefyTeste123!',
        confirmPassword: 'GradefyTeste123!',
      },
    });
    expect(registration.status()).toBe(201);
    await guest.request.post('/api/auth/logout');
    await guest.goto('/app/entrar-equipe');
    await guest.getByRole('link', { name: 'Já tenho uma conta', exact: true }).click();
    await guest.reload();
    await guest.getByLabel('E-mail', { exact: true }).fill(email);
    await guest.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
    await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(guest).toHaveURL('/app/entrar-equipe');
    await guest.getByLabel('Código do convite').fill(invitation.code);
    await guest.getByRole('button', { name: 'Continuar', exact: true }).click();
    await guest.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await guest.getByRole('link', { name: 'Acessar minha conta empresarial' }).click();
    await expect(guest).toHaveURL('/app/minha-agenda?empresa=business-browser-team');
    await expect(guest.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
    await expect(
      guest.getByRole('link', { name: 'Acessar painel empresarial', exact: true }),
    ).toHaveCount(0);
    expect((await guest.request.get('/api/admin/finance', { headers })).status()).toBe(403);
    await guest
      .locator('.gf-dashboard-main')
      .getByRole('link', { name: 'Minha conta', exact: true })
      .click();
    await guest.getByRole('link', { name: 'Entrar em uma equipe', exact: true }).click();
    await expect(guest).toHaveURL('/app/entrar-equipe');
  } finally {
    await context.close();
  }
  await page.goto('/app/login');
  await expect(page).toHaveURL('/app/dashboard');
});
