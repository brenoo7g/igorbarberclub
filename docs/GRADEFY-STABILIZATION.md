# Gradefy — Fase 5.1

`POST /api/admin/professionals` aceita `Idempotency-Key` usando `requestKey` e `idempotent` da Fase 4. Escopo: empresa, ator autenticado, operação `professional-create` e hash da chave. Payload validado/normalizado pelo schema existente; chaves de objetos têm ordem canônica. Payload diferente retorna o mesmo conflito HTTP 409 já usado pelos agendamentos.

Consulta, criação de profissional, associações, agenda fechada e armazenamento do resultado ficam na mesma transação. Replay retorna HTTP 201 e o snapshot original, inclusive após edição do profissional ou expiração do trial. Locks de ator e capacidade empresarial protegem chamadas simultâneas. Falha desfaz todos os registros e permite tentar novamente. Sem header, o comportamento legado permanece.

## Migration

A 007 é necessária porque o CHECK de `idempotency_keys.operation` da 005 só aceita `booking`, `guest-booking` e `block`. A 007 acrescenta `professional-create`. Migrations 001–006 preservadas. PostgreSQL altera apenas o CHECK; SQLite copia integralmente as chaves para a tabela com CHECK ampliado, na transação de migration, e recria o índice existente. Schema SQLite personalizado (colunas, índices, triggers ou FKs externas) exige migração explícita e aborta antes da reconstrução. Rollback, execução repetida, preservação e checksum são testados.

## Planos

Nenhuma mudança nos preços, planos ou entitlements: `individual` = 2299 centavos/mês, BRL, trial 7 dias, 1 profissional ativo; `team` = 3299, BRL, 7 dias e profissionais ilimitados. Contagem permanece no backend, apenas profissionais ativos; membros administrativos não usam vagas por si. Trial inicial não pode ser reiniciado e a Igor não ganha assinatura automaticamente.

## Arquivos da Fase 5.1

- Runtime: `server/professionals.js`, `server/migrations.js`; apenas comentário em `server/idempotency.js`.
- Migration nova: `server/migrations/007-gradefy-professional-idempotency.sql`.
- Testes novos: `tests/helpers/professional-idempotency.js`, `tests/professional-idempotency.test.js`.
- Integração PostgreSQL e expectativas da versão 7: `tests/postgres/foundation.test.js`, `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`, `tests/helpers/access-migration.js`, `tests/helpers/data-ownership.js`, `tests/helpers/professionals-migration.js`, `tests/helpers/scheduling-reliability.js`.
- Documentação: este arquivo e atualização da limitação em `docs/GRADEFY-PROFESSIONALS-PLANS.md`.

## Organização do Git

O working tree já continha as Fases 4 e 5 sem commit quando esta etapa começou. Nada foi descartado. `git diff --stat` mostra apenas arquivos rastreados; os módulos e migrations novos também aparecem em `git status`.

Commits recomendados, em ordem e com revisão dos hunks compartilhados:

1. **Fase 4:** migration 005, idempotência, locks de agenda, notificações e testes/documentação de confiabilidade. Inclui mudanças em `server/database.js`, `server/notifications.js`, `server/schedule.js`, `tests/guest.test.js`, `tests/notifications.test.js`, módulos `scheduling-locks`, testes `scheduling-reliability`/`postgres/scheduling` e `GRADEFY-SCHEDULING-RELIABILITY.md`.
2. **Fase 5:** migration 006, profissionais, entitlements, bootstrap/seed, filtro funcional em Booking/types e testes/documentação de profissionais/planos.
3. **Fase 5.1:** migration 007, wrapper de criação idempotente, testes direcionados e expectativas atualizadas do journal.

`server/app.js`, `server/migrations.js`, `tests/postgres/foundation.test.js`, helpers de migração e documentação de arquitetura/migração possuem mudanças compartilhadas. Use staging por hunk em um checkout de revisão, mantendo expectativas de versões coerentes com cada commit e validando cada estado. Não atribua o diff inteiro de um arquivo compartilhado a uma única fase. Nenhum commit ou push foi realizado.

## Limites

São mantidos o prazo de retenção de **24 horas**, formato de chave e quota da infraestrutura da Fase 4. Após expiração, a chave pode voltar a representar uma nova criação. Clientes devem repetir a mesma chave dentro desse prazo; um POST sem chave continua podendo criar registros distintos no Equipe. Interfaces, autenticação e app mobile não foram alterados. Nenhum banco de produção foi acessado.

## Validação de 2026-10-09

- Primeiro, testes direcionados de idempotência e planos: **12 aprovados**.
- Rodada final backend/integrados/SQLite: **100 aprovados**, zero falhas.
- E2E Chromium: **17 aprovados**.
- Mobile: **5 aprovados**; typecheck aprovado.
- Build web, TypeScript (`tsc -b` e `check:schedule`), Prettier e `git diff --check`: aprovados.
- PostgreSQL: **não executado nesta rodada**. O runner descartável foi tentado, mas o binário local não inicia (`0xC0000135`, dependência DLL ausente); as DLLs do antigo pacote portátil não estão mais presentes. Docker e `psql` não foram encontrados. Falha ocorreu antes da criação do cluster; nenhuma conexão de banco foi estabelecida. A suíte foi integrada ao caso 22 do runner PostgreSQL e precisa ser executada quando o ambiente local for restaurado. Resultados da Fase 5 anterior não substituem essa validação.

Logs: `test-results/phase51-targeted.txt`, `phase51-backend.txt`, `phase51-e2e.txt`, `phase51-e2e-status.json`, `phase51-build.txt`, `phase51-mobile.txt`, `phase51-mobile-typecheck.txt` e `phase51-postgres.txt`. As falhas injetadas no log de teste são casos esperados de rollback, não testes reprovados.

### Pendência PostgreSQL resolvida (2026-10-09)

O pacote completo PostgreSQL 17.11 foi restaurado em `%LOCALAPPDATA%/Gradefy/postgresql-17.11`, sem instalar serviço Windows. A suíte original da Fase 5.1 passou com **58 testes aprovados**, inclusive o caso 22 de idempotência profissional e rollback da 007, antes de iniciar as edições da Fase 6. Evidência: `test-results/phase51-postgres-restored.txt`. O runner criou somente um cluster descartável em localhost e confirmou encerramento/remoção sem acesso a produção. A limitação registrada acima é histórica e está resolvida.
