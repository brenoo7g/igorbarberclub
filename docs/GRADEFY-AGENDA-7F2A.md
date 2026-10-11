# Gradefy — Agenda e atendimentos (7F.2A)

Rota empresarial autenticada: `/app/agenda?empresa=<id>`. A seleção permanece explícita quando existem vários vínculos de gestão. Não existe fallback para Igor. O site público e o painel legado continuam nas mesmas URLs.

## Interface

Visões diária e semanal, navegação por data, filtros por profissional e status, lista cronológica com paginação de 30 reservas, detalhes autorizados e formulários de criação/reagendamento. Desktop apresenta horário, cliente/serviço, profissional e status em colunas; mobile usa lista. Os status também têm texto. A página inclui loading, vazio, erro com retry, conflito, confirmação de cancelamento e sucesso.

O dashboard abre a agenda, o formulário de novo atendimento e os detalhes do próximo atendimento. Após operações, a agenda consulta novamente a API; o dashboard consulta seus próprios indicadores quando volta a ser exibido, por foco e pelo evento `gradefy-agenda-changed`. Nenhum cálculo financeiro foi duplicado no frontend.

## API

Todos os endpoints abaixo passam pelo middleware administrativo existente e revalidam membership ativo `owner`/`manager` dentro da transação. Exigem `X-Gradefy-Company-Id`; todas as consultas usam a empresa autorizada.

| Método | Endpoint                           | Finalidade                                                                    |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/admin/agenda`                | `from`, `view=day/week`, `professionalId`, `status`, `page`                   |
| GET    | `/api/admin/agenda/catalog`        | Serviços/profissionais ativos, associações e clientes com reservas na empresa |
| GET    | `/api/admin/agenda/availability`   | Disponibilidade do motor existente; `except` para reagendamento               |
| GET    | `/api/admin/agenda/:id`            | Dados, contatos, observações e ações permitidas                               |
| POST   | `/api/admin/agenda`                | Reserva interna                                                               |
| PATCH  | `/api/admin/agenda/:id/reschedule` | Reagendamento interno                                                         |
| PATCH  | `/api/admin/agenda/:id/status`     | `cancelled` ou `completed`                                                    |

Os catálogos têm limites de 200 serviços/profissionais e 100 clientes. Esta etapa não implementa CRM ou pesquisa global de clientes. Clientes existentes são contas que já possuem reservas nesta empresa; novos clientes fornecem nome, e-mail e telefone e permanecem visitantes, sem criação de conta, sessão de visitante ou alteração do cookie do gestor.

## Regras e segurança

- A criação interna funciona com site não publicado, mas exige empresa ativa, onboarding concluído e entitlement válido. A exceção legada da Igor foi preservada. Empresas com assinatura inválida podem consultar histórico, sem operações de escrita.
- O mesmo motor valida serviço ativo, associação ao profissional ativo, preço/duração, expediente, pausas, abertura da agenda, horários futuros e reservas/bloqueios existentes.
- Reagendamento conserva ID, cliente, data de criação e snapshots originais de serviços, preços e duração. Permite mudar data, hora, profissional e observações, sem alterar identidade do cliente. Reservas passadas ou finalizadas não podem ser reagendadas.
- Cancelamento exige confirmação visual e atualiza status; não apaga a reserva. Preserva a política interna existente, inclusive cancelamento de reserva confirmada passada. A política pública permanece distinta.
- Conclusão exige horário final já alcançado no fuso da empresa. Atualiza somente status: não representa pagamento recebido. Status final repetido é um no-op.
- A listagem não entrega telefone/e-mail; detalhes autorizados entregam contatos. IDs de outra empresa são rejeitados; profissional sem membership de gestão não recebe acesso administrativo.
- A UI envia um snapshot esperado de data, hora, profissional, status e observações. Alteração concorrente incompatível retorna 409, evitando que uma tela antiga sobrescreva a operação mais recente.
- Os canais e outbox existentes recebem confirmação, reagendamento e cancelamento na mesma transação. Conclusão não cria canais ou recebimentos fictícios.

## Concorrência e migration

Reutilizados `idempotency.js`, locking da Fase 4 e as transações existentes. Chaves têm escopo empresa + ator + operação + chave, expiram conforme a política existente (24 horas), rejeitam payload diferente e repetem a resposta registrada. A UI conserva a chave/payload após erro de rede. Sem chave, permanecem os locks e a proteção de status final repetido.

Não existe segundo motor de disponibilidade ou segundo registro de idempotência. Locks do catálogo, da reserva e dos profissionais continuam serializando operações. Criação, snapshots, observações, outbox e resposta idempotente são atômicos; falhas revertem todos os efeitos.

Migration nova `012-gradefy-managed-agenda.sql`: adiciona `appointments.notes` (NOT NULL, default vazio, máximo 1000 caracteres) e permite três operações novas no CHECK de `idempotency_keys`. PostgreSQL altera apenas a constraint; SQLite reconstrói essa tabela dentro da transação, copiando todas as chaves e recriando o índice. Nenhuma migration 001–011 foi editada. Observações não existiam na modelagem anterior, e o CHECK bloqueava as operações novas, justificando a migration.

## Arquivos desta entrega

Novos:

- `server/agenda.js`
- `server/migrations/012-gradefy-managed-agenda.sql`
- `src/gradefy/agenda-types.ts`
- `src/gradefy/agenda.css`
- `src/gradefy/agenda.tsx`
- `src/gradefy/management.tsx`
- `tests/agenda.test.js`
- `tests/helpers/agenda.js`
- `tests/helpers/agenda-browser.js`
- `tests/e2e/gradefy-agenda.spec.js`
- `docs/GRADEFY-AGENDA-7F2A.md`

Alterados:

- `server/app.js`, `server/domain.js`, `server/migrations.js`
- `src/gradefy/Shell.tsx`, `src/gradefy/dashboard.tsx`, `src/main.tsx`
- `tests/browser-server.js`, `tests/postgres/foundation.test.js`
- `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`
- `tests/helpers/access-migration.js`, `tests/helpers/barber-classic-migration.js`, `tests/helpers/barber-classic.js`
- `tests/helpers/company-onboarding.js`, `tests/helpers/data-ownership.js`, `tests/helpers/operational-onboarding.js`
- `tests/helpers/professional-idempotency.js`, `tests/helpers/professionals-migration.js`, `tests/helpers/scheduling-reliability.js`
- `tests/helpers/site-editor-migration.js`, `tests/helpers/site-editor.js`

As alterações nos helpers antigos atualizam a expectativa de versões e reconhecem a coluna aditiva vazia, sem retirar verificações de preservação dos dados.

## Verificação e uso local

Backend/SQLite: `npm test`. PostgreSQL real: `node tests/postgres/run-local.mjs --bin <bin-do-PostgreSQL>`, que cria um cluster descartável exclusivo em loopback, sem fallback para variáveis de produção. E2E Chromium: `npx playwright test`, utilizando apenas `tests/browser-server.js`, SQLite em memória e transportes sem envio real. Build/TypeScript: `npm run build`. Formatação: `npm run format:check`. Diff: `git diff --check`.

Os testes novos cobrem autorização, isolamento, filtros, paginação, criação manual, intervalos, valores reais, snapshots, rollback, repetição, duas conexões, disputa pelo mesmo slot, cancelamento concorrente com reagendamento, conclusão e dashboard. A migration é testada com falha, retry, preservação de dados/chaves/checksums e constraints de observações. E2E cobre operações reais, resposta perdida, conflito e 320/390/768/1440 px, além da regressão do site legado e Barber Classic.

Resultados finais da implementação:

| Verificação                        | Resultado        |
| ---------------------------------- | ---------------- |
| Backend/SQLite completo            | 170/170 passaram |
| Agenda SQLite direcionada          | 11/11 passaram   |
| PostgreSQL local descartável 17.11 | 118/118 passaram |
| E2E Chromium completo              | 48/48 passaram   |
| Agenda E2E após revisão final      | 5/5 passaram     |
| Build e TypeScript                 | Passaram         |
| Prettier e `git diff --check`      | Passaram         |

Relatórios locais ficam em `test-results/phase7f2a-*.txt`, screenshots em `test-results/gradefy-agenda-*.png` e o relatório do cluster em `test-results/postgres-validation/report.json`. O cluster PostgreSQL foi parado e removido. Nenhum teste acessou produção ou enviou mensagens reais; a integração de notificações foi validada pela outbox transacional.

Para demonstrar com dados exclusivamente de teste, após build, executar `node tests/browser-server.js` com dotenv desabilitado e abrir `http://127.0.0.1:4173/app/agenda?empresa=agenda-browser-a`. Conta descartável: `agenda-browser-owner@example.com` / `ClienteDemo2026!`. O servidor só escuta loopback e não inicia envio real de notificações. Em desenvolvimento, com banco local configurado e usuário gestor, usar `http://localhost:5173/app/agenda`.

A Fase 7F.2B permanece pendente e requer seu próprio escopo aprovado. Não foram adicionados CRM, pagamentos, caixa, comissões, relatórios avançados, calendário externo, aplicativo nativo ou Super Admin. Esta fase não executa publicação, commit, push ou acesso a produção.
