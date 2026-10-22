// Vercel serverless entry. `npm run build` compiles the app into dist/ first; vercel.json routes every
// request here and Express does the routing.
export { app as default } from '../dist/app.js';
