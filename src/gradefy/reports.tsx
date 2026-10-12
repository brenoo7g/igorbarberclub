import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, RefreshCw, ChartNoAxesCombined } from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage, money, statusLabels } from '../lib';
import { Button, Card, Feedback, Input, Loading } from './components';
import { BusinessNav } from './business-nav';
import { ManagementAccess, CompanySelector } from './management';
import type { ManagementProps } from './management';
import { financialDate, FinancialPagination, paymentMethods } from './finance-shared';
import { ReportChart, ServiceChart } from './reports-charts';
import type { ReportArea, ReportState } from './reports-types';
import './dashboard.css';
import './agenda.css';
import './finance.css';
import './reports.css';
const areas: Record<ReportArea, string> = {
  overview: 'Visão geral',
  finance: 'Financeiro',
  appointments: 'Atendimentos',
  services: 'Serviços',
  professionals: 'Profissionais',
};
const periods: Record<string, string> = {
  today: 'Hoje',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  month: 'Mês atual',
  'previous-month': 'Mês anterior',
  custom: 'Período personalizado',
};
const counts: Record<string, string> = {
  total: 'Total de agendamentos',
  confirmed: 'Confirmados',
  completed: 'Concluídos',
  cancelled: 'Cancelados',
  noShow: 'Não compareceu',
  future: 'Futuros confirmados',
};
const moneyLabels: Record<string, string> = {
  expectedCents: 'Valor previsto',
  completedCents: 'Serviços concluídos',
  receivedCents: 'Recebimentos registrados',
  paidExpensesCents: 'Despesas pagas',
  balanceCents: 'Saldo operacional registrado',
};
export default function Reports() {
  return <ManagementAccess>{(p) => <ReportContent {...p} />}</ManagementAccess>;
}
function ReportContent({ companyId, companies, choose }: ManagementProps) {
  const { api } = useApp(),
    [query, setQuery] = useSearchParams();
  const [snapshot, setData] = useState<ReportState | null>(null),
    [requestSignature, setRequestSignature] = useState<string | null>(null),
    [error, setError] = useState(''),
    [loading, setBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [exportBusy, setExportBusy] = useState(false),
    [notice, setNotice] = useState('');
  const area = (query.get('area') || 'overview') as ReportArea,
    period = query.get('period') || 'month';
  const [from, setFrom] = useState(query.get('from') || ''),
    [to, setTo] = useState(query.get('to') || '');
  const params = new URLSearchParams(query);
  params.delete('empresa');
  const signature = params.toString();
  const data = requestSignature === signature ? snapshot : null;
  const busy = loading || requestSignature !== signature;
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setRequestSignature(signature);
    setData(null);
    setError('');
    setNotice('');
    api<ReportState>('/admin/reports?' + signature, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, signature, revision]);
  useEffect(() => {
    setFrom(query.get('from') || '');
    setTo(query.get('to') || '');
  }, [query]);
  function change(values: Record<string, string>, clear = false) {
    const next = clear
      ? new URLSearchParams({
          empresa: companyId,
          period,
          ...(period === 'custom'
            ? { from: query.get('from') || '', to: query.get('to') || '' }
            : {}),
        })
      : new URLSearchParams(query);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    if (values.period === 'custom' && data) {
      next.set('from', data.from);
      next.set('to', data.to);
    }
    if (next.get('period') !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    setQuery(next);
  }
  async function download() {
    if (!data || busy || exportBusy) return;
    setExportBusy(true);
    setNotice('');
    setError('');
    try {
      const exportFilters = new URLSearchParams(params);
      exportFilters.set('period', 'custom');
      exportFilters.set('from', data.from);
      exportFilters.set('to', data.to);
      exportFilters.delete('page');
      const response = await fetch('/api/admin/reports/export?' + exportFilters, {
        credentials: 'same-origin',
        headers: { 'X-Gradefy-Company-Id': companyId },
      });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
        const body = await response.json();
        throw new ApiError(body.error || 'Não foi possível exportar.', response.status);
      }
      if (!response.headers.get('content-type')?.includes('text/csv'))
        throw new Error('Resposta de exportação inválida. Atualize o relatório.');
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `gradefy-${area}-${data.from}-${data.to}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV exportado com todos os resultados dos filtros selecionados.');
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Não foi possível conectar ao servidor. Tente exportar novamente.'
          : errorMessage(e),
      );
    } finally {
      setExportBusy(false);
    }
  }
  const operational = ['appointments', 'services', 'professionals'].includes(area);
  const activeFilters = data?.filters;
  const linked = '/app/financeiro?empresa=' + encodeURIComponent(companyId);
  const pagination = (total: number) => (
    <FinancialPagination
      page={data?.page || 1}
      total={total}
      onPage={(n) => {
        const next = new URLSearchParams(query);
        next.set('page', String(n));
        setQuery(next);
      }}
    />
  );
  return (
    <div className="gf-dashboard gf-business gf-reports">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <div className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">DADOS PARA SEU NEGÓCIO</div>
            <h1>Relatórios</h1>
            <p>{data?.company.name || 'Desempenho empresarial'}</p>
          </div>
          <Button disabled={!data || busy} busy={exportBusy} onClick={() => void download()}>
            <Download size={17} />
            Exportar CSV
          </Button>
        </div>
        <CompanySelector companies={companies} value={companyId} choose={choose} />
        <nav className="gf-report-tabs" aria-label="Áreas dos relatórios">
          {Object.entries(areas).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-current={area === key ? 'page' : undefined}
              onClick={() => change({ area: key }, true)}
            >
              {label}
            </button>
          ))}
        </nav>
        <Card className="gf-report-filters">
          <label className="gf-field">
            Período
            <select
              aria-label="Período"
              value={period}
              onChange={(e) => change({ period: e.target.value })}
            >
              {Object.entries(periods).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {period === 'custom' && (
            <form
              className="gf-report-date-form"
              onSubmit={(e) => {
                e.preventDefault();
                change({ from, to });
              }}
            >
              <Input
                label="Início do período"
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Input
                label="Fim do período"
                type="date"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <Button type="submit">Aplicar período</Button>
            </form>
          )}
          {operational && (
            <>
              <label className="gf-field">
                Profissional
                <select
                  aria-label="Profissional"
                  value={query.get('professionalId') || ''}
                  onChange={(e) => change({ professionalId: e.target.value })}
                >
                  <option value="">Todos os profissionais</option>
                  {data?.catalog?.professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.active ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gf-field">
                Serviço
                <select
                  aria-label="Serviço"
                  value={query.get('serviceId') || ''}
                  onChange={(e) => change({ serviceId: e.target.value })}
                >
                  <option value="">Todos os serviços</option>
                  {data?.catalog?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.active ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {area === 'appointments' && (
            <label className="gf-field">
              Status
              <select
                aria-label="Status"
                value={query.get('status') || ''}
                onChange={(e) => change({ status: e.target.value })}
              >
                <option value="">Todos os status</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}
          {area === 'finance' && (
            <>
              <label className="gf-field">
                Tipo de movimentação
                <select
                  aria-label="Tipo de movimentação"
                  value={query.get('type') || 'all'}
                  onChange={(e) => change({ type: e.target.value, method: '' })}
                >
                  <option value="all">Recebimentos e despesas</option>
                  <option value="payments">Somente recebimentos</option>
                  <option value="expenses">Somente despesas pagas</option>
                </select>
              </label>
              {query.get('type') === 'payments' && (
                <label className="gf-field">
                  Forma de pagamento
                  <select
                    aria-label="Forma de pagamento"
                    value={query.get('method') || ''}
                    onChange={(e) => change({ method: e.target.value })}
                  >
                    <option value="">Todas as formas</option>
                    {Object.entries(paymentMethods).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {['services', 'professionals'].includes(area) && (
            <label className="gf-field">
              Ordenação
              <select
                aria-label="Ordenação"
                value={query.get('sort') || 'quantity'}
                onChange={(e) => change({ sort: e.target.value })}
              >
                <option value="quantity">Mais atendimentos concluídos</option>
                <option value="value">Maior valor histórico</option>
              </select>
            </label>
          )}
          <Button
            variant="secondary"
            onClick={() => setRevision((v) => v + 1)}
            disabled={busy}
            aria-label="Atualizar relatórios"
          >
            <RefreshCw size={18} />
          </Button>
        </Card>
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        {busy ? (
          <Loading label="Calculando relatórios…" />
        ) : !data ? (
          <Card>
            <p>Não foi possível carregar este relatório.</p>
            <Button onClick={() => setRevision((v) => v + 1)}>Tentar novamente</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setFrom('');
                setTo('');
                setQuery({ empresa: companyId });
              }}
            >
              Limpar filtros
            </Button>
          </Card>
        ) : (
          <>
            <p className="gf-report-period">
              {areas[area]} · {financialDate(data.from)} a {financialDate(data.to)} ·{' '}
              {data.company.timezone}
            </p>
            {!data.editable && (
              <p className="gf-notice">
                Sua assinatura permite consultar e exportar o histórico, sem registrar alterações.
              </p>
            )}
            {data.catalog?.truncated && (
              <p className="gf-notice">
                A seleção mostra os primeiros 1.000 itens do catálogo. Os totais consideram todos os
                registros.
              </p>
            )}
            {data.metrics && (
              <>
                <div className="gf-finance-metrics">
                  {Object.entries(data.metrics).map(([k, v]) => (
                    <Card key={k}>
                      <ChartNoAxesCombined size={20} />
                      <h2>{moneyLabels[k]}</h2>
                      <strong>{money(v)}</strong>
                      <p>
                        {k === 'expectedCents'
                          ? 'Confirmados e concluídos pela data do atendimento. Previsão não é recebimento.'
                          : k === 'completedCents'
                            ? 'Preço histórico de atendimentos concluídos. Não comprova pagamento.'
                            : k === 'balanceCents'
                              ? 'Recebimentos menos despesas pagas. Não representa lucro líquido.'
                              : 'Valores líquidos registrados manualmente no período; reversões na data da correção.'}
                      </p>
                    </Card>
                  ))}
                </div>
                <p className="gf-hint">
                  Recebimentos pela data efetiva; despesas pela data do pagamento; estornos e
                  anulações pela data da correção. Pagamentos manuais não foram confirmados por
                  bancos.
                  {activeFilters?.type && activeFilters.type !== 'all'
                    ? ' O tipo e a forma filtram apenas os valores financeiros; os indicadores operacionais permanecem gerais.'
                    : ''}
                </p>
                <Link className="gf-report-link" to={linked}>
                  Abrir Financeiro
                </Link>
              </>
            )}
            {data.appointments && (
              <>
                <h2>Atendimentos no período</h2>
                <div className="gf-report-counts">
                  {Object.entries(data.appointments).map(([k, v]) => (
                    <Card key={k}>
                      <small>{counts[k]}</small>
                      <strong>{v}</strong>
                    </Card>
                  ))}
                </div>
                <p className="gf-hint">
                  Data do atendimento; futuro significa confirmado com início posterior ao relógio
                  da empresa. O filtro de serviço seleciona atendimentos que contêm esse serviço.
                </p>
              </>
            )}
            <div className="gf-report-charts">
              {data.financialSeries && (
                <ReportChart
                  title="Evolução de recebimentos e despesas"
                  rows={data.financialSeries}
                  monetary
                  series={[
                    { key: 'receivedCents', label: 'Recebimentos', color: '#00d4ff' },
                    { key: 'paidExpensesCents', label: 'Despesas pagas', color: '#bcabff' },
                  ]}
                />
              )}
              {data.appointmentSeries && (
                <ReportChart
                  title="Atendimentos ao longo do período"
                  rows={data.appointmentSeries}
                  series={[
                    { key: 'total', label: 'Agendamentos', color: '#00d4ff' },
                    { key: 'completed', label: 'Concluídos', color: '#bcabff' },
                  ]}
                />
              )}
              {data.services && <ServiceChart rows={data.topServices || data.services.items} />}
            </div>
            {data.services && (
              <section aria-label="Relatório por serviço">
                <h2>Serviços concluídos</h2>
                <p className="gf-hint">
                  Participação no valor histórico dos serviços filtrados. Nomes e preços vêm do
                  atendimento; nomes diferentes do mesmo serviço aparecem separadamente.
                </p>
                <div className="gf-report-ranks">
                  {data.services.items.length ? (
                    data.services.items.map((r) => (
                      <Card key={r.id + r.name}>
                        <h3>{r.name}</h3>
                        {!r.active && <small>Serviço inativo</small>}
                        <dl>
                          <div>
                            <dt>Concluídos</dt>
                            <dd>{r.quantity}</dd>
                          </div>
                          <div>
                            <dt>Valor histórico</dt>
                            <dd>{money(r.valueCents)}</dd>
                          </div>
                          <div>
                            <dt>Participação no valor</dt>
                            <dd>
                              {r.sharePercent === null
                                ? 'Não aplicável'
                                : r.sharePercent.toLocaleString('pt-BR') + '%'}
                            </dd>
                          </div>
                        </dl>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <p>Nenhum serviço concluído neste período.</p>
                    </Card>
                  )}
                </div>
                {area === 'services' ? (
                  pagination(data.services.total)
                ) : (
                  <Link
                    className="gf-report-link"
                    to={
                      '/app/relatorios?' +
                      new URLSearchParams({
                        empresa: companyId,
                        area: 'services',
                        period,
                        ...(period === 'custom' ? { from: data.from, to: data.to } : {}),
                      })
                    }
                  >
                    Ver todos os serviços
                  </Link>
                )}
              </section>
            )}
            {data.professionals && (
              <section aria-label="Relatório por profissional">
                <h2>Desempenho dos profissionais</h2>
                <p className="gf-hint">
                  Preço histórico dos atendimentos concluídos, incluindo atendimentos que contêm o
                  serviço filtrado. Não representa recebimento, comissão ou pagamento ao
                  profissional. O nome apresentado é o cadastro atual, inclusive se inativo.
                </p>
                <div className="gf-report-ranks">
                  {data.professionals.items.length ? (
                    data.professionals.items.map((r) => (
                      <Card key={r.id}>
                        <h3>{r.name}</h3>
                        {!r.active && <small>Profissional inativo</small>}
                        <dl>
                          <div>
                            <dt>Concluídos</dt>
                            <dd>{r.quantity}</dd>
                          </div>
                          <div>
                            <dt>Cancelamentos</dt>
                            <dd>{r.cancelled}</dd>
                          </div>
                          <div>
                            <dt>Não compareceu</dt>
                            <dd>{r.noShow}</dd>
                          </div>
                          <div>
                            <dt>Valor histórico</dt>
                            <dd>{money(r.valueCents)}</dd>
                          </div>
                        </dl>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <p>Nenhum atendimento neste período.</p>
                    </Card>
                  )}
                </div>
                {pagination(data.professionals.total)}
              </section>
            )}
          </>
        )}
        <BusinessNav companyId={companyId} mobile />
      </div>
    </div>
  );
}
