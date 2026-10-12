import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wallet, Plus, RefreshCw, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money } from '../lib';
import { Modal } from '../components/UI';
import { Button, Card, Feedback, Input, Loading } from './components';
import { ManagementAccess, CompanySelector } from './management';
import type { ManagementProps } from './management';
import { BusinessNav } from './business-nav';
import { PaymentPanel } from './finance-payment';
import {
  expenseCategories,
  paymentMethods,
  financialCents,
  financialDate,
  financialTime,
  FinancialPagination,
  useFinancialMutation,
} from './finance-shared';
import type { FinanceState, ExpenseDetail, ExpenseRecord } from './finance-types';
import './dashboard.css';
import './agenda.css';
import './finance.css';
const labels: Record<string, string> = {
  payment: 'Recebimento manual',
  'payment-reversal': 'Estorno de recebimento',
  expense: 'Despesa',
  'expense-reversal': 'Correção de despesa',
  received: 'Recebido manualmente',
  reversed: 'Estornado',
  pending: 'Pendente',
  paid: 'Paga',
  void: 'Anulada',
};
export default function Finance() {
  return <ManagementAccess>{(props) => <FinanceContent {...props} />}</ManagementAccess>;
}
function FinanceContent({ companyId, companies, choose }: ManagementProps) {
  const { api } = useApp(),
    [query, setQuery] = useSearchParams(),
    [data, setData] = useState<FinanceState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [type, setType] = useState('all'),
    [page, setPage] = useState(1),
    [newPayment, setNewPayment] = useState(false),
    [expenseId, setExpenseId] = useState<string | null>(null),
    [newExpense, setNewExpense] = useState(false),
    [notice, setNotice] = useState('');
  const appointmentId = query.get('atendimento');
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError('');
    if ((from && !to) || (!from && to)) {
      setBusy(false);
      setError('Informe início e fim do período.');
      return () => c.abort();
    }
    const params = new URLSearchParams({
      type,
      page: String(page),
      ...(from && to ? { from, to } : {}),
    });
    api<FinanceState>('/admin/finance?' + params, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, from, to, type, page, revision]);
  function changed() {
    setNotice('Movimentação financeira registrada com sucesso.');
    setRevision((v) => v + 1);
  }
  const metrics = data
    ? ([
        [
          'Valor previsto',
          data.metrics.expectedCents,
          'Reservas confirmadas e concluídas pela data do atendimento.',
        ],
        [
          'Serviços concluídos',
          data.metrics.completedCents,
          'Valor histórico dos atendimentos concluídos. Não comprova recebimento.',
        ],
        [
          'Pagamentos recebidos',
          data.metrics.receivedCents,
          'Recebimentos manuais menos reversões registradas no período.',
        ],
        [
          'Despesas pagas',
          data.metrics.paidExpensesCents,
          'Despesas efetivamente pagas menos correções registradas no período.',
        ],
        [
          'Saldo operacional registrado',
          data.metrics.balanceCents,
          'Recebimentos menos despesas pagas. Não representa lucro líquido.',
        ],
      ] as const)
    : [];
  return (
    <div className="gf-dashboard gf-business gf-finance">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <header className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">CLAREZA PARA SEU NEGÓCIO</div>
            <h1>Financeiro</h1>
            <p>{data?.company.name || 'Movimentações da empresa'}</p>
          </div>
          <div className="gf-agenda-actions">
            <Button disabled={!data?.editable || busy} onClick={() => setNewPayment(true)}>
              <Plus size={18} />
              Novo recebimento
            </Button>
            <Button
              disabled={!data?.editable || busy}
              variant="secondary"
              onClick={() => setNewExpense(true)}
            >
              Nova despesa
            </Button>
          </div>
        </header>
        <CompanySelector companies={companies} value={companyId} choose={choose} />
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        <Card className="gf-finance-filters">
          <Input
            label="Início do período"
            type="date"
            value={from || data?.from || ''}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to && data) setTo(data.to);
              setPage(1);
            }}
          />
          <Input
            label="Fim do período"
            type="date"
            value={to || data?.to || ''}
            onChange={(e) => {
              setTo(e.target.value);
              if (!from && data) setFrom(data.from);
              setPage(1);
            }}
          />
          <label className="gf-field">
            Tipo de lançamento
            <select
              aria-label="Tipo de lançamento"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="payments">Recebimentos e estornos</option>
              <option value="expenses">Despesas e correções</option>
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={busy}
            aria-label="Atualizar financeiro"
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw size={18} />
          </Button>
        </Card>
        {busy && !data ? (
          <Loading label="Carregando financeiro…" />
        ) : data ? (
          <>
            {!data.editable && (
              <Feedback>
                A assinatura permite consulta, mas não novos lançamentos ou correções.
              </Feedback>
            )}
            <div className="gf-finance-metrics">
              {metrics.map(([label, value, help]) => (
                <Card key={label}>
                  <Wallet size={19} />
                  <h2>{label}</h2>
                  <strong>{money(value)}</strong>
                  <p>{help}</p>
                </Card>
              ))}
            </div>
            <p className="gf-hint">
              Período: {financialDate(data.from)} a {financialDate(data.to)} ·{' '}
              {data.company.timezone}. Recebimentos e despesas seguem suas datas financeiras;
              reversões são registradas no dia da correção. Todos os registros são manuais.
            </p>
            <h2 className="gf-business-section-title">Histórico de movimentações</h2>
            {!data.items.length ? (
              <Card>
                <h3>Nenhuma movimentação neste período</h3>
                <p>
                  Registre um recebimento ou uma despesa para começar. Atendimentos concluídos não
                  geram pagamentos automaticamente.
                </p>
              </Card>
            ) : (
              <div className="gf-finance-entries">
                {data.items.map((entry) => (
                  <Card key={entry.type + entry.id} className="gf-finance-entry">
                    <div className="gf-finance-entry-heading">
                      {entry.type.startsWith('payment') ? (
                        <ArrowDownLeft size={19} />
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                      <div>
                        <small>
                          {labels[entry.type]} · {financialDate(entry.date)}
                        </small>
                        <h3>{entry.description}</h3>
                      </div>
                      <strong>{money(entry.amount_cents)}</strong>
                    </div>
                    <p>
                      {labels[entry.status]}
                      {entry.method ? ' · ' + paymentMethods[entry.method] : ''}
                      {entry.category ? ' · ' + expenseCategories[entry.category] : ''}
                    </p>
                    {entry.type === 'payment' && entry.appointment_id && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setQuery({ empresa: companyId, atendimento: entry.appointment_id! })
                        }
                      >
                        Consultar recebimento
                      </Button>
                    )}
                    {entry.type === 'expense' && (
                      <Button variant="secondary" onClick={() => setExpenseId(entry.id)}>
                        Ver despesa e histórico
                      </Button>
                    )}
                    {entry.appointment_id && (
                      <Link
                        to={
                          '/app/agenda?empresa=' +
                          encodeURIComponent(companyId) +
                          '&atendimento=' +
                          encodeURIComponent(entry.appointment_id)
                        }
                      >
                        Abrir atendimento
                      </Link>
                    )}
                  </Card>
                ))}
              </div>
            )}
            <FinancialPagination page={page} total={data.total} onPage={setPage} />
          </>
        ) : (
          <Button onClick={() => setRevision((v) => v + 1)}>Tentar novamente</Button>
        )}
        <BusinessNav companyId={companyId} mobile />
        {(newPayment || appointmentId) && (
          <div className="gf-agenda-modal">
            <Modal
              title="Recebimentos"
              onClose={() => {
                setNewPayment(false);
                setQuery({ empresa: companyId });
              }}
            >
              {appointmentId ? (
                <PaymentPanel
                  companyId={companyId}
                  appointmentId={appointmentId}
                  onChanged={changed}
                />
              ) : (
                data && (
                  <PaymentPicker
                    companyId={companyId}
                    from={data.from}
                    to={data.to}
                    changed={changed}
                  />
                )
              )}
            </Modal>
          </div>
        )}
        {newExpense && data && (
          <div className="gf-agenda-modal">
            <Modal title="Nova despesa" onClose={() => setNewExpense(false)}>
              <ExpenseForm
                companyId={companyId}
                localNow={data.localNow}
                done={() => {
                  setNewExpense(false);
                  changed();
                }}
              />
            </Modal>
          </div>
        )}
        {expenseId && (
          <ExpenseDetails
            companyId={companyId}
            id={expenseId}
            close={() => setExpenseId(null)}
            changed={changed}
          />
        )}
      </div>
    </div>
  );
}
function PaymentPicker({
  companyId,
  from,
  to,
  changed,
}: {
  companyId: string;
  from: string;
  to: string;
  changed: () => void;
}) {
  const { api } = useApp(),
    [rows, setRows] = useState<
      { id: string; client_name: string; date: string; remainingCents: number }[]
    >([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [id, setId] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    api<{ items: typeof rows; total: number }>(
      '/admin/finance/appointments?' + new URLSearchParams({ from, to, page: String(page) }),
      { headers: { 'X-Gradefy-Company-Id': companyId }, signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) {
          setRows(d.items);
          setTotal(d.total);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [api, companyId, from, to, page, revision]);
  return (
    <>
      <Feedback>{error}</Feedback>
      {loading ? (
        <Loading />
      ) : (
        <>
          <label className="gf-field">
            Atendimento associado
            <select
              aria-label="Atendimento associado"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              <option value="">Selecione um atendimento</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {financialDate(r.date)} · {r.client_name} · saldo {money(r.remainingCents)}
                </option>
              ))}
            </select>
          </label>
          {!rows.length && (
            <p>
              Nenhum atendimento confirmado ou concluído neste período. Ajuste o filtro ou abra o
              atendimento diretamente pela agenda.
            </p>
          )}
          <FinancialPagination
            page={page}
            total={total}
            onPage={(n) => {
              setPage(n);
              setId('');
            }}
          />
          {id && (
            <PaymentPanel key={id} companyId={companyId} appointmentId={id} onChanged={changed} />
          )}
        </>
      )}
      {error && <Button onClick={() => setRevision((v) => v + 1)}>Tentar novamente</Button>}
    </>
  );
}
function ExpenseForm({
  companyId,
  localNow,
  record,
  done,
}: {
  companyId: string;
  localNow: string;
  record?: ExpenseRecord;
  done: () => void;
}) {
  const [description, setDescription] = useState(record?.description || ''),
    [category, setCategory] = useState(record?.category || 'other'),
    [value, setValue] = useState(
      record ? (record.amount_cents / 100).toFixed(2).replace('.', ',') : '',
    ),
    [date, setDate] = useState(record?.date || localNow.slice(0, 10)),
    [status, setStatus] = useState('pending'),
    [paidLocal, setPaidLocal] = useState(localNow),
    [notes, setNotes] = useState(record?.notes || ''),
    [reason, setReason] = useState('');
  const mutation = useFinancialMutation(companyId, done);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const details = {
            description,
            category,
            amountCents: financialCents(value),
            date,
            notes,
          };
          void mutation.submit(
            '/admin/finance/expenses' + (record ? '/' + record.id : ''),
            record
              ? { ...details, version: record.version, reason }
              : { ...details, status, ...(status === 'paid' ? { paidLocal } : {}) },
            record ? 'PUT' : 'POST',
          );
        } catch (error) {
          mutation.setError(errorMessage(error));
        }
      }}
    >
      <Feedback>{mutation.error}</Feedback>
      <Input
        label="Descrição da despesa"
        required
        minLength={2}
        maxLength={200}
        value={description}
        disabled={mutation.busy}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="gf-field">
        Categoria
        <select
          aria-label="Categoria"
          value={category}
          disabled={mutation.busy}
          onChange={(e) => setCategory(e.target.value)}
        >
          {Object.entries(expenseCategories).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Input
        label="Valor da despesa (R$)"
        required
        inputMode="decimal"
        value={value}
        disabled={mutation.busy}
        onChange={(e) => setValue(e.target.value)}
      />
      <Input
        label="Data da despesa"
        type="date"
        required
        value={date}
        disabled={mutation.busy}
        onChange={(e) => setDate(e.target.value)}
      />
      {!record && (
        <label className="gf-field">
          Situação
          <select
            aria-label="Situação"
            value={status}
            disabled={mutation.busy}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Pendente</option>
            <option value="paid">Paga</option>
          </select>
        </label>
      )}
      {!record && status === 'paid' && (
        <Input
          label="Data e hora do pagamento"
          type="datetime-local"
          required
          max={localNow}
          value={paidLocal}
          disabled={mutation.busy}
          onChange={(e) => setPaidLocal(e.target.value)}
        />
      )}
      <p className="gf-hint">
        Datas no fuso da empresa. Despesas pendentes não afetam o saldo operacional.
      </p>
      <Input
        label="Observação da despesa (opcional)"
        maxLength={1000}
        value={notes}
        disabled={mutation.busy}
        onChange={(e) => setNotes(e.target.value)}
      />
      {record && (
        <Input
          label="Motivo da correção"
          minLength={3}
          maxLength={1000}
          required
          value={reason}
          disabled={mutation.busy}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      <Button busy={mutation.busy}>Salvar despesa</Button>
    </form>
  );
}
function ExpenseDetails({
  companyId,
  id,
  close,
  changed,
}: {
  companyId: string;
  id: string;
  close: () => void;
  changed: () => void;
}) {
  const { api } = useApp(),
    [data, setData] = useState<ExpenseDetail | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [mode, setMode] = useState('view'),
    [paidLocal, setPaidLocal] = useState(''),
    [reason, setReason] = useState('');
  const mutation = useFinancialMutation(companyId, () => {
    setMode('view');
    setRevision((v) => v + 1);
    changed();
  });
  useEffect(() => {
    const c = new AbortController();
    setError('');
    setData(null);
    api<ExpenseDetail>('/admin/finance/expenses/' + id + '?page=' + page, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, companyId, id, page, revision]);
  return (
    <div className="gf-agenda-modal">
      <Modal
        title="Despesa e histórico"
        onClose={() => {
          if (!mutation.busy) close();
        }}
      >
        <Feedback>{error}</Feedback>
        <Feedback>{mutation.error}</Feedback>
        {!data ? (
          error ? (
            <Button onClick={() => setRevision((v) => v + 1)}>Atualizar despesa</Button>
          ) : (
            <Loading />
          )
        ) : mode === 'edit' ? (
          <>
            <ExpenseForm
              companyId={companyId}
              localNow={data.localNow}
              record={data.expense}
              done={() => {
                setMode('view');
                setRevision((v) => v + 1);
                changed();
              }}
            />
            <Button variant="secondary" onClick={() => setMode('view')}>
              Voltar
            </Button>
          </>
        ) : (
          <>
            <h3>{data.expense.description}</h3>
            <p>
              {money(data.expense.amount_cents)} · {expenseCategories[data.expense.category]} ·{' '}
              {labels[data.expense.status]}
            </p>
            <p>Data da despesa: {financialDate(data.expense.date)}</p>
            {data.expense.paid_at && (
              <p>Pagamento registrado: {financialTime(data.expense.paid_at, data.timezone)}</p>
            )}
            {data.expense.notes && <p>{data.expense.notes}</p>}
            {mode === 'pay' || mode === 'void' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutation.submit(
                    '/admin/finance/expenses/' + id + '/' + mode,
                    mode === 'pay'
                      ? { version: data.expense.version, paidLocal }
                      : { version: data.expense.version, reason },
                  );
                }}
              >
                <h3>{mode === 'pay' ? 'Registrar despesa paga' : 'Anular lançamento'}</h3>
                {mode === 'pay' ? (
                  <Input
                    label="Data e hora do pagamento"
                    required
                    type="datetime-local"
                    max={data.localNow}
                    value={paidLocal}
                    disabled={mutation.busy}
                    onChange={(e) => setPaidLocal(e.target.value)}
                  />
                ) : (
                  <>
                    <p>
                      O original e o motivo serão preservados. Uma despesa paga terá sua correção
                      registrada hoje. Nenhum pagamento bancário será estornado.
                    </p>
                    <Input
                      label="Motivo da anulação"
                      minLength={3}
                      maxLength={1000}
                      required
                      value={reason}
                      disabled={mutation.busy}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </>
                )}
                <div className="gf-agenda-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={mutation.busy}
                    onClick={() => setMode('view')}
                  >
                    Voltar
                  </Button>
                  <Button busy={mutation.busy}>
                    {mode === 'pay' ? 'Confirmar despesa paga' : 'Confirmar anulação'}
                  </Button>
                </div>
              </form>
            ) : (
              data.editable &&
              data.expense.status !== 'void' && (
                <div className="gf-agenda-actions">
                  {data.expense.status === 'pending' && (
                    <>
                      <Button variant="secondary" onClick={() => setMode('edit')}>
                        Editar despesa pendente
                      </Button>
                      <Button
                        onClick={() => {
                          setPaidLocal(data.localNow);
                          setMode('pay');
                        }}
                      >
                        Marcar como paga
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setReason('');
                      setMode('void');
                    }}
                  >
                    Anular lançamento
                  </Button>
                </div>
              )
            )}
            <h3 className="gf-business-section-title">Histórico de alterações</h3>
            {data.events.map((event) => {
              const before = event.before_json
                  ? (JSON.parse(event.before_json) as ExpenseRecord)
                  : null,
                after = JSON.parse(event.after_json) as ExpenseRecord;
              return (
                <Card className="gf-finance-audit" key={event.id}>
                  <strong>
                    {
                      { create: 'Cadastro', edit: 'Correção', pay: 'Pagamento', void: 'Anulação' }[
                        event.action
                      ]
                    }
                  </strong>
                  <p>
                    {financialTime(event.created_at, data.timezone)} · Responsável:{' '}
                    {event.actor_name}
                  </p>
                  {event.reason && <p>Motivo: {event.reason}</p>}
                  {before && (
                    <p>
                      Antes: {before.description} · {money(before.amount_cents)} ·{' '}
                      {labels[before.status]}
                    </p>
                  )}
                  <p>
                    Registrado: {after.description} · {money(after.amount_cents)} ·{' '}
                    {labels[after.status]}
                  </p>
                </Card>
              );
            })}
            <FinancialPagination page={page} total={data.total} onPage={setPage} />
            <Button
              variant="secondary"
              onClick={() => {
                setMode('view');
                setRevision((v) => v + 1);
              }}
            >
              Atualizar despesa
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
