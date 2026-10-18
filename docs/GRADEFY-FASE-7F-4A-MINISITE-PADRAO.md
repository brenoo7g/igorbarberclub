# Gradefy — Fase 7F.4A: Mini Site padrão

## Entrega e compatibilidade

O template `gradefy-minisite` é o padrão de novos estabelecimentos. O identificador `barber-classic` continua disponível por escolha explícita. Empresas existentes, inclusive a Igor, mantêm seu template, URLs, informações, fotografias e reservas.

As alterações pendentes da Fase 7F.3C.2 foram preservadas, sem commit, conforme autorização expressa do usuário. Esta fase não altera autenticação, motor de agenda, regras financeiras, app mobile, landing comercial, produção ou DNS.

## Arquitetura e banco

- `src/templates/index.tsx` concentra a resolução de empresa, sessão, contexto da API e prévia já existentes; seleciona o layout e a página inicial pelo template da empresa. O antigo `barber-classic/index.tsx` reexporta essa infraestrutura para manter compatibilidade. Os componentes visuais do Barber Classic permanecem intactos.
- `src/templates/gradefy-minisite/` contém layout, página inicial, estilos isolados, validação de links e demonstração somente de leitura. Reutiliza catálogo, reservas, conta do cliente e modal existentes.
- `server/site-templates.js` define os pares de template/nicho implementados e o limite de fotografias. Editor, publicação e leitura pública reconhecem os dois templates.
- Migration **020-gradefy-minisite** adiciona o template ao catálogo, usando `ON CONFLICT DO NOTHING`. Também garante o nicho inicial em um banco vazio, pois migrations precedem o bootstrap. Não altera tabelas, registros empresariais ou migrations 001–019. O registro e checksum usam a infraestrutura versionada existente.
- O cadastro empresarial assume Mini Site quando `templateCode` é omitido e revalida a disponibilidade real no catálogo. O catálogo informa `defaultTemplateCode`; o frontend sugere essa opção, preservando uma escolha explícita anterior.

**Nicho operacional habilitado e testado:** `barbershop`. Templates: `gradefy-minisite` e `barber-classic`. Salão, nail designer e tatuagem continuam “Em breve”; não foram liberados apenas pela existência de linhas no catálogo.

## Estrutura visual e identidade

A imagem `gradefy-minisite.png` fornecida foi inspecionada antes da implementação. Foram reproduzidos fundo marinho, detalhes roxos/ciano, banner opcional, logo circular com contorno luminoso, nome e slogan, CTA em gradiente, quatro ações em grade, portfólio 2+3, horários e assinatura discreta Gradefy. A página adapta essa composição para celular e desktop sem desenhar uma moldura de telefone ou uma barra de status falsa.

Logo, nome, slogan, banner, cores e contatos vêm exclusivamente da empresa resolvida. Ausência ou falha de imagem usa iniciais/fundo neutro. Não há selo de verificação fictício. As marcas oficiais Gradefy e fontes Sora/Inter locais são reutilizadas. Foco visível, modal com teclado, fechamento por Escape, retorno do foco, movimento reduzido e botões para toque foram considerados.

As fotografias e a identidade “Barbearia Horizonte” existem somente na demonstração explicitamente identificada e nos testes descartáveis. Nunca são usadas como conteúdo substituto de uma empresa real. O SVG de demonstração é separado da marca oficial Gradefy. A imagem do catálogo foi capturada da página implementada no navegador.

## Editor, portfólio e horários

`/app/meu-site` reutiliza as informações do onboarding e permite salvar identidade, cores, contato e localização; enviar/remover logo e banner; adicionar, remover e ordenar fotografias; visualizar, publicar e retirar o site do ar.

- Mini Site: **cinco fotos**, limitadas no editor e no backend. A leitura pública e a prévia também respeitam o limite.
- Barber Classic: **40 fotos**, preservando o limite e os dados históricos.
- Uploads continuam privados, otimizados e vinculados à empresa. Contagem e versão são verificadas novamente após o envio ao armazenamento. O editor e a rota administrativa antiga compartilham o lock da galeria, impedindo ultrapassar cinco imagens por concorrência. Alterações pela rota antiga invalidam a versão do editor Mini Site.
- Não há uma nova seção de serviços em destaque. O card “Ver serviços” abre o catálogo real e encaminha ao fluxo existente com o serviço selecionado.
- WhatsApp, Instagram e mapa só recebem destinos válidos; ações sem configuração são desabilitadas com orientação. O mapa aproveita o endereço público já cadastrado, incluindo o endereço estruturado existente.
- Horários e status usam apenas a grade empresarial explicitamente configurada e validada, o fuso da empresa e o relógio do servidor. Dias não consecutivos não são agrupados como um intervalo contínuo. Pausas são exibidas. Na ausência de dados confiáveis, aparece “Consulte os horários ao agendar”, sem inventar “Aberto agora”. Esse status não substitui o cálculo de disponibilidade.

## Rotas, publicação e segurança

| Rota                              | Função                                                |
| --------------------------------- | ----------------------------------------------------- |
| `/{slug}`                         | Template público escolhido pela empresa               |
| `/{slug}/agendar`                 | Motor de reservas existente, com contexto da empresa  |
| `/{slug}/minha-conta`             | Reservas do cliente/visitante, incluindo cancelamento |
| `/app/meu-site`                   | Editor autenticado do proprietário/gestor             |
| `/preview/site/:previewCompanyId` | Prévia privada dos dados salvos, sem agendamentos     |
| `/preview/gradefy-minisite`       | Demonstração estática identificada, sem agendamentos  |
| `/preview/barber-classic`         | Prévia anterior preservada                            |
| `/`, `/agendar`, `/minha-conta`   | URLs legadas da Igor preservadas                      |

Publicação é explícita e mantém verificações de permissão, assinatura/trial, onboarding concluído, serviços, profissionais, grade e armazenamento. Configurar o Mini Site não publica a empresa automaticamente nem inicia outro trial. A prévia privada exige membership e não permite gravações de reservas. Retirar o site do ar oculta os dados públicos e as imagens; históricos e cancelamentos autorizados continuam disponíveis na infraestrutura anterior.

Isolamento, versões de edição, escopo dos arquivos e restrições de publicação são verificados no backend. URLs, IDs de galeria e headers empresariais adulterados não autorizam conteúdo de outra empresa.

## Como testar manualmente

1. No projeto, inicie o ambiente local com `npm run dev`, usando somente seu banco de desenvolvimento e armazenamento de teste previamente configurados. Não use credenciais de produção.
2. Para inspecionar a composição sem criar uma empresa, abra **http://localhost:5173/preview/gradefy-minisite**. É uma demonstração ilustrativa e não agenda horários.
3. Cadastre uma conta de desenvolvimento em `/app`, escolha plano e Barbearia e confira a seleção padrão “Gradefy Mini Site”. Escolher Barber Classic explicitamente continua possível.
4. Conclua o onboarding operacional existente com serviço, profissional e grade válidos; isso usa o fluxo de trial já implementado, sem nova regra nesta fase.
5. Em `/app/meu-site`, configure a identidade e envie até cinco fotos. Reordene, exclua e tente enviar a sexta foto. Confira também o aviso quando o armazenamento não estiver configurado.
6. Use “Visualizar meu site”: confira dados e fotos e a ausência de agendamentos na prévia privada. Depois publique explicitamente e abra `/{slug}`.
7. Abra o catálogo ou “Agendar horário”, reserve com visitante ou cliente autenticado e confira o histórico em `/{slug}/minha-conta`. Teste cancelamento, bloqueios, almoço e reservas pausadas.
8. Retire o site do ar e confira que dados/imagens públicos ficam indisponíveis, mantendo as reservas anteriores.
9. Confira as larguras 320, 390, 768 e 1440 px e as URLs originais da Igor.

Os E2E iniciam automaticamente `tests/browser-server.js` na porta 4173, com banco em memória e armazenamento de teste. A fixture `/minisite-browser` é fictícia e existe somente nesse servidor descartável; não é criada no banco usado por `npm run dev`.

## Validação

Logs locais ficam em `test-results/minisite-*.log` e capturas nas quatro larguras em `test-results/minisite-{largura}.png`; não são versionados. Testes utilizam `DOTENV_CONFIG_PATH=NUL` e conexões isoladas. A suíte PostgreSQL cria um cluster novo em loopback com PostgreSQL portátil **17.11**, nunca usando Supabase, `.env` ou banco existente.

| Verificação                                             | Resultado                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Backend e SQLite (`npm test`)                           | 305 aprovados                                                                             |
| Mini Site E2E direcionado                               | 6 aprovados                                                                               |
| PostgreSQL completo                                     | 247 aprovados, incluindo concorrência na última vaga do portfólio                         |
| E2E completo (`npm run test:e2e`)                       | 97 aprovados                                                                              |
| Build, TypeScript e `check:schedule` (`npm run build`)  | Aprovados                                                                                 |
| Prettier (`npm run format:check -- --end-of-line auto`) | Aprovado                                                                                  |
| Mobile unitário (`npm test` em `app-mobile`)            | 5 aprovados                                                                               |
| Mobile TypeScript (`npm run typecheck` em `app-mobile`) | Bloqueado: dependências locais Expo/React Native ausentes; nenhum arquivo mobile alterado |

Os cenários Mini Site compartilhados entre SQLite e PostgreSQL abrangem migration transacional e idempotente, preservação Igor/Classic, padrão de cadastro, edição e versão concorrente, escopo empresarial, cinco uploads com disputa pela última vaga, bloqueio da sexta foto nas duas APIs, prévia privada, reordenação/remoção, publicação, trial expirado, imagens privadas, reservas reais autenticadas e visitantes, almoço de 40 minutos, bloqueios, pausa e despublicação com histórico preservado. Os E2E cobrem o fluxo visual completo, links, falhas, imagens ausentes, navegação por teclado e responsividade.

Após o build final, a revalidação conjunta Mini Site + Barber Classic também concluiu com **10 E2E aprovados**, incluindo slogan longo em 320 px. `git diff --check` passou. Favicon sem identidade cadastrada usa a marca Gradefy apenas no novo Mini Site; o comportamento legado permanece preservado.

O encerramento normal do cluster descartável encontrou timeout no checkpoint final no Windows. O runner foi ajustado para tentar parada imediata **somente do cluster temporário que ele próprio criou**, após esse timeout, sem ocultar falhas de testes ou tocar em serviços PostgreSQL existentes.

Na execução PostgreSQL final, `testExitCode=0`, `clusterStopped=true`, `clusterRemoved=true` e `productionAccess=false`. Dois diretórios de execuções anteriores, já com os bancos parados, ficaram em `%LOCALAPPDATA%/Temp`: `gradefy-pg-validation-nFAAR6` e `gradefy-pg-validation-sttjrF`. A tentativa adicional de limpeza foi rejeitada pela revisão automática com “blocked by policy”; esses bancos são descartáveis e não pertencem ao projeto.

## Arquivos desta fase

Criados:

- `server/site-templates.js`
- `server/migrations/020-gradefy-minisite.sql`
- `src/templates/index.tsx`
- `src/templates/gradefy-minisite/index.tsx`
- `src/templates/gradefy-minisite/styles.css`
- `src/templates/gradefy-minisite/links.ts`
- `src/templates/gradefy-minisite/preview.ts`
- `public/images/minisite-demo-logo.svg`
- `public/gradefy/minisite-preview.png`
- `tests/minisite.test.js`
- `tests/helpers/minisite.js`
- `tests/helpers/minisite-migration.js`
- `tests/helpers/minisite-browser.js`
- `tests/e2e/gradefy-minisite.spec.js`
- Este relatório.

Modificados para integração: `server/company-onboarding.js`, `server/company-site.js`, `server/migrations.js`, `server/onboarding-catalog.js`, `server/portfolio.js`, `server/public-site.js`, `server/site-publication.js`, `src/main.tsx`, `src/types.ts`, `src/templates/barber-classic/index.tsx`, `src/gradefy/catalog.tsx`, `src/gradefy/site-editor.tsx` e `tests/browser-server.js`.

Ajustados os testes e helpers de reconstrução de schema para a versão 020 e o catálogo com dois templates: `tests/company-bootstrap.test.js`, `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`, `tests/gradefy-catalog.test.js`; `tests/helpers/{access-migration,agenda,barber-classic,business-management,company-onboarding,data-ownership,finance,operational-onboarding,operational-settings,professional-availability-migration,professional-idempotency,professional-panel,professionals-migration,scheduling-reliability,session-address-invitations,session-address-migration,site-browser,site-editor,team}.js`; `tests/e2e/{gradefy-address-invitations,gradefy-business,gradefy-catalog}.spec.js`; `tests/postgres/foundation.test.js` e `tests/postgres/run-local.mjs`.

Os demais arquivos pendentes da Fase 7F.3C.2 continuam preservados. Nenhuma migration anterior foi editada nesta fase. Nenhum commit ou push foi executado.

## Limitações e Alpha

- Outros nichos dependem de habilitação operacional e testes próprios; não são anunciados como disponíveis.
- O armazenamento privado existente deve estar configurado no ambiente de desenvolvimento/homologação para uploads. Esta fase não provisiona infraestrutura externa.
- A prévia estática usa material ilustrativo identificado. Empresas reais precisam cadastrar seu próprio material.
- Build/TypeScript web e testes de banco/navegador não substituem homologação de dispositivos reais e configuração de infraestrutura Alpha. O typecheck mobile depende da instalação das dependências desse aplicativo independente.
- O site continua usando o modelo de renderização SPA existente; não foi adicionado um novo serviço de SSR/SEO.
- A entrega não representa garantia absoluta de ausência de bugs; os cenários automatizados e seus limites estão registrados acima.
