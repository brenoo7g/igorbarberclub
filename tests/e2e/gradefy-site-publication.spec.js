import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { prepareSiteEditor } from '../helpers/site-browser.js';

test('real private Barber Classic preview; explicit publication retry, edits, responsive delivery and withdrawal', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { company } = await prepareSiteEditor(page);
  const trial = (await (await page.request.get('/api/onboarding/business')).json()).company.trial;
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Barbearia Publicada');
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Sua agenda, seu estilo');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Descrição real e exclusiva da empresa.');
  await page.getByLabel('Cor principal', { exact: true }).fill('#2244cc');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  const buffer = await sharp({
    create: { width: 100, height: 80, channels: 3, background: '#5544cc' },
  })
    .png()
    .toBuffer();
  for (const label of ['Enviar logo', 'Enviar banner', 'Adicionar fotografia']) {
    await page
      .getByLabel(label, { exact: true })
      .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer });
    await expect(
      page.getByRole('button', { name: 'Salvar alterações', exact: true }),
    ).toBeEnabled();
  }
  await page.getByRole('link', { name: 'Visualizar meu site', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/preview/site/'));
  await expect(
    page.getByText('Prévia privada · Agendamentos desativados', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.brand').first()).toContainText('Barbearia Publicada');
  await expect(page.locator('.company-logo').first()).toBeVisible();
  await expect(page.locator('.hero-photo img')).toHaveAttribute('src', /company-site\/assets/);
  await expect(page.locator('#sobre')).toContainText('Descrição real e exclusiva da empresa.');
  await expect(page.locator('.site-footer')).toContainText('Sua agenda, seu estilo');
  await expect(page.locator('.service-card').filter({ hasText: 'Corte' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Profissional', exact: true })).toBeVisible();
  await expect(page.locator('.portfolio-card')).toHaveCount(1);
  await expect(page.locator('[aria-disabled=true].header-book')).toBeVisible();
  await expect(page.locator('a[href*="/agendar"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('[Sua');
  await expect(page.locator('body')).not.toContainText('Igor');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  await page.getByRole('link', { name: 'Voltar ao Meu Site', exact: true }).click();
  let attempts = 0;
  await page.route('**/api/company-site/publish', async (route) => {
    attempts++;
    if (attempts === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Publicar meu site', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await page.getByRole('button', { name: 'Publicar meu site', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu site está no ar!', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir meu site', exact: true })).toHaveAttribute(
    'href',
    `/${company.slug}`,
  );
  await expect(page.getByRole('button', { name: 'Copiar link', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compartilhar', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  const site = await (await page.request.get(`/api/public/${company.slug}/site`)).json();
  const imageUrl = site.settings.logo_url;
  expect((await page.request.get(imageUrl)).headers()['cache-control']).toBe('no-store');
  await page.goto(`/${company.slug}`);
  await expect(page.locator('.company-logo').first()).toBeVisible();
  await expect(page.locator('.portfolio-card')).toHaveCount(1);
  expect(
    await page
      .locator('.barber-classic')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--blue').trim()),
  ).toBe('#2244cc');
  await page.goto('/app/meu-site');
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Site atualizado');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get(`/api/public/${company.slug}/site`)).json()).settings.slogan,
  ).toBe('Site atualizado');
  await page.getByRole('button', { name: 'Retirar site do ar', exact: true }).click();
  await page.getByRole('button', { name: 'Manter publicado', exact: true }).click();
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(200);
  await page.getByRole('button', { name: 'Retirar site do ar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
  await expect(
    page.getByText('Status: não publicado. Visualize os dados salvos antes de publicar.', {
      exact: true,
    }),
  ).toBeVisible();
  expect((await page.request.get(imageUrl)).status()).toBe(404);
  expect((await page.request.get(`/api/public/${company.slug}/services`)).status()).toBe(404);
  expect((await (await page.request.get('/api/onboarding/business')).json()).company.trial).toEqual(
    trial,
  );
  await page.getByRole('link', { name: 'Visualizar meu site', exact: true }).click();
  await expect(page.locator('.portfolio-card')).toHaveCount(1);
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Entre');
  await expect(page.locator('.brand,.portfolio-card,.company-logo')).toHaveCount(0);
  await page.goto(`/${company.slug}`);
  await expect(
    page.getByRole('heading', { name: 'Página não encontrada', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await page.goto('/unknown-private-studio/minha-conta');
  await expect(
    page.getByRole('heading', { name: 'Página não encontrada', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('new public company books as guest; unpublished site preserves private reservation cancellation; another owner denied', async ({
  page,
  browser,
}) => {
  const { company, person } = await prepareSiteEditor(page);
  expect(
    (await page.request.post('/api/company-site/publish', { data: { version: 0 } })).status(),
  ).toBe(200);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
  });
  const customer = await context.newPage();
  try {
    const schedule = await (
      await customer.request.get(`/api/public/${company.slug}/barbers/${person.id}/schedule`)
    ).json();
    const date = schedule.dates.find((d) => d > new Date().toISOString().slice(0, 10));
    await customer.goto(`/${company.slug}`);
    await customer.locator('.service-card').first().click();
    await expect(customer).toHaveURL(new RegExp(`/${company.slug}/agendar`));
    await customer.getByRole('button', { name: 'Continuar', exact: true }).click();
    await customer.getByLabel('Escolher outra data').fill(date);
    await customer.locator('.time-options button').first().click();
    await customer.getByRole('button', { name: 'Continuar', exact: true }).click();
    await customer.getByRole('button', { name: 'Continuar Sem Login', exact: true }).click();
    await customer.getByLabel('Nome + Sobrenome').fill('Cliente Publicação');
    await customer.getByLabel('Telefone', { exact: true }).fill('21988887777');
    await customer.getByLabel('E-mail', { exact: true }).fill('cliente-publicacao@example.com');
    const saved = customer.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/public/${company.slug}/appointments/guest`) && r.status() === 201,
    );
    await customer.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
    const appointment = await (await saved).json();
    expect(appointment.company_id).toBe(company.id);
    await customer.getByRole('link', { name: 'Ver meus agendamentos', exact: true }).click();
    await expect(customer.locator('.appointment-card')).toHaveCount(1);
    const current = await (await page.request.get('/api/company-site')).json();
    expect(
      (
        await page.request.post('/api/company-site/unpublish', {
          data: { version: current.settings.version },
        })
      ).status(),
    ).toBe(200);
    await customer.reload();
    await expect(
      customer.getByText(
        'Site fora do ar. Você ainda pode consultar e cancelar suas reservas anteriores.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(customer.locator('.appointment-card')).toHaveCount(1);
    await expect(customer.locator('a[href*="/agendar"]')).toHaveCount(0);
    await customer.getByRole('button', { name: 'Cancelar horário', exact: true }).click();
    await customer.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
    await expect(customer.locator('.appointment-card')).toHaveCount(0);
    await prepareSiteEditor(customer);
    for (const action of ['publish', 'unpublish']) {
      expect(
        (
          await customer.request.post(`/api/company-site/${action}`, {
            headers: { 'X-Gradefy-Company-Id': company.id },
            data: { version: 0 },
          })
        ).status(),
      ).toBe(403);
    }
    await customer.goto(`/preview/site/${company.id}`);
    await expect(customer.getByRole('alert')).toContainText('Sem acesso');
    await expect(customer.locator('.brand,.service-card,.portfolio-card')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
