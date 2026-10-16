import { test, expect } from '@playwright/test';
const cid = 'agenda-browser-a';
const headers = { 'X-Gradefy-Company-Id': cid };
const calendar = '/app/agenda?empresa=' + cid;
async function login(page, role = 'owner') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('agenda-browser-' + role + '@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(
    role === 'professional' ? '/app/minha-agenda?empresa=' + cid : '/app/dashboard',
  );
}
const dayAfter = (date, n) =>
  new Date(Date.parse(date + 'T12:00Z') + n * 86400000).toISOString().slice(0, 10);
const dialog = (page) => page.getByRole('dialog');

test('agenda real: day/week, filters, details, responsive presentation and company isolation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.getByLabel('Empresa', { exact: true }).selectOption(cid);
  await page
    .getByRole('button', { name: 'Minha agenda Consultar seus horários', exact: true })
    .click();
  await expect(page).toHaveURL(calendar);
  await expect(page.getByRole('heading', { name: 'Minha agenda', exact: true })).toBeVisible();
  await expect(page.locator('.gf-agenda-row')).toHaveCount(2);
  await expect(
    page.locator('.gf-agenda-row').filter({ hasText: 'Cliente Cancelado' }),
  ).toContainText('Cancelado');
  await expect(page.locator('.gf-agenda-row').filter({ hasText: 'Cliente Ausente' })).toContainText(
    'Não compareceu',
  );
  await page.getByLabel('Status', { exact: true }).selectOption('cancelled');
  await expect(page.locator('.gf-agenda-row')).toHaveCount(1);
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await page.getByLabel('Profissional', { exact: true }).selectOption(cid + '-p2');
  await expect(
    page.getByRole('heading', { name: 'Nenhum atendimento neste período' }),
  ).toBeVisible();
  await page.getByLabel('Profissional', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/gradefy-agenda-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await page.getByRole('button', { name: /Ver atendimento de Cliente Cancelado/ }).click();
  await expect(dialog(page)).toContainText('fixture@example.com');
  await expect(dialog(page)).toContainText('Observação da reserva');
  await expect(dialog(page).getByRole('button', { name: 'Reagendar', exact: true })).toHaveCount(0);
  await expect(
    dialog(page).getByRole('button', { name: 'Concluir atendimento', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel('Empresa', { exact: true }).selectOption('agenda-browser-b');
  await expect(page.locator('.gf-agenda-row')).toContainText('Cliente Privado B');
  await expect(page.locator('body')).not.toContainText('Cliente Cancelado');
  const foreign = await page.request.get('/api/admin/agenda/agenda-browser-past', {
    headers: { 'X-Gradefy-Company-Id': 'agenda-browser-b' },
  });
  expect(foreign.status()).toBe(404);
  await page.goto('/app/agenda?empresa=igor-barber-club');
  await expect(page.getByRole('alert')).toContainText('Sem acesso à empresa selecionada');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('manual creation survives a lost response, then reschedule/cancel retain history and dashboard links work', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/dashboard?empresa=' + cid);
  await page
    .getByRole('link', { name: 'Novo agendamento Registrar atendimento', exact: true })
    .click();
  await expect(dialog(page).getByRole('heading', { name: 'Novo agendamento' })).toBeVisible();
  const snapshot = await (await page.request.get('/api/admin/agenda', { headers })).json();
  const date = dayAfter(snapshot.today, 3),
    name = 'Reserva Manual Navegador';
  await page.getByLabel('Nome e sobrenome').fill(name);
  await page.getByLabel('Telefone', { exact: true }).fill('21999997777');
  await page.getByLabel('E-mail', { exact: true }).fill('manual-browser@example.com');
  await page.getByLabel('Serviço', { exact: true }).selectOption(cid + '-service');
  await dialog(page)
    .getByLabel('Profissional', { exact: true })
    .selectOption(cid + '-p1');
  await page.getByLabel('Data do atendimento').fill(date);
  await expect(dialog(page).getByRole('button', { name: '11:40', exact: true })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: '12:00', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: '14:00', exact: true }).click();
  await page.getByLabel('Observações (opcional)').fill('Cliente sem cadastro.');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/gradefy-agenda-form-${width}.png`,
        fullPage: true,
      });
  }
  let applied;
  const keys = [];
  await page.route('**/api/admin/agenda', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    applied = await response.json();
    if (keys.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.unroute('**/api/admin/agenda');
  const listed = await (
    await page.request.get('/api/admin/agenda?from=' + date, { headers })
  ).json();
  expect(listed.items.filter((a) => a.clientName === name)).toHaveLength(1);
  await page.getByLabel('Data da agenda').fill(date);
  await page.getByRole('button', { name: new RegExp('Ver atendimento de ' + name) }).click();
  await expect(dialog(page)).toContainText('Cliente sem cadastro.');
  await expect(
    dialog(page).getByRole('button', { name: 'Concluir atendimento', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Reagendar', exact: true }).click();
  await dialog(page)
    .getByLabel('Profissional', { exact: true })
    .selectOption(cid + '-p2');
  await dialog(page).getByRole('button', { name: '14:40', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page
    .getByRole('button', { name: new RegExp('Ver atendimento de ' + name + ' às 14:40') })
    .click();
  await expect(dialog(page)).toContainText('Bruno Agenda');
  await expect(dialog(page)).toContainText('R$ 45,00');
  await page.getByRole('button', { name: 'Cancelar agendamento', exact: true }).click();
  await expect(dialog(page)).toContainText('Cancelar este agendamento?');
  await page.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.gf-agenda-row').filter({ hasText: name })).toContainText('Cancelado');
  const detail = await (
    await page.request.get('/api/admin/agenda/' + applied.id, { headers })
  ).json();
  expect(detail.item.id).toBe(applied.id);
  expect(detail.item.client_email).toBe('manual-browser@example.com');
  expect(detail.item.status).toBe('cancelled');
  expect(detail.item.total).toBe(4500);
});

test('completion updates dashboard without payments; session and load failures never expose company data', async ({
  page,
}) => {
  await login(page);
  await page.goto(calendar + '&atendimento=agenda-browser-past');
  await expect(dialog(page).getByRole('button', { name: 'Reagendar', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir atendimento', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('não foi registrado pagamento');
  await page.goto('/app/dashboard?empresa=' + cid);
  await expect(
    page
      .locator('.gf-dashboard-metric')
      .filter({ hasText: 'Atendimentos concluídos' })
      .locator('strong'),
  ).toHaveText('1');
  await page.getByRole('link', { name: 'Corte Agenda Rafael Agenda', exact: true }).click();
  await expect(dialog(page)).toContainText('Cliente Retorno');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.route('**/api/admin/agenda?**', (route) => route.abort('failed'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar a agenda' }),
  ).toBeVisible();
  await expect(page.locator('.gf-agenda-row')).toHaveCount(0);
  await page.unroute('**/api/admin/agenda?**');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.gf-agenda-row')).toHaveCount(2);
  await page.route('**/api/admin/agenda?**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sessão expirada.' } }),
  );
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Atualizar agenda', exact: true }).click();
  await expect(page).toHaveURL('/app/login');
});

test('professional and anonymous users cannot manage agenda', async ({ page }) => {
  await page.goto(calendar);
  await expect(page).toHaveURL('/app/login');
  await login(page, 'professional');
  await page.goto(calendar);
  await expect(page.getByRole('heading', { name: 'Seu vínculo está pendente' })).toBeVisible();
  expect((await page.request.get('/api/admin/agenda', { headers })).status()).toBe(403);
  await expect(page.locator('.gf-agenda-row')).toHaveCount(0);
});

test('a newly occupied slot produces a clear conflict and permits choosing another real slot', async ({
  page,
}) => {
  await login(page);
  await page.goto(calendar + '&novo=1');
  const today = (await (await page.request.get('/api/admin/agenda', { headers })).json()).today;
  const date = dayAfter(today, 5),
    guest = {
      name: 'Cliente Conflito',
      email: 'conflict-browser@example.com',
      phone: '21999997777',
    };
  await dialog(page).getByLabel('Nome e sobrenome').fill(guest.name);
  await dialog(page).getByLabel('Telefone', { exact: true }).fill(guest.phone);
  await dialog(page).getByLabel('E-mail', { exact: true }).fill(guest.email);
  await dialog(page)
    .getByLabel('Serviço', { exact: true })
    .selectOption(cid + '-service');
  await dialog(page)
    .getByLabel('Profissional', { exact: true })
    .selectOption(cid + '-p1');
  await dialog(page).getByLabel('Data do atendimento').fill(date);
  await dialog(page).getByRole('button', { name: '14:00', exact: true }).click();
  const taken = await page.request.post('/api/admin/agenda', {
    headers: { ...headers, 'Idempotency-Key': 'browser-conflict-occupy' },
    data: { services: [cid + '-service'], barberId: cid + '-p1', date, time: '14:00', guest },
  });
  expect(taken.status()).toBe(201);
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'horário acabou de ficar indisponível',
  );
  await expect(dialog(page).getByRole('button', { name: '14:00', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: '14:40', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const rows = (
    await (await page.request.get('/api/admin/agenda?from=' + date, { headers })).json()
  ).items;
  expect(rows.filter((a) => a.clientName === guest.name)).toHaveLength(2);
});
