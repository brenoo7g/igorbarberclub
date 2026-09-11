# Nossos Trabalhos

A seção `/#galeria` apresenta apenas o título “Alguns dos nossos cortes” e fotos reais, sem filtros, legendas ou descrições. O carrossel mostra três fotos por vez no desktop, duas no tablet e uma com indicação da próxima no celular. Oferece swipe nativo, arraste com o mouse, setas sobre as fotos, indicadores clicáveis, teclado e ampliação sem textos visíveis. Respeita a preferência por movimento reduzido e não troca fotos automaticamente.

## Painel e armazenamento

A aba administrativa **Nossos Trabalhos** foi removida. A rota antiga `/admin/trabalhos` redireciona para `/admin/servicos`. A galeria pública e as fotos existentes continuam disponíveis. Não há formulário de gestão de fotos no painel.

As rotas autenticadas de manutenção permanecem no backend, com limite de 40 fotos. O servidor verifica o conteúdo, rejeita formatos inválidos, arquivos animados e imagens excessivas, remove metadados e converte em WebP. As fotos ficam na tabela `portfolio` do banco PostgreSQL/SQLite, sem depender do disco temporário da Vercel. A listagem devolve apenas metadados; imagens são carregadas separadamente, sob demanda.

Edições pela API usam `version` e retornam 409 quando alguém já alterou a foto. A seção é ocultada quando a galeria está vazia; erros de carregamento permitem nova tentativa, e fotos indisponíveis exibem um estado alternativo. Títulos continuam como textos alternativos acessíveis e categorias permanecem no banco.

## Rotas

| Método | Rota                       | Acesso / dados                                     |
| ------ | -------------------------- | -------------------------------------------------- |
| GET    | `/api/portfolio`           | Público; lista `{id,title,category,version,image}` |
| GET    | `/api/portfolio/:id/image` | Público; imagem WebP ou 404                        |
| POST   | `/api/admin/portfolio`     | Admin; `{title,category,image}` com data URI       |
| PUT    | `/api/admin/portfolio/:id` | Admin; `{title,category,version,image?}`           |
| DELETE | `/api/admin/portfolio/:id` | Admin; remove foto                                 |

As mutações exigem sessão de administrador e origem permitida. O limite de fotos é verificado dentro da transação; PostgreSQL usa lock de capacidade `789128`. Títulos e categorias são renderizados como texto.

## Fotos iniciais e deploy

As cinco fotos em `server/portfolio-photos/` vieram da pasta `posts` da exportação de `@igor_barber_club`, fornecida pelo usuário. São cópias otimizadas dos posts `CsZ7qz9r_xP`, `CscZioqrEG8`, `DI4tvCvRFjq`, `DL5cqEyRvoM` e `DPjTrL5kYii`, nessa ordem. Os originais não foram alterados.

`seedPortfolio` importa essas imagens uma única vez durante a migração, sob o lock de esquema. A tabela `content_migrations` registra a conclusão. Reiniciar ou fazer redeploy não repõe fotos removidas nem sobrescreve edições. `vercel.json` inclui `server/**` para disponibilizar o SQL e as imagens à função. Não exige variáveis de ambiente novas.

Validação: `tests/portfolio.test.js` cobre importação, permissões, formatos, limites, conflitos e remoção; `tests/e2e/portfolio.spec.js` cobre a galeria pública, erro com nova tentativa, telas de 320 a 1440 pixels, modal, teclado e swipe por eventos de toque do Chromium.
