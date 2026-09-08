# Operação

## Antes de disponibilizar publicamente

1. Revise nome comercial, textos, referência de formação, catálogo, preços e expediente com Igor. As informações fornecidas pelo solicitante não foram verificadas com a barbearia.
2. Troque imagens conceituais por fotos autorizadas do espaço e trabalhos. O projeto não se apresenta como portfólio fotográfico real.
3. Configure banco PostgreSQL dedicado ou volume persistente para SQLite. Não publique o banco de demonstração.
4. Configure `NODE_ENV=production`, `APP_URL` HTTPS, segredo JWT aleatório e credenciais administrativas próprias. Não exponha `.env` ou arquivos de banco no diretório público.
5. Configure domínio de envio Resend e template WhatsApp aprovado. Teste as integrações com destinatários autorizados.
6. Execute build, testes e um teste integrado no banco/infraestrutura escolhidos; programe backups e restauração.

As variáveis necessárias estão em [`.env.example`](../.env.example). A configuração atual foi testada localmente em Node 24 + SQLite + Chromium. Não houve implantação pública, teste de um PostgreSQL externo ou entrega real de mensagens.

## Outbox e recuperação

`pending`: aguardando canal configurado ou nova tentativa. `sending`: trabalho adquirido pelo worker. `sent`: provedor aceitou. `failed`: cinco falhas. `review`: entrega incerta no WhatsApp.

O endpoint administrativo `/api/admin/notifications` mostra contagens. Detalhes técnicos ficam na tabela `notifications`; não exponha o payload em logs públicos. Os jobs ficam na transação da reserva para que falha de rede não reverta um agendamento válido.

Após interrupção de processo durante envio, um job pode ficar em `sending`. Consulte o provedor antes de alterar o status: marque `sent` se houver aceitação confirmada, ou coloque em `pending` se não houver entrega. Jobs `review` também exigem conferência. O worker não reenvia automaticamente um evento com resultado incerto. A chave Resend reduz duplicações dentro da janela de idempotência do provedor; WhatsApp não tem garantia de exactly-once nesta versão. Para filas maiores, integre um worker dedicado com observabilidade e reconciliação por callbacks de entrega.

Não há disparo para outras pessoas no setup local: sem credenciais os eventos permanecem na fila. Antes de ativar um canal em uma base existente, confira eventos pendentes antigos.

## Persistência e escala

- SQLite é adequado à execução local ou a uma única instância com volume persistente. Não compartilhe o arquivo entre hosts.
- PostgreSQL suporta várias instâncias da API; a agenda usa um advisory lock transacional global. É uma escolha conservadora para uma barbearia pequena. Uma operação de alta escala poderá particionar os locks por profissional e ordenar locks durante remarcação.
- O rate limiter atual usa memória por processo. Em várias instâncias, use um store compartilhado e configure `trust proxy` apenas para proxies conhecidos da implantação.
- Esquema inicial usa `CREATE TABLE IF NOT EXISTS`. A atualização de perfil adiciona automaticamente `avatar`, `profile_version` e `session_version` quando ausentes, sob transação e lock no PostgreSQL. Migrações são aditivas e preservam dados existentes.
- Sem `JWT_SECRET` no desenvolvimento, um segredo efêmero é criado e as sessões expiram ao reiniciar o servidor. Defina o segredo em `.env` para manter sessões entre reinícios.
- Não há checkout financeiro: os valores informam pagamento presencial. Não há cobrança online, lembretes programados, despesas, gerenciamento de profissionais pela interface ou recuperação de senha.

## Contas após atualização

Alterações do perfil são feitas no painel em **Meu perfil** ou na área do cliente em **Editar perfil**. Não é necessário configurar serviço de upload nem novas variáveis de ambiente. A senha administrativa das variáveis de ambiente serve apenas para criar o primeiro administrador; atualizar essas variáveis não redefine uma conta existente. Use o formulário de troca de senha enquanto estiver autenticado.

Se duas abas editarem o perfil, a segunda gravação desatualizada recebe 409. Use **Recarregar dados do perfil** para descartar o rascunho e carregar a última versão. Mudanças de e-mail ou senha encerram sessões em outros dispositivos na próxima consulta autenticada; a interface sincroniza abas e revalida a conta ao receber foco. Mensagens ainda não enviadas usam o contato atual no momento do processamento. Mensagens já enviadas não são reenviadas por uma edição de perfil.

## Referências de implementação

- [Vite — documentação oficial](https://vite.dev/guide/)
- [SQLite nativo no Node.js](https://nodejs.org/api/sqlite.html)
- [Resend — envio de e-mail](https://resend.com/docs/api-reference/emails/send-email)
- [Twilio — mensagens WhatsApp](https://www.twilio.com/docs/messaging/api/message-resource)
