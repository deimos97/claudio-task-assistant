import { Eyes } from './eyes.js';

const $ = (id) => document.getElementById(id);
const eyes = new Eyes($('eyes'));
window.claudio = { eyes }; // para depurar desde la consola

// ---------- Reloj ----------
const LOCALE = 'es-ES';
function tickClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
}
tickClock();
setInterval(tickClock, 10_000);

// ---------- Modo noche: Claudio duerme y la pantalla se atenúa ----------
const NIGHT_FROM = 23 * 60;      // 23:00
const NIGHT_TO = 7 * 60 + 30;    // 07:30
let manualUntil = 0;             // tras tocarlo, se queda despierto un rato
function isNight() {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= NIGHT_FROM || m < NIGHT_TO;
}
function applyNight() {
  const night = isNight() && Date.now() > manualUntil;
  document.body.classList.toggle('night', night);
  if (night) eyes.setState('sleeping');
  else if (eyes.state === 'sleeping') eyes.setState('idle');
}
applyNight();
setInterval(applyNight, 30_000);

// ---------- Interacción ----------
const face = $('face');
let pressTimer = null;
let happyTimer = null;
face.addEventListener('pointerdown', (ev) => {
  eyes.lookAt(ev.clientX, ev.clientY);
  pressTimer = setTimeout(() => { $('debug').hidden = !$('debug').hidden; pressTimer = null; }, 800);
});
face.addEventListener('pointermove', (ev) => eyes.lookAt(ev.clientX, ev.clientY));
face.addEventListener('pointerup', () => {
  if (!pressTimer) return; // fue pulsación larga
  clearTimeout(pressTimer);
  pressTimer = null;
  if (eyes.state === 'sleeping') {
    manualUntil = Date.now() + 2 * 60_000;
    document.body.classList.remove('night');
    eyes.setState('sleepy');
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => { eyes.setState('idle'); applyNight(); }, 4000);
    return;
  }
  // Un toque = Claudio se alegra un momento
  const prev = eyes.state === 'happy' ? 'idle' : eyes.state;
  eyes.setState('happy');
  clearTimeout(happyTimer);
  happyTimer = setTimeout(() => eyes.setState(prev), 1800);
});
// Las miradas también siguen al dedo en el resto de la pantalla
document.addEventListener('pointerdown', (ev) => { if (!face.contains(ev.target)) eyes.lookAt(ev.clientX, ev.clientY); });

$('debug').addEventListener('click', (ev) => {
  const s = ev.target?.dataset?.state;
  if (!s) return;
  clearTimeout(happyTimer);
  manualUntil = s === 'sleeping' ? 0 : Date.now() + 10 * 60_000;
  eyes.setState(s);
  $('caption').textContent = s;
});

// ---------- Próximo ----------
const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "Hoy 18:00", "Mañana", "jue 20", "3 dic"… a partir de "YYYY-MM-DD[THH:MM]" (hora local)
function whenLabel(at) {
  if (!at) return { text: 'Sin fecha', overdue: false };
  const [date, time] = at.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / DAY);
  let text;
  if (diff === 0) text = 'Hoy';
  else if (diff === 1) text = 'Mañana';
  else if (diff === -1) text = 'Ayer';
  else if (diff > 1 && diff < 7) text = day.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' });
  else text = day.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  if (time) text += ` ${time}`;
  return { text, overdue: at < (time ? `${isoDate(new Date())}T${new Date().toTimeString().slice(0, 5)}` : isoDate(new Date())) };
}

function renderUpcoming(items) {
  const ul = $('upcoming-list');
  ul.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nada por ahora. Pídeme que te apunte algo.';
    ul.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    const w = whenLabel(it.at);
    const when = document.createElement('span');
    when.className = 'when' + (w.overdue && it.kind === 'task' ? ' overdue' : '');
    when.textContent = w.text;
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = it.title ?? '';
    li.append(when, title);
    if (it.kind === 'task') {
      const check = document.createElement('button');
      check.className = 'check';
      check.type = 'button';
      check.setAttribute('aria-label', `Marcar "${it.title}" como hecha`);
      check.addEventListener('click', () => completeTask(it, li));
      li.appendChild(check);
    }
    ul.appendChild(li);
  }
}
async function loadUpcoming() {
  try {
    const r = await fetch('api/upcoming', { cache: 'no-store' });
    renderUpcoming((await r.json()).items ?? []);
  } catch { /* se queda lo último pintado */ }
}
async function completeTask(item, li) {
  li.classList.add('done');
  try {
    const r = await fetch(`api/items/${item.id}/done`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!r.ok) throw new Error();
    react('happy', 1500);
  } catch {
    li.classList.remove('done');
  }
  loadUpcoming();
}
renderUpcoming([]);
loadUpcoming();
setInterval(loadUpcoming, 5 * 60_000); // red de seguridad; lo normal es el aviso en vivo

// ---------- Reacciones de los ojos ----------
let reactTimer = null;
function react(state, ms, then = 'idle') {
  manualUntil = Math.max(manualUntil, Date.now() + 2 * 60_000); // hablarle lo despierta
  document.body.classList.remove('night');
  clearTimeout(reactTimer);
  eyes.setState(state);
  if (ms) reactTimer = setTimeout(() => { eyes.setState(then); applyNight(); }, ms);
}
let captionTimer = null;
function say(text, { error = false } = {}) {
  const cap = $('caption');
  cap.textContent = text;
  cap.classList.toggle('error', error);
  cap.classList.remove('fade');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => cap.classList.add('fade'), 25_000);
  if (!error) {
    const talk = Math.min(4500, 900 + text.length * 45);
    react('talking', talk, 'happy');
    setTimeout(() => { if (eyes.state === 'happy') react('idle', 0); }, talk + 1200);
  }
}

// ---------- Chat ----------
const log = $('log');
const seen = new Set();
let waiting = false;   // hay una pregunta nuestra en curso
let lastReply = '';    // para no repetir la animación si llega también por el aviso en vivo
function addMessage(m) {
  if (m.id != null) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    // Nuestro propio mensaje, ya pintado al enviarlo
    const mine = [...log.querySelectorAll('li.local')].find((el) => el.textContent === m.text);
    if (mine) { mine.classList.remove('local'); return; }
  }
  const li = document.createElement('li');
  li.className = m.role + (m.id == null ? ' local' : '');
  li.textContent = m.text;
  const pending = log.querySelector('.pending');
  if (m.role === 'assistant') pending?.remove();
  if (pending && m.role === 'user') log.insertBefore(li, pending); else log.appendChild(li);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (m.role === 'assistant' && !waiting && m.text !== lastReply) say(m.text); // respuesta pedida desde otra pantalla
}
async function loadChat() {
  try {
    const r = await fetch('api/chat', { cache: 'no-store' });
    const messages = (await r.json()).messages ?? [];
    log.innerHTML = '';
    for (const m of messages) {
      seen.add(m.id);
      const li = document.createElement('li');
      li.className = m.role;
      li.textContent = m.text;
      log.appendChild(li);
    }
    if (waiting) log.appendChild(pendingBubble());
    log.scrollTop = log.scrollHeight;
  } catch { /* sin conexión */ }
}
function pendingBubble() {
  const li = document.createElement('li');
  li.className = 'assistant pending';
  li.textContent = '…';
  return li;
}
loadChat();

$('chat-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || waiting) return;
  waiting = true;
  input.value = '';
  $('chat-send').disabled = true;
  addMessage({ role: 'user', text, id: null });
  log.appendChild(pendingBubble());
  log.scrollTop = log.scrollHeight;
  react('thinking');
  try {
    const r = await fetch('api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
    waiting = false;
    lastReply = data.reply;
    say(data.reply);
    await loadChat(); // por si el aviso en vivo no llegó
    if (data.changed) loadUpcoming();
  } catch (e) {
    const msg = e.message || 'No he podido contestar.';
    const pending = log.querySelector('.pending');
    if (pending) { pending.className = 'error'; pending.textContent = msg; }
    say(msg, { error: true });
    react('sleepy', 2500);
  } finally {
    waiting = false;
    $('chat-send').disabled = false;
  }
});

// Botón de teclado (móvil): abre y cierra el chat
$('kbd').addEventListener('click', () => {
  const open = document.body.classList.toggle('chat-open');
  $('kbd').setAttribute('aria-expanded', String(open));
  if (open) { log.scrollTop = log.scrollHeight; $('chat-input').focus(); eyes.setState('listening'); }
  else { $('chat-input').blur(); if (eyes.state === 'listening') eyes.setState('idle'); }
});

// ---------- Avisos en vivo (SSE) ----------
function connectStream() {
  const es = new EventSource('api/stream');
  es.addEventListener('items', () => loadUpcoming());
  es.addEventListener('chat', (ev) => {
    try { addMessage(JSON.parse(ev.data)); } catch { /* mensaje raro */ }
  });
  // EventSource reconecta solo; al volver, refrescamos por si nos perdimos algo.
  es.addEventListener('hello', () => { loadUpcoming(); });
}
connectStream();

// ---------- Salud y auto-actualización ----------
// Si la versión del servidor cambia (nuevo despliegue), la PWA se recarga sola.
let knownVersion = null;
async function checkHealth() {
  const dot = $('status');
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    const h = await r.json();
    dot.className = 'status ok';
    dot.title = `${h.env} · ${h.version}`;
    if (knownVersion && h.version !== knownVersion && !waiting && !$('chat-input').value) location.reload();
    knownVersion = h.version;
    $('chat-input').placeholder = h.chat ? 'Escribe a Claudio…' : 'Falta la clave de Anthropic';
  } catch {
    dot.className = 'status bad';
    dot.title = 'Sin conexión con el servidor';
  }
}
checkHealth();
setInterval(checkHealth, 30_000);

// ---------- Pantalla siempre encendida ----------
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* sin permiso o no soportado: se confía en "Bloqueo automático: Nunca" */ }
}
keepAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { keepAwake(); checkHealth(); loadUpcoming(); }
});

// ---------- Service worker (para instalar la PWA) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
