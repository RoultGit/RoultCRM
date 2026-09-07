// Punto de entrada para Vercel. Vercel no mantiene un proceso vivo escuchando en un puerto: invoca
// esta función por request. La app de Express se exporta tal cual y sirve de handler, así que el
// código de negocio es exactamente el mismo que corre en local con `npm run dev:api`.
import { createApp } from '../src/app.js';

export default createApp();
