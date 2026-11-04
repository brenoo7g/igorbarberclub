import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  ReceiptText,
  Scale,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money } from '../lib';
import { Button, Card, Feedback } from './components';
import { financialDate, FinancialPagination, paymentMethods } from './finance-shared';
import type { FinanceState, FinancialEntry } from './finance-types';
import { ReportChart } from './reports-charts';
import type { ReportState } from './reports-types';
import './reports.css';
import './finance-desktop.css';

const typeName: Record<FinancialEntry['type'], string> = {
  payment: 'Recebimento manual',
  'payment-reversal': 'Estorno manual',
  expense: 'Despesa',
  'expense-reversal': 'Correção de despesa',
};

export function financeMovement(entry: FinancialEntry) {
  if (entry.type === 'payment') return { text: '+' + money(entry.amount_cents), kind: 'positive' };
  if (entry.type === 'payment-reversal')
    return { text: '−' + money(Math.abs(entry.amount_cents)), kind: 'negative' };
  if (entry.type === 'expense-reversal')
    return { text: '+' + money(Math.abs(entry.amount_cents)), kind: 'positive' };
  if (entry.status === 'paid') return { text: '−' + money(entry.amount_cents), kind: 'negative' };
  return { text: money(entry.amount_cents), kind: 'pending' };
}

export function FinanceDesktop({
  companyId,
  data,
  page,
  onPage,
  onPayment,
  onExpense,
}: {
  companyId: string;
  data: FinanceState;
  page: number;
  onPage: (page: number) => void;
  onPayment: (appointmentId: string) => void;
  onExpense: (expenseId: string) => void;
}) {
  const { api } = useApp();
  const [report, setReport] = useState<ReportState | null>(null);
  const [chartError, setChartError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setChartError('');
    const query = new URLSearchParams({
      area: 'finance',
      period: 'custom',
      from: data.from,
      to: data.to,
    });
    api<ReportState>('/admin/reports?' + query, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setChartError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [api, companyId, data.from, data.to]);

  const metrics = [
    {
      title: 'Recebimentos registrados',
      value: data.metrics.receivedCents,
      help: 'Entradas manuais líquidas no período.',
      icon: Wallet,
    },
    {
      title: 'Despesas pagas',
      value: data.metrics.paidExpensesCents,
      help: 'Saídas pagas líquidas no período.',
      icon: ReceiptText,
    },
    {
      title: 'Saldo operacional',
      value: data.metrics.balanceCents,
      help: 'Entradas menos saídas; não é lucro.',
      icon: Scale,
    },
    {
      title: 'Valor previsto',
      value: data.metrics.expectedCents,
      help: 'Reservas confirmadas e concluídas.',
      icon: CalendarClock,
    },
  ];
  const methodTotals = data.methodTotals ?? [];
  const methodPeak = Math.max(1, ...methodTotals.map((item) => Math.abs(item.amountCents)));
  return (
    <div className="gf-finance-desktop">
      <div className="gf-finance-desktop-metrics">
        {metrics.map(({ title, value, help, icon: Icon }, index) => (
          <Card key={title} className={'gf-finance-desktop-metric is-' + index}>
            <Icon size={24} aria-hidden="true" />
            <div>
              <span>{title}</span>
              <strong>{money(value)}</strong>
              <small>{help}</small>
            </div>
          </Card>
        ))}
      </div>
      <div className="gf-finance-desktop-workspace">
        <div className="gf-finance-desktop-primary">
          <div className="gf-finance-desktop-chart">
            {report?.financialSeries ? (
              <ReportChart
                title="Recebimentos e despesas no período"
                rows={report.financialSeries}
                monetary
                compact
                series={[
                  { key: 'receivedCents', label: 'Recebimentos manuais', color: '#8e5cf6' },
                  { key: 'paidExpensesCents', label: 'Despesas pagas', color: '#19bdf2' },
                ]}
              />
            ) : (
              <Card>
                <h2>Recebimentos e despesas no período</h2>
                <Feedback>{chartError}</Feedback>
                {!chartError && <p>Carregando série financeira…</p>}
              </Card>
            )}
          </div>
          <Card className="gf-finance-desktop-history">
            <div className="gf-finance-desktop-heading">
              <div>
                <h2>Histórico de movimentações</h2>
                <p>{data.total} lançamento(s) no filtro atual · registros manuais</p>
              </div>
              <span>
                {financialDate(data.from)} a {financialDate(data.to)}
              </span>
            </div>
            {data.items.length ? (
              <div
                className="gf-finance-desktop-table-scroll"
                role="region"
                aria-label="Movimentações financeiras"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th>Método</th>
                      <th>Valor</th>
                      <th>Situação</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => {
                      const amount = financeMovement(entry);
                      return (
                        <tr key={entry.type + entry.id}>
                          <td>{financialDate(entry.date)}</td>
                          <td className="gf-finance-desktop-description">{entry.description}</td>
                          <td>
                            <span className="gf-finance-desktop-type">
                              {entry.type.startsWith('payment') ? (
                                <ArrowDownLeft size={14} />
                              ) : (
                                <ArrowUpRight size={14} />
                              )}
                              {typeName[entry.type]}
                            </span>
                          </td>
                          <td>{entry.method ? paymentMethods[entry.method] : '—'}</td>
                          <td className={'gf-finance-desktop-amount ' + amount.kind}>
                            {amount.text}
                          </td>
                          <td>
                            <span className={'gf-finance-desktop-status is-' + entry.status}>
                              {entry.status === 'received'
                                ? 'Recebido'
                                : entry.status === 'reversed'
                                  ? 'Estornado'
                                  : entry.status === 'paid'
                                    ? 'Paga'
                                    : entry.status === 'void'
                                      ? 'Anulada'
                                      : 'Pendente'}
                            </span>
                          </td>
                          <td>
                            {entry.type === 'expense' ? (
                              <button type="button" onClick={() => onExpense(entry.id)}>
                                Detalhes
                              </button>
                            ) : entry.appointment_id ? (
                              <button
                                type="button"
                                onClick={() => onPayment(entry.appointment_id!)}
                              >
                                Atendimento
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="gf-finance-desktop-empty">
                Nenhuma movimentação neste período. Atendimentos não geram recebimentos
                automaticamente.
              </p>
            )}
            <FinancialPagination page={page} total={data.total} onPage={onPage} />
          </Card>
        </div>
        <aside className="gf-finance-desktop-aside">
          <Card>
            <div className="gf-finance-desktop-heading">
              <h2>Receitas e despesas</h2>
              <CreditCard size={19} />
            </div>
            <p>Valores registrados no período financeiro selecionado.</p>
            <div className="gf-finance-desktop-comparison">
              <span>
                Recebimentos <strong>{money(data.metrics.receivedCents)}</strong>
              </span>
              <span>
                Despesas pagas <strong>{money(data.metrics.paidExpensesCents)}</strong>
              </span>
            </div>
          </Card>
          <Card className="gf-finance-desktop-balance">
            <div className="gf-finance-desktop-heading">
              <h2>Situação financeira</h2>
              <Scale size={19} />
            </div>
            <span>Saldo operacional registrado</span>
            <strong>{money(data.metrics.balanceCents)}</strong>
            <p>
              Serviços concluídos: {money(data.metrics.completedCents)} em valor histórico. Esse
              total não comprova pagamento nem lucro.
            </p>
          </Card>
          <Card>
            <div className="gf-finance-desktop-heading">
              <h2>Formas de pagamento</h2>
              <Wallet size={19} />
            </div>
            <p>Recebimentos manuais líquidos, incluindo estornos pela data da correção.</p>
            {methodTotals.length ? (
              <div className="gf-finance-desktop-methods">
                {methodTotals.map((item) => (
                  <div key={item.method}>
                    <span>
                      {paymentMethods[item.method] || item.method}
                      <strong>{money(item.amountCents)}</strong>
                    </span>
                    <i aria-hidden="true">
                      <b style={{ width: `${(100 * Math.abs(item.amountCents)) / methodPeak}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhum recebimento manual no período.</p>
            )}
            <Link
              to={
                '/app/relatorios?' +
                new URLSearchParams({
                  empresa: companyId,
                  area: 'finance',
                  period: 'custom',
                  from: data.from,
                  to: data.to,
                  type: 'payments',
                })
              }
            >
              Analisar por método nos relatórios →
            </Link>
          </Card>
          <Card className="gf-finance-desktop-note">
            <h2>Lançamentos manuais</h2>
            <p>
              Pix, cartão e dinheiro são formas informadas pela gestão. O Gradefy não confirma
              transações bancárias.
            </p>
            <Button variant="secondary" onClick={() => onPage(1)}>
              Voltar ao início do histórico
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
