# E-mails transacionais Resend

A configuração vigente está em [Fase 7F.4A.5 — integração segura](GRADEFY-FASE-7F-4A-5-EMAILS-REAIS-RESEND.md).

O padrão agora é EMAIL_DELIVERY_MODE=disabled. Preencher somente RESEND_API_KEY e EMAIL_FROM não habilita envio. Reservas, convites e recuperação compartilham a mesma política.

Para homologar, use banco exclusivo com dados fictícios, origem HTTPS, destinatários explicitamente autorizados e identificador novo de rodada. Mensagens históricas não são liberadas automaticamente. Nunca alterar a fila antiga para forçar envio.

O documento da fase contém o passo a passo de domínio/DNS, variáveis, banco isolado, procedimento A–G, templates, filas e webhooks assinados. MX do domínio raiz deve ser preservado.

A API aceita a mensagem sem comprovar entrega. Apenas um webhook assinado confirma entrega ao servidor do destinatário; a mensagem ainda pode ir para spam. A gestão acompanha em Notificações por e-mail no dashboard.

O Mini Site exige login explícito do cliente antes da seleção do serviço. O fluxo público legado da Igor/Barber Classic permanece compatível. Nenhum SMTP do Supabase é necessário: a autenticação e a recuperação continuam no backend existente.
