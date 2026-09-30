# Gradefy — Fase 2B: contexto empresarial na aplicação

Implementado e validado em 30/09/2026. Esta fase adapta o acesso aos dados; não libera operação de uma segunda empresa nem autorização multi-tenant. As migrations 001, 002 e 003 permanecem intactas, sem nova migration. A constraint `gradefy_single_company` continua no fluxo normal.

## Como o contexto percorre a aplicação

`server/company-context.js` exporta `getLegacyCompanyId()`, que retorna a identidade canônica exportada pelo bootstrap da Fase 1, e `requireCompanyId()`, que rejeita contexto ausente. Não consulta a primeira empresa do banco.

O contexto é resolvido nos pontos de composição: `createApp`, inicialização local/serverless do worker, importação inicial no banco e adaptador legado `seed(db)`. Nenhum valor recebido por hostname, slug, header, query string, body ou `company_members` seleciona a empresa. `createApp` não oferece opção para ativar outra empresa.

As funções de dados recebem `companyId` e os instaladores o capturam em seus handlers. Os SQLs permanecem explícitos nos módulos existentes, usando parâmetros; não há interceptador que reescreva consultas em execução.

| Função                                                                    | Contexto explícito                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `getServices`, `occupied`                                                 | `(tx, companyId, ...)` nos helpers de agendamento                                                   |
| `appointmentList`, `book`                                                 | `(companyId, ...)` nos helpers das rotas                                                            |
| `readSchedule`                                                            | `(db, companyId, barberId)`; rejeita profissional de outro contexto antes de gerar defaults         |
| `installScheduleRoutes`, `installPortfolioRoutes`, `installGuestSessions` | `(app, db, companyId, options)`; handlers mantêm o contexto recebido                                |
| `ownsAppointment`                                                         | `(db, companyId, req, appointment, lock)`; verifica empresa mesmo quando o usuário global é o mesmo |
| `enqueueNotification`                                                     | `(db, companyId, appointmentId, event)`                                                             |
| `createNotificationProcessor`, `startNotifications`                       | `(db, companyId, ...)`                                                                              |
| `getCompanyMetrics`                                                       | `(db, companyId, today)`; cálculo puro existente preservado                                         |
| `seedLegacyCompany`, `seedPortfolio`                                      | Recebem `companyId`; recusam outra empresa, pois importam conteúdo e IDs legados específicos        |

`seed(db)` permanece como adaptador de compatibilidade, delegando ao seed com contexto explícito. O bootstrap canônico continua idempotente e específico da Igor, sem atribuir plano. Não foi convertido em cadastro genérico de empresas.

## Auditoria SQL e classificação

| Módulo / tabelas                                                                                                               | Classificação e mudança                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.js`: `services`, `barbers`                                                                                                | Leitura pública e validação: catálogo ativo, seleção e lookup por ID filtram empresa                                                            |
| `app.js`: `appointments`, `appointment_services`, `guest_appointments`                                                         | Leitura autenticada/administrativa, gravação e conflito: criação, histórico, remarcação, cancelamento, status, snapshots e vínculos com empresa |
| `app.js`: `blocks`                                                                                                             | Leitura administrativa e gravação: período, conflito, criação e remoção filtram empresa                                                         |
| `schedule.js`: `barbers`, `barber_settings`, `barber_working_hours`, `barber_working_breaks`, `released_weeks`, `appointments` | Leituras pública/administrativa e gravação: existência, configurações, intervalos, semanas e reservas afetadas pela edição                      |
| `portfolio.js`: `portfolio`                                                                                                    | Leitura pública/administrativa e gravação: catálogo, imagem, contagem máxima, versão, criação, atualização e remoção                            |
| `guest-session.js`: `guest_sessions`, `guest_appointments`, `appointments`                                                     | Leitura autenticada e gravação: token, renovação, expiração, histórico, posse e reentrada de demonstração                                       |
| `notifications.js`: `notifications`, `appointments`, `appointment_services`, `barbers`, `guest_appointments`                   | Gravação/background: snapshot e vínculos conferidos no contexto; fila, claim, destinatário, conclusão e retry filtrados                         |
| `company-metrics.js`: `appointments`, `appointment_services`; `app.js`: `notifications`                                        | Cálculo/métrica: faturamento e agregações usam apenas linhas da empresa                                                                         |
| `seed.js`, `portfolio-seed.js`                                                                                                 | Seed/importação: existência do catálogo e INSERTs operacionais recebem empresa explicitamente                                                   |

Todos os INSERTs operacionais dos módulos acima usam `company_id` como parâmetro: profissionais, serviços, fotos, configurações/horários/intervalos/semanas, reservas e seus itens, sessões e vínculos de visitantes, bloqueios e notificações. Não interpolam mais a constante Igor no SQL de negócio.

UPDATEs, DELETEs e soft deletes incluem a empresa junto do identificador ou chave composta. O UPSERT de `barber_settings` também condiciona a atualização à igualdade de empresa. A remarcação remove apenas os itens históricos daquela reserva e empresa antes de recriá-los.

JOINs entre recursos empresariais conferem igualdade de `company_id`. As subqueries do histórico visitante e da reentrada de demonstração têm escopo; consultas de COUNT, imagem, versão, conflitos, destinatário e itens históricos foram incluídas na auditoria.

Exceções deliberadas: `users`, `password_recovery`, `password_recovery_limits` e `content_migrations` continuam globais, conforme o schema da Fase 2A. `profile.js` e `password-recovery.js` foram revisados, sem alteração. Consultas de inspeção, backfill e integridade em `database.js`, `guest-migration.js`, `migrations.js`, `foundation-integrity.js` e `data-ownership.js` são manutenção do schema inteiro sob os controles existentes, não consultas operacionais. Catálogos globais e o bootstrap canônico não se transformam em seleção empresarial por usuário.

## Rotas e comportamentos preservados

As URLs, payloads públicos, telas e autorização administrativa permanecem os mesmos. Mudaram internamente:

- `GET /api/services`, `/api/barbers`, `/api/availability`.
- `GET /api/barbers/:id/schedule` e GET/PUT `/api/admin/barbers/:id/schedule`; POST `/api/admin/barbers/:id/released-weeks`.
- GET/POST `/api/appointments`, POST `/api/appointments/guest`; PATCH `/api/appointments/:id/reschedule` e `/cancel`.
- GET `/api/admin/appointments`, PATCH `/api/admin/appointments/:id/status`.
- POST/PUT/DELETE administrativos de serviços; GET/POST/DELETE de bloqueios.
- GET `/api/portfolio` e `/api/portfolio/:id/image`; POST/PUT/DELETE administrativos do portfólio.
- GET `/api/admin/metrics` e `/api/admin/notifications`.
- Middleware visitante usado por `/api/auth/me`, `/api/auth/logout`, reservas e acesso de teste já existente.

Um ID de outra empresa é tratado como inexistente/indisponível. DELETEs de foto e bloqueio mantêm o contrato idempotente anterior: podem retornar 200 sem remover nada. Nenhum conteúdo estrangeiro é devolvido.

Os nomes, atributos e prazos dos cookies e o formato/segredo/issuer/audience dos JWTs não mudaram. Não foi adicionada autorização por `company_members`. Locks, transações, cálculo dos slots e fuso de Brasília permanecem com a arquitetura anterior.

## Visitantes e notificações

Um token visitante exige lookup com empresa. A posse de uma reserva verifica empresa antes de comparar usuário ou sessão. A revogação em A não expira uma sessão de B.

Como `token_hash` ainda tem UNIQUE global, a tentativa de iniciar uma reserva em A com um token de B poderia causar conflito no INSERT. O INSERT usa `ON CONFLICT(token_hash) DO NOTHING`, confere a criação no contexto atual e, se necessário, gera outro token aleatório. Não lê, reabre ou modifica o visitante estrangeiro; uma falha também no novo token aborta a transação. O lock de agendamento continua protegendo primeiras reservas simultâneas legítimas.

A empresa é persistida na linha da outbox. Enfileirar um ID de reserva estrangeiro falha antes de criar eventos. O worker seleciona e atualiza apenas a fila da empresa recebida e busca o destinatário pela mesma empresa e reserva. Textos e configuração de provedores permanecem legados da Igor: branding e credenciais por empresa não estão prontos para operação de várias empresas. Provedores são simulados nos testes; nenhuma mensagem real foi enviada.

## Testes e resultados

`tests/helpers/application-context.js` executa o mesmo contrato nos dois bancos. A fixture possui dados em todas as 13 tabelas operacionais para B, incluindo reservas vinculadas ao mesmo usuário global de A. Compara o snapshot inteiro de B após as tentativas de leitura/escrita, seed e processamento da fila.

Em SQLite usa somente `:memory:`. Primeiro prova a rejeição da segunda empresa, libera CHECK exclusivamente para inserir a fixture, restaura imediatamente a verificação e comprova que uma terceira empresa continua rejeitada. FKs permanecem ligadas. Em PostgreSQL, o teste cria um banco no cluster descartável validado pelo runner e remove a constraint somente ali. Nenhum desses procedimentos integra o inicializador da aplicação.

Cobertura adicional: listas e imagens, agenda pública/administrativa, indisponibilidade de serviço/profissional estrangeiro, exclusão `except` da disponibilidade, histórico por usuário/visitante, cancelamento/remarcação/status, versão do portfólio, soft/hard delete, INSERTs com empresa correta, injeção de empresa via request, releases, agregações financeiras e de notificações, worker, contexto ausente e preservação dos seeds. Testes existentes continuam cobrindo concorrência, rollback e fluxos completos.

| Validação final                                                  | Resultado                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm.cmd test` — unitários, integração e SQLite                  | 72 aprovados, zero falhas                                                  |
| Runner PostgreSQL local 17.11                                    | 27 aprovados (18 testes principais e 9 subtestes do contrato), zero falhas |
| `npm.cmd run test:e2e` — Chromium, desktop e cenários mobile web | 16 aprovados                                                               |
| `npm.cmd run build` — TypeScript web, checkJs da agenda e Vite   | Aprovado                                                                   |
| `npm.cmd test` em `app-mobile`                                   | 5 aprovados                                                                |
| `npm.cmd run typecheck` em `app-mobile`                          | Aprovado                                                                   |

O PostgreSQL foi provisionado pelo runner portátil local já disponível (`tests/postgres/run-local.mjs --bin <pasta-bin-PostgreSQL-17.11>`), em `127.0.0.1`, porta aleatória e cluster novo com autenticação SCRAM. O runner limpa variáveis de conexão, valida marcador e diretório do cluster e impede fallback para produção. O cluster foi parado e removido ao terminar. Relatório local ignorado pelo Git: `test-results/postgres-validation/report.json` e `output.txt`.

Métricas da fixture determinística em 30/09/2026, calculadas com as queries anteriores antes de inserir dados operacionais de B e comparadas integralmente com a nova função e endpoint após inserir B:

| Métrica Igor            | Antes    | Depois SQLite | Depois PostgreSQL |
| ----------------------- | -------- | ------------- | ----------------- |
| Faturamento diário      | R$ 70,00 | R$ 70,00      | R$ 70,00          |
| Faturamento anual       | R$ 95,00 | R$ 95,00      | R$ 95,00          |
| Atendimentos no período | 3        | 3             | 3                 |
| Clientes distintos      | 1        | 1             | 1                 |
| Ticket médio            | R$ 31,67 | R$ 31,67      | R$ 31,67          |

Todos os demais campos (semanal, mensal, melhores dias, serviços e gráfico) também são comparados por igualdade integral. A receita diária de B de R$ 9.999,99 não contamina A.

Durante a validação, foram corrigidas duas questões na fixture: SQLite retorna objetos com protótipo nulo enquanto JSON retorna objetos comuns; o runner PostgreSQL desativa demo e exige dados financeiros de teste explícitos. COUNT do PostgreSQL continua sendo string pelo driver e do SQLite, número; somente o teste normaliza essa comparação, preservando o contrato anterior da API. Nenhuma nova divergência funcional foi observada na execução final.

## Arquivos da entrega

Criados: `server/company-context.js`, `server/company-metrics.js`, `tests/application-context.test.js`, `tests/helpers/application-context.js`, `docs/GRADEFY-APPLICATION-CONTEXT.md`.

Modificados: `server/app.js`, `server/database.js`, `server/guest-session.js`, `server/index.js`, `server/notifications.js`, `server/portfolio-seed.js`, `server/portfolio.js`, `server/schedule.js`, `server/seed.js`, `server/serverless.js`, `tests/guest.test.js`, `tests/notifications.test.js`, `tests/portfolio.test.js`, `tests/postgres/foundation.test.js`, `docs/GRADEFY-MIGRATION.md`.

## Limites e Fase 3

O contexto interno é confiável por construção e não constitui autorização multi-tenant completa. Os usuários e o papel `admin` continuam globais. Ainda faltam resolver empresa de forma confiável, validar associação e papéis empresariais antes de chamar a camada de dados, definir escopo de sessões/cookies e configurar marca/provedores por empresa. Nada disso foi antecipado nesta fase. A eventual revisão dos locks globais continua para a etapa específica de concorrência.

O acesso direto ao banco continua sujeito às credenciais do servidor, sem RLS. Novas consultas deverão seguir o mesmo contrato e ampliar os testes negativos. A restrição de empresa única não pode ser retirada para operação real apenas com esta entrega.

`npm.cmd run format:check` e `git diff --check` também passaram. O diff das migrations 001–003, das interfaces, de `profile.js`, de `password-recovery.js` e de `app-mobile` está vazio. Os avisos do Git sobre conversão futura LF/CRLF são informativos, sem erro de whitespace.

Nenhum banco Supabase ou de produção foi acessado. Nenhuma interface, autenticação, migration registrada ou funcionalidade mobile foi alterada. Nenhum commit foi realizado.
