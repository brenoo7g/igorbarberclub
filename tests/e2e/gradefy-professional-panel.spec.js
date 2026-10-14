import { test, expect } from '@playwright/test';
import { addDays } from '../../server/domain.js';
const cid = 'staff-browser-a',
  headers = { 'X-Gradefy-Company-Id': cid };
async function login(page, who = 'second') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('staff-browser-' + who + '@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(
    who === 'second' || who === 'pending' ? '/app/minha-agenda?empresa=' + cid : '/app/dashboard',
  );
}
async function ownerRequest(browser) {
  const ctx = await browser.newContext();
  expect(
    (
      await ctx.request.post('http://127.0.0.1:4173/api/auth/login', {
        data: { email: 'staff-browser-owner@example.com', password: 'ClienteDemo2026!' },
      })
    ).status(),
  ).toBe(200);
  return ctx;
}

test('own professional day/week, private detail and working hours work at 320/390/768/1440 without administrative navigation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByRole('heading', { name: 'Minha Agenda', exact: true })).toBeVisible();
  const data = await (await page.request.get('/api/professional/agenda', { headers })).json();
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Cliente da Minha Agenda às 09:00',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Cliente Exclusivo de Outro');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/professional-agenda-${width}.png`,
      fullPage: true,
    });
  }
  for (const name of ['Financeiro', 'Relatórios', 'Equipe e acessos', 'Configurações'])
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Meus Horários', exact: true })).toBeVisible();
  await expect(page.locator('#meus-horarios')).toContainText('12:20 — 14:00');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('.gf-professional-appointment')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByLabel('Data da minha agenda', { exact: true }).fill(addDays(data.today, -1));
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Cliente Meu Atendimento às 11:00',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Detalhes do meu atendimento' });
  await expect(dialog).not.toContainText('PRIVATE-');
  await expect(dialog).not.toContainText('R$');
  for (const path of ['/api/admin/finance', '/api/admin/reports', '/api/admin/settings'])
    expect((await page.request.get(path, { headers })).status()).toBe(403);
  expect(
    (await page.request.get('/api/professional/agenda/staff-browser-other', { headers })).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
});

test('own completion uses real API, survives lost response and changes status without recording a payment', async ({
  page,
  browser,
}) => {
  await login(page);
  const data = await (await page.request.get('/api/professional/agenda', { headers })).json();
  await page.getByLabel('Data da minha agenda', { exact: true }).fill(addDays(data.today, -1));
  await page
    .getByRole('button', {
      name: 'Ver atendimento de Cliente Meu Atendimento às 11:00',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Concluir atendimento', exact: true })
    .click();
  const keys = [];
  let dropped = false;
  await page.route('**/api/professional/agenda/staff-browser-complete/complete', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (!dropped) {
      dropped = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar conclusão', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('conectar ao servidor');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar conclusão', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Atendimento concluído.' }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const detail = await (
    await page.request.get('/api/professional/agenda/staff-browser-complete', { headers })
  ).json();
  expect(detail.item.status).toBe('completed');
  expect('financial' in detail).toBe(false);
  const owner = await ownerRequest(browser);
  try {
    const d = await (
      await owner.request.get('http://127.0.0.1:4173/api/admin/agenda/staff-browser-complete', {
        headers,
      })
    ).json();
    expect(d.financial.receivedCents).toBe(0);
    expect(d.item.total).toBe(4500);
  } finally {
    await owner.close();
  }
});

test('owner explicitly associates and removes an existing profile; pending colleague never sees another profile before confirmation', async ({
  page,
  browser,
}) => {
  await login(page, 'owner');
  const ctx = await browser.newContext(),
    guest = await ctx.newPage();
  try {
    await login(guest, 'pending');
    await expect(guest.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
    expect(
      (
        await page.request.patch('/api/admin/team/members/staff-browser-primary/professional', {
          headers,
          data: { professionalId: null, expectedProfessionalId: cid + '-p1', confirm: true },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/app/equipe?empresa=' + cid);
    const card = page
      .locator('.gf-business-record')
      .filter({ hasText: 'staff-browser-pending@example.com' })
      .first();
    await card.getByRole('button', { name: 'Associar profissional', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Confirmar vínculo profissional?' });
    await modal.getByLabel('Cadastro profissional').selectOption(cid + '-p1');
    await modal.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(card).toContainText('Profissional associado: João Profissional');
    await guest.getByRole('button', { name: 'Verificar acesso', exact: true }).click();
    await expect(
      guest.getByRole('button', {
        name: 'Ver atendimento de Cliente Exclusivo de Outro às 15:00',
        exact: true,
      }),
    ).toBeVisible();
    await expect(guest.locator('body')).not.toContainText('Cliente da Minha Agenda');
    await card.getByRole('button', { name: 'Alterar vínculo profissional', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Cadastro profissional').selectOption('');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(card).toContainText('Vínculo profissional pendente.');
    await guest.getByRole('button', { name: 'Atualizar minha agenda', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
    await expect(guest.locator('.gf-professional-appointment')).toHaveCount(0);
  } finally {
    const members = await (await page.request.get('/api/admin/team', { headers })).json();
    const pending = members.members.find((m) => m.id === 'staff-browser-pending'),
      primary = members.members.find((m) => m.id === 'staff-browser-primary');
    if (pending.professional_id)
      await page.request.patch('/api/admin/team/members/staff-browser-pending/professional', {
        headers,
        data: {
          professionalId: null,
          expectedProfessionalId: pending.professional_id,
          confirm: true,
        },
      });
    if (!primary.professional_id)
      await page.request.patch('/api/admin/team/members/staff-browser-primary/professional', {
        headers,
        data: { professionalId: cid + '-p1', expectedProfessionalId: null, confirm: true },
      });
    await ctx.close();
  }
});

test('active company decides role and navigation for a single account; invalid old URLs and logout do not leak prior company data', async ({
  page,
}) => {
  await login(page, 'primary');
  await page.getByLabel('Empresa', { exact: true }).selectOption(cid);
  await expect(page).toHaveURL('/app/minha-agenda?empresa=' + cid);
  await expect(
    page.getByRole('button', {
      name: 'Ver atendimento de Cliente Exclusivo de Outro às 15:00',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Empresa', { exact: true }).selectOption('staff-browser-b');
  await expect(page).toHaveURL('/app/dashboard?empresa=staff-browser-b');
  expect(
    (
      await page.request.get('/api/professional/agenda', {
        headers: { 'X-Gradefy-Company-Id': 'staff-browser-b' },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel('Empresa', { exact: true }).selectOption('staff-browser-individual');
  await expect(page).toHaveURL('/app/dashboard?empresa=staff-browser-individual');
  await page.getByLabel('Empresa', { exact: true }).selectOption(cid);
  await expect(page).toHaveURL('/app/minha-agenda?empresa=' + cid);
  await page.goto('/app/minha-agenda?empresa=unknown');
  await expect(page.getByText('Sem acesso à empresa selecionada.', { exact: true })).toBeVisible();
  await expect(page.locator('.gf-professional-appointment')).toHaveCount(0);
  await page.getByLabel('Empresa', { exact: true }).selectOption(cid);
  await expect(page.getByRole('heading', { name: 'Minha Agenda', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page).toHaveURL('/app/login');
});

test('legacy invitation link grants only professional membership and opens the pending own agenda without creating a profile', async ({
  page,
  browser,
}) => {
  const owner = await ownerRequest(browser),
    email = `staff-link-${Date.now()}@example.com`;
  try {
    const before = await (
      await owner.request.get('http://127.0.0.1:4173/api/admin/professionals', { headers })
    ).json();
    const invitation = await (
      await owner.request.post('http://127.0.0.1:4173/api/admin/team/invitations', {
        headers,
        data: { email, role: 'professional' },
      })
    ).json();
    expect(
      (
        await page.request.post('/api/auth/register', {
          data: {
            scope: 'gradefy',
            name: 'Colaborador do Link',
            email,
            password: 'GradefyTeste123!',
            confirmPassword: 'GradefyTeste123!',
          },
        })
      ).status(),
    ).toBe(201);
    await page.goto(invitation.link);
    await page.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
    await page.getByRole('link', { name: 'Acessar minha conta empresarial', exact: true }).click();
    await expect(page).toHaveURL('/app/minha-agenda?empresa=' + cid);
    await expect(page.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
    const data = await (await page.request.get('/api/professional/agenda', { headers })).json();
    expect(data.items).toEqual([]);
    expect(data.professional).toBeNull();
    expect((await page.request.get('/api/admin/agenda', { headers })).status()).toBe(403);
    const after = await (
      await owner.request.get('http://127.0.0.1:4173/api/admin/professionals', { headers })
    ).json();
    expect(after).toHaveLength(before.length);
  } finally {
    await owner.close();
  }
});

test('inactive professional and revoked membership stop an existing session without exposing historical clients or starting onboarding', async ({
  page,
  browser,
}) => {
  await login(page);
  const owner = await ownerRequest(browser),
    pid = cid + '-p2';
  try {
    const profile = await (
      await owner.request.get('http://127.0.0.1:4173/api/admin/professionals/' + pid, { headers })
    ).json();
    expect(
      (
        await owner.request.patch(
          'http://127.0.0.1:4173/api/admin/professionals/' + pid + '/status',
          { headers, data: { active: false, expectedUpcoming: profile.upcoming_appointments } },
        )
      ).status(),
    ).toBe(200);
    await page.getByRole('button', { name: 'Atualizar minha agenda', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cadastro desativado' })).toBeVisible();
    await expect(page.locator('.gf-professional-appointment')).toHaveCount(0);
    expect(
      (
        await owner.request.patch(
          'http://127.0.0.1:4173/api/admin/professionals/' + pid + '/status',
          { headers, data: { active: true } },
        )
      ).status(),
    ).toBe(200);
    await page.getByRole('button', { name: 'Verificar acesso', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meus Horários', exact: true })).toBeVisible();
    expect(
      (
        await owner.request.post(
          'http://127.0.0.1:4173/api/admin/team/members/staff-browser-second/revoke',
          {
            headers,
            data: { expectedRole: 'professional', expectedStatus: 'active', confirm: true },
          },
        )
      ).status(),
    ).toBe(200);
    await page.getByRole('button', { name: 'Atualizar minha agenda', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Sem acesso a estabelecimentos', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.gf-professional-appointment')).toHaveCount(0);
    expect((await page.request.get('/api/professional/agenda', { headers })).status()).toBe(403);
    const preserved = await (
      await owner.request.get('http://127.0.0.1:4173/api/admin/professionals/' + pid, { headers })
    ).json();
    expect(preserved.user_id).toBe('staff-browser-second');
    const management = await owner.newPage();
    await management.goto('/app/equipe?empresa=' + cid);
    const member = management
      .locator('.gf-business-record')
      .filter({ hasText: 'staff-browser-second@example.com' })
      .first();
    await member.getByRole('button', { name: 'Remover vínculo profissional', exact: true }).click();
    await management
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(member).toContainText('Revogado');
    await expect(member).not.toContainText('Profissional associado:');
  } finally {
    await owner.close();
  }
});
