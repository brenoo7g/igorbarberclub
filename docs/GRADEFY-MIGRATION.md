# Gradefy — Fase 1: fundação

**Atualização: Fase 3 implementada.** A migration `004-gradefy-multitenant-access.sql` permite coexistência de empresas e converte memberships `admin` em `manager`, sem promover proprietários. A aplicação agora resolve contexto público por slug e contexto administrativo por membership ativa, com seletor explícito quando necessário. O bootstrap não recria acessos removidos. Consulte [GRADEFY-MULTITENANCY.md](GRADEFY-MULTITENANCY.md). Os parágrafos abaixo sobre empresa única e autorização global descrevem etapas anteriores; não são as regras vigentes após 004. Uma instalação atual registra versões 1, 2, 3 e 4, e o seed normal continua criando somente Igor.

**Atualização: Fase 2B implementada.** A camada operacional agora recebe contexto empresarial explícito e filtra consultas/gravações por `company_id`. A resolução continua fixa na identidade canônica da Igor, sem autorização por membros ou segunda empresa operacional. As migrations 001–003 não mudaram. Consulte [GRADEFY-APPLICATION-CONTEXT.md](GRADEFY-APPLICATION-CONTEXT.md) para auditoria SQL, funções, rotas, testes SQLite/PostgreSQL e limites da Fase 3. As descrições seguintes de ausência de filtros registram historicamente a Fase 1.

**Atualização: Fase 2A implementada.** A migration `003-gradefy-data-ownership.sql` acrescenta propriedade explícita às 13 tabelas operacionais, preservando 001/002 e atribuindo o legado à Igor. Nenhuma rota resolve empresas dinamicamente e a segunda empresa permanece bloqueada. Veja a [documentação da propriedade dos dados](GRADEFY-DATA-OWNERSHIP.md), com constraints, índices, preservação e testes. O restante deste documento registra as decisões da Fase 1; a ausência de `company_id` operacional descrita abaixo corresponde àquela etapa anterior.

Esta entrega adiciona apenas metadados e migrações versionadas. A Igor Barber Club continua sendo a única empresa operacional. Nenhuma rota consulta as tabelas novas para autorizar, filtrar dados, renderizar templates ou limitar profissionais.

Não há onboarding, cobrança, pagamentos, seleção de empresa ou nova interface. A autenticação continua usando as mesmas contas, senhas, segredo, cookies, issuer/audience e formato JWT. O aplicativo mantém seu funcionamento local de demonstração.

## Estrutura e fonte do schema

`server/schema.sql` permanece como o schema-base legado. As definições da fundação estão nas migrations: `001-gradefy-foundation.sql` cria as tabelas e `002-gradefy-foundation-integrity.sql` explicita a integridade em ambos os bancos, preservando o checksum da 001. Para obter o schema completo, use a inicialização da aplicação ou `npm run db:migrate`, não apenas o arquivo SQL legado.

| Tabela              | Finalidade                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `schema_migrations` | Versão, nome, checksum SHA-256 e data de aplicação.                                                           |
| `niches`            | Catálogo de nichos; inicialmente `barbershop`.                                                                |
| `templates`         | Registro do template `barber-classic`, vinculado ao nicho e com versão. Não implementa renderização dinâmica. |
| `plans`             | Planos `individual` (um profissional) e `team` (sem teto numérico definido). Sem preços ou cobrança.          |
| `companies`         | Primeiro registro empresarial: `igor-barber-club`, nome, nicho, template, status, fuso, idioma e moeda.       |
| `company_members`   | Relação empresa/usuário, papel e status. Chave composta impede duplicação.                                    |
| `company_settings`  | Localidade e Instagram iniciais, com versão. Não é consumida pelo site nesta fase.                            |
| `subscriptions`     | Estrutura para vínculo manual/legado com plano e histórico. Nenhuma assinatura é criada automaticamente.      |

Não são adicionadas colunas `company_id` às tabelas operacionais nesta fase. Nenhum ID legado é renomeado, incluindo `igor`, `corte` e `combo`. O ID da empresa é outro identificador, independente do ID do profissional.

O banco impede a criação de uma segunda empresa por meio da constraint nomeada `gradefy_single_company`: o único ID empresarial permitido é `igor-barber-club`, protegido também pela chave primária e por NOT NULL explícito. A exceção de ID nulo encontrada no SQLite com a 001 foi corrigida pela 002; consulte a [auditoria de integridade](GRADEFY-INTEGRITY.md). Não remova essa restrição antes de concluir e testar o isolamento em todas as rotas e workers. Não há API de CRUD de empresas.

As chaves estrangeiras validam membros e assinaturas; o template deve pertencer ao nicho selecionado. O índice parcial de assinaturas admite somente um registro `pending` ou `active` por empresa, mantendo espaço para histórico `cancelled`/`expired`. Esses estados são apenas metadados; não bloqueiam a operação atual.

## Bootstrap idempotente

`server/company-bootstrap.js` executa em transação e usa `ON CONFLICT ... DO NOTHING`. Cria os catálogos e a empresa caso ausentes. Rodar novamente não altera nomes, configurações, versões, status, timestamps, limites editados ou assinaturas existentes.

Os usuários legados com papel `admin` recebem vínculo empresarial de papel `admin`. Nenhum cliente é promovido, nenhum hash é alterado, nenhum proprietário é escolhido por suposição e nenhum administrador do Gradefy é criado. Vínculos já existentes, inclusive inativos, são preservados. A identificação formal do proprietário fica para uma fase posterior. As permissões atuais continuam sendo verificadas exclusivamente pelo mecanismo legado.

O bootstrap roda na inicialização do banco para adotar administradores existentes e ao executar o seed para incluir um administrador recém-criado. Ambos usam o mesmo lock PostgreSQL da inicialização (`789127`); SQLite serializa a transação. Não é criado um novo usuário pelo bootstrap.

**O plano da Igor permanece não atribuído.** A tabela `subscriptions` começa vazia, independentemente da quantidade de profissionais encontrados ou criados pelo seed. `individual.max_professionals = 1`; `team.max_professionals = NULL` indica que nenhum teto numérico foi definido. Esses limites não são aplicados às rotas atuais. A futura escolha do plano será explícita, preservando a equipe e os compromissos existentes.

## Migrações e integridade

O manifesto em `server/migrations.js` lista versões em ordem. As definições aplicadas são registradas na mesma transação do DDL. Uma falha reverte as tabelas criadas nessa tentativa e o registro da migração; não fica uma versão parcialmente aplicada.

Antes de executar versões novas, o executor verifica todo o histórico. Versão desconhecida, lacuna, nome diferente ou checksum alterado interrompem a inicialização. O checksum normaliza apenas finais de linha CRLF/CR para LF, para funcionar em Windows e Linux. Não edite uma migração já aplicada: acrescente uma nova versão. Não altere a tabela de controle para contornar divergências.

Os arquivos SQL usam linhas `-- statement-breakpoint` para separar instruções. Isso evita interpretar um ponto e vírgula dentro de uma string como separador. Não use essa linha reservada dentro de strings ou blocos SQL. A 002 utiliza `-- dialect: postgres` ou `-- dialect: sqlite` no início de cada bloco para selecionar SQL específico; todo o arquivo participa do checksum em ambos os bancos.

A migração 001 contém somente criação de tabelas e índices. Não executa `DROP`, `DELETE`, renomeações ou reconstrução de tabelas existentes. A inicialização anterior de perfil, visitantes e fotos foi mantida; uma base muito antiga ainda passa pelas atualizações legadas que já existiam, incluindo a adaptação SQLite de reservas sem conta. O novo histórico não declara retroativamente que essas atualizações antigas foram migrações numeradas.

A 002 preserva a 001 e todos os dados válidos: usa ALTER COLUMN no PostgreSQL e reconstrução transacional somente das tabelas novas no SQLite. Ela também impede a geração automática de versão nula no journal e exige versões/limites inteiros. Dados inválidos ou extensões locais inesperadas no SQLite abortam a migração sem descarte de dados. Consulte os detalhes de preservação e rollback em [GRADEFY-INTEGRITY.md](GRADEFY-INTEGRITY.md).

## Execução

1. Faça backup do banco e valide restauração em ambiente separado.
2. Aponte `DATABASE_URL` para a cópia PostgreSQL de homologação; localmente, pode usar `SQLITE_PATH`. O comando também aceita `POSTGRES_URL` como fallback.
3. Execute `npm run db:migrate` (`npm.cmd run db:migrate` no PowerShell).
4. Execute novamente: devem existir duas linhas no journal (versões 1 e 2), uma empresa, um nicho, um template e dois planos, sem duplicações. Em base nova, nenhuma assinatura.
5. Compare as tabelas legadas e teste os fluxos do site antes de implantar em produção.

O comando usa o mesmo inicializador do servidor e encerra a conexão ao terminar. Não inicia HTTP, não executa o seed de usuários/demo e não dispara notificações. O bootstrap empresarial e a importação histórica de fotos, quando ainda não marcada, fazem parte da inicialização. Em produção, o comando exige uma conexão PostgreSQL e recusa fallback silencioso para SQLite.

Na Vercel, a inicialização da função continua aplicando atualizações de modo transacional. Recomenda-se executar a migração previamente em uma etapa controlada. Não execute migrações concorrentes a partir de versões diferentes do código. Após aplicar a 002, use uma versão da aplicação que conheça essa migration: o executor anterior recusa versões desconhecidas. Não apague o journal para contornar isso. Preserve a restrição de empresa única.

## Testes e limites

- `tests/company-migration.test.js`: inicialização repetida de um arquivo SQLite legado, comparação das 17 tabelas, preservação de IDs, hashes, versões de sessão, snapshots, visitantes, agendas, filas e índice extra; JWT anterior continua aceito; novas rotas empresariais não existem.
- `tests/company-migration.test.js`: rejeição de histórico incompatível e rollback após falha de DDL, seguido de nova tentativa bem-sucedida.
- `tests/company-bootstrap.test.js`: repetição e concorrência, inclusão do administrador criado pelo seed, preservação de metadados editados e vínculos inativos; nenhuma atribuição automática de plano, inclusive com mais de um profissional.
- `tests/company-bootstrap.test.js`: rejeição de segunda empresa, referências inválidas e assinaturas vigentes duplicadas.
- As suítes existentes continuam cobrindo autenticação, perfil, reservas, agenda, galeria, notificações e implantação.

As suítes originais usam SQLite. A suíte separada em `tests/postgres/` valida a fundação em PostgreSQL 17.11 local descartável, incluindo preservação, locks reais, concorrência, rollback, checksum e upgrade 001→002. A exceção de ID nulo foi corrigida e os resultados atuais estão em [GRADEFY-INTEGRITY.md](GRADEFY-INTEGRITY.md). Não há isolamento multi-tenant nesta entrega; nenhuma operação de segunda empresa foi habilitada. A execução local não substitui validação das permissões e configurações do ambiente de implantação.

## Arquivos antes ausentes do Git

A regra `/data/` agora ignora apenas a pasta de banco na raiz. `app-mobile/src/data/services.ts` e `gallery.ts` devem acompanhar o repositório sem mudança de conteúdo. As três imagens em `docs/brand/` também devem ser versionadas, apenas como referências; não são incorporadas às interfaces. `app-mobile/site-integrity.json` permanece como registro histórico e não foi sobrescrito para mascarar a migração.
