import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Globe2,
  Home,
  LayoutDashboard,
  Scissors,
  Signal,
  Users,
  Wifi,
  BatteryFull,
} from 'lucide-react';
import { Brand } from './components';

const appointments = [
  { time: '09:00', service: 'Corte de cabelo', label: 'Confirmado', initials: '01' },
  { time: '10:20', service: 'Barba e acabamento', label: 'Confirmado', initials: '02' },
  { time: '14:00', service: 'Corte de cabelo', label: 'Agendado', initials: '03' },
];

export function AppointmentList({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`appointment-list${compact ? ' compact-list' : ''}`}>
      {appointments.map((item) => (
        <div className="appointment" key={item.time}>
          <span className="appointment-time">{item.time}</span>
          <span className="appointment-avatar" aria-hidden="true">
            {item.initials}
          </span>
          <div className="appointment-info">
            <strong>Atendimento {item.initials}</strong>
            <span>{item.service}</span>
          </div>
          <span className="appointment-status">{item.label}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

export function PhoneMockup() {
  return (
    <div className="phone-frame" aria-hidden="true">
      <div className="phone-camera" />
      <div className="phone-status">
        <span>9:41</span>
        <div>
          <Signal size={13} />
          <Wifi size={13} />
          <BatteryFull size={18} />
        </div>
      </div>
      <div className="phone-content">
        <div className="mock-header">
          <Brand compact />
          <Bell size={18} />
        </div>
        <p className="mock-eyebrow">SEU NEGÓCIO EM MOVIMENTO</p>
        <h3>
          Bom dia! <span className="wave">✦</span>
        </h3>
        <p className="mock-description">
          Tudo organizado.
          <br />
          Mais tempo para o que importa.
        </p>
        <div className="phone-metrics">
          <div className="mock-metric">
            <span className="mock-icon">
              <CalendarDays size={20} />
            </span>
            <span>Hoje</span>
            <strong>06</strong>
            <span>Atendimentos</span>
            <div className="meter">
              <span />
            </div>
          </div>
          <div className="mock-metric">
            <span className="mock-icon cyan">
              <Clock3 size={20} />
            </span>
            <span>Sua agenda</span>
            <strong>
              08<span>h</span>
            </strong>
            <span>Próximo horário</span>
            <span className="available-tag">
              Tudo em dia <Check size={10} />
            </span>
          </div>
        </div>
        <div className="mock-section-title">
          <span>PRÓXIMOS HORÁRIOS</span>
          <ChevronRight size={16} />
        </div>
        <AppointmentList compact />
        <div className="mock-section-title">
          <span>AÇÕES RÁPIDAS</span>
        </div>
        <div className="quick-actions">
          <div>
            <CalendarDays size={19} />
            <span>Agenda</span>
          </div>
          <div>
            <Globe2 size={19} />
            <span>Meu site</span>
          </div>
        </div>
      </div>
      <div className="phone-nav">
        <span className="active">
          <Home size={20} />
          Início
        </span>
        <span>
          <CalendarDays size={20} />
          Agenda
        </span>
        <span>
          <Users size={20} />
          Clientes
        </span>
      </div>
      <div className="phone-home" />
    </div>
  );
}

export function HeroVisual() {
  return (
    <figure
      className="hero-visual"
      aria-label="Conceito ilustrativo da agenda Gradefy em um celular"
    >
      <div className="visual-orbit orbit-one" aria-hidden="true" />
      <div className="visual-orbit orbit-two" aria-hidden="true" />
      <div className="floating-card floating-calendar" aria-hidden="true">
        <CalendarDays size={22} />
        <div>
          <strong>Seu dia, organizado.</strong>
          <span>Agenda inteligente</span>
        </div>
        <span className="floating-check">
          <Check size={15} />
        </span>
      </div>
      <PhoneMockup />
      <div className="floating-card floating-booking" aria-hidden="true">
        <span className="mock-icon cyan">
          <Check size={21} />
        </span>
        <div>
          <strong>Horário confirmado</strong>
          <span>Corte de cabelo · 14:00</span>
        </div>
        <span className="notification-dot" />
      </div>
      <figcaption>Prévia ilustrativa · produto em desenvolvimento</figcaption>
    </figure>
  );
}

export function DashboardMockup() {
  return (
    <div className="dashboard-frame" aria-hidden="true">
      <div className="window-topbar">
        <span />
        <span />
        <span />
        <small>Seu negócio, conectado.</small>
      </div>
      <div className="dashboard-body">
        <aside className="mock-sidebar">
          <Brand compact />
          <div className="sidebar-item selected">
            <LayoutDashboard size={15} />
            Visão geral
          </div>
          <div className="sidebar-item">
            <CalendarDays size={15} />
            Agenda
          </div>
          <div className="sidebar-item">
            <Users size={15} />
            Clientes
          </div>
          <div className="sidebar-item">
            <Scissors size={15} />
            Serviços
          </div>
          <div className="sidebar-item">
            <Globe2 size={15} />
            Meu site
          </div>
          <span className="sidebar-bottom">Tudo em um só lugar.</span>
        </aside>
        <div className="dashboard-main">
          <div className="dashboard-heading">
            <div>
              <span className="mock-eyebrow">VISÃO GERAL</span>
              <h3>Um novo dia. Tudo sob controle.</h3>
              <p>Acompanhe o que acontece no seu negócio.</p>
            </div>
            <span className="dashboard-avatar">G</span>
          </div>
          <div className="desktop-metrics">
            <div>
              <CalendarDays size={19} />
              <span>Atendimentos hoje</span>
              <strong>06</strong>
            </div>
            <div>
              <Users size={19} />
              <span>Clientes na agenda</span>
              <strong>06</strong>
            </div>
            <div>
              <Check size={19} />
              <span>Horários confirmados</span>
              <strong>04</strong>
            </div>
          </div>
          <div className="dashboard-panels">
            <section>
              <div className="mock-section-title">
                <strong>Sua agenda de hoje</strong>
                <CalendarDays size={15} />
              </div>
              <AppointmentList />
            </section>
            <section className="week-panel">
              <div className="mock-section-title">
                <strong>Sua semana</strong>
              </div>
              <div className="week-chart">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((day, index) => (
                  <div key={day}>
                    <span className={`chart-bar bar-${index}`} />
                    <small>{day}</small>
                  </div>
                ))}
              </div>
              <div className="week-caption">
                <span className="notification-dot" />
                Atendimentos organizados
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScheduleMockup() {
  return (
    <div className="small-mockup" aria-hidden="true">
      <div className="mock-section-title">
        <strong>Um lugar para cada horário.</strong>
        <CalendarDays size={20} />
      </div>
      <div className="mini-week">
        {['SEG', 'TER', 'QUA', 'QUI', 'SEX'].map((day, index) => (
          <div key={day} className={index === 2 ? 'selected-day' : ''}>
            <small>{day}</small>
            <strong>{12 + index}</strong>
          </div>
        ))}
      </div>
      <div className="schedule-row">
        <span>09:00</span>
        <div>
          <Scissors size={14} />
          Corte de cabelo <span>40 min</span>
        </div>
      </div>
      <div className="schedule-row">
        <span>10:20</span>
        <div>
          <Scissors size={14} />
          Barba <span>40 min</span>
        </div>
      </div>
      <div className="schedule-row free">
        <span>11:00</span>
        <div>
          Horário disponível
          <Check size={14} />
        </div>
      </div>
    </div>
  );
}

export function SiteMockup() {
  return (
    <div className="site-mockup" aria-hidden="true">
      <div className="site-browser">
        <Globe2 size={13} />
        <span>O site do seu estabelecimento</span>
        <span className="browser-dots">•••</span>
      </div>
      <div className="site-preview">
        <span className="site-brand">
          <Scissors size={18} />
          SUA BARBEARIA
        </span>
        <span className="site-kicker">ESTILO. CUIDADO. PERSONALIDADE.</span>
        <strong>
          Seu próximo
          <br />
          visual começa aqui.
        </strong>
        <div className="site-button">
          Agendar horário
          <ChevronRight size={13} />
        </div>
        <div className="site-photo">
          <Scissors size={68} strokeWidth={1} />
          <span>Barber Classic</span>
        </div>
      </div>
      <div className="site-services">
        <span>Corte</span>
        <span>Barba</span>
        <span>Acabamento</span>
      </div>
    </div>
  );
}
