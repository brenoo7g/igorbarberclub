# Gradefy — correção de integridade da Fase 1

Correção validada em 30/09/2026 com Node.js 24.20.0, SQLite 3.53.4 e PostgreSQL 17.11 local descartável. Nenhuma funcionalidade da Fase 2 foi implementada.

## Causa e escolha da estratégia

Em tabelas SQLite comuns, `TEXT PRIMARY KEY` não implica `NOT NULL`. Isso é uma particularidade histórica mantida por compatibilidade. Além disso, `CHECK(id = 'igor-barber-club')` não rejeita o resultado SQL NULL; logo, uma linha com ID NULL e outro slug contornava a restrição da 001. PostgreSQL torna toda chave primária obrigatória e rejeitava essa mesma linha. Referências: [particularidades de PRIMARY KEY no SQLite](https://www.sqlite.org/quirks.html#primary_keys_can_sometimes_contain_nulls) e [semântica de CHECK](https://www.sqlite.org/lang_createtable.html#check_constraints).

A auditoria também identificou a particularidade de `INTEGER PRIMARY KEY` na tabela de migrations: no SQLite, esse tipo exato é um alias de rowid, podendo gerar um número quando se insere NULL, mesmo acrescentando `NOT NULL`. A definição agora usa **`INT NOT NULL PRIMARY KEY`**, sem alias de rowid. O código sempre informa explicitamente a versão.

Foi escolhida a opção **B: `002-gradefy-foundation-integrity.sql`**. A migration 001 não foi editada. Seu SHA-256 bruto antes e depois desta correção é `99C630F469EDF147B048F5A1123388796324E5D68F5505C55473779FB854FADC`. O teste de upgrade também compara o registro original de checksum e timestamp no banco.

A opção A invalidaria instalações locais que já registraram a 001. A 002 aceita esse histórico, aplica a correção uma vez e mantém a repetição sem alterações.

## Auditoria de todas as tabelas

A 001 cria sete tabelas e dois índices explícitos. `schema_migrations` é criada pelo executor e também foi incluída na correção.

| Tabela              | Identificadores e referências auditados     | Garantia final                                                                                                                            |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`         | `id`, `slug`, `niche_id`, `template_id`     | Todos NOT NULL; PK do ID, slug UNIQUE, FK de nicho e FK composta template/nicho. CHECK de empresa única preservado.                       |
| `company_members`   | `company_id`, `user_id`                     | Ambos já eram NOT NULL; PK composta e ambas as FKs preservadas, inclusive referência ao usuário legado.                                   |
| `niches`            | `id`, usado também como código              | PK explicitamente NOT NULL.                                                                                                               |
| `templates`         | `id`, `niche_id`                            | Ambos NOT NULL; FK e UNIQUE composto preservados; versão inteira positiva.                                                                |
| `plans`             | `id`                                        | PK explicitamente NOT NULL; `max_professionals` permanece opcional para o plano Equipe. Quando informado, exige inteiro positivo.         |
| `subscriptions`     | `id`, `company_id`, `plan_id`               | Todos NOT NULL; FKs preservadas. Índice parcial permite apenas uma assinatura vigente por empresa, mantendo histórico cancelado/expirado. |
| `company_settings`  | `company_id`                                | PK/FK explicitamente NOT NULL; versão inteira não negativa.                                                                               |
| `schema_migrations` | `version`, `name`, `checksum`, `applied_at` | Todos NOT NULL. Versão inteira positiva sem geração automática; PK preservada; checksum obrigatório de 64 caracteres.                     |

Não há outro campo separado chamado `code` nas tabelas da 001. Os códigos dos catálogos são seus próprios IDs. Todas as colunas das PKs, UNIQUEs e FKs obrigatórias estão explicitamente protegidas contra NULL. Campos opcionais de configuração, datas de assinatura e limite do plano Equipe continuam opcionais.

## Execução da 002

O executor reconhece `-- dialect: postgres` ou `-- dialect: sqlite` no início de cada bloco SQL separado por `-- statement-breakpoint`. O checksum inclui **todo o arquivo**, inclusive ambos os dialetos; não existe checksum distinto por banco. Blocos sem diretiva, como os da 001, mantêm a execução anterior.

No PostgreSQL, `ALTER COLUMN ... SET NOT NULL` torna a intenção explícita, sem reconstrução das tabelas e sem remover índices personalizados.

No SQLite, a migration cria tabelas auxiliares com as constraints explícitas, copia cada coluna por nome, substitui somente as oito tabelas da fundação e recria os dois índices próprios. A cópia acontece antes de remover as tabelas originais. Todo o DDL, a cópia e o registro da versão pertencem à mesma transação. Não há `DELETE`, renomeação de IDs, inferência de plano ou alteração de tabelas operacionais legadas.

A reconstrução preserva as FKs entre tabelas ao renomear as auxiliares. Foi validada tanto pela inicialização real quanto pela execução isolada com `foreign_keys=ON`. A tabela `users` permanece intacta. Não se usa `writable_schema` nem edição manual do catálogo SQLite.

Antes da reconstrução, o executor verifica referências, colunas esperadas e índices/triggers não pertencentes à fundação. Dados inválidos ou extensões locais inesperadas fazem a migração falhar e reverter, em vez de descartá-los. Depois da reconstrução, as FKs são verificadas novamente. Isso também protege a execução do inicializador legado, que temporariamente desativa FKs para suas migrações anteriores.

No SQLite foram acrescentadas verificações de tipo inteiro e intervalo de 32 bits para `max_professionals` e as versões de template, configurações e migrations. Assim, o parâmetro `1.5` e valores maiores que `2147483647` são rejeitados nos dois bancos. Os campos `active` já tinham domínio fechado em 0/1.

## Preservação e evolução futura

- Bancos vazios aplicam 001 e 002 na mesma inicialização.
- Bancos na 001 preservam linhas, IDs, membros inativos, configurações, assinaturas manuais, timestamps e o journal anterior.
- Reexecução retorna lista vazia e não duplica conteúdo.
- Dados NULL/orfãos/fracionários preexistentes causam falha sem perda de dados e sem registro da 002. Exigem revisão explícita; esta correção não acessou bancos locais persistentes para alterá-los.
- Colunas, índices ou triggers personalizados no SQLite exigem uma migração explícita que os preserve; o executor recusa a reconstrução automática nesses casos.
- `gradefy_single_company` continua sendo uma constraint separada da não nulidade. Sua remoção futura foi testada via **migration 003 somente em cópias temporárias**: PostgreSQL remove a constraint nomeada; SQLite reconstrói a fundação sem esse CHECK, preservando NOT NULL e FKs.
- Nenhuma migration 003 foi adicionada à aplicação e nenhuma segunda empresa operacional foi liberada.

## Testes executados

| Comando / suíte                                                 | Resultado                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                                                  | **54 passaram**, incluindo unitários/integrados, SQLite, preservação de autenticação, migrations, bootstrap e integridade. |
| `npm.cmd run test:e2e`                                          | **16 passaram** em Chromium, com fluxos desktop/mobile do site.                                                            |
| `npm.cmd run build`                                             | Passou: TypeScript, verificação da agenda e build Vite.                                                                    |
| `npm.cmd test` em `app-mobile`                                  | **5 passaram**.                                                                                                            |
| `npm.cmd run typecheck` em `app-mobile`                         | Passou.                                                                                                                    |
| `npm.cmd run build:web` em `app-mobile`                         | Exportação Expo web passou.                                                                                                |
| `npm.cmd run test:e2e` em `app-mobile`                          | **2 passaram**.                                                                                                            |
| `node tests/postgres/run-local.mjs --bin <binários PostgreSQL>` | **14 passaram**: 12 cenários PostgreSQL e dois cenários complementares SQLite.                                             |

Os testes de integridade compartilham as mesmas tentativas de INSERT/UPDATE NULL e referências inválidas nos dois bancos. Também inspecionam a não nulidade no catálogo, verificam inteiros fracionários/fora do intervalo, upgrade real da 001, idempotência e rollback após substituição parcial das tabelas SQLite.

O runner PostgreSQL utilizou cluster novo, dados sintéticos, host `127.0.0.1`, porta 56748, senha aleatória e ambiente sem `.env`/URLs do projeto. O cluster foi encerrado e removido (`testExitCode=0`, `clusterStopped=true`, `clusterRemoved=true`). **Nenhum banco de produção ou instância Supabase foi acessado.**

Os logs são locais em `test-results/postgres-validation/`, ignorados pelo Git. A lista de cenários e o provisionamento estão descritos em [POSTGRES-VALIDATION.md](POSTGRES-VALIDATION.md); os resultados históricos da 001 naquele documento não substituem os desta correção.

## Diferenças restantes e limites

- Datas continuam TEXT nos dois bancos; o banco não valida calendário. A comparação de início/fim depende de representação normalizada. Não houve alteração de formato ou comportamento da aplicação.
- `COUNT(*)` continua retornando string pelo adaptador PostgreSQL e número no SQLite; testes normalizam o resultado quando necessário.
- Uma falha dentro de transação PostgreSQL exige rollback/savepoint antes de continuar. SQLite permite continuar após certos erros de instrução. O executor reverte a transação em caso de falha em ambos.
- SQLite depende de `PRAGMA foreign_keys=ON` nas conexões normais; o adaptador existente o ativa. Escritas externas com FKs explicitamente desativadas não recebem essa proteção do banco.
- Validação PostgreSQL local não cobre TLS, pooler, permissões de implantação ou políticas do Supabase. Testes mobile incluem lógica, typecheck e versão web; não houve compilação nativa Android/iOS.
- Playwright emitiu aviso de `NO_COLOR`/`FORCE_COLOR`; não houve falha associada.

## Arquivos desta correção

Criados:

- `server/migrations/002-gradefy-foundation-integrity.sql`
- `tests/company-integrity.test.js`
- `tests/helpers/foundation-integrity.js`
- `docs/GRADEFY-INTEGRITY.md`

Atualizados:

- `server/migrations.js`
- `tests/company-migration.test.js`
- `tests/postgres/foundation.test.js`
- `docs/GRADEFY-MIGRATION.md`
- `docs/POSTGRES-VALIDATION.md`

Nenhuma rota, autenticação, interface ou arquivo funcional do mobile foi alterado. Nenhuma coluna empresarial foi adicionada ao legado. As alterações anteriores no diretório de trabalho foram preservadas. Nenhum commit foi feito.
