import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Instagram, ImageOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../lib';
import { EmptyState, ErrorBox, Eyebrow, Modal, Spinner } from './UI';

export type PortfolioPhoto = {
  id: string;
  title: string;
  category: string;
  image: string;
  version: number;
};

export function PortfolioImage({
  photo,
  className = '',
}: {
  photo: PortfolioPhoto;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo.image]);
  return failed ? (
    <span
      className={`portfolio-missing ${className}`}
      role="img"
      aria-label={`Foto indisponível: ${photo.title}`}
    >
      <ImageOff size={28} />
      Foto indisponível
    </span>
  ) : (
    <img
      className={className}
      src={photo.image}
      alt={photo.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function Portfolio() {
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState('');
  const [photo, setPhoto] = useState<PortfolioPhoto | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<PortfolioPhoto[]>('/portfolio', { signal: controller.signal })
      .then(setPhotos)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const categories = [...new Set(photos.map((item) => item.category))];
  const activeFilter = categories.includes(filter) ? filter : '';
  const visible = photos.filter((item) => !activeFilter || item.category === activeFilter);
  return (
    <section
      className="section container portfolio-section"
      id="galeria"
      aria-labelledby="portfolio-title"
    >
      <div className="section-heading">
        <div>
          <Eyebrow>NOSSOS TRABALHOS</Eyebrow>
          <h2 id="portfolio-title">
            O ESTILO FALA <span>POR SI.</span>
          </h2>
        </div>
        <a
          className="text-link"
          href="https://www.instagram.com/igor_barber_club/"
          target="_blank"
          rel="noreferrer"
        >
          <Instagram size={16} />
          Acompanhe nosso trabalho
          <ArrowUpRight size={16} />
        </a>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <>
          <ErrorBox message={error} />
          <button className="button ghost" onClick={() => setRetry((n) => n + 1)}>
            Tentar carregar fotos novamente
          </button>
        </>
      ) : !photos.length ? (
        <EmptyState icon={<Instagram size={28} />} title="Veja nossos cortes no Instagram">
          Enquanto preparamos a galeria, acompanhe os trabalhos em @igor_barber_club.
        </EmptyState>
      ) : (
        <>
          <div className="gallery-toolbar">
            <div className="filter-tabs" aria-label="Filtrar estilos">
              {['', ...categories].map((category) => (
                <button
                  key={category}
                  className={activeFilter === category ? 'selected' : ''}
                  aria-pressed={activeFilter === category}
                  onClick={() => setFilter(category)}
                >
                  {category || 'Todos'}
                </button>
              ))}
            </div>
            <span>Cortes realizados no Igor Barber Club.</span>
          </div>
          <PhotoCarousel
            key={activeFilter + photos.map((p) => p.id).join(',')}
            photos={visible}
            onSelect={setPhoto}
          />
        </>
      )}
      {photo && (
        <Modal title={photo.title} onClose={() => setPhoto(null)}>
          <PortfolioImage photo={photo} className="lightbox-photo" />
          <p className="muted">{photo.category} · Igor Barber Club</p>
          <Link to="/agendar" className="button primary full">
            Agendar meu horário
            <ArrowUpRight size={17} />
          </Link>
        </Modal>
      )}
    </section>
  );
}

function PhotoCarousel({
  photos,
  onSelect,
}: {
  photos: PortfolioPhoto[];
  onSelect(photo: PortfolioPhoto): void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ start: true, end: true, index: 0 });
  useEffect(() => {
    const element = track.current!;
    const update = () => {
      const children = Array.from(element.children) as HTMLElement[];
      const left = element.getBoundingClientRect().left;
      let index = 0;
      children.forEach((child, i) => {
        if (child.getBoundingClientRect().left <= left + 10) index = i;
      });
      setPosition({
        start: element.scrollLeft <= 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
        index,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [photos.length]);
  function move(direction: number) {
    const element = track.current!;
    const first = element.firstElementChild as HTMLElement | null;
    const step = first
      ? first.getBoundingClientRect().width + parseFloat(getComputedStyle(element).gap)
      : element.clientWidth;
    element.scrollBy({
      left: direction * step,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  return (
    <div
      className="portfolio-carousel"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Fotos dos nossos trabalhos"
    >
      <div
        className="portfolio-track"
        id="portfolio-track"
        ref={track}
        tabIndex={0}
        aria-label="Deslize para ver os cortes ou use as setas do teclado"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            move(e.key === 'ArrowRight' ? 1 : -1);
          }
        }}
      >
        {photos.map((item, i) => (
          <div
            className="portfolio-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${photos.length}`}
            key={item.id}
          >
            <button
              className="portfolio-card"
              onClick={() => onSelect(item)}
              aria-label={`Ampliar ${item.title}`}
            >
              <PortfolioImage photo={item} />
              <span className="portfolio-caption">
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.category}</small>
                </span>
                <ArrowUpRight size={22} />
              </span>
            </button>
          </div>
        ))}
      </div>
      <div className="portfolio-controls">
        <span className="muted">Deslize e encontre seu próximo estilo.</span>
        <div>
          <span className="portfolio-counter" aria-live="polite" aria-atomic="true">
            {String(position.index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
          </span>
          <button
            className="button ghost"
            aria-label="Fotos anteriores"
            aria-controls="portfolio-track"
            disabled={position.start}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="button ghost"
            aria-label="Próximas fotos"
            aria-controls="portfolio-track"
            disabled={position.end}
            onClick={() => move(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
