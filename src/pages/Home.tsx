import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Gem,
  Instagram,
  MapPin,
  Scissors,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api, errorMessage, money } from '../lib';
import type { Service } from '../types';
import { CheckItem, ErrorBox, Eyebrow } from '../components/UI';
import { Portfolio } from '../components/Portfolio';

export default function Home() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [allServices, setAllServices] = useState(false);
  useEffect(() => {
    setError('');
    const controller = new AbortController();
    api<Service[]>('/services', { signal: controller.signal })
      .then(setServices)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [retry]);
  const featured = ['corte', 'barba', 'combo', 'sobrancelha']
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => !!s);
  const visibleServices = allServices
    ? services
    : featured.length
      ? featured
      : services.slice(0, 4);
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-photo">
          <img
            src="/images/hero.webp"
            alt="Detalhe de um corte degradê com acabamento preciso"
            fetchPriority="high"
          />
          <div className="image-shade" />
        </div>
        <div className="container hero-inner">
          <div className="hero-copy">
            <Eyebrow>ESTILO É IDENTIDADE</Eyebrow>
            <h1 id="hero-title">
              NÃO É SÓ
              <br />
              UM <span>CORTE.</span>
              <br />É SOBRE <span className="outline-word">VOCÊ.</span>
            </h1>
            <p>
              Seu estilo merece respeito. Corte na régua, barba
              <br className="desktop-break" /> alinhada e uma experiência feita pra você.
            </p>
            <div className="hero-buttons">
              <Link className="button primary large" to="/agendar">
                <CalendarCheck2 size={18} />
                Agendar meu horário
                <ArrowUpRight size={18} />
              </Link>
              <a className="button ghost large" href="#servicos">
                Conhecer serviços
                <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={14} />
                Agendamento fácil e rápido
              </span>
              <span>
                <MapPin size={14} />
                Campo Grande, RJ
              </span>
            </div>
          </div>
          <div className="hero-photo-caption">
            <span className="caption-icon">
              <Scissors size={19} />
            </span>
            <div>
              PRECISÃO EM CADA DETALHE<span>O seu próximo nível começa aqui.</span>
            </div>
            <span className="caption-line" />
          </div>
          <a className="hero-scroll" href="#servicos" aria-label="Conhecer nossos serviços">
            <ArrowDown size={17} />
          </a>
          <div className="hero-number">
            01 <span>/ 03</span>
          </div>
        </div>
      </section>
      <section className="benefits-strip" aria-label="A experiência Igor Barber Club">
        <div className="container benefits-inner">
          <div>
            <Scissors />
            <span>
              CORTE NA RÉGUA<small>Técnica, estilo e personalidade</small>
            </span>
          </div>
          <div>
            <Gem />
            <span>
              EXPERIÊNCIA PREMIUM<small>Cuidado do início ao acabamento</small>
            </span>
          </div>
          <div>
            <Coffee />
            <span>
              SEU MOMENTO<small>Um bom papo. Um novo visual.</small>
            </span>
          </div>
          <div>
            <CalendarCheck2 />
            <span>
              SEM COMPLICAÇÃO<small>Escolha, agende e chegue junto</small>
            </span>
          </div>
        </div>
      </section>
      <section className="section services-section container" id="servicos">
        <div className="section-heading">
          <div>
            <Eyebrow>NOSSOS SERVIÇOS</Eyebrow>
            <h2>
              NA MEDIDA DO <span>SEU ESTILO.</span>
            </h2>
          </div>
          <p>
            Do corte ao acabamento, a atenção
            <br />
            que o seu visual merece.
          </p>
        </div>
        <ErrorBox message={error} />
        {error && (
          <button className="button ghost" onClick={() => setRetry((r) => r + 1)}>
            Tentar novamente
          </button>
        )}
        <div className="service-grid">
          {!services.length && !error
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="service-skeleton" />)
            : visibleServices.map((service, i) => (
                <Link
                  to={`/agendar?servico=${service.id}`}
                  key={service.id}
                  className={`service-card ${service.id === 'combo' ? 'featured' : ''}`}
                >
                  {service.id === 'combo' && (
                    <span className="popular-tag">
                      <Zap size={11} fill="currentColor" />A EXPERIÊNCIA COMPLETA
                    </span>
                  )}
                  <div className="service-card-top">
                    <span className="service-icon">
                      {i % 4 === 0 ? (
                        <Scissors />
                      ) : i % 4 === 1 ? (
                        <ShieldCheck />
                      ) : i % 4 === 2 ? (
                        <Sparkles />
                      ) : (
                        <Gem />
                      )}
                    </span>
                    <span className="service-time">
                      <Clock3 size={12} />
                      {service.duration} min
                    </span>
                  </div>
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <div className="service-card-bottom">
                    <span className="service-price">
                      {money(service.price)}
                      <small>por sessão</small>
                    </span>
                    <span className="round-arrow">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                </Link>
              ))}
        </div>
        {services.length > 0 && (
          <button className="text-link all-services" onClick={() => setAllServices(!allServices)}>
            {allServices ? 'Mostrar principais serviços' : 'Explorar todos os serviços'}
            <ArrowRight size={16} />
          </button>
        )}
      </section>
      <section className="about-section" id="sobre">
        <div className="container about-grid">
          <div className="about-image">
            <img
              src="/images/shop.webp"
              alt="Imagem conceitual de um ambiente de barbearia contemporâneo"
              loading="lazy"
            />
            <div className="about-image-label">
              <span className="barber-stripes" />
              <span>
                O SEU LUGAR.
                <br />
                <strong>O SEU ESTILO.</strong>
              </span>
              <Scissors size={32} />
            </div>
          </div>
          <div className="about-copy">
            <Eyebrow>MUITO ALÉM DA CADEIRA</Eyebrow>
            <h2>
              BARBEARIA DE VERDADE.
              <br />
              <span>FEITA PRA VOCÊ.</span>
            </h2>
            <p>
              Em Campo Grande, no coração do Rio, a Igor Barber Club é um espaço para cuidar do
              visual, trocar uma ideia e sair com a confiança renovada.
            </p>
            <p>
              À frente da cadeira, Igor Borges une técnica e personalidade em cada atendimento. Uma
              trajetória de aprendizado e dedicação à barbearia, com a referência da{' '}
              <strong>#batalhadosbarbeirosbrasil.</strong>
            </p>
            <div className="about-checks">
              <CheckItem>Atendimento com hora marcada</CheckItem>
              <CheckItem>Cuidado em cada detalhe</CheckItem>
              <CheckItem>Seu estilo em primeiro lugar</CheckItem>
            </div>
            <a
              href="https://www.instagram.com/igor_barber_club/"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Conheça a gente no Instagram
              <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
      </section>
      <Portfolio />
      <section className="contact-section container" id="contato">
        <div className="contact-banner">
          <div>
            <Eyebrow light>SEU PRÓXIMO CORTE ESTÁ AQUI</Eyebrow>
            <h2>
              CHEGA JUNTO.
              <br />
              SAIA COM <span>ATITUDE.</span>
            </h2>
            <p>Reserve seu momento. A gente cuida do seu estilo.</p>
            <Link className="button white large" to="/agendar">
              Quero agendar meu horário
              <ArrowUpRight size={19} />
            </Link>
          </div>
          <div className="contact-details">
            <div>
              <MapPin size={23} />
              <span>
                <small>ONDE ESTAMOS</small>
                <strong>Campo Grande, Rio de Janeiro</strong>
                <a
                  href="https://www.instagram.com/igor_barber_club/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consulte o endereço no Instagram
                  <ArrowUpRight size={14} />
                </a>
              </span>
            </div>
            <div>
              <Clock3 size={23} />
              <span>
                <small>HORÁRIO DE ATENDIMENTO</small>
                <strong>Atendimento com hora marcada</strong>
                <Link to="/agendar">
                  Consulte os dias e horários disponíveis
                  <ArrowUpRight size={14} />
                </Link>
              </span>
            </div>
            <a
              className="contact-social"
              href="https://www.instagram.com/igor_barber_club/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={20} />
              @igor_barber_club
              <ChevronRight size={17} />
            </a>
          </div>
          <Scissors className="banner-scissors" />
        </div>
      </section>
    </>
  );
}
