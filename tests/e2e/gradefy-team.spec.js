import { test, expect } from '@playwright/test';
const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid };
async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}
const emails = (name) => `${name}-${Date.now()}@example.com`;
async function newInvite(page, email) {
  const r = await page.request.post('/api/admin/team/invitations', {
    headers,
    data: { email, role: 'manager' },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
test('owner manages real invitation cards, renewal, cancellation and responsive layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/app/dashboard?empresa=' + cid);
  await page
    .locator('.gf-dashboard-quick')
    .getByRole('link', { name: 'Equipe e acessos Abrir gestão', exact: true })
    .click();
  await expect(page).toHaveURL('/app/equipe?empresa=' + cid);
  await expect(page.getByRole('heading', { name: 'Equipe e permissões' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Membros da empresa' })).toContainText(
    'Proprietário',
  );
  const email = emails('team-ui');
  await page.getByLabel('E-mail do convidado').fill(email);
  await page.getByRole('button', { name: 'Criar convite', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Convite pronto' });
  await expect(dialog).toContainText('O envio por e-mail não está configurado');
  const original = await dialog.getByLabel('Link do convite').inputValue();
  expect(new URL(original).hash).toMatch(/^#token=[a-f0-9]{64}$/);
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  const card = page
    .locator('.gf-business-record')
    .filter({ has: page.getByRole('heading', { name: email, exact: true }) });
  await expect(card).toContainText('Convite pendente');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const nav = page.getByRole('navigation', { name: 'Navegação móvel' });
    if (width < 1100) {
      await nav
        .getByRole('link', { name: 'Equipe e acessos', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(nav.getByRole('link', { name: 'Equipe e acessos', exact: true })).toBeVisible();
    }
    await page.screenshot({ path: `test-results/team-${width}.png`, fullPage: true });
  }
  await card.getByRole('button', { name: 'Renovar e reenviar' }).click();
  await page
    .getByRole('dialog', { name: 'Renovar convite?' })
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  const renewed = await dialog.getByLabel('Link do convite').inputValue();
  expect(renewed).not.toBe(original);
  const old = await page.request.post('/api/team/invitations/inspect', {
    data: { token: new URLSearchParams(new URL(original).hash.slice(1)).get('token') },
  });
  expect(old.status()).toBe(410);
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await card.getByRole('button', { name: 'Cancelar convite' }).click();
  await page
    .getByRole('dialog', { name: 'Cancelar convite?' })
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(card).toContainText('Cancelado');
  await page.reload();
  await expect(card).toContainText('Cancelado');
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await expect(page.getByRole('region', { name: 'Convites da empresa' })).not.toContainText(email);
  expect(errors).toEqual([]);
});
test('invited registration preserves fragment, acceptance adds one membership and owner revocation blocks the old session', async ({
  page,
  browser,
}) => {
  await login(page);
  const email = emails('team-register'),
    invite = await newInvite(page, email);
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await guest.goto(invite.link);
    await expect(guest.getByRole('heading', { name: 'Clube Horizonte' })).toBeVisible();
    await guest.getByRole('link', { name: 'Criar minha conta', exact: true }).click();
    await expect(guest).toHaveURL(/\/app\/cadastro#token=/);
    await guest.getByLabel('Nome', { exact: true }).fill('Equipe Convidada');
    await guest.getByLabel('E-mail', { exact: true }).fill(email);
    await guest.getByLabel('Senha', { exact: true }).fill('ClienteTeste2026!');
    await guest.getByLabel('Confirmação de senha', { exact: true }).fill('ClienteTeste2026!');
    await guest.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
    await expect(guest).toHaveURL(/\/app\/convite#token=/);
    expect(await (await guest.request.get('/api/companies')).json()).toEqual([]);
    await guest.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await expect(guest.getByText('Convite aceito com sucesso.', { exact: true })).toBeVisible();
    await expect(guest).toHaveURL('/app/convite');
    await guest.getByRole('link', { name: 'Acessar minha conta empresarial' }).click();
    await expect(guest).toHaveURL('/app/dashboard?empresa=' + cid);
    await expect(
      guest.getByRole('heading', { name: 'Seu negócio em números', exact: true }),
    ).toBeVisible();
    const companies = await (await guest.request.get('/api/companies')).json();
    expect(companies.map((c) => c.id)).toEqual([cid]);
    const me = await (await guest.request.get('/api/auth/me?scope=gradefy')).json();
    const members = await (await page.request.get('/api/admin/team', { headers })).json();
    expect(members.members.find((m) => m.id === me.user.id).professional_name).toBeNull();
    expect((await guest.request.get('/api/admin/finance', { headers })).status()).toBe(200);
    await page.goto('/app/equipe?empresa=' + cid);
    const card = page.locator('.gf-business-record').filter({ hasText: email }).first();
    await card.getByRole('button', { name: 'Alterar papel' }).click();
    const roleDialog = page.getByRole('dialog', { name: 'Alterar papel?' });
    await roleDialog.getByLabel('Novo papel').selectOption('professional');
    await roleDialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(card).toContainText('Profissional');
    expect((await guest.request.get('/api/admin/reports', { headers })).status()).toBe(403);
    await card.getByRole('button', { name: 'Revogar acesso' }).click();
    const revoke = page.getByRole('dialog', { name: 'Revogar acesso?' });
    await expect(revoke).toContainText('serão preservados');
    await revoke.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(card).toContainText('Revogado');
    expect((await guest.request.get('/api/admin/finance', { headers })).status()).toBe(403);
    expect((await guest.request.get('/api/admin/reports', { headers })).status()).toBe(403);
    const repeated = await guest.request.post('/api/team/invitations/accept', {
      data: { token: new URLSearchParams(new URL(invite.link).hash.slice(1)).get('token') },
    });
    expect(repeated.status()).toBe(410);
  } finally {
    await context.close();
  }
});
test('existing login returns to invite; mismatched account, session expiration and invalid links offer safe recovery', async ({
  page,
  browser,
}) => {
  await login(page);
  const invite = await newInvite(page, emails('team-mismatch'));
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await guest.goto(invite.link);
    await guest.getByRole('link', { name: 'Já tenho uma conta', exact: true }).click();
    await guest.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
    await guest.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
    await guest.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(guest).toHaveURL(/\/app\/convite#token=/);
    await expect(guest.getByText('Esta conta usa outro e-mail.', { exact: false })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Aceitar convite', exact: true })).toHaveCount(
      0,
    );
    await guest.getByRole('button', { name: 'Trocar conta' }).click();
    await expect(
      guest.getByRole('link', { name: 'Já tenho uma conta', exact: true }),
    ).toBeVisible();
    await guest.goto('/app/convite#token=' + 'f'.repeat(64));
    await expect(guest.getByRole('alert')).toContainText('inválido');
    await expect(guest.getByRole('link', { name: 'Minha conta', exact: true })).toBeVisible();
    await guest.goto('/app/equipe?empresa=' + cid);
    await expect(guest).toHaveURL('/app/login');
    await guest.goto('/');
    await expect(
      guest.getByRole('banner').getByRole('link', { name: 'Igor Barber Club — início' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
