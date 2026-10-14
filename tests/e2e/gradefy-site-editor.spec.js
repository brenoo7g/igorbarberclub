import { prepareSiteEditor } from '../helpers/site-browser.js';
import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('Meu Site saves identity/colors/contact/sections; reload/login/mobile preserve unpublished state', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { company, email } = await prepareSiteEditor(page);
  const trial = (await (await page.request.get('/api/onboarding/business')).json()).company.trial;
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Barbearia Aurora');
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Seu momento de cuidado');
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Atendimento em um espaço pensado para você.');
  await page.getByLabel('Cor principal', { exact: true }).fill('#1144cc');
  await page.getByLabel('Cor secundária', { exact: true }).fill('#dd2244');
  await page
    .getByLabel('Instagram', { exact: true })
    .fill('https://instagram.com/barbearia_aurora/');
  await page
    .getByRole('checkbox', { name: 'Mostrar seção sobre a empresa', exact: true })
    .uncheck();
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Barbearia Aurora',
  );
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#1144cc');
  await expect(
    page.getByRole('checkbox', { name: 'Mostrar seção sobre a empresa', exact: true }),
  ).not.toBeChecked();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/gradefy-site-editor-${width}.png`,
        fullPage: true,
      });
  }
  const state = await (await page.request.get('/api/company-site')).json();
  expect(state.company.sitePublished).toBe(false);
  expect(state.settings.primary_color).toBe('#1144cc');
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  expect((await (await page.request.get('/api/onboarding/business')).json()).company.trial).toEqual(
    trial,
  );
  await page.context().clearCookies();
  await page.reload();
  await expect(page).toHaveURL('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
  await page.goto('/app/meu-site');
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Barbearia Aurora',
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});
test('configured test storage: logo/banner/gallery, invalid file, reordering, deletion and stale save', async ({
  page,
}) => {
  await prepareSiteEditor(page);
  const buffer = await sharp({
    create: { width: 80, height: 100, channels: 3, background: '#4c55aa' },
  })
    .png()
    .toBuffer();
  const file = { name: 'corte.png', mimeType: 'image/png', buffer };
  await page.getByLabel('Enviar logo', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('img', { name: 'Logo da empresa', exact: true })).toBeVisible();
  await page.getByLabel('Enviar banner', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('img', { name: 'Banner da empresa', exact: true })).toBeVisible();
  await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles(file);
  await expect(page.locator('.gf-editor-gallery img')).toHaveCount(1);
  await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles(file);
  await expect(page.locator('.gf-editor-gallery img')).toHaveCount(2);
  const first = await page.locator('.gf-editor-gallery img').first().getAttribute('src');
  await page.getByRole('button', { name: 'Mover foto 2 para cima', exact: true }).click();
  await expect(page.locator('.gf-editor-gallery img').first()).not.toHaveAttribute('src', first);
  await page.getByRole('button', { name: 'Excluir foto 1', exact: true }).click();
  await expect(page.locator('.gf-editor-gallery img')).toHaveCount(1);
  await page.getByLabel('Enviar logo', { exact: true }).setInputFiles({
    name: 'malicioso.png',
    mimeType: 'image/png',
    buffer: Buffer.from('MZ executable'),
  });
  await expect(page.getByRole('alert')).toContainText('Não foi possível ler a imagem');
  await page.getByRole('button', { name: 'Remover banner', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Banner da empresa', exact: true })).toHaveCount(0);
  const current = await (await page.request.get('/api/company-site')).json();
  expect(
    (
      await page.request.put('/api/company-site', {
        data: { ...current.settings, name: 'Alterado em outra aba' },
      })
    ).status(),
  ).toBe(200);
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Não sobrescrever');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('outra aba');
  await page.getByRole('button', { name: 'Recarregar dados', exact: true }).click();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Alterado em outra aba',
  );
  await page.route('**/api/company-site', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    data.storage.configured = false;
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await expect(page.getByLabel('Enviar logo', { exact: true })).toBeDisabled();
  await expect(
    page.getByText('O armazenamento de imagens ainda não foi configurado.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeEnabled();
});
