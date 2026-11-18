// Backend de Claudio: sirve la PWA (web/) y la API.
// Se ejecuta con Node >= 24 directamente (type stripping), sin paso de build.
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { stream, streamSSE } from 'hono/streaming';
import Anthropic from '@anthropic-ai/sdk';
import { DB_FILE, ENV, isWho, PORT, ROOT } from './config.ts';
import './db.ts';
import { subscribe } from './bus.ts';
import { completeItem, createItem, deleteItem, getItem, InputError, listItems, updateItem, upcoming } from './items.ts';
import { chat, chatConfigured, recentMessages, usageSummary } from './chat.ts';
import { speak, transcribe, VoiceError } from './voice.ts';
import { addToList, allLists, checkEntries, clearList, entries, removeEntries, updateEntry } from './lists.ts';
import { createRoutine, deleteRoutine, doneRoutine, listRoutines, updateRoutine } from './routines.ts';
import { deployStatus, nudges, seeNudge } from './nudges.ts';
import { buildView, checkSpec } from './view.ts';
import { weather } from './weather.ts';

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

// Los POST exigen JSON (o WAV en /api/stt): un formulario de otra web no puede
// enviarlos sin preflight CORS (que no respondemos), así que sirve de protección CSRF.
app.use('/api/*', async (c, next) => {
  const type = c.req.header('content-type') ?? '';
  const ok = type.startsWith('application/json') || (c.req.path === '/api/stt' && type.startsWith('audio/wav'));
  if (c.req.method === 'POST' && !ok) {
    return c.json({ error: 'Tipo de contenido no admitido' }, 415);
  }
  await next();
});

app.get('/api/health', (c) => {
  const d = deployStatus();
  return c.json({ ok: true, env: ENV, version: version(), chat: chatConfigured(), deploy: d ? { ok: d.ok, commit: d.commit, at: d.at } : null });
});

app.get('/api/upcoming', (c) => c.json({ items: upcoming() }));

// Lo que enseña el panel: ?spec={...} (la de la herramienta `show`); sin spec, "Próximo".
app.get('/api/view', (c) => {
  try {
    const raw = c.req.query('spec');
    return c.json(buildView(checkSpec(raw ? JSON.parse(raw) : {})));
  } catch (e) {
    if (e instanceof InputError || e instanceof SyntaxError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

// Marcar como hecho desde la pantalla: tareas, rutinas y entradas de lista.
const done = (fn: (id: number, done: boolean, body: Record<string, unknown>) => unknown) => async (c: Context) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) ?? {};
    return c.json({ ok: true, result: fn(Number(c.req.param('id')), body?.done !== false, body) });
  } catch (e) {
    if (e instanceof InputError) return c.json({ error: e.message }, 404);
    throw e;
  }
};
app.post('/api/items/:id/done', done((id, d) => completeItem(id, d)));
app.post('/api/routines/:id/done', done((id, _d, b) => doneRoutine({ id, done_at: b.done_at, value: b.value })));
app.post('/api/entries/:id/done', done((id, d) => checkEntries([id], d)));

// Avisos que esperan en pantalla a que alguien los toque (ver server/nudges.ts)
app.get('/api/nudges', (c) => c.json({ nudges: nudges() }));
app.post('/api/nudges/seen', async (c) => {
  try {
    seeNudge((await c.req.json().catch(() => ({})))?.key);
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof InputError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

// ---------- Gestión (web/admin.html): crear, cambiar y borrar sin pasar por Claudio ----------
type Handler = (c: Context) => unknown | Promise<unknown>;
const api = (fn: Handler) => async (c: Context) => {
  try {
    return c.json(await fn(c) ?? { ok: true });
  } catch (e) {
    if (e instanceof InputError) return c.json({ error: e.message }, 400);
    throw e;
  }
};
const body = async (c: Context) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
const idOf = (c: Context) => Number(c.req.param('id'));

app.get('/api/items', api((c) => ({ items: listItems({ includeDone: c.req.query('done') === '1' }) })));
app.post('/api/items', api(async (c) => createItem(await body(c))));
app.post('/api/items/:id', api(async (c) => updateItem({ ...(await body(c)), id: idOf(c) })));
app.delete('/api/items/:id', api((c) => deleteItem(idOf(c))));
app.get('/api/items/:id', api((c) => getItem(idOf(c)) ?? (() => { throw new InputError('no existe'); })()));

app.get('/api/lists', api(() => ({ lists: allLists().map((l) => ({ ...l, entries: entries(l.id, true) })) })));
app.post('/api/lists/entries', api(async (c) => addToList(await body(c))));
app.post('/api/lists/clear', api(async (c) => { const b = await body(c); return clearList(b.list, b.whole === true); }));
app.post('/api/entries/:id', api(async (c) => updateEntry({ ...(await body(c)), id: idOf(c) })));
app.delete('/api/entries/:id', api((c) => ({ removed: removeEntries([idOf(c)]) })));

app.get('/api/routines', api(() => ({ routines: listRoutines() })));
app.post('/api/routines', api(async (c) => createRoutine(await body(c))));
app.post('/api/routines/:id', api(async (c) => updateRoutine({ ...(await body(c)), id: idOf(c) })));
app.delete('/api/routines/:id', api((c) => deleteRoutine(idOf(c))));

app.get('/api/weather', async (c) => {
  const w = await weather();
  return w ? c.json(w) : c.json({ error: 'Sin datos del tiempo' }, 503);
});

app.get('/api/usage', (c) => c.json(usageSummary()));

app.get('/api/chat', (c) => c.json({ messages: recentMessages(30) }));

function chatError(e: unknown): { error: string; status: 500 | 502 | 503 } {
  console.error('chat:', e);
  if (e instanceof Anthropic.AuthenticationError) return { error: 'La clave de Anthropic no es válida.', status: 502 };
  if (e instanceof Anthropic.RateLimitError) return { error: 'Demasiadas peticiones; espera un poco.', status: 503 };
  if (e instanceof Anthropic.APIError) return { error: `La API ha fallado (${e.status ?? 'red'}).`, status: 502 };
  return { error: 'Algo ha fallado en el servidor.', status: 500 };
}

// Con "Accept: application/x-ndjson" la respuesta llega en trozos, una línea JSON cada uno:
// {"t":"text","d":"…"} según la escribe el modelo y al final {"t":"done",reply,changed,view}
// (o {"t":"error",error}). La pantalla empieza a decir la primera frase sin esperar al resto.
app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'Mensaje vacío' }, 400);
  if (text.length > 4000) return c.json({ error: 'Mensaje demasiado largo' }, 400);
  if (!chatConfigured()) return c.json({ error: 'Claudio aún no tiene clave de Anthropic.' }, 503);
  const who = isWho(body?.who) ? body.who : null;
  if ((c.req.header('accept') ?? '').includes('application/x-ndjson')) {
    c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    c.header('X-Accel-Buffering', 'no'); // que nginx no acumule los trozos
    return stream(c, async (s) => {
      const line = (o: unknown) => s.write(`${JSON.stringify(o)}\n`);
      try {
        const r = await chat(text, who, (d) => { void line({ t: 'text', d }); });
        await line({ t: 'done', ...r });
      } catch (e) {
        await line({ t: 'error', error: chatError(e).error });
      }
    });
  }
  try {
    return c.json(await chat(text, who));
  } catch (e) {
    const { error, status } = chatError(e);
    return c.json({ error }, status);
  }
});

// Voz: WAV de 16 kHz → texto, y texto → audio con la voz de Claudio.
app.post('/api/stt', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > 3_000_000) return c.json({ error: 'Audio demasiado largo' }, 413);
  const wav = await c.req.arrayBuffer();
  if (wav.byteLength > 3_000_000) return c.json({ error: 'Audio demasiado largo' }, 413);
  try {
    return c.json({ text: await transcribe(wav) });
  } catch (e) {
    if (e instanceof VoiceError) return c.json({ error: e.message }, 502);
    throw e;
  }
});

app.post('/api/tts', async (c) => {
  const body = await c.req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text : '';
  try {
    // `context`: la respuesta entera hasta esta frase, para acertar el idioma con frases cortas
    const context = typeof body?.context === 'string' ? body.context : undefined;
    const { audio, type } = await speak(text, isWho(body?.who) ? body.who : null, context);
    return c.body(new Uint8Array(audio), 200, { 'Content-Type': type });
  } catch (e) {
    if (e instanceof VoiceError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

// Avisos en vivo: "items" (cambió algo), "chat" (mensaje nuevo), "show" (Claudio enseña algo).
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

// Detector de caras (MediaPipe) para web/camera.js: se sirve desde node_modules, sin CDN.
app.use('/vendor/mediapipe/*', serveStatic({
  root: relative(process.cwd(), join(ROOT, 'node_modules/@mediapipe/tasks-vision')) || '.',
  rewriteRequestPath: (p) => p.replace(/^\/vendor\/mediapipe/, ''),
}));

// serveStatic espera una ruta relativa al directorio de trabajo.
app.use('/*', serveStatic({
  root: relative(process.cwd(), join(ROOT, 'web')) || '.',
  // Hono no conoce .m4a; Safari necesita el tipo para reproducirlo
  onFound: (path, c) => { if (path.endsWith('.m4a')) c.header('Content-Type', 'audio/mp4'); },
}));

void weather(); // primera consulta del tiempo al arrancar, para que el chat no espere

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`Claudio [${ENV}] ${version()} escuchando en http://0.0.0.0:${info.port} · BD ${DB_FILE}`);
});
