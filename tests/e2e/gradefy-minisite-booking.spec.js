import { test, expect } from '@playwright/test';
import { registerMiniCustomer } from '../helpers/minisite-client-browser.js';
test.beforeEach(async ({ page }) => {
  await registerMiniCustomer(page);
});

const base = '/api/public/minisite-browser';
const booking = '/minisite-browser/agendar?servico=minisite-service';
async function futureDate(page) {
  const schedule = await (
    await page.request.get(`${base}/barbers/minisite-person/schedule`)
  ).json();
  return schedule.dates.find((d) => d > new Date(Date.now() + 86400000).toISOString().slice(0, 10));
}
async function chooseSlot(page) {
  const date = await futureDate(page);
  await page.goto(booking);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(date);
  await expect(page.locator('.time-options button').first()).toBeEnabled();
  const slots = await page.locator('.time-options button').allTextContents();
  // Real motor: forty-minute service must fit before lunch and restart at 14:00.
  expect(slots).toContain('11:40');
  expect(slots).not.toContain('12:00');
  expect(slots).not.toContain('12:20');
  expect(slots).toContain('14:00');
  await page.locator('.time-options button').last().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  return date;
}
async function clientReview(page) {
  await expect(page.locator('.client-confirmation')).toContainText('Cliente Mini Site');
  await expect(page.getByRole('button', { name: 'Continuar Sem Login', exact: true })).toHaveCount(
    0,
  );
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('Mini booking: all seven widths, keyboard, selection, compact summary and screenshots', async ({
  page,
}) => {
  test.setTimeout(90000); // Three stages, seven viewports and visual evidence in the same journey.
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(booking);
  await expect(
    page.getByRole('heading', { name: 'Escolha seu serviço', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Remover serviço selecionado' }).click();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  await page.getByRole('radio').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio')).toBeChecked();
  await expect(page.getByRole('radio')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Buscar serviço' }).fill('não existe');
  await expect(page.getByRole('heading', { name: 'Nenhum serviço encontrado' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar serviço' }).fill('');
  await page.getByRole('heading', { name: 'Escolha seu serviço', exact: true }).click();
  for (const width of [320, 360, 390, 428, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await noOverflow(page);
    const button = page.getByRole('button', { name: 'Continuar', exact: true });
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    if (width < 900) {
      await expect(page.locator('.mb-summary-toggle')).toBeVisible();
      await expect(page.locator('.mb-summary-body')).toBeHidden();
    } else {
      await expect(page.locator('.mb-summary-body')).toBeVisible();
    }
    await page.screenshot({
      path: `test-results/minisite-booking-services-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mb-summary-toggle').click();
  await expect(page.locator('.mb-summary-body')).toBeVisible();
  await page.locator('.mb-summary-toggle').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Com quem e quando?' })).toBeFocused();
  await page.getByLabel('Escolher outra data').fill(await futureDate(page));
  await expect(page.locator('.time-options button').first()).toBeEnabled();
  for (const width of [320, 360, 390, 428, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await page.screenshot({
      path: `test-results/minisite-booking-schedule-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator('.time-options button').last().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await clientReview(page);
  for (const width of [320, 360, 390, 428, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await expect(page.locator('.mb-summary-body')).toBeVisible();
  }
  // Simulate the reduced visual area of a virtual keyboard. No fixed overlay covers inputs/actions.
  await page.setViewportSize({ width: 390, height: 390 });
  await page
    .getByRole('button', { name: 'Confirmar agendamento', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Confirmar agendamento', exact: true }),
  ).toBeInViewport();
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/minisite-booking-review-390.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('Mini booking: client response loss retries same persistent key, then reschedule/history/cancel', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    window.bookingScrollBehaviors = [];
    window.scrollTo = (...args) => {
      if (typeof args[0] === 'object') window.bookingScrollBehaviors.push(args[0].behavior);
      original(...args);
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const date = await chooseSlot(page);
  await clientReview(page, 'booking-response-loss@example.com');
  let saved, key;
  await page.route(`**${base}/appointments`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const currentKey = route.request().headers()['idempotency-key'];
    expect(currentKey).toBeTruthy();
    if (!saved) {
      key = currentKey;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      saved = await response.json();
      await route.abort('failed');
    } else {
      expect(currentKey).toBe(key);
      await route.continue();
    }
  });
  try {
    await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
    await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seu horário está confirmado!' })).toBeVisible();
    expect(await page.evaluate(() => window.bookingScrollBehaviors)).not.toContain('smooth');
    expect(await page.evaluate(() => window.bookingScrollBehaviors)).toContain('instant');
    await expect(page.locator('.confirmation-card')).toContainText('R$ 35,00');
    await expect(page.locator('.confirmation-card')).toContainText('40 minutos');
    await page.screenshot({
      path: 'test-results/minisite-booking-success-390.png',
      fullPage: true,
    });
    const appointments = await (await page.request.get(`${base}/appointments`)).json();
    expect(appointments.filter((a) => a.id === saved.id)).toHaveLength(1);
    await page.getByRole('link', { name: 'Ver meus agendamentos', exact: true }).click();
    await page.reload();
    await expect(page.locator('.ms-reservation-card')).toHaveCount(1);
    await page.getByRole('link', { name: 'Remarcar', exact: true }).click();
    await page.getByLabel('Escolher outra data').fill(date);
    await page.locator('.time-options button').first().click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirmar remarcação', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seu horário está confirmado!' })).toBeVisible();
    await page.getByRole('link', { name: 'Ver meus agendamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar horário', exact: true }).click();
    await page.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
    await expect(page.locator('.ms-reservation-card')).toHaveCount(0);
  } finally {
    if (saved) await page.request.patch(`${base}/appointments/${saved.id}/cancel`);
  }
});

test('Mini booking: authenticated reservation and tenant isolation', async ({ page }) => {
  expect(
    (
      await page.request.post(`${base}/auth/login`, {
        data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
      })
    ).status(),
  ).toBe(200);
  await chooseSlot(page);
  await expect(page.locator('.client-confirmation')).toContainText('Gestão Horizonte');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
  let saved;
  try {
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`${base}/appointments`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    saved = await (await response).json();
    await expect(page.getByRole('heading', { name: 'Seu horário está confirmado!' })).toBeVisible();
    expect(saved.user_id).toBe('minisite-owner');
    expect(saved.company_id).toBe('minisite-browser');
    expect((await page.request.get('/api/appointments')).status()).toBe(401);
    expect((await page.request.patch(`/api/appointments/${saved.id}/cancel`)).status()).toBe(401);
  } finally {
    if (saved?.id) await page.request.patch(`${base}/appointments/${saved.id}/cancel`);
  }
});

test('Mini booking: conflict preserves client contacts and returns to real availability', async ({
  page,
  browser,
}) => {
  const date = await chooseSlot(page);
  await clientReview(page, 'booking-conflict@example.com');
  const identity = (await (await page.request.get(`${base}/auth/me`)).json()).user;
  const selectedTime = await page.locator('.mb-summary-meta').textContent();
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  let appointment;
  try {
    await registerMiniCustomer(context, `competitor-${Date.now()}@example.test`);
    const available = await (
      await context.request.get(
        `${base}/availability?date=${date}&barberId=minisite-person&services=minisite-service`,
      )
    ).json();
    const time = available.slots.at(-1);
    expect(selectedTime).toContain(time);
    const created = await context.request.post(`${base}/appointments`, {
      data: {
        services: ['minisite-service'],
        barberId: 'minisite-person',
        date,
        time,
        expectedTotal: 3500,
        expectedDuration: 40,
      },
    });
    expect(created.status()).toBe(201);
    appointment = await created.json();
    await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Com quem e quando?' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
    await expect(page.locator('.time-options')).not.toContainText(time);
    await page.locator('.time-options button').first().click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.locator('.client-confirmation')).toContainText(identity.email);
  } finally {
    if (appointment) await context.request.patch(`${base}/appointments/${appointment.id}/cancel`);
    await context.close();
  }
});

test('Mini booking: real closed day and manual agenda not released have useful messages', async ({
  page,
}) => {
  await page.goto(booking);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay() || 7));
  await page.getByLabel('Escolher outra data').fill(date.toISOString().slice(0, 10));
  await expect(
    page.getByRole('heading', { name: 'Nenhum horário disponível nesta data' }),
  ).toBeVisible();
  await expect(
    page.getByText('O profissional não atende neste dia. Escolha outro dia.'),
  ).toBeVisible();
  // Presentation of the real motor's manual response, without mutating shared fixture schedules.
  await page.route(`**${base}/availability?**`, (route) =>
    route.fulfill({
      json: {
        slots: [],
        message: 'A agenda para este período ainda não foi aberta pelo barbeiro. Volte em breve!',
      },
    }),
  );
  await page.getByLabel('Escolher outra data').fill(await futureDate(page));
  await expect(page.getByText(/ainda não foi aberta pelo estabelecimento/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
});

test('Mini booking: catalog and availability errors recover without losing selection', async ({
  page,
}) => {
  let fail = true;
  await page.route(`**${base}/services`, (route) =>
    fail
      ? route.fulfill({ status: 503, json: { error: 'Serviços temporariamente indisponíveis.' } })
      : route.continue(),
  );
  await page.goto(booking);
  await expect(page.getByRole('alert')).toContainText('Serviços temporariamente indisponíveis');
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('radio')).toBeVisible();
  await page.getByRole('radio').check();
  await page.route(`**${base}/availability?**`, (route) =>
    route.fulfill({ status: 503, json: { error: 'Não foi possível consultar os horários.' } }),
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(await futureDate(page));
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  await page.unroute(`**${base}/availability?**`);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(await futureDate(page));
  await expect(page.locator('.time-options button').first()).toBeEnabled();
  await expect(page.locator('.mb-summary')).toContainText('Corte personalizado');
});

test('Mini booking: real categories, exactly one service and no incompatible professional', async ({
  page,
}) => {
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
      })
    ).status(),
  ).toBe(200);
  const headers = { 'X-Gradefy-Company-Id': 'minisite-browser' };
  const created = await page.request.post('/api/admin/services', {
    headers,
    data: {
      name: 'Barba de teste',
      description: 'Serviço exclusivo deste teste',
      duration: 30,
      price: 2500,
      category: 'Barba',
      active: true,
    },
  });
  expect(created.status()).toBe(201);
  const service = await created.json();
  try {
    await page.goto(booking);
    await expect(page.getByRole('radio')).toHaveCount(2);
    await page.getByRole('radio', { name: /Barba de teste/ }).check();
    await expect(page.locator('input[name="booking-service"]:checked')).toHaveCount(1);
    await expect(page.locator('.mb-summary')).toContainText('Barba de teste');
    await page.getByRole('button', { name: 'Corte', exact: true }).click();
    await expect(page.getByRole('radio')).toHaveCount(1);
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Nenhum profissional disponível' }),
    ).toBeVisible();
    await expect(page.locator('.barber-option')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  } finally {
    expect(
      (await page.request.delete(`/api/admin/services/${service.id}`, { headers })).status(),
    ).toBe(200);
  }
});

test('Mini booking: touch mobile and long business/catalog text remain readable without horizontal scroll', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    isMobile: true,
    hasTouch: true,
    viewport: { width: 320, height: 760 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await registerMiniCustomer(page);
    await page.route(`**${base}/site`, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.company.name = 'Estabelecimento'.repeat(10);
      await route.fulfill({ response, json: data });
    });
    await page.route(`**${base}/services`, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data[0].description = 'Detalhes'.repeat(60);
      await route.fulfill({ response, json: data });
    });
    await page.goto(booking);
    await expect(page.getByRole('radio')).toBeChecked();
    await noOverflow(page);
    await page.getByRole('button', { name: 'Continuar', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Com quem e quando?' })).toBeVisible();
    await noOverflow(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await page.locator('.mb-summary-toggle').tap();
    await expect(page.locator('.mb-summary-body')).toBeVisible();
    await noOverflow(page);
  } finally {
    await context.close();
  }
});
