# Gradefy — Fase 7F.4C.6.1-R1: cadastro do estabelecimento

## Diagnóstico e referências

Branch `feat/gradefy-foundation`. Antes da edição, o Git tinha apenas as duas referências novas não rastreadas em `docs/design-references/onboarding/`; não havia alterações pendentes em código. Foram abertas visualmente `onboarding-desktop-reference.png.png` e `onboarding-mobile-reference.png.png` (a extensão dupla é o nome real dos arquivos). O relatório da fase 7F.4C.6.1 e as telas já renderizadas foram consultados. O formulário anterior tinha os quatro grupos, mas ficava dentro de um card único sem painel lateral; o resumo ocupava muita altura, e a versão mobile não mostrava a prévia antes dos campos.

## Implementação

- **Desktop:** stepper e título centralizados; resumo compacto à esquerda; grade de aproximadamente 70/30 entre quatro cards independentes e o painel de prévia/progresso. Os botões finais ficam sob o formulário.
- **Mobile:** a ordem é identidade, retorno, stepper, título, escolhas, prévia/progresso, quatro grupos e ações. A versão real é rolável, sem moldura de celular. De 375 a 680 px, prévia e progresso cabem lado a lado dentro do painel; abaixo disso, empilham para preservar a leitura.
- **Escolhas:** plano, segmento e template vêm dos catálogos existentes; os links reais permitem alterá-los. Um rascunho do formulário é guardado em `sessionStorage`, separado por ID de usuário, para não perder campos ao voltar ao plano/segmento ou atualizar a página. O backend continua revalidando todos os dados. O rascunho é removido após criação bem-sucedida.
- **Prévia:** nome e segmento selecionado mudam com o formulário. A URL usa `window.location.origin` e o slug digitado; o rótulo informa que o endereço só estará disponível após a publicação. Não há link funcional, imagem fictícia, publicação ou criação antecipada. O ícone de estabelecimento e a cena são CSS/Lucide.
- **Progresso:** dados básicos, contato e localização usam os valores e erros locais atuais. Cada item mostra texto de estado (pendente, em preenchimento ou completo), sem persistência no servidor. “Completo” indica apenas validação local; slug reservado, indisponível e demais regras do backend continuam sendo confirmados no envio.
- **Validações:** mantidos campos obrigatórios reais (nome, slug, telefone, cidade e estado), descrição/WhatsApp/Instagram/CEP opcionais, endereço estruturado condicional e número do imóvel quando necessário. A consulta de CEP e a correção manual usam o hook existente. Erros continuam associados aos controles; `aria-current` permanece no stepper. O botão de envio mantém loading, bloqueio de repetição e `Idempotency-Key`.
- **Trial:** aviso único no painel, coerente com o fluxo existente: criar empresa não inicia teste grátis, publica site ou gera cobrança.

O protótipo usa `gradefy.com.br`, uma foto de barbearia e asteriscos em campos opcionais. A interface usa a origem do ambiente atual, composição CSS neutra para qualquer nicho e a obrigatoriedade real do backend. Esses desvios evitam URL incorreta, foto específica de outro segmento e validação enganosa.

## Arquivos

- `src/gradefy/business-setup.tsx`: estrutura, prévia, progresso e rascunho local.
- `src/gradefy/business-setup.css`: layout e acabamento da tela, sem alterar o Design System global.
- `tests/e2e/gradefy-onboarding-fidelity.spec.js`: capturas e verificação de hierarquia, URL, rascunho, responsividade, erro, loading, criação e ausência de publicação.
- `docs/design-references/onboarding/*.png.png`: duas referências fornecidas pelo proprietário, preservadas com seus nomes originais.
- Este relatório.

Nenhuma migration, API, autenticação, template público, tela do Igor ou outra tela do Gradefy foi alterada.

## Capturas reais

Capturas geradas pelo Chromium com banco SQLite em memória e conta fictícia do teste. O estado anterior veio de uma cópia isolada do commit `3e153f8`, sem .env nem banco de produção. Arquivos em `test-results/` são ignorados pelo Git.

| Estado                                                | Arquivo                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Antes desktop, 1672 × 941                             | `test-results/gradefy-7f4c61-r1-before-desktop-1672x941.png`                                 |
| Antes mobile, 390 × 844                               | `test-results/gradefy-7f4c61-r1-before-mobile-390x844.png`                                   |
| Depois desktop, 1672 × 941                            | `test-results/gradefy-7f4c61-r1-desktop-1672x941.png`                                        |
| Depois desktop, página completa                       | `test-results/gradefy-7f4c61-r1-desktop-full-1672x941.png`                                   |
| Prévia desktop                                        | `test-results/gradefy-7f4c61-r1-preview-desktop-1672x941.png`                                |
| Desktop preenchido, erro e loading                    | `test-results/gradefy-7f4c61-r1-{filled,errors,loading}-desktop-1672x941.png`                |
| Depois mobile, 390 × 844                              | `test-results/gradefy-7f4c61-r1-mobile-first-390x844.png`                                    |
| Depois mobile, página completa                        | `test-results/gradefy-7f4c61-r1-mobile-full-390x844.png`                                     |
| Prévia, localização, ações, preenchido e erros mobile | `test-results/gradefy-7f4c61-r1-{preview,location,actions,filled,errors}-mobile-390x844.png` |
| Larguras adicionais                                   | `test-results/gradefy-7f4c61-r1-responsive-{320x720,360x800,428x926,1280x720}.png`           |

A comparação mostra o painel lateral ausente antes e presente depois, a prévia antes dos campos no mobile, cards independentes e ações proporcionais. A cena CSS substitui a foto ilustrativa sem simular um site publicado.

## Verificação

- Build web, TypeScript e checagem tipada de agenda: aprovado.
- E2E dirigido de cadastro, catálogos, planos e captura após o último ajuste: **9/9**. O teste novo verifica também 12 larguras, ordem dos blocos, rascunho após voltar, URL contextual, loading e site ainda não publicado.
- SQLite dirigido de onboarding, plano, catálogo e operação: 21/21.
- E2E geral: **148/148**, executado antes do ajuste pontual de alinhamento dos campos de localização; a rodada dirigida acima confirmou esse ajuste na versão final.
- Backend completo em execução serial, com conexões externas zeradas: **339/339**.
- App mobile: **5/5** e TypeScript (`tsc --noEmit`) aprovado.
- Build web, TypeScript, checagem tipada de agenda, Prettier direcionado e `git diff --check`: aprovados na versão final.
- PostgreSQL **17.11**, cluster novo no loopback: **267/267**. O relatório local registra `productionAccess: false`, `testExitCode: 0`, `clusterStopped: true` e `clusterRemoved: true`. O desligamento rápido expirou sob carga e o runner usou o desligamento imediato previsto para esse cluster descartável; não restou cluster ativo.

## Pendências

Conferir manualmente zoom real de 125%, leitor de tela e teclado virtual em celular físico. A prévia representa o preenchimento, não uma verificação de disponibilidade do slug. Os arquivos de captura são locais e não entram no Git.

A cópia isolada usada para reproduzir as capturas anteriores está em `../gradefy-before-r1`. A revisão automática do ambiente rejeitou a tentativa de removê-la; ela não integra a branch nem foi enviada ao Git.
