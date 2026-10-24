import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Mail, ShieldCheck, UsersRound } from 'lucide-react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import { Button, Card, Feedback } from './components';

type Delivery = {
  source_id: string;
  delivery_id?: string;
  kind: string;
  event?: string;
  queue_status?: string;
  delivery_status?: string;
  attempts?: number;
  created_at: string;
};
type Attempt = {
  id: string;
  delivery_id: string;
  started_at: string;
  status: string;
  error_code?: string;
};
type Center = {
  configured: boolean;
  counts: Record<string, number>;
  items: Delivery[];
  attempts: Attempt[];
};
const labels: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Processando',
  processing: 'Processando',
  sent: 'Aceito pelo provedor',
  accepted: 'Aceito pelo provedor',
  delivered: 'Entregue ao servidor de e-mail',
  delayed: 'Entrega atrasada',
  rejected: 'Rejeitado',
  suppressed: 'Suprimido',
  complained: 'Marcado como spam',
  failed: 'Falha',
  review: 'Exige intervenção',
};
const notificationTitle = (item: Delivery) =>
  item.kind === 'invitation'
    ? 'Convite da equipe'
    : item.kind === 'password'
      ? 'Segurança da conta'
      : item.kind !== 'appointment'
        ? 'Aviso da conta'
        : item.event === 'cancelled'
          ? 'Cancelamento de reserva'
          : item.event === 'rescheduled'
            ? 'Remarcação de reserva'
            : 'Confirmação de reserva';
const notificationIcon = (kind: string) =>
  kind === 'invitation'
    ? UsersRound
    : kind === 'password'
      ? ShieldCheck
      : kind === 'appointment'
        ? CalendarDays
        : Mail;
export function EmailNotifications({
  companyId,
  preview = false,
}: {
  companyId: string;
  preview?: boolean;
}) {
  const { api } = useApp();
  const [data, setData] = useState<Center | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    api<Center>('/admin/email-notifications', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, companyId, revision]);
  return (
    <Card>
      {preview && (
        <div className="gf-desktop-notification-preview">
          <h2>
            <Bell size={18} /> Notificações e lembretes
          </h2>
          {error ? (
            <p role="alert">Notificações indisponíveis.</p>
          ) : data?.items.length ? (
            <ul>
              {data.items.slice(0, 3).map((item) => {
                const Icon = notificationIcon(item.kind);
                return (
                  <li key={item.kind + item.source_id}>
                    <span className="gf-desktop-notification-icon">
                      <Icon size={16} />
                    </span>
                    <span className="gf-desktop-notification-copy">
                      <strong>{notificationTitle(item)}</strong>
                      <small>
                        {labels[item.delivery_status || item.queue_status || 'pending'] ||
                          'Em processamento'}
                      </small>
                    </span>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="gf-desktop-notification-empty">
              {busy
                ? 'Carregando notificações…'
                : 'Nenhuma notificação recente. Os avisos de e-mail aparecerão aqui.'}
            </p>
          )}
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Notificações por e-mail</summary>
        <p>
          Aceito pelo provedor não comprova recebimento. Entrega confirmada significa que o servidor
          de e-mail recebeu a mensagem; ela ainda pode ir para spam.
        </p>
        <Button variant="secondary" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          {busy ? 'Atualizando…' : 'Atualizar notificações'}
        </Button>
        {error && <Feedback>{error}</Feedback>}
        {data && (
          <>
            {!data.configured && (
              <Feedback>
                Envio desabilitado ou configuração incompleta. Cancelamentos pendentes podem exigir
                contato manual.
              </Feedback>
            )}
            <ul>
              {Object.entries(data.counts).map(([status, count]) => (
                <li key={status}>
                  {labels[status] || status}: {count}
                </li>
              ))}
            </ul>
            <p>
              Últimas 100 mensagens. Falhas, rejeições e itens que exigem intervenção precisam ser
              conferidos pela gestão.
            </p>
            {data.items.map((item) => (
              <details key={item.kind + item.source_id}>
                <summary>
                  {item.kind === 'invitation'
                    ? 'Convite'
                    : item.kind === 'password'
                      ? 'Segurança da conta'
                      : item.event === 'cancelled'
                        ? 'Cancelamento'
                        : item.event === 'rescheduled'
                          ? 'Remarcação'
                          : 'Confirmação'}{' '}
                  · {labels[item.delivery_status || item.queue_status || 'pending']} ·{' '}
                  {new Date(item.created_at).toLocaleString('pt-BR')}
                </summary>
                {item.kind === 'appointment' && (
                  <p>
                    Referência da notificação:{' '}
                    <span style={{ overflowWrap: 'anywhere' }}>{item.source_id}</span>
                  </p>
                )}
                <ul>
                  {data.attempts
                    .filter((a) => a.delivery_id === item.delivery_id)
                    .map((a) => (
                      <li key={a.id}>
                        {new Date(a.started_at).toLocaleString('pt-BR')} — {labels[a.status]}
                        {a.error_code ? ' (' + a.error_code + ')' : ''}
                      </li>
                    ))}
                </ul>
                {item.queue_status === 'review' ||
                ['failed', 'review', 'rejected', 'suppressed', 'complained'].includes(
                  item.delivery_status || item.queue_status || '',
                ) ? (
                  <p>Confira a reserva na agenda e contate o cliente manualmente, se necessário.</p>
                ) : null}
              </details>
            ))}
          </>
        )}
      </details>
    </Card>
  );
}
