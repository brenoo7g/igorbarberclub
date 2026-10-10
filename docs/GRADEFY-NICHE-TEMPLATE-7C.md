# Gradefy — Fase 7C

## Fluxo e acesso local

`/app/login` → `/app/onboarding/plan` → `/app/onboarding/niche` →
`/app/onboarding/template` → `/app/onboarding/setup`.

`/app/onboarding/next` permanece como redirecionamento para o segmento.
Todas as etapas exigem a sessão existente e ausência de empresa ativa vinculada.
O progresso agora apresenta Plano, Segmento, Template e Seu negócio.

Execute `npm run dev:test-access` para demonstração descartável, com API em 3001
e Vite em 5173. Esse comando deve ser usado com as variáveis de conexão de banco
vazias e fora de produção. Não usa dados persistentes. Login de demonstração:
`cliente@example.com` / `ClienteDemo2026!`.

## Catálogo e validação

- `GET /api/onboarding/catalog`: lê `niches` e `templates`, sem dados empresariais.
- `POST /api/onboarding/niche-selection`: valida plano ativo e segmento disponível.
- `POST /api/onboarding/template-selection`: valida plano, segmento e template compatível.

Os endpoints usam autenticação, proteção de origem e tratamento de erros existentes.
Os POSTs são estritamente de validação, sem qualquer escrita no banco.
Propriedades adicionais, planos desconhecidos e combinações inválidas são recusados.

Somente `barber-classic` / `barbershop` possui implementação renderizável.
Templates e nichos inativos não são oferecidos; adicionar uma linha ao banco não
habilita um template inexistente. Salão, manicure e tatuagem são cards de apresentação
desabilitados “Em breve”, sem registros artificiais no catálogo.

## Preview e persistência

“Visualizar” abre `/preview/barber-classic` em nova aba. A demonstração existente
continua com placeholders e API local somente de leitura, sem agendamentos reais.
`public/gradefy/barber-classic-preview.png` é uma captura da demonstração local
em 1280 × 960, sem dados privados ou alterações no template.

O mesmo rascunho `gradefy:onboarding:v1:<userId>` guarda somente versão, `planCode`,
`nicheCode` e `templateCode`. Rascunhos antigos contendo somente plano continuam
válidos. Alterar plano preserva as outras preferências; alterar segmento remove
o template anterior. Recarregar e voltar entre etapas preserva as escolhas.
Usuários diferentes possuem chaves diferentes. Falhas de armazenamento impedem
o avanço e mostram erro. Apagar o armazenamento elimina essas preferências locais.

As telas confrontam os códigos locais com os catálogos ativos da API. Dados inválidos
retornam à etapa apropriada. O rascunho não concede acesso nem inicia assinatura.

## Arquivos desta fase

- Backend: `server/onboarding-catalog.js`, `server/app.js`.
- Frontend: `src/main.tsx`, `src/gradefy/catalog.tsx`, `plans.tsx`,
  `pending-plan.ts`, `styles.css`.
- Imagem: `public/gradefy/barber-classic-preview.png`.
- Testes: `tests/gradefy-catalog.test.js`, `tests/e2e/gradefy-catalog.spec.js`,
  `tests/e2e/gradefy-plans.spec.js`, `tests/dev-e2e/gradefy-plans.spec.js`,
  `tests/postgres/foundation.test.js`.
- Documentação: este arquivo.

## Validação

Testes direcionados de catálogo e preferências; regressão backend/SQLite;
E2E do fluxo, responsividade (320/390/768/1440), preview, erros recuperáveis,
isolamento de preferências e preservação Igor; teste com API real via Vite;
PostgreSQL 17.11 descartável; build/TypeScript, Prettier e `git diff --check`.

Nenhuma migration, autenticação, preço, assinatura ou arquivo do Barber Classic
foi modificado nesta fase. Nenhuma conexão de produção foi utilizada.

## Próxima etapa

`/app/onboarding/setup` é informativa: “Agora vamos configurar seu negócio.”
A Fase 7D deverá revalidar plano, segmento e template no backend antes de criar
qualquer empresa, assinatura ou trial. Não usar o rascunho local como autorização.
Essa configuração, publicação e ativação não foram implementadas na Fase 7C.
