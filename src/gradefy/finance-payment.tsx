import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import { errorMessage, money } from '../lib';
import { Button, Card, Feedback, Input, Loading } from './components';
import {
  financialCents,
  financialTime,
  paymentMethods,
  useFinancialMutation,
  FinancialPagination,
} from './finance-shared';
import type { PaymentDetail } from './finance-types';
import './finance.css';
export function PaymentPanel({
  companyId,
  appointmentId,
  onChanged,
}: {
  companyId: string;
  appointmentId: string;
  onChanged?: () => void;
}) {
  const { api } = useApp(),
    [data, setData] = useState<PaymentDetail | null>(null),
    [loadError, setLoadError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1);
  const [show, setShow] = useState(false),
    [value, setValue] = useState(''),
    [receivedLocal, setReceivedLocal] = useState(''),
    [method, setMethod] = useState('pix'),
    [notes, setNotes] = useState(''),
    [reversing, setReversing] = useState<string | null>(null),
    [reason, setReason] = useState(''),
    [notice, setNotice] = useState('');
  const mutation = useFinancialMutation(companyId, () => {
    setShow(false);
    setReversing(null);
    setNotice('Registro financeiro salvo. Nenhuma operação bancária foi realizada.');
    setRevision((v) => v + 1);
    window.dispatchEvent(new Event('gradefy-finance-changed'));
    onChanged?.();
  });
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setLoadError('');
    api<PaymentDetail>(
      '/admin/finance/appointments/' + encodeURIComponent(appointmentId) + '?page=' + page,
      { headers: { 'X-Gradefy-Company-Id': companyId }, signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setLoadError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [api, companyId, appointmentId, page, revision]);
  if (loading) return <Loading label="Carregando recebimentos…" />;
  if (!data)
    return (
      <>
        <Feedback>{loadError}</Feedback>
        <Button onClick={() => setRevision((v) => v + 1)}>Atualizar recebimentos</Button>
      </>
    );
  return (
    <section className="gf-finance-payment" aria-label="Recebimentos do atendimento">
      <h3>Recebimentos do atendimento</h3>
      <p>
        {data.appointment.client_name} · {data.appointment.professional_name}
      </p>
      <dl className="gf-finance-balances">
        <div>
          <dt>Valor histórico</dt>
          <dd>{money(data.totalCents)}</dd>
        </div>
        <div>
          <dt>Recebido registrado</dt>
          <dd>{money(data.receivedCents)}</dd>
        </div>
        <div>
          <dt>Saldo restante</dt>
          <dd>{money(data.remainingCents)}</dd>
        </div>
      </dl>
      <p className="gf-hint">
        Registro manual do estabelecimento. Não confirmado por instituição financeira. Concluir ou
        cancelar o atendimento não altera estes registros.
      </p>
      <Feedback success>{notice}</Feedback>
      <Feedback>{mutation.error}</Feedback>
      {!data.items.length && <p>Nenhum pagamento registrado.</p>}
      {data.items.map((p) => (
        <Card className="gf-finance-payment-row" key={p.id}>
          <strong>
            {money(p.amount_cents)} · {paymentMethods[p.method]}
          </strong>
          <p>
            {financialTime(p.received_at, data.timezone)} ·{' '}
            {p.reversal_id ? 'Estornado no registro' : 'Recebido manualmente'}
          </p>
          {p.notes && <p>{p.notes}</p>}
          <p>Registrado por {p.created_by_name}</p>
          {p.reversal_id && (
            <p>
              Estorno: {p.reversal_reason} · {financialTime(p.reversed_at!, data.timezone)}
              {' · '}Responsável: {p.reversed_by_name}
            </p>
          )}
          <Link
            to={
              '/app/agenda?empresa=' +
              encodeURIComponent(companyId) +
              '&atendimento=' +
              encodeURIComponent(appointmentId)
            }
          >
            Ver atendimento na agenda
          </Link>
          {data.editable && !p.reversal_id && (
            <Button
              disabled={mutation.busy}
              variant="secondary"
              onClick={() => {
                setShow(false);
                setReason('');
                setReversing(p.id);
                mutation.setError('');
              }}
            >
              Estornar registro
            </Button>
          )}
        </Card>
      ))}
      <FinancialPagination page={page} total={data.total} onPage={setPage} />
      {reversing ? (
        <Card>
          <h3>Confirmar estorno manual</h3>
          <p>
            O lançamento original será preservado. A reversão será registrada hoje, com seu usuário
            e motivo. Nenhum valor será devolvido pelo Gradefy.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.submit('/admin/finance/payments/' + reversing + '/reverse', { reason });
            }}
          >
            <Input
              label="Motivo do estorno"
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              disabled={mutation.busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="gf-agenda-actions">
              <Button
                variant="secondary"
                disabled={mutation.busy}
                type="button"
                onClick={() => setReversing(null)}
              >
                Voltar
              </Button>
              <Button busy={mutation.busy}>Confirmar estorno</Button>
            </div>
          </form>
        </Card>
      ) : show ? (
        <Card>
          <h3>Registrar recebimento</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void mutation.submit('/admin/finance/payments', {
                  appointmentId,
                  amountCents: financialCents(value),
                  expectedReceivedCents: data.receivedCents,
                  receivedLocal,
                  method,
                  notes,
                });
              } catch (error) {
                mutation.setError(errorMessage(error));
              }
            }}
          >
            <Input
              label="Valor recebido (R$)"
              inputMode="decimal"
              required
              value={value}
              disabled={mutation.busy}
              onChange={(e) => setValue(e.target.value)}
            />
            <Input
              label="Data e hora do recebimento"
              type="datetime-local"
              required
              value={receivedLocal}
              max={data.localNow}
              disabled={mutation.busy}
              onChange={(e) => setReceivedLocal(e.target.value)}
            />
            <p className="gf-hint">Fuso da empresa: {data.timezone}</p>
            <label className="gf-field">
              Forma de pagamento
              <select
                aria-label="Forma de pagamento"
                value={method}
                disabled={mutation.busy}
                onChange={(e) => setMethod(e.target.value)}
              >
                {Object.entries(paymentMethods).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Observação do recebimento (opcional)"
              maxLength={1000}
              value={notes}
              disabled={mutation.busy}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="gf-agenda-actions">
              <Button
                variant="secondary"
                type="button"
                disabled={mutation.busy}
                onClick={() => setShow(false)}
              >
                Voltar
              </Button>
              <Button busy={mutation.busy}>Salvar recebimento manual</Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="gf-agenda-actions">
          {data.editable && data.canReceive && (
            <Button
              onClick={() => {
                setReversing(null);
                setValue((data.remainingCents / 100).toFixed(2).replace('.', ','));
                setReceivedLocal(data.localNow);
                setNotes('');
                setShow(true);
                mutation.setError('');
              }}
            >
              Registrar recebimento
            </Button>
          )}
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Atualizar recebimentos
          </Button>
        </div>
      )}
      {!data.canReceive && data.remainingCents > 0 && (
        <p>
          Este atendimento está cancelado ou ausente e não admite novos recebimentos. O histórico
          permanece disponível.
        </p>
      )}
    </section>
  );
}
