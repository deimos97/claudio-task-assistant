import { Eyes } from './eyes.js';
import { Ears, wakeWord } from './voice.js';
import { Watcher } from './camera.js';

const $ = (id) => document.getElementById(id);
const eyes = new Eyes($('eyes'));
window.claudio = { eyes }; // para depurar desde la consola

// ---------- Quién habla: Javier o Ana ----------
// Por voz, el tono medio de la frase (grave = Javier, agudo = Ana); si cae en la zona de
// duda, el dueño del dispositivo. Por teclado, el dueño del dispositivo (botón del pie).
const WHO_PREF = 'claudio.who';
const PEOPLE = { javier: 'Javier', ana: 'Ana' };
// Corte en Hz entre voz grave y aguda; ajustable: localStorage.setItem('claudio.pitchSplit', 160)
const PITCH_SPLIT = (() => { try { return Number(localStorage.getItem('claudio.pitchSplit')) || 150; } catch { return 150; } })();
const PITCH_DOUBT = 10;  // ±Hz alrededor del corte en los que no se decide
let lastPitch = null;
function deviceWho() {
  try { const w = localStorage.getItem(WHO_PREF); return w in PEOPLE ? w : null; } catch { return null; }
}
function whoFromPitch(f0) {
  lastPitch = f0;
  if (!f0) return null;
  if (f0 < PITCH_SPLIT - PITCH_DOUBT) return 'javier';
  if (f0 > PITCH_SPLIT + PITCH_DOUBT) return 'ana';
  return null;
}
/** Kiosco = el iPhone de la mesa (compartido): escucha "Claudio", habla y duerme de noche.
 *  El móvil de Javier o de Ana: el micro es "pulsar para hablar" y no duerme. */
const isKiosk = () => !deviceWho();
window.claudio.who = () => ({ device: deviceWho(), lastPitch, split: PITCH_SPLIT });


// ---------- Pie: fecha y tiempo ----------
// La hora ya la da el iPhone (también en modo kiosco): aquí solo "Mié - 18-11".
const LOCALE = 'es-ES';
function tickDate() {
  const now = new Date();
  const wd = now.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '');
  const p2 = (n) => String(n).padStart(2, '0');
  $('date').textContent = `${wd[0].toUpperCase()}${wd.slice(1)} - ${p2(now.getDate())}-${p2(now.getMonth() + 1)}`;
  $('date').title = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  const night = isKiosk() && isNight() && Date.now() > manualUntil;
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
  pressTimer = setTimeout(() => { $('debug').hidden = !$('debug').hidden; if (!$('debug').hidden) showMetrics(); pressTimer = null; }, 800);
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

// Medidas de la pantalla (se ven con la pulsación larga): para depurar huecos en la PWA
function showMetrics() {
  let el = $('metrics');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'metrics';
    el.className = 'metrics';
    $('debug').prepend(el);
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);height:100lvh;width:100svh';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const m = {
    pantalla: `${screen.width}×${screen.height}`,
    inner: `${innerWidth}×${innerHeight}`,
    visual: visualViewport ? `${Math.round(visualViewport.height)} (top ${Math.round(visualViewport.offsetTop)})` : '-',
    lvh: probe.offsetHeight, svh: probe.offsetWidth,
    body: Math.round(document.body.getBoundingClientRect().height),
    pieAbajo: Math.round(document.querySelector('.foot').getBoundingClientRect().bottom),
    safe: `${cs.paddingTop} / ${cs.paddingBottom}`,
    standalone: navigator.standalone ?? matchMedia('(display-mode: standalone)').matches,
    tono: lastPitch ? `${lastPitch} Hz (corte ${PITCH_SPLIT})` : '-',
    dispositivo: deviceWho() ?? 'compartido',
    scrollY,
  };
  probe.remove();
  el.textContent = Object.entries(m).map(([k, v]) => `${k}: ${v}`).join('\n');
}

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
let lastView = null;   // para repintar cada minuto ("en 25 min") sin pedirla otra vez

// "en 2 h 10 min", "en 25 min", "hace 1 h": solo cuando falta (o pasó) menos de un día
function untilLabel(at) {
  if (!at || !at.includes('T')) return null;
  const mins = Math.round((new Date(`${at}:00`) - Date.now()) / 60_000);
  const abs = Math.abs(mins);
  if (abs >= 24 * 60) return null;
  const h = Math.floor(abs / 60), m = abs % 60;
  const txt = h ? (m && h < 5 ? `${h} h ${m} min` : `${h} h`) : `${Math.max(1, m)} min`;
  return mins >= 0 ? `en ${txt}` : `hace ${txt}`;
}
// Días que faltan para una fecha "YYYY-MM-DD" (negativo si pasó)
const daysTo = (date) => Math.round((new Date(`${date.slice(0, 10)}T12:00`) - new Date(`${isoDate(new Date())}T12:00`)) / DAY);
function relDays(n) {
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}

// Círculo de una rutina: el arco es la parte del ciclo que ya ha pasado; dentro, los días
// que faltan ("!" si ya toca). Tocarlo = "hecho hoy".
function ringEl(r) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('aria-hidden', 'true');
  const p = Math.max(0, Math.min(1, r.progress ?? 0));
  const left = r.at ? daysTo(r.at) : null;
  const due = left !== null && left <= 0;
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('class', 'track');
  const arc = document.createElementNS(NS, 'circle');
  arc.setAttribute('class', 'arc' + (due ? ' due' : p >= 0.8 ? ' soon' : ''));
  arc.setAttribute('pathLength', '100');
  arc.setAttribute('stroke-dasharray', `${Math.max(0.01, p * 100)} 100`);
  for (const c of [track, arc]) { c.setAttribute('cx', '18'); c.setAttribute('cy', '18'); c.setAttribute('r', '15'); svg.appendChild(c); }
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', '18'); t.setAttribute('y', '18');
  t.textContent = left === null ? '?' : due ? '!' : left > 99 ? '99+' : String(left);
  svg.appendChild(t);
  return svg;
}

function rowEl(r) {
  const li = document.createElement('li');
  li.classList.add(r.kind);
  if (r.done) li.classList.add('done');
  // Tarea con margen: antes de empezar, "desde 17 nov"; después, el plazo y los días que quedan
  const today = isoDate(new Date());
  const waiting = r.kind === 'task' && r.start_at && r.start_at > today;
  let margin = null;
  if (r.kind === 'task' && r.start_at && r.at) {
    const left = daysTo(r.at);
    margin = waiting ? `plazo ${whenLabel(r.at).text.toLowerCase()}` : left > 1 ? `quedan ${left} días` : null;
  }
  if (r.past) li.classList.add('past');

  if (r.kind !== 'entry') {
    const when = document.createElement('span');
    when.className = 'when';
    const top = document.createElement('span');
    const sub = document.createElement('small');
    if (r.kind === 'routine') {
      // Rutinas: relativo ("En 2 días"), con el día debajo
      const n = r.at ? daysTo(r.at) : null;
      top.textContent = n === null ? 'Sin estimar' : relDays(n);
      if (n !== null && n < 0) when.classList.add('overdue');
      if (n !== null && Math.abs(n) > 1) sub.textContent = whenLabel(r.at).text;
    } else {
      const w = whenLabel(waiting ? r.start_at : r.at);
      top.textContent = waiting ? `desde ${w.text.toLowerCase()}` : w.text;
      if (waiting) when.classList.add('waiting');
      else if (w.overdue && (r.kind === 'task' || r.past)) when.classList.add('overdue');
      const u = waiting ? null : untilLabel(r.at);
      if (u) { sub.textContent = u; if (!r.past && u.startsWith('en') && !u.includes('h')) sub.className = 'soon'; }
    }
    when.appendChild(top);
    if (sub.textContent) when.appendChild(sub);
    li.appendChild(when);
  }

  const main = document.createElement('span');
  main.className = 'main';
  const title = document.createElement('span');
  title.className = 'title';
  if (r.priority >= 2) {
    const p = document.createElement('span');
    p.className = `prio p${r.priority}`;
    p.textContent = r.priority === 3 ? '‼' : '!';
    p.title = r.priority === 3 ? 'Crítico' : 'Importante';
    title.appendChild(p);
  }
  if (r.priority === 0) li.classList.add('someday');
  title.append(r.title ?? '');
  main.appendChild(title);
  // La categoría solo en "Próximo" (las vistas de Claudio ya agrupan); el dueño, si no es de los dos
  const cat = r.category ? r.category.split('/').map((c) => c[0].toUpperCase() + c.slice(1)).join(' › ') : null;
  const owner = r.owner && viewSpec?.who !== r.owner ? PEOPLE[r.owner] : null;
  const info = r.kind === 'routine' ? (r.cycle ?? r.detail) : r.past ? '¿La tuviste? Márcala o pídeme cambiarla' : r.detail;
  const meta = [owner, viewSpec ? null : cat, margin, info].filter(Boolean).join(' · ');
  if (meta) {
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = meta;
    main.appendChild(m);
  }
  li.appendChild(main);

  const check = document.createElement('button');
  check.type = 'button';
  if (r.kind === 'routine') {
    check.className = 'check ring';
    check.appendChild(ringEl(r));
    check.setAttribute('aria-label', `Hecho hoy: "${r.title}"`);
    check.title = r.detail ?? '';
  } else {
    check.className = 'check';
    check.setAttribute('aria-label', r.kind === 'event' ? `Ya la tuve: "${r.title}"` : `Marcar "${r.title}"`);
  }
  check.addEventListener('click', () => markDone(r, li));
  li.appendChild(check);
  return li;
}

function renderView(v) {
  $('panel-title').textContent = v.title;
  const box = $('panel-body');
  const keep = box.scrollTop;
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
  box.scrollTop = keep;
}

async function loadView() {
  const spec = viewSpec;
  try {
    const q = spec ? `?spec=${encodeURIComponent(JSON.stringify(spec))}` : '';
    const r = await fetch(`api/view${q}`, { cache: 'no-store' });
    const v = await r.json();
    if (spec !== viewSpec) return; // cambió mientras tanto
    if (!r.ok) { if (spec) hideView(); return; }
    lastView = v;
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
  const url = { event: 'items', task: 'items', routine: 'routines', entry: 'entries' }[r.kind];
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
setInterval(() => { if (lastView && !document.hidden) renderView(lastView); }, 60_000);

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
async function sendChat(text, who = deviceWho()) {
  if (!text || waiting) return null;
  waiting = true;
  $('chat-send').disabled = true;
  addMessage({ role: 'user', text, id: null });
  log.appendChild(pendingBubble());
  log.scrollTop = log.scrollHeight;
  react('thinking');
  try {
    const r = await fetch('api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, who }),
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

// iOS deja la página desplazada y la ventana encogida al cerrar el teclado (medido en el
// iPhone: inner 483 y scrollY 365 sin teclado). Cada vez que la ventana visible cambia
// de tamaño sin un campo enfocado, se vuelve arriba; varias veces porque la animación tarda.
function unscroll() {
  if (document.activeElement?.tagName === 'INPUT') return;
  for (const ms of [0, 120, 400, 900]) setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; }, ms);
}
$('chat-input').addEventListener('blur', unscroll);
window.visualViewport?.addEventListener('resize', unscroll);
window.addEventListener('scroll', () => { if (scrollY && document.activeElement?.tagName !== 'INPUT') unscroll(); }, { passive: true });

// Teclado (en el menú, móvil): abre y cierra el chat
function toggleChat(force) {
  const open = document.body.classList.toggle('chat-open', force);
  $('kbd').setAttribute('aria-expanded', String(open));
  if (open) { log.scrollTop = log.scrollHeight; $('chat-input').focus(); eyes.setState('listening'); }
  else { $('chat-input').blur(); if (eyes.state === 'listening') eyes.setState('idle'); }
}
$('kbd').addEventListener('click', () => { closeMenu(); toggleChat(); });

// ---------- Menú del pie: teclado, gestión, perfil del dispositivo, depurar ----------
const menuPop = $('menu-pop');
function closeMenu() { menuPop.hidden = true; $('menu').setAttribute('aria-expanded', 'false'); }
$('menu').addEventListener('click', (ev) => {
  ev.stopPropagation();
  menuPop.hidden = !menuPop.hidden;
  $('menu').setAttribute('aria-expanded', String(!menuPop.hidden));
});
document.addEventListener('pointerdown', (ev) => {
  if (!menuPop.hidden && !menuPop.contains(ev.target) && ev.target !== $('menu')) closeMenu();
});
function setWhoUi() {
  const w = deviceWho();
  const b = $('menu');
  b.textContent = w ? PEOPLE[w][0] : 'K';
  b.classList.toggle('on', !!w);
  b.title = w ? `Móvil de ${PEOPLE[w]}` : 'Kiosco (compartido)';
  for (const x of menuPop.querySelectorAll('[data-who]')) x.setAttribute('aria-checked', String((x.dataset.who || null) === w));
  $('menu-hint').textContent = w
    ? `Micro: pulsar para hablar. Te contesto como a ${PEOPLE[w]}.`
    : 'Escucha «Claudio», habla y duerme de noche. Os distingo por la voz.';
}
for (const x of menuPop.querySelectorAll('[data-who]')) {
  x.addEventListener('click', () => {
    const next = x.dataset.who || null;
    try { if (next) localStorage.setItem(WHO_PREF, next); else localStorage.removeItem(WHO_PREF); } catch {}
    setWhoUi();
    applyRole();
    say(next ? `Vale, este es el móvil de ${PEOPLE[next]}.` : 'Vale, este es el kiosco: os distingo por la voz.');
  });
}
$('menu-debug').addEventListener('click', () => {
  closeMenu();
  $('debug').hidden = !$('debug').hidden;
  if (!$('debug').hidden) showMetrics();
});
setWhoUi();

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
    ears ??= new Ears((wav, ms, f0) => {
      if (queued > 2) return; // demasiada charla de fondo: se descarta
      queued++;
      phraseQueue = phraseQueue.then(() => onPhrase(wav, f0)).finally(() => queued--);
    });
    ears.onLevel = (speaking) => { if (voiceMode === 'command' && speaking) clearTimeout(commandTimer); };
    await ears.start();
    voiceMode = 'idle';
    setMicUi();
    // En un móvil personal no se espera a "Claudio": pulsar el micro = te escucho ya
    if (!isKiosk()) enterCommand();
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
  setMicUi();
  if (eyes.state === 'listening') react('idle', 0);
}
const setVoicePref = (on) => { try { localStorage.setItem(VOICE_PREF, on ? 'on' : 'off'); } catch {} };
const voicePref = () => { try { return localStorage.getItem(VOICE_PREF) === 'on'; } catch { return false; } };

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
  if (!isKiosk()) { stopVoice(); return; } // pulsar para hablar: acabada la orden, se apaga
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

async function onPhrase(wav, f0) {
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
  const who = whoFromPitch(f0) ?? deviceWho();
  const reply = await sendChat(command, who);
  if (reply && ears) await speakReply(reply, who);
  if (voiceMode === 'off') return;
  // Si Claudio pregunta algo, se puede contestar sin volver a llamarlo
  if (reply && /\?\s*$/.test(reply)) enterCommand();
  else backToIdle();
}

async function speakReply(text, who = null) {
  try {
    const r = await fetch('api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, who }),
    });
    if (!r.ok) return;
    const audio = await r.arrayBuffer();
    eyes.setState('talking');
    await ears.play(audio);
    eyes.setState('idle');
  } catch { /* sin voz: queda el texto */ }
}

window.claudio.voice = () => ({ mode: voiceMode, ears }); // depurar desde la consola
$('mic').addEventListener('click', () => {
  if (voiceMode === 'off') { startVoice(); if (isKiosk()) setVoicePref(true); }
  else { stopVoice(); if (isKiosk()) setVoicePref(false); }
});
// Solo el kiosco escucha siempre: si estaba activada, se intenta al cargar; si iOS exige
// un toque, el primero que llegue la arranca.
function autoVoice() {
  if (!isKiosk() || !voicePref() || voiceMode !== 'off') return;
  startVoice().then((ok) => {
    if (ok) return;
    document.addEventListener('pointerdown', () => { if (voiceMode === 'off' && isKiosk()) startVoice(); }, { once: true });
  });
}
autoVoice();

// Al cambiar el perfil del dispositivo: el kiosco escucha y duerme; un móvil, no
function applyRole() {
  if (!isKiosk() && voiceMode !== 'off') stopVoice();
  $('mic').title = isKiosk() ? 'Voz: escuchar «Claudio»' : 'Pulsa para hablar';
  $('mic').setAttribute('aria-label', $('mic').title);
  applyNight();
  autoVoice();
}
applyRole();

// ---------- Avisos: lo que Claudio quiere decir, esperando a que lo toques ----------
// Claudio no habla solo (podría no haber nadie). Lo que quiere decir o preguntar
// (resumen de la mañana, "¿has cambiado la arena?", "¿cuántos km lleva el coche?") sale
// como botón bajo los ojos; al tocarlo, lo pregunta (en voz alta si el micro está activo).
const NUDGE_ICON = { briefing: '☀️', routine: '🔁', reading: '🔢', event: '📅' };
let nudgeKeys = '';
async function loadNudges() {
  try {
    const r = await fetch('api/nudges', { cache: 'no-store' });
    if (r.ok) renderNudges((await r.json()).nudges ?? []);
  } catch { /* se quedan los de antes */ }
}
function renderNudges(list) {
  const box = $('nudges');
  box.innerHTML = '';
  for (const n of list) {
    const chip = document.createElement('span');
    chip.className = `nudge ${n.kind}`;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'nudge-go';
    go.textContent = `${NUDGE_ICON[n.kind] ?? '💬'} ${n.label}`;
    go.addEventListener('click', () => openNudge(n, chip));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'nudge-x';
    x.setAttribute('aria-label', `Ahora no: ${n.label}`);
    x.textContent = '×';
    x.addEventListener('click', () => { chip.remove(); markSeen(n.key); });
    chip.append(go, x);
    box.appendChild(chip);
  }
  // Si hay algo nuevo, Claudio lo mira un momento: "tengo algo para ti"
  const keys = list.map((n) => n.key).join(',');
  if (keys && keys !== nudgeKeys && !document.body.classList.contains('night')) {
    const r = box.getBoundingClientRect();
    eyes.lookAt(r.left + r.width / 2, r.top + r.height / 2, 1600);
    if (eyes.state === 'idle') react('happy', 1400);
  }
  nudgeKeys = keys;
}
const markSeen = (key) => fetch('api/nudges/seen', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
}).catch(() => {});
async function openNudge(n, chip) {
  if (waiting) return;
  chip.remove();
  markSeen(n.key);
  const who = deviceWho();
  const listening = ears && voiceMode === 'idle';
  if (listening) { voiceMode = 'busy'; setMicUi(); }
  const reply = await sendChat(n.ask, who);
  if (!reply) { if (listening) backToIdle(); return; }
  const asks = reply.includes('?');
  if (listening) {
    await speakReply(reply, who);
    if (asks) enterCommand(); else backToIdle();
  } else if (asks && !matchMedia('(min-width: 900px) and (pointer: fine)').matches) {
    toggleChat(true); // sin micro, se contesta por teclado
  }
}
loadNudges();
setInterval(loadNudges, 5 * 60_000);

// ---------- Cámara: los ojos te siguen ----------
const CAM_PREF = 'claudio.cam';
let watcher = null;
function setCamUi() {
  const on = !!watcher?.running;
  $('cam').classList.toggle('on', on);
  $('cam').setAttribute('aria-pressed', String(on));
}
async function startCam() {
  watcher ??= new Watcher((x, y) => {
    if (document.body.classList.contains('night')) return;
    eyes.lookToward(x * 2 - 1, (y * 2 - 1) * 0.9, 1500);
  });
  try {
    await watcher.start();
  } catch (e) {
    watcher = null;
    say(e?.name === 'NotAllowedError' ? 'No tengo permiso para usar la cámara.' : 'No he podido abrir la cámara.', { error: true });
  }
  setCamUi();
}
function stopCam() { watcher?.stop(); watcher = null; setCamUi(); }
const camPref = () => { try { return localStorage.getItem(CAM_PREF) === 'on'; } catch { return false; } };
$('cam').addEventListener('click', () => {
  const on = !watcher?.running;
  try { localStorage.setItem(CAM_PREF, on ? 'on' : 'off'); } catch {}
  if (on) startCam(); else stopCam();
});
if (camPref()) startCam();
window.claudio.cam = () => watcher;

// ---------- Avisos en vivo (SSE) ----------
function connectStream() {
  const es = new EventSource('api/stream');
  es.addEventListener('items', () => { loadView(); loadNudges(); });
  es.addEventListener('show', (ev) => {
    try { showView(JSON.parse(ev.data)); } catch { /* aviso raro */ }
  });
  es.addEventListener('chat', (ev) => {
    try { addMessage(JSON.parse(ev.data)); } catch { /* mensaje raro */ }
  });
  // EventSource reconecta solo; al volver, refrescamos por si nos perdimos algo.
  es.addEventListener('hello', () => { loadView(); loadNudges(); });
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
  if (document.visibilityState === 'visible') {
    keepAwake(); checkHealth(); loadView(); loadWeather(); loadNudges();
    if (camPref() && !watcher?.running) startCam(); // iOS apaga la cámara al salir de la app
  }
});

// ---------- Service worker (para instalar la PWA) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
