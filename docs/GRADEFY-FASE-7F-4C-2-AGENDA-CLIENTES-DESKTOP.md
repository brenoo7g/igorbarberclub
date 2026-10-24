# Gradefy 7F.4C.2 — Agenda e Clientes desktop

## Escopo e referências

Implementação restrita ao painel empresarial em telas a partir de 801 px. As três referências foram conferidas em `docs/design-references/gradefy-7F4C2-referencias-desktop/docs/design-references/`: `desktop-agenda.png`, `desktop-clientes.png` e `desktop-dashboard-aprovado.png`. O Dashboard 7F.4C.1, o Mini Site, o Igor e o Barber Classic não receberam mudanças visuais nesta fase. Nenhuma migration foi criada.

## Arquivos desta fase

- `server/agenda.js`, `server/clients.js`: consultas de leitura autorizadas e isoladas por empresa.
- `src/gradefy/agenda.tsx`, `agenda-types.ts`, `agenda-desktop.css`: calendário, linha do tempo, bloqueios, intervalos, filtros e resumo.
- `src/gradefy/business-management.tsx`, `business-types.ts`, `clients-desktop.css`: indicadores, tabela desktop, painel de ações e detalhes do cliente.
- `src/gradefy/management-topbar.tsx`, `management-desktop.css`: cabeçalho reutilizado por Agenda e Clientes, alinhado ao design empresarial do Dashboard.
- `tests/helpers/agenda.js`, `tests/helpers/business-management.js`, `tests/e2e/gradefy-agenda-clients-visual.spec.js`: contratos, isolamento, regressão e capturas.

As alterações não commitadas de outras fases foram preservadas.

## Antes e depois da comparação visual

| Referência         | Antes                                                                | Depois                                                                                                                                                                            | Diferença justificada                                                                                                         |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Agenda             | O formulário de bloqueio precedia uma lista de dias em coluna única. | Navegação temporal, faixa semanal, filtros e linha do tempo à esquerda; resumo, confirmados e equipe à direita. Formulário real de bloqueio permanece acessível abaixo da agenda. | Não há modo Mês no contrato atual; apenas Dia e Semana são exibidos. Não há estados “Pendente” ou “Em atendimento” no modelo. |
| Clientes           | Busca seguida de cards simples em duas colunas.                      | Quatro indicadores reais, tabela com contato e cadastro, busca, paginação e ações laterais.                                                                                       | Sem aniversário, VIP, tags, gasto acumulado ou campanhas: esses dados/funções ainda não existem.                              |
| Dashboard aprovado | Sidebar e paleta premium restritas ao Dashboard.                     | Mesma `BusinessNav`, paleta, bordas, gradientes, escala de tipografia e ações reais em Agenda e Clientes.                                                                         | O cabeçalho dessas páginas usa ligação às notificações existentes no Dashboard, sem criar um contador fictício.               |

No desktop, a Agenda distingue reservas, bloqueios manuais e intervalos recorrentes. O horário de término deriva da duração real. A seção da equipe mostra **profissionais ativos no cadastro**, sem afirmar disponibilidade de slots. Em Clientes, o total cadastrado, novos no mês, clientes com reserva confirmada de hoje em diante e visitas concluídas vêm de consultas por `company_id`. Valores previstos de reservas não são tratados como pagamentos.

## Contratos e segurança

`GET /api/admin/agenda` mantém paginação e ganhou `serviceId` e `q` opcionais. Ambos são aplicados no SQL parametrizado antes de `COUNT`, agregação e `LIMIT`; `serviceId` precisa pertencer à empresa. A resposta inclui `statusCounts`, bloqueios do período, intervalos recorrentes ativos e serviços para o filtro. A busca cobre nome do cliente, profissional e serviço; `%` e `_` digitados pelo usuário são tratados literalmente. O fuso da empresa e as datas locais continuam sob o contrato anterior.

`GET /api/admin/clients` retorna `created_at` dos registros da própria empresa e `stats` com contagens agregadas. Observações internas continuam exclusivas da rota autorizada de detalhes; o Mini Site não recebe esses dados. O modal de detalhes preserva histórico, próxima reserva, edição com versão e links para a Agenda. A abertura opcional de WhatsApp é uma ação explícita, sem disparo automático.

## Capturas em 1672 × 941

Arquivos locais em `test-results/`, gerados pelo teste visual e ignorados pelo Git:

| Estado                                        | Agenda                                           | Clientes                                          |
| --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Fixture visual isolada, sem gravação no banco | `gradefy-agenda-controlled-fixture-1672x941.png` | `gradefy-clients-controlled-fixture-1672x941.png` |
| Dados do banco descartável de teste           | `gradefy-agenda-real-1672x941.png`               | `gradefy-clients-real-1672x941.png`               |
| Vazio                                         | `gradefy-agenda-empty-1672x941.png`              | `gradefy-clients-empty-1672x941.png`              |

As fixtures controladas têm nomes, serviços e números fictícios **somente no teste E2E**. O código de produção não os contém. O teste também verifica ausência de rolagem horizontal em 1024 × 768, 1280 × 720, 1366 × 768, 1440 × 900, 1672 × 941, 1920 × 1080 e viewport efetiva de 1338 × 753, equivalente à largura disponível em 1672 px com zoom de 125%. A captura controlada da Agenda verifica ainda a densidade das linhas. O detalhe do cliente foi capturado em `gradefy-clients-detail-1672x941.png`.

## Validação e pendências

Os 21 testes SQLite direcionados de Agenda/Clientes passaram. O build, incluindo TypeScript e verificação de `server/schedule.js`, passou. A primeira rodada E2E completa teve 126 aprovações e uma falha por colisão do rótulo visual “Serviço” com o formulário manual; após alterar o rótulo do filtro para “Filtrar por serviço”, os 13 E2E direcionados passaram. Os quatro testes de captura passaram novamente após o último ajuste de densidade.

Na suíte backend completa, 334 verificações passaram e quatro falhas foram reportadas (uma delas é o grupo pai): três testes de Barber Classic/guest/notificações falham em `Destino de e-mail inválido.` dentro de `server/email-templates.js`, arquivo pendente da Fase 7F.4A.5 e não alterado nesta fase. A formatação global acusa arquivos anteriores fora do escopo; os arquivos desta fase são verificados isoladamente. PostgreSQL local não estava disponível: nem Docker, Podman, `psql` ou `pg_ctl` estavam instalados e não havia URL de banco de teste. Nenhuma instância de produção/Supabase foi acessada. A auditoria de dependências da fase anterior permanece separada.

Evoluções fora do escopo: visão mensal segura, métricas de ocupação por slot, CRM de etiquetas/aniversários/campanhas e dados financeiros por cliente com definição aprovada.
