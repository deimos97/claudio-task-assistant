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
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = it.when ?? '';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = it.title ?? '';
    li.append(when, title);
    ul.appendChild(li);
  }
}
async function loadUpcoming() {
  try {
    const r = await fetch('api/upcoming', { cache: 'no-store' });
    renderUpcoming((await r.json()).items ?? []);
  } catch { /* se queda lo último pintado */ }
}
renderUpcoming([]);
loadUpcoming();
setInterval(loadUpcoming, 60_000);

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
    if (knownVersion && h.version !== knownVersion) location.reload();
    knownVersion = h.version;
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
