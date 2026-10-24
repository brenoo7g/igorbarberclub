import { test, expect } from '@playwright/test';
import { registerMiniCustomer } from '../helpers/minisite-client-browser.js';

async function login(page, email) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}

async function captureResponsive(page, area) {
  for (const [width, height] of [
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1672, 941],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 1672)
      await page.screenshot({ path: `test-results/gradefy-${area}-real-1672x941.png` });
  }
  await page.setViewportSize({ width: 1338, height: 753 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1338,
    height: 753,
    deviceScaleFactor: 1.25,
    mobile: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1338);
  await page.screenshot({ path: `test-results/gradefy-${area}-125-percent.png` });
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function captureMobile(page, area) {
  for (const width of [320, 360, 390, 428, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 390)
      await page.screenshot({ path: `test-results/gradefy-${area}-mobile-390x844.png` });
  }
}

test('Agenda desktop renders authorized real summaries, dates and an empty period', async ({
  page,
}) => {
  await login(page, 'agenda-browser-owner@example.com');
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/app/agenda?empresa=agenda-browser-a');
  const api = await (
    await page.request.get('/api/admin/agenda', {
      headers: { 'X-Gradefy-Company-Id': 'agenda-browser-a' },
    })
  ).json();
  await expect(page.locator('.gf-agenda-summary')).toContainText(String(api.total));
  await expect(page.locator('.gf-agenda-status-detail')).toContainText(
    `Não compareceu ${api.statusCounts['no-show'] || 0}`,
  );
  await expect(page.locator('.gf-agenda-summary-grid > div').nth(3).locator('strong')).toHaveText(
    String(api.statusCounts.cancelled || 0),
  );
  await expect(page.locator('.gf-agenda-team h2')).toHaveText('Equipe do período');
  await expect(page.locator('.gf-agenda-row')).toHaveCount(api.items.length);
  await page.getByLabel('Status', { exact: true }).selectOption('no-show');
  await expect(page.locator('.gf-agenda-summary-grid > div').first().locator('strong')).toHaveText(
    String(api.statusCounts['no-show'] || 0),
  );
  await expect(page.locator('.gf-agenda-summary-grid > div').nth(3).locator('strong')).toHaveText(
    '0',
  );
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await expect(page.locator('.gf-agenda-row')).toHaveCount(api.items.length);
  await captureResponsive(page, 'agenda');
  await captureMobile(page, 'agenda');
  const emptyDate = new Date(Date.parse(api.today + 'T12:00:00Z') + 120 * 86400000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel('Data da agenda').fill(emptyDate);
  await expect(
    page.getByRole('heading', { name: 'Nenhum atendimento neste período' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.screenshot({ path: 'test-results/gradefy-agenda-empty-1672x941.png' });
});

test('Clients desktop renders real client counts and scoped empty state', async ({ page }) => {
  await login(page, 'business-browser-owner@example.com');
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/app/clientes?empresa=business-browser-team');
  const api = await (
    await page.request.get('/api/admin/clients', {
      headers: { 'X-Gradefy-Company-Id': 'business-browser-team' },
    })
  ).json();
  await expect(page.locator('.gf-client-kpis')).toContainText(String(api.stats.registered));
  await expect(page.locator('.gf-client-table tbody tr')).toHaveCount(api.items.length);
  expect(
    await page.getByRole('searchbox', { name: 'Busca rápida no cabeçalho' }).evaluate((input) => {
      const style = getComputedStyle(input.parentElement);
      return style.borderTopStyle === 'solid' && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    }),
  ).toBe(true);
  await page.getByRole('searchbox', { name: 'Busca rápida no cabeçalho' }).fill('Ana');
  await expect(page.locator('.gf-client-table tbody tr')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Busca rápida no cabeçalho' }).fill('');
  await expect(page.locator('.gf-client-table tbody tr')).toHaveCount(api.items.length);
  await page.getByRole('button', { name: 'Buscar cadastro' }).click();
  await expect(page.getByLabel('Buscar por nome, telefone ou e-mail')).toBeFocused();
  await captureResponsive(page, 'clients');
  await captureMobile(page, 'clients');
  await page.getByLabel('Buscar por nome, telefone ou e-mail').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Atualizar cadastros' })).toBeFocused();
  expect(
    await page
      .getByRole('button', { name: 'Atualizar cadastros' })
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.setViewportSize({ width: 1672, height: 941 });
  const actions = page.getByRole('button', { name: 'Ações de Ana Martins' });
  await actions.click();
  await expect(page.getByRole('menu', { name: 'Ações de Ana Martins' })).toBeVisible();
  await expect(page.locator('.gf-client-selected')).toContainText('Ana Martins');
  await page.screenshot({ path: 'test-results/gradefy-clients-menu-1672x941.png' });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Editar dados' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Ver detalhes e histórico' }).click();
  await expect(page.getByRole('dialog')).toContainText('Histórico de atendimentos');
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Abrir conversa no WhatsApp' }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\/55/);
  await page.screenshot({ path: 'test-results/gradefy-clients-detail-1672x941.png' });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Editar dados' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar cliente' })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Nome', { exact: true })).toHaveValue(
    'Ana Martins',
  );
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await expect(page.locator('.gf-client-table tbody tr')).toHaveCount(0);
  await expect(page.locator('.gf-client-kpis')).toContainText('0');
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.screenshot({ path: 'test-results/gradefy-clients-empty-1672x941.png' });
});

test('controlled visual fixture shows a dense Agenda without writing to the database', async ({
  page,
}) => {
  await login(page, 'agenda-browser-owner@example.com');
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.route('**/api/admin/agenda?**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (data.company?.id !== 'agenda-browser-a') return route.fulfill({ response });
    const names = [
      'Gabriel Almeida',
      'Lucas Ferreira',
      'Matheus Silva',
      'Rafael Costa',
      'Diego Henrique',
      'Carlos Mendes',
      'Fernanda Oliveira',
      'João Victor',
    ];
    const times = ['09:00', '10:00', '11:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
    const items = names.map((clientName, index) => ({
      id: `visual-only-${index}`,
      date: data.today,
      time: times[index],
      barberId: data.professionals[index % data.professionals.length].id,
      professionalName: data.professionals[index % data.professionals.length].name,
      clientName,
      duration: 40,
      totalCents: 4500,
      status: index < 5 ? 'confirmed' : index < 7 ? 'completed' : 'cancelled',
      services: [{ id: 'visual-only-service', name: 'Corte', price: 4500, duration: 40 }],
    }));
    await route.fulfill({
      response,
      json: {
        ...data,
        now: data.today + 'T10:00:00.000Z',
        from: data.today,
        to: data.today,
        total: items.length,
        items,
        statusCounts: { confirmed: 5, completed: 2, cancelled: 1 },
        blocks: [
          {
            id: 'visual-only-break',
            date: data.today,
            startMinute: 640,
            endMinute: 660,
            reason: 'Bloqueio operacional',
            professionalName: 'Rafael Agenda',
          },
        ],
      },
    });
  });
  await page.goto('/app/agenda?empresa=agenda-browser-a');
  await expect(page.locator('.gf-agenda-row')).toHaveCount(8);
  const simultaneous = await page
    .locator('.gf-agenda-row')
    .filter({ has: page.locator('time') })
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.querySelector('time')?.textContent?.startsWith('11:00'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }),
    );
  expect(simultaneous).toHaveLength(2);
  expect(simultaneous[0].right).toBeLessThanOrEqual(simultaneous[1].left);
  expect(
    await page
      .locator('.gf-agenda-row')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(90);
  await expect(page.locator('.gf-agenda-block-row:not(.gf-agenda-recurring-break)')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/gradefy-agenda-controlled-fixture-1672x941.png' });
});

test('controlled visual fixture shows a dense client table without writing to the database', async ({
  page,
}) => {
  await login(page, 'business-browser-owner@example.com');
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.route('**/api/admin/clients?**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (route.request().headers()['x-gradefy-company-id'] !== 'business-browser-team')
      return route.fulfill({ response });
    const names = [
      'Gabriel Almeida',
      'Lucas Ferreira',
      'Matheus da Silva Oliveira',
      'Rafael Costa',
      'Diego Henrique',
      'Carlos Mendes',
      'Fernanda Oliveira',
      'Amanda Oliveira',
      'Vinícius Martins',
      'João Victor',
    ];
    const items = Array.from({ length: 30 }, (_, index) => ({
      id: `visual-client-${index}`,
      name:
        index === 10
          ? 'Bruno Pereira'
          : names[index % names.length] + (index >= 10 ? ` ${Math.floor(index / 10) + 1}` : ''),
      phone: `2199${String(1000000 + index).padStart(7, '0')}`,
      email: index % 7 === 0 ? null : `cliente${index}@example.test`,
      version: 1,
      created_at: '2026-10-10T12:00:00.000Z',
    }));
    await route.fulfill({
      response,
      json: {
        ...data,
        items,
        total: 44,
        pageSize: 30,
        stats: { registered: 44, newThisMonth: 8, futureClients: 12, completedVisits: 84 },
      },
    });
  });
  await page.goto('/app/clientes?empresa=business-browser-team');
  await expect(page.locator('.gf-client-table tbody tr')).toHaveCount(30);
  await expect(page.getByRole('heading', { name: 'Gabriel Almeida', exact: true })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Páginas' })).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-clients-controlled-fixture-1672x941.png' });
});

test('Agenda block modal and real cancellation preview remain usable on desktop', async ({
  page,
  browser,
}) => {
  const customer = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    await registerMiniCustomer(customer);
    const schedule = await (
      await customer.request.get('/api/public/minisite-browser/barbers/minisite-person/schedule')
    ).json();
    const date = schedule.dates.find(
      (day) => day > new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    );
    expect(date).toBeTruthy();
    expect(
      (
        await customer.request.post('/api/public/minisite-browser/appointments', {
          data: {
            services: ['minisite-service'],
            barberId: 'minisite-person',
            date,
            time: '09:00',
            expectedTotal: 3500,
            expectedDuration: 40,
          },
        })
      ).status(),
    ).toBe(201);
    await login(page, 'minisite-owner@example.com');
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto('/app/agenda?empresa=minisite-browser');
    await page.getByRole('button', { name: 'Bloquear agenda', exact: true }).click();
    await page.getByLabel('Profissional do bloqueio').selectOption('minisite-person');
    await page.getByLabel('Data inicial do bloqueio').fill(date);
    await page.getByLabel('Início do bloqueio pessoal', { exact: true }).fill('09:20');
    await page.getByLabel('Fim do bloqueio pessoal', { exact: true }).fill('09:30');
    await page.screenshot({ path: 'test-results/gradefy-agenda-block-modal-1672x941.png' });
    await page.getByRole('button', { name: 'Revisar bloqueio', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Confirmar bloqueio e cancelamentos' });
    await expect(preview).toContainText('1 agendamento(s) afetado(s).');
    await expect(preview).toContainText('Cliente Mini Site');
    await preview.getByLabel('Motivo público do cancelamento').selectOption('other');
    await preview.getByLabel('Descreva o motivo público', { exact: true }).fill('Teste visual');
    await preview
      .getByLabel('Observações internas (não enviadas ao cliente)')
      .fill('Observação mantida somente na gestão');
    await page.screenshot({ path: 'test-results/gradefy-agenda-block-preview-1672x941.png' });
    await preview.getByRole('button', { name: 'Desistir', exact: true }).click();
    await expect(preview).toHaveCount(0);
  } finally {
    await customer.close();
  }
});
