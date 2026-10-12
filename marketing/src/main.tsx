import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import { officialOrigin } from './config';
import './styles.css';

// Headers protect Pages previews even without JavaScript; this also covers local previews.
if (
  window.location.origin !== officialOrigin &&
  window.location.hostname !== 'www.gradefyapp.com.br'
) {
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
}
const root = document.getElementById('root')!;
if (root.hasChildNodes()) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
