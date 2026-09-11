import { test, expect } from '@playwright/test';

test('real portfolio carousel: responsive scrolling, keyboard, modal, loading failure and empty state', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#galeria');
  await expect(page.locator('.portfolio-card')).toHaveCount(5);
  await expect(page.locator('#galeria h2')).toHaveText('Alguns dos nossos cortes');
  await expect(
    page.locator('#galeria .filter-tabs, #galeria .portfolio-caption, #galeria p'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fotos anteriores', exact: true })).toBeDisabled();
  const desktopTrack = await page.locator('.portfolio-track').boundingBox();
  await page.mouse.move(desktopTrack.x + 750, desktopTrack.y + 180);
  await page.mouse.down();
  await page.mouse.move(desktopTrack.x + 120, desktopTrack.y + 180, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(() => page.locator('.portfolio-track').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ir para posição 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fotos anteriores', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Próximas fotos', exact: true }).click();
  await expect
    .poll(() => page.locator('.portfolio-track').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'Fotos anteriores', exact: true })).toBeEnabled();
  await page.locator('.portfolio-track').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Fotos anteriores', exact: true })).toBeDisabled();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#galeria').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('#galeria').screenshot({ path: `test-results/portfolio-${width}.png` });
  }
  await page.getByRole('button', { name: 'Ampliar Degradê no Club', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Fotos indisponíveis no momento.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Fotos indisponíveis');
  await page.unroute('**/api/portfolio');
  await page.getByRole('button', { name: 'Tentar carregar fotos novamente' }).click();
  await expect(page.locator('.portfolio-card')).toHaveCount(5);
  await page.route('**/api/portfolio', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.reload();
  await expect(page.locator('#galeria')).toHaveCount(0);
  await expect(page.locator('.portfolio-card')).toHaveCount(0);
  expect(errors).toEqual([]);

  // Native touch swipe, not a synthetic scroll assignment.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await context.newPage();
  await mobile.goto('http://127.0.0.1:4173/#galeria');
  await expect(mobile.locator('.portfolio-card')).toHaveCount(5);
  await mobile.locator('.portfolio-track').scrollIntoViewIfNeeded();
  const box = await mobile.locator('.portfolio-track').boundingBox();
  const cdp = await context.newCDPSession(mobile);
  // Swipe on the photo, above the overlaid navigation buttons.
  const y = Math.round(box.y + box.height * 0.3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 325, y }] });
  for (const x of [280, 230, 180, 130, 70])
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(() => mobile.locator('.portfolio-track').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await context.close();
});

test('administrator uploads, edits and removes a photo visible in the public carousel', async ({
  page,
}) => {
  await page.goto('/admin/trabalhos');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Adicionar foto', exact: true }).click();
  await page.getByLabel('Foto do corte').setInputFiles('server/portfolio-photos/corte-1.webp');
  await expect(page.locator('.portfolio-preview')).toBeVisible();
  await page.getByLabel('Título do corte').fill('Corte publicado E2E');
  await page.getByLabel('Categoria', { exact: true }).fill('Estilo E2E');
  let releaseUpload;
  const uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  await page.route('**/api/admin/portfolio', async (route) => {
    await uploadGate;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Falha de teste. Tente novamente.' }),
    });
  });
  await page.getByRole('button', { name: 'Publicar foto', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Aguarde...' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  releaseUpload();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Falha de teste');
  await expect(page.getByLabel('Título do corte')).toHaveValue('Corte publicado E2E');
  await page.unroute('**/api/admin/portfolio');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/portfolio') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Publicar foto', exact: true }).click();
  const photo = await (await created).json();
  try {
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Editar Corte publicado E2E' }).click();
    await page.getByLabel('Título do corte').fill('Corte atualizado E2E');
    await page.getByRole('button', { name: 'Publicar foto', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Corte atualizado E2E' })).toBeVisible();
    await page.goto('/#galeria');
    await expect(page.locator('.portfolio-card')).toHaveCount(6);
    await page.getByRole('button', { name: 'Ampliar Corte atualizado E2E', exact: true }).click();
    await expect(page.getByRole('dialog').locator('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/trabalhos');
    await expect(page.getByRole('heading', { name: 'Corte atualizado E2E' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Remover Corte atualizado E2E' }).click();
    await page.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Corte atualizado E2E' })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/admin/portfolio/${photo.id}`);
  }
});
