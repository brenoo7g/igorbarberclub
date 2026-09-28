import { test, expect } from '@playwright/test';

test('direct navigation and reload preserve SPA pages and API query strings', async ({ page }) => {
  for (const [path, title] of [
    ['/agendar?servico=corte', 'Seu próximo visual começa aqui.'],
    ['/minha-conta', 'Seu estilo.Sua agenda.'],
    ['/admin', 'O Club nas suas mãos.'],
  ]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    const reloaded = await page.reload();
    expect(reloaded.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    if (path.startsWith('/agendar'))
      await expect(page.getByRole('radio', { name: /Corte masculino/ })).toBeChecked();
  }
});

test('Vercel plain text 404 and invalid JSON are explained without exposing parser errors', async ({
  page,
}) => {
  let failure = 'text';
  await page.route('**/api/services', (route) => {
    if (failure === 'text')
      return route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'The page could not be found\nNOT_FOUND',
      });
    if (failure === 'json')
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: '<html>Proxy error</html>',
      });
    if (failure === 'network') return route.abort('failed');
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await expect(page.getByText('Unexpected token')).toHaveCount(0);
  failure = '';
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.service-card')).toHaveCount(4);
  failure = 'json';
  await page.goto('/agendar');
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  failure = '';
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(6);
  failure = 'network';
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Verifique sua conexão');
});
