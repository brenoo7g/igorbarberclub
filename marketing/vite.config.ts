import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Never inherit the parent application's public directory, environment or API proxy.
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  envDir: root,
  envPrefix: 'VITE_MARKETING_',
  plugins: [react()],
  build: { sourcemap: false },
});
