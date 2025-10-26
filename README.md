# Particle-ecosystem
Particle simulation ecosystem
# Particle Ecosystem — Development

This project is a Vite + React app. The browser must load the app through the Vite dev server (or a built production bundle). If you open `index.html` directly or serve the repository files statically, the browser will attempt to fetch `src/main.jsx` as a raw file (MIME type `text/jsx`) and will refuse to execute it as a module.

To run locally:
1. npm install
2. npm run dev
3. Open the URL printed by the Vite dev server (e.g. http://localhost:5173)

To build for production:
1. npm install
2. npm run build
3. Deploy the contents of the `dist/` directory

If your hosting environment runs `npm start` automatically, add a `start` script that runs the Vite dev server (or serve the built `dist/` in production).
