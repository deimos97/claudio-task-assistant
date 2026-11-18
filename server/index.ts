// Backend de Claudio: sirve la PWA (web/) y la API.
// Se ejecuta con Node >= 24 directamente (type stripping), sin paso de build.
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import Anthropic from '@anthropic-ai/sdk';
import { DB_FILE, ENV, PORT, ROOT } from './config.ts';
import './db.ts';
import { subscribe } from './bus.ts';
import { completeItem, InputError, upcoming } from './items.ts';
import { chat, chatConfigured, recentMessages } from './chat.ts';

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

// Los POST exigen JSON: un formulario de otra web no puede enviarlo sin
// preflight CORS (que no respondemos), así que sirve de protección CSRF.
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'POST' && !(c.req.header('content-type') ?? '').startsWith('application/json')) {
    return c.json({ error: 'Se espera JSON' }, 415);
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, env: ENV, version: version(), chat: chatConfigured() }));

app.get('/api/upcoming', (c) => c.json({ items: upcoming() }));

app.post('/api/items/:id/done', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json({ item: completeItem(Number(c.req.param('id')), body?.done !== false) });
  } catch (e) {
    if (e instanceof InputError) return c.json({ error: e.message }, 404);
    throw e;
  }
});

app.get('/api/chat', (c) => c.json({ messages: recentMessages(30) }));

app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'Mensaje vacío' }, 400);
  if (text.length > 4000) return c.json({ error: 'Mensaje demasiado largo' }, 400);
  if (!chatConfigured()) return c.json({ error: 'Claudio aún no tiene clave de Anthropic.' }, 503);
  try {
    return c.json(await chat(text));
  } catch (e) {
    console.error('chat:', e);
    if (e instanceof Anthropic.AuthenticationError) return c.json({ error: 'La clave de Anthropic no es válida.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return c.json({ error: 'Demasiadas peticiones; espera un poco.' }, 503);
    if (e instanceof Anthropic.APIError) return c.json({ error: `La API ha fallado (${e.status ?? 'red'}).` }, 502);
    return c.json({ error: 'Algo ha fallado en el servidor.' }, 500);
  }
});

// Avisos en vivo: "items" (cambió la agenda) y "chat" (mensaje nuevo).
app.get('/api/stream', (c) =>
  streamSSE(c, async (stream) => {
    c.header('X-Accel-Buffering', 'no'); // que nginx no acumule los avisos
    const off = subscribe((event, data) => { void stream.writeSSE({ event, data: JSON.stringify(data) }); });
    stream.onAbort(off);
    await stream.writeSSE({ event: 'hello', data: JSON.stringify({ version: version() }) });
    while (!stream.aborted) {
      await stream.sleep(25_000);
      await stream.writeSSE({ event: 'ping', data: '{}' });
    }
    off();
  }),
);

// serveStatic espera una ruta relativa al directorio de trabajo.
app.use('/*', serveStatic({ root: relative(process.cwd(), join(ROOT, 'web')) || '.' }));

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Claudio [${ENV}] ${version()} escuchando en http://0.0.0.0:${info.port} · BD ${DB_FILE}`);
});
