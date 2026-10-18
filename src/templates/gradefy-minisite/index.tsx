import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Instagram,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Scissors,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { SiteLink, useSite } from '../../site-context';
import { useApp } from '../../context';
import { Modal } from '../../components/UI';
import type { PortfolioPhoto } from '../../components/Portfolio';
import type { Service } from '../../types';
import { errorMessage, money } from '../../lib';
import { miniLinks } from './links';
import './styles.css';
import './customer.css';

function GradefyMark({ footer = false }: { footer?: boolean }) {
  return (
    <span className={'ms-gradefy ' + (footer ? 'ms-gradefy-footer' : '')}>
      <img src="/gradefy/logo-mark.png" alt="" width="29" height="32" />
      <img src="/gradefy/logo-wordmark.png" alt="Gradefy" width="108" height="24" />
    </span>
  );
}
export function MiniLayout() {
  const { site, basePath } = useSite(),
    location = useLocation();
  const home = location.pathname.replace(/\/$/, '') === basePath.replace(/\/$/, '');
  const booking = location.pathname.replace(/\/$/, '') === `${basePath}/agendar`;
  const colors = {
    '--ms-primary': site.settings.primary_color || '#6C5CE7',
    '--ms-accent': site.settings.secondary_color || '#00D4FF',
    '--blue': site.settings.primary_color || '#6C5CE7',
    '--red': site.settings.secondary_color || '#00D4FF',
  } as CSSProperties;
  return (
    <div className={`ms-site ${booking ? 'ms-booking-site' : ''}`} style={colors}>
      <a href="#mini-main" className="ms-skip">
        Ir para o conteúdo
      </a>
      {booking ? (
        <header className="mb-header">
          <div>
            <GradefyMark />
            <span>Sua agenda, seu ritmo.</span>
          </div>
          <SiteLink to="/">
            <ArrowLeft size={18} />
            Voltar ao site
          </SiteLink>
        </header>
      ) : (
        !home && (
          <header className="ms-sub-header">
            <SiteLink to="/">
              <ArrowLeft size={19} />
              {site.company.name}
            </SiteLink>
            <nav aria-label="Navegação do Mini Site">
              <SiteLink to="/minha-conta">
                <UserRound size={19} />
                Minhas reservas
              </SiteLink>
              <SiteLink to="/servicos">Serviços</SiteLink>
              <SiteLink to="/horarios">Horários</SiteLink>
            </nav>
          </header>
        )
      )}
      <main id="mini-main" tabIndex={-1}>
        {<Outlet />}
      </main>
      <footer className="ms-footer">
        Criado com{' '}
        <a
          href="https://gradefyapp.com.br"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Conheça o Gradefy (abre em nova aba)"
        >
          <GradefyMark footer />
        </a>
      </footer>
    </div>
  );
}
function SafeImage({
  src,
  alt,
  className = '',
  fallback,
  loading = 'lazy',
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = useState('');
  return failed === src ? (
    <span className={'ms-image-fallback ' + className}>
      {fallback || <span>Imagem indisponível</span>}
    </span>
  ) : (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailed(src)}
    />
  );
}
export function MiniHome() {
  const { site, preview } = useSite(),
    { api } = useApp();
  const links = miniLinks(site.settings);
  const photoTrigger = useRef<HTMLElement | null>(null);
  function openPhoto(index: number) {
    photoTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPhoto(index);
  }
  function closePhoto() {
    setPhoto(null);
    requestAnimationFrame(() => photoTrigger.current?.focus());
  }
  const [menu, setMenu] = useState(false),
    [photos, setPhotos] = useState<PortfolioPhoto[]>([]),
    [photoError, setPhotoError] = useState(''),
    [photoLoading, setPhotoLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [photo, setPhoto] = useState<number | null>(null),
    [showServices, setShowServices] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setPhotoError('');
    setPhotoLoading(true);
    api<PortfolioPhoto[]>('/portfolio', { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setPhotos(r.slice(0, 5));
      })
      .catch((e) => {
        if (!c.signal.aborted) setPhotoError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setPhotoLoading(false);
      });
    return () => c.abort();
  }, [api, revision]);
  useEffect(() => {
    if (photo === null) return;
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPhoto((i) => (i === null ? null : (i + 1) % photos.length));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPhoto((i) => (i === null ? null : (i + photos.length - 1) % photos.length));
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [photo, photos.length]);
  const bookingAllowed = !preview && site.settings.online_booking_enabled !== false;
  const initials = site.company.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <div className="ms-home">
      <section className="ms-identity" aria-labelledby="ms-name">
        {site.settings.hero_image_url && (
          <SafeImage
            src={site.settings.hero_image_url}
            alt=""
            className="ms-banner"
            loading="eager"
            fallback={<span />}
          />
        )}
        <header className="ms-top">
          <GradefyMark />
          <span className="ms-label">Mini Site</span>
          {!preview && (
            <nav className="ms-top-nav" aria-label="Navegação do Mini Site">
              <SiteLink to="/minha-conta">Minhas reservas</SiteLink>
              <SiteLink to="/servicos">Serviços</SiteLink>
              <SiteLink to="/horarios">Horários</SiteLink>
            </nav>
          )}
          <div className="ms-menu-wrap">
            <button
              className="ms-menu-button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-controls="ms-menu"
              aria-label="Mais opções"
            >
              <MoreHorizontal />
            </button>
            {menu && (
              <nav id="ms-menu" aria-label="Opções do Mini Site">
                <SiteLink to="/minha-conta" onClick={() => setMenu(false)}>
                  Minhas reservas
                </SiteLink>
                <SiteLink to="/horarios" onClick={() => setMenu(false)}>
                  Horários
                </SiteLink>
                <SiteLink to="/servicos" onClick={() => setMenu(false)}>
                  Serviços
                </SiteLink>
              </nav>
            )}
          </div>
        </header>
        <div className="ms-brand-ring">
          <div className="ms-brand-inner">
            {site.settings.logo_url ? (
              <SafeImage
                src={site.settings.logo_url}
                alt={'Logo ' + site.company.name}
                className="ms-business-logo"
                loading="eager"
                fallback={<span className="ms-initials">{initials}</span>}
              />
            ) : (
              <span className="ms-initials" aria-label={'Marca de ' + site.company.name}>
                {initials}
              </span>
            )}
          </div>
        </div>
        <h1 id="ms-name">{site.company.name}</h1>
        {site.settings.slogan && <p className="ms-slogan">{site.settings.slogan}</p>}
      </section>
      <div className="ms-content">
        {bookingAllowed ? (
          <SiteLink to="/agendar" className="ms-book">
            <CalendarCheck aria-hidden="true" />
            <span>Agendar horário</span>
            <ArrowRight aria-hidden="true" />
          </SiteLink>
        ) : (
          <>
            <span className="ms-book ms-book-disabled" aria-disabled="true">
              <CalendarCheck />
              <span>Agendar horário</span>
              <ArrowRight />
            </span>
            <p className="ms-book-note" role="status">
              {preview
                ? 'Prévia: os agendamentos estão desativados.'
                : 'Os agendamentos online estão pausados. Entre em contato com o estabelecimento.'}
            </p>
          </>
        )}
        <nav className="ms-actions" aria-label="Ações do estabelecimento">
          <QuickLink
            href={links.whatsapp}
            title="Fale no WhatsApp"
            subtitle="Tire suas dúvidas"
            missing="WhatsApp não informado"
            kind="whatsapp"
            icon={<MessageCircle />}
          />
          <QuickLink
            href={links.instagram}
            title="Nosso Instagram"
            subtitle="Veja nossos trabalhos"
            missing="Instagram não informado"
            kind="instagram"
            icon={<Instagram />}
          />
          <QuickLink
            href={links.location}
            title="Como chegar"
            subtitle="Ver no mapa"
            missing="Localização não informada"
            kind="location"
            icon={<MapPin />}
          />
          <button className="ms-action" onClick={() => setShowServices(true)}>
            <span className="ms-action-icon ms-services">
              <Scissors />
            </span>
            <span>
              <strong>Ver serviços</strong>
              <small>Conheça nossos serviços</small>
            </span>
            <ChevronRight className="ms-action-arrow" />
          </button>
        </nav>
        {photoLoading && (
          <p className="ms-loading" role="status">
            Carregando portfólio…
          </p>
        )}
        {photoError && (
          <div className="ms-panel">
            <p role="alert">Não foi possível carregar o portfólio.</p>
            <button className="ms-text-button" onClick={() => setRevision((n) => n + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {site.settings.sections?.gallery !== false && photos.length > 0 && (
          <section className="ms-panel ms-portfolio" aria-labelledby="ms-portfolio-title">
            <div className="ms-section-heading">
              <h2 id="ms-portfolio-title">
                <Sparkles />
                Portfólio
              </h2>
              <button onClick={() => openPhoto(0)} className="ms-text-button">
                Ver todas <ArrowRight size={17} />
              </button>
            </div>
            <div className={'ms-photo-grid ms-photo-count-' + photos.length}>
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => openPhoto(i)}
                  aria-label={`Ampliar foto ${i + 1}: ${p.title}`}
                >
                  <SafeImage
                    src={p.image}
                    alt={p.title || 'Trabalho realizado no estabelecimento'}
                  />
                </button>
              ))}
            </div>
          </section>
        )}
        <Hours />
      </div>
      {photo !== null && photos[photo] && (
        <Modal title={`Portfólio · ${photo + 1} de ${photos.length}`} onClose={closePhoto}>
          <div className="ms-lightbox">
            <SafeImage src={photos[photo].image} alt={photos[photo].title} loading="eager" />
            <div>
              <button
                className="ms-icon-button"
                disabled={photos.length < 2}
                onClick={() => setPhoto((photo + photos.length - 1) % photos.length)}
                aria-label="Foto anterior"
              >
                <ChevronLeft />
              </button>
              <span>
                {photo + 1} / {photos.length}
              </span>
              <button
                className="ms-icon-button"
                disabled={photos.length < 2}
                onClick={() => setPhoto((photo + 1) % photos.length)}
                aria-label="Próxima foto"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showServices && <ServiceCatalog onClose={() => setShowServices(false)} />}
    </div>
  );
}
function QuickLink({
  href,
  title,
  subtitle,
  missing,
  kind,
  icon,
}: {
  href: string | null;
  title: string;
  subtitle: string;
  missing: string;
  kind: string;
  icon: ReactNode;
}) {
  const body = (
    <>
      <span className={'ms-action-icon ms-' + kind}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{href ? subtitle : missing}</small>
      </span>
      <ChevronRight className="ms-action-arrow" />
    </>
  );
  return href ? (
    <a
      className="ms-action"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title + ' (abre em nova aba)'}
    >
      {body}
    </a>
  ) : (
    <span className="ms-action ms-action-unavailable" aria-disabled="true">
      {body}
    </span>
  );
}
function ServiceCatalog({ onClose }: { onClose: () => void }) {
  const { api } = useApp(),
    { preview, site } = useSite();
  const [services, setServices] = useState<Service[] | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    api<Service[]>('/services', { signal: c.signal })
      .then((s) => {
        if (!c.signal.aborted) setServices(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, revision]);
  return (
    <Modal title="Nossos serviços" onClose={onClose}>
      <div className="ms-catalog">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="ms-text-button" onClick={() => setRevision((n) => n + 1)}>
              Tentar novamente
            </button>
          </>
        ) : !services ? (
          <p role="status">Carregando serviços…</p>
        ) : !services.length ? (
          <p>Nenhum serviço disponível no momento.</p>
        ) : (
          services.map((s) => (
            <article key={s.id}>
              <div>
                <h3>{s.name}</h3>
                {s.description && <p>{s.description}</p>}
                <small>{s.duration} min</small>
              </div>
              <strong>{money(s.price)}</strong>
              {!preview && site.settings.online_booking_enabled !== false && (
                <SiteLink to={'/agendar?servico=' + encodeURIComponent(s.id)} onClick={onClose}>
                  Agendar <ArrowRight size={16} />
                </SiteLink>
              )}
            </article>
          ))
        )}
      </div>
    </Modal>
  );
}
const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function Hours() {
  const { site } = useSite(),
    hours = site.hours;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 30000);
    return () => clearInterval(timer);
  }, [hours?.now]);
  let status: string | null = null;
  if (hours && Number.isFinite(Date.parse(hours.now))) {
    const now = new Date(Date.parse(hours.now) + elapsed),
      parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone: hours.timezone,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(now)
          .map((p) => [p.type, p.value]),
      );
    const day = hours.days.find(
        (d) =>
          d.weekday === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
      ),
      clock = parts.hour + ':' + parts.minute;
    status =
      day?.active && clock >= day.start_time && clock < day.end_time
        ? day.breaks.some((b) => clock >= b.start_time && clock < b.end_time)
          ? 'Em intervalo'
          : 'Aberto agora'
        : 'Fechado';
  }
  const groups: { text: string; days: number[] }[] = [];
  for (const w of [1, 2, 3, 4, 5, 6, 0]) {
    const d = hours?.days.find((d) => d.weekday === w);
    if (!d?.active) continue;
    const text =
      d.start_time +
      ' às ' +
      d.end_time +
      (d.breaks.length
        ? ' · Pausas: ' + d.breaks.map((b) => b.start_time + '–' + b.end_time).join(', ')
        : '');
    const last = groups.at(-1);
    if (last?.text === text && w === (last.days.at(-1)! + 1) % 7) last.days.push(w);
    else groups.push({ text, days: [w] });
  }
  return (
    <section id="ms-hours" className="ms-panel ms-hours" aria-labelledby="ms-hours-title">
      <span className="ms-action-icon ms-services">
        <Clock3 />
      </span>
      <div>
        <h2 id="ms-hours-title">Horário de funcionamento</h2>
        {hours ? (
          groups.length ? (
            groups.map((g, i) => (
              <p key={i}>
                {weekdayNames[g.days[0]]}
                {g.days.length > 1 ? ' – ' + weekdayNames[g.days.at(-1)!] : ''} · {g.text}
              </p>
            ))
          ) : (
            <p>Sem expediente disponível nesta semana.</p>
          )
        ) : (
          <p>Consulte os horários ao agendar.</p>
        )}
        {hours && <small>Fuso: {hours.timezone.replaceAll('_', ' ')}</small>}
      </div>
      {status && (
        <span className={'ms-open-status ' + (status === 'Aberto agora' ? 'ms-open' : '')}>
          <i />
          {status}
        </span>
      )}
    </section>
  );
}
