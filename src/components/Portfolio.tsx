import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Instagram } from 'lucide-react';
import { api, errorMessage } from '../lib';
import { ErrorBox, Modal, Spinner } from './UI';

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
  if (!loading && !error && !photos.length) return null;
  return (
    <section
      className="section container portfolio-section"
      id="galeria"
      aria-labelledby="portfolio-title"
    >
      <h2 id="portfolio-title">Alguns dos nossos cortes</h2>
      {loading ? (
        <Spinner />
      ) : error ? (
        <>
          <ErrorBox message={error} />
          <button className="button ghost" onClick={() => setRetry((n) => n + 1)}>
            Tentar carregar fotos novamente
          </button>
        </>
      ) : (
        <PhotoCarousel
          key={photos.map((p) => p.id).join(',')}
          photos={photos}
          onSelect={setPhoto}
        />
      )}
      <div className="portfolio-instagram">
        <a
          className="button primary"
          href="https://www.instagram.com/igor_barber_club/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Instagram size={18} />
          Veja mais no nosso instagram
        </a>
      </div>
      {photo && (
        <div className="portfolio-lightbox">
          <Modal title={photo.title} onClose={() => setPhoto(null)}>
            <PortfolioImage photo={photo} className="lightbox-photo" />
          </Modal>
        </div>
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
  const targets = useRef<number[]>([0]);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ index: 0, count: 1 });
  useEffect(() => {
    const element = track.current!;
    const update = () => {
      const max = Math.max(0, element.scrollWidth - element.clientWidth);
      const first = element.firstElementChild as HTMLElement;
      const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(element).gap);
      const stops = Array.from({ length: photos.length }, (_, i) => Math.min(i * step, max));
      targets.current = stops.filter((stop, i) => i === 0 || stop - stops[i - 1] > 2);
      const index = targets.current.reduce(
        (best, stop, i, all) =>
          Math.abs(stop - element.scrollLeft) < Math.abs(all[best] - element.scrollLeft) ? i : best,
        0,
      );
      setPosition((old) =>
        old.index === index && old.count === targets.current.length
          ? old
          : { index, count: targets.current.length },
      );
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
  function go(index: number) {
    track.current?.scrollTo({
      left: targets.current[Math.max(0, Math.min(index, targets.current.length - 1))],
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
      <div className="portfolio-stage">
        <div
          className={`portfolio-track${dragging ? ' is-dragging' : ''}`}
          id="portfolio-track"
          ref={track}
          tabIndex={0}
          aria-label="Fotos dos cortes; use as setas do teclado para navegar"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              go(
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? position.count - 1
                    : position.index + (event.key === 'ArrowRight' ? 1 : -1),
              );
            }
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            suppressClick.current = false;
            drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const delta = event.clientX - drag.current.x;
            if (Math.abs(delta) > 6) {
              drag.current.moved = true;
              suppressClick.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              event.currentTarget.scrollLeft = drag.current.left - delta;
            }
          }}
          onPointerUp={(event) => {
            const moved = drag.current?.moved;
            drag.current = null;
            setDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (moved) {
              const left = event.currentTarget.scrollLeft;
              const nearest = targets.current.reduce(
                (best, stop, i, all) =>
                  Math.abs(stop - left) < Math.abs(all[best] - left) ? i : best,
                0,
              );
              requestAnimationFrame(() => go(nearest));
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerLeave={() => {
            if (!drag.current?.moved) drag.current = null;
          }}
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }
          }}
          onDragStart={(event) => event.preventDefault()}
        >
          {photos.map((photo, i) => (
            <div
              className="portfolio-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${photos.length}`}
              key={photo.id}
            >
              <button
                className="portfolio-card"
                aria-label={`Ampliar ${photo.title}`}
                onClick={() => onSelect(photo)}
              >
                <PortfolioImage photo={photo} />
              </button>
            </div>
          ))}
        </div>
        {position.count > 1 && (
          <>
            <button
              className="portfolio-arrow previous"
              aria-label="Fotos anteriores"
              aria-controls="portfolio-track"
              disabled={position.index === 0}
              onClick={() => go(position.index - 1)}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="portfolio-arrow next"
              aria-label="Próximas fotos"
              aria-controls="portfolio-track"
              disabled={position.index === position.count - 1}
              onClick={() => go(position.index + 1)}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      {position.count > 1 && (
        <div className="portfolio-pagination" aria-label="Posições do carrossel">
          {Array.from({ length: position.count }, (_, i) => (
            <button
              key={i}
              aria-label={`Ir para posição ${i + 1}`}
              aria-current={position.index === i ? 'true' : undefined}
              onClick={() => go(i)}
            >
              <span />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
