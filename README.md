# Igor Barber Club

Aplicação full-stack em português para a barbearia de Igor Borges, em Campo Grande, RJ. React 19 + TypeScript + Vite, API Express 5, autenticação JWT em cookie HttpOnly e SQL persistente. Interface autoral em CSS responsivo, sem dependência de Tailwind.

## Executar

Requisito: **Node.js 24 ou superior**.

```sh
npm install
npm run dev
```

No PowerShell com execução de scripts desabilitada, use `npm.cmd` e `npx.cmd`.

- Site: http://localhost:5173
- API: http://localhost:3001/api/health
- Administração: http://localhost:5173/admin
- Banco local: `data/barber.db`, criado automaticamente com SQLite nativo do Node.

### Contas locais de demonstração

| Perfil        | E-mail                      | Senha            |
| ------------- | --------------------------- | ---------------- |
| Administrador | admin@igorbarberclub.com.br | IgorDemo2026!    |
| Cliente       | cliente@example.com         | ClienteDemo2026! |

O modo de demonstração existe somente fora de produção e pode ser desativado com `DEMO_MODE=false`. Os clientes, atendimentos, preços e horários iniciais são exemplos, identificados no painel. Não use esse banco de demonstração em produção. As imagens são ilustrações geradas, e não fotos reais de Igor ou da barbearia; os links do site levam ao Instagram informado pelo solicitante. O endereço completo e o telefone comercial não foram inventados. Substitua os valores e imagens por informações aprovadas antes de publicar.

## Recursos

- Landing page com serviços vindos do banco, galeria filtrável e ampliação em diálogo acessível.
- Agendamento em três etapas, com um serviço por reserva, escolha do profissional, disponibilidade real e cadastro somente na confirmação.
- Na confirmação, **Continuar Sem Login** permite reservar com nome e sobrenome, telefone e e-mail, sem criar conta. A reserva aparece na agenda do administrador e recebe as notificações configuradas.
- Conta do cliente com histórico, cancelamento e remarcação de reservas futuras.
- Meu perfil para clientes e administradores: nome de exibição, e-mail, WhatsApp, foto e troca de senha com confirmação da senha atual.
- Painel protegido por autenticação e papel de administrador, com calendário diário, semanal e mensal.
- Atualização de status, bloqueios de intervalo ou expediente e CRUD de serviços com exclusão lógica.
- Receita diária, semanal, mensal e anual; ticket médio; melhores dias por receita e movimento; serviços mais vendidos; gráfico de 14 dias e exportação CSV.
- Fila transacional persistente de confirmação, cancelamento e remarcação para Resend e Twilio WhatsApp.
- Preços em centavos, histórico de preços/duração por reserva, validação de dados e proteção de concorrência no servidor.
- Layout para celular, tablet e desktop; foco visível, navegação por teclado, diálogos nativos e respeito a movimento reduzido.

## Estrutura

```text
src/
  main.tsx                  Rotas, carregamento por demanda e providers
  context.tsx               Sessão, configuração pública e avisos
  lib.ts                    Cliente HTTP e formatação brasileira
  types.ts                  Tipos compartilhados da interface
  components/
    Layout.tsx              Cabeçalho, navegação e rodapé
    UI.tsx                  Diálogos, estados, identidade e utilitários
    AuthForm.tsx            Login e cadastro
  pages/
    Home.tsx                Landing page
    Booking.tsx             Agendamento e remarcação
    Account.tsx             Conta e histórico do cliente
    Profile.tsx             Edição de perfil e segurança para cliente e administrador
    Admin.tsx               Agenda, serviços e financeiro
  styles.css                Sistema visual e responsividade pública
  admin.css                 Layout administrativo responsivo
server/
  index.js                  Inicialização e configuração de produção
  app.js                    Rotas REST, validação, autenticação e autorização
  profile.js                Edição da própria conta, processamento da foto e revogação de sessões
  database.js               Adaptadores SQLite e PostgreSQL, transações
  guest-migration.js        Migração de reservas existentes para aceitar visitantes
  schema.sql                Modelos, relacionamentos e índices
  seed.js                   Catálogo, profissional, administrador e demo
  domain.js                 Disponibilidade, calendário e cálculos financeiros
  notifications.js          Outbox e entrega aos provedores
public/images/              Imagens WebP locais e originais PNG
tests/                      Testes de domínio, integração HTTP e navegador
docs/                       Contrato HTTP, operação, modelo e imagens
```

## Configuração e PostgreSQL

### Agenda, almoço e abertura de semanas

Abra **Agenda → Configurar agenda** para definir dias ativos, expediente e intervalos por profissional. O modo automático libera uma janela de dias de funcionamento; o modo manual abre semanas pelo botão **Liberar próxima semana** e oferece um link para divulgação no WhatsApp. Todas as reservas revalidam essas regras. Veja [configuração, rotas e QA da agenda](docs/SCHEDULE.md).

### Nossos Trabalhos

O carrossel “Alguns dos nossos cortes” apresenta fotos reais, sem legendas ou filtros, com navegação por toque, arraste, setas, indicadores de posição e botão para o Instagram. A aba administrativa Nossos Trabalhos foi removida; o endereço antigo `/admin/trabalhos` redireciona para Serviços. As fotos continuam no banco e na página inicial. Veja [rotas do portfólio](docs/PORTFOLIO.md).

### Perfil da conta

No painel, abra **Meu perfil** (`/admin/perfil`). Clientes usam **Minha conta → Editar perfil** (`/minha-conta/perfil`). A foto aceita JPG, PNG ou WebP de até 5 MB, tem prévia e remoção, e só é aplicada ao salvar. O navegador prepara o recorte; o servidor valida e converte a imagem para WebP 256×256, armazenada no próprio banco, sem depender do disco temporário da Vercel.

Trocar e-mail exige a senha atual. Trocar senha exige a senha atual e confirmação da nova senha (mínimo de 12 caracteres para administrador, 8 para cliente e máximo de 72 bytes). A sessão que fez a alteração é renovada; outras sessões são invalidadas ao trocar e-mail ou senha. Conflitos entre abas retornam um aviso e permitem recarregar os dados sem sobrescrever silenciosamente outra edição. Falhas ao salvar mantêm o formulário preenchido para nova tentativa.

As colunas de perfil são adicionadas automaticamente a bancos existentes, preservando contas e reservas. `ADMIN_EMAIL` e `ADMIN_PASSWORD` criam somente o primeiro administrador; um redeploy não redefine nome, foto, e-mail ou senha. As informações do profissional no catálogo e os textos da barbearia são cadastros separados do perfil pessoal.

### Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste as variáveis. Sem `DATABASE_URL`, o banco é SQLite. Com uma URL PostgreSQL, o mesmo esquema SQL é criado automaticamente:

```dotenv
DATABASE_URL=postgresql://usuario:senha@localhost:5432/igor_barber_club
JWT_SECRET=use-um-segredo-aleatorio-com-ao-menos-32-caracteres
ADMIN_EMAIL=seu-email@exemplo.com
ADMIN_PASSWORD=senha-forte-com-pelo-menos-12-caracteres
DEMO_MODE=false
APP_URL=https://seu-dominio.com.br
```

Para gerar um segredo localmente: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

O adaptador usa consultas parametrizadas, transações e conexão dedicada no PostgreSQL. Alterações na agenda usam um advisory lock transacional comum aos processos para impedir sobreposição, inclusive durante remarcações. SQLite serializa operações na conexão e usa `BEGIN IMMEDIATE`. O adaptador PostgreSQL está implementado, mas a validação automatizada local usa SQLite; execute a suíte em um banco PostgreSQL dedicado antes de implantar com esse provedor.

## Build e produção

**Na Vercel:** siga [o guia de configuração](docs/VERCEL.md). `vercel.json` e `api/index.js` publicam a API junto com o frontend e permitem recarregar páginas internas. Configure PostgreSQL, segredo JWT e conta administrativa nas variáveis do projeto; o SQLite local não é um banco persistente na Vercel.

```sh
npm run build
npm start
```

Depois do build, Express também serve a SPA em sua porta (3001 por padrão), incluindo fallback para URLs internas. Configure `APP_URL` com a origem exata usada no navegador. Em produção, defina `NODE_ENV=production`, use HTTPS no proxy reverso e um banco novo, sem dados demo. `JWT_SECRET` forte e `APP_URL` HTTPS são obrigatórios. O cookie de sessão passa a exigir HTTPS. O administrador inicial é criado a partir de `ADMIN_EMAIL` e `ADMIN_PASSWORD`; mudar essas variáveis depois não altera uma conta já existente.

`OPEN_HOUR` e `CLOSE_HOUR` definem o expediente inicial de segunda a sábado enquanto não houver configuração salva para o profissional (padrão de exemplo: 09h–19h). A configuração pelo painel passa a definir dias ativos, expediente e intervalos. Os slots seguem a soma das durações selecionadas e recomeçam após almoço, reservas e bloqueios, respeitando o fechamento. Reservas existentes preservam a duração original. Novas reservas seguem a janela automática de dias de funcionamento ou as semanas liberadas manualmente, conforme [as regras de agenda](docs/SCHEDULE.md). Horários são exibidos em `America/Sao_Paulo`; os instantes usam o offset de Brasília (`-03:00`). Se houver mudança legal de fuso, atualize a conversão de instantes.

## Notificações

Para ativar confirmações completas por e-mail na Vercel, siga o [passo a passo do Resend](docs/RESEND.md).

Reservas sem login lembram os contatos e permitem consultar o histórico, cancelar ou remarcar no mesmo navegador, com sessão persistente de 90 dias renovada durante o uso. A opção **Esquecer este dispositivo** revoga esse acesso sem cancelar reservas. Reservas autenticadas continuam disponíveis na conta. Veja [o fluxo sem login e suas regras](docs/GUEST_BOOKING.md).

Configure as credenciais somente no servidor:

```dotenv
RESEND_API_KEY=...
EMAIL_FROM=Igor Barber Club <agenda@seu-dominio.com.br>
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+...
TWILIO_CONTENT_SID=HX...
```

O domínio de envio do Resend precisa estar validado. O WhatsApp usa template aprovado no Twilio com variáveis `1=nome`, `2=evento`, `3=data e hora`, `4=URL da conta`. Esse template deve mencionar a Igor Barber Club e orientar o cliente a acessar a conta para cancelar/remarcar. O destino do link requer login do proprietário da reserva.

A gravação da reserva e dos dois eventos de notificação ocorre na mesma transação. O worker local consulta a fila a cada 15 segundos; na Vercel, lotes são vinculados às requisições com `waitUntil`, conforme o [guia de publicação](docs/VERCEL.md). Canais sem credenciais permanecem pendentes, sem simulação de envio. Falhas têm até cinco tentativas com atraso exponencial; o Resend recebe chave de idempotência por evento. Timeouts de WhatsApp são marcados para revisão, para evitar reenvio cego. `sent` significa aceitação pelo provedor, não leitura ou entrega final ao destinatário. Nenhuma mensagem real foi enviada durante os testes.

Consulte [operação e limitações](docs/OPERATIONS.md) para monitoramento, recuperação e preparação da implantação. Implementação baseada na documentação oficial de [Resend](https://resend.com/docs/api-reference/emails/send-email) e [Twilio](https://www.twilio.com/docs/messaging/api/message-resource).

## Verificar

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

A suíte de navegador serve o build em `127.0.0.1:4173` com banco em memória independente, sem afetar o banco local. Ela percorre cadastro, reserva, remarcação, cancelamento, login administrativo, calendários, CRUD, exportação e visualização móvel. Capturas são gravadas em `test-results/`.

Mais detalhes: [rotas e modelos](docs/ARCHITECTURE.md), [operação](docs/OPERATIONS.md), [prompts e origem das imagens](docs/IMAGES.md).
