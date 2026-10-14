# Gradefy — Configurações operacionais (7F.3B)

## Experiência e permissões

`/app/configuracoes?empresa=<id>` oferece informações operacionais, funcionamento, regras de reserva, cancelamento/reagendamento e pausa de reservas online. Usa os componentes Gradefy existentes, seletor de empresa, estados de carregamento, sucesso, erro e recarga. A navegação móvel acomoda os itens numa única linha com rolagem interna e mantém a seção atual visível.

Proprietário e gestor seguem a autorização administrativa existente, com membership consultada no servidor e entitlements validados em cada operação. Profissional, pessoa externa e visitante não acessam configurações globais. Assinatura ou trial expirado mantém apenas leitura. Não há promoção de papel, alteração de login, convite ou criação de assinatura.

Nome vem de `companies`; telefone e endereço, de `company_settings`, compartilhados com Meu Site. Logo, cores, fotos, textos editoriais e publicação não são sobrescritos. Os contatos e a configuração são salvos em uma transação. Versões operacionais e editoriais impedem que abas antigas sobrescrevam alterações feitas no outro editor.

## Endpoints

| Método/rota               | Comportamento                                                                     |
| ------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/admin/settings` | Snapshot operacional, versões, permissões, profissionais e proteção de fuso.      |
| `PUT /api/admin/settings` | Validação estrita, autorização atual, versão otimista e atualização transacional. |

As duas rotas exigem sessão administrativa e `X-Gradefy-Company-Id` explícito. O contexto empresarial existente resolve a empresa; IDs ou papéis enviados no payload não substituem a autorização.

Foram reutilizadas as rotas de disponibilidade, criação, reagendamento, cancelamento, agenda individual e site público. As rotas públicas de uma empresa continuam sob `/api/public/<slug>/...`; as URLs legadas da Igor permanecem válidas. O endpoint público de site inclui `settings.online_booking_enabled`, lido da configuração atual mesmo quando o conteúdo visual já está publicado.

## Persistência e padrões

Migration nova: `016-gradefy-operational-settings.sql`. Acrescenta somente oito colunas a `company_settings`, com constraints numéricas compatíveis com PostgreSQL e SQLite:

| Campo                       | Padrão / limite                                                             |
| --------------------------- | --------------------------------------------------------------------------- |
| `operational_version`       | 0, inteiro não negativo                                                     |
| `minimum_notice_minutes`    | 0; até 10080 minutos                                                        |
| `maximum_booking_days`      | NULL; quando definido, 1–90 dias corridos à frente                          |
| `buffer_minutes`            | 0; até 180 minutos                                                          |
| `cancel_notice_minutes`     | 0; até 10080 minutos                                                        |
| `reschedule_notice_minutes` | 0; até 10080 minutos                                                        |
| `online_booking_enabled`    | 1; somente 0 ou 1                                                           |
| `working_days_json`         | NULL; quando definido, sete dias com expediente e até quatro pausas por dia |

NULL para funcionamento e janela mantém a agenda individual anterior, inclusive abertura manual e janela automática em dias úteis. Zero para prazos e buffer preserva o comportamento legado. Não há migração de reservas, preços, duração ou registros financeiros. Migrations 001–015 não foram editadas. Execução repetida e falha intermediária da 016 são testadas: a migration só entra no journal após commit integral.

## Disponibilidade e concorrência

O motor existente continua responsável por produzir slots. A jornada efetiva é a interseção entre empresa e profissional: ambos precisam estar ativos, início é o maior dos dois, fim é o menor, e pausas dos dois participam da lista de intervalos ocupados. Bloqueios individuais e reservas existentes continuam ocupando tempo. Alterar o funcionamento empresarial não cancela nem move reservas antigas.

O buffer é separado da duração do serviço. Na grade livre, o passo é duração mais buffer. Reservas existentes têm sua ocupação expandida pelo buffer nos dois lados, sem acrescentar tempo extra às pausas fixas ou bloqueios. Reservas dos dias adjacentes são consideradas quando o intervalo atravessa meia-noite. O último serviço pode terminar exatamente no encerramento; o intervalo não precisa caber depois do último atendimento se não houver outra reserva. O buffer não muda preços, snapshots de serviços ou pagamentos.

Antecedência e janela máxima são regras para reservas públicas. O prazo é medido pelo relógio do servidor até o instante real do atendimento; a janela é contada em datas locais corridas a partir de hoje. A gestão pode reservar fora desses prazos, mas precisa respeitar expediente, pausas, buffer, conflitos e a abertura individual da agenda.

Consulta é um snapshot; confirmação sempre revalida. A atualização de políticas usa lock empresarial exclusivo, e confirmação/cancelamento usam o mesmo recurso em modo compartilhado antes dos locks da reserva e dos profissionais. PostgreSQL usa advisory locks transacionais; SQLite reutiliza a serialização transacional existente. Duas conexões foram testadas para reserva concorrente e atualização de política enquanto uma confirmação espera. A confirmação consulta novamente o relógio após esperar pelos locks dos profissionais.

## Cancelamento, reagendamento e pausa

As ações públicas existentes validam propriedade da reserva e antecedência no servidor. A consulta de slots para reagendamento também verifica o prazo da reserva original. Uma ação administrativa segue suas permissões atuais e não fica bloqueada pelo prazo do cliente. Histórico e pagamentos não são alterados automaticamente.

Desativar **Aceitar agendamentos online** bloqueia novos agendamentos públicos tanto na consulta quanto na confirmação. O Barber Classic exibe uma mensagem amigável e mantém acesso ao site. A configuração não despublica o site e não altera trial ou assinatura. Agenda administrativa e ações permitidas sobre reservas existentes continuam disponíveis. Reativar restaura novas reservas imediatamente, sem republicar o site.

## Fuso e limite deliberado

Fusos são identificadores IANA validados pelo `Intl`. Datas de abertura de agenda, antecedência e cancelamento usam o fuso empresarial e o relógio do servidor. A conversão de data/hora local rejeita horários inexistentes ou ambíguos em transições de horário de verão; também rejeita serviços que cruzem a transição com duração real diferente da nominal.

O banco legado armazena data e minutos locais, sem um instante UTC por reserva. Por isso, mudar o fuso é permitido apenas antes da primeira reserva da empresa. Com qualquer reserva histórica ou futura, o campo fica protegido e a API retorna `TIMEZONE_HISTORY_LOCKED`. Isso impede reinterpretar silenciosamente o histórico. Suportar troca de fuso posteriormente exigirá uma migração temporal específica; não foi incluída nesta fase.

O calendário público e a lista de próximos horários também usam o fuso empresarial. Um teste de apresentação fixa o relógio em `2026-10-14T03:30Z` e confirma que Manaus ainda mostra 13/10 e permite visualizar uma reserva local de 23:50. Esse teste simula apenas as respostas de apresentação; as políticas e transações são verificadas separadamente com APIs reais em SQLite e PostgreSQL.

## Arquivos desta fase

Novos:

- `server/migrations/016-gradefy-operational-settings.sql`
- `server/operational-settings.js`
- `src/gradefy/operational-settings.tsx`
- `src/gradefy/operational-settings.css`
- `tests/operational-settings.test.js`
- `tests/helpers/operational-settings.js`
- `tests/helpers/operational-settings-migration.js`
- `tests/e2e/gradefy-operational-settings.spec.js`
- `docs/GRADEFY-OPERATIONAL-SETTINGS-7F3B.md`

Integração:

- `server/app.js`, `server/domain.js`, `server/schedule.js`, `server/migrations.js`, `server/public-site.js`
- `server/clients.js`: somente parâmetro opcional explícito, exigido pela checagem TypeScript da dependência já existente.
- `src/main.tsx`, `src/types.ts`, `src/pages/Booking.tsx`, `src/pages/Account.tsx`
- `src/gradefy/Shell.tsx`, `src/gradefy/business-nav.tsx`, `src/gradefy/business-management.css`

Fixtures e versões esperadas ajustadas para a 016, sem alterar o objetivo das suítes anteriores:

- `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`, `tests/postgres/foundation.test.js`
- `tests/e2e/gradefy-site-editor.spec.js`: aguarda o login concluir antes de navegar, evitando que o próprio teste aborte o POST de autenticação.
- `tests/helpers/access-migration.js`, `agenda.js`, `barber-classic-migration.js`, `barber-classic.js`, `business-management.js`, `company-onboarding.js`, `data-ownership.js`, `finance-migration.js`, `finance.js`, `operational-onboarding.js`, `professional-idempotency.js`, `professionals-migration.js`, `scheduling-reliability.js`, `site-editor.js`, `team-migration.js`

A remoção das novas colunas para reconstruir bancos antigos existe exclusivamente no helper de testes. Não é uma migration destrutiva nem um procedimento para banco real. As alterações anteriores de equipe/entrada por perfil, ainda sem commit, foram preservadas.

## Validação local

Ambiente sem carregar `.env`, com `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL` e `POSTGRES_URL` vazios. Backend e navegador utilizam fixtures descartáveis SQLite em memória. PostgreSQL 17.11 foi iniciado em cluster temporário local, em `127.0.0.1`, encerrado e removido pelo runner. Nenhum banco de produção foi acessado.

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
node --test tests/operational-settings.test.js
npm.cmd test
node tests/postgres/run-local.mjs --bin 'C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin'
npm.cmd run build
npx.cmd playwright test
npm.cmd run format:check
git diff --check
```

O build executa TypeScript do frontend e `check:schedule` do backend. A suíte compartilhada PostgreSQL/SQLite cobre permissões, isolamento, Individual/Equipe, trial expirado, versões, rollback, constraints, limites temporais, dias fechados, pausas conjuntas, buffer, meia-noite, concorrência, pausa, cancelamento/reagendamento, DST e preservação financeira/legada. O Chromium testa persistência após recarga, seletor empresarial, feedback, aba desatualizada, pausa pública, agenda administrativa e layouts de 320/390/768/1440 px. As suítes anteriores de convites, login, editor e Barber Classic continuam na rodada completa.

Resultados em 13/10/2026:

| Verificação                           | Resultado                                                   |
| ------------------------------------- | ----------------------------------------------------------- |
| Backend/SQLite dirigido               | 12 passaram                                                 |
| Backend/SQLite completo               | 239 passaram                                                |
| PostgreSQL 17.11 local completo       | 184 passaram                                                |
| E2E dirigido de configurações/fuso    | 3 passaram                                                  |
| E2E completo Chromium                 | 68 passaram                                                 |
| Build + TypeScript + `check:schedule` | Passou                                                      |
| Prettier e `git diff --check`         | Passaram                                                    |
| Visual 320/390/768/1440 px            | Verificado, incluindo formulário de funcionamento expandido |

Um teste anterior do editor navegava antes de receber a resposta do login. O trace registrou POST sem resposta HTTP; esperar a navegação após autenticar corrigiu a sincronização do teste. Não houve alteração de autenticação na aplicação. Os dois testes do editor passaram na repetição dirigida.

Logs ignorados pelo Git: `test-results/settings-directed.log`, `settings-backend-full.log`, `settings-postgres.log`, `settings-e2e-directed.log`, `settings-e2e-full.log`, `settings-editor-recheck.log`, `settings-build.log` e `settings-format.log`. Capturas: `test-results/operational-settings-*.png` e `operational-hours-*.png`. `test-results/postgres-validation/report.json` confirma `productionAccess: false`, `clusterStopped: true` e `clusterRemoved: true`.

Para demonstração descartável, depois do build:

```powershell
$env:RESEND_API_KEY=''
$env:EMAIL_FROM=''
node tests/browser-server.js
```

Abra `http://127.0.0.1:4173/app/configuracoes?empresa=business-browser-team`. Faça login com `business-browser-owner@example.com` / `ClienteDemo2026!`, exclusivos do fixture. O fixture não envia e-mails reais. A empresa de exemplo tem histórico, portanto seu fuso fica protegido.

Nenhum commit, push, deploy, alteração da landing/Cloudflare ou início da 7F.3C. O painel próprio de Profissional permanece pendente para essa fase.
