import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context';
import { Layout } from './components/Layout';
import { ScrollToTop, Spinner } from './components/UI';
import Home from './pages/Home';
import './styles.css';
const Booking = lazy(() => import('./pages/Booking'));
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <ScrollToTop />
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="agendar" element={<Booking />} />
              <Route path="minha-conta" element={<Account />} />
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
            </Route>
            <Route path="admin/*" element={<Admin />} />
          </Routes>
        </Suspense>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
