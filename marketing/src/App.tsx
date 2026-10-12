import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock3,
  Globe2,
  Instagram,
  Layers3,
  LayoutDashboard,
  Menu,
  Paintbrush,
  Scissors,
  Sparkles,
  Users,
  UserRoundCheck,
  WandSparkles,
  X,
} from 'lucide-react';
import { Brand, Eyebrow, LaunchBadge, LaunchLink, LinkButton } from './components';
import { DashboardMockup, HeroVisual, ScheduleMockup, SiteMockup } from './mockups';
import { launchChannel } from './config';

const navItems = [
  { href: '#recursos', label: 'Recursos' },
  { href: '#segmentos', label: 'Segmentos' },
  { href: '#como-funciona', label: 'Como funciona' },
];
const features = [
  {
    icon: CalendarCheck2,
    name: 'Agendamento online',
    description: 'Seus clientes poderão marcar horários por meio de um site personalizado.',
    className: 'feature-online',
  },
  {
    icon: CalendarDays,
    name: 'Agenda inteligente',
    description: 'Visualização dos atendimentos e organização dos horários.',
  },
  {
    icon: Users,
    name: 'Gestão de clientes',
    description: 'Informações e histórico de atendimentos reunidos em um só lugar.',
  },
  {
    icon: Scissors,
    name: 'Serviços',
    description: 'Cadastro de serviços, valores e duração dos atendimentos.',
  },
  {
    icon: UserRoundCheck,
    name: 'Gestão de profissionais',
    description: 'Organização de equipes e horários individuais.',
  },
  {
    icon: Globe2,
    name: 'Seu próprio site',
    description: 'Cada estabelecimento poderá ter uma página personalizada com sua identidade.',
  },
  {
    icon: LayoutDashboard,
    name: 'Controle do negócio',
    description: 'Painel para acompanhar a rotina e indicadores operacionais.',
  },
];
const niches = [
  {
    icon: Scissors,
    name: 'Barbearias',
    text: 'Agendamentos para cortes, barbas e outros serviços.',
    initial: true,
  },
  {
    icon: WandSparkles,
    name: 'Salões de beleza',
    text: 'Organização de serviços e profissionais.',
  },
  {
    icon: Paintbrush,
    name: 'Manicures e Nail Designers',
    text: 'Controle de horários e atendimento de clientes.',
  },
  {
    icon: Sparkles,
    name: 'Estúdios de tatuagem',
    text: 'Organização de sessões e agenda profissional.',
  },
];
const steps = [
  {
    icon: Layers3,
    title: 'Configure seu negócio',
    text: 'Adicione suas informações, serviços, profissionais e horários.',
  },
  {
    icon: Globe2,
    title: 'Personalize sua presença online',
    text: 'Escolha um template e prepare a página do seu estabelecimento.',
  },
  {
    icon: CalendarCheck2,
    title: 'Organize seus atendimentos',
    text: 'Gerencie sua agenda e ofereça agendamento online aos clientes.',
  },
];

function Header() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  return (
    <header className="header">
      <div className="container header-inner">
        <a
          className="home-link"
          href="#inicio"
          aria-label="Gradefy — início"
          onClick={() => setOpen(false)}
        >
          <Brand />
        </a>
        <button
          ref={toggle}
          className="menu-toggle"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav
          id="navigation"
          aria-label="Navegação principal"
          className={open ? 'navigation open' : 'navigation'}
        >
          {navItems.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <a className="nav-launch" href="#lancamento" onClick={() => setOpen(false)}>
            Acompanhar lançamento
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo">
        <section id="inicio" className="hero">
          <div className="hero-grid" aria-hidden="true" />
          <div className="container hero-inner">
            <div className="hero-copy">
              <LaunchBadge />
              <h1>
                Sua agenda.
                <br />
                Seu negócio.
                <br />
                <span className="gradient-text">
                  Tudo em um
                  <br className="desktop-break" /> só lugar.
                </span>
              </h1>
              <p className="hero-description">
                Uma nova maneira de organizar seus atendimentos, gerenciar seu negócio e oferecer
                uma experiência moderna aos seus clientes.
              </p>
              <div className="hero-buttons">
                <LinkButton href="#recursos">
                  Conhecer o Gradefy
                  <ArrowRight size={18} aria-hidden="true" />
                </LinkButton>
                <LaunchLink />
              </div>
              <div className="hero-note">
                <span>
                  <CalendarDays size={15} aria-hidden="true" />
                  Sua rotina mais leve.
                </span>
                <span>
                  <Globe2 size={15} aria-hidden="true" />
                  Seu negócio mais conectado.
                </span>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="recursos" className="section features-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <Eyebrow>FEITO PARA A SUA ROTINA</Eyebrow>
                <h2>
                  Mais organização para você.
                  <br />
                  <span className="muted-heading">Mais praticidade para seus clientes.</span>
                </h2>
              </div>
              <p>
                Menos tarefas espalhadas.
                <br />
                Mais espaço para fazer o que você faz de melhor.
              </p>
            </div>
            <div className="features-grid">
              {features.map((feature) => (
                <article key={feature.name} className={`feature-card ${feature.className ?? ''}`}>
                  <span className="feature-icon">
                    <feature.icon size={24} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <h3>{feature.name}</h3>
                  <p>{feature.description}</p>
                  {feature.className && (
                    <div className="online-illustration" aria-hidden="true">
                      <span>
                        <Clock3 size={14} />
                        14:00
                      </span>
                      <span>
                        <Check size={14} />
                        Confirmado
                      </span>
                      <div className="connection-line" />
                      <Globe2 size={26} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="demonstracao" className="section demo-section">
          <div className="container">
            <div className="center-heading">
              <Eyebrow>UMA NOVA FORMA DE CUIDAR DO SEU NEGÓCIO</Eyebrow>
              <h2>
                Do primeiro horário
                <br />
                ao último atendimento.
              </h2>
              <p>Uma experiência conectada, com a organização que a sua rotina precisa.</p>
            </div>
            <figure className="dashboard-showcase">
              <DashboardMockup />
              <figcaption>
                Conceitos ilustrativos de interface. Produto em desenvolvimento, sem dados de
                clientes.
              </figcaption>
            </figure>
            <div className="demo-details">
              <article className="demo-card">
                <ScheduleMockup />
                <div>
                  <span className="detail-label">AGENDA INTELIGENTE</span>
                  <h3>Enxergue o seu dia com clareza.</h3>
                  <p>Horários e duração dos serviços, organizados para o seu atendimento.</p>
                </div>
              </article>
              <article className="demo-card">
                <SiteMockup />
                <div>
                  <span className="detail-label">SUA PRESENÇA ONLINE</span>
                  <h3>A identidade do seu negócio.</h3>
                  <p>Uma página própria para apresentar seu trabalho e receber agendamentos.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="segmentos" className="section niches-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <Eyebrow>O SEU TALENTO. A NOSSA TECNOLOGIA.</Eyebrow>
                <h2>
                  Feito para quem transforma
                  <br />
                  <span className="gradient-text">talento em negócio.</span>
                </h2>
              </div>
              <p>
                Começamos pelas barbearias.
                <br />
                Novas possibilidades estão no caminho.
              </p>
            </div>
            <div className="niches-grid">
              {niches.map((niche) => (
                <article
                  key={niche.name}
                  className={`niche-card${niche.initial ? ' initial-niche' : ''}`}
                >
                  <span className="niche-number" aria-hidden="true">
                    {niche.initial ? '01' : 'EM BREVE'}
                  </span>
                  <niche.icon
                    className="niche-icon"
                    size={38}
                    strokeWidth={1.3}
                    aria-hidden="true"
                  />
                  <h3>{niche.name}</h3>
                  <p>{niche.text}</p>
                  <span className="niche-tag">
                    {niche.initial ? 'Foco inicial · template implementado' : 'Expansão planejada'}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="section how-section">
          <div className="container">
            <div className="center-heading">
              <Eyebrow>SIMPLES DESDE O COMEÇO</Eyebrow>
              <h2>
                Seu próximo capítulo
                <br />
                começa com organização.
              </h2>
              <p>Como funcionará a experiência Gradefy no lançamento.</p>
            </div>
            <div className="steps-grid">
              {steps.map((step, index) => (
                <article className="step" key={step.title}>
                  <div className="step-top">
                    <span className="step-number">0{index + 1}</span>
                    <step.icon size={22} aria-hidden="true" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
            <div className="business-note">
              <Users size={25} aria-hidden="true" />
              <p>
                Soluções pensadas para profissionais independentes e negócios com equipe.
                <span>Conheça todas as novidades no lançamento.</span>
              </p>
            </div>
          </div>
        </section>

        <section id="lancamento" className="launch-section">
          <div className="container">
            <div className="launch-panel">
              <div className="launch-art" aria-hidden="true" />
              <img
                className="launch-logo"
                src="/images/logo-mark.png"
                width="84"
                height="84"
                alt="Gradefy"
                loading="lazy"
              />
              <LaunchBadge />
              <h2>
                Seu negócio
                <br />
                merece <span className="gradient-text">evoluir.</span>
              </h2>
              <p>
                O Gradefy está chegando para simplificar sua rotina e transformar sua maneira de
                trabalhar.
              </p>
              <LaunchLink variant="primary">
                <Instagram size={19} aria-hidden="true" />
                Acompanhar no Instagram
              </LaunchLink>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <a href="#inicio" aria-label="Gradefy — voltar ao início">
                <Brand />
              </a>
              <p>
                Gestão inteligente para
                <br />
                quem vive de horários.
              </p>
            </div>
            <nav aria-label="Navegação do rodapé">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            {launchChannel && (
              <a
                href={launchChannel}
                className="footer-social"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram size={20} aria-hidden="true" />
                Instagram
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Gradefy.</span>
            <span>
              <span className="notification-dot" />
              Lançamento em breve
            </span>
            <a href="#inicio">Voltar ao topo ↑</a>
          </div>
        </div>
      </footer>
    </>
  );
}
