import { SiteLink as Link } from './site-context';
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SiteShell, TemplateHome } from './templates/barber-classic';

import { ScrollToTop, Spinner } from './components/UI';

import './styles.css';
const Booking = lazy(() => import('./pages/Booking'));
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
const Profile = lazy(() => import('./pages/Profile'));
const PasswordRecovery = lazy(() => import('./pages/PasswordRecovery'));
const publicPages = (
  <>
    <Route index element={<TemplateHome />} />
    <Route path="agendar" element={<Booking />} />
    <Route path="minha-conta" element={<Account />} />
    <Route path="minha-conta/perfil" element={<Profile />} />
    <Route path="esqueci-senha" element={<PasswordRecovery />} />
    <Route path="redefinir-senha" element={<PasswordRecovery />} />
    <Route
      path="*"
      element={
        <div className="container not-found">
          <h1>Esse caminho não está na régua.</h1>
          <p>A página que você procurou não foi encontrada.</p>
          <Link className="button primary" to="/">
            Voltar ao início
          </Link>
        </div>
      }
    />
  </>
);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<SiteShell />}>{publicPages}</Route>
          <Route path="preview/barber-classic" element={<SiteShell preview />}>
            <Route index element={<TemplateHome />} />
            <Route path="*" element={<p className="container not-found">Preview</p>} />
          </Route>
          <Route
            path="admin/*"
            element={
              <SiteShell admin>
                <Admin />
              </SiteShell>
            }
          />
          <Route path=":companySlug" element={<SiteShell />}>
            {publicPages}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
