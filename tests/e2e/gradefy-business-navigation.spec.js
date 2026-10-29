import { test, expect } from '@playwright/test';
import { team } from './fixtures/team-services-presentation.js';

const companyId = 'business-browser-team';
const routes = [
  ['/app/dashboard', 'Dashboard'],
  ['/app/agenda', 'Agenda'],
  ['/app/clientes', 'Clientes'],
  ['/app/equipe', 'Equipe'],
  ['/app/servicos', 'Serviços'],
  ['/app/financeiro', 'Pagamentos'],
  ['/app/relatorios', 'Relatórios'],
  ['/app/configuracoes', 'Configurações'],
  ['/app/profissionais', 'Profissionais'],
  ['/app/meu-site', 'Meu Site'],
];
const primary = routes.slice(0, 8).map(([, label]) => label);

async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}

test('desktop business sidebar has one order, real company state and correct active item on every route', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  const api = await page.request.get('/api/companies?view=management');
  expect(api.status()).toBe(200);
  const companies = await api.json();
  expect(companies.find((company) => company.id === companyId)).toMatchObject({
    name: 'Clube Horizonte',
    plan_name: 'Equipe',
    subscription_status: 'active',
    site_published: 1,
  });
  let sidebarWidth;
  for (const [path, label] of routes) {
    await page.goto(`${path}?empresa=${companyId}`);
    const sidebar = page.getByRole('complementary', { name: 'Navegação empresarial' });
    await expect(sidebar).toBeVisible();
    const width = (await sidebar.boundingBox())?.width;
    expect(width).toBeGreaterThan(0);
    if (sidebarWidth === undefined) sidebarWidth = width;
    else expect(width, `Sidebar mantém a largura em ${path}`).toBe(sidebarWidth);
    const navigation = sidebar.getByRole('navigation', { name: 'Áreas da empresa' });
    const links = navigation.locator(':scope > a');
    await expect(links).toHaveCount(8);
    expect(await links.allTextContents()).toEqual(primary);
    await expect(sidebar.getByText('Clube Horizonte', { exact: true })).toBeVisible();
    await expect(sidebar.locator('.gf-sidebar-promo')).toContainText('Plano Equipe');
    await expect(sidebar.locator('.gf-sidebar-promo')).toContainText('Assinatura ativa');
    const active = sidebar.locator('a[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(label);
    for (const link of await navigation.getByRole('link').all()) {
      expect(await link.getAttribute('href')).toContain(`empresa=${companyId}`);
    }
    if (path === '/app/financeiro')
      await expect(active).toHaveAttribute('href', `/app/financeiro?empresa=${companyId}`);
    if (path === '/app/equipe')
      await expect(active).toHaveAttribute('href', `/app/equipe?empresa=${companyId}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1672,
    );
    await page.screenshot({ path: `test-results/nav-${path.split('/').pop()}-1672x941.png` });
  }
  const sidebar = page.getByRole('complementary', { name: 'Navegação empresarial' });
  await expect(sidebar.locator('.gf-sidebar-more')).toHaveAttribute('open', '');
  await sidebar.locator('.gf-sidebar-more summary').focus();
  await page.keyboard.press('Enter');
  await expect(sidebar.locator('.gf-sidebar-more')).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(sidebar.locator('.gf-sidebar-more')).toHaveAttribute('open', '');
  await page.screenshot({ path: 'test-results/nav-more-footer-1672x941.png' });
  await expect(sidebar.getByRole('link', { name: 'Minha conta' })).toHaveAttribute(
    'href',
    '/app/conta',
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const [path] of routes) {
    await page.goto(`${path}?empresa=${companyId}`);
    const narrowSidebar = page.getByRole('complementary', { name: 'Navegação empresarial' });
    await expect(narrowSidebar).toBeVisible();
    expect((await narrowSidebar.boundingBox())?.width, path).toBe(202);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1024,
    );
  }
  await page.goto('/app/equipe?empresa=business-browser-one');
  await expect(sidebar.getByText('Studio Individual', { exact: true })).toBeVisible();
  await expect(sidebar.locator('.gf-sidebar-promo')).toContainText('Plano Individual');
  await expect(sidebar).not.toContainText('Clube Horizonte');
});

test('access area uses scoped real counts and keeps actions and compact rows', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(`/app/equipe?empresa=${companyId}`);
  const team = await (
    await page.request.get('/api/admin/team', { headers: { 'X-Gradefy-Company-Id': companyId } })
  ).json();
  const metrics = page.getByLabel('Resumo dos acessos');
  await expect(metrics).toContainText(
    String(team.members.filter((member) => member.status === 'active').length),
  );
  await expect(metrics).toContainText(
    String(team.invitations.filter((invitation) => invitation.status === 'pending').length),
  );
  await expect(
    page.getByRole('region', { name: 'Membros da empresa' }).locator('.gf-team-access-row'),
  ).toHaveCount(team.members.length);
  await page.locator('#team-access').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/team-access-real-1672x941.png' });
  await page.getByRole('button', { name: 'Convidar pessoa', exact: true }).click();
  await expect(page.getByLabel('E-mail do convidado')).toBeFocused();
  await page.screenshot({ path: 'test-results/team-access-invite-form-1672x941.png' });
  for (const [width, height] of [
    [320, 844],
    [360, 844],
    [390, 844],
    [428, 844],
    [768, 1024],
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
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '125%';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});

test('dense invitation history keeps its own layout within narrow desktop viewport', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/admin/team', (route) =>
    route.fulfill({
      json: {
        ...team,
        invitations: Array.from({ length: 18 }, (_, index) => ({
          ...team.invitations[0],
          id: 'visual-invitation-' + index,
          email: `nome.sobrenome.convidado.${index}.completo@example.test`,
        })),
      },
    }),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/app/equipe?empresa=${companyId}`);
  await expect(
    page.getByRole('region', { name: 'Convites da empresa' }).locator('.gf-team-access-row'),
  ).toHaveCount(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});

test('access presentation captures members, invitations, confirmation, share and empty states without sending email', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  const presentationTeam = {
    ...team,
    invitations: ['pending', 'accepted', 'expired', 'cancelled'].map((status, index) => ({
      ...team.invitations[0],
      id: `visual-${status}`,
      email: `convite-${index}@example.test`,
      status,
      createdAt: '2026-10-28T12:00:00.000Z',
      professional: index === 0 ? { mode: 'existing', professionalId: 'visual-rafael' } : undefined,
    })),
  };
  await page.route('**/api/admin/team', (route) => route.fulfill({ json: presentationTeam }));
  await page.goto(`/app/equipe?empresa=${companyId}`);
  await expect(page.locator('.gf-team-access-row')).toHaveCount(
    presentationTeam.members.length + presentationTeam.invitations.length,
  );
  await page.locator('#team-access').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/team-access-summary-1672x941.png' });
  await page.getByRole('region', { name: 'Membros da empresa' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/team-access-members-1672x941.png' });
  await page.getByRole('region', { name: 'Convites da empresa' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region', { name: 'Convites da empresa' })).toContainText(
    'Vínculo no aceite: Rafael Silva',
  );
  await page.screenshot({ path: 'test-results/team-access-invitations-1672x941.png' });
  await page.getByRole('button', { name: 'Alterar papel' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Alterar papel?' })).toBeVisible();
  await page.screenshot({ path: 'test-results/team-access-confirmation-1672x941.png' });
  await page.keyboard.press('Escape');
  await page.route('**/api/admin/team/invitations', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 201,
      json: {
        invitation: team.invitations[0],
        companyName: team.company.name,
        link: 'http://127.0.0.1:4173/app/convite#token=visual-only',
        code: 'VISUAL-ONLY',
      },
    });
  });
  await page.getByLabel('E-mail do convidado').fill('visual@example.test');
  await page.getByRole('button', { name: 'Criar convite' }).click();
  await expect(page.getByRole('dialog', { name: 'Convite pronto' })).toBeVisible();
  await page.screenshot({ path: 'test-results/team-access-share-1672x941.png' });
  await page
    .getByRole('dialog', { name: 'Convite pronto' })
    .getByRole('button', { name: 'Concluir' })
    .click();
  await page.unroute('**/api/admin/team');
  await page.route('**/api/admin/team', (route) =>
    route.fulfill({ json: { ...team, invitations: [], members: [team.members[0]] } }),
  );
  await page.reload();
  await expect(page.getByRole('region', { name: 'Convites da empresa' })).toContainText(
    'Nenhum convite criado',
  );
  await page.getByRole('region', { name: 'Convites da empresa' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/team-access-empty-1672x941.png' });
});
