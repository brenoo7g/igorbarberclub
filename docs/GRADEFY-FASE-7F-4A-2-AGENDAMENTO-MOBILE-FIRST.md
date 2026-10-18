# Gradefy — Fase 7F.4A.2: agendamento público mobile-first

## Escopo

Implementação em `gradefyapp-recuperado`, preservando o trabalho não commitado das Fases 7F.3C.2, 7F.4A e 7F.4A.1. A imagem `Agenda Neon Gradefy_ Seu Próximo Visual.png` foi inspecionada antes das alterações. Nenhum commit, push, acesso a produção, DNS, alteração de migration ou backend faz parte desta etapa.

O redesign é ativado exclusivamente para empresas com `template = gradefy-minisite`. O Barber Classic, a Igor e suas URLs conservam sua apresentação. Não existe um segundo motor de reserva.

## Interface

- Cabeçalho com as imagens oficiais da marca Gradefy e retorno ao site do estabelecimento.
- Fundo marinho, gradiente roxo/azul/ciano, bordas luminosas discretas, tipografia Sora/Inter local e três etapas.
- Nome real do estabelecimento no início e no resumo. Nenhum preço, serviço, profissional, categoria ou fotografia fictícia é usado como fallback.
- `MiniServicePicker`: busca, categorias existentes quando há mais de uma, cartões com ícone, descrição, duração, preço e radio de seleção única.
- `MiniBookingSummary`: resumo lateral no desktop; no celular, cartão compacto expansível antes do formulário. A revisão final abre os detalhes, mas permite recolhê-los novamente.
- Profissionais compatíveis, calendário, horários reais, identificação e revisão reutilizam o componente `Booking`, `AuthForm`, `Avatar`, `Spinner`, `ErrorBox` e `EmptyState` existentes.
- Sucesso com serviço, código curto, data, horário, duração, profissional, valor, pagamento no estabelecimento e acesso aos agendamentos/Mini Site.

## Celular, desktop e acessibilidade

A partir de 900 px, formulário e resumo têm duas colunas; em telas menores, seguem uma coluna. O calendário utiliza quatro colunas em celulares estreitos e sete nas demais telas. Categorias quebram linhas, sem ampliar a largura da página. Preços e nomes longos não exigem uma largura fixa para o formulário.

Campos têm fonte mínima de 16 px e controles de ação têm alvo mínimo de 44 px. Há foco visível, seleção semântica de radio/aria-pressed, texto além da cor, mensagens acessíveis, estados de carregamento e respeito a movimento reduzido. Mudanças de etapa direcionam o foco ao título correspondente.

As ações permanecem no fluxo do documento, com `env(safe-area-inset-bottom)`; não existe rodapé fixo sobre o calendário ou o teclado. O teclado virtual é simulado nos testes por redução da altura útil. Isso não substitui uma homologação em aparelhos iOS/Android reais.

## Preservação funcional

O controlador compartilhado consulta as mesmas APIs empresariais de catálogo, profissionais, grade e disponibilidade. Preço/duração esperados continuam sendo revalidados no servidor. Sessões de usuário e visitante, regras de antecedência, recorrência, intervalos, bloqueios, remarcação e cancelamento não foram alterados.

O Mini Site envia `Idempotency-Key` para as rotas de criação existentes, utilizando `newIdempotencyKey` e o armazenamento persistente já implementado no backend. Uma tentativa mantém a chave enquanto empresa, ator e payload forem os mesmos; mudar os dados cria outra chave. A chave permanece em memória na página, não contém dados pessoais e não cria autenticação alternativa. O `GET /auth/me` existente inicializa a sessão de visitante antes da reserva. O envio simultâneo continua protegido pelo guard existente.

Em conflito HTTP 409, o fluxo volta à disponibilidade real, preservando os contatos digitados. Na ausência de horários, a interface sugere outra data/profissional e mantém a razão informada pela API, substituindo apenas a referência visual a “barbeiro” por “estabelecimento” no Mini Site. Calendário e navegação aguardam a consulta da grade; erros permitem tentar novamente.

## Arquivos desta fase

- `src/pages/Booking.tsx`: integração condicional do tema, jornada completa, foco e chave de tentativa.
- `src/templates/gradefy-minisite/index.tsx`: cabeçalho específico de agendamento, reutilizando a marca oficial.
- `src/templates/gradefy-minisite/booking.tsx`: seletor de serviço e resumo apresentacionais tipados.
- `src/templates/gradefy-minisite/booking.css`: tema isolado e adaptações de largura.
- `tests/e2e/gradefy-minisite-booking.spec.js`: testes dirigidos da jornada e screenshots.
- `tests/e2e/gradefy-finance.spec.js`: sincronização do teste de login pela resposta HTTP real, verificando status 200 antes do redirecionamento. Não altera autenticação, valores esperados ou regras financeiras.
- Este relatório.

## Validação

| Verificação                                                                    | Resultado                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Backend/SQLite: `node --test --test-concurrency=2 tests/*.test.js`             | 306 aprovados                                                                                           |
| PostgreSQL portátil local 17.11: `node tests/postgres/run-local.mjs --bin ...` | 248 aprovados                                                                                           |
| Build final: `npm run build`                                                   | Aprovado, incluindo `tsc -b`, verificação tipada da agenda e Vite                                       |
| E2E do Mini Site, versão final                                                 | 8 aprovados, incluindo toque mobile, textos longos e movimento reduzido                                 |
| E2E Barber Classic, versão final                                               | 4 aprovados, incluindo Igor e URLs legadas                                                              |
| E2E financeiro completo, após sincronização do teste                           | 3 aprovados                                                                                             |
| Regressão E2E restante                                                         | 64 aprovados na primeira rodada + 41 na retomada; caso financeiro restante aprovado no arquivo completo |
| Prettier e `git diff --check`                                                  | Aprovados; avisos de LF/CRLF das mudanças anteriores não são erros de whitespace                        |

**Consolidação:** os 106 cenários da regressão foram validados entre as rodadas, mais o cenário adicional de toque mobile/textos longos, totalizando **107 cenários E2E distintos aprovados**. Não houve uma única execução integral com todos verdes: as falhas iniciais, retomadas e repetições estão descritas abaixo, sem omissão.

Evidências em `test-results/minisite-booking-backend-final.log`, `minisite-booking-postgres-final.log`, `minisite-booking-build-final.log` e `postgres-validation/report.json`. O PostgreSQL usou somente `127.0.0.1:64803`, com cluster temporário próprio, encerrado e removido após a validação. O relatório registra `productionAccess: false`. As variáveis de conexão foram esvaziadas e o carregamento do `.env` bloqueado nos comandos de validação.

A primeira rodada de backend, com a concorrência padrão de processos, teve um timeout de inicialização de uma API descartável. A repetição completa com dois processos passou, mantendo os testes explícitos de concorrência entre requisições/conexões. A primeira tentativa de PostgreSQL teve timeout no `initdb`; a segunda concluiu os 248 casos sem falhas.

A rodada E2E de regressão atingiu o limite global de 15 minutos: 64 passaram, quatro falharam e 38 não executaram. Foi retomada com `--last-failed`, que inclui os não executados, sem outras suítes em paralelo: 41 passaram e o financeiro isolado falhou por depender de recebimentos criados pelo cenário anterior do próprio arquivo. Sua validação exige executar `gradefy-finance.spec.js` inteiro.

Na última rodada combinada, os oito casos do novo agendamento e quatro do Barber Classic passaram. O login financeiro ainda teve falhas intermitentes, pois verificava a URL enquanto a interface mostrava “Entrando…”, antes de receber a resposta do login. O helper do teste passou a aguardar o POST real e verificar HTTP 200 antes de checar a URL. O arquivo financeiro completo então passou: três testes, preservando integralmente suas expectativas financeiras originais. Nenhuma regra financeira ou autenticação da aplicação foi modificada.

Comandos e logs E2E:

- `npx playwright test --reporter=list --global-timeout=900000`: `test-results/minisite-booking-e2e-full.log`.
- `npx playwright test --last-failed --timeout=90000 --reporter=list --global-timeout=1800000`: `test-results/minisite-booking-e2e-resumed.log`.
- `npx playwright test tests/e2e/barber-classic.spec.js tests/e2e/gradefy-finance.spec.js tests/e2e/gradefy-minisite-booking.spec.js --timeout=90000 --reporter=list`: `test-results/minisite-booking-e2e-final.log` (oito novos + quatro legados aprovados).
- `npx playwright test tests/e2e/gradefy-finance.spec.js --timeout=90000 --reporter=list`: `test-results/minisite-booking-finance-final.log` (três aprovados após o ajuste de sincronização).

Os testes do Mini Site cobrem seleção única, categorias reais, profissional incompatível, disponibilidade real de 40 minutos com almoço 12:20–14:00, visitante, usuário autenticado, isolamento empresarial, perda de resposta com mesma chave persistente, conflito com outra reserva real, preservação dos contatos, histórico/reload, remarcação, cancelamento, dia fechado, mensagem de agenda manual, falhas/retry, teclado, alvos de toque, sete larguras e ausência de rolagem horizontal. O estado manual sem liberação e os textos extremos são interceptações de leitura para testar a apresentação sem modificar o fixture compartilhado; as regras reais de agenda manual, recorrência, bloqueios e pausas também são verificadas pelas suítes existentes de backend/PostgreSQL e pelo E2E de agenda.

## Limitações e pendências

- Homologar em aparelhos iOS/Android reais o teclado virtual, zoom e área segura; Playwright cobre viewport reduzido e emulação com toque, não o teclado nativo do sistema operacional.
- A suíte financeira existente tem uma dependência de ordem entre cenários. Não foi reestruturada nesta fase de interface pública.
- A revisão automática bloqueou uma tentativa de remover a pasta da primeira inicialização PostgreSQL falhada (`C:\Users\Breno\AppData\Local\Temp\gradefy-pg-validation-mpRXK0`), informando apenas `blocked by policy`. Ela foi preservada. O cluster da execução bem-sucedida foi encerrado e removido pelo executor habitual.

## Visualização manual

No ambiente de desenvolvimento existente, abrir `http://localhost:5173/{slug}/agendar` para uma empresa Mini Site publicada. O `/{slug}` deve ser o slug real cadastrado. Igor continua em `/agendar` e não recebe o novo tema.

Para reproduzir os testes sem usar seu banco, executar `npm run build` e `npx playwright test tests/e2e/gradefy-minisite-booking.spec.js`. O Playwright inicia automaticamente `tests/browser-server.js` com SQLite em memória, porta 4173, e a empresa demonstrativa `minisite-browser`. O servidor é encerrado ao término; esse slug não é criado na aplicação normal.

Capturas são salvas em `test-results/minisite-booking-services-{largura}.png`, `minisite-booking-schedule-{largura}.png`, `minisite-booking-review-390.png` e `minisite-booking-success-390.png`. Não são versionadas por conterem evidências descartáveis dos testes.

Para abrir a demonstração interativa isolada, executar no diretório `gradefyapp-recuperado`, em PowerShell:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
node tests/browser-server.js
```

Abrir `http://127.0.0.1:4173/minisite-browser/agendar`. Este servidor contém dados demonstrativos em SQLite na memória, usa a API real e não inicia o transporte de e-mails. Encerrar com Ctrl+C ao terminar. Não executar junto com o Playwright, que utiliza a mesma porta. Na aplicação real, usar o slug do estabelecimento publicado em `http://localhost:5173/{slug}/agendar`.
