# Gradefy — Fase 7F.4D.1-R1: compatibilidade com Workers

## Estado

Branch `feat/gradefy-foundation`, sem deploy, commit ou push nesta fase. O teste usa somente PostgreSQL 17.11 em cluster local descartável. Nenhum banco remoto, Supabase de produção, domínio ou serviço de e-mail foi acessado. A configuração é preparatória; **a implantação privada continua bloqueada** até validar Hyperdrive, Storage privado e políticas Cloudflare Access no ambiente escolhido.

## Alterações

| Bloqueio da auditoria              | Tratamento nesta fase                                                                                                                                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp` nativo                     | Interface opcional de processamento compartilhada. Node mantém `sharp`; Worker usa Images Binding. O alias de Wrangler bloqueia o carregamento acidental de `sharp` no Worker.                                                                                                   |
| DDL/seed por inicialização         | `createDatabase(..., { initialize: false })` abre somente PostgreSQL. O Worker consulta versões da tabela `schema_migrations` e recusa schema ausente ou divergente. `server/migrate.js` permanece como job Node separado e controlado, sem alteração nas migrations históricas. |
| `app.listen` e timers persistentes | Entrada `worker/index.js` usa `fetch` e a ponte HTTP do Workers para Express; `scheduled()` executa, de forma finita, os processadores de outbox já existentes. A entrada Node continua inalterada.                                                                              |
| Banco e conexões                   | Um pool `pg` por invocação, encerrado em `finally`; sem cliente global. Conexão via `HYPERDRIVE.connectionString` quando disponível, ou `DATABASE_URL` para o teste descartável.                                                                                                 |
| IP ausente no HTTP bridge          | `request.ip` recebe o IP validado de `CF-Connecting-IP`, ou um bucket compartilhado conservador. Um Rate Limiting Binding protege as rotas de autenticação no Worker antes de abrir o banco.                                                                                     |
| Alertas de dependência             | Atualização compatível de lockfile (`@vercel/functions`, `sharp`, `zod` e transitivas, inclusive `proxy-addr`) sem `--force`; `wrangler` adicionado como dependência de desenvolvimento. `npm audit --omit=dev` reporta zero alertas.                                            |

Arquivos: `.gitignore`, `package.json`, `package-lock.json`, `server/{app,client-auth,company-site,database,portfolio,profile,site-storage}.js`, `tests/postgres/run-local.mjs`, `tests/workers/*`, `tests/e2e/gradefy-mobile-clients-finance-profile.spec.js`, `worker/*`, `wrangler.jsonc` e este documento. O teste E2E de perfil foi corrigido para esperar o destino já vigente de um usuário sem empresa (`/app/onboarding/plan`), em vez de supor acesso ao dashboard. O relatório anterior de auditoria continua não versionado e foi preservado. Nenhuma migration, rota existente, layout, landing ou app mobile foi alterado funcionalmente.

### Auditoria de dependências

O lockfile anterior foi auditado isoladamente, sem instalar ou executar o código antigo. Os nove alertas eram: `proxy-addr` (crítico; identificação de IP no proxy), `sharp` (alto; processamento de imagens enviadas), `zod` (alto; validação de entrada), `body-parser` (alto; parsing de requisições), `@vercel/functions` (alto; entrada Vercel), `@vercel/oidc` e `@vercel/cli-config` (altos; cadeia transitiva de `@vercel/functions`, esta também afetada por `zod`), `ip-address` (moderado; biblioteca transitiva de endereços) e `qs` (moderado; parsing de query). A atualização compatível corrigiu todos segundo `npm audit` atual, sem `--force`. O risco de regressão foi mitigado por build, testes Node, PostgreSQL e E2E; isso não equivale a provar ausência de vulnerabilidades futuras.

## Imagens e armazenamento

O binding aceita somente JPEG, PNG e WebP estáticos com MIME e assinatura coerentes. Rejeita APNG e WebP animado, arquivo inválido, entrada maior que 3 MiB e imagem acima do teto de pixels da política existente. Normaliza para WebP no tamanho/qualidade da política existente, aplica orientação e remove EXIF. Saída, dimensões e tamanho são revalidados. O teste local de Wrangler cobre formatos, falsificação de MIME, corrupção, tamanho, pixels, animação e orientação EXIF. A [documentação do Images Binding](https://developers.cloudflare.com/images/optimization/binding/) descreve a API; [WebP remove metadados e aplica orientação EXIF](https://developers.cloudflare.com/images/optimization/features/).

O bucket privado Supabase existente não foi migrado para R2. `SITE_STORAGE_PROVIDER=supabase` fica preparado na configuração, mas URL, bucket e chave de serviço exigem segredos de homologação separados. O fluxo de upload/consulta com credenciais de Storage reais **não foi testado em Workers** nesta fase; não há credenciais de produção no teste. O limite do produto de Images Binding é superior ao limite local de 3 MiB; [a cobrança atual](https://developers.cloudflare.com/images/pricing/) inclui 5.000 transformações únicas mensais gratuitas e cobra excedentes no plano pago. Confirmar cotas e preços no momento de eventual ativação. O emulador local de imagens não substitui uma prova de alta fidelidade com conta de homologação.

## Banco, jobs e segurança

O runner `tests/postgres/run-local.mjs --bin <diretório-do-PostgreSQL> --worker-smoke` cria um cluster SCRAM em porta aleatória de `127.0.0.1`, executa a suíte PostgreSQL e um Worker Wrangler contra outra base do mesmo cluster, e remove o cluster ao terminar. O Worker nunca executa DDL. O CLI de migrations existente preserva locks, checksums, rollback e bootstrap idempotente; a suíte PostgreSQL cobre banco vazio, legado, concorrência e fluxos de negócio. O runtime Worker verifica versões e nomes; a checagem integral de checksum permanece no job de migração, não em toda requisição.

O smoke Workers cobre saúde, login, origem permitida/negada, cookie `HttpOnly`/`Secure`, sessão, leitura da agenda, cadastro (gravação PostgreSQL), criação empresarial com replay idempotente, isolamento de usuário sem membership, SPA, rota API inexistente e evento `scheduled()` local. Outboxes, leases e idempotência seguem na implementação existente. `EMAIL_DELIVERY_MODE=disabled` é exigido pelo Worker, e credenciais Twilio causam recusa de inicialização nesta fase; nenhuma mensagem foi enviada. A configuração de cron não foi publicada.

**Riscos que ainda bloqueiam deploy:**

1. A conexão foi provada com PostgreSQL local direto, não com Hyperdrive real. Antes de publicar, criar binding privado, desativar cache de consultas sensíveis, testar transações, locks, concorrência e limites de conexão contra banco descartável de homologação. [Hyperdrive exige encerrar conexões por invocação](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/) e tem [cache de consultas configurável](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
2. O armazenamento privado não foi testado ponta a ponta no Worker com um bucket isolado. Validar leitura, gravação, exclusão, permissões e falhas de rede antes de liberar uploads.
3. O Rate Limiting Binding é aproximado e regional; os limitadores Express em memória são reconstruídos por requisição no Worker. O binding protege tentativas de autenticação, mas quotas estritas de reserva/recuperação e proteção contra abuso exigem revisão de borda/Access antes do deploy. Confirmar que o `namespace_id` escolhido não colide com outro binding da conta. [Limitações oficiais do Rate Limiting Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
4. O adaptador cria a aplicação Express por requisição. Medir latência, CPU, memória e custo sob carga real, especialmente hashing bcrypt, imagens e queries. O emulador local não comprova limites de produção.
5. Cloudflare Access, DNS, domínio, `workers.dev`, previews, segredos e backups precisam ser configurados e testados numa etapa autorizada separadamente. A configuração desliga `workers.dev` e URLs de preview, mas isso não demonstra uma política Access ativa.

## Testes

| Verificação                                | Resultado                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build` (TypeScript, agenda, Vite) | Aprovado                                                                                                                                        |
| `npm run test:workers:images`              | Aprovado em Wrangler local                                                                                                                      |
| `wrangler deploy --dry-run`                | Bundle aprovado; nenhum deploy                                                                                                                  |
| Worker + PostgreSQL descartável            | Saúde, sessão, gravações, empresa, isolamento, SPA e cron local aprovados                                                                       |
| Suíte PostgreSQL 17.11 local               | 267/267; cluster descartável encerrado e removido                                                                                               |
| `npm audit` e `npm audit --omit=dev`       | 0 alertas em ambas as consultas                                                                                                                 |
| `npm ci --no-fund`                         | Instalação limpa concluída, 0 vulnerabilidades; build e Workers local repetidos após a instalação.                                              |
| Testes mobile e typecheck mobile           | 5/5 e aprovado                                                                                                                                  |
| Prettier dirigido e `git diff --check`     | Aprovados                                                                                                                                       |
| `npm run format:check` global              | Falhou em 194 arquivos preexistentes fora desta fase; eles não foram formatados indiscriminadamente.                                            |
| Backend completo em série                  | 335/339; quatro falhas já registradas na fase anterior em validação de destinatários de `server/email-templates.js`, fora deste escopo          |
| E2E completo                               | 149/149 na segunda execução. A primeira teve 148/149 por expectativa antiga do teste de usuário sem empresa, corrigida sem alterar a aplicação. |

## Próximo portão

Preparar um banco e bucket **descartáveis de homologação**, conectar Hyperdrive sem cache para dados sensíveis, verificar storage e política Access negando por padrão, então repetir os cenários do Worker sob carga e com falhas. Se a ponte Express ou as dependências não couberem nos limites de Workers, manter o backend Node atual em provedor compatível, com a mesma base de código e sem reescrever as regras de negócio. Não publicar a configuração atual somente por passar no build ou em `wrangler dev`.

Checklist antes de qualquer implantação privada: migrations executadas uma vez por job controlado e com backup; checksum validado; Hyperdrive apontando para banco de homologação e com cache sensível desligado; Storage privado testado com imagens reais e negação entre empresas; sessão/cookies/origem verificados sob hostname final; limites de CPU, memória e conexões medidos; Access exigido em todos os caminhos, sem preview ou `workers.dev` aberto; segredos e logs revisados; cron testado sem envio externo; plano de rollback ensaiado. **Se qualquer item falhar, não ativar rota nem domínio.**
