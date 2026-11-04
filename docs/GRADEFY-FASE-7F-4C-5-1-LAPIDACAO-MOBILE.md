# Gradefy — Fase 7F.4C.5.1: lapidação mobile

## Escopo e diagnóstico

Branch `feat/gradefy-foundation`. As alterações locais da fase 7F.4C.5 foram preservadas. Esta lapidação atua apenas na apresentação mobile do Dashboard e da Agenda e em testes visuais. Nenhuma regra de negócio, rota, permissão, migration ou identidade dos templates públicos foi alterada.

Na captura anterior de 390 × 844 px, o Dashboard repetia o estabelecimento no card e no seletor; a segunda linha de KPIs ficava atrás da primeira viewport. A Agenda gastava espaço com descrição longa, rótulo do seletor e margens dos controles; o primeiro atendimento aparecia só parcialmente. O contorno ciano de “Clientes” era o foco legítimo de teclado no teste, não um segundo item ativo.

## Ajustes

- O cabeçalho do Dashboard tem espaçamento menor, mantendo logo, saudação, data, notificação e conta. O resumo da assinatura usa os dados reais já carregados e uma forma curta no mobile; o texto completo continua disponível no desktop. Card do estabelecimento e seletor real ficam no mesmo bloco quando há várias empresas, sem ocultar a troca. O card de próximo atendimento preserva seus dados e ação com menor altura. Os quatro KPIs e os blocos inferiores continuam presentes.
- O cabeçalho da Agenda aproxima título, ação principal e identificação compacta. O bloqueio permanece uma ação secundária visível. O seletor empresarial usa o componente existente. Espaçamentos do calendário, filtros e aviso de consulta foram reduzidos sem modificar datas, horários, fusos, opções, filtros ou tamanho mínimo de toque dos controles.
- O aviso de assinatura sem escrita continua explícito; “Novo agendamento” e “Bloquear agenda” permanecem desabilitados nesse estado. O backend conserva suas autorizações. A navbar não foi alterada: há captura neutra e captura separada com foco de teclado.
- Em 320 px, foi corrigida uma pequena sobreposição entre a navegação de data e o seletor Dia/Semana por meio do padding desses botões, apenas abaixo de 351 px. O teste compara as caixas reais dos dois controles.
- Em 312 px, largura lógica aproximada de uma viewport de 390 px com zoom de 125%, o `min-width: 320px` global causava rolagem horizontal. A exceção agora se aplica somente ao painel Gradefy abaixo de 320 px, preservando os sites públicos. O valor monetário do KPI também recebeu uma escala de fonte apropriada abaixo de 331 px para não quebrar dentro do número.

## Capturas reais e comparação

| Tela                | Protótipo original                                 | Antes                                                 | Depois                                              |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Dashboard 390 × 844 | `docs/design-references/mobile/image-gen-1(1).png` | `test-results/mobile-r1-dashboard-before-390x844.png` | `test-results/mobile-dashboard-fixture-390x844.png` |
| Agenda 390 × 844    | `docs/design-references/mobile/image-gen-2(1).png` | `test-results/mobile-r1-agenda-before-390x844.png`    | `test-results/mobile-agenda-fixture-390x844.png`    |

As capturas depois mostram a primeira linha de KPIs inteira e parte da segunda na primeira viewport. Na Agenda, o primeiro atendimento inteiro, com horário, cliente, serviço, profissional e status, aparece antes da navbar; o começo de atendimentos simultâneos também aparece. A interface mantém o calendário semanal de sete dias e os dados da fixture isolada. Os protótipos são referência visual; números e nomes da aplicação vêm das respostas reais ou de fixtures de navegador.

Outras capturas: `test-results/mobile-r1-dashboard-company-selector-390x844.png` (seletor nativo focado; o menu do sistema operacional não é representado de forma confiável na captura do Chromium), `mobile-r1-dashboard-agenda-390x844.png`, `mobile-dashboard-empty-390x844.png`, `mobile-agenda-timeline-390x844.png`, `mobile-agenda-empty-390x844.png`, `mobile-r1-agenda-readonly-390x844.png`, `mobile-agenda-filters-390x844.png`, `mobile-agenda-detail-390x844.png`, `mobile-agenda-block-390x844.png`, `mobile-agenda-block-preview-390x844.png`, `mobile-r1-navbar-keyboard-focus-390x844.png`, `mobile-r1-agenda-search-focus-390x844.png` e `mobile-r1-agenda-bottom-390x844.png`. Capturas principais também foram geradas em 312 × 675, 320 × 720, 360 × 800 e 428 × 926; o Dashboard inclui 375 × 812. O Dashboard desktop está em `test-results/gradefy-dashboard-review-1672x941.png`; a Agenda desktop, em `test-results/mobile-phase-agenda-desktop-1672x941.png`.

## Responsividade e preservação

O teste dirigido verifica ausência de overflow horizontal em 312, 320, 360, 375, 390, 428 e 768 px e em 740 × 390. A largura de 312 px é uma aproximação do espaço lógico em zoom de 125%; o atalho de zoom do Chromium headless não alterou o viewport, então o zoom real ainda merece verificação manual. O último card e o rodapé da Agenda ficam acessíveis acima da navbar após rolar até o fim. A área inferior segura, o foco de teclado e o item ativo foram mantidos pelo componente de navegação da fase anterior. O teste confirma que a navbar se recolhe quando a busca recebe foco para permitir o teclado virtual e reaparece ao sair do campo. Filtros, detalhes, criação, bloqueio e prévia continuam acessíveis por diálogo e não foram reimplementados nesta fase. A composição desktop conserva a sidebar, controles e painéis existentes.

## Arquivos desta lapidação

- `src/gradefy/dashboard.tsx`, `dashboard-mobile.css` e `mobile-business-header.css`.
- `src/gradefy/agenda.tsx` e `agenda-mobile.css`.
- `tests/e2e/gradefy-mobile-dashboard-agenda.spec.js`, `gradefy-agenda-clients-visual.spec.js` e `gradefy-agenda.spec.js`.
- Este relatório.

As correções nos testes de Agenda usam respostas isoladas do navegador para representar um dia realmente vazio, pois a fixture de servidor pode conter intervalos recorrentes mesmo sem reservas. Nenhum dado persistido é alterado.

## Verificação

- `npm run build`: aprovado; inclui `tsc -b`, verificação tipada da agenda e bundle Vite.
- SQLite dirigido (`agenda`, `dashboard`, `finance`, `reports`): 39/39.
- PostgreSQL 17.11 local portátil em cluster descartável: 267/267; `test-results/postgres-validation/report.json` registra acesso à produção falso, cluster parado e removido.
- App mobile preservado: 5/5 testes e typecheck aprovados.
- Playwright dirigido Dashboard/Agenda mobile: 2/2 após os ajustes de 320 e 312 px. A suíte E2E completa foi reexecutada com o código final: 139/139, sem falhas.
- Prettier dos arquivos desta fase e `git diff --check`: aprovados.

Não houve envio de e-mails, acesso à produção, commit ou push. As falhas conhecidas de templates de e-mail permanecem fora do escopo. O menu aberto de um `<select>` nativo e o comportamento de barras seguras em dispositivos iOS físicos não são reproduzidos fielmente por screenshots do Chromium; a seleção real e o `env(safe-area-inset-*)` existentes foram preservados.
