import { test, expect } from '@playwright/test';
import { registerMiniCustomer } from '../helpers/minisite-client-browser.js';
const root = '/api/public/minisite-browser',
  cid = 'minisite-browser',
  headers = { 'X-Gradefy-Company-Id': cid };
for (const [index, width] of [390, 1440].entries())
  test(`block preview, abandonment, actual cancellation, response loss, customer history and management tracking at ${width}px`, async ({
    page,
    browser,
  }) => {
    const client = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' }),
      owner = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
    try {
      await registerMiniCustomer(client);
      const schedule = await (
        await client.request.get(root + '/barbers/minisite-person/schedule')
      ).json();
      const date = schedule.dates.filter(
        (d) => d > new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      )[index + 1];
      expect(date).toBeTruthy();
      const response = await client.request.post(root + '/appointments', {
        data: {
          services: ['minisite-service'],
          barberId: 'minisite-person',
          date,
          time: '09:00',
          expectedTotal: 3500,
          expectedDuration: 40,
        },
      });
      expect(response.status()).toBe(201);
      const saved = await response.json();
      expect(
        (
          await page.request.post('/api/auth/login', {
            data: { email: 'mini-block-professional@example.test', password: 'ClienteDemo2026!' },
          })
        ).status(),
      ).toBe(200);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app/minha-agenda?empresa=' + cid);
      await page.getByLabel('Data inicial do bloqueio', { exact: true }).fill(date);
      await page.getByLabel('Início do bloqueio pessoal', { exact: true }).fill('09:20');
      await page.getByLabel('Fim do bloqueio pessoal', { exact: true }).fill('09:30');
      await page.getByRole('button', { name: 'Revisar bloqueio', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Confirmar bloqueio e cancelamentos' });
      await expect(dialog).toContainText('1 agendamento(s) afetado(s).');
      await expect(dialog).toContainText('Cliente Mini Site');
      await expect(dialog).toContainText('09:00 — 09:40');
      expect(
        (await (await client.request.get(root + '/appointments')).json()).find(
          (a) => a.id === saved.id,
        ).status,
      ).toBe('confirmed');
      for (const size of width === 390 ? [320, 360, 390, 428] : [768, 1440]) {
        await page.setViewportSize({ width: size, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await page.setViewportSize({ width, height: 900 });
      await dialog.getByRole('button', { name: 'Desistir', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(
        (await (await client.request.get(root + '/appointments')).json()).find(
          (a) => a.id === saved.id,
        ).status,
      ).toBe('confirmed');
      await page.getByRole('button', { name: 'Revisar bloqueio', exact: true }).click();
      await dialog.getByLabel('Motivo público do cancelamento').selectOption('other');
      const reason = 'Manutenção programada ' + width;
      await dialog.getByLabel('Descreva o motivo público', { exact: true }).fill(reason);
      await dialog
        .getByLabel('Observações internas (não enviadas ao cliente)')
        .fill('Observação interna de gestão');
      await page.screenshot({ path: `test-results/block-confirm-${width}.png`, fullPage: true });
      let key,
        intercepted = 0;
      if (index === 0)
        await page.route('**/api/professional/blocks/confirm', async (route) => {
          key = route.request().headers()['idempotency-key'];
          intercepted++;
          if (intercepted === 1) {
            const sent = await route.fetch();
            expect(sent.status()).toBe(201);
            await route.abort('failed');
          } else {
            expect(route.request().headers()['idempotency-key']).toBe(key);
            await route.continue();
          }
        });
      await dialog
        .getByRole('button', { name: 'Confirmar bloqueio e cancelar reservas', exact: true })
        .click();
      if (index === 0) {
        await expect(dialog.getByRole('alert')).toBeVisible();
        await dialog
          .getByRole('button', { name: 'Tentar confirmar novamente', exact: true })
          .click();
        expect(intercepted).toBe(2);
      }
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('1 agendamento(s) cancelado(s).');
      await expect(page.getByRole('status')).toContainText(
        'O provedor de e-mail não está configurado',
      );
      const reservations = await (await client.request.get(root + '/appointments')).json();
      expect(reservations.find((a) => a.id === saved.id).status).toBe('cancelled');
      expect(reservations.find((a) => a.id === saved.id).cancellation_reason).toBe(reason);
      expect(JSON.stringify(reservations)).not.toContain('Observação interna de gestão');
      const clientPage = await client.newPage();
      await clientPage.goto('/minisite-browser/minha-conta');
      await clientPage.getByRole('button', { name: 'Histórico', exact: true }).click();
      await expect(clientPage.locator('.ms-reservation-card')).toContainText(reason);
      await expect(clientPage.locator('.ms-reservation-card')).toContainText('Cancelado');
      expect(
        (
          await owner.request.post('/api/auth/login', {
            data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
          })
        ).status(),
      ).toBe(200);
      const operations = await (
        await owner.request.get('/api/admin/agenda/blocks/operations', { headers })
      ).json();
      expect(operations.filter((o) => o.public_reason === reason)).toHaveLength(1);
      expect(operations.find((o) => o.public_reason === reason).notifications.attention).toBe(1);
      const ownerPage = await owner.newPage();
      await ownerPage.goto('/app/agenda?empresa=' + cid);
      const item = ownerPage.locator('.gf-block-operation').filter({ hasText: reason });
      await item.locator('summary').click();
      await expect(item).toContainText('Provedor de e-mail não configurado');
      await expect(item).toContainText('Cliente Mini Site');
      await ownerPage.setViewportSize({ width, height: 900 });
      expect(
        await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await ownerPage.screenshot({
        path: `test-results/block-management-${width}.png`,
        fullPage: true,
      });
    } finally {
      await client.close();
      await owner.close();
    }
  });

test('management previews a full week without silently changing reservations', async ({ page }) => {
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/app/agenda?empresa=' + cid);
  await page.getByLabel('Profissional do bloqueio').selectOption('minisite-person');
  await page.getByLabel('Dia inteiro', { exact: true }).check();
  const today = (await (await page.request.get('/api/admin/agenda', { headers })).json()).today;
  const from = new Date(today + 'T12:00Z');
  from.setUTCDate(from.getUTCDate() + 80);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 6);
  await page.getByLabel('Data inicial do bloqueio').fill(from.toISOString().slice(0, 10));
  await page.getByLabel('Data final do bloqueio').fill(to.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Revisar bloqueio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar bloqueio e cancelamentos' });
  await expect(dialog).toContainText('Dia inteiro');
  await expect(dialog).toContainText('0 agendamento(s) afetado(s).');
  await dialog.getByRole('button', { name: 'Desistir', exact: true }).click();
});
