# Gradefy — Financeiro operacional (7F.2C.1)

## Interface

`/app/financeiro` usa os componentes e a identidade Gradefy, com seleção explícita de empresa, filtros de período/tipo, cinco indicadores e histórico paginado (30 itens). Financeiro está na navegação lateral/mobile e no atalho do dashboard. Os detalhes da agenda compartilham o mesmo painel de recebimentos.

Os formulários permitem registrar recebimentos, cadastrar despesas, editar despesas pendentes, marcar pagamento e confirmar estorno/anulação com motivo. Incluem carregamento, falha de conexão com nova tentativa, ausência de registros e consulta em modo somente leitura.

## Endpoints

Todos os caminhos abaixo têm prefixo `/api`, exigem a sessão existente, `X-Gradefy-Company-Id` validado e membership owner/manager. Não existe endpoint financeiro público.

| Método | Caminho                                                            | Uso                                                              |
| ------ | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| GET    | `/admin/finance?from=YYYY-MM-DD&to=YYYY-MM-DD&type=all&page=1`     | Indicadores e movimentações; tipos `all`, `payments`, `expenses` |
| GET    | `/admin/finance/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1` | Seleção paginada de atendimentos confirmados/concluídos          |
| GET    | `/admin/finance/appointments/:id?page=1`                           | Preço histórico, recebido, restante e pagamentos/estornos        |
| POST   | `/admin/finance/payments`                                          | Registrar recebimento parcial/integral                           |
| POST   | `/admin/finance/payments/:id/reverse`                              | Estornar integralmente um registro manual                        |
| POST   | `/admin/finance/expenses`                                          | Criar despesa pendente ou paga                                   |
| GET    | `/admin/finance/expenses/:id?page=1`                               | Consultar despesa e auditoria                                    |
| PUT    | `/admin/finance/expenses/:id`                                      | Corrigir despesa pendente, com motivo                            |
| POST   | `/admin/finance/expenses/:id/pay`                                  | Marcar despesa pendente como paga                                |
| POST   | `/admin/finance/expenses/:id/void`                                 | Anular lançamento preservando seu histórico                      |

Todas as escritas exigem `Idempotency-Key` (8–128 caracteres). Reutilizam a infraestrutura persistente existente, com escopo empresa + ator + operação + chave, comparação de payload e validade de 24 horas. Resultado e alterações são gravados na mesma transação; falha não deixa chave bloqueada. O frontend conserva a chave da mesma tentativa após falha de conexão.

## Política financeira

- Valores são inteiros em centavos, entre 1 e 100.000.000 por lançamento. O servidor consulta o preço histórico do atendimento; não aceita um total original arbitrário do formulário.
- Recebimentos podem ser parciais. Cada operação informa o saldo recebido que o gestor consultou (`expectedReceivedCents`). O bloqueio do atendimento e a comparação desse saldo impedem repetição indevida e excesso sob concorrência, inclusive com chaves diferentes.
- Somente atendimentos confirmados/concluídos admitem novos recebimentos. Concluir não registra pagamento; receber não muda o status nem o preço do atendimento.
- Cancelar/registrar ausência mantém o dinheiro e o histórico. Devolução exige um estorno manual explícito; o Gradefy não devolve valores bancários.
- Um estorno reverte todo o lançamento selecionado e ocorre uma única vez. Pagamentos originais são mantidos, com usuário responsável, data/hora e motivo do estorno.
- Despesas pendentes podem ser corrigidas com versionamento otimista e snapshots antes/depois. Não entram em despesas pagas.
- Uma despesa paga não admite edição direta: anular com motivo, depois criar um lançamento correto. O valor e a data do pagamento original permanecem; a anulação registra a correção na data atual.
- Não há exclusão financeira nas APIs. Usuários/data/hora/motivos ficam registrados na auditoria. O histórico mostra também os nomes dos responsáveis, mantendo seus IDs no banco.
- Remarcação que alteraria o preço de atendimento com histórico de recebimentos é rejeitada. Remarcações que preservam o preço e os fluxos existentes sem histórico financeiro continuam funcionando.

## Indicadores e datas

| Indicador                    | Regra                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Valor previsto               | Preços históricos dos atendimentos confirmados/concluídos, pela data do atendimento; mesma função do dashboard |
| Serviços concluídos          | Preços históricos dos atendimentos concluídos, pela data do atendimento                                        |
| Pagamentos recebidos         | Recebimentos pela data local do recebimento, menos estornos pela data local da reversão                        |
| Despesas pagas               | Pagamentos efetivamente registrados, menos correções de despesas pagas na data da anulação                     |
| Saldo operacional registrado | Pagamentos recebidos menos despesas pagas; não representa lucro líquido                                        |

O período inicial é o mês atual no fuso da empresa. Os filtros incluem início/fim e aceitam até 367 dias. O tipo filtra a listagem, mantendo os indicadores gerais do período.

Datas/horários informados são interpretados no fuso **da empresa**. Instantes ficam em UTC ISO e as datas financeiras locais são preservadas no registro. Alterações posteriores do fuso não deslocam essas datas. Horários futuros, inexistentes ou ambíguos durante mudança de horário de verão são rejeitados. Estornos/correções não reescrevem um período anterior: o período atual pode ter valores líquidos negativos.

## Banco e isolamento

Migration nova: `014-gradefy-operational-finance.sql`. As migrations 001–013 não foram modificadas. Não existia estrutura suficiente para registrar recebimentos, reversões e despesas com auditoria.

Cria `financial_payments`, `financial_payment_reversals`, `financial_expenses` e `financial_expense_events`, com IDs explicitamente NOT NULL, centavos inteiros, FKs empresariais compostas e índices de período/atendimento/histórico. Atualiza apenas a constraint de operações da infraestrutura de idempotência para incluir `finance-write`, preservando todas as chaves existentes. No SQLite essa constraint requer reconstruir sua tabela dentro da transação da migration.

Todas as consultas e escritas filtram `company_id`. O servidor revalida membership, papel e entitlements; IDs de outra empresa não são acessíveis. Assinatura expirada mantém a consulta e bloqueia novas escritas. Nenhum trial, plano ou assinatura é iniciado/alterado. A exceção legada da Igor continua utilizando as regras existentes.

## Arquivos desta etapa

Novos:

- `server/finance.js`
- `server/migrations/014-gradefy-operational-finance.sql`
- `src/gradefy/finance.tsx`
- `src/gradefy/finance-payment.tsx`
- `src/gradefy/finance-shared.tsx`
- `src/gradefy/finance-types.ts`
- `src/gradefy/finance.css`
- `tests/finance.test.js`
- `tests/helpers/finance.js`
- `tests/helpers/finance-migration.js`
- `tests/e2e/gradefy-finance.spec.js`
- `docs/GRADEFY-FINANCE-7F2C1.md`

Integração da aplicação:

- `server/agenda.js`
- `server/app.js`
- `server/dashboard.js`
- `server/migrations.js`
- `src/main.tsx`
- `src/gradefy/Shell.tsx`
- `src/gradefy/agenda-types.ts`
- `src/gradefy/agenda.tsx`
- `src/gradefy/business-management.css`
- `src/gradefy/business-nav.tsx`
- `src/gradefy/dashboard.tsx`

Testes existentes atualizados para a migration 014 e sua integração (incluindo expectativas do diário de migrations):

- `tests/company-integrity.test.js`
- `tests/company-migration.test.js`
- `tests/data-ownership.test.js`
- `tests/e2e/gradefy-dashboard.spec.js`
- `tests/helpers/access-migration.js`
- `tests/helpers/agenda.js`
- `tests/helpers/barber-classic.js`
- `tests/helpers/business-management.js`
- `tests/helpers/company-onboarding.js`
- `tests/helpers/data-ownership.js`
- `tests/helpers/operational-onboarding.js`
- `tests/helpers/professional-idempotency.js`
- `tests/helpers/professionals-migration.js`
- `tests/helpers/scheduling-reliability.js`
- `tests/helpers/site-editor-migration.js`
- `tests/helpers/site-editor.js`
- `tests/postgres/foundation.test.js`

`marketing/`, seu documento anterior e o repositório exclusivo da landing são trabalhos preexistentes e não fazem parte desta alteração.

## Validação local

Os comandos de validação ignoram arquivos dotenv e limpam DATABASE_URL/POSTGRES_URL para impedir uso acidental de conexões externas.

| Validação                                | Resultado                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| `node --test tests/finance.test.js`      | 10 testes passaram                                   |
| `npm test` — backend/SQLite              | 190 testes passaram                                  |
| PostgreSQL local descartável 17.11       | 137 testes passaram                                  |
| E2E direcionados de Financeiro/dashboard | 6 testes Chromium passaram                           |
| `npm run test:e2e` — suíte completa      | 55 testes Chromium passaram                          |
| `npm run build`                          | Passou, incluindo TypeScript e verificação da agenda |
| `npm run format:check`                   | Passou                                               |
| `git diff --check`                       | Passou                                               |

O PostgreSQL usou o runner `tests/postgres/run-local.mjs` e o binário portátil local 17.11. O cluster descartável foi parado e removido ao final. Não houve acesso ao Supabase/produção. Foi necessário tipar explicitamente os NULLs de uma UNION da listagem para compatibilidade PostgreSQL/SQLite.

Uma conferência SHA-256 de 92 arquivos confirmou que as migrations anteriores, `marketing/` e o repositório exclusivo da landing permaneceram intactos. O HEAD permaneceu em `685759c`; as alterações desta fase estão sem commit.

As suítes cobrem concorrência entre conexões, mesma chave/mesmo payload, payload diferente, perda de resposta, rollback, repetição de migration/checksum, preservação dos registros legados, pagamentos parciais/integral, estornos, despesas, isolamento empresarial, readonly, datas de correções e paginação. Os E2E usam API real em SQLite descartável e validam 320, 390, 768 e 1440 px, sem rolagem horizontal.

### Demonstração descartável

Após `npm run build`, executar `node tests/browser-server.js` com o mesmo ambiente protegido de validação, sem um servidor ocupando a porta 4173. Esse servidor usa fixtures exclusivamente locais.

- URL: `http://127.0.0.1:4173/app/financeiro?empresa=business-browser-team`
- Login: `business-browser-owner@example.com`
- Senha de teste: `ClienteDemo2026!`

O modo normal da aplicação consulta os registros reais do banco configurado; as fixtures só existem no servidor de testes.

## Limites e próxima fase

Esta versão registra operações manuais, com reversão integral por lançamento. Não faz devolução bancária, cálculo de taxas/impostos, comissões, exportações ou conciliação. Essas capacidades dependem de uma especificação posterior para 7F.2C.2; nenhuma foi iniciada. Nenhum commit ou push foi feito nesta etapa.
