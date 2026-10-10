# Gradefy — Meu Site, Fase 7E.1

## Interface e acesso

`/app/meu-site` usa o design system Gradefy. O botão “Personalizar meu site” da
conclusão leva ao editor; a URL antiga `/app/onboarding/site` redireciona para ele.
A conta empresarial também apresenta atalhos por empresa para owner/manager.
Usuários com várias empresas precisam selecionar uma delas.

Campos: nome público, slogan opcional, descrição, cores principal/secundária,
WhatsApp, telefone, Instagram, endereço, cidade/UF e link de localização.
Logo e banner são enviados separadamente. Galeria permite adicionar, visualizar,
excluir e reordenar até 40 fotografias. As seções opcionais Sobre/Galeria podem
ser ocultadas. Há uma amostra das cores; a prévia completa não foi implementada.

Barber Classic mantém layout e textos de atração. Não existe edição de HTML/CSS.
Contadores de serviços/profissionais vêm dos mesmos registros operacionais,
sem duplicar cadastros. Fotos e identidade do Igor permanecem intactas até uma
edição explícita por alguém autorizado.

## API, persistência e isolamento

Todas as rotas `/api/company-site` exigem a sessão existente, empresa ativa e
membership owner/manager ativo. `X-Gradefy-Company-Id` identifica a seleção,
mas a resolução empresarial valida o acesso no banco. URLs privadas de imagens
levam `?company=...`, sujeito à mesma validação. Nenhuma seleção usa Igor como fallback.

| Método | Caminho                               | Operação                                                  |
| ------ | ------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/company-site`                   | Configurações, imagens, galeria, capacidades e contadores |
| PUT    | `/api/company-site`                   | Salvar textos, cores, contato e seções                    |
| POST   | `/api/company-site/uploads/:purpose`  | Enviar logo, banner ou gallery; corpo binário             |
| GET    | `/api/company-site/assets/:id/image`  | Ler imagem privada própria                                |
| DELETE | `/api/company-site/images/:purpose`   | Remover logo/banner                                       |
| GET    | `/api/company-site/gallery/:id/image` | Ler foto própria, nova ou legada                          |
| DELETE | `/api/company-site/gallery/:id`       | Excluir foto própria                                      |
| PUT    | `/api/company-site/gallery/order`     | Salvar permutação completa de IDs próprios                |

PUT/DELETE recebem a versão atual. Uploads usam `X-Site-Version`. `site_version`
e lock por empresa evitam sobrescrever alterações concorrentes; conflitos retornam
409 com orientação de recarregar. A autorização é revalidada dentro da transação,
com locks de empresa/membership no PostgreSQL. As respostas das gravações são
capturadas dentro da transação, evitando avançar a versão do cliente com dados
de outra alteração concorrente.

Nome fica em `companies`; textos, contatos, cores e flags em `company_settings`.
Fotos usam o `portfolio` existente, com ordenação e referências de armazenamento.
O banco é fonte de verdade entre recarregamentos e dispositivos. Não depende de
localStorage. Empresa, IDs, URLs de imagens, assinatura e publicação não são campos
livres do payload de edição.

## Armazenamento de imagens

A infraestrutura anterior armazena fotos/avatares em base64. Ela é preservada
para compatibilidade. **Nenhuma imagem nova enviada pelo editor é armazenada em
base64 no banco**, nem no filesystem do servidor.

`server/site-storage.js` define uma interface pequena `put/read/remove` e um
adaptador para Supabase Storage privado. O arquivo é normalizado em memória,
enviado para armazenamento persistente e representado por metadados no banco.
Chaves incluem um hash da empresa e UUID gerado no backend. Nenhuma chave de
objeto, credencial ou URL pública de bucket é entregue ao navegador.

Configure exclusivamente no backend, usando um projeto/bucket de desenvolvimento
descartável para validar a integração real:

```dotenv
SITE_STORAGE_PROVIDER=supabase
SITE_STORAGE_URL=https://SEU-PROJETO.supabase.co
SITE_STORAGE_SERVICE_KEY=CHAVE_SERVICE_ROLE_SOMENTE_NO_BACKEND
SITE_STORAGE_BUCKET=gradefy-site-private
```

Crie o bucket **privado**, sem leitura pública/anon e sem políticas que permitam
acesso direto por usuários não autorizados. O adaptador verifica `public=false`
antes de usar o bucket. `SITE_STORAGE_SERVICE_KEY` é uma credencial administrativa;
não use prefixo `VITE_`, não a versione nem a envie ao cliente. Bucket e credencial
não são criados automaticamente. Consulte a
[documentação oficial de acesso aos arquivos](https://supabase.com/docs/guides/storage/serving/downloads).

Sem configuração, o editor continua salvando textos/cores/seções e mostra que
uploads estão indisponíveis. Não foi conectado nenhum projeto Supabase real.
Os testes de uploads usam um adaptador em memória explicitamente injetado somente
nos servidores de teste; esse adaptador não pode ser escolhido por variável de ambiente.

Limites e validação:

- Até 3 MB por arquivo, compatível com uploads pequenos na hospedagem futura.
- JPG, PNG ou WebP estáticos. SVG, GIF, conteúdo executável e MIME disfarçado são recusados.
- Assinatura binária, formato real e decodificação completa verificados no backend.
- Até 16 milhões de pixels na entrada; saída WebP limitada a 2000×2000 e 3 MB.
- Reencode remove metadados e conteúdo extra. Nomes de arquivo do cliente não viram caminhos.
- Downloads do provedor têm limite de bytes inclusive quando falta Content-Length.

Upload registra estado pending antes da chamada externa. Só depois do envio e
de nova validação de autorização/versão ele associa o arquivo e marca ready.
Falhas deixam trabalho de limpeza persistido em deleting; substituições/exclusões
desassociam a imagem e removem apenas a chave da empresa. Remoção externa com falha
é retentada nos próximos acessos ao editor. Pending abandonado há uma hora também
é recolhido. Sem novos acessos, a limpeza aguardará; um job agendado pode ser
adicionado futuramente sem trocar o modelo.

O navegador lê arquivos privados através do backend autenticado, com no-store.
Os handlers públicos só servem arquivos de empresas já publicadas e referências
associadas. Uma empresa não publicada continua retornando 404 nas rotas públicas.

## Migration 011 e compatibilidade

`011-gradefy-site-editor.sql` acrescenta:

- `company_settings.site_version` e `sections_json`.
- `portfolio.sort_order` e índice composto da identidade empresarial.
- `company_site_assets`, com IDs NOT NULL, metadados, estados e chave de objeto única.
- `portfolio_assets`, com FKs compostas que impedem relacionar foto/arquivo de empresas distintas.

É aplicada pelo runner versionado, transacional e idempotente. Migrations 001–010
não foram alteradas. Os defaults preservam a ordenação e apresentação anteriores.
Fixtures descartáveis de testes anteriores foram atualizadas para a versão 11.

**Salvar não altera `site_published`.** Empresas novas permanecem privadas.
Para empresas já publicadas, alterações explícitas atualizam os dados atuais do site;
nesta fase não existe um segundo catálogo de rascunhos. Trial, assinaturas, login,
serviços, profissionais e agendamentos não são modificados pelo editor.

## Arquivos da fase

Criados: `server/company-site.js`, `server/site-storage.js`, `server/site-assets.js`,
`server/migrations/011-gradefy-site-editor.sql`, `src/gradefy/site-editor.tsx`,
`tests/site-editor.test.js`, `tests/helpers/site-editor.js`,
`tests/helpers/site-editor-migration.js`, `tests/helpers/site-storage.js`,
`tests/e2e/gradefy-site-editor.spec.js` e esta documentação.

Integração: `.env.example`, `server/app.js`, `server/migrations.js`,
`server/portfolio.js`, `server/public-site.js`, `src/main.tsx`, `src/types.ts`,
`src/gradefy/pages.tsx`, `src/gradefy/styles.css`, `src/pages/Home.tsx` e
`src/components/Layout.tsx`.

Testes/fixtures ajustados: `tests/browser-server.js`, `tests/company-integrity.test.js`,
`tests/company-migration.test.js`, `tests/data-ownership.test.js`,
`tests/helpers/access-migration.js`, `tests/helpers/barber-classic-migration.js`,
`tests/helpers/barber-classic.js`, `tests/helpers/company-onboarding.js`,
`tests/helpers/data-ownership.js`, `tests/helpers/operational-onboarding.js`,
`tests/helpers/professional-idempotency.js`, `tests/helpers/professionals-migration.js`,
`tests/helpers/scheduling-reliability.js`, `tests/postgres/foundation.test.js` e
`tests/e2e/gradefy-operations.spec.js`.

## Testar localmente e próxima fase

Validação em 09/10/2026:

| Verificação                                | Resultado     |
| ------------------------------------------ | ------------- |
| Específicos do editor / SQLite / adaptador | 9 aprovados   |
| Backend completo, incluindo SQLite         | 140 aprovados |
| PostgreSQL local descartável 17.11         | 88 aprovados  |
| E2E específicos do editor e conclusão      | 3 aprovados   |
| E2E completo, incluindo Igor               | 38 aprovados  |
| Build e TypeScript                         | Aprovados     |
| Prettier e git diff --check                | Aprovados     |

Os testes de atualização de schema precisaram reconhecer as novas tabelas e o
campo de ordenação, mantendo as verificações de preservação dos registros legados.
Não restaram falhas na rodada final. PostgreSQL foi criado por runner local em
porta aleatória, depois parado e removido; `productionAccess=false` no relatório.

Abra `http://localhost:5173/app/meu-site` após concluir a configuração empresarial.
O ambiente de demonstração em memória perde dados ao reiniciar o backend; em uso
com banco persistente, o progresso permanece. Uploads reais exigem as variáveis
acima e um bucket de desenvolvimento privado. Nenhum dado de produção foi utilizado.

Para 7E.2 ficam prévia real autenticada e publicação explícita, com validações
próprias. Domínios, cobrança, editor HTML/CSS, novos templates e dashboard completo
não fazem parte desta entrega. Não houve commit ou push.
