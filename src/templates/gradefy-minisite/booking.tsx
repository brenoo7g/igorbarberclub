import { useEffect, useId, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Info,
  Scissors,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import type { Service } from '../../types';
import { formatDate, money } from '../../lib';
import { EmptyState } from '../../components/UI';
import './booking.css';

/** Presentation only. Catalog, prices, eligibility and availability belong to the shared motor. */
export function MiniServicePicker({
  services,
  selected,
  onSelect,
}: {
  services: Service[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))];
  const visible = services.filter(
    (s) =>
      (!category || category === s.category) &&
      `${s.name} ${s.description}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );
  return (
    <>
      <label className="mb-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">Buscar serviço</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar serviço..."
        />
      </label>
      {categories.length > 1 && (
        <div className="mb-categories" role="group" aria-label="Categorias de serviços">
          {[null, ...categories].map((c) => (
            <button
              type="button"
              key={c || 'all'}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c || 'Todos'}
            </button>
          ))}
        </div>
      )}
      <div className="booking-service-list" role="radiogroup" aria-label="Escolha seu serviço">
        {visible.map((s) => (
          <label key={s.id} className={`booking-service ${selected === s.id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="booking-service"
              value={s.id}
              checked={selected === s.id}
              onChange={() => onSelect(s.id)}
            />
            <span className="mb-service-icon" aria-hidden="true">
              <Scissors size={26} />
            </span>
            <span className="booking-service-info">
              <strong>{s.name}</strong>
              {s.description && <span>{s.description}</span>}
              <small>
                <Clock3 size={14} aria-hidden="true" />
                {s.duration} min{s.category && ` · ${s.category}`}
              </small>
            </span>
            <strong>{money(s.price)}</strong>
            <span className="custom-check" aria-hidden="true">
              {selected === s.id && <Check size={18} />}
            </span>
          </label>
        ))}
      </div>
      {!visible.length && (
        <EmptyState
          icon={<Scissors size={25} />}
          title={services.length ? 'Nenhum serviço encontrado' : 'Serviços indisponíveis'}
        >
          {services.length
            ? 'Experimente outra busca ou categoria.'
            : 'Entre em contato com o estabelecimento ou tente novamente mais tarde.'}
        </EmptyState>
      )}
    </>
  );
}

export function MiniBookingSummary({
  company,
  service,
  professional,
  date,
  time,
  step,
  onRemove,
}: {
  company: string;
  service?: Service;
  professional?: string;
  date: string;
  time: string;
  step: number;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(step === 2), [step]);
  const id = useId();
  return (
    <aside
      className={`mb-summary ${expanded ? 'is-expanded' : ''}`}
      aria-label="Resumo do agendamento"
    >
      <div className="mb-summary-title">
        <CalendarDays size={27} aria-hidden="true" />
        <div>
          <h2>Seu momento no Gradefy</h2>
          <p>{company}</p>
        </div>
      </div>
      <button
        type="button"
        className="mb-summary-toggle"
        aria-controls={id}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          {service?.name || 'Seu agendamento'}
          <small>{time ? `${formatDate(date)} · ${time}` : 'Confira os detalhes'}</small>
        </span>
        <strong>{money(service?.price || 0)}</strong>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={id} className="mb-summary-body">
        {service ? (
          <div className="mb-selected-service">
            <span className="mb-service-icon">
              <Scissors size={24} aria-hidden="true" />
            </span>
            <div>
              <strong>{service.name}</strong>
              <small>
                <Clock3 size={14} aria-hidden="true" />
                {service.duration} min{service.category && ` · ${service.category}`}
              </small>
            </div>
            <strong>{money(service.price)}</strong>
            {step === 0 && (
              <button
                type="button"
                className="icon-button"
                onClick={onRemove}
                aria-label="Remover serviço selecionado"
              >
                <X size={17} />
              </button>
            )}
          </div>
        ) : (
          <p className="mb-summary-empty">Escolha o serviço para começar.</p>
        )}
        <dl className="mb-summary-meta">
          <div>
            <UserRound aria-hidden="true" />
            <dt>Profissional</dt>
            <dd>{professional || 'A escolher na próxima etapa'}</dd>
          </div>
          <div>
            <CalendarDays aria-hidden="true" />
            <dt>Data</dt>
            <dd>
              {step > 0
                ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'long' })
                : 'A escolher na próxima etapa'}
            </dd>
          </div>
          <div>
            <Clock3 aria-hidden="true" />
            <dt>Horário</dt>
            <dd>{time || 'A escolher na próxima etapa'}</dd>
          </div>
        </dl>
        <div className="mb-total">
          <span>
            Total<small>Pagamento no estabelecimento</small>
          </span>
          <strong>{money(service?.price || 0)}</strong>
        </div>
        <p className="mb-summary-note">
          <Info size={23} aria-hidden="true" />
          <span>
            {step === 2
              ? 'Revise os detalhes antes de confirmar seu agendamento.'
              : 'Você poderá revisar todos os detalhes antes de confirmar seu agendamento.'}
          </span>
        </p>
      </div>
    </aside>
  );
}
