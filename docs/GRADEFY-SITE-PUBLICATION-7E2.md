# Gradefy — Fase 7E.2

Prévia autenticada, publicação explícita e retirada do site Barber Classic. Nenhuma migration foi criada ou alterada. Autenticação, cookies, JWT, planos, onboarding e agendamentos existentes são reutilizados. Nenhum commit, push ou acesso a produção foi realizado.

## Interface e endereços

- Editor: `http://localhost:5173/app/meu-site`.
- Prévia real: `/preview/site/:companyId`, acessível pelo botão **Visualizar meu site**.
- Site público: `/:slug`; reservas: `/:slug/agendar`; histórico: `/:slug/minha-conta`.
- Após publicar: status, endereço da origem atual, **Abrir meu site**, **Copiar link**, **Compartilhar** e **Retirar site do ar** com confirmação.
- A demonstração genérica `/preview/barber-classic` continua separada. As URLs legadas da Igor permanecem disponíveis.

Use o servidor local com variáveis apontando exclusivamente a SQLite local/descartável. Não use a configuração de produção para esta validação. O servidor de demonstração usa memória: reiniciá-lo apaga somente seus dados temporários.

## Prévia privada

O frontend reutiliza `SiteShell`, `Layout`, `Home`, serviços e carrossel do Barber Classic. Um endpoint autenticado reúne identidade, seções, serviços, preços, profissionais e portfólio da empresa escolhida. Não há fallback para Igor nem autenticação paralela.

Cada chamada exige sessão válida e membership ativa owner/manager. A empresa precisa estar ativa; onboarding suspenso não ganha acesso ao editor. Imagens usam as rotas privadas do editor. Não há tokens em URLs, chaves do provedor, base64 ou endereço interno do bucket no DTO.

Links de agendamento/conta são desativados na prévia real; sua API de apresentação permite somente os dados de leitura carregados. Não há endpoint de criação de reservas na prévia. Recarregamento, foco e eventos de troca/expiração da sessão revalidam a autorização. Conteúdo já visualizado não pode ser retirado retroativamente da memória de outro navegador.

## Publicação e estados

Empresa existente, onboarding concluído, assinatura/trial vigente e site publicado são estados independentes. Salvar e concluir onboarding não publicam automaticamente.

Publicar valida no servidor:

- sessão e membership owner/manager revalidada dentro da transação;
- nome e slug válidos, incluindo a lista compartilhada de rotas reservadas;
- onboarding concluído, salvo compatibilidade legada explícita da Igor;
- template Barber Classic ativo e compatível com nicho ativo;
- trial/assinatura válida pelas regras atuais, sem iniciar ou renovar trial; Igor não recebe assinatura automática;
- serviços ativos válidos, profissionais ativos e associações consistentes;
- sete dias de expediente explicitamente cadastrados para cada profissional, com intervalos válidos e duração de serviços que cabe no expediente;
- imagens gerenciadas vinculadas à empresa, prontas e legíveis no armazenamento privado.

Imagens são opcionais. URLs estáticas/externas permitidas seguem a validação existente; o servidor não busca URLs arbitrárias para evitar SSRF. Fotos legadas em base64 continuam funcionando.

Transação única altera `site_published` e incrementa `site_version` depois das verificações. O comando declara o estado desejado: repetições/concorrência e perda de resposta retornam sucesso sem nova alteração quando o estado já é o solicitado. Mudança de estado com versão antiga recebe conflito. Nenhum segundo sistema de idempotência foi criado.

Locks seguem a ordem editor → publicação → entitlements → catálogo → autorização empresarial → profissionais. Row locks PostgreSQL usam `FOR NO KEY UPDATE`: impedem alteração concorrente de permissão/status sem bloquear desnecessariamente os locks de foreign keys de operações existentes. Testes usam conexões PostgreSQL independentes.

O conteúdo público continua resolvido por slug, empresa ativa e `site_published=1`. Depois de publicar, salvar no editor atualiza os dados públicos atuais; não há catálogo paralelo de rascunhos. A API revalida publicação dentro da transação de agendamento, protegida pelo mesmo lock de visibilidade, e aplica os entitlements atuais a empresas criadas pelo onboarding.

## Despublicação e reservas anteriores

Retirar do ar altera somente a visibilidade e a versão. Não remove fotos, serviços, profissionais ou reservas, nem cancela reservas existentes.

Site, catálogo, disponibilidade, fotos e novas reservas passam a retornar 404 publicamente. Edição e prévia autenticada continuam disponíveis.

Exceções estritas no roteador público permitem somente leitura da identidade da própria sessão, logout, histórico autenticado e cancelamento autorizado de reservas anteriores. Ownership continua exigindo empresa e usuário/visitante; conhecer o slug não concede acesso. Remarcação pública não fica disponível enquanto o catálogo/agenda estão privados.

Em `/:slug/minha-conta`, o frontend usa uma apresentação neutra quando o site está fora do ar. Não carrega nome, imagens ou configurações privadas do estabelecimento. Login existente e cookie de visitante continuam funcionando para consultar e cancelar reservas.

## Imagens e cache

O bucket permanece privado. Entrega pública passa por `/api/public/:slug/site-assets/:id/image` e pelo endpoint existente de portfólio; Igor usa os aliases antigos. A API valida empresa/publicação, vínculo e chave de armazenamento da própria empresa; após a leitura do provedor verifica novamente a visibilidade.

Respostas usam `Cache-Control: no-store`. Não são geradas URLs públicas permanentes nem signed URLs; portanto não há janela adicional de expiração de links após retirada do ar. Uma cópia já baixada pelo visitante não pode ser revogada.

Supabase Storage real não foi acessado: testes usam exclusivamente o adaptador simulado. Configuração do bucket privado, credenciais somente no servidor, disponibilidade e entrega real seguem pendentes de homologação em projeto descartável. A publicação verifica leitura de cada imagem gerenciada; indisponibilidade do provedor impede a publicação atomicamente.

## Endpoints

| Endpoint                                    | Regra                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET /api/company-site/preview               | Sessão, membership owner/manager, empresa explícita; leitura privada                                         |
| POST /api/company-site/publish              | Body estrito `{version}`, validações e transação                                                             |
| POST /api/company-site/unpublish            | Body estrito `{version}`, autorização e transação                                                            |
| /api/public/:slug/*                         | Resolve slug validado; publicação obrigatória, exceto histórico/cancelamento/sessão estritamente delimitados |
| POST /api/public/:slug/appointments[/guest] | Motor existente, publicação revalidada na transação                                                          |
| Imagens públicas                            | Vínculo empresarial, provedor privado, publicação revalidada após leitura, no-store                          |

O identificador enviado no header `X-Gradefy-Company-Id` ou query privada `company` é apenas um seletor; nunca autorização.

## Arquivos desta fase

Criados:

- `server/company-slugs.js`, `server/site-publication.js`.
- `src/templates/barber-classic/Professionals.tsx`.
- `tests/site-publication.test.js`, `tests/helpers/site-publication.js`, `tests/helpers/site-browser.js`, `tests/e2e/gradefy-site-publication.spec.js`.
- Este documento.

Alterados:

- `server/app.js`, `server/company-access.js`, `server/company-onboarding.js`, `server/company-site.js`, `server/public-site.js`, `server/site-assets.js`, `server/portfolio.js`, `server/operational-onboarding.js`.
- `src/main.tsx`, `src/site-context.tsx`, `src/styles.css`, `src/pages/Home.tsx`, `src/components/Layout.tsx`, `src/components/UI.tsx`, `src/components/Portfolio.tsx`, `src/templates/barber-classic/index.tsx`, `src/gradefy/site-editor.tsx`, `src/gradefy/styles.css`.
- `tests/postgres/foundation.test.js`, `tests/e2e/gradefy-site-editor.spec.js`, `tests/e2e/barber-classic.spec.js`.

Mudanças anteriores das Fases 7A–7E.1 continuam na árvore de trabalho, sem descarte ou commit. O app mobile não foi modificado.

## Verificação

Testes direcionados exercitam prévia real/privada, ausência de fallback, autorização entre empresas, publicação incompleta, assinatura expirada, horários/associações inválidos, imagens ilegíveis, rollback, repetição/perda de resposta, publicação concorrente e conflitos com catálogo/profissionais.

Reservas reais reutilizam o motor existente, incluindo visitante sem login. Retirada concorrente impede uma reserva que chega enquanto a despublicação está sendo gravada; histórico e cancelamento permanecem privados e autorizados. Fixtures e checksums Igor são preservados.

E2E verifica dados/imagens reais, seções, cores, profissionais, prévia sem reserva, publicação com resposta perdida, alterações após publicar, confirmação de retirada, revogação de imagens, sessão perdida, visitante/agendamento/cancelamento e isolamento. Responsividade verificada em 320, 390, 768 e 1440 px.

Comandos (com `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL=''` e `POSTGRES_URL=''` nos testes locais):

- `node --test tests/site-publication.test.js`.
- `npm test` (inclui SQLite).
- `node tests/postgres/run-local.mjs --bin C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin` — cluster local descartável, nunca usa banco de produção.
- `npm run test:e2e`.
- `npm run build` — TypeScript, check JS de agenda e Vite.
- `npm run format:check`; `git diff --check`.

| Verificação                                  | Resultado     |
| -------------------------------------------- | ------------- |
| Suíte direcionada SQLite 7E.2                | 10 aprovados  |
| Backend/SQLite completo                      | 150 aprovados |
| PostgreSQL local 17.11, cluster descartável  | 98 aprovados  |
| E2E completo Chromium                        | 40 aprovados  |
| Revalidação E2E final de publicação/retirada | 2 aprovados   |
| Build, TypeScript e check JS de agenda       | Aprovados     |
| Prettier e git diff --check                  | Aprovados     |

Logs locais ignorados pelo Git: test-results/phase7e2-*.txt e test-results/postgres-validation/report.json.

A entrega não inclui domínio personalizado, gateway, templates novos, editor HTML/CSS, publicação automática ou outra fase.
