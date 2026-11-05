# Gradefy — Fase 7F.4C.6.1-R2: prévia e progresso mobile

## Diagnóstico

A branch `feat/gradefy-foundation` já continha as alterações não commitadas da R1, que foram preservadas. Foram lidos o relatório da R1, as duas referências oficiais em `docs/design-references/onboarding/` e as capturas anteriores. A versão de 390 px dividia a prévia e o progresso em colunas de cerca de 150 px; o endereço e as descrições ficavam comprimidos, com fontes de 10–11 px.

## Ajuste

Somente os estilos mobile de `src/gradefy/business-setup.css` foram alterados. O painel conserva título, gradientes, bordas, ícone de estabelecimento, nome e segmento dinâmicos, estados reais do progresso e aviso sobre teste grátis. A prévia passou a usar ícone e identificação lado a lado, URL em linha própria selecionável e progresso em largura inteira logo abaixo. Os textos do progresso têm 12–14 px e os estados 11 px. A URL continua derivada da origem atual e do slug, sem criar link público antes da publicação.

O ajuste vale até 680 px. Foram verificados 312, 320, 360, 375, 390 e 428 px: nenhuma largura gerou overflow horizontal, o endereço permaneceu dentro do card e o progresso ficou abaixo da prévia com espaço para leitura. Em 320 px, a URL ocupa duas linhas; em 390 e 428 px, cabe em uma linha na fixture local. Não houve mudança na ordem dos blocos, nos campos, na lógica de progresso, na criação empresarial, no CEP, no backend, no banco, no Igor ou no Barber Classic.

## Capturas reais

As capturas são do Chromium com SQLite em memória e ficam em `test-results/`, fora do Git. A referência mobile oficial é `docs/design-references/onboarding/onboarding-mobile-reference.png.png`.

| Estado                                                                   | Arquivo                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Antes R1, mobile completo 390 × 844                                      | `test-results/gradefy-7f4c61-r2-before-mobile-full-390x844.png` |
| Depois R2, mobile completo 390 × 844                                     | `test-results/gradefy-7f4c61-r2-mobile-full-390x844.png`        |
| Painel R2, 320 × 720                                                     | `test-results/gradefy-7f4c61-r2-panel-320x720.png`              |
| Painel R2, 390 × 844                                                     | `test-results/gradefy-7f4c61-r2-panel-390x844.png`              |
| Painel R2, 428 × 926                                                     | `test-results/gradefy-7f4c61-r2-panel-428x926.png`              |
| Nome e slug preenchidos; dados básicos completos                         | `test-results/gradefy-7f4c61-r2-partial-390x844.png`            |
| Nome, slug, telefone, cidade e estado preenchidos; três grupos completos | `test-results/gradefy-7f4c61-r2-filled-390x844.png`             |
| Desktop R1 antes                                                         | `test-results/gradefy-7f4c61-r2-before-desktop-1672x941.png`    |
| Desktop R2 depois                                                        | `test-results/gradefy-7f4c61-r2-desktop-1672x941.png`           |

A comparação por dados de pixel dos dois PNGs desktop em **1672 × 941** encontrou **0 pixels diferentes em 1.573.352**. O desktop aprovado permaneceu visualmente idêntico. A diferença deliberada em relação ao protótipo mobile é o empilhamento da prévia e do progresso: a foto ilustrativa também permanece substituída pela composição CSS neutra para todos os segmentos, conforme decidido na R1.

## Testes e arquivos

- `npm.cmd run build`: aprovado, incluindo TypeScript e a checagem tipada da agenda.
- E2E dirigido de cadastro anterior, fidelidade R1 e painel R2: **4/4**. Confere criação real, idempotência, URL, progresso, retomada, seis larguras mobile e desktop.
- E2E R2 após reforçar a verificação dos três estados completos: **1/1**.
- Prettier direcionado e `git diff --check`: aprovados.

Arquivos desta R2: `src/gradefy/business-setup.css`, `tests/e2e/gradefy-onboarding-mobile-r2.spec.js` e este relatório. Os demais arquivos modificados ou não rastreados pertencem à R1 e continuam intactos. Não houve commit, push, deploy ou acesso à produção.

## Revisão pendente

A aprovação visual final depende da revisão das capturas pelo proprietário. Teclado virtual e leitor de tela em dispositivo físico continuam como verificações manuais.
