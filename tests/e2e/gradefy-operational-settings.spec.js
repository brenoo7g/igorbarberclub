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
function payload(snapshot, patch = {}) {
  const { editable, timezoneLocked, professionals, ...fields } = snapshot;
  return { ...fields, ...patch };
}
test('operational settings persist, follow company selection and work at 320/390/768/1440 without altering site visuals', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/configuracoes?empresa=' + cid);
  await expect(page.getByRole('heading', { name: 'Configurações operacionais' })).toBeVisible();
  await expect(page.getByLabel('Fuso horário', { exact: true })).toBeDisabled();
  const original = await (await page.request.get('/api/admin/settings', { headers })).json();
  try {
    await page.getByLabel('Antecedência mínima da reserva', { exact: true }).fill('120');
    await page.getByLabel('Janela máxima de reservas').selectOption('15');
    await page.getByLabel('Intervalo entre atendimentos').fill('10');
    await page.getByLabel('Antecedência mínima para cancelar').fill('60');
    await page.getByLabel('Antecedência mínima para reagendar').fill('60');
    await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Configurações salvas' }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Antecedência mínima da reserva', { exact: true })).toHaveValue(
      '120',
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width < 900) {
        const nav = page.getByRole('navigation', { name: 'Navegação móvel', exact: true });
        await expect(
          nav.getByRole('link', { name: 'Configurações', exact: true }),
        ).toBeInViewport();
        expect(
          await nav.evaluate(
            (element) =>
              [...new Set([...element.querySelectorAll('a')].map((a) => a.offsetTop))].length,
          ),
        ).toBe(1);
      }
      await page.screenshot({
        path: `test-results/operational-settings-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
    await expect(page.getByLabel('Antecedência mínima da reserva', { exact: true })).toHaveValue(
      '0',
    );
    await page.getByLabel('Empresa', { exact: true }).selectOption(cid);
    await expect(page.getByLabel('Antecedência mínima da reserva', { exact: true })).toHaveValue(
      '120',
    );
    await page.getByLabel('Usar somente os expedientes dos profissionais').uncheck();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/operational-hours-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByLabel('Abertura — Segunda-feira', { exact: true }).fill('20:00');
    await page.getByLabel('Encerramento — Segunda-feira', { exact: true }).fill('19:00');
    await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await expect(page.getByRole('alert').first()).toContainText('fim do expediente');
    await page.getByRole('button', { name: 'Recarregar configurações', exact: true }).click();
    await expect(page.getByLabel('Usar somente os expedientes dos profissionais')).toBeChecked();
    const current = await (await page.request.get('/api/admin/settings', { headers })).json();
    await page.request.put('/api/admin/settings', {
      headers,
      data: payload(current, { minimum_notice_minutes: 130 }),
    });
    await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await expect(page.getByRole('alert').first()).toContainText('Recarregue');
  } finally {
    const current = await (await page.request.get('/api/admin/settings', { headers })).json();
    const saved = await page.request.put('/api/admin/settings', {
      headers,
      data: payload(original, { version: current.version, site_version: current.site_version }),
    });
    expect(saved.status()).toBe(200);
  }
});
test('pause is distinct from publishing; Barber Classic displays friendly message and admin agenda still works', async ({
  page,
  browser,
}) => {
  await login(page);
  const original = await (await page.request.get('/api/admin/settings', { headers })).json();
  const context = await browser.newContext(),
    guest = await context.newPage();
  try {
    await page.goto('/app/configuracoes?empresa=' + cid);
    await page.getByLabel('Aceitar agendamentos online').uncheck();
    await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Configurações salvas' }).first(),
    ).toBeVisible();
    await guest.goto('/' + cid);
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await guest.goto('/' + cid + '/agendar');
    await expect(guest.getByRole('heading', { name: 'Uma pausa na agenda online.' })).toBeVisible();
    expect((await guest.request.get('/api/public/' + cid + '/site')).status()).toBe(200);
    await page.goto('/app/agenda?empresa=' + cid);
    await expect(page.locator('.gf-agenda-navigation')).toBeVisible();
  } finally {
    const current = await (await page.request.get('/api/admin/settings', { headers })).json();
    expect(
      (
        await page.request.put('/api/admin/settings', {
          headers,
          data: payload(original, { version: current.version, site_version: current.site_version }),
        })
      ).status(),
    ).toBe(200);
    await context.close();
  }
  await page.goto('/');
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Igor Barber Club — início' }),
  ).toBeVisible();
});

test('public calendar uses company local date at midnight, not the visitor or Brasília timezone', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-14T03:30:00Z') });
  // Only the display timezone is overridden. No historical reservation or server clock changes.
  await page.route('**/api/public/' + cid + '/site', async (route) => {
    const response = await route.fetch();
    const site = await response.json();
    site.company.timezone = 'America/Manaus';
    await route.fulfill({ response, json: site });
  });
  await page.goto('/' + cid + '/agendar');
  await page.locator('.booking-service').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Escolher outra data')).toHaveValue('2026-10-13');
  await expect(page.getByLabel('Escolher outra data')).toHaveAttribute('min', '2026-10-13');
  await expect(page.getByText('Horários em America/Manaus', { exact: false })).toBeVisible();
  await page.route('**/api/public/' + cid + '/auth/me', (route) =>
    route.fulfill({
      json: {
        user: null,
        visitor: {
          id: 'timezone-view',
          name: 'Cliente Teste',
          email: 'clock@example.com',
          phone: '21999999999',
        },
      },
    }),
  );
  await page.route('**/api/public/' + cid + '/appointments', (route) =>
    route.fulfill({
      json: [
        {
          id: 'timezone-view',
          date: '2026-10-13',
          time: '23:50',
          barber_name: 'Profissional Teste',
          total: 3500,
          status: 'confirmed',
          services: [{ name: 'Corte', duration: 40, price: 3500 }],
        },
      ],
    }),
  );
  await page.goto('/' + cid + '/minha-conta');
  await expect(page.getByRole('heading', { name: 'Corte', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar horário', exact: true })).toBeVisible();
});
