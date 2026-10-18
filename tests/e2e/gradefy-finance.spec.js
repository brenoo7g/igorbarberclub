import { test, expect } from '@playwright/test';
const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid },
  dialog = (page) => page.getByRole('dialog');
async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  const authenticated = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await authenticated).status()).toBe(200);
  await expect(page).toHaveURL('/app/dashboard');
}
async function responsive(page, name, modal = false) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (modal)
      expect(await dialog(page).evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/finance-${name}-${width}.png`, fullPage: true });
  }
}
const metric = (page, label) =>
  page
    .locator('.gf-finance-metrics .gf-card')
    .filter({ has: page.getByRole('heading', { name: label, exact: true }) })
    .locator('strong');
test('manual partial/full receipts, lost response replay, audit reversal and real navigation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/app/dashboard?empresa=' + cid);
  await page
    .locator('.gf-dashboard-quick')
    .getByRole('link', { name: 'Financeiro Abrir gestão', exact: true })
    .click();
  await expect(page).toHaveURL('/app/financeiro?empresa=' + cid);
  await expect(metric(page, 'Pagamentos recebidos')).toHaveText('R$ 0,00');
  await expect(
    page.getByRole('heading', { name: 'Nenhuma movimentação neste período' }),
  ).toBeVisible();
  await responsive(page, 'overview');
  await page.goto('/app/agenda?empresa=' + cid + '&atendimento=business-browser-completed');
  await expect(dialog(page)).toContainText('Nenhum pagamento registrado.');
  await dialog(page).getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  await dialog(page).getByLabel('Valor recebido (R$)').fill('15,00');
  await dialog(page)
    .getByLabel('Observação do recebimento (opcional)')
    .fill('Pagamento parcial em teste.');
  await responsive(page, 'payment-form', true);
  await dialog(page).getByRole('button', { name: 'Salvar recebimento manual' }).click();
  await expect(dialog(page).locator('dl.gf-finance-balances')).toContainText('R$ 30,00');
  await expect(dialog(page).locator('.gf-finance-payment-row')).toHaveCount(1);
  await page.reload();
  await expect(dialog(page).locator('.gf-finance-payment-row')).toHaveCount(1);
  await dialog(page).getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  const attempts = [];
  const route = '**/api/admin/finance/payments';
  await page.route(route, async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    attempts.push(r.request().headers()['idempotency-key']);
    await r.fetch();
    await r.abort('failed');
  });
  await dialog(page).getByRole('button', { name: 'Salvar recebimento manual' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('conectar ao servidor');
  await page.unroute(route);
  const created = await (
    await page.request.get('/api/admin/finance/appointments/business-browser-completed', {
      headers,
    })
  ).json();
  expect(created.receivedCents).toBe(4500);
  expect(created.items).toHaveLength(2);
  await page.route(route, async (r) => {
    attempts.push(r.request().headers()['idempotency-key']);
    await r.continue();
  });
  await dialog(page).getByRole('button', { name: 'Salvar recebimento manual' }).click();
  await expect(dialog(page).locator('.gf-finance-payment-row')).toHaveCount(2);
  expect(attempts[0]).toBe(attempts[1]);
  await page.unroute(route);
  const partial = dialog(page)
    .locator('.gf-finance-payment-row')
    .filter({ hasText: 'Pagamento parcial em teste.' });
  await partial.getByRole('button', { name: 'Estornar registro' }).click();
  await dialog(page).getByLabel('Motivo do estorno').fill('Correção do recebimento parcial');
  await dialog(page).getByRole('button', { name: 'Confirmar estorno', exact: true }).click();
  await expect(dialog(page)).toContainText('Estornado no registro');
  const history = await (
    await page.request.get('/api/admin/finance/appointments/business-browser-completed', {
      headers,
    })
  ).json();
  expect(history.receivedCents).toBe(3000);
  expect(history.remainingCents).toBe(1500);
  expect(history.appointment.status).toBe('completed');
  expect(
    (
      await page.request.get('/api/admin/finance/appointments/business-browser-completed', {
        headers: { 'X-Gradefy-Company-Id': 'business-browser-one' },
      })
    ).status(),
  ).toBe(404);
  await page.goto('/app/financeiro?empresa=' + cid);
  await expect(metric(page, 'Pagamentos recebidos')).toHaveText('R$ 30,00');
  await page.getByLabel('Tipo de lançamento').selectOption('payments');
  await expect(page.locator('.gf-finance-entry')).toHaveCount(3);
  expect(errors).toEqual([]);
});
test('pending expense, traced edit, manual payment and correction retain cash indicators and responsive history', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/financeiro?empresa=' + cid);
  await page.getByRole('button', { name: 'Nova despesa', exact: true }).click();
  await dialog(page).getByLabel('Descrição da despesa').fill('Materiais Financeiro E2E');
  await dialog(page).getByLabel('Categoria', { exact: true }).selectOption('materials');
  await dialog(page).getByLabel('Valor da despesa (R$)').fill('5,00');
  await responsive(page, 'expense-form', true);
  await dialog(page).getByRole('button', { name: 'Salvar despesa', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(metric(page, 'Despesas pagas')).toHaveText('R$ 0,00');
  const row = page.locator('.gf-finance-entry').filter({ hasText: 'Materiais Financeiro E2E' });
  await row.getByRole('button', { name: 'Ver despesa e histórico' }).click();
  await dialog(page).getByRole('button', { name: 'Editar despesa pendente' }).click();
  await dialog(page).getByLabel('Valor da despesa (R$)').fill('7,00');
  await dialog(page).getByLabel('Motivo da correção').fill('Quantidade da compra revisada');
  await dialog(page).getByRole('button', { name: 'Salvar despesa', exact: true }).click();
  await expect(dialog(page)).toContainText('Antes: Materiais Financeiro E2E · R$ 5,00');
  await dialog(page).getByRole('button', { name: 'Marcar como paga' }).click();
  await dialog(page).getByRole('button', { name: 'Confirmar despesa paga' }).click();
  await expect(dialog(page)).toContainText('Pagamento registrado:');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(metric(page, 'Despesas pagas')).toHaveText('R$ 7,00');
  await expect(metric(page, 'Saldo operacional registrado')).toHaveText('R$ 23,00');
  await row.getByRole('button', { name: 'Ver despesa e histórico' }).click();
  await dialog(page).getByRole('button', { name: 'Anular lançamento', exact: true }).click();
  await dialog(page).getByLabel('Motivo da anulação').fill('Pagamento lançado incorretamente');
  await dialog(page).getByRole('button', { name: 'Confirmar anulação' }).click();
  await expect(dialog(page)).toContainText('Anulada');
  await expect(dialog(page).locator('.gf-finance-audit')).toHaveCount(4);
  await responsive(page, 'expense-history', true);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(metric(page, 'Despesas pagas')).toHaveText('R$ 0,00');
  await expect(metric(page, 'Saldo operacional registrado')).toHaveText('R$ 30,00');
});
test('cancelled appointment keeps its payment; network recovery, company switch and expired session are safe', async ({
  page,
}) => {
  await login(page);
  const agenda = await (await page.request.get('/api/admin/agenda', { headers })).json(),
    date = new Date(Date.parse(agenda.today + 'T12:00Z') + 6 * 86400000).toISOString().slice(0, 10);
  const booked = await page.request.post('/api/admin/agenda', {
    headers: { ...headers, 'Idempotency-Key': 'finance-e2e-cancel-book' },
    data: {
      date,
      time: '09:00',
      barberId: cid + '-pro',
      services: [cid + '-service'],
      guest: {
        name: 'Cliente Financeiro Cancelamento',
        phone: '21977776666',
        email: 'finance-cancel@example.test',
      },
    },
  });
  expect(booked.status()).toBe(201);
  const item = await booked.json();
  await page.goto('/app/agenda?empresa=' + cid + '&atendimento=' + item.id);
  await dialog(page).getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
  await dialog(page).getByLabel('Valor recebido (R$)').fill('10,00');
  await dialog(page).getByRole('button', { name: 'Salvar recebimento manual' }).click();
  await expect(dialog(page).locator('.gf-finance-payment-row')).toHaveCount(1);
  await dialog(page).getByRole('button', { name: 'Cancelar agendamento', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.goto('/app/financeiro?empresa=' + cid + '&atendimento=' + item.id);
  await expect(dialog(page)).toContainText('R$ 10,00');
  await expect(
    dialog(page).getByRole('button', { name: 'Registrar recebimento', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.route('**/api/admin/finance?*', (r) => r.abort('failed'));
  await page.getByRole('button', { name: 'Atualizar financeiro' }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await page.unroute('**/api/admin/finance?*');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(metric(page, 'Pagamentos recebidos')).toHaveText('R$ 40,00');
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await expect(metric(page, 'Pagamentos recebidos')).toHaveText('R$ 0,00');
  await expect(page.locator('.gf-finance-entry')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await page.request.post('/api/auth/logout');
  await page.goto('/app/financeiro?empresa=' + cid);
  await expect(page).toHaveURL(/\/app\/login/);
});
