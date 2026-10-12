import { renderToString } from 'react-dom/server';
import App from './App';
export { instagramUrl } from './config';

export function render() {
  return renderToString(<App />);
}
