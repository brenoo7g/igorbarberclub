import { test, expect } from '@playwright/test';

test('admin duration changes drive customer time options and actual calendar intervals', async ({
  page,
}) => {
  await page.goto('/admin/servicos');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
  await page.getByLabel('Nome do serviço').fill('Duração adaptativa E2E');
  await page.getByLabel('Descrição').fill('Verificação de intervalos pela duração');
  await page.getByLabel('Duração (min)').fill('30');
  await page.getByLabel('Preço (R$)').fill('40');
  await page.getByLabel('Categoria', { exact: true }).fill('Teste');
  await page.getByRole('button', { name: 'Salvar serviço' }).click();
  await page.getByRole('button', { name: 'Editar Duração adaptativa E2E' }).click();
  await page.getByLabel('Duração (min)').fill('40');
  await page.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect(
    page.locator('.admin-service-row').filter({ hasText: 'Duração adaptativa E2E' }),
  ).toContainText('40 min');
  const service = (await (await page.request.get('/api/services')).json()).find(
    (s) => s.name === 'Duração adaptativa E2E',
  );
  const date = new Date();
  date.setDate(date.getDate() + 50);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  const day = date.toISOString().slice(0, 10);
  let reservation;
  try {
    await page.goto(`/agendar?servico=${service.id}`);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Escolher outra data').fill(day);
    await expect(page.locator('.time-options button').nth(1)).toHaveText('09:40');
    await expect(page.locator('.time-options button').nth(2)).toHaveText('10:20');
    await page.getByRole('button', { name: '10:20', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/appointments') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    reservation = await (await saved).json();
    expect(reservation.end_minute - reservation.start_minute).toBe(40);
    await page.goto('/admin/agenda');
    await page.getByLabel('Data da agenda').fill(day);
    const row = page
      .locator('.appointments-table tbody tr')
      .filter({ hasText: 'Duração adaptativa E2E' });
    await expect(row).toContainText('10:20');
    await expect(row).toContainText('11:00');
  } finally {
    if (reservation?.id) await page.request.patch(`/api/appointments/${reservation.id}/cancel`);
    await page.request.delete(`/api/admin/services/${service.id}`);
  }
});

test('landing page, gallery, mobile navigation and responsive layouts', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await expect(page.locator('.service-card')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Explorar todos os serviços' }).click();
  await expect(page.locator('.service-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Barba', exact: true }).click();
  await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ampliar Barba alinhada' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Serviços', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('customer books multiple services, registers at final step, reschedules and cancels', async ({
  page,
}) => {
  await page.goto('/agendar?servico=corte');
  await expect(page.getByRole('checkbox', { name: /Corte masculino/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Barba completa/ }).check();
  await expect(page.locator('.summary-total')).toContainText('60,00');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const date = new Date();
  date.setDate(date.getDate() + 20);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  const day = date.toISOString().slice(0, 10);
  await page.getByLabel('Escolher outra data').fill(day);
  await page.locator('.time-options button').first().click();
  await page.screenshot({ path: 'test-results/booking-schedule-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/booking-schedule-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Nome completo', { exact: true }).fill('Cliente Navegador');
  await page.getByLabel('E-mail', { exact: true }).fill(`navegador${Date.now()}@example.com`);
  await page.getByLabel('WhatsApp', { exact: true }).fill('21988887777');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteTeste123!');
  await page.getByRole('button', { name: 'Criar conta e continuar' }).click();
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seu horário está na régua.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/booking-confirmed.png', fullPage: true });
  await page.getByRole('link', { name: 'Ver meus agendamentos' }).click();
  await expect(page.locator('.appointment-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Remarcar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(day);
  await page.locator('.time-options button').last().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar remarcação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo horário. Mesmo estilo.' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver meus agendamentos' }).click();
  await page.getByRole('button', { name: 'Cancelar horário', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu próximo estilo está esperando.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('.appointment-card .status')).toHaveText('Cancelado');
});

test('admin login, metrics, calendar views, service CRUD and restricted client access', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('.calendar-cell')).toHaveCount(7);
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(page.locator('.calendar-cell')).toHaveCount(42);
  const freeDate = new Date();
  freeDate.setDate(freeDate.getDate() + 32);
  if (freeDate.getDay() === 0) freeDate.setDate(freeDate.getDate() + 1);
  const freeDay = freeDate.toISOString().slice(0, 10);
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByLabel('Data da agenda').fill(freeDay);
  await page.getByRole('button', { name: 'Bloquear horário', exact: true }).click();
  await page.getByLabel('Início', { exact: true }).fill('12:00');
  await page.getByLabel('Fim', { exact: true }).fill('13:00');
  await page.getByLabel('Motivo', { exact: true }).fill('Almoço E2E');
  await page.getByRole('button', { name: 'Confirmar bloqueio', exact: true }).click();
  await expect(page.locator('.block-row')).toContainText('Almoço E2E');
  await page.getByRole('button', { name: 'Liberar horário', exact: true }).click();
  await expect(page.locator('.block-row')).toHaveCount(0);
  await page.getByRole('link', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
  await page.getByLabel('Nome do serviço').fill('Acabamento E2E');
  await page.getByLabel('Descrição').fill('Serviço para teste funcional');
  await page.getByLabel('Duração (min)').fill('20');
  await page.getByLabel('Preço (R$)').fill('15.50');
  await page.getByLabel('Categoria', { exact: true }).fill('Acabamento');
  await page.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect(page.getByRole('heading', { name: 'Acabamento E2E', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Acabamento E2E' }).click();
  await page.getByLabel('Preço (R$)').fill('20.00');
  await page.getByRole('button', { name: 'Salvar serviço' }).click();
  await expect(
    page.locator('.admin-service-row').filter({ hasText: 'Acabamento E2E' }),
  ).toContainText('20,00');
  await page.getByRole('button', { name: 'Excluir Acabamento E2E' }).click();
  await page.getByRole('button', { name: 'Remover serviço', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acabamento E2E', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Financeiro', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar 14 dias (CSV)' }).click();
  expect((await download).suggestedFilename()).toContain('faturamento');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menu administrativo' }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'O Club nas suas mãos.' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(
    page.getByRole('heading', { name: 'Acesso da administração', exact: true }),
  ).toBeVisible();
});
