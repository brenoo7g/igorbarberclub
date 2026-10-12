# Gradefy — MKT-1: landing oficial

## Entrega e isolamento

Aplicação independente em `marketing/`: React 19.2, TypeScript 5.9 e Vite 7.2.
Pacote, lockfile, configuração, estilos, assets e testes próprios. Nenhum import
do frontend ou backend principal. Nenhum acesso ao banco, cookies, autenticação,
clientes, rotas privadas ou configurações de produção.

O Vite limita suas variáveis públicas ao prefixo `VITE_MARKETING_`, lê somente
o diretório de ambiente de `marketing/` e não utiliza o proxy `/api` do SaaS.
O output contém exclusivamente a landing. Apenas `marketing/dist/` será publicado.
O bundle intermediário de pré-renderização permanece em `.prerender/`, ignorado.
Essa renderização ocorre no build, não exige API ou SSR em runtime.

O diretório é portátil para um futuro repositório próprio, incluindo logos,
fontes, licenças, testes, scripts, README e lockfile. A migração para outro
repositório e a publicação não foram executadas nesta fase.

## Identidade e conteúdo

Referências consultadas, com os nomes reais:

- `docs/brand/gradefy-landing-page.png.png`;
- `docs/brand/gradefy-mobile-dashboard.png.png`;
- `docs/brand/gradefy-brand-guide.png.png`.

Conceito preservado: dark premium, marca modular oficial, gradientes discretos
violeta/ciano, calendário, painel e celular. Tokens CSS: primária `#6C5CE7`,
destaque `#00D4FF`, fundo `#090D18`, superfície `#121827`, texto `#F8FAFC`,
secundário `#94A3B8`. Sora nos títulos e Inter no corpo, hospedadas localmente.

Assets copiados de `public/gradefy/`: `logo-mark.png`, `logo-wordmark.png`,
`Sora.ttf`, `Inter.ttf` e licenças SIL OFL. Os originais foram preservados.
Favicon 32×32, touch icon 180×180 e Open Graph 1200×630 foram compostos com a
marca existente. As referências completas, que contêm valores e nomes, não
são incluídas na publicação.

Mockups em `src/mockups.tsx` são ilustrativos e seguem a direção aprovada.
Mostram dashboard operacional, agenda, presença online Barber Classic e celular.
Não incorporam o aplicativo, não oferecem controles administrativos funcionais
e não contêm dados de clientes. Exemplos usam “Atendimento 01”, “02” e “03”.

Seções:

1. Cabeçalho com âncoras e menu mobile.
2. Hero com headline e subtítulo aprovados, mockup mobile e lançamento em breve.
3. Sete funcionalidades: agendamento, agenda, clientes, serviços, profissionais,
   site próprio e controle do negócio.
4. Demonstração visual do painel, agenda e site.
5. Quatro segmentos: barbearias como foco inicial com template implementado;
   salões, manicures/nail designers e tatuagem como expansão planejada.
6. Três passos informativos de funcionamento.
7. Mensagem para profissionais independentes e equipes, sem preços ou condições.
8. Chamada final de lançamento e Instagram oficial.
9. Rodapé com marca, navegação, ano e status.

Instagram informado pelo proprietário: `https://www.instagram.com/gradefyapp/`.
CTAs externos usam nova aba com `noopener noreferrer`. O cabeçalho leva à seção
de lançamento; os CTAs do hero e dessa seção abrem o Instagram. O canal pode
ser sobrescrito por `VITE_MARKETING_INSTAGRAM_URL`; vazio/URL inválida oculta
links externos. Não há formulário, checkout, inscrição ou política legal criada.

## Desenvolvimento e testes

Na raiz do repositório:

```sh
cd marketing
npm ci
npm run dev
```

URL: `http://localhost:5174/`. Build e revisão estática:

```sh
npm run build
npm run preview
```

URL do build: `http://localhost:4174/`. No PowerShell, substituir `npm`/`npx`
por `npm.cmd`/`npx.cmd` quando necessário.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
git diff --check
```

Executar `npm run build` antes dos testes. A suíte estática verifica configuração
social, pré-renderização, catálogos informativos, assets SEO, ausência de valores
comerciais/dados sensíveis e independência do backend. A suíte Playwright verifica
320, 390, 768 e 1440 px, assets/fontes, ausência de overflow, menu, Escape/foco,
âncoras, links reais com navegação externa interceptada, conteúdo sem JavaScript,
404, headers, CSP, reduced motion e link para pular ao conteúdo. Não acessa o
Instagram durante a execução: a navegação externa é interceptada.

`tests/static-server.mjs` é um fixture local, sem integração ao SaaS ou hospedagem.
Serve apenas o output em loopback e reproduz as regras de `_headers` usadas pelos
testes. A aplicação não requer esse servidor depois de publicada. Prints e traces
ficam em `marketing/test-results/`, ignorados pelo Git.

O comportamento do SaaS é verificado por comparação SHA-256 dos arquivos
anteriores à MKT-1, build do projeto principal e smoke test local do Igor.
Nenhuma suíte completa de backend é necessária para esta entrega isolada.

## SEO e headers

HTML pré-renderizado com um H1, seções semânticas, `lang="pt-BR"`, título,
description, canonical, Open Graph, Twitter Card, favicon, robots e sitemap.
Canonical: `https://gradefyapp.com.br/`. Sem preços em metadados ou dados
estruturados; nenhum dado estruturado comercial foi criado.

O domínio oficial permanece indexável. `_headers` adiciona `X-Robots-Tag:
noindex, nofollow` aos hosts `pages.dev` de produção temporária e previews.
O Pages também bloqueia indexação de previews por padrão. A proteção HTTP atua
sem JavaScript; a aplicação aplica meta noindex em desenvolvimento/prévia local.
Verificar os headers efetivos após o deploy; o fixture não é a infraestrutura
Cloudflare. [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
e [headers](https://developers.cloudflare.com/pages/configuration/headers/).

A CSP permite somente scripts, estilos, fontes e imagens próprios; bloqueia
conexões de backend, formulários e incorporação em frames. Cache longo somente
nos bundles com hash. `404.html` evita fallback SPA do Pages para rotas privadas
ou inexistentes; esse 404 é comportamento de hospedagem, não do dev server Vite.

## Cloudflare Pages — publicação manual posterior

Não houve acesso à conta Cloudflare nem deploy. O fluxo documentado atualmente é
**Workers & Pages → Create application → Pages → Connect to Git**. Escolher Pages
e conectar o GitHub autorizado, com acesso limitado ao repositório pretendido.
Escolher a branch de publicação explicitamente, após revisão. O Pages publica
automaticamente novos pushes dessa branch. [Guia oficial](https://developers.cloudflare.com/pages/get-started/git-integration/)
e [integração Git](https://developers.cloudflare.com/pages/configuration/git-integration/).

| Campo                               | Configuração                                      |
| ----------------------------------- | ------------------------------------------------- |
| Root directory (advanced)           | `marketing` neste monorepo                        |
| Framework                           | React/Vite ou nenhum preset com comando explícito |
| Instalação                          | `npm ci`                                          |
| Build command                       | `npm ci && npm run build`                         |
| Build output directory              | `dist`, relativo a `marketing`                    |
| `NODE_VERSION`                      | `24.20.0`                                         |
| `SKIP_DEPENDENCY_INSTALL`           | `1`                                               |
| Variável pública opcional           | `VITE_MARKETING_INSTAGRAM_URL`                    |
| Banco, bindings, secrets, Functions | nenhum                                            |

`.node-version` já declara a versão testada. A instalação customizada evita
depender do install automático e usa o lockfile. Não copiar variáveis do SaaS
para o Pages. Em repositório independente, deixar Root directory na raiz.
[Configuração de build](https://developers.cloudflare.com/pages/configuration/build-configuration/)
e [versão do Node/instalação](https://developers.cloudflare.com/pages/configuration/build-image/).

Publicar futuramente somente `marketing/dist`. No monorepo, configurar build
watch paths para `marketing/*`, conforme o suporte de glob do painel, caso se
queira evitar builds em alterações do SaaS. [Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/).

Primeiro revisar o endereço temporário real fornecido pelo Pages: desktop,
mobile, navegação, Instagram, favicon, OG e ausência de erros. Confirmar
`X-Robots-Tag: noindex` com `curl -I` usando a URL real; não há hostname de projeto
definido nesta entrega. URLs temporárias não devem aparecer no canonical.

## Domínio e HTTPS

Após aprovação visual e deploy manual:

1. Adicionar `gradefyapp.com.br` como zona na mesma conta Cloudflare do Pages,
   se ainda não existir. Conferir os registros existentes antes de qualquer
   mudança de provedor DNS.
2. Se solicitado, configurar no registrador os nameservers **exatos** fornecidos
   para a zona, preservando registros existentes necessários. Nenhum nameserver
   ou token de conta foi inventado.
3. No projeto Pages, abrir **Custom domains → Set up a domain** e associar
   `gradefyapp.com.br`. Confirmar o registro DNS indicado no painel.
4. Repetir a associação para `www.gradefyapp.com.br`; confirmar o CNAME real
   informado pelo Pages. Não criar apenas um CNAME sem associar o domínio.
5. Aguardar a ativação DNS/certificado e testar HTTPS em ambos os hosts.
6. Configurar redirecionamento permanente de `www` para o domínio principal,
   preservando caminho e query. Após associar o domínio, também pode redirecionar
   o host temporário principal `pages.dev` ao oficial, sem quebrar previews.
7. Verificar canonical, sitemap, headers, certificado válido e ausência de
   mixed content. A página carrega fontes/imagens locais. Não alterar registros
   de e-mail nem DNS do sistema privado para publicar esta landing.

Esses passos são instruções para execução posterior, sem valores específicos da
conta. [Domínios customizados](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[redirecionamento www](https://developers.cloudflare.com/pages/how-to/www-redirect/) e
[redirecionamento pages.dev](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/).

## Arquivos novos

- `marketing/package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`,
  `index.html`, `.node-version`, `.env.example`, `.gitignore`, `.prettierrc.json`,
  `.prettierignore`, `README.md`, `playwright.config.ts`;
- `marketing/src/App.tsx`, `components.tsx`, `config.ts`, `main.tsx`, `mockups.tsx`,
  `render.tsx`, `styles.css`;
- `marketing/scripts/prerender.mjs`;
- `marketing/public/_headers`, `robots.txt`, `sitemap.xml`, `404.html`,
  `not-found.css`, `favicon.png`, `apple-touch-icon.png`, `og-gradefy.png`;
- `marketing/public/images/logo-mark.png`, `logo-wordmark.png`;
- `marketing/public/fonts/Inter.ttf`, `Sora.ttf`, `Inter-OFL.txt`, `Sora-OFL.txt`;
- `marketing/tests/static.test.mjs`, `static-server.mjs`, `e2e/landing.spec.ts`;
- este documento.

## Limitações e pendências

Produto ainda não lançado; nichos futuros não estão apresentados como disponíveis.
Mockups demonstram o conceito e não reproduzem cada estado funcional do SaaS.
Não há data de lançamento prometida, cadastro, planos, preços, pagamentos,
captura de leads, analytics ou texto jurídico. Verificações de navegador usam
Chromium; aparelhos reais e outros navegadores devem ser revisados antes da
publicação. Conectar GitHub, criar Pages, configurar domínio/DNS/HTTPS e validar
headers reais permanecem ações manuais futuras. Nenhum commit/push foi realizado.

### Resultados desta execução

- Node 24.20.0; build de produção independente e TypeScript aprovados.
- Suíte estática: **6/6 aprovados**.
- Playwright/Chromium: **8/8 aprovados**, com capturas nas quatro larguras pedidas.
- Segurança: testes em output servido com CSP, assets locais, nenhuma chamada
  de API, nenhuma publicação de preços ou dados sensíveis, noindex nos dois
  padrões de hostname temporário e indexação permitida no domínio principal.
- Build principal aprovado, incluindo TypeScript e check existente de agenda.
- Smoke local: Igor `/`, Igor `/agendar` e boas-vindas Gradefy `/app` aprovados;
  página inicial sem erros JavaScript. Fixture SQLite local, sem produção.
- Comparação SHA-256: **293 arquivos anteriores preservados**, zero alterações.
- Formatação e `git diff --check`: validados na rodada final.
- Uma rolagem horizontal causada pela órbita decorativa em mobile foi corrigida.
  A ausência inicial do Chromium correspondente ao pacote isolado foi resolvida
  com instalação local. Os dois falsos positivos do verificador estático (quebra
  de linha em meta tag e identificadores internos React) foram corrigidos.
- Cloudflare, DNS e certificados reais não foram acessados ou alterados. Git
  permaneceu sem commit, push ou staging automático desta entrega.
