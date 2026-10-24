import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { ApiError, errorMessage, newIdempotencyKey, money } from '../lib';
import { Modal } from '../components/UI';
import { Button, Card, Feedback, Input } from './components';
import './agenda-blocks.css';

type Period = {
  from: string;
  to: string;
  fullDay: boolean;
  start?: string;
  end?: string;
  professionalId?: string;
};
type Preview = {
  period: Period;
  professional: { id: string; name: string };
  timezone: string;
  count: number;
  previewToken: string;
  appointments: {
    id: string;
    clientName: string;
    date: string;
    time: string;
    endTime: string;
    services: string[];
  }[];
};
type Notifications = {
  processed: number;
  pending: number;
  attention: number;
  configured: boolean;
  total: number;
  items: {
    appointmentId: string;
    clientName: string;
    date: string;
    time: string;
    status: string;
    attempts: number;
    reason: string;
    email?: string;
    phone?: string;
    paidCents?: number;
    error?: string;
  }[];
};
type Operation = {
  actor_id?: string;
  actor_name?: string;
  internal_notes?: string;
  id: string;
  from_date: string;
  to_date: string;
  public_reason: string;
  notifications: Notifications;
};
const reasons = [
  ['personal', 'Imprevisto pessoal do profissional.'],
  ['unavailable', 'Profissional indisponível.'],
  ['emergency', 'Emergência no estabelecimento.'],
  ['operational', 'Motivo operacional.'],
  ['other', 'Outro motivo'],
];
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const notificationLabels: Record<string, string> = {
  sent: 'Aceita pelo provedor',
  accepted: 'Aceita pelo provedor',
  delivered: 'Entregue ao servidor de e-mail',
  delayed: 'Entrega atrasada: verificar',
  rejected: 'Rejeitada: contato manual necessário',
  suppressed: 'Suprimida: contato manual necessário',
  complained: 'Marcada como spam: contato manual necessário',
  pending: 'Pendente / aguardando nova tentativa',
  sending: 'Envio em processamento',
  failed: 'Falha: requer atenção',
  review: 'Envio incerto: verificar no provedor antes de reenviar',
};
export function AgendaBlockPanel({
  companyId,
  scope,
  today,
  editable,
  professionals = [],
  onChanged,
}: {
  companyId: string;
  scope: 'professional' | 'management';
  today: string;
  editable: boolean;
  professionals?: { id: string; name: string }[];
  onChanged?: () => void;
}) {
  const { api } = useApp();
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [fullDay, setFullDay] = useState(false),
    [start, setStart] = useState('14:00'),
    [end, setEnd] = useState('15:00'),
    [pid, setPid] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null),
    [reasonCode, setReasonCode] = useState('unavailable'),
    [publicReason, setPublicReason] = useState(''),
    [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [operations, setOperations] = useState<Operation[]>([]),
    [loadError, setLoadError] = useState(''),
    [revision, setRevision] = useState(0);
  const working = useRef(false),
    attempt = useRef<{ body: string; key: string } | null>(null);
  const prefix = scope === 'professional' ? '/professional/blocks' : '/admin/agenda/blocks';
  const headers = { 'X-Gradefy-Company-Id': companyId };
  useEffect(() => {
    const c = new AbortController();
    setLoadError('');
    api<Operation[]>(prefix + '/operations', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setOperations(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setLoadError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, companyId, prefix, revision]);
  useEffect(() => {
    const refresh = () => setRevision((r) => r + 1);
    const timer = window.setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);
  async function inspect() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const period: Period = {
        from,
        to,
        fullDay,
        ...(!fullDay ? { start, end } : {}),
        ...(scope === 'management' ? { professionalId: pid } : {}),
      };
      const next = await api<Preview>(prefix + '/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify(period),
      });
      attempt.current = null;
      setPreview(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (working.current || !preview) return;
    const body = JSON.stringify({
      period: preview.period,
      previewToken: preview.previewToken,
      confirmed: true,
      reasonCode,
      ...(reasonCode === 'other' ? { publicReason } : {}),
      internalNotes: notes,
    });
    if (attempt.current && attempt.current.body !== body) {
      setError(
        'Uma tentativa anterior ficou sem resposta. Repita os mesmos dados antes de iniciar outro bloqueio.',
      );
      return;
    }
    attempt.current ||= { body, key: newIdempotencyKey() };
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string; cancelled: number; notifications: Notifications }>(
        prefix + '/confirm',
        { method: 'POST', headers: { ...headers, 'Idempotency-Key': attempt.current.key }, body },
      );
      const n = result.notifications;
      setNotice(
        `Bloqueio realizado. ${result.cancelled} agendamento(s) cancelado(s). ${n.processed} notificação(ões) aceita(s) pelo provedor, ${n.pending} pendente(s) e ${n.attention} requer(em) atenção.${!n.configured ? ' O provedor de e-mail não está configurado. Não confirme o recebimento ao cliente.' : ''}`,
      );
      setPreview(null);
      attempt.current = null;
      setRevision((r) => r + 1);
      onChanged?.();
      window.dispatchEvent(new Event('gradefy-agenda-changed'));
    } catch (e) {
      setError(errorMessage(e));
      // A definitive 4xx never committed. A network/5xx outcome must retain the exact key/body.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        attempt.current = null;
        if (e.status === 409) setPreview(null);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="gf-block-panel">
      <h2>{scope === 'professional' ? 'Bloqueio pessoal' : 'Bloquear agenda'}</h2>
      <p>
        Bloqueie algumas horas, dias inteiros ou uma semana. Revise os atendimentos afetados antes
        de confirmar qualquer cancelamento.
      </p>
      <Feedback>{error}</Feedback>
      <Feedback success>{notice}</Feedback>
      <div className="gf-block-fields">
        {scope === 'management' && (
          <label className="gf-field">
            Profissional do bloqueio
            <select
              value={pid}
              disabled={busy || !editable}
              onChange={(e) => setPid(e.target.value)}
            >
              <option value="">Escolha o profissional</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Input
          label="Data inicial do bloqueio"
          type="date"
          value={from}
          min={today}
          disabled={busy || !editable}
          onChange={(e) => {
            setFrom(e.target.value);
            if (to < e.target.value) setTo(e.target.value);
          }}
        />
        <Input
          label="Data final do bloqueio"
          type="date"
          value={to}
          min={from}
          disabled={busy || !editable}
          onChange={(e) => setTo(e.target.value)}
        />
        <label className="gf-block-toggle">
          <input
            type="checkbox"
            checked={fullDay}
            disabled={busy || !editable}
            onChange={(e) => setFullDay(e.target.checked)}
          />
          Dia inteiro
        </label>
        {!fullDay && (
          <>
            <Input
              label="Início do bloqueio pessoal"
              type="time"
              value={start}
              disabled={busy || !editable}
              onChange={(e) => setStart(e.target.value)}
            />
            <Input
              label="Fim do bloqueio pessoal"
              type="time"
              value={end}
              disabled={busy || !editable}
              onChange={(e) => setEnd(e.target.value)}
            />
          </>
        )}
      </div>
      <Button busy={busy} disabled={!editable} onClick={() => void inspect()}>
        Revisar bloqueio
      </Button>
      {preview && (
        <Modal
          title="Confirmar bloqueio e cancelamentos"
          className="gf-block-modal"
          onClose={() => {
            if (!working.current && !attempt.current) {
              setPreview(null);
              setError('');
            }
          }}
        >
          <p>
            <strong>{preview.professional.name}</strong> · {dateLabel(preview.period.from)} a{' '}
            {dateLabel(preview.period.to)} ·{' '}
            {preview.period.fullDay
              ? 'Dia inteiro'
              : `${preview.period.start} — ${preview.period.end}`}{' '}
            · {preview.timezone}
          </p>
          <p role="status">
            <strong>{preview.count} agendamento(s) afetado(s).</strong> Os atendimentos confirmados
            abaixo serão cancelados. Esta ação preserva o histórico.
          </p>
          <ul className="gf-block-impact">
            {preview.appointments.map((a) => (
              <li key={a.id}>
                <strong>{a.clientName}</strong>
                <span>
                  {dateLabel(a.date)} · {a.time} — {a.endTime}
                </span>
                <span>{a.services.join(', ')}</span>
              </li>
            ))}
          </ul>
          <label className="gf-field">
            Motivo público do cancelamento
            <select
              value={reasonCode}
              disabled={busy || Boolean(attempt.current)}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              {reasons.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {reasonCode === 'other' && (
            <Input
              label="Descreva o motivo público"
              value={publicReason}
              maxLength={300}
              disabled={busy || Boolean(attempt.current)}
              onChange={(e) => setPublicReason(e.target.value)}
            />
          )}
          <p className="gf-hint">
            Este motivo será mostrado ao cliente e enviado por e-mail. Não inclua dados médicos,
            pessoais ou sensíveis.
          </p>
          <label className="gf-field">
            Observações internas (não enviadas ao cliente)
            <textarea
              maxLength={1000}
              value={notes}
              disabled={busy || Boolean(attempt.current)}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <p>
            Pagamentos e sinais não serão apagados ou estornados. A gestão deverá analisar eventuais
            ajustes.
          </p>
          <Feedback>{error}</Feedback>
          <div className="gf-block-actions">
            <Button
              busy={busy}
              onClick={() => void confirm()}
              disabled={reasonCode === 'other' && publicReason.trim().length < 3}
            >
              {attempt.current
                ? 'Tentar confirmar novamente'
                : 'Confirmar bloqueio e cancelar reservas'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || Boolean(attempt.current)}
              onClick={() => {
                setPreview(null);
                setError('');
              }}
            >
              Desistir
            </Button>
          </div>
        </Modal>
      )}
      <section aria-label="Cancelamentos e notificações por bloqueio">
        <h3>Cancelamentos e notificações</h3>
        <p>
          “Aceita pelo provedor” não confirma entrega nem leitura. Falhas e envios incertos exigem
          acompanhamento da gestão.
        </p>
        <Button variant="secondary" onClick={() => setRevision((r) => r + 1)}>
          Atualizar notificações
        </Button>
        <Feedback>{loadError}</Feedback>
        {operations.map((op) => (
          <details className="gf-block-operation" key={op.id}>
            <summary>
              {dateLabel(op.from_date)} a {dateLabel(op.to_date)} · {op.notifications.total}{' '}
              cancelamento(s)
            </summary>
            <p>{op.public_reason}</p>
            {scope === 'management' && (
              <>
                <p>Responsável: {op.actor_name || op.actor_id}</p>
                {op.internal_notes && <p>Observações internas: {op.internal_notes}</p>}
              </>
            )}
            <div className="gf-block-counters">
              <span>Processadas: {op.notifications.processed}</span>
              <span>Pendentes: {op.notifications.pending}</span>
              <span>Exigem atenção: {op.notifications.attention}</span>
            </div>
            {!op.notifications.configured && (
              <Feedback>
                Provedor de e-mail não configurado. As mensagens não foram enviadas; configure o
                serviço ou organize contato manual.
              </Feedback>
            )}
            <ul className="gf-block-impact">
              {op.notifications.items.map((n) => (
                <li key={n.appointmentId}>
                  <strong>{n.clientName}</strong>
                  <span>
                    {dateLabel(n.date)} · {n.time}
                  </span>
                  <span>
                    {notificationLabels[n.status] || 'Verificar estado'} · {n.attempts} tentativa(s)
                  </span>
                  {n.error && <span>{n.error}</span>}
                  {scope === 'management' && (
                    <>
                      <span>
                        {n.email || 'Sem e-mail'} · {n.phone || 'Sem telefone'}
                      </span>
                      {Boolean(n.paidCents) && (
                        <strong>
                          Pagamento registrado: {money(n.paidCents!)}. Analisar reembolso/ajuste;
                          nenhum estorno automático.
                        </strong>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </Card>
  );
}
