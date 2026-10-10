# Gradefy — Fase 7D.1

## Experiência

Após selecionar plano, segmento e template, `/app/onboarding/setup` apresenta
nome, slug, descrição, telefone, WhatsApp, Instagram, cidade, estado e endereço.
Telefone, cidade e estado são obrigatórios; contatos adicionais, descrição e
endereço são opcionais. A tela mostra as escolhas e permite voltar para corrigi-las
antes de criar a empresa. Usa os componentes e estilos Gradefy existentes.

Após criar, mostra o estabelecimento em configuração e informa que não há
publicação, trial ou cobrança. A conta oferece “Retomar configuração”.
Não há cadastro de serviços, profissionais, agenda ou editor nesta fase.

## API e integridade

- `POST /api/onboarding/business`: sessão existente obrigatória, corpo estrito
  validado com Zod e `Idempotency-Key` opcional.
- `GET /api/onboarding/business`: retorna `{ company }` da configuração pendente
  criada pelo usuário, somente quando ele ainda é owner ativo. Retorna `null`
  quando não existe configuração acessível. Não aceita um seletor empresarial.

O POST revalida o plano disponível e o par segmento/template ativo e implementado
no catálogo da Fase 7C. Slugs usam letras ASCII minúsculas, números e hífens, entre
3 e 60 caracteres. Bloqueia rotas reservadas e mantém a constraint UNIQUE do banco.
Telefone/WhatsApp são normalizados; Instagram aceita somente URL HTTPS de perfil
no domínio instagram.com. Nunca aceita company_id, owner, preço ou status do cliente.

Uma transação grava `companies`, `company_members` (owner ativo), `company_settings`,
`company_onboarding` e a resposta da idempotência. Falha em qualquer escrita reverte
tudo, incluindo a chave; a tentativa pode ser repetida.

Reutiliza `idempotent`, `requestKey` e `lockResource`. A identidade inicial da empresa
é um hash estável do ID do criador, independente do slug e da chave, para permitir
usar a infraestrutura empresarial existente sem referenciar a Igor nem criar outro
sistema de idempotência. A chave tem escopo empresa inicial + ator + company-create.
POST repetido com chave/payload iguais retorna o resultado original (HTTP 201);
payload diferente retorna 409. O prazo existente de retenção da chave é 24 horas.
Após a expiração, a empresa e seu estado durável continuam impedindo duplicação.
Repetir sem chave também não cria outra empresa; retorna conflito e pode ser retomado
pelo GET. Replays não contornam a revogação do vínculo owner.

Locks transacionais PostgreSQL serializam o mesmo criador e reservas de slug entre
criadores diferentes. SQLite usa as transações de escrita já serializadas.
Um criador com empresa ativa ou já criada nesse onboarding não cria outra nesta fase.
Não altera a capacidade existente de pertencer a múltiplas empresas como membro.

## Migration 009

`009-gradefy-company-onboarding.sql` é necessária para persistir plano e progresso
sem criar assinatura. Adiciona `company_onboarding`:

- `company_id`: PK explicitamente NOT NULL e FK companies.
- `created_by`: FK obrigatória users.
- `plan_id`: FK obrigatória plans.
- `status`: pending/completed; default pending.
- `created_at` e `updated_at`: timestamps textuais obrigatórios, seguindo o projeto.
- Índice único de configuração pendente por criador.

Amplia o CHECK da tabela de idempotência para company-create. PostgreSQL altera o
CHECK; SQLite reconstrói somente essa tabela, copiando todas as chaves existentes
e recriando o índice. O runner usa a verificação existente contra índices, triggers
e FKs entrantes personalizados antes da reconstrução. Nada é descartado em silêncio.

Migrations 001–008 permanecem intactas. Registro/checksum e execução repetida seguem
o runner existente. Testes de versões antigas foram atualizados para esperar 009
e suas fixtures descartáveis removem essa nova tabela antes de reconstruir schemas
antigos. Não há comando destrutivo novo para instalações reais.

## Estado pendente e retomada

A empresa começa com `companies.status='suspended'` e registro explícito
`company_onboarding.status='pending'`. Esse uso do status já disponível evita
reconstruir companies ou alterar a resolução operacional da Fase 3. Empresas em
configuração não aparecem na listagem de empresas ativas e suas rotas públicas e
administrativas continuam bloqueadas. Um estabelecimento suspenso antigo, como a
Igor, não é confundido com onboarding porque não possui esse novo registro.

As escolhas salvas localmente são somente preferências antes da criação. Depois,
o banco é a fonte de verdade: recarregar, apagar localStorage ou entrar novamente
com a mesma conta recupera o estabelecimento pendente. O gate redireciona tentativas
de reiniciar as etapas para setup e é atualizado imediatamente após a criação.
O formulário de dados ainda não enviado não é persistido; suas escolhas de catálogo
continuam no rascunho anterior. Falhas de rede preservam o formulário montado e a
mesma chave para repetir o mesmo payload. Há fallback seguro para gerar a chave
em navegadores de teste por HTTP sem crypto.randomUUID.

Nenhuma subscription é inserida e nenhum startTrial é chamado.

## Arquivos desta subfase

- `server/company-onboarding.js`, `server/app.js`, `server/migrations.js` e migration 009.
- `src/gradefy/business-setup.tsx`, `business-types.ts`, `company-access.ts`,
  `plans.tsx`, `pages.tsx`, `catalog.tsx`, `styles.css` e `src/main.tsx`.
- `src/lib.ts`: preserva detalhes de validação no ApiError para erros junto aos campos.
- `tests/company-onboarding.test.js`, `tests/helpers/company-onboarding.js`,
  `tests/e2e/gradefy-business.spec.js`.
- Testes de regressão atualizados: `tests/company-integrity.test.js`,
  `company-migration.test.js`, `data-ownership.test.js`,
  `tests/helpers/access-migration.js`, `barber-classic-migration.js`,
  `barber-classic.js`, `data-ownership.js`, `professional-idempotency.js`,
  `professionals-migration.js`, `scheduling-reliability.js`,
  `tests/postgres/foundation.test.js`, `tests/e2e/gradefy-catalog.spec.js` e
  `tests/dev-e2e/gradefy-plans.spec.js`.
- Este documento.

## Validação e acesso local

Testes direcionados SQLite/HTTP verificam criação, campos e catálogos inválidos,
slugs reservados/duplicados, owner, isolamento, repetição, chaves incompatíveis,
concorrência por empresa e por slug, falhas em todas as escritas, retomada, nenhum
trial, preservação da Igor, upgrade/rollback/reexecução e conservação das chaves.
O mesmo contrato roda em PostgreSQL 17.11 local descartável com duas conexões.
E2E valida API real, responsividade 320/390/768/1440, respostas perdidas, erros de
campo, volta entre etapas, retomada sem armazenamento local e novo login.
Também são executados backend completo, E2E completo, build/TypeScript, Prettier
e git diff --check. Relatórios ficam em test-results/phase7d1-*.

Para demonstração local, `npm run dev:test-access`, com conexões de banco vazias,
fora de produção. Abra `http://localhost:5173/app/login`, crie uma conta ou use
`cliente@example.com` / `ClienteDemo2026!`, e siga plano → segmento → template → setup.
Esse modo utiliza SQLite temporário; encerrar/reiniciar o backend descarta os dados.
Em uma instalação persistente, o onboarding criado sobrevive a reinícios normalmente.

Nenhum acesso a Supabase/produção, commit ou push foi realizado.

## Fase 7D.2 futura

Será necessário completar a configuração exigida, revalidar catálogo e plano,
conferir o owner, e somente então concluir o estado pendente e ativar a empresa/trial
de forma transacional com a infraestrutura existente. A publicação deverá obedecer
seus próprios requisitos. Nada disso é executado pela Fase 7D.1.
