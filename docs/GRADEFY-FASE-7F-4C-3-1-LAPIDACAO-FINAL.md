# Gradefy 7F.4C.3.1 — Lapidação final de Equipe e Serviços desktop

## Ajustes

- **Equipe:** a escala mostra horários reais em formato compacto (`09h–18h` ou `09h30–18h`). Intervalos, bloqueios e abertura manual têm contagem visível e horários completos em um detalhe nativo expansível. A grade mantém rolagem horizontal própria e pode receber foco para navegação por teclado. O cabeçalho e as linhas da tabela ganharam contraste e espaço; **Horários** agora tem aparência de botão secundário. O estado vazio de **Próximas folgas e ausências** usa menos altura, ícone discreto e acesso mais claro aos bloqueios.
- **Serviços:** **Editar**, **Ativar** e **Desativar** são botões secundários com foco visível, sem mudar confirmações ou permissões. A descrição tem maior contraste, pode ocupar duas linhas e segue integral no formulário de edição. Para serviços com vários profissionais, a tabela mostra o primeiro nome e uma contagem; **Ver todos** abre uma lista com cada nome completo, inclusive o estado inativo. A interação funciona por toque e pelas teclas Enter/Espaço.
- O quarto indicador foi renomeado para **Serviços com profissional**. Seu valor continua sendo a quantidade de serviços com pelo menos um profissional vinculado; ele não representa a quantidade de profissionais distintos.
- Busca, categorias, status, quatro KPIs, composição dos cards e painéis laterais continuam com a mesma estrutura. O CSS de lapidação só atua a partir de 801 px; o mobile mantém a apresentação anterior.

## Arquivos desta lapidação

- `src/gradefy/team-overview.tsx`
- `src/gradefy/team-desktop.css`
- `src/gradefy/services-desktop.tsx`
- `src/gradefy/services-desktop.css`
- `tests/e2e/gradefy-team-services-desktop.spec.js`
- Este relatório.

As alterações não commitadas da Fase 7F.4C.3 foram preservadas. Nenhum endpoint, migration, regra de agenda ou permissão foi alterado nesta lapidação.

## Capturas para revisão

Todas são capturas do aplicativo renderizado pelo Playwright, com fixture isolada e dimensão de 1672 × 941 px confirmada no arquivo. Em `test-results/`:

| Estado                      | Apresentação legada reconstituída                     | Fase 7F.4C.3.1                                     |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Equipe preenchida           | `gradefy-team-before-reconstructed-1672x941.png`*     | `gradefy-team-presentation-1672x941.png`           |
| Escala com intervalo aberto | —                                                     | `gradefy-team-weekly-details-1672x941.png`         |
| Folgas e ausências vazias   | —                                                     | `gradefy-team-empty-absences-1672x941.png`         |
| Serviços preenchidos        | `gradefy-services-before-reconstructed-1672x941.png`* | `gradefy-services-presentation-1672x941.png`       |
| Botões de ações em foco     | —                                                     | `gradefy-services-actions-1672x941.png`            |
| Nomes completos expandidos  | —                                                     | `gradefy-services-full-professionals-1672x941.png` |

\* As imagens legadas reconstituem a apresentação anterior ao redesign 7F.4C.3, ainda presente no DOM. Não são capturas arquivadas da versão imediatamente anterior a esta lapidação. A captura nova usa os mesmos dados fictícios da fixture. Escolhemos botões secundários, portanto não há menu de ações para abrir.

## Validação e limites

- Build (inclui TypeScript): aprovado.
- SQLite direcionado de equipe e gestão empresarial: 28/28 aprovados.
- E2E direcionado de Equipe/Serviços: 3/3 aprovados, incluindo abertura por teclado dos detalhes, filtros, editor e responsividade nas larguras desktop e mobile definidas.
- TypeScript explícito, Prettier dos arquivos da lapidação e `git diff --check`: aprovados.
- E2E geral: 131/131 aprovados, incluindo Igor/Barber Classic, Mini Site, agenda, clientes, convites, permissões e gestão empresarial.
- As falhas preexistentes de templates de e-mail no backend completo permanecem fora do escopo desta lapidação. PostgreSQL local continua indisponível neste ambiente.
- Fotos de profissionais só aparecem quando cadastradas; a fixture visual usa avatares com iniciais. Não houve uso de produção ou dados reais de clientes.
