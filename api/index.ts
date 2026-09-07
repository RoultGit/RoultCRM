import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../apps/api/src/app.js';

// Un solo proyecto de Vercel sirve el frontend y el backend. Como comparten origen, no hace falta
// CORS y la cookie de refresh deja de ser cross-site, que es la fuente habitual de problemas con
// SameSite y con las URLs cambiantes de cada preview.
const app = createApp();

// Vercel entrega el request con el prefijo /api intacto, pero los routers de Express están montados
// en la raíz (/auth, /deals, …) y así corren también en local. Se quita el prefijo acá para que el
// mismo código sirva en los dos lados.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = req.url?.replace(/^\/api(?=\/|$)/, '') || '/';
  return app(req, res);
}
