// Ojos de Claudio: SVG animado con requestAnimationFrame.
// Cada estado define unos objetivos (mirada, párpados, tamaño…) y los valores
// actuales se acercan a ellos suavemente. Encima van parpadeos y miradas al azar.

const NS = 'http://www.w3.org/2000/svg';
const BG = '#1f1e1d';
const SCLERA = '#f5efe6';
const IRIS = '#d97757';
const PUPIL = '#2b1a14';

const RX = 60;   // radio horizontal del ojo
const RY = 76;   // radio vertical del ojo
const EYES = [{ cx: 122, cy: 118 }, { cx: 278, cy: 118 }];

// Objetivos por estado. look: -1..1; lids: 0 abierto … 1 cerrado.
const STATES = {
  idle:      { look: [0, 0],      lidTop: 0, lidBottom: 0,    scale: 1,    pupil: 1,    blush: 0,   zz: 0, glance: true,  blinkEvery: [2.5, 6] },
  listening: { look: [0, -0.05],  lidTop: 0,    lidBottom: 0,    scale: 1.08, pupil: 1.2,  blush: 0.2, zz: 0, glance: false, blinkEvery: [4, 8] },
  thinking:  { look: [0.65, -0.7], lidTop: 0.22, lidBottom: 0.08, scale: 0.98, pupil: 0.9, blush: 0,   zz: 0, glance: false, blinkEvery: [3, 6], wander: true },
  talking:   { look: [0, 0.05],   lidTop: 0.04, lidBottom: 0.05, scale: 1.02, pupil: 1.05, blush: 0.3, zz: 0, glance: false, blinkEvery: [2, 4], talk: true },
  happy:     { look: [0, -0.2],   lidTop: 0,    lidBottom: 0.5,  scale: 1.04, pupil: 1.1,  blush: 0.9, zz: 0, glance: false, blinkEvery: [99, 99] },
  sleepy:    { look: [0, 0.35],   lidTop: 0.55, lidBottom: 0.05, scale: 0.97, pupil: 0.9,  blush: 0,   zz: 0, glance: true,  blinkEvery: [3, 5], slowBlink: true },
  sleeping:  { look: [0, 0.3],    lidTop: 1,    lidBottom: 0,    scale: 0.96, pupil: 0.9,  blush: 0,   zz: 1, glance: false, blinkEvery: [99, 99], breathe: true },
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export class Eyes {
  constructor(svg) {
    this.svg = svg;
    this.state = 'idle';
    this.cur = { lookX: 0, lookY: 0, lidTop: 0, lidBottom: 0, scale: 1, pupil: 1, blush: 0, zz: 0 };
    this.glance = [0, 0];           // mirada aleatoria
    this.pointer = null;            // mirada hacia el dedo { x, y, until }
    this.blink = 0;                 // 0..1, se suma al párpado superior
    this.blinkStart = -1;
    this.nextBlink = performance.now() + 1500;
    this.nextGlance = performance.now() + 2000;
    this.pop = 0;                   // pequeño "rebote" al cambiar de estado
    this.build();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  build() {
    const s = this.svg;
    s.innerHTML = '';
    const defs = el('defs', {}, s);
    this.root = el('g', {}, s);
    this.parts = EYES.map((e, i) => {
      const clip = el('clipPath', { id: `eye-clip-${i}` }, defs);
      el('ellipse', { rx: RX, ry: RY }, clip);

      const g = el('g', {}, this.root);
      const inner = el('g', { 'clip-path': `url(#eye-clip-${i})` }, g);
      // Algo más pequeño que el recorte: así los párpados tapan también el borde suavizado
      el('ellipse', { rx: RX - 1.5, ry: RY - 1.5, fill: SCLERA }, inner);
      const iris = el('g', {}, inner);
      el('circle', { r: 33, fill: IRIS }, iris);
      const pupil = el('circle', { r: 19, fill: PUPIL }, iris);
      const shine = el('g', {}, inner);
      el('circle', { cx: -11, cy: -13, r: 8.5, fill: '#fff' }, shine);
      el('circle', { cx: 9, cy: 9, r: 3.5, fill: '#fff', opacity: 0.85 }, shine);
      // Párpados del color del fondo: el superior baja, el inferior (cúpula) sube y hace la sonrisa ^_^
      const lidTop = el('ellipse', { rx: 110, ry: 95, fill: BG }, inner);
      const lidTopFill = el('rect', { x: -120, y: -400, width: 240, height: 0, fill: BG }, inner);
      const lidBottom = el('ellipse', { rx: 100, ry: 80, fill: BG }, inner);
      // Línea de ojo cerrado (aparece al final del parpadeo y al dormir)
      const closed = el('path', {
        d: `M ${-RX * 0.78} 4 Q 0 ${RY * 0.42} ${RX * 0.78} 4`,
        fill: 'none', stroke: SCLERA, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0,
      }, g);
      const blush = el('ellipse', { cx: i === 0 ? -14 : 14, cy: RY + 18, rx: 26, ry: 11, fill: IRIS, opacity: 0 }, g);
      return { e, g, iris, pupil, shine, lidTop, lidTopFill, lidBottom, closed, blush };
    });

    this.zz = el('text', {
      x: 340, y: 40, fill: '#a39e96', 'font-size': 26, 'font-weight': 600,
      'font-family': '-apple-system, system-ui, sans-serif', opacity: 0,
    }, s);
    this.zz.textContent = 'z z';
  }

  setState(name) {
    if (!STATES[name] || name === this.state) return;
    this.state = name;
    this.pop = 1;
    const now = performance.now();
    this.nextBlink = now + rand(400, 1200);
    if (name !== 'idle' && name !== 'sleepy') this.glance = [0, 0];
  }

  /** Mirar hacia un punto de la pantalla (coordenadas de cliente) durante un rato. */
  lookAt(clientX, clientY, ms = 1800) {
    const r = this.svg.getBoundingClientRect();
    const x = clamp(((clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const y = clamp(((clientY - (r.top + r.height / 2)) / (r.height * 1.2)) * 2, -1, 1);
    this.pointer = { x, y, until: performance.now() + ms };
  }

  doBlink() {
    this.blinkStart = performance.now();
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const st = STATES[this.state];
    const t = now / 1000;

    // Miradas al azar en reposo
    if (st.glance && now > this.nextGlance) {
      this.glance = Math.random() < 0.35 ? [0, 0] : [rand(-0.8, 0.8), rand(-0.5, 0.5)];
      this.nextGlance = now + rand(1200, 4200);
    }

    // Objetivo de mirada
    let tx = st.look[0] + (st.glance ? this.glance[0] : 0);
    let ty = st.look[1] + (st.glance ? this.glance[1] : 0);
    if (st.wander) { tx += Math.sin(t * 0.9) * 0.15; ty += Math.cos(t * 0.7) * 0.08; }
    if (this.pointer && now < this.pointer.until && this.state !== 'sleeping') {
      tx = this.pointer.x; ty = this.pointer.y;
    }

    // Parpadeo
    if (now > this.nextBlink) {
      this.doBlink();
      // A veces doble parpadeo
      this.nextBlink = now + (Math.random() < 0.15 ? 260 : rand(...st.blinkEvery) * 1000);
    }
    const blinkDur = st.slowBlink ? 420 : 170;
    if (this.blinkStart >= 0) {
      const p = (now - this.blinkStart) / blinkDur;
      this.blink = p >= 1 ? 0 : Math.sin(Math.PI * p);
      if (p >= 1) this.blinkStart = -1;
    }

    // Suavizado exponencial hacia los objetivos
    const c = this.cur;
    const k = (speed) => 1 - Math.exp(-dt * speed);
    c.lookX += (tx - c.lookX) * k(9);
    c.lookY += (ty - c.lookY) * k(9);
    c.lidTop += (st.lidTop - c.lidTop) * k(6);
    c.lidBottom += (st.lidBottom - c.lidBottom) * k(7);
    c.scale += (st.scale - c.scale) * k(6);
    c.pupil += (st.pupil - c.pupil) * k(5);
    c.blush += (st.blush - c.blush) * k(3);
    c.zz += (st.zz - c.zz) * k(2);
    this.pop += (0 - this.pop) * k(5);

    // Movimientos de todo el conjunto
    let bob = Math.sin(t * 1.3) * 2.5;                       // "respirar" en reposo
    if (st.breathe) bob = Math.sin(t * 0.8) * 4;
    let squash = 1;
    if (st.talk) {
      const talk = Math.abs(Math.sin(t * 9)) * (0.6 + 0.4 * Math.sin(t * 2.3));
      bob -= talk * 4;
      squash = 1 - talk * 0.04;
    }
    const popScale = 1 + this.pop * 0.06;

    const lidTop = clamp(Math.max(c.lidTop, this.blink));
    for (const p of this.parts) {
      const { cx, cy } = p.e;
      const ox = c.lookX * 7;          // el ojo entero se desplaza un poco (paralaje)
      const oy = c.lookY * 5 + bob;
      const sc = c.scale * popScale;
      p.g.setAttribute('transform', `translate(${cx + ox} ${cy + oy}) scale(${sc} ${sc * squash})`);

      const ix = c.lookX * 24, iy = c.lookY * 30;
      p.iris.setAttribute('transform', `translate(${ix} ${iy})`);
      p.pupil.setAttribute('r', (19 * c.pupil).toFixed(2));
      p.shine.setAttribute('transform', `translate(${ix * 0.6} ${iy * 0.6})`);

      // Borde del párpado superior: de -RY (abierto) a +RY (cerrado)
      const topEdge = -RY + lidTop * (2 * RY + 45); // +45: cerrado del todo también por los lados
      p.lidTop.setAttribute('cy', (topEdge - 95).toFixed(2));
      p.lidTopFill.setAttribute('height', Math.max(0, topEdge - 95 + 400 + 1).toFixed(2)); // tapa lo que queda por encima de la elipse
      // Borde del párpado inferior: de +RY (abierto) hacia arriba
      const bottomEdge = RY - c.lidBottom * 2 * RY;
      p.lidBottom.setAttribute('cy', (bottomEdge + 80).toFixed(2));

      p.closed.setAttribute('opacity', clamp((lidTop - 0.82) / 0.18).toFixed(3));
      p.blush.setAttribute('opacity', (c.blush * 0.55).toFixed(3));
    }

    this.zz.setAttribute('opacity', (c.zz * (0.55 + 0.45 * Math.sin(t * 1.5))).toFixed(3));
    this.zz.setAttribute('transform', `translate(0 ${Math.sin(t * 0.8) * -6})`);

    requestAnimationFrame((tt) => this.frame(tt));
  }
}

export const EYE_STATES = Object.keys(STATES);
