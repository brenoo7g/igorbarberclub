# Gradefy — validação da fundação em PostgreSQL

**Registro histórico da validação da migration 001.** A correção posterior criou a migration 002, eliminando a exceção de ID nulo e restringindo os contadores inteiros no SQLite. A suíte atual passou com 14 testes, incluindo upgrade 001→002 e remoção futura da restrição em ambos os bancos. Resultados atuais, auditoria e arquivos em [GRADEFY-INTEGRITY.md](GRADEFY-INTEGRITY.md). Os artefatos locais são substituídos a cada execução; os números abaixo descrevem a execução original.

Execução concluída em 30/09/2026. Os **10 cenários PostgreSQL passaram**. Um teste adicional em SQLite documentou diferenças e uma fragilidade da restrição de empresa única nesse dialeto. Essa fragilidade foi reproduzida, não corrigida nesta etapa exclusivamente de validação.

## Ambiente e isolamento

- PostgreSQL **17.11**, Windows x64, compilado com `msvc-19.44.35228`.
- Node.js **24.20.0**; comparação em memória com SQLite **3.53.4**.
- Docker não estava disponível, tampouco uma instalação local de PostgreSQL. A ausência foi informada antes da alternativa.
- Utilizados binários portáteis EDB, disponibilizados pela [página de downloads da EDB](https://www.enterprisedb.com/download-postgresql-binaries), indicada na [página oficial do PostgreSQL para Windows](https://www.postgresql.org/download/windows/).
- Arquivo: `postgresql-17.11-4-windows-x64-binaries.zip`. SHA-256 do download: `B9424EE7BC60B52450FF910A3630225DF32E633F3CB29C1D126D9299D59AEA28`. Esse hash registra o artefato utilizado; não representa validação contra assinatura ou checksum publicado pelo fornecedor.
- Cluster novo criado com `initdb` em diretório temporário; UTF-8, locale `C`, fuso do servidor UTC, autenticação SCRAM-SHA-256 e senha aleatória.
- Escuta exclusiva em `127.0.0.1`, porta aleatória **52876** nesta execução. Nenhum serviço Windows instalado ou cluster existente reutilizado.
- Um banco de controle com marcador aleatório e dez bancos independentes para os dez cenários. Dados exclusivamente sintéticos, sem cópia de dados de clientes reais.
- Antes de importar a aplicação, a suíte verifica host, porta, usuário, banco, marcador, `data_directory` e endereço de escuta.
- O runner passa somente uma lista restrita de variáveis do sistema ao subprocesso. `DATABASE_URL` e `POSTGRES_URL` ficam vazias, e `DOTENV_CONFIG_PATH` aponta para um arquivo inexistente do diretório temporário. As conexões recebem URLs locais explícitas.
- Nenhum servidor HTTP, worker, seed de contas de demonstração ou envio de mensagens foi iniciado.
- **Nenhum banco de produção, incluindo o Supabase, foi acessado.**
- Ao final, `pg_ctl stop` encerrou o servidor; o runner removeu o cluster e todos os bancos de teste. Relatório: `clusterStopped: true`, `clusterRemoved: true`, `testExitCode: 0`.

## Reprodução

Use Node.js 24 e as dependências do projeto instaladas. Extraia o pacote portátil do PostgreSQL, preservando `bin`, `lib` e `share` juntos. Não configure nenhuma URL de banco para este teste.

```powershell
node tests/postgres/run-local.mjs --bin 'C:\caminho\pgsql\bin'
```

O script provisiona, testa, encerra e remove seu próprio cluster. Não execute `foundation.test.js` diretamente: ele exige o contexto e o marcador criados pelo runner. A suíte está separada de `npm test`, que continua executando `tests/*.test.js`.

Artefatos locais, ignorados pelo Git, em `test-results/postgres-validation/`:

- `report.json`: versão real, porta, horários, código de saída e confirmação de encerramento/remoção.
- `output.txt`: resultados dos testes.
- `postgres.log`: log do servidor; erros de constraints e da função inexistente são esperados nos testes negativos.

Uma nova execução substitui esses relatórios e cria outro cluster. As cópias temporárias do código usadas nos testes também são removidas. Os binários portáteis são externos ao projeto e não são instalados nem versionados pelo runner.

## Resultados

Execução final: **11 testes, 11 passaram, 0 falhas, 0 ignorados**. Duração da suíte: aproximadamente 8,1 segundos, além do provisionamento e encerramento do cluster.

| Teste                             | Evidência e resultado                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Banco vazio                  | Inicialização real cria as 17 tabelas legadas, as sete tabelas empresariais/globais e `schema_migrations`. Versão 1 registrada; empresa e catálogos corretos; nenhuma assinatura. Nenhuma tabela legada recebe `company_id`. A importação existente de cinco fotos continua funcionando.                                                                                                    |
| 02 — Legado anterior ao Gradefy   | Fixture preenche todas as 17 tabelas operacionais antes de aplicar a fundação. Comparação integral de linhas antes/depois confirma preservação, inclusive IDs `igor`, `corte`, `combo`, preços editados, hashes, versões, reservas, visitantes, horários, filas e índice extra. Administrador existente recebe um único vínculo empresarial.                                                |
| 03 — Migrations repetidas         | `runMigrations` retorna lista vazia; nova inicialização e nova execução mantêm exatamente os registros das 25 tabelas, incluindo timestamps e journal.                                                                                                                                                                                                                                      |
| 04 — Bootstrap repetido           | Duas execuções preservam nome, configurações e membro editados/inativo. Uma empresa, um nicho, um template, dois planos. Nenhuma assinatura, mesmo com dois profissionais legados.                                                                                                                                                                                                          |
| 05 — Concorrência                 | Duas inicializações com pools independentes são iniciadas enquanto uma terceira conexão segura o advisory lock. `pg_locks` comprova duas conexões realmente bloqueadas. Ao liberar, ambas concluem sem duplicações. Dois bootstraps concorrentes também concluem.                                                                                                                           |
| 06 — Rollback                     | Uma cópia temporária da migration recebe uma instrução inválida depois de DDL válido. Falha `42883`; nenhuma tabela da fundação nem journal permanecem; todas as linhas legadas são preservadas. Repetição com a migration original conclui normalmente.                                                                                                                                    |
| 07 — Checksum                     | Uma cópia temporária da migration já aplicada recebe um comentário adicional. A inicialização recusa a versão 1 incompatível e não altera nenhuma linha das 25 tabelas. Arquivo original permanece intacto.                                                                                                                                                                                 |
| 08 — Empresa única                | Inserção de outra empresa e alteração do ID da Igor falham por CHECK (`23514`). ID nulo falha por NOT NULL implícito da PK no PostgreSQL (`23502`). Igor permanece como única empresa.                                                                                                                                                                                                      |
| 09 — Compatibilidade SQL          | Verificados tipos, defaults, FK de membros, FK composta template/nicho, índices, unicidade parcial de assinaturas vigentes, histórico cancelado, limites de profissionais, ordem textual de datas, UPSERT sem sobrescrita e rollback de transação abortada. Bootstrap preserva uma assinatura atribuída explicitamente pelo teste.                                                          |
| 10 — Retirada futura da restrição | Somente em cópia temporária, o manifesto recebe uma migration 002 que executa `ALTER TABLE companies DROP CONSTRAINT gradefy_single_company`. O executor aplica e registra a versão; repetição não reaplica; inserção de segunda empresa passa apenas nesse banco descartável. O executor original recusa o banco com versão desconhecida. Nenhuma migration 002 foi adicionada ao projeto. |
| 11 — Comparação com SQLite        | Banco exclusivamente em memória confirma diferenças de `COUNT`, tipagem, erro dentro de transação e chave textual nula; registra o contraexemplo da restrição de empresa única, descrito abaixo. Não declara esse comportamento desejável.                                                                                                                                                  |

O teste de legado representa o schema imediatamente anterior à fundação, com dados sintéticos. Não é uma validação de todos os schemas históricos possíveis nem uma comparação com produção.

## Diferenças e riscos encontrados

| Aspecto                                     | PostgreSQL 17.11                                                                                                                                 | SQLite 3.53.4                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `COUNT(*)` via adaptador atual              | `pg` retorna string, pois o resultado SQL é `bigint`.                                                                                            | Retorna número.                                                                                        |
| Coluna `INTEGER`                            | Rejeita o parâmetro textual `1.5` com `22P02`.                                                                                                   | Aceita e armazena `1.5`, apesar da afinidade INTEGER.                                                  |
| Erro de constraint dentro de transação      | Mesmo capturando o erro em JavaScript, próxima instrução falha com `25P02`; exige rollback ou savepoint. O adaptador atual reverte corretamente. | Após capturar o erro de uma instrução, permite outra instrução na mesma transação.                     |
| `TEXT PRIMARY KEY` sem `NOT NULL` explícito | PK implica NOT NULL e rejeita ID nulo.                                                                                                           | Na tabela atual, aceita ID nulo. `CHECK(id = 'igor-barber-club')` também não rejeita o resultado NULL. |
| Timestamps da fundação                      | São TEXT; ISO UTC emitido pelo bootstrap é preservado sem conversão de fuso. String inválida também é aceita.                                    | Mesma limitação de TEXT.                                                                               |

**Ressalva relevante no SQLite:** inserir uma linha em `companies` com ID NULL e outro slug permite uma segunda linha empresarial. O teste 11 reproduz isso usando o schema real. Não há API de cadastro empresarial nesta fase, e o bootstrap sempre usa ID fixo válido, mas a garantia no banco não é equivalente entre os dialetos. A proteção passou no PostgreSQL; não se deve afirmar proteção completa para entradas arbitrárias no SQLite.

Recomendação para uma etapa corretiva separada: adicionar garantia explícita de não nulidade às chaves textuais, por migration versionada compatível com os dois bancos, com testes de preservação e auditoria de linhas nulas já existentes. Não editar a migration 001 já aplicada, nem simplesmente acrescentar outra constraint textual presumindo suporte equivalente no SQLite.

Outros limites:

- Datas textuais não validam calendário e sua comparação exige formato normalizado consistente. O CHECK de início/fim não substitui validação de data na aplicação.
- `max_professionals` requer validação de inteiro na aplicação quando SQLite for utilizado. Nenhuma regra de plano nas rotas foi ativada nesta etapa.
- A remoção da constraint por migration está comprovada em PostgreSQL. SQLite exige estratégia específica para alterar essa constraint, normalmente reconstrução controlada da tabela e tratamento de FKs; esse procedimento futuro não foi implementado ou validado aqui.
- A validação usou PostgreSQL local sem TLS ou pooler. Não cobre permissões, extensões, políticas, limites de conexão ou configurações do Supabase/ambiente hospedado.
- O usuário local de validação criado pelo `initdb` tem permissões administrativas. O teste não comprova as permissões de um usuário de deploy com privilégios reduzidos.
- Concorrência comprovada para duas inicializações da mesma versão; não é teste de carga nem autorização para executar versões diferentes simultaneamente.
- O isolamento multi-tenant continua ausente. Não liberar uma segunda empresa operacional antes de implementar e testar esse isolamento.

## Ajustes na infraestrutura de teste

As tentativas iniciais encontraram dois problemas no próprio teste, corrigidos antes da execução final:

1. No Windows, pipes herdados pelo processo PostgreSQL mantinham `spawnSync(pg_ctl)` esperando até timeout. O runner passou a usar `stdio: ignore` para `pg_ctl`, mantendo o log próprio do servidor. O cluster daquela tentativa também foi encerrado e removido.
2. A primeira medição de concorrência consultava `pg_stat_activity` dentro de uma transação, cujo snapshot não mostrava as conexões recém-abertas. A medição passou a consultar diretamente `pg_locks`, filtrando banco e chave do lock. O teste então confirmou as duas conexões aguardando.

Nenhum desses ajustes alterou o inicializador ou executor de migrations da aplicação.

## Arquivos desta etapa

- Criado `tests/postgres/run-local.mjs`: provisionamento e limpeza do PostgreSQL descartável, isolamento de ambiente e geração dos relatórios.
- Criado `tests/postgres/foundation.test.js`: dez cenários PostgreSQL e comparação adicional SQLite.
- Criado `tests/postgres/fixtures/legacy.sql`: registros sintéticos do legado.
- Criado `docs/POSTGRES-VALIDATION.md`: este relatório e instruções de reprodução.
- Atualizado `docs/GRADEFY-MIGRATION.md`: referência aos resultados e ressalva da restrição no SQLite.

As alterações da Fase 1 que já estavam no diretório de trabalho foram preservadas. Nesta etapa não foram alterados arquivos da aplicação, schema/migration de produção, autenticação, rotas, interfaces, app mobile ou dependências. Não foi feito commit. Não foi executado novo build de interface: não houve alteração de código da aplicação; esta execução valida especificamente a fundação no banco.
