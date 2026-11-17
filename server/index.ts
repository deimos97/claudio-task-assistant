// Backend de Claudio: sirve la PWA (web/) y la API.
// Se ejecuta con Node >= 24 directamente (type stripping), sin paso de build.
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3111);
const ENV = process.env.CLAUDIO_ENV ?? 'dev';

// Versión = commit actual + fecha del último cambio en web/. La PWA la consulta y
// se recarga sola cuando cambia: un despliegue (o una edición en dev) llega al
// iPhone sin tocarlo.
function gitVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}
function webStamp(): string {
  const dir = join(ROOT, 'web');
  let newest = 0;
  for (const f of readdirSync(dir, { recursive: true })) {
    newest = Math.max(newest, statSync(join(dir, String(f))).mtimeMs);
  }
  return Math.floor(newest).toString(36);
}
const version = () => `${gitVersion()}-${webStamp()}`;

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  // Nada en caché del navegador: el service worker decide.
  c.header('Cache-Control', 'no-cache');
});

app.get('/api/health', (c) => c.json({ ok: true, env: ENV, version: version() }));

// Fase 0: lista vacía. En fase 1 vendrá de la BD (eventos + mantenimiento).
app.get('/api/upcoming', (c) => c.json({ items: [] }));

// serveStatic espera una ruta relativa al directorio de trabajo.
app.use('/*', serveStatic({ root: relative(process.cwd(), join(ROOT, 'web')) || '.' }));

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Claudio [${ENV}] ${version()} escuchando en http://0.0.0.0:${info.port}`);
});
