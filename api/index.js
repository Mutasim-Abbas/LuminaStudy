// The API on Vercel. vercel.json rewrites every /api/* request to this one
// function, which hands it to the Fastify app (server/src/vercel.ts). The
// server is compiled to server/dist during the Vercel build.
import { vercelHandler } from '../server/dist/vercel.js';

export default await vercelHandler();
