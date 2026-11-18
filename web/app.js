import { Eyes } from './eyes.js';
import { Ears, wakeWord } from './voice.js';

const $ = (id) => document.getElementById(id);
const eyes = new Eyes($('eyes'));
window.claudio = { eyes }; // para depurar desde la consola

// ---------- Pie: fecha y tiempo ----------
// La hora ya la da el iPhone (también en modo kiosco): aquí solo "Miércoles - 18-11-26".
const LOCALE = 'es-ES';
function tickDate() {
  const now = new Date();
  const wd = now.toLocaleDateString(LOCALE, { weekday: 'long' });
  const p2 = (n) => String(n).padStart(2, '0');
  $('date').textContent = `${wd[0].toUpperCase()}${wd.slice(1)} - ${p2(now.getDate())}-${p2(now.getMonth() + 1)}-${p2(now.getFullYear() % 100)}`;
}
tickDate();
setInterval(tickDate, 60_000);

async function loadWeather() {
  try {
    const r = await fetch('api/weather', { cache: 'no-store' });
    if (!r.ok) return;
    const w = await r.json();
    const el = $('weather');
    el.textContent = `${w.icon} ${w.temp}°`;
    const range = document.createElement('span');
    range.className = 'range';
    // Hueco justo en el pie: la lluvia solo si es probable; máximas y mínimas, en el título
    if (w.today.rain >= 40) { range.textContent = `💧${w.today.rain}%`; el.appendChild(range); }
    el.title = `${w.place}: ${w.text}. Hoy ${w.today.text}, ${w.today.min}–${w.today.max}°; mañana ${w.tomorrow.text}, ${w.tomorrow.min}–${w.tomorrow.max}°`;
  } catch { /* se queda lo último */ }
}
loadWeather();
setInterval(loadWeather, 15 * 60_000);

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
  if (viewSpec) { hideView(); return; } // tocar los ojos = "vale, ya lo he visto"
  if (eyes.state === 'sleeping') {
    manualUntil = Date.now() + 2 * 60_000;
    document.body.classList.remove('night');
    eyes.setState('sleepy');
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => { eyes.setState('idle'); applyNight(); }, 4000);
    return;
  }
  // Con la voz activada, un toque = "te escucho" (sin decir "Claudio")
  if (voiceMode === 'idle') { enterCommand(); return; }
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

// ---------- Panel: "Próximo" o lo que Claudio enseña ----------
// En reposo: "Próximo". Cuando Claudio usa `show`, el panel crece sobre los ojos con esa
// vista y vuelve solo tras SHOW_MS sin tocarlo, al cerrarlo o con una respuesta que no enseña nada.
const SHOW_MS = 60_000;
let viewSpec = null;   // null = "Próximo"
let showTimer = null;
let turnShown = false; // ¿la respuesta en curso ha enseñado algo?

function rowEl(r) {
  const li = document.createElement('li');
  if (r.done) li.classList.add('done');
  if (r.kind !== 'entry') {
    const w = whenLabel(r.at);
    const when = document.createElement('span');
    when.className = 'when' + (w.overdue && r.kind !== 'event' ? ' overdue' : '');
    when.textContent = r.kind === 'routine' && !r.at ? 'Sin estimar' : w.text;
    li.appendChild(when);
  }
  const main = document.createElement('span');
  main.className = 'main';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = r.title ?? '';
  main.appendChild(title);
  // La categoría solo en "Próximo": en las vistas de Claudio ya agrupa por ella
  const meta = [viewSpec ? null : r.category, r.detail].filter(Boolean).join(' · ');
  if (meta) {
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = meta;
    main.appendChild(m);
  }
  li.appendChild(main);
  if (r.kind !== 'event') {
    const check = document.createElement('button');
    check.className = 'check' + (r.kind === 'routine' ? ' loop' : '');
    check.type = 'button';
    check.setAttribute('aria-label', r.kind === 'routine' ? `Hecho hoy: "${r.title}"` : `Marcar "${r.title}"`);
    check.addEventListener('click', () => markDone(r, li));
    li.appendChild(check);
  }
  return li;
}

function renderView(v) {
  $('panel-title').textContent = v.title;
  const box = $('panel-body');
  box.innerHTML = '';
  const groups = v.groups.filter((g) => g.rows.length);
  if (!groups.length) {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = viewSpec ? 'Aquí no hay nada.' : 'Nada por ahora. Pídeme que te apunte algo.';
    ul.appendChild(li);
    box.appendChild(ul);
    return;
  }
  for (const g of groups) {
    if (g.title) {
      const h = document.createElement('h3');
      h.textContent = g.title;
      box.appendChild(h);
    }
    const ul = document.createElement('ul');
    for (const r of g.rows) ul.appendChild(rowEl(r));
    box.appendChild(ul);
  }
}

async function loadView() {
  const spec = viewSpec;
  try {
    const q = spec ? `?spec=${encodeURIComponent(JSON.stringify(spec))}` : '';
    const r = await fetch(`api/view${q}`, { cache: 'no-store' });
    const v = await r.json();
    if (spec !== viewSpec) return; // cambió mientras tanto
    if (!r.ok) { if (spec) hideView(); return; }
    renderView(v);
  } catch { /* se queda lo último pintado */ }
}

function showView(spec, note) {
  if (!spec || !Object.keys(spec).length) { hideView(); return; }
  const same = JSON.stringify(spec) === JSON.stringify(viewSpec);
  viewSpec = spec;
  turnShown = true;
  if (note !== undefined) $('panel-note').textContent = note;
  if (!same) {
    $('panel-note').textContent = note ?? '';
    $('panel-body').scrollTop = 0;
    document.body.classList.add('showing');
    $('panel-close').hidden = false;
    // Claudio mira hacia lo que enseña
    const r = $('panel').getBoundingClientRect();
    eyes.lookAt(r.left + r.width / 2, r.bottom, 2500);
  }
  loadView();
  armShowTimer();
}
function hideView() {
  clearTimeout(showTimer);
  if (!viewSpec) return;
  viewSpec = null;
  document.body.classList.remove('showing');
  $('panel-close').hidden = true;
  $('panel-note').textContent = '';
  loadView();
}
function armShowTimer() {
  clearTimeout(showTimer);
  if (viewSpec) showTimer = setTimeout(hideView, SHOW_MS);
}
// Mientras se mira (scroll, toques), el panel no se cierra
for (const ev of ['pointerdown', 'scroll', 'wheel', 'touchmove']) {
  $('panel-body').addEventListener(ev, armShowTimer, { passive: true });
}
$('panel-close').addEventListener('click', hideView);
window.claudio.show = showView; // depurar: claudio.show({ list: 'Compra' })

async function markDone(r, li) {
  const undo = r.kind === 'entry' && r.done;
  li.classList.toggle('done', !undo);
  const url = { task: 'items', routine: 'routines', entry: 'entries' }[r.kind];
  try {
    const res = await fetch(`api/${url}/${r.id}/done`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !undo }),
    });
    if (!res.ok) throw new Error();
    if (!undo) react('happy', 1500);
  } catch {
    li.classList.toggle('done', undo);
  }
  armShowTimer();
  loadView();
}
renderView({ title: 'Próximo', groups: [] });
loadView();
setInterval(loadView, 5 * 60_000); // red de seguridad; lo normal es el aviso en vivo

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
  if (m.role === 'user') turnShown = false;
  if (m.role === 'assistant' && !waiting && m.text !== lastReply) {
    // Respuesta pedida desde otra pantalla
    say(m.text);
    if (turnShown) $('panel-note').textContent = m.text; else hideView();
  }
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

/** Envía un mensaje a Claudio y devuelve su respuesta (o null si falló). */
async function sendChat(text) {
  if (!text || waiting) return null;
  waiting = true;
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
    if (data.view) showView(data.view, data.reply); else hideView();
    loadChat(); // por si el aviso en vivo no llegó
    if (data.changed) loadView();
    return data.reply;
  } catch (e) {
    const msg = e.message || 'No he podido contestar.';
    const pending = log.querySelector('.pending');
    if (pending) { pending.className = 'error'; pending.textContent = msg; }
    say(msg, { error: true });
    react('sleepy', 2500);
    return null;
  } finally {
    waiting = false;
    $('chat-send').disabled = false;
  }
}

$('chat-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || waiting) return;
  input.value = '';
  sendChat(text);
});

// iOS deja la página desplazada al cerrar el teclado (hueco bajo el pie): se recoloca.
$('chat-input').addEventListener('blur', () => setTimeout(() => window.scrollTo(0, 0), 50));

// Botón de teclado (móvil): abre y cierra el chat
$('kbd').addEventListener('click', () => {
  const open = document.body.classList.toggle('chat-open');
  $('kbd').setAttribute('aria-expanded', String(open));
  if (open) { log.scrollTop = log.scrollHeight; $('chat-input').focus(); eyes.setState('listening'); }
  else { $('chat-input').blur(); if (eyes.state === 'listening') eyes.setState('idle'); }
});

// ---------- Voz ----------
// Modos: idle (espera "Claudio"), command (tras el pitido, espera la orden), busy (transcribiendo/pensando/hablando).
const VOICE_PREF = 'claudio.voice';
const COMMAND_WAIT_MS = 7000;
let ears = null;
let voiceMode = 'off';
let commandTimer = null;
let phraseQueue = Promise.resolve();
let queued = 0;

function setMicUi() {
  const mic = $('mic');
  mic.classList.toggle('on', voiceMode !== 'off');
  mic.classList.toggle('active', voiceMode === 'command');
  mic.setAttribute('aria-pressed', String(voiceMode !== 'off'));
}

async function startVoice() {
  try {
    ears ??= new Ears((wav) => {
      if (queued > 2) return; // demasiada charla de fondo: se descarta
      queued++;
      phraseQueue = phraseQueue.then(() => onPhrase(wav)).finally(() => queued--);
    });
    ears.onLevel = (speaking) => { if (voiceMode === 'command' && speaking) clearTimeout(commandTimer); };
    await ears.start();
    voiceMode = 'idle';
    try { localStorage.setItem(VOICE_PREF, 'on'); } catch {}
    setMicUi();
    return true;
  } catch (e) {
    voiceMode = 'off';
    setMicUi();
    if (e?.message === 'audio-suspended') say('Toca la pantalla para despertar mis oídos.');
    else if (e?.name === 'NotAllowedError') say('No tengo permiso para usar el micrófono.', { error: true });
    else say('No he podido abrir el micrófono.', { error: true });
    return false;
  }
}
function stopVoice() {
  ears?.stop();
  ears = null;
  voiceMode = 'off';
  clearTimeout(commandTimer);
  try { localStorage.setItem(VOICE_PREF, 'off'); } catch {}
  setMicUi();
}

function enterCommand() {
  if (!ears) return;
  voiceMode = 'command';
  setMicUi();
  ears.beep(true);
  react('listening');
  clearTimeout(commandTimer);
  commandTimer = setTimeout(() => {
    if (voiceMode !== 'command') return;
    ears.beep(false);
    backToIdle();
  }, COMMAND_WAIT_MS);
}
function backToIdle() {
  clearTimeout(commandTimer);
  if (voiceMode === 'off') return;
  voiceMode = 'idle';
  setMicUi();
  if (eyes.state === 'listening' || eyes.state === 'thinking') react('idle', 0);
}

async function transcribe(wav) {
  const r = await fetch('api/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
  return data.text ?? '';
}

async function onPhrase(wav) {
  if (voiceMode === 'off' || voiceMode === 'busy') return;
  const wasCommand = voiceMode === 'command';
  if (wasCommand) { clearTimeout(commandTimer); voiceMode = 'busy'; react('thinking'); }
  let text;
  try {
    text = await transcribe(wav);
  } catch (e) {
    if (wasCommand) { say(e.message, { error: true }); backToIdle(); }
    return;
  }
  if (voiceMode === 'off') return;
  let command;
  if (wasCommand) {
    command = text;
  } else {
    command = wakeWord(text);
    if (command === null) return;          // charla que no va con Claudio
    if (command.replace(/[\s.,!?¿¡]/g, '').length < 3) { enterCommand(); return; } // solo "Claudio"
  }
  if (!command.replace(/[\s.,!?¿¡]/g, '')) {
    say('No te he oído bien.');
    backToIdle();
    return;
  }
  voiceMode = 'busy';
  setMicUi();
  const reply = await sendChat(command);
  if (reply && ears) await speakReply(reply);
  if (voiceMode === 'off') return;
  // Si Claudio pregunta algo, se puede contestar sin volver a llamarlo
  if (reply && /\?\s*$/.test(reply)) enterCommand();
  else backToIdle();
}

async function speakReply(text) {
  try {
    const r = await fetch('api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const audio = await r.arrayBuffer();
    eyes.setState('talking');
    await ears.play(audio);
    eyes.setState('idle');
  } catch { /* sin voz: queda el texto */ }
}

window.claudio.voice = () => ({ mode: voiceMode, ears }); // depurar desde la consola
$('mic').addEventListener('click', () => { if (voiceMode === 'off') startVoice(); else stopVoice(); });
// Si estaba activada, se intenta al cargar; si iOS exige un toque, el primero que llegue la arranca.
try {
  if (localStorage.getItem(VOICE_PREF) === 'on') {
    startVoice().then((ok) => {
      if (ok) return;
      document.addEventListener('pointerdown', () => { if (voiceMode === 'off') startVoice(); }, { once: true });
    });
  }
} catch {}

// ---------- Avisos en vivo (SSE) ----------
function connectStream() {
  const es = new EventSource('api/stream');
  es.addEventListener('items', () => loadView());
  es.addEventListener('show', (ev) => {
    try { showView(JSON.parse(ev.data)); } catch { /* aviso raro */ }
  });
  es.addEventListener('chat', (ev) => {
    try { addMessage(JSON.parse(ev.data)); } catch { /* mensaje raro */ }
  });
  // EventSource reconecta solo; al volver, refrescamos por si nos perdimos algo.
  es.addEventListener('hello', () => { loadView(); });
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
    if (knownVersion && h.version !== knownVersion && !waiting && !$('chat-input').value && (voiceMode === 'off' || voiceMode === 'idle')) location.reload();
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
  if (document.visibilityState === 'visible') { keepAwake(); checkHealth(); loadView(); loadWeather(); }
});

// ---------- Service worker (para instalar la PWA) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
