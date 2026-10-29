import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, CircleDollarSign, Scissors, UsersRound } from 'lucide-react';
import { money } from '../lib';
import { Card } from './components';
import { ReportChart, ServiceChart } from './reports-charts';
import type { ReportArea, ReportState } from './reports-types';
import './reports-desktop.css';

export function ReportsDesktop({
  data,
  area,
  companyId,
}: {
  data: ReportState;
  area: ReportArea;
  companyId: string;
}) {
  const metrics =
    area === 'finance' && data.metrics
      ? [
          {
            label: 'Recebimentos registrados',
            value: money(data.metrics.receivedCents),
            icon: CircleDollarSign,
          },
          {
            label: 'Despesas pagas',
            value: money(data.metrics.paidExpensesCents),
            icon: CalendarDays,
          },
          {
            label: 'Saldo operacional',
            value: money(data.metrics.balanceCents),
            icon: CheckCircle2,
          },
          { label: 'Valor previsto', value: money(data.metrics.expectedCents), icon: Scissors },
        ]
      : area === 'overview' && data.metrics && data.appointments
        ? [
            {
              label: 'Recebimentos registrados',
              value: money(data.metrics.receivedCents),
              icon: CircleDollarSign,
            },
            { label: 'Agendamentos', value: String(data.appointments.total), icon: CalendarDays },
            { label: 'Concluídos', value: String(data.appointments.completed), icon: CheckCircle2 },
            {
              label: 'Valor histórico dos serviços',
              value: money(data.metrics.completedCents),
              icon: Scissors,
            },
          ]
        : data.appointments
          ? [
              { label: 'Agendamentos', value: String(data.appointments.total), icon: CalendarDays },
              {
                label: 'Confirmados',
                value: String(data.appointments.confirmed),
                icon: UsersRound,
              },
              {
                label: 'Concluídos',
                value: String(data.appointments.completed),
                icon: CheckCircle2,
              },
              { label: 'Cancelados', value: String(data.appointments.cancelled), icon: Scissors },
            ]
          : [];
  const services = data.topServices || data.services?.items || [];
  const professionalRows =
    data.professionals?.items.filter((person) => person.quantity > 0).slice(0, 5) || [];
  const peak = Math.max(1, ...professionalRows.map((person) => person.quantity));
  const statusRows = data.appointments
    ? ([
        ['Confirmados', data.appointments.confirmed],
        ['Concluídos', data.appointments.completed],
        ['Cancelados', data.appointments.cancelled],
        ['Não compareceu', data.appointments.noShow],
      ] as const)
    : [];
  return (
    <div className={'gf-reports-desktop area-' + area}>
      <div className="gf-reports-desktop-metrics">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <Card key={label} className={'gf-reports-desktop-metric is-' + index}>
            <Icon size={23} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </Card>
        ))}
      </div>
      <div className="gf-reports-desktop-charts">
        {data.financialSeries && (
          <ReportChart
            title="Evolução financeira registrada"
            rows={data.financialSeries}
            monetary
            compact={area === 'finance'}
            series={[
              { key: 'receivedCents', label: 'Recebimentos', color: '#935bff' },
              { key: 'paidExpensesCents', label: 'Despesas pagas', color: '#22bffa' },
            ]}
          />
        )}
        {data.appointmentSeries && (
          <ReportChart
            title="Atendimentos ao longo do período"
            rows={data.appointmentSeries}
            compact={area === 'appointments' || area === 'professionals'}
            series={[
              { key: 'total', label: 'Agendamentos', color: '#935bff' },
              { key: 'completed', label: 'Concluídos', color: '#22bffa' },
            ]}
          />
        )}
        {(data.topServices || data.services) && <ServiceChart rows={services.slice(0, 8)} />}
      </div>
      <div className="gf-reports-desktop-secondary">
        {data.appointments && (
          <Card>
            <div className="gf-reports-desktop-heading">
              <h2>Atendimentos por status</h2>
              <CalendarDays size={18} />
            </div>
            <p>Contagem real pela data do atendimento.</p>
            <div className="gf-reports-desktop-status">
              {statusRows.map(([label, count]) => (
                <div key={label}>
                  <span>
                    {label}
                    <strong>{count}</strong>
                  </span>
                  <i aria-hidden="true">
                    <b
                      style={{ width: `${(100 * count) / Math.max(1, data.appointments!.total)}%` }}
                    />
                  </i>
                </div>
              ))}
            </div>
          </Card>
        )}
        {data.professionals && (
          <Card>
            <div className="gf-reports-desktop-heading">
              <h2>Atendimentos por profissional</h2>
              <UsersRound size={18} />
            </div>
            <p>Concluídos no período; sem avaliação ou comissão estimada.</p>
            {professionalRows.length ? (
              <div className="gf-reports-desktop-status">
                {professionalRows.map((person) => (
                  <div key={person.id}>
                    <span>
                      {person.name}
                      <strong>{person.quantity}</strong>
                    </span>
                    <i aria-hidden="true">
                      <b style={{ width: `${(100 * person.quantity) / peak}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            ) : (
              <p>Nenhum atendimento concluído no período.</p>
            )}
          </Card>
        )}
        <Card className="gf-reports-desktop-note">
          <div className="gf-reports-desktop-heading">
            <h2>Leitura dos números</h2>
            <CircleDollarSign size={18} />
          </div>
          <p>
            Recebimentos e despesas seguem datas financeiras. O valor de serviços concluídos é
            histórico e não comprova recebimento.
          </p>
          <Link to={'/app/financeiro?empresa=' + encodeURIComponent(companyId)}>
            Abrir movimentações financeiras →
          </Link>
        </Card>
      </div>
    </div>
  );
}
