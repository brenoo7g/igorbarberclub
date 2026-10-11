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
const dialog = (page) => page.getByRole('dialog'),
  card = (page, name) =>
    page
      .locator('.gf-business-record')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
const tomorrow = (date) =>
  new Date(Date.parse(date + 'T12:00Z') + 5 * 86400000).toISOString().slice(0, 10);
async function responsive(page, prefix, modal = false) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (modal)
      expect(await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/gradefy-${prefix}-${width}.png`, fullPage: true });
  }
}
test('business clients: manual registration, edit, actual agenda history and responsive navigation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/app/dashboard?empresa=' + cid);
  await page
    .locator('.gf-dashboard-quick')
    .getByRole('link', { name: 'Clientes Abrir gestão', exact: true })
    .click();
  await expect(page).toHaveURL('/app/clientes?empresa=' + cid);
  await expect(card(page, 'Ana Martins')).toHaveCount(2); // Unrelated reservations are not merged by name/phone.
  await responsive(page, 'clients');
  const imported = (await (await page.request.get('/api/admin/clients?q=Ana', { headers })).json())
    .items;
  const histories = await Promise.all(
    imported.map(async (c) =>
      (await page.request.get('/api/admin/clients/' + c.id, { headers })).json(),
    ),
  );
  const completedClient = histories.find((c) => c.history[0]?.status === 'completed').client.id;
  await page.goto('/app/clientes?empresa=' + cid + '&cliente=' + completedClient);
  await expect(dialog(page).locator('.gf-business-history-row')).toHaveCount(1);
  await dialog(page).getByLabel('Status do histórico').selectOption('completed');
  await expect(dialog(page)).toContainText('Valor registrado');
  await dialog(page).getByRole('link').filter({ hasText: 'Corte clássico' }).click();
  await expect(page).toHaveURL(/\/app\/agenda\?empresa=.*atendimento=/);
  await expect(dialog(page)).toContainText('Ana Martins');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.goto('/app/clientes?empresa=' + cid);
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await dialog(page).getByLabel('Nome', { exact: true }).fill('Cliente Gestão Navegador');
  await dialog(page).getByLabel('Telefone', { exact: true }).fill('(21) 99777-6666');
  await dialog(page)
    .getByLabel('Observações internas (opcional)')
    .fill('Contato autorizado apenas para atendimento.');
  await responsive(page, 'client-form', true);
  await dialog(page).getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.getByLabel('Buscar por nome, telefone ou e-mail').fill('99777');
  await expect(card(page, 'Cliente Gestão Navegador')).toBeVisible();
  await card(page, 'Cliente Gestão Navegador').getByRole('button').click();
  await expect(dialog(page)).toContainText('Contato autorizado apenas para atendimento.');
  await expect(dialog(page)).toContainText('Cadastrado em');
  await dialog(page).getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await dialog(page).getByLabel('Nome', { exact: true }).fill('Cliente Gestão Editado');
  await dialog(page).getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(card(page, 'Cliente Gestão Editado')).toBeVisible();
  const list = await (
    await page.request.get('/api/admin/clients?q=Gestão Editado', { headers })
  ).json();
  const clientId = list.items[0].id;
  await page.goto('/app/agenda?empresa=' + cid + '&novo=1');
  await dialog(page).getByRole('button', { name: 'Cliente existente', exact: true }).click();
  await dialog(page).getByLabel('Cliente existente', { exact: true }).selectOption(clientId);
  await dialog(page)
    .getByLabel('Serviço', { exact: true })
    .selectOption(cid + '-service');
  await dialog(page)
    .getByLabel('Profissional', { exact: true })
    .selectOption(cid + '-pro');
  const snapshot = await (await page.request.get('/api/admin/agenda', { headers })).json();
  await page.getByLabel('Data do atendimento').fill(tomorrow(snapshot.today));
  await dialog(page).getByRole('button', { name: '14:00', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.goto('/app/clientes?empresa=' + cid + '&cliente=' + clientId);
  await expect(dialog(page)).toContainText('Próximo agendamento');
  await expect(dialog(page).locator('.gf-business-history-row')).toHaveCount(2);
  await dialog(page).getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await dialog(page).getByLabel('Nome', { exact: true }).fill('Novo nome cadastral');
  await dialog(page).getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  const history = await (
    await page.request.get('/api/admin/clients/' + clientId, { headers })
  ).json();
  const reservation = await (
    await page.request.get('/api/admin/agenda/' + history.history[0].id, { headers })
  ).json();
  expect(reservation.item.client_name).toBe('Cliente Gestão Editado');
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await expect(page.locator('body')).not.toContainText('Novo nome cadastral');
  expect(
    (
      await page.request.get('/api/admin/clients/' + clientId, {
        headers: { 'X-Gradefy-Company-Id': 'business-browser-one' },
      })
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
});

test('services and professionals use actual catalog, cent values, associations and existing working hours', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/app/servicos?empresa=' + cid);
  await expect(card(page, 'Corte clássico')).toContainText('R$ 45,00');
  await responsive(page, 'services');
  await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
  await dialog(page).getByLabel('Nome', { exact: true }).fill('Barba alinhada');
  await dialog(page).getByLabel('Preço (R$)', { exact: true }).fill('25,99');
  await dialog(page).getByLabel('Duração (minutos)').fill('40');
  await dialog(page).getByLabel('Rafael Silva', { exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(card(page, 'Barba alinhada')).toContainText('R$ 25,99');
  await card(page, 'Barba alinhada').getByRole('button', { name: 'Editar serviço' }).click();
  await dialog(page).getByLabel('Preço (R$)', { exact: true }).fill('29,99');
  await dialog(page).getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(card(page, 'Barba alinhada')).toContainText('R$ 29,99');
  await card(page, 'Barba alinhada')
    .getByRole('button', { name: 'Desativar', exact: true })
    .click();
  // The list may be stale: a status toggle must preserve a concurrent catalog edit.
  const catalog = await (await page.request.get('/api/admin/services', { headers })).json();
  const barba = catalog.find((s) => s.name === 'Barba alinhada');
  expect(
    (
      await page.request.put('/api/admin/services/' + barba.id, {
        headers,
        data: {
          name: barba.name,
          description: 'Descrição atualizada em outra sessão',
          category: barba.category,
          price: 3599,
          duration: 50,
        },
      })
    ).status(),
  ).toBe(200);
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(card(page, 'Barba alinhada')).toContainText('Inativo');
  await expect(card(page, 'Barba alinhada')).toContainText('R$ 35,99');
  const publicServices = await (await page.request.get('/api/public/' + cid + '/services')).json();
  expect(publicServices.some((s) => s.name === 'Barba alinhada')).toBe(false);
  await card(page, 'Barba alinhada').getByRole('button', { name: 'Ativar', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(card(page, 'Barba alinhada')).toContainText('Ativo');
  await page
    .locator('.gf-dashboard-sidebar')
    .getByRole('link', { name: 'Profissionais', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Profissionais', exact: true })).toBeVisible();
  await expect(page.locator('.gf-business-plan')).toContainText('Equipe · R$ 32,99/mês');
  await responsive(page, 'professionals');
  await page.getByRole('button', { name: 'Novo profissional', exact: true }).click();
  await dialog(page).getByLabel('Nome profissional').fill('Bruno Oliveira');
  await dialog(page).getByLabel('Especialidade ou descrição').fill('Especialista em degradês');
  await dialog(page).getByLabel('Corte clássico', { exact: true }).check();
  await responsive(page, 'professional-form', true);
  await dialog(page).getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(card(page, 'Bruno Oliveira')).toContainText('Profissional sem conta de login.');
  await expect(page.locator('.gf-business-plan')).toContainText('2 profissionais ativos');
  await card(page, 'Bruno Oliveira').getByRole('button', { name: 'Configurar horários' }).click();
  await expect(dialog(page).getByLabel('Modo de abertura')).toHaveValue('manual');
  await dialog(page).getByLabel('Modo de abertura').selectOption('auto');
  await dialog(page).getByLabel('Segunda-feira', { exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Salvar horários', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.gf-feedback[role="status"]')).toContainText('Horários salvos');
  await card(page, 'Bruno Oliveira').getByRole('button', { name: 'Editar profissional' }).click();
  await dialog(page).getByLabel('Nome profissional').fill('Bruno Atualizado');
  await dialog(page).getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(card(page, 'Bruno Atualizado')).toContainText('Corte clássico');
  await card(page, 'Bruno Atualizado')
    .getByRole('button', { name: 'Desativar', exact: true })
    .click();
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(card(page, 'Bruno Atualizado')).toContainText('Inativo');
  const pros = await (await page.request.get('/api/public/' + cid + '/barbers')).json();
  expect(pros.some((p) => p.name === 'Bruno Atualizado')).toBe(false);
  await page.goto('/' + cid);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).toContainText('Barba alinhada');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('deactivation shows future reservations, links to filtered agenda and rejects a stale confirmation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/profissionais?empresa=' + cid);
  await card(page, 'Rafael Silva').getByRole('button', { name: 'Desativar', exact: true }).click();
  await expect(dialog(page)).toContainText('reservas futuras ou em andamento serão mantidas');
  await dialog(page).getByRole('link', { name: 'Conferir reservas na agenda' }).click();
  await expect(page.getByLabel('Profissional', { exact: true })).toHaveValue(cid + '-pro');
  await page.goto('/app/profissionais?empresa=' + cid);
  await card(page, 'Rafael Silva').getByRole('button', { name: 'Desativar', exact: true }).click();
  const calendar = await (await page.request.get('/api/admin/agenda', { headers })).json();
  const reservation = await page.request.post('/api/admin/agenda', {
    headers,
    data: {
      date: tomorrow(calendar.today),
      time: '10:20',
      barberId: cid + '-pro',
      services: [cid + '-service'],
      guest: {
        name: 'Reserva concorrente',
        phone: '21955557777',
        email: 'concurrent-browser@example.test',
      },
    },
  });
  expect(reservation.status()).toBe(201);
  const saved = await reservation.json();
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'As reservas deste profissional mudaram',
  );
  await dialog(page).getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar cadastros' }).click();
  await expect(page.getByRole('button', { name: 'Atualizar cadastros' })).toBeEnabled();
  await card(page, 'Rafael Silva').getByRole('button', { name: 'Desativar', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(card(page, 'Rafael Silva')).toContainText('Inativo');
  const detail = await (
    await page.request.get('/api/admin/agenda/' + saved.id, { headers })
  ).json();
  expect(detail.item.status).toBe('confirmed');
  await card(page, 'Rafael Silva').getByRole('button', { name: 'Reativar', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(card(page, 'Rafael Silva')).toContainText('Ativo');
});

test('Individual errors, public clients, unauthorized management and empty states', async ({
  page,
}) => {
  await login(page);
  const one = 'business-browser-one';
  await page.goto('/app/profissionais?empresa=' + one);
  await expect(page.locator('.gf-business-plan')).toContainText('1 profissional ativo de 1');
  await page.getByRole('button', { name: 'Novo profissional', exact: true }).click();
  await dialog(page).getByLabel('Nome profissional').fill('Limite Individual');
  await dialog(page).getByLabel('Corte clássico', { exact: true }).check();
  await dialog(page).getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('limite');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.goto('/app/clientes?empresa=' + one);
  await expect(page.getByRole('heading', { name: 'Nenhum cadastro encontrado' })).toBeVisible();
  const calendar = await (await page.request.get('/api/admin/agenda', { headers })).json(),
    date = tomorrow(calendar.today);
  const reservation = await page.request.post('/api/public/' + cid + '/appointments/guest', {
    data: {
      date,
      time: '09:00',
      barberId: cid + '-pro',
      services: [cid + '-service'],
      guest: {
        name: 'Visitante Navegador Público',
        phone: '21944445555',
        email: 'visitor-browser@example.com',
      },
    },
  });
  expect(reservation.status()).toBe(201);
  await page.goto('/app/clientes?empresa=' + cid);
  await page.getByLabel('Buscar por nome, telefone ou e-mail').fill('visitor-browser');
  await expect(card(page, 'Visitante Navegador Público')).toBeVisible();
  await page.goto('/app/clientes?empresa=igor-barber-club');
  await expect(page.getByRole('alert')).toContainText('Sem acesso à empresa selecionada');
  await page.request.post('/api/auth/logout');
  await page.goto('/app/servicos?empresa=' + cid);
  await expect(page).toHaveURL(/\/app\/login/);
});
