# Gradefy — Fase 7F.3C.1: estabilização e integrações

Implementação em `gradefyapp-recuperado`, branch `feat/gradefy-foundation`, base `85739b4`. Essa cópia estava limpa e continha as migrations 001–017 e o painel do profissional. A cópia da pasta superior, com alterações antigas, não foi modificada. Não houve commit, push, deploy ou acesso a bancos de produção.

## Sessão: causas e correções

O cliente HTTP tratava qualquer `401`, exceto login/cadastro, como expiração e emitia `session-expired`. Todos os providers escutavam esse evento global e apagavam usuário/visitante, inclusive quando a resposta pertencia a outro contexto. Foi reproduzido no Chromium: após login válido, um `401` na consulta empresarial levava ao login mesmo com `/auth/me?scope=gradefy` ainda retornando o usuário. O teste falhou antes da correção (`test-results/session-before.log`) e passou depois.

Também foi confirmado que `createApp` gerava um segredo JWT por inicialização quando a configuração estava ausente. Na cópia recuperada, `.env` não existia e o processo não tinha JWT_SECRET configurado. Isso permite invalidar cookies após reiniciar uma API persistente. A API e o banco local existentes não foram reiniciados ou abertos. O default foi inspecionado e dois cenários separados foram testados: reinicialização da aplicação com outra chave recusa o cookie; encerramento e reinício de dois processos Node reais, com a mesma chave e um SQLite temporário em disco, preservam o cookie e o usuário.

O router e o provider Gradefy foram inspecionados; não foi encontrada necessidade de remontar a autenticação ou trocar suas rotas. A seleção empresarial permanece nos links e na URL.

Correções:

- Um `401` empresarial solicita validação da sessão canônica; não apaga diretamente o usuário. `403`, falhas HTTP temporárias e problemas de rede continuam como erros recuperáveis da requisição.
- Eventos de validação distinguem Gradefy e cada API pública. A sessão pública legada não é usada como autoridade para o painel.
- Consultas simultâneas compartilham uma promise. Rajadas são limitadas, com uma verificação posterior para não perder uma expiração ocorrida durante o intervalo. Consultar `/auth/me` não dispara nova consulta recursiva.
- Falha temporária em `/auth/me` durante recarga mantém uma tela de recuperação na mesma URL. Não confunde sessão desconhecida com usuário deslogado. Uma resposta canônica confirmando ausência/invalidade da sessão encaminha ao login.
- BroadcastChannel continua sincronizando alterações reais da conta entre abas. Uma mensagem de outra aba invalida leituras antigas e solicita uma leitura atual; uma resposta atrasada não restaura a identidade anterior.
- Requisições de negócio, especialmente gravações financeiras, não são repetidas automaticamente pela validação da sessão.
- A exportação CSV, que usa fetch por retornar um arquivo, também solicita essa mesma validação central. Não emite mais o evento global antigo e trata respostas de erro sem JSON com uma mensagem recuperável.
- Bancos persistentes exigem JWT_SECRET estável de pelo menos 32 caracteres. `server/index.js` valida antes de abrir o banco, executar seed ou iniciar workers. Segredo efêmero fica restrito a testes explícitos ou bancos descartáveis, fora de produção. Serverless preserva sua validação de configuração.

Não mudaram nome do cookie, HttpOnly, SameSite, Secure, issuer/audience, algoritmo, formato/versionamento do JWT ou duração de sete dias. Não foi criado outro sistema de autenticação nem renovação ilimitada de tokens.

## Endereço por CEP

A seção de endereço no cadastro empresarial começa pelo CEP. Aceita oito números com ou sem hífen; consulta automaticamente após 300 ms. Cache de respostas válidas evita consultas repetidas. AbortController e verificações de versão do campo protegem contra respostas fora de ordem. Rua, bairro, cidade e UF são preenchidos e permanecem editáveis; alterações manuais feitas durante a consulta são preservadas. Número e complemento pertencem ao usuário e não são preenchidos com dados externos.

`GET /api/address/cep/:cep` exige a autenticação global existente, valida o formato e consulta somente o host HTTPS fixo do [ViaCEP](https://viacep.com.br/), com timeout de 4,5 s e sem redirecionamentos. Resposta externa é validada e reduzida a rua, bairro, cidade e UF. CEP inexistente retorna 404; falha externa retorna 503 com orientação para preencher manualmente. Nenhum e-mail, nome, cookie ou token é enviado ao provedor.

CEP continua opcional para compatibilidade com cadastros manuais/antigos. Quando houver endereço estruturado, rua e número são necessários, aceitando `s/n`. UF, CEP e comprimentos são novamente validados no backend. Número não precisa ser exclusivamente numérico. O endereço completo respeita o limite textual existente de 250 caracteres.

Os campos estruturados persistem separadamente, e `company_settings.address` continua recebendo o texto completo para o site atual e seus links de localização. O onboarding pode ser retomado pelo backend após recarga. Se o endereço livre for posteriormente alterado em Meu Site ou Configurações, os metadados estruturados antigos são invalidados transacionalmente, evitando um CEP divergente do novo texto. Alterar apenas nome, telefone ou aparência preserva o endereço estruturado.

O serviço externo é opcional para concluir o formulário. Os testes simulam suas respostas; nenhuma bateria de testes consulta massivamente o ViaCEP. Não foi implementado o novo Mini Site.

## Convite e cadastro profissional

Ao escolher Profissional em Equipe, o proprietário seleciona:

1. Criar novo profissional no aceite.
2. Vincular profissional existente, escolhido explicitamente entre os cadastros da empresa.

Enviar o convite guarda somente a intenção. Não cria profissional, agenda, membership ou assinatura.

No aceite autenticado, o backend valida a credencial do convite, a versão da sessão, o e-mail destinatário, o estado da empresa e os vínculos atuais. Reutiliza o lock empresarial de equipe, a infraestrutura de associação da Fase 7F.3C e a criação de agenda fechada já utilizada no cadastro manual de profissionais. Membership, profissional, sete dias fechados, vínculo, consumo da credencial e auditoria são uma única transação.

Um cadastro novo nasce **inativo**, sem serviços, em agenda manual sem semanas liberadas e com todos os dias fechados. O colaborador acessa `/app/minha-agenda`, onde vê o estado inativo até a configuração. O proprietário precisa conferir serviços, horários e ativação em Profissionais. Criar esse rascunho não consome vaga ativa; sua ativação usa os limites e locks já existentes, incluindo a concorrência do Individual. Assinatura ou trial inválido impede concluir a integração, mantendo o convite pendente. A exceção legada de operação da Igor é preservada.

Vincular um cadastro existente preserva seu estado ativo/inativo, seus serviços, horários, reservas e histórico. Não há busca por coincidência de nome, ativação implícita ou substituição automática de outra conta. Se a conta já estiver vinculada a outro cadastro, o aceite falha sem efeitos parciais; o proprietário deve emitir um convite apontando explicitamente para o cadastro correto.

Aceites repetidos por token ou código retornam o mesmo profissional para a mesma conta, sem duplicar cadastros ou auditoria. O banco mantém somente o hash da credencial consumida para localizar o resultado; os tokens brutos não são armazenados ou registrados. Repetir o aceite não restaura um acesso revogado nem um vínculo posteriormente removido. O próprio destinatário consegue reinspecionar o convite consumido para recuperar uma resposta perdida.

Convites cancelados/expirados não criam cadastros. Renovar mantém a intenção e invalida o segredo anterior. Se dois convites disputarem o mesmo profissional, somente um vínculo vence e a outra transação mantém o convite pendente. Revogar membership preserva profissional, agenda e histórico.

Gestores não geram profissionais. Convites antigos, ou integrações que enviem apenas o papel sem a nova escolha explícita, preservam o fluxo manual anterior. A nova interface sempre envia a intenção quando o papel é Profissional. O papel Profissional continua sem acesso administrativo, financeiro ou a dados de outra empresa.

## Migration 018

`018-gradefy-session-address-invitations.sql`, aditiva e registrada no runner existente:

- Acrescenta cinco colunas opcionais a `company_settings`: `postal_code`, `street`, `neighborhood`, `address_number`, `address_complement`. Defaults NULL preservam registros antigos.
- Cria `company_invitation_professionals`, com intenção, ID empresarial, convite, profissional e hash opcional do aceite. IDs obrigatórios têm NOT NULL explícito, chave composta e FKs compostas impedem referências entre empresas.
- Constraints de tamanho/formato usam SQL aceito por PostgreSQL e SQLite, sem GLOB ou tipos exclusivos de um banco.

Não altera migrations 001–017, IDs legados, preços, planos, assinaturas ou valores históricos. Reexecução é reconhecida pelo journal. Os testes injetam falha depois dos ALTERs e provam rollback integral. Reconstruções para schemas antigos existem apenas em helpers de bancos descartáveis.

## Testes e resultados

Todos os comandos foram executados com carregamento de `.env` desabilitado e URLs de banco de produção vazias. SQLite usa memória; PostgreSQL 17.11 usa cluster temporário em loopback, criado e removido pelo runner local. O servidor E2E usa os fixtures reais do repositório, sem provedores de e-mail reais.

| Verificação                                            | Resultado    |
| ------------------------------------------------------ | ------------ |
| Novos testes de backend dirigidos                      | 18 passaram  |
| Backend/SQLite completo                                | 272 passaram |
| PostgreSQL 17.11 local completo                        | 214 passaram |
| E2E dirigidos de sessão/CEP/convites/CSV               | 15 passaram  |
| E2E completo Chromium                                  | 86 passaram  |
| Build + TypeScript + `check:schedule`                  | Passaram     |
| Prettier com `--end-of-line auto` e `git diff --check` | Passaram     |

Cobertura adicional: login e navegação por todas as áreas, recarga, troca de empresa, erros 401/403/500, canonical indisponível, expiração real inclusive durante rajada, isolamento de escopos e logout entre abas; CEP parcial/inexistente/sem rua, rede indisponível, correção manual, respostas fora de ordem e submissão real; novos profissionais, associação existente, autorização, preservação do legado, rollback e repetição de aceite em conexões distintas, competição pelo mesmo profissional e pelo limite Individual, assinatura expirada e revogação.

Os três testes anteriores que simulavam expiração apenas forjando um `401` empresarial foram ajustados para também invalidar o cookie ou a sessão canônica. A primeira rodada de CEP identificou um seletor de teste que tentava clicar diretamente no radio coberto pelo card; foi corrigido para clicar no label, como os testes existentes. A primeira rodada PostgreSQL encontrou o inventário antigo de tabelas; foi atualizado para incluir a tabela nova. O E2E completo identificou a exportação CSV ainda usando o evento global antigo; essa chamada foi integrada à validação central e ganhou regressão própria para sessão válida. Nenhuma dessas correções removeu cenários ou enfraqueceu validações de autorização.

A recuperação no Windows deixou arquivos anteriores em CRLF. O Prettier padrão apontou essa diferença nos arquivos anteriores; a verificação completa com `npm.cmd run format:check -- --end-of-line auto` passou. Os arquivos desta fase foram formatados, preservando os demais. O procedimento documentado de criação local da chave foi executado somente em diretório temporário de teste: criação, ausência de saída sensível, repetição sem rotação, preservação das outras configurações e recusa de substituir uma chave inválida passaram.

Capturas do formulário em 320/390/768/1440 px ficam em `test-results/cep-*.png`, com verificação de ausência de rolagem horizontal. Logs da fase usam o prefixo `test-results/phase3c1-`. `test-results/postgres-validation/report.json` registra a versão, `productionAccess: false` e o encerramento/remoção do cluster.

Comandos de validação descartável, em PowerShell:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
node --test tests/session-address-invitations.test.js
npm.cmd test
node tests/postgres/run-local.mjs --bin 'C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin'
npm.cmd run build
npx.cmd playwright test
npm.cmd run format:check
git diff --check
```

## Validação manual e configuração local

Use a pasta `C:\Users\Breno\Downloads\Documents\projetoweb\igorbarberclub\gradefyapp-recuperado`. A cópia superior não contém esta fase.

Para desenvolvimento com seu banco local existente, mantenha as suas configurações, defina uma chave JWT_SECRET aleatória de pelo menos 32 caracteres em `.env` ou no ambiente e execute `npm.cmd run dev`. Nunca publique esse arquivo ou reutilize um valor de exemplo. A primeira definição/troca legítima da chave exige novo login; reiniciar depois com a mesma chave preserva a sessão. Não configure uma conexão de produção para homologar esta fase.

Opcionalmente, o comando abaixo **cria somente uma chave ausente**, sem exibi-la e sem substituir uma chave já definida. Não foi executado automaticamente. Não altera conexões, banco ou outros campos do arquivo:

```powershell
@'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
let text = readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8');
const configured = parse(text).JWT_SECRET;
if (configured?.trim().length >= 32) process.exit(0);
if (configured) throw new Error('Já existe uma chave. Não a substitua automaticamente.');
const value = randomBytes(48).toString('base64url');
const pattern = /^JWT_SECRET\s*=.*$/m;
text = pattern.test(text) ? text.replace(pattern, 'JWT_SECRET=' + value) : text + '\nJWT_SECRET=' + value + '\n';
writeFileSync('.env', text, { mode: 0o600 });
'@ | node --input-type=module
npm.cmd run dev
```

Abra `http://localhost:5173/app/login`. Depois de entrar, navegue pelas áreas, troque empresa, recarregue e confira também uma segunda aba. Para CEP, crie uma conta sem empresa e siga até `/app/onboarding/setup`. Para convites, acesse `/app/equipe?empresa=<id>`, escolha Profissional e a ação. Aceite com a conta do e-mail convidado; configure serviços/horários e só então ative o novo profissional.

Para demonstração isolada sem tocar no banco existente, após o build e com as variáveis descartáveis acima: `node tests/browser-server.js`. Abra `http://127.0.0.1:4173/app/login`, usuário de fixture `business-browser-owner@example.com`, senha `ClienteDemo2026!`. Esses dados existem somente no fixture. Encerre-o para descartar a demonstração. Esse comando não é a configuração de produção.

## Arquivos alterados

Aplicação e configuração:

- `.env.example`
- `server/app.js`, `server/index.js`, `server/jwt-secret.js`
- `src/lib.ts`, `src/context.tsx`, `src/gradefy/api.ts`, `src/gradefy/Shell.tsx`, `src/gradefy/reports.tsx`
- `server/company-onboarding.js`, `server/postal-address.js`, `server/company-site.js`, `server/operational-settings.js`
- `src/gradefy/business-setup.tsx`, `src/gradefy/business-types.ts`, `src/gradefy/postal-address.ts`, `src/gradefy/styles.css`
- `server/team.js`, `server/invitation-professionals.js`, `server/professionals.js`, `src/gradefy/team.tsx`, `src/gradefy/team.css`
- `server/migrations.js`, `server/migrations/018-gradefy-session-address-invitations.sql`

Testes novos e integração:

- `tests/session-address-invitations.test.js`, `tests/helpers/session-address-invitations.js`, `tests/helpers/session-address-migration.js`
- `tests/e2e/gradefy-session-stability.spec.js`, `tests/e2e/gradefy-address-invitations.spec.js`
- `tests/e2e/gradefy.spec.js`, `gradefy-dashboard.spec.js`, `gradefy-agenda.spec.js`
- `tests/postgres/foundation.test.js`
- `tests/company-integrity.test.js`, `company-migration.test.js`, `data-ownership.test.js`
- Helpers de testes com versões esperadas/reconstruções atualizadas para 018: `access-migration.js`, `agenda.js`, `barber-classic-migration.js`, `barber-classic.js`, `business-management.js`, `company-onboarding.js`, `data-ownership.js`, `finance.js`, `operational-onboarding.js`, `operational-settings.js`, `professional-idempotency.js`, `professional-panel-migration.js`, `professional-panel.js`, `professionals-migration.js`, `scheduling-reliability.js`, `site-editor.js`, `team.js`.
- Este relatório.

## Limitações e preservação

O ViaCEP pode estar indisponível ou desatualizado; o endereço permanece editável. Novos profissionais precisam de configuração e ativação explícitas. Um convite que disputa um cadastro já vinculado exige que o proprietário cancele/reemita apontando para o cadastro correto. Convites legados mantêm o fluxo manual anterior.

Nenhum banco existente foi apagado, reinicializado ou aberto para testes. Nenhum segredo foi impresso ou incluído no Git. Igor, Barber Classic, painel profissional, agenda, serviços, clientes, financeiro, relatórios, planos, trial e políticas de agendamento foram preservados. Não foram implementados Fase 7G, Super Admin, cobrança real ou novo Mini Site.
