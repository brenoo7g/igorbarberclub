# Gradefy — planos e preferência pendente (7B)

## Fluxo e telas

Cadastro/login concluído → `/app/onboarding/plan` → `/app/onboarding/next` provisória. Usuário com vínculo empresarial ativo é encaminhado para `/app/conta`, conservando o acesso existente. A conta sem empresa também oferece o link “Escolher meu plano”. Login, JWT, cookies e autorização não foram alterados.

Os cards usam GradefyLogo, Card, Button, ButtonLink, Feedback, Loading, tokens e fontes da 7A. Radios acessíveis, progresso agrupado (plano, configuração do negócio, conclusão), seleção visual, preços mensais e destaque discreto Equipe. Comissões são identificadas como “em breve”. Não há escolha de nicho/template nem cadastro empresarial nesta etapa.

## Catálogo e validação

- `GET /api/plans`: exige a sessão existente e retorna apenas códigos oficiais `individual`/`team`, ativos e com preço definido. DTO: código, nome, centavos, moeda, periodicidade, trial em dias e máximo de profissionais. Nunca consulta/retorna assinaturas.
- Individual: R$ 22,99/mês, BRL, 7 dias, 1 profissional ativo.
- Equipe: R$ 32,99/mês, BRL, 7 dias, profissionais ativos ilimitados (`NULL` no banco).
- `POST /api/onboarding/plan-selection`: apenas valida `{planCode}`. Payload estrito rejeita preço, companyId, códigos desconhecidos e outros campos. Reutiliza `getAvailablePlan` de `entitlements.js`; plano desativado recebe `PLAN_UNAVAILABLE`. Vínculo empresarial ativo recebe `COMPANY_ALREADY_CONFIGURED`.
- A operação é somente leitura. Mesmo repetida/concurrente, não cria nem atualiza empresa, membro, assinatura ou trial. Não chama `startTrial`, não atribui plano à Igor e não muda o catálogo.

## Persistência e Fase 7D

A preferência fica no `localStorage`, chave `gradefy:onboarding:v1:<userId>`, conteúdo `{version: 1, planCode: 'individual' | 'team'}`. Guarda somente o código; não guarda preço, dados de contato, senha, JWT, empresa ou datas de trial. É salva ao selecionar, permanece durante navegação/reload e é separada por usuário. Dados corrompidos/códigos desconhecidos são descartados; armazenamento bloqueado mostra erro, sem fingir que a escolha foi salva.

Essa preferência é **não confiável** e não autoriza nada. Pode desaparecer ao limpar dados do navegador e não é sincronizada entre dispositivos. Isso não perde conta, assinatura ou negócio; o usuário simplesmente seleciona novamente.

Na Fase 7D, enviar o código junto ao pedido de configuração empresarial; validar novamente a whitelist, catálogo ativo e valores atuais do banco usando a função compartilhada. Ignorar qualquer preço/limite/data recebido do cliente. Associar explicitamente usuário e empresa e ativar o trial apenas ao concluir essa configuração, usando a infraestrutura persistente de idempotência e transações existente. `startTrial` continua protegendo o ciclo inicial e impedindo reinício de trial. Essa orquestração futura não foi implementada nesta fase. Remover a preferência apenas após confirmação da configuração final.

Não há migration nova: a preferência de onboarding ainda não precisa de uma entidade empresarial. Nenhuma migration anterior foi modificada. Sem cobrança, cartão, checkout ou promessa de débito automático; renovação e faturamento ficam para a Fase 8.

## Visualização local

PowerShell, com configuração isolada:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DEMO_MODE='true'
npm.cmd run dev:test-access
```

Abra `http://localhost:5173/app/onboarding/plan` e cadastre uma conta ou entre como cliente de demonstração (`cliente@example.com` / `ClienteDemo2026!`). São credenciais fictícias do seed de demonstração; esse comando usa banco descartável em memória. O administrador de demonstração da Igor volta à conta empresarial em vez de selecionar um novo plano.

## Arquivos desta etapa

- `server/app.js`: endpoints globais de catálogo e validação.
- `server/entitlements.js`: exportação da validação existente e DTO/catálogo comercial.
- `src/main.tsx`: rotas protegidas de planos e etapa provisória.
- `src/gradefy/pages.tsx`: navegação pós-autenticação e CTA da conta sem empresa.
- `src/gradefy/company-access.ts`: consulta somente leitura compartilhada, sem respostas de usuário anterior.
- `src/gradefy/plans.tsx`: gate empresarial, seleção, catálogo e próxima etapa provisória.
- `src/gradefy/pending-plan.ts`: preferência pendente por usuário.
- `src/gradefy/styles.css`: extensão restrita à interface Gradefy.
- `tests/gradefy-plans.test.js`: catálogo/validação/persistência e ausência de efeitos comerciais.
- `tests/e2e/gradefy-plans.spec.js`: fluxo, reload, responsividade, isolamento e erros.
- `tests/e2e/gradefy.spec.js`: expectativas de navegação atualizadas, mantendo os testes da 7A.
- `docs/GRADEFY-PLANS-7B.md`: esta documentação.

As alterações ainda não commitadas da 7A foram preservadas. Barber Classic, app mobile e migrations não receberam alterações.

## Validação e próxima fase

Testes direcionados: 13 de backend/validação/entitlements e 10 E2E passaram. Rodada final:

- Backend/SQLite (`npm test`): 113 passaram.
- PostgreSQL 17.11 descartável local: 63 passaram; cluster encerrado/removido, `productionAccess: false`.
- Playwright completo: 31 passaram, incluindo regressões do Barber Classic/Igor e telas da 7A.
- `npm run build`: TypeScript, verificação da agenda e Vite passaram.
- `npm run format:check` e `git diff --check`: passaram.

Screenshots de planos desktop/mobile em `test-results/gradefy-plans-1440.png` e `gradefy-plans-390.png`, ignoradas pelo Git. Nenhum teste inicia cobrança ou usa provedores reais.

Fase 7C: implementar escolha de nicho e template após esse estado pendente, mantendo a empresa e o trial para a ordem definida na 7D. Sem commit/push e sem acesso a Supabase/produção.
