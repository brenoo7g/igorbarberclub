# Auditoria visual — Dashboard desktop (7F.4C.1)

Referência aprovada: `design-references/gradefy-dashboard-comparacao-codex/gradefy-dashboard-desktop-referencia.png` (1672 × 941 px). Captura entregue da implementação: `gradefy-dashboard-desktop-atual.png` (1915 × 944 px). Esta última **não está na mesma escala** e não serve sozinha como comparação. Captura local antes da correção, na viewport correta: `../test-results/gradefy-dashboard-baseline-correct-viewport-1672x941.png` (fixture E2E isolada já existente, com quatro reservas).

Branch: `feat/gradefy-foundation`. O diretório de trabalho já contém alterações não commitadas de fases anteriores; elas serão preservadas. `src/gradefy/dashboard.tsx` monta `DesktopDashboard` em larguras ≥ 801 px; este importa `dashboard-desktop.css`, que está presente no bundle de `dist/assets`. O teste E2E em 1672 × 941 confirmou a rota e os estilos. O problema não é CSS ausente: a captura fornecida usa outra largura, a fixture anterior é escassa e os estilos desktop mantêm fonte de 9–12 px e linhas com altura rígida.

| Elemento     | Referência                                                           | Antes, na mesma viewport                                                          | Ajuste necessário                                                             |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Grade geral  | Sidebar ~244 px; KPIs y95–204; grade y220–916                        | Posições próximas, mas agenda e cards inferiores ficam visualmente vazios         | Manter grade e adaptar altura/densidade aos dados                             |
| Sidebar      | Marca, menu com ícones grandes, card de plano e empresa legíveis     | Estrutura correta; texto, card do plano e identificação pequenos                  | Aumentar tipografia, contrastes e espaçamento dos elementos reais             |
| Cabeçalho    | Saudação ~30 px; subtítulo 14 px; busca, sino e empresa equilibrados | Busca funcional; empresa e subtítulo muito pequenos; botão atualizar ocupa espaço | Reequilibrar controles sem retirar função                                     |
| KPIs         | Ícones 56 px, título 14 px, valor ~29 px, contexto e tendência       | Ícones próximos; texto pequeno; dois indicadores honestamente indisponíveis       | Aumentar legibilidade; não inventar métricas nem percentuais                  |
| Agenda       | Sete linhas compactas, timeline e status; ocupa coluna esquerda      | Quatro linhas e metade inferior vazia; filtros quebram hierarquia                 | Fixture visual densa; estado real curto precisa altura adaptativa e ação útil |
| Calendário   | Cabeçalho e dias com folga vertical; data luminosa                   | Compacto demais, datas pequenas                                                   | Escala e espaçamento próximos à referência                                    |
| Receita      | Valor forte, grid discreto, linha/gradiente, tooltip                 | Valor forte; gráfico vazio vira retângulo plano sem escala; eixo raso             | Exibir série real com grid, rótulos, tooltip; estado sem receita informativo  |
| Próximos     | Três linhas compactas                                                | API mostra uma linha em card grande                                               | Compor lista até três quando houver dados autorizados; vazio equilibrado      |
| Equipe       | Quatro cards de pessoas                                              | Um card pequeno no canto                                                          | Distribuir poucos membros melhor, sem duplicá-los                             |
| Serviços     | Ranking com barras e números                                         | Uma linha pequena                                                                 | Barras e tipografia legíveis; vazio dedicado                                  |
| Notificações | Ícone, texto contextual e tempo                                      | Frases repetitivas de estado de e-mail ou vazio sem estrutura                     | Contextualizar eventos existentes, sem dados privados/fictícios               |
| Acabamento   | Superfícies navy, brilho azul/roxo e bordas sutis                    | Paleta próxima; tipografia e cards visualmente achatados                          | Refinar contraste, gradientes e hierarquia                                    |

Dados e fotos do protótipo são ilustrativos. A fixture de apresentação deve existir apenas no teste visual; o produto continuará exibindo números e pessoas reais.

## Comparação após a correção

Capturas da revisão, todas em 1672 × 941 CSS px e escala 1:

1. [Protótipo original](design-references/gradefy-dashboard-comparacao-codex/gradefy-dashboard-desktop-referencia.png)
2. [Implementação antes da correção](../test-results/gradefy-dashboard-baseline-correct-viewport-1672x941.png)
3. [Implementação corrigida com fixture de apresentação](../test-results/gradefy-dashboard-presentation-1672x941.png)
4. [Implementação corrigida com dados reais de teste](../test-results/gradefy-dashboard-final-real-1672x941.png)

Outras capturas: `../test-results/gradefy-dashboard-presentation-1366x768.png`, `../test-results/gradefy-dashboard-presentation-1920x1080.png`, `../test-results/gradefy-dashboard-one-appointment-1672x941.png` e `../test-results/gradefy-dashboard-empty-1672x941.png`. `test-results/` é ignorado pelo Git; os artefatos ficam apenas na máquina local. A fixture `tests/e2e/fixtures/dashboard-presentation.js` só altera respostas interceptadas pelo Playwright para uma empresa de teste em memória. Nenhum dado é gravado no banco de desenvolvimento, e o código da aplicação não a importa.

| Elemento                   | Revisão visual                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar, marca e navegação | Mesma largura de 244 px, ordem e estado ativo próximos ao original; ícones e textos ampliados. Card de plano e empresa mostram o estado real.                                                                                              |
| Cabeçalho e KPIs           | Busca, notificações e empresa mantidos; valores e rótulos ampliados. Clientes ativos e ocupação permanecem indisponíveis enquanto não houver métrica confiável.                                                                            |
| Agenda                     | Com sete reservas da fixture, a timeline ocupa a coluna como no protótipo, sem transbordar. Filtros continuam acessíveis em painel recolhível. Com uma ou nenhuma reserva, a grade reduz a altura, mostra dados reais e oferece navegação. |
| Calendário                 | Cabeçalho, seleção e navegação preservados; escala dos dias ajustada, com redução só no cenário vazio para manter a grade compacta.                                                                                                        |
| Receita                    | Valor e gráfico usam exclusivamente os recebimentos do relatório. Grade, gradiente, marcação de eixo e tooltip foram adicionados. Sem receita, o estado vazio é explícito.                                                                 |
| Próximos agendamentos      | Até três reservas confirmadas do dia e o próximo registro da API, com deduplicação e ordem por data/hora; o estado sem horários é compacto.                                                                                                |
| Equipe e serviços          | Cards ou ranking proporcionais aos registros reais; um profissional ocupa mais área, e a ausência de dados ganha um estado vazio centrado.                                                                                                 |
| Notificações               | Tipo do evento, estado de entrega e momento real de criação sem nomes de clientes nem endereços. A central detalhada já existente permanece acessível.                                                                                     |
| Cores e proporções         | Grade, posição dos cards, superfícies navy e acentos roxo/ciano próximos à referência na viewport idêntica.                                                                                                                                |

**Diferenças necessárias:** o protótipo usa fotos, crescimento percentual, taxa de ocupação, clientes ativos e pagamentos online como ilustração. A implementação não inventa fotos, percentuais, receitas ou transações. Os nomes, valores e datas da fixture servem apenas à comparação automatizada. O Dashboard real exibe os dados de cada empresa, incluindo estados escassos e sem recebimentos.

## Validação e limites

- Build e TypeScript: passaram. E2E do dashboard (fixture densa, dados reais de teste, uma reserva, zero reserva e mobile): 6/6 passaram.
- A primeira suíte E2E geral registrou 119/123. As quatro falhas vinham de seletores antigos do menu desktop; duas expectativas financeiras seguintes dependiam do teste interrompido. Após atualizar os seletores, as suítes de finanças e equipe passaram 6/6. A suíte completa não foi repetida após essa correção exclusiva dos testes.
- Backend: 334/338 passaram. Três casos de templates de e-mail, mais o agregador Barber Classic, falham em `server/email-templates.js` com “Destino de e-mail inválido”; esses arquivos já estavam pendentes antes desta revisão visual e não foram alterados aqui.
- `format:check` global acusa 217 arquivos do estado atual do repositório; o Prettier aplicado apenas aos arquivos desta revisão passou. `git diff --check` passou.
- Não foram acessados banco de produção, DNS, Cloudflare nem Supabase. Nenhuma fixture visual é importada pelo frontend ou gravada em banco real.
