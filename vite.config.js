import { defineConfig } from 'vite';

// base './' : le build fonctionne à la racine (Vercel / Netlify)
// comme dans un sous-dossier servi par Nginx (ex. http://192.168.1.38/lathe/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
});
