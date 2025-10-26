import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // Use root base when developing, use repo subpath when building for GitHub Pages
  const base = command === 'serve' ? '/' : '/Particle-ecosystem/';

  return {
    base,
    plugins: [react()],
    server: {
      // keep the host you previously added for CodeSandbox or similar
      allowedHosts: ['d7hkk3-5173.csb.app']
    }
  };
});
