import { SiteLink as Link } from './site-context';
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SiteShell, TemplateHome } from './templates';
import { scopedPath, useSite } from './site-context';

import { ScrollToTop, Spinner } from './components/UI';

import './styles.css';
const Booking = lazy(() => import('./pages/Booking'));
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
const Profile = lazy(() => import('./pages/Profile'));
const PasswordRecovery = lazy(() => import('./pages/PasswordRecovery'));
const MiniCustomerPage = lazy(() => import('./templates/gradefy-minisite/customer'));
const MiniClientGate = lazy(() =>
  import('./templates/gradefy-minisite/customer').then((m) => ({ default: m.MiniClientGate })),
);
function TemplateBooking() {
  const { site } = useSite();
  return site.company.template === 'gradefy-minisite' ? (
    <MiniClientGate>
      <Booking />
    </MiniClientGate>
  ) : (
    <Booking />
  );
}
function TemplateAccount({ profile = false }: { profile?: boolean }) {
  const { site } = useSite();
  return site.company.template === 'gradefy-minisite' ? (
    <MiniCustomerPage kind={profile ? 'profile' : 'reservations'} />
  ) : profile ? (
    <Profile />
  ) : (
    <Account />
  );
}
function TemplateRecovery({ reset = false }: { reset?: boolean }) {
  const { site } = useSite();
  return site.company.template === 'gradefy-minisite' ? (
    <MiniCustomerPage kind={reset ? 'reset' : 'forgot'} />
  ) : (
    <PasswordRecovery />
  );
}
function TemplateCustomerPage({ kind }: { kind: 'login' | 'register' | 'services' | 'hours' }) {
  const { site, basePath } = useSite();
  return site.company.template === 'gradefy-minisite' ? (
    <MiniCustomerPage kind={kind} />
  ) : (
    <Navigate
      replace
      to={scopedPath(
        kind === 'services' ? '/#servicos' : kind === 'hours' ? '/#contato' : '/minha-conta',
        basePath,
      )}
    />
  );
}
const GradefyShell = lazy(() => import('./gradefy/Shell'));
const GradefyWelcome = lazy(() =>
  import('./gradefy/pages').then((module) => ({ default: module.Welcome })),
);
const GradefyAccountForm = lazy(() =>
  import('./gradefy/pages').then((module) => ({ default: module.AccountForm })),
);
const GradefyAccountReady = lazy(() =>
  import('./gradefy/pages').then((module) => ({ default: module.AccountReady })),
);
const GradefyRecovery = lazy(() =>
  import('./gradefy/pages').then((module) => ({ default: module.PasswordRecovery })),
);
const GradefyMissing = lazy(() =>
  import('./gradefy/pages').then((module) => ({ default: module.MissingPage })),
);
const OnboardingGate = lazy(() =>
  import('./gradefy/plans').then((module) => ({ default: module.OnboardingGate })),
);
const GradefyPlans = lazy(() =>
  import('./gradefy/plans').then((module) => ({ default: module.PlanSelection })),
);
const GradefyCatalog = lazy(() =>
  import('./gradefy/catalog').then((module) => ({ default: module.CatalogSelection })),
);
const GradefyBusinessSetup = lazy(() => import('./gradefy/business-setup'));
const GradefyOperations = lazy(() => import('./gradefy/operations'));
const GradefySiteEditor = lazy(() => import('./gradefy/site-editor'));
const GradefyDashboard = lazy(() => import('./gradefy/dashboard'));
const GradefyAgenda = lazy(() => import('./gradefy/agenda'));
const GradefyProfessionalAgenda = lazy(() => import('./gradefy/professional-agenda'));
const GradefyProfessionalSetup = lazy(() => import('./gradefy/professional-setup'));
const GradefyFinance = lazy(() => import('./gradefy/finance'));
const GradefyReports = lazy(() => import('./gradefy/reports'));
const GradefyTeam = lazy(() => import('./gradefy/team'));
const GradefyOperationalSettings = lazy(() => import('./gradefy/operational-settings'));
const GradefyEntryProfile = lazy(() =>
  import('./gradefy/team-entry').then((m) => ({ default: m.EntryProfile })),
);
const GradefyTeamEntry = lazy(() =>
  import('./gradefy/team-entry').then((m) => ({ default: m.TeamEntry })),
);
const GradefyInvite = lazy(() =>
  import('./gradefy/team').then((m) => ({ default: m.AcceptInvitation })),
);
const GradefyClients = lazy(() =>
  import('./gradefy/business-management').then((m) => ({ default: m.Clients })),
);
const GradefyServices = lazy(() =>
  import('./gradefy/business-management').then((m) => ({ default: m.Services })),
);
const GradefyProfessionals = lazy(() =>
  import('./gradefy/business-management').then((m) => ({ default: m.Professionals })),
);
const GradefyCompleted = lazy(() =>
  import('./gradefy/operations').then((m) => ({ default: m.Completed })),
);
const publicPages = (
  <>
    <Route index element={<TemplateHome />} />
    <Route path="agendar" element={<TemplateBooking />} />
    <Route path="minha-conta" element={<TemplateAccount />} />
    <Route path="minhas-reservas" element={<TemplateAccount />} />
    <Route path="minha-conta/perfil" element={<TemplateAccount profile />} />
    <Route path="entrar" element={<TemplateCustomerPage kind="login" />} />
    <Route path="cadastro" element={<TemplateCustomerPage kind="register" />} />
    <Route path="servicos" element={<TemplateCustomerPage kind="services" />} />
    <Route path="horarios" element={<TemplateCustomerPage kind="hours" />} />
    <Route path="esqueci-senha" element={<TemplateRecovery />} />
    <Route path="redefinir-senha" element={<TemplateRecovery reset />} />
    <Route path="*" element={<TemplateMissing />} />
  </>
);
function TemplateMissing() {
  const { site } = useSite();
  return site.company.template === 'gradefy-minisite' ? (
    <div className="ms-client-page">
      <h1>Página não encontrada</h1>
      <p>Volte ao estabelecimento para continuar.</p>
      <Link className="ms-client-button" to="/">
        Voltar ao site
      </Link>
    </div>
  ) : (
    <div className="container not-found">
      <h1>Esse caminho não está na régua.</h1>
      <p>A página que você procurou não foi encontrada.</p>
      <Link className="button primary" to="/">
        Voltar ao início
      </Link>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="app" element={<GradefyShell />}>
            <Route index element={<GradefyWelcome />} />
            <Route path="login" element={<GradefyAccountForm key="login" />} />
            <Route path="cadastro" element={<GradefyAccountForm key="register" register />} />
            <Route path="comecar" element={<GradefyEntryProfile />} />
            <Route path="entrar-equipe" element={<GradefyTeamEntry />} />
            <Route path="conta" element={<GradefyAccountReady />} />
            <Route path="dashboard" element={<GradefyDashboard />} />
            <Route path="agenda" element={<GradefyAgenda />} />
            <Route path="minha-agenda" element={<GradefyProfessionalAgenda />} />
            <Route path="minha-agenda/configurar" element={<GradefyProfessionalSetup />} />
            <Route path="financeiro" element={<GradefyFinance />} />
            <Route path="relatorios" element={<GradefyReports />} />
            <Route path="equipe" element={<GradefyTeam />} />
            <Route path="configuracoes" element={<GradefyOperationalSettings />} />
            <Route path="convite" element={<GradefyInvite />} />
            <Route path="clientes" element={<GradefyClients />} />
            <Route path="servicos" element={<GradefyServices />} />
            <Route path="profissionais" element={<GradefyProfessionals />} />
            <Route path="meu-site" element={<GradefySiteEditor />} />
            <Route path="onboarding" element={<OnboardingGate />}>
              <Route path="plan" element={<GradefyPlans />} />
              <Route path="next" element={<Navigate to="/app/onboarding/niche" replace />} />
              <Route path="niche" element={<GradefyCatalog key="niche" step="niche" />} />
              <Route path="template" element={<GradefyCatalog key="template" step="template" />} />
              <Route path="setup" element={<GradefyBusinessSetup />} />
              <Route path="operations" element={<GradefyOperations />} />
              <Route path="complete" element={<GradefyCompleted />} />
              <Route path="site" element={<GradefySiteEditor onboarding />} />
              <Route index element={<GradefyPlans />} />
            </Route>
            <Route path="esqueci-senha" element={<GradefyRecovery key="forgot" />} />
            <Route path="redefinir-senha" element={<GradefyRecovery key="reset" reset />} />
            <Route path="*" element={<GradefyMissing />} />
          </Route>
          <Route element={<SiteShell />}>{publicPages}</Route>
          <Route path="preview/gradefy-minisite" element={<SiteShell preview />}>
            <Route index element={<TemplateHome />} />
            <Route
              path="*"
              element={<p className="container not-found">Operação indisponível na prévia.</p>}
            />
          </Route>
          <Route path="preview/barber-classic" element={<SiteShell preview />}>
            <Route index element={<TemplateHome />} />
            <Route path="*" element={<p className="container not-found">Preview</p>} />
          </Route>
          <Route path="preview/site/:previewCompanyId" element={<SiteShell privatePreview />}>
            <Route index element={<TemplateHome />} />
            <Route
              path="*"
              element={<p className="container not-found">Operação indisponível na prévia.</p>}
            />
          </Route>
          <Route
            path="admin"
            element={
              <SiteShell admin>
                <Admin />
              </SiteShell>
            }
          >
            {/* Reserve legacy admin URLs ahead of equally specific company pages. */}
            <Route index />
            <Route path=":adminPage" />
            <Route path="agenda/configuracoes" />
            <Route path="*" />
          </Route>
          <Route path=":companySlug" element={<SiteShell />}>
            {publicPages}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
