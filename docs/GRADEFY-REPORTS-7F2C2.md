# Gradefy — Relatórios empresariais (7F.2C.2)

## Interface e navegação

Rota: `/app/relatorios`, integrada à navegação empresarial lateral/mobile e aos atalhos do dashboard. As cinco áreas são Visão geral, Financeiro, Atendimentos, Serviços e Profissionais. Componentes, tokens, fontes e formulários usam o design system Gradefy existente.

Os filtros ficam na URL, junto à empresa selecionada, e são retomados após recarregamento. Trocar a área preserva o período personalizado e remove os filtros incompatíveis. Trocar de empresa limpa os filtros anteriores. Durante a troca de filtros, resultados anteriores não são exibidos como se pertencessem à nova seleção; a exportação aguarda o resultado atual.

Há estados de carregamento, dados vazios, falha de conexão com nova tentativa, erro de validação, exportação e sessão expirada. Cards substituem tabelas comprimidas no celular.

## Períodos e indicadores

Períodos: hoje, últimos 7 dias, últimos 30 dias, mês atual, mês anterior e personalizado. Últimos 7/30 dias incluem hoje. Meses incluem todos os seus dias, inclusive datas futuras para previsão. Limite: 367 dias inclusivos, entre 1900 e 2199.

O backend utiliza `currentTime` e o fuso cadastrado da empresa, sem depender do relógio do navegador. Dias sem registros aparecem como zero nas séries. O período e o fuso são apresentados na tela.

| Indicador                    | Fonte e data                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Valor previsto               | Preço histórico dos agendamentos confirmados/concluídos, pela data do atendimento; mesma função do dashboard |
| Serviços concluídos          | Preço histórico dos atendimentos concluídos, pela data do atendimento; não representa dinheiro recebido      |
| Recebimentos registrados     | Recebimentos manuais pela data local efetiva, menos estornos na data local da reversão                       |
| Despesas pagas               | Pagamentos registrados pela data local efetiva, menos anulações de despesas pagas na data da correção        |
| Saldo operacional registrado | Recebimentos líquidos menos despesas pagas líquidas; não representa lucro líquido                            |

O módulo Financeiro e os relatórios compartilham `server/financial-ledger.js`. A extração não muda a política da migration 014: um estorno de recebimento anterior afeta o período da correção, preservando o anterior. O período atual pode ter recebimentos ou despesas líquidos negativos. Despesas pendentes não entram nos totais financeiros. Cancelar um atendimento não devolve pagamentos automaticamente.

## Atendimentos, serviços e profissionais

Atendimentos mostram total, confirmados, concluídos, cancelados, não comparecimento e futuros confirmados. Futuro significa início posterior ao relógio da empresa e dentro do período selecionado. A evolução diária preserva os status reais. Nenhuma taxa de satisfação ou comparecimento presumida foi criada.

Serviços usam `appointment_services.name` e `price`, agrupados pelo ID e pelo nome histórico. Alterar preço/nome ou desativar o cadastro não reescreve esses valores. Nomes históricos diferentes do mesmo serviço aparecem separadamente. Quantidade conta os atendimentos concluídos que incluíram aquele serviço. O denominador da participação é a soma dos valores dos serviços concluídos filtrados, considerando todas as páginas; valor zero produz “Não aplicável”.

Profissionais mostram concluídos, cancelados, não comparecimento e valor histórico dos atendimentos concluídos. Inativos são preservados. O schema atual não tem snapshot do nome do profissional: a identificação exibida é seu cadastro atual. Filtrar um serviço seleciona atendimentos que contêm esse serviço; no relatório profissional o valor continua sendo o total histórico do atendimento. Isso é explicitado na tela e não representa comissão nem pagamento ao profissional.

## Filtros e APIs

| Área          | Filtros adicionais                                                                |
| ------------- | --------------------------------------------------------------------------------- |
| Visão geral   | Nenhum, para manter os critérios gerais consistentes                              |
| Financeiro    | Tipo: todos, recebimentos ou despesas; forma de pagamento somente em recebimentos |
| Atendimentos  | Profissional, serviço e status                                                    |
| Serviços      | Profissional, serviço e ordenação por quantidade/valor                            |
| Profissionais | Profissional, serviço e ordenação por quantidade/valor                            |

No Financeiro, tipo e forma filtram os valores financeiros; previsão e serviços concluídos continuam gerais, conforme explicado na tela. Pagamentos parciais não são atribuídos artificialmente a serviços ou profissionais.

Endpoints novos, com prefixo `/api`:

- `GET /admin/reports`: resumo, séries diárias e agregações da área selecionada.
- `GET /admin/reports/export`: CSV completo das agregações selecionadas.

Parâmetros: `area` (`overview`, `finance`, `appointments`, `services`, `professionals`), `period` (`today`, `last7`, `last30`, `month`, `previous-month`, `custom`), `from`, `to`, `professionalId`, `serviceId`, `status`, `type`, `method`, `sort` (`quantity`, `value`) e `page`.

Ambos os endpoints validam os mesmos filtros. Combinações incompatíveis, datas inválidas, intervalos excessivos e IDs de outra empresa são rejeitados no servidor. Rankings têm 30 itens por página. Seletores mostram até 1.000 itens de catálogo, incluindo inativos; acima disso há aviso, mas os totais incluem todos os registros.

## Gráficos e exportação

Gráficos SVG de evolução de recebimentos/despesas e agendamentos/concluídos, com eixos, legendas e séries distintas por traçado além da cor. “Ver dados” oferece todos os números por dia em formato textual. Barras de serviços exibem até oito nomes históricos mais realizados. Não foi adicionada biblioteca gráfica.

A exportação utiliza SQL agregado, e não a página carregada no navegador. O frontend fixa as datas efetivamente exibidas ao exportar, evitando mudança de período caso a solicitação atravesse a meia-noite. A consulta é uma nova leitura consistente do banco, portanto alterações legítimas ocorridas desde a tela podem aparecer no CSV.

Formato CSV:

- UTF-8 com BOM; separador `;`; linhas CRLF; células entre aspas, com aspas internas duplicadas.
- Cabeçalhos e identificação em português, empresa, período, fuso, filtros e critério temporal.
- Valores monetários em reais, com vírgula decimal e duas casas, derivados diretamente de centavos inteiros. Participação usa vírgula decimal; quando não aplicável, fica vazia.
- Recebimentos/despesas e atendimentos exportam resumos e séries diárias completas. Serviços/profissionais exportam todas as linhas agrupadas, independentemente da página atual. Visão geral inclui indicadores, séries e todos os serviços agrupados.
- Até 10.000 linhas agrupadas; acima disso HTTP 413 solicita reduzir o período ou filtrar. Séries têm no máximo 367 dias. Dados são agregados no banco e as consultas de exportação são limitadas a 10.001 linhas para detectar excesso.
- Textos iniciados por `=`, `+`, `-` ou `@`, inclusive após espaços/tabulações/quebras, recebem apóstrofo. Controles não imprimíveis perigosos são removidos. Valores numéricos confiáveis, inclusive monetários negativos, permanecem numéricos.
- Sem nomes, contatos ou observações de clientes; sem notas privadas de recebimentos.

## Segurança, persistência e preservação

Sessão, empresa explicitamente selecionada, membership e papel owner/manager são exigidos em consulta e exportação. A autorização e os entitlements reutilizam `agendaAccess`. Assinaturas expiradas permitem consulta/exportação histórica, seguindo a política de leitura existente; não iniciam nem renovam trials.

As queries filtram `company_id` e validam relações empresariais; não existe fallback para Igor nem API pública de relatórios. Leituras usam transação consistente (`REPEATABLE READ READ ONLY` no PostgreSQL). Gerar relatórios não cria registros nem muda atendimentos, pagamentos, despesas ou assinaturas.

**Não houve nova migration.** As tabelas e índices existentes são suficientes para consultas agregadas. Migrations 001–014 e a landing foram preservadas. Nenhuma dependência, pagamento bancário, configuração Cloudflare ou autenticação nova foi adicionada.

## Arquivos desta fase

Criados:

- `server/financial-ledger.js`
- `server/reports.js`
- `src/gradefy/reports.tsx`
- `src/gradefy/reports-types.ts`
- `src/gradefy/reports-charts.tsx`
- `src/gradefy/reports.css`
- `tests/reports.test.js`
- `tests/helpers/reports.js`
- `tests/e2e/gradefy-reports.spec.js`
- `docs/GRADEFY-REPORTS-7F2C2.md`

Modificados:

- `server/app.js`: registro dos endpoints protegidos.
- `server/finance.js`: reutilização do cálculo financeiro compartilhado, preservando o retorno.
- `src/main.tsx`: rota lazy de Relatórios.
- `src/gradefy/Shell.tsx`: escopo da interface de gestão.
- `src/gradefy/business-nav.tsx`: navegação para Relatórios.
- `src/gradefy/business-management.css`: acomodação do oitavo item mobile.
- `src/gradefy/dashboard.tsx`: acesso no dashboard.
- `tests/postgres/foundation.test.js`: suíte PostgreSQL dos relatórios.

As alterações anteriores da 7F.2C.1 continuam sem commit; `marketing/` e seu documento preexistente não fazem parte desta fase.

## Validação e demonstração local

As validações ignoraram dotenv e limparam DATABASE_URL/POSTGRES_URL, usando SQLite descartável e PostgreSQL portátil local 17.11 com cluster temporário. Nenhum banco de produção foi acessado.

| Validação                                            | Resultado                                              |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Relatórios direcionados em SQLite                    | 9 testes aprovados                                     |
| Regressão financeira direcionada                     | 10 testes aprovados                                    |
| Backend/SQLite completo (`npm test`)                 | 199 testes aprovados                                   |
| PostgreSQL local descartável 17.11                   | 145 testes aprovados                                   |
| E2E direcionados: Relatórios, Financeiro e dashboard | 9 testes Chromium aprovados                            |
| E2E Chromium completo                                | 58 testes aprovados                                    |
| `npm run build`                                      | Aprovado, incluindo TypeScript e verificação da agenda |
| `npm run format:check`                               | Aprovado                                               |
| `git diff --check`                                   | Aprovado                                               |

Uma conferência SHA-256 de 93 arquivos confirmou que migrations 001–014, `marketing/` e o repositório exclusivo da landing não foram modificados. HEAD permaneceu em `685759c`. Foi corrigida uma diferença de tipos entre os bancos: o cálculo de futuros usa minutos inteiros, preservando a comparação exata com o início dos agendamentos e evitando enviar frações a uma coluna PostgreSQL INTEGER.

Os testes incluem pagamentos parciais/integral, estornos de períodos anteriores, despesas pendentes/pagas/anuladas, concluídos sem recebimento, cancelados com recebimento, snapshots, múltiplos serviços legados sem dupla contagem, inativos, filtros combinados, datas bissextas, fuso, segundos, zero denominador, CSV injection, isolamento, readonly, preservação de registros e volume de 10.005 atendimentos e recebimentos.

Para demonstração após build: `node tests/browser-server.js` com o ambiente protegido de testes e porta 4173 disponível. As fixtures pertencem somente ao servidor descartável de testes.

- URL: `http://127.0.0.1:4173/app/relatorios?empresa=business-browser-team`
- E-mail: `business-browser-owner@example.com`
- Senha de teste: `ClienteDemo2026!`

Limites desta entrega: exportação CSV agregada, sem XLSX/PDF ou relatório contábil oficial; gráficos diários e até oito serviços; limites de intervalo, linhas e seletores acima. Nenhuma fase futura, commit ou push foi iniciado.
