# Nossos Trabalhos

A seção `/#galeria` usa fotos reais fornecidas pelo proprietário, com carrossel horizontal: três fotos por vez no desktop, duas no tablet e uma com indicação da próxima no celular. Oferece swipe nativo, setas, teclado, filtros por categoria, contador e ampliação em diálogo. Respeita a preferência por movimento reduzido e não troca fotos automaticamente.

## Atualizar pelo painel

Entre em `/admin/trabalhos` e escolha **Adicionar foto**. Preencha título e categoria, selecione JPG, PNG ou WebP de até 10 MB e publique. As fotos mais recentes aparecem primeiro. **Editar** permite trocar a imagem ou os textos; **Remover** pede confirmação. O limite é de 40 fotos.

O navegador reduz a resolução para até 1200 pixels. O servidor verifica o conteúdo, rejeita formatos inválidos, arquivos animados e imagens excessivas, remove metadados e converte em WebP. As fotos ficam na tabela `portfolio` do banco PostgreSQL/SQLite, com limite de upload HTTP e sem depender do disco temporário da Vercel. A listagem devolve apenas metadados; imagens são carregadas separadamente, sob demanda.

Erros preservam o formulário. Edições concorrentes usam `version` e retornam 409 quando alguém já alterou a foto. A galeria vazia direciona ao Instagram; erros de carregamento permitem nova tentativa, e fotos indisponíveis exibem um estado alternativo.

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

Validação: `tests/portfolio.test.js` cobre importação, permissões, formatos, limites, conflitos e remoção; `tests/e2e/portfolio.spec.js` cobre upload/edição/remoção, erro com nova tentativa, telas de 320 a 1440 pixels, modal, teclado e swipe por eventos de toque do Chromium.
