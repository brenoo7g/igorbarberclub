# Gradefy — Gestão empresarial 7F.2B

## Telas e dados

- `/app/clientes?empresa=<id>`: lista paginada de 30 registros, busca por nome/telefone/e-mail, cadastro sem login, edição com versão, observações internas e detalhes com data do cadastro no fuso da empresa. O e-mail é opcional.
- `/app/servicos?empresa=<id>`: os mesmos serviços do onboarding, preço em centavos, duração, categoria, descrição, associações explícitas e ativação/desativação com confirmação.
- `/app/profissionais?empresa=<id>`: os mesmos profissionais da agenda, especialidade, foto por URL HTTPS, serviços, status e os horários já existentes. Não cria contas nem memberships.

Sidebar no desktop e navegação móvel compartilhadas com a agenda e o dashboard. Atalhos de Clientes, Serviços e Profissionais abrem as páginas reais. Filtros, loading, erros, retry, estados vazios e confirmações usam os componentes Gradefy existentes. O Barber Classic e as URLs da Igor mantêm sua identidade.

## APIs

Novas, sempre com sessão e `X-Gradefy-Company-Id` explícito:

| Método | Caminho                                    | Comportamento                                                                   |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| GET    | `/api/admin/management`                    | Empresa, permissão efetiva de edição, entitlements e plano do catálogo real     |
| GET    | `/api/admin/clients?page=1&q=...`          | Busca paginada; não inclui notas ou identidade de origem                        |
| POST   | `/api/admin/clients`                       | Cadastro manual; aceita `Idempotency-Key` persistente por empresa/ator/operação |
| GET    | `/api/admin/clients/:id?page=1&status=...` | Dados locais, observações, histórico paginado e próxima reserva                 |
| PUT    | `/api/admin/clients/:id`                   | Edição local com `version`; outra edição concorrente produz 409                 |

Reutilizadas: `/api/admin/services` (GET/POST/PUT/DELETE), `/api/admin/professionals` (GET/POST/PUT/PATCH status), `/api/admin/barbers/:id/schedule` (GET/PUT), `/released-weeks` e as rotas de agenda da 7F.2A. DELETE de serviço continua sendo desativação lógica. As APIs legadas recebem os mesmos controles de entitlement para impedir bypass de assinatura; o onboarding mantém seu guard específico.

`PATCH /api/admin/services/:id/status` recebe somente `{ active: boolean }`, usando o lock do catálogo existente. Não reenvia os detalhes da lista e, portanto, preserva edições de nome, preço, duração e associações feitas em outra sessão.

Antes de desativar um profissional, a interface informa quantas reservas confirmadas futuras ou em andamento serão mantidas e oferece um link para a agenda filtrada por `professionalId`. A contagem respeita o fuso da empresa. A confirmação envia `expectedUpcoming`; sob o mesmo lock usado para agendamentos, uma contagem diferente produz HTTP 409 (`PROFESSIONAL_APPOINTMENTS_CHANGED`) e exige atualização dos cadastros. Reservas existentes nunca são canceladas automaticamente. Chamadas legadas sem esse campo mantêm o comportamento anterior de desativação não destrutiva.

A agenda aceita `clientId` empresarial, mantendo compatibilidade com `guest` e `userId` legados. Identidades não podem ser trocadas ao reagendar. O detalhe de um atendimento oferece acesso ao cadastro do cliente; o histórico permite voltar ao atendimento.

## Migration 013

`013-gradefy-business-clients.sql` adiciona `company_clients` e `client_appointments`. Era necessária porque usuários globais e sessões de visitante não são um cadastro empresarial editável: editar essas contas para atender um gestor alteraria login e dados de outros estabelecimentos. Não há outra base de serviços ou profissionais.

- IDs e referências empresariais obrigatórios são explicitamente NOT NULL.
- FKs compostas impedem vincular cliente e reserva de empresas diferentes.
- O backfill vincula contas por ID de usuário, visitantes por ID de sessão e reservas antigas sem identidade por ID da própria reserva.
- Não agrupa automaticamente por nome, telefone ou e-mail. Reservas sem uma identidade estável podem gerar cadastros separados; não há ferramenta de mesclagem nesta fase.
- Cadastros manuais exatamente iguais recebem um aviso de duplicação; pessoas com o mesmo telefone e outros dados diferentes continuam independentes.
- Novas reservas fazem o vínculo dentro da transação existente, juntamente com snapshots, outbox e idempotência. Importações/fixtures posteriores são sincronizadas de forma idempotente e autorizada na primeira consulta da gestão.
- Uma edição de cliente altera somente o cadastro empresarial. Reservas manuais com cliente selecionado guardam os contatos usados naquele atendimento. Contas públicas preservam a regra legada de refletir as alterações feitas pelo próprio usuário em seu perfil.
- Sem e-mail, não é criada uma tarefa de envio de e-mail com destinatário nulo. A infraestrutura de notificações existente é reutilizada.
- Acrescenta `client-create` à mesma infraestrutura de idempotência; não implementa um segundo sistema.
- O runner controla versão/checksum/transação. Migrações anteriores não são editadas. O teste injeta falha, verifica rollback, reexecuta e comprova preservação do legado e ausência de duplicações.

## Permissões e limites

Somente owner/manager ativos de uma empresa ativa têm acesso. Toda leitura, edição, histórico e associação usa a empresa validada no servidor. Parâmetros da interface não concedem permissão. Notas internas não aparecem em listas públicas, reservas ou notificações. Nenhuma conta ou permissão administrativa é concedida ao cadastrar profissional/cliente.

O painel exibe o preço do catálogo existente; não define planos locais no frontend. Individual continua com 2.299 centavos/mês e uma vaga ativa; Equipe com 3.299 e limite numérico nulo. Ambos mantêm sete dias de trial. Inativos não consomem vagas; owner só conta quando também possui um profissional ativo. Criação e reativação preservam o lock de entitlements existente, inclusive entre conexões PostgreSQL distintas. Igor continua sem assinatura automática. Assinatura expirada permite consulta, bloqueia alterações e não impede o replay autorizado de uma criação já concluída.

## Validação

Testes específicos: cadastro, busca/paginação, e-mail opcional, idempotência e concorrência, rollback, histórico, agendamento manual/público, edição sem alterar usuários globais, identidade do mesmo usuário em duas empresas, associações, preço/duração, status sem sobrescrever detalhes alterados em outra sessão, confirmação com reservas futuras e rejeição de contagem desatualizada, fotos, horários, limite/reativação concorrente do Individual, Team, permissão e isolamento.

Suítes completas: backend/SQLite, PostgreSQL descartável local 17.11, Chromium E2E, build com TypeScript e check JS da agenda, Prettier e `git diff --check`. PostgreSQL usa o runner protegido existente, com cluster novo em loopback e remoção ao terminar. Não usa Supabase, produção ou conexão de `.env`.

Capturas e verificações de overflow das três telas e formulários em 320, 390, 768 e 1440 px ficam em `test-results/` (ignorado pelo Git).

Resultados da retomada: 16/16 testes direcionados de gestão/planos, 180/180 backend/SQLite, 128/128 PostgreSQL local e 52/52 E2E Chromium da regressão completa. Os 4/4 E2E específicos da gestão também passaram isoladamente. Build/TypeScript/check JS, Prettier e `git diff --check` passaram. O relatório PostgreSQL confirma `productionAccess=false`, `clusterStopped=true` e `clusterRemoved=true`. Logs locais: `test-results/7f2b-backend-final.log`, `7f2b-postgres-complete.log`, `7f2b-e2e-full.log`, `7f2b-e2e-directed.log`, `7f2b-format-final.log` e `7f2b-build-final.log`.

## Visualização descartável local

Em PowerShell, sem carregar o `.env`:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
npm.cmd run build
node tests/browser-server.js
```

Esse servidor usa SQLite em memória, fixtures fictícias e não inicia worker de envio. Acesse `http://127.0.0.1:4173/app/login` com `business-browser-owner@example.com` / `ClienteDemo2026!`. Depois:

- `http://127.0.0.1:4173/app/clientes?empresa=business-browser-team`
- `http://127.0.0.1:4173/app/servicos?empresa=business-browser-team`
- `http://127.0.0.1:4173/app/profissionais?empresa=business-browser-team`

Em um ambiente de desenvolvimento já configurado, as mesmas rotas funcionam em `http://localhost:5173`, usando uma conta owner/manager existente. Não utilize o servidor descartável para guardar dados reais: o banco desaparece ao encerrar.

## Arquivos desta etapa

Criados:

- `server/clients.js`
- `server/migrations/013-gradefy-business-clients.sql`
- `src/gradefy/business-management.tsx`
- `src/gradefy/business-management.css`
- `src/gradefy/business-nav.tsx`
- `tests/business-management.test.js`
- `tests/helpers/business-management.js`
- `tests/helpers/business-browser.js`
- `tests/e2e/gradefy-business-management.spec.js`
- `docs/GRADEFY-BUSINESS-MANAGEMENT-7F2B.md`

Alterados na integração:

- `server/app.js`, `server/migrations.js`, `server/notifications.js`, `server/services.js`, `server/professionals.js`, `server/schedule.js`, `server/agenda.js`
- `src/main.tsx`, `src/gradefy/Shell.tsx`, `src/gradefy/components.tsx`, `src/gradefy/business-types.ts`, `src/gradefy/dashboard.tsx`, `src/gradefy/agenda.tsx`, `src/gradefy/agenda-types.ts`
- `tests/browser-server.js`, `tests/postgres/foundation.test.js`, `tests/e2e/gradefy-dashboard.spec.js`, `tests/helpers/multitenant-access.js`, `tests/helpers/agenda.js`, `tests/helpers/site-editor-migration.js`, `tests/helpers/scheduling-reliability.js`

Atualização das expectativas de versões até 013, sem enfraquecer os testes de legado:

- `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`
- `tests/helpers/access-migration.js`, `tests/helpers/barber-classic.js`, `tests/helpers/company-onboarding.js`, `tests/helpers/data-ownership.js`, `tests/helpers/operational-onboarding.js`, `tests/helpers/professional-idempotency.js`, `tests/helpers/professionals-migration.js`, `tests/helpers/site-editor.js`

As alterações ainda não commitadas da 7F.2A foram preservadas: migration 012, módulos/telas/helpers de agenda e sua documentação, além de mudanças anteriores em `server/domain.js` e `tests/helpers/barber-classic-migration.js`. Alguns arquivos compartilhados agora contêm integração das duas etapas. Não foi feito commit ou push.

Nesta retomada foram refinados nove arquivos: `server/clients.js`, `server/professionals.js`, `server/services.js`, `src/gradefy/business-types.ts`, `src/gradefy/business-management.tsx`, `src/gradefy/agenda.tsx`, `tests/helpers/business-management.js`, `tests/e2e/gradefy-business-management.spec.js` e esta documentação. A migration 013 já estava presente; nenhuma migration adicional foi criada ou modificada. Os checksums de todas as migrations e os conteúdos de `marketing/` e do repositório separado da landing foram comparados antes/depois e permaneceram iguais.

## Limites e continuidade

Foto do profissional usa URL HTTPS já suportada; não há upload novo. Não há merge automático de clientes, exclusão destrutiva, campanhas, convites administrativos, cobranças ou gestão financeira. O histórico usa snapshots dos serviços; nomes de profissionais seguem a regra existente do cadastro atual. Uma importação legada muito grande pode tornar a primeira sincronização de clientes mais demorada. Não foi iniciada a 7F.2C; seu escopo deverá ser definido na próxima solicitação.
