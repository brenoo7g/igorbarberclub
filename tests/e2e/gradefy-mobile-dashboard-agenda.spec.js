import { test, expect } from '@playwright/test';
import {
  presentationDashboard,
  presentationReport,
  presentationNotifications,
} from './fixtures/dashboard-presentation.js';

async function login(page, email) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}

async function noGlobalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize().width,
  );
}

const mobileNav = (page) => page.getByRole('navigation', { name: 'Navegação principal' });

test('Dashboard mobile usa dados reais, fixture isolada, cinco destinos e estados vazios', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'dashboard-owner@example.com');
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await expect(page.locator('.gf-dashboard-kpis')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-dashboard-real-390x844.png' });
  for (const [pattern, create] of [
    ['**/api/dashboard?**', presentationDashboard],
    ['**/api/admin/reports?**', presentationReport],
    ['**/api/admin/email-notifications', presentationNotifications],
  ]) {
    await page.route(pattern, async (route) => {
      if (route.request().headers()['x-gradefy-company-id'] !== 'dashboard-horizonte')
        return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json: create(await response.json()) });
    });
  }
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await expect(page.locator('.gf-dashboard-kpis')).toContainText('Recebimentos do mês');
  await expect(page.locator('.gf-day-appointment')).toHaveCount(7);
  await expect(page.locator('.gf-mobile-notifications')).toContainText('Confirmação de reserva');
  await expect(mobileNav(page).locator('a')).toHaveCount(5);
  await expect(mobileNav(page).locator('a')).toHaveText([
    'Dashboard',
    'Agenda',
    'Clientes',
    'Pagamentos',
    'Perfil',
  ]);
  await expect(mobileNav(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const [width, height] of [
    [312, 675],
    [320, 720],
    [360, 800],
    [375, 812],
    [390, 844],
    [428, 926],
    [740, 390],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await noGlobalOverflow(page);
    if ([312, 320, 360, 375, 390, 428].includes(width)) {
      await page.locator('body').click({ position: { x: 4, y: 4 } });
      await page.screenshot({
        path: `test-results/mobile-dashboard-fixture-${width}x${height}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const companySelector = page.getByLabel('Empresa', { exact: true });
  await expect(companySelector.locator('option')).toHaveCount(4);
  await companySelector.focus();
  await page.screenshot({ path: 'test-results/mobile-r1-dashboard-company-selector-390x844.png' });
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await mobileNav(page).getByRole('link', { name: 'Agenda' }).focus();
  await page.keyboard.press('Tab');
  await expect(mobileNav(page).getByRole('link', { name: 'Clientes' })).toBeFocused();
  await page.screenshot({ path: 'test-results/mobile-r1-navbar-keyboard-focus-390x844.png' });
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.locator('.gf-dashboard-agenda').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-r1-dashboard-agenda-390x844.png' });
  await page.locator('.gf-mobile-revenue').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-dashboard-finance-390x844.png' });
  await page.locator('.gf-mobile-notifications').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-dashboard-notifications-390x844.png' });
  await page.unrouteAll();
  await page.goto('/app/dashboard?empresa=dashboard-vazio');
  await expect(page.locator('.gf-dashboard-empty')).toContainText('Nenhum agendamento');
  await page.screenshot({ path: 'test-results/mobile-dashboard-empty-390x844.png' });
  await page.goto('/app/agenda?empresa=dashboard-vazio');
  await expect(page.locator('.gf-agenda-readonly')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Novo agendamento', exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Bloquear agenda', exact: true }).first(),
  ).toBeDisabled();
  await page.screenshot({ path: 'test-results/mobile-r1-agenda-readonly-390x844.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: 'test-results/mobile-r1-agenda-bottom-390x844.png' });
  await mobileNav(page).getByRole('link', { name: 'Perfil' }).click();
  await expect(page).toHaveURL(/\/app\/conta\?empresa=dashboard-vazio/);
  await expect(mobileNav(page).getByRole('link', { name: 'Perfil' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('navigation', { name: 'Outras áreas da empresa' })).toContainText(
    'Configurações',
  );
  await page.screenshot({ path: 'test-results/mobile-nav-profile-390x844.png' });
  for (const [label, path] of [
    ['Dashboard', '/app/dashboard'],
    ['Agenda', '/app/agenda'],
    ['Clientes', '/app/clientes'],
    ['Pagamentos', '/app/financeiro'],
  ]) {
    await mobileNav(page).getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(
      new RegExp(path.replaceAll('/', '\\/') + '\\?empresa=dashboard-vazio'),
    );
    await expect(mobileNav(page).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await noGlobalOverflow(page);
    await page.screenshot({ path: `test-results/mobile-nav-${label.toLowerCase()}-390x844.png` });
  }
});

test('Agenda mobile mantém horários reais, colisões, filtros, modais e desktop', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'agenda-browser-owner@example.com');
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
      'Amanda Souza',
    ];
    const times = ['09:00', '10:00', '10:00', '11:30', '14:00', '15:00'];
    const statuses = ['confirmed', 'completed', 'confirmed', 'cancelled', 'no-show', 'confirmed'];
    const items = names.map((clientName, index) => ({
      id: `visual-only-mobile-${index}`,
      date: data.today,
      time: times[index],
      barberId: data.professionals[index % data.professionals.length].id,
      professionalName: data.professionals[index % data.professionals.length].name,
      clientName,
      duration: 40,
      totalCents: 4500,
      status: statuses[index],
      services: [{ id: 'visual-mobile-service', name: 'Corte', price: 4500, duration: 40 }],
    }));
    await route.fulfill({
      response,
      json: {
        ...data,
        items,
        total: items.length,
        statusCounts: { confirmed: 3, completed: 1, cancelled: 1, 'no-show': 1 },
        blocks: [
          {
            id: 'visual-mobile-block',
            date: data.today,
            startMinute: 720,
            endMinute: 750,
            reason: 'Bloqueio operacional',
            professionalName: data.professionals[0].name,
          },
        ],
        recurringBreaks: [
          {
            date: data.today,
            barberId: data.professionals[0].id,
            startMinute: 780,
            endMinute: 810,
            professionalName: data.professionals[0].name,
          },
        ],
      },
    });
  });
  await page.goto('/app/agenda?empresa=agenda-browser-a');
  await expect(page.locator('.gf-agenda-row')).toHaveCount(6);
  await expect(mobileNav(page).getByRole('link', { name: 'Agenda' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.gf-agenda-range')).toContainText(' a ');
  await page.getByRole('button', { name: 'Dia', exact: true }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.locator('.gf-agenda-row')).toHaveCount(6);
  await expect(page.locator('.gf-agenda-recurring-break')).toHaveCount(1);
  await expect(page.locator('.gf-agenda-block-row:not(.gf-agenda-recurring-break)')).toHaveCount(1);
  const simultaneous = await page
    .locator('.gf-agenda-row')
    .filter({ hasText: '10:00' })
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        left: node.getBoundingClientRect().left,
        right: node.getBoundingClientRect().right,
        top: node.getBoundingClientRect().top,
      })),
    );
  expect(simultaneous).toHaveLength(2);
  expect(simultaneous[0].top).toBe(simultaneous[1].top);
  expect(simultaneous[0].right).toBeLessThanOrEqual(simultaneous[1].left);
  for (const [width, height] of [
    [312, 675],
    [320, 720],
    [360, 800],
    [390, 844],
    [428, 926],
    [740, 390],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await noGlobalOverflow(page);
    if (width <= 428) {
      const dateNav = await page.locator('.gf-agenda-date-nav').boundingBox();
      const viewSwitch = await page.locator('.gf-agenda-views').boundingBox();
      expect(dateNav.x + dateNav.width).toBeLessThanOrEqual(viewSwitch.x + 1);
    }
    if ([312, 320, 360, 390, 428].includes(width))
      await page.screenshot({ path: `test-results/mobile-agenda-fixture-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.gf-agenda-mobile-search-row input').focus();
  await expect(mobileNav(page)).toBeHidden();
  await page.screenshot({ path: 'test-results/mobile-r1-agenda-search-focus-390x844.png' });
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await expect(mobileNav(page)).toBeVisible();
  await page.locator('.gf-agenda-row').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-agenda-timeline-390x844.png' });
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByLabel('Profissional', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-agenda-filters-390x844.png' });
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByRole('button', { name: 'Novo agendamento', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-agenda-create-390x844.png' });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear agenda', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Bloquear agenda');
  await page.screenshot({ path: 'test-results/mobile-agenda-block-390x844.png' });
  await page.getByLabel('Profissional do bloqueio').selectOption('agenda-browser-a-p1');
  await page.getByRole('button', { name: 'Revisar bloqueio', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Confirmar bloqueio e cancelamentos' });
  await expect(preview).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-agenda-block-preview-390x844.png' });
  await preview.getByRole('button', { name: 'Desistir', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.unrouteAll();
  await page.goto('/app/agenda?empresa=agenda-browser-a&atendimento=agenda-browser-cancel');
  await expect(page.getByRole('dialog')).toContainText('Cliente Cancelado');
  await page.screenshot({ path: 'test-results/mobile-agenda-detail-390x844.png' });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  const response = await page.request.get('/api/admin/agenda', {
    headers: { 'X-Gradefy-Company-Id': 'agenda-browser-a' },
  });
  const today = (await response.json()).today;
  const firstFutureDay = Date.parse(today + 'T12:00:00Z') + 120 * 86400000;
  const daysUntilSunday = (7 - new Date(firstFutureDay).getUTCDay()) % 7;
  const emptyDate = new Date(firstFutureDay + daysUntilSunday * 86400000)
    .toISOString()
    .slice(0, 10);
  await page.route('**/api/admin/agenda?**', async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    if (snapshot.from !== emptyDate) return route.fulfill({ response });
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        items: [],
        blocks: [],
        recurringBreaks: [],
        total: 0,
        statusCounts: { confirmed: 0, completed: 0, cancelled: 0, 'no-show': 0 },
      },
    });
  });
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByLabel('Data da agenda').fill(emptyDate);
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Nenhum atendimento neste período' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-agenda-empty-390x844.png' });
  await page.setViewportSize({ width: 1672, height: 941 });
  await noGlobalOverflow(page);
  await expect(page.locator('.gf-business-nav-desktop')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-phase-agenda-desktop-1672x941.png' });
});
