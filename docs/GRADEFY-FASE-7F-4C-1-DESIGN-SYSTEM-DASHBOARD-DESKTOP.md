# Gradefy 7F.4C.1 — Design System empresarial e Dashboard desktop

> Revisão visual posterior: [auditoria do Dashboard desktop](GRADEFY-DASHBOARD-DESKTOP-VISUAL-AUDIT.md). Ela substitui as descrições abaixo da composição inicial, dos quatro indicadores e da ausência de busca/sino. A versão revisada segue a grade agenda/calendário/receita, próximos/pagamentos e equipe/serviços/notificações do protótipo oficial.

## Escopo e referência

Referência visual inspecionada: `docs/design-references/desktop/Imagem do ChatGPT 20 de out. de 2026, 20_18_10-1.png`. As oito imagens na pasta permanecem como referências locais pendentes de revisão visual e não são exibidas em produção. O novo layout usa a composição aprovada: marca e navegação à esquerda, saudação e empresa no topo, quatro indicadores, agenda/calendário/financeiro na primeira grade e painéis de equipe, serviços e ações abaixo.

O redesign foi ativado a partir de **801 px**. Até 800 px, o componente mobile anterior continua sendo usado. O limite é reavaliado ao mudar o tamanho da janela, sem montar duas instâncias do painel simultaneamente.

## Arquivos desta fase

- `src/gradefy/business-design.css`: tokens empresariais de cores, superfícies, bordas, sombras, raios, sidebar e estados de foco/hover, sob `.gf-enterprise-layout`. O escopo foi escolhido para evitar conflito com a classe preexistente `.gf-business-page` da configuração empresarial.
- `src/gradefy/business-nav.tsx`: reutiliza a navegação por React Router em todas as páginas de gestão; ordenação desktop, logomarca oficial, conta e identificação da empresa/plano quando conhecidos. Links mantêm `?empresa=`.
- `src/gradefy/Shell.tsx`: ativa o escopo visual nas rotas empresariais, preservando a navegação profissional e as telas públicas.
- `src/gradefy/dashboard-desktop.tsx` e `dashboard-desktop.css`: layout e componentes desktop. Cards usam o `Card` compartilhado; `Metric`, `CalendarCard`, `AppointmentRow` e `RevenueChart` são componentes tipados de apresentação. Nenhum novo endpoint nem migration foi criado.
- `src/gradefy/dashboard.tsx`: seleciona o layout desktop sem desmontar ou redesenhar o mobile anterior. Mantém a central de notificações por e-mail criada na 7F.4A.5.
- `tests/e2e/gradefy-dashboard.spec.js`, `gradefy-agenda.spec.js`, `gradefy-business-management.spec.js`, `gradefy-finance.spec.js`, `gradefy-plans.spec.js`, `gradefy-reports.spec.js`, `gradefy-team.spec.js` e `gradefy.spec.js`: verificações de visual, navegação real, responsividade e seletores ajustados à nova composição.

## Dados reais e comportamento

| Elemento                     | Fonte                                               | Critério                                                                                                             |
| ---------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Agendamentos hoje            | `GET /api/dashboard`                                | Confirmados e concluídos, na data/fuso da empresa.                                                                   |
| Valor previsto e concluídos  | `GET /api/dashboard`                                | Período mensal. Valor previsto não é recebimento.                                                                    |
| Próximo atendimento e agenda | `GET /api/dashboard`                                | Reserva real com serviço, profissional, horário e status; clique abre `?atendimento=`.                               |
| Calendário                   | Data local recebida do Dashboard                    | Cálculo civil em UTC apenas para construir a grade, sem deslocar a data empresarial. Seleção consulta a agenda real. |
| Recebimentos e série         | `GET /api/admin/reports?area=overview&period=month` | Lançamentos manuais líquidos de reversões. Gráfico só aparece se houver valores registrados.                         |
| Serviços mais realizados     | Mesmo relatório                                     | Apenas reservas concluídas no mês, ordenadas pela quantidade real.                                                   |
| Profissionais ativos         | `GET /api/dashboard`                                | Exibe nomes reais; não afirma disponibilidade operacional.                                                           |
| Plano, trial, Mini Site      | `GET /api/dashboard`                                | Estados recebidos do backend; sem plano ou publicação fictícios.                                                     |
| Notificações por e-mail      | Central existente da 7F.4A.5                        | Estado real do envio, preservado nesta fase.                                                                         |

Busca global e sino decorativos da imagem não foram introduzidos: não havia contrato de busca global nem um indicador consolidado adequado. O painel conserva acesso real a agenda, clientes, equipe, profissionais, serviços, financeiro, relatórios, configurações, Mini Site e conta. A troca de empresa passa pelo `ManagementAccess`; as APIs continuam exigindo membership e cabeçalho de empresa no backend.

## Responsividade e acessibilidade

Em 1440/1920 px, agenda, calendário e financeiro ficam na mesma linha. Em larguras intermediárias, os painéis se reorganizam; a 1024 px a agenda ocupa uma linha e calendário/financeiro compartilham a seguinte. As listas e gráficos têm largura flexível. Mobile mantém os formulários, cards e navegação anteriores.

Links e botões são focáveis, a data selecionada usa `aria-pressed`, os campos têm rótulos, os status trazem texto além da cor, o gráfico tem nome acessível, e a folha respeita `prefers-reduced-motion`. Estados vazios, carregamento e erros de API são explícitos.
Quando a seleção de empresa ainda não montou a sidebar, o cabeçalho Gradefy original permanece visível; a regra desktop de ocultação só atua na presença da sidebar.

## Capturas e comparação

Capturas geradas pelo Playwright com **fixtures isoladas de demonstração**, não dados de produção, em `test-results/gradefy-dashboard-desktop-phase-{1024,1280,1366,1440,1920,320,390}.png`. A pasta `test-results` é ignorada pelo Git. Também foi validada a largura 768 px. A comparação manual com a referência confirmou a hierarquia, o fundo navy, cards profundos, ícones em gradiente, sidebar destacada, agenda em linha temporal e calendário. O protótipo inclui dados e recursos fictícios (crescimento, ocupação, pagamentos online e estados de equipe); o layout implementado os substitui por fontes verdadeiras e rótulos precisos.

## Validação

- `npm test` com banco SQLite isolado: **338/338**.
- PostgreSQL **17.11** em cluster local temporário, criado e removido pelo runner: **266/266**. Nenhum Supabase foi acessado.
- Rodada E2E relevante em Chromium: **39/40**; o único erro era uma expectativa de título antigo na suíte de convite. A expectativa foi atualizada e o caso passou **1/1** isoladamente. O Dashboard passou novamente **3/3** após os ajustes finais. Testes de Igor/Barber Classic, agenda, financeiro, relatórios, equipe, Mini Site e autenticação estão incluídos na rodada.
- `npm run build` (TypeScript, agenda tipada, Vite): aprovado. Prettier e `git diff --check`: aprovação registrada na revisão final.

## Pendências

Os layouts desktop de Agenda, Clientes, Equipe, Serviços, Pagamentos, Relatórios e Configurações continuam para as fases 7F.4C.2–7F.4C.4. O layout mobile aprovado também fica para sua fase posterior. A infraestrutura atual não fornece busca global, taxa de ocupação nem contador confiável de clientes ativos ao Dashboard. Os testes automatizados usam dados fictícios apenas no servidor de testes.

As alterações sem commit da Fase 7F.4A.5 e a migration 022 foram preservadas. Nenhum banco de produção, DNS, autenticação ou regra de agendamento foi alterado.
