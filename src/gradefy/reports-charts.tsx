import { useId, useState } from 'react';
import { money } from '../lib';
import { Card } from './components';
import { financialDate } from './finance-shared';
export type ChartSeries = { key: string; label: string; color: string };
export type ChartRow = { date: string; [key: string]: number | string };
export function ReportChart({
  title,
  rows,
  series,
  monetary = false,
}: {
  title: string;
  rows: ChartRow[];
  series: ChartSeries[];
  monetary?: boolean;
}) {
  const id = useId(),
    [show, setShow] = useState(false);
  const fmt = (v: number) => (monetary ? money(v) : String(v));
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key]))),
    hi = Math.max(1, ...values),
    lo = Math.min(0, ...values),
    span = hi - lo;
  const x = (i: number) => 64 + (rows.length > 1 ? i / (rows.length - 1) : 0.5) * 560,
    y = (v: number) => 24 + ((hi - v) / span) * 170;
  const hasData = values.some((v) => v !== 0);
  return (
    <Card className="gf-report-chart">
      <h2 id={id}>{title}</h2>
      <div className="gf-report-legend">
        {series.map((s, i) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} {i === 1 ? '(tracejado)' : ''}
          </span>
        ))}
      </div>
      {hasData ? (
        <svg viewBox="0 0 650 235" role="img" aria-labelledby={id}>
          <title>{title}</title>
          <desc>Valores por dia. Use “Ver dados” para consultar os números e as datas.</desc>
          {[hi, (hi + lo) / 2, lo].map((v, i) => (
            <g key={i}>
              <line x1="64" x2="624" y1={y(v)} y2={y(v)} stroke="#303c56" />
              <text x="59" y={y(v) + 4} textAnchor="end">
                {monetary
                  ? new Intl.NumberFormat('pt-BR', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(v / 100)
                  : Math.round(v)}
              </text>
            </g>
          ))}
          <text x="64" y="222">
            {rows[0]?.date.slice(5).split('-').reverse().join('/')}
          </text>
          <text x="624" y="222" textAnchor="end">
            {rows.at(-1)?.date.slice(5).split('-').reverse().join('/')}
          </text>
          {series.map((s, j) => (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray={j === 1 ? '7 4' : undefined}
                points={rows.map((r, i) => `${x(i)},${y(Number(r[s.key]))}`).join(' ')}
              />
              {rows.length === 1 && (
                <circle cx={x(0)} cy={y(Number(rows[0][s.key]))} r="4" fill={s.color} />
              )}
            </g>
          ))}
        </svg>
      ) : (
        <p>Nenhuma movimentação para este gráfico no período selecionado.</p>
      )}
      <p className="gf-hint">
        Eixo horizontal: datas do período. Eixo vertical:{' '}
        {monetary ? 'reais (R$), valores líquidos registrados' : 'quantidade de agendamentos'}.
      </p>
      <button
        type="button"
        className="gf-report-text-toggle"
        aria-expanded={show}
        aria-controls={id + '-data'}
        onClick={() => setShow(!show)}
      >
        {show ? 'Ocultar dados' : 'Ver dados'}
      </button>
      {show && (
        <div id={id + '-data'} className="gf-report-chart-data">
          {rows.map((r) => (
            <div key={r.date}>
              <strong>{financialDate(r.date)}</strong>
              {series.map((s) => (
                <span key={s.key}>
                  {s.label}: {fmt(Number(r[s.key]))}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
export function ServiceChart({ rows }: { rows: { id: string; name: string; quantity: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.quantity));
  return (
    <Card className="gf-report-chart">
      <h2>Serviços mais realizados</h2>
      <p className="gf-hint">Até 8 nomes históricos, por quantidade de atendimentos concluídos.</p>
      {rows.length ? (
        <ol className="gf-report-bars">
          {rows.map((r) => (
            <li key={r.id + r.name}>
              <span>{r.name}</span>
              <strong>{r.quantity} concluídos</strong>
              <div aria-hidden="true">
                <i style={{ width: (r.quantity / max) * 100 + '%' }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>Nenhum serviço concluído neste período.</p>
      )}
    </Card>
  );
}
