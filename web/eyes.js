// Ojos de Claudio en pixel art con movimiento suave.
//
// La forma de cada ojo se construye con "píxeles gordos" (bloques) en una rejilla
// propia del ojo: así se ve pixelado. Pero la posición del ojo entero (mirada,
// respiración, rebote) es continua y se dibuja a resolución real de la pantalla:
// el sprite se desliza suave en vez de saltar de bloque en bloque.
// Unidad de trabajo: el "bloque". La escena mide GRID_W × GRID_H bloques.

const GRID_W = 40;
const GRID_H = 22;

const C = {
  bg: '#1f1e1d',
  eye: '#d97757',      // coral
  shine: '#f5efe6',    // brillo crema
  blush: '#a8523b',    // coral oscuro (sólido)
  zz: '#a39e96',
};

const BASE_W = 10;
const BASE_H = 14;
const CENTERS = [12, 28];   // x de cada ojo (bloques)
const CENTER_Y = 11;
const RANGE_X = 6;          // recorrido de la mirada en bloques
const RANGE_Y = 3.2;

// shape: 'open' (bloque redondeado), 'happy' (arco ∩), 'closed' (arco ‿)
// lid: cuánto tapa el párpado por arriba (0..1), por ojo [izq, der]
const STATES = {
  idle:      { shape: 'open',   look: [0, 0],      lid: [0, 0],       scale: 1,    blush: 0, zz: 0, glance: true,  blinkEvery: [2.5, 6] },
  listening: { shape: 'open',   look: [0, -0.2],   lid: [0, 0],       scale: 1.15, blush: 0, zz: 0, glance: false, blinkEvery: [4, 8] },
  thinking:  { shape: 'open',   look: [0.7, -0.8], lid: [0.35, 0.1],  scale: 0.95, blush: 0, zz: 0, glance: false, blinkEvery: [3, 6], wander: true },
  talking:   { shape: 'open',   look: [0, 0.1],    lid: [0, 0],       scale: 1,    blush: 1, zz: 0, glance: false, blinkEvery: [2, 4], talk: true },
  happy:     { shape: 'happy',  look: [0, 0],      lid: [0, 0],       scale: 1,    blush: 1, zz: 0, glance: false, blinkEvery: [99, 99] },
  sleepy:    { shape: 'open',   look: [0, 0.5],    lid: [0.55, 0.55], scale: 0.95, blush: 0, zz: 0, glance: true,  blinkEvery: [3, 5], slowBlink: true },
  sleeping:  { shape: 'closed', look: [0, 0.4],    lid: [0, 0],       scale: 1,    blush: 0, zz: 1, glance: false, blinkEvery: [99, 99], breathe: true },
};

// Letra Z de 4×4 para cuando duerme
const Z = ['1111', '0010', '0100', '1111'];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const R = Math.round;

export class Eyes {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bs = 1; // tamaño de un bloque en píxeles reales del canvas
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);

    this.state = 'idle';
    this.cur = { lookX: 0, lookY: 0, vx: 0, vy: 0, lidL: 0, lidR: 0, scale: 1, blush: 0, zz: 0 };
    this.glance = [0, 0];
    this.pointer = null;
    this.blink = 0;
    this.blinkStart = -1;
    this.nextBlink = performance.now() + 1500;
    this.nextGlance = performance.now() + 2000;
    this.pop = 0;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** El canvas cabe entero en su caja (que cambia de tamaño cuando el panel crece) y
   *  tiene la resolución real de la pantalla (CSS × devicePixelRatio). */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const box = this.canvas.parentElement;
    let cssW = this.canvas.clientWidth;
    if (box && box.clientWidth && box.clientHeight) {
      cssW = Math.min(box.clientWidth, (box.clientHeight * GRID_W) / GRID_H);
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${(cssW * GRID_H) / GRID_W}px`;
    }
    const w = Math.max(GRID_W, R(cssW * dpr));
    if (w === this.canvas.width) return;
    this.canvas.width = w;
    this.canvas.height = R((w * GRID_H) / GRID_W);
    this.bs = w / GRID_W;
  }

  setState(name) {
    if (!STATES[name] || name === this.state) return;
    this.state = name;
    this.pop = 1;
    this.nextBlink = performance.now() + rand(400, 1200);
    if (!STATES[name].glance) this.glance = [0, 0];
  }

  /** Mirar hacia un punto de la pantalla (coordenadas de cliente) durante un rato. */
  lookAt(clientX, clientY, ms = 1800) {
    const r = this.canvas.getBoundingClientRect();
    const x = clamp(((clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const y = clamp(((clientY - (r.top + r.height / 2)) / r.height) * 2, -1, 1);
    this.pointer = { x, y, until: performance.now() + ms };
  }

  /** Mirar en una dirección (-1…1 en cada eje; la usa la cámara). */
  lookToward(x, y, ms = 1200) {
    this.pointer = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: performance.now() + ms };
  }

  // ---------- dibujo ----------
  /** Rectángulo en bloques (admite posiciones decimales). Cada borde se redondea al
   *  píxel real, así las piezas de un mismo sprite encajan sin huecos. */
  rect(x, y, w, h, color) {
    const b = this.bs;
    const x0 = R(x * b), y0 = R(y * b);
    const x1 = R((x + w) * b), y1 = R((y + h) * b);
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** Bloque con esquinas recortadas. (ox, oy) = origen continuo; resto en bloques enteros. */
  roundedBlock(ox, oy, x, y, w, h, color) {
    if (w < 5 || h < 5) return this.rect(ox + x, oy + y, w, h, color);
    this.rect(ox + x + 2, oy + y, w - 4, h, color);
    this.rect(ox + x + 1, oy + y + 1, w - 2, h - 2, color);
    this.rect(ox + x, oy + y + 2, w, h - 4, color);
  }

  /** Arco de bloques: curve > 0 → ∩ (contento), curve < 0 → ‿ (dormido). */
  arc(ox, oy, w, curve, thick, color) {
    const left = -Math.floor(w / 2);
    const half = (w - 1) / 2;
    for (let c = 0; c < w; c++) {
      const t = (c - half) / half;
      this.rect(ox + left + c, oy + R(t * t * curve), 1, thick, color);
    }
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const st = STATES[this.state];
    const t = now / 1000;

    // Miradas al azar
    if (st.glance && now > this.nextGlance) {
      this.glance = Math.random() < 0.3 ? [0, 0] : [rand(-1, 1), rand(-0.8, 0.8)];
      this.nextGlance = now + rand(1200, 4200);
    }
    let tx = st.look[0] + (st.glance ? this.glance[0] : 0);
    let ty = st.look[1] + (st.glance ? this.glance[1] : 0);
    if (st.wander) { tx += Math.sin(t * 0.9) * 0.2; ty += Math.cos(t * 0.7) * 0.15; }
    if (this.pointer && now < this.pointer.until && this.state !== 'sleeping') {
      tx = this.pointer.x; ty = this.pointer.y;
    }

    // Parpadeo (se cierra hacia el centro)
    if (now > this.nextBlink) {
      this.blinkStart = now;
      this.nextBlink = now + (Math.random() < 0.15 ? 280 : rand(...st.blinkEvery) * 1000);
    }
    if (this.blinkStart >= 0) {
      const p = (now - this.blinkStart) / (st.slowBlink ? 450 : 180);
      this.blink = p >= 1 ? 0 : Math.sin(Math.PI * p);
      if (p >= 1) this.blinkStart = -1;
    }

    const c = this.cur;
    // Mirada con muelle amortiguado: arranca rápido, frena suave y apenas rebota
    const STIFF = 140, DAMP = 20;
    c.vx += (STIFF * (clamp(tx, -1, 1) - c.lookX) - DAMP * c.vx) * dt;
    c.vy += (STIFF * (clamp(ty, -1, 1) - c.lookY) - DAMP * c.vy) * dt;
    c.lookX += c.vx * dt;
    c.lookY += c.vy * dt;

    // Resto: suavizado exponencial
    const k = (speed) => 1 - Math.exp(-dt * speed);
    c.lidL += (st.lid[0] - c.lidL) * k(6);
    c.lidR += (st.lid[1] - c.lidR) * k(6);
    c.scale += (st.scale - c.scale) * k(7);
    c.blush += (st.blush - c.blush) * k(4);
    c.zz += (st.zz - c.zz) * k(3);
    this.pop += (0 - this.pop) * k(6);

    this.draw(st, t);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  draw(st, t) {
    const c = this.cur;
    this.ctx.fillStyle = C.bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Desplazamientos continuos del conjunto
    let bob = Math.sin(t * 1.4) * 0.35;                  // respirar
    if (st.breathe) bob = Math.sin(t * 0.8) * 0.8;
    let talkH = 0;
    if (st.talk) {
      const v = Math.abs(Math.sin(t * 8)) * (0.6 + 0.4 * Math.sin(t * 2.1));
      talkH = R(v * 3);                                    // la forma sí va a bloques
      bob -= v * 1.2;
    }

    const dx = c.lookX * RANGE_X;
    const dy = c.lookY * RANGE_Y;
    const sc = c.scale * (1 + this.pop * 0.12);
    const w = R(BASE_W * sc);
    const hFull = R(BASE_H * sc) - talkH;
    const open = 1 - this.blink;

    CENTERS.forEach((cx0, i) => {
      const ox = cx0 + dx;            // origen continuo del sprite
      const oy = CENTER_Y + dy + bob;
      const left = -Math.floor(w / 2);

      if (st.shape === 'happy') {
        this.arc(ox, oy - 3, w, 4, 3, C.eye);           // ∩ ∩
      } else if (st.shape === 'closed') {
        this.arc(ox, oy + 2, w, -3, 2, C.eye);          // ‿ ‿
      } else if (open < 0.2) {
        this.rect(ox + left, oy - 1, w, 2, C.eye);      // mitad del parpadeo: una raya
      } else {
        const h = Math.max(3, R(hFull * open));
        const top = -Math.floor(h / 2);
        this.roundedBlock(ox, oy, left, top, w, h, C.eye);
        // Párpado: tapa la parte de arriba con el color del fondo (borde plano)
        const cut = R(h * (i === 0 ? c.lidL : c.lidR));
        if (cut > 0) this.rect(ox + left, oy + top, w, cut, C.bg);
        // Brillo: se desliza un poco dentro del ojo según la mirada
        const visible = h - cut;
        const size = visible >= 8 ? 3 : visible >= 5 ? 2 : 0;
        if (size) {
          const sx = clamp(left + 2 + c.lookX * 1.5, left + 1, left + w - 1 - size);
          const sy = clamp(top + cut + 2 + c.lookY * 1.2, top + cut + 1, top + h - 1 - size);
          this.rect(ox + sx, oy + sy, size, size, C.shine);
        }
      }

      // Mejillas
      if (c.blush > 0.5) {
        const happy = st.shape === 'happy';
        const out = happy ? 2 : 0;   // contento: un poco más fuera para no tocar el arco
        const bx = i === 0 ? left - 1 - out : left + w - 2 + out;
        this.rect(ox + bx, oy + (happy ? 5 : 8), 3, 2, C.blush);
      }
    });

    // Zzz
    if (c.zz > 0.5 && Math.sin(t * 1.6) > -0.5) {
      const zy = 1.5 + Math.sin(t * 0.8) * 0.8;
      Z.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') this.rect(34 + x, zy + y, 1, 1, C.zz); }));
    }
  }
}

export const EYE_STATES = Object.keys(STATES);
