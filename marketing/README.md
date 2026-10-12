# Gradefy — Marketing

Landing institucional independente, em React, TypeScript e Vite. Não utiliza API,
autenticação, banco de dados, cookies, cadastro ou cobrança. O produto permanece em
desenvolvimento. Este diretório pode ser copiado para outro repositório sem importar
arquivos do SaaS.

## Executar

Utilize Node **24.20.0** e execute dentro deste diretório:

```sh
npm ci
npm run dev
```

Prévia de desenvolvimento: `http://localhost:5174/`. Porta independente da aplicação.
No PowerShell, use `npm.cmd` se a política de scripts impedir `npm`.

```sh
npm run build
npm run preview
```

Prévia do build: `http://localhost:4174/`. O build gera `dist/` com conteúdo
pré-renderizado; `.prerender/` é intermediário local e **não deve ser publicado**.
Nenhum servidor Node é necessário na hospedagem.

## Canal de lançamento

Instagram aprovado: `https://www.instagram.com/gradefyapp/`.
Opcionalmente configure `VITE_MARKETING_INSTAGRAM_URL` conforme `.env.example`.
Uma string vazia oculta os links externos; URLs inválidas não são renderizadas.
Esta variável é pública. Não coloque segredos em variáveis `VITE_MARKETING_*`.

## Verificar

```sh
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Os testes de navegador usam um servidor **somente de teste**, restrito ao build
estático e ao endereço de loopback. Ele aplica as regras de headers para verificar
CSP e noindex localmente; não substitui a validação posterior no Cloudflare Pages.
Capturas: `test-results/screenshots/`, ignoradas pelo Git.

## Cloudflare Pages

Em **Workers & Pages → Create application → Pages → Connect to Git**, selecione
o repositório e a branch a serem publicados **após aprovação**.

| Configuração                                      | Valor                     |
| ------------------------------------------------- | ------------------------- |
| Root directory neste monorepo                     | `marketing`               |
| Root directory em futuro repositório independente | raiz do novo repositório  |
| Build command                                     | `npm ci && npm run build` |
| Output directory                                  | `dist`                    |
| `NODE_VERSION`                                    | `24.20.0`                 |
| `SKIP_DEPENDENCY_INSTALL`                         | `1`                       |
| Variáveis privadas / bindings                     | nenhum                    |

O comando de instalação é `npm ci`; o flag de instalação acima evita uma segunda
instalação automática. Não usar o `dist/` do SaaS nem configurar Pages Functions.

O canonical, Open Graph e sitemap usam `https://gradefyapp.com.br/`. `_headers`
marca URLs `pages.dev` como noindex, sem aplicar essa regra ao domínio oficial.
O arquivo `404.html` impede o fallback SPA em rotas inexistentes no Pages.

Associe o domínio principal e `www.gradefyapp.com.br` em **Custom domains** do
projeto Pages. Use somente os registros e nameservers reais apresentados pelo
painel. Para o domínio principal, a zona DNS precisa estar na mesma conta
Cloudflare. Para `www`, cadastre primeiro o domínio no Pages e confirme o CNAME
indicado. Depois valide HTTPS, redirecionamento de `www` para o canonical e
headers nas URLs temporárias.

Guias oficiais: [integração Git](https://developers.cloudflare.com/pages/get-started/git-integration/),
[build](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[Node e instalação](https://developers.cloudflare.com/pages/configuration/build-image/),
[domínios](https://developers.cloudflare.com/pages/configuration/custom-domains/) e
[headers](https://developers.cloudflare.com/pages/configuration/headers/).

## Conteúdo e assets

Design baseado nas referências oficiais Gradefy: fundo escuro, violeta/ciano,
logomarca modular, fontes Sora/Inter e cards de agenda. As fontes são locais e
incluem as respectivas licenças SIL OFL.

Logos em `public/images/` são cópias dos assets oficiais. Favicon, touch icon e
imagem Open Graph derivam desses logos. Mockups são componentes React/CSS
ilustrativos, sem dados de clientes, preços ou URLs do sistema. As referências
PNG completas não são publicadas, porque incluem conteúdo fora deste escopo.

Não há analytics, captura de e-mail, políticas jurídicas inventadas, login ou
inscrições. Os nichos de expansão estão identificados como planejados.
