// Ojos de Claudio en pixel art: colores planos sobre una rejilla pequeña (canvas de
// 40×22 px) que el CSS amplía con `image-rendering: pixelated`.
// Cada estado define objetivos (mirada, apertura, párpado…); los valores actuales se
// acercan suavemente y al dibujar se redondean a píxeles enteros, lo que da el
// movimiento "a saltitos" típico del pixel art.

const GRID_W = 40;
const GRID_H = 22;

const C = {
  bg: '#1f1e1d',
  eye: '#d97757',      // coral
  shine: '#f5efe6',    // brillo crema
  blush: '#a8523b',    // coral oscuro (sólido, sin transparencias)
  zz: '#a39e96',
};

const BASE_W = 10;
const BASE_H = 14;
const CENTERS = [12, 28];   // x de cada ojo
const CENTER_Y = 11;

// shape: 'open' (bloque redondeado), 'happy' (arco ∩), 'closed' (arco ‿)
// lid: cuánto tapa el párpado por arriba (0..1), por ojo [izq, der]
const STATES = {
  idle:      { shape: 'open',   look: [0, 0],      lid: [0, 0],       scale: 1,    blush: 0, zz: 0, glance: true,  blinkEvery: [2.5, 6] },
  listening: { shape: 'open',   look: [0, -0.2],   lid: [0, 0],       scale: 1.15, blush: 0, zz: 0, glance: false, blinkEvery: [4, 8] },
  thinking:  { shape: 'open',   look: [0.8, -0.8], lid: [0.35, 0.1],  scale: 0.95, blush: 0, zz: 0, glance: false, blinkEvery: [3, 6], wander: true },
  talking:   { shape: 'open',   look: [0, 0.1],    lid: [0, 0],       scale: 1,    blush: 1, zz: 0, glance: false, blinkEvery: [2, 4], talk: true },
  happy:     { shape: 'happy',  look: [0, 0],      lid: [0, 0],       scale: 1,    blush: 1, zz: 0, glance: false, blinkEvery: [99, 99] },
  sleepy:    { shape: 'open',   look: [0, 0.6],    lid: [0.55, 0.55], scale: 0.95, blush: 0, zz: 0, glance: true,  blinkEvery: [3, 5], slowBlink: true },
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
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.state = 'idle';
    this.cur = { lookX: 0, lookY: 0, lidL: 0, lidR: 0, scale: 1, blush: 0, zz: 0 };
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

  // ---------- primitivas de dibujo (todo en píxeles enteros) ----------
  px(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(R(x), R(y), R(w), R(h));
  }

  roundedBlock(x, y, w, h, color) {
    if (w < 5 || h < 5) return this.px(x, y, w, h, color);
    this.px(x + 2, y, w - 4, h, color);
    this.px(x + 1, y + 1, w - 2, h - 2, color);
    this.px(x, y + 2, w, h - 4, color);
  }

  /** Arco de grosor `thick`: curve > 0 → ∩ (contento), curve < 0 → ‿ (dormido). */
  arc(cx, cy, w, curve, thick, color) {
    const left = R(cx - w / 2);
    const half = (w - 1) / 2;
    for (let c = 0; c < w; c++) {
      const t = (c - half) / half;
      const y = R(cy + t * t * curve);
      this.px(left + c, y, 1, thick, color);
    }
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const st = STATES[this.state];
    const t = now / 1000;

    // Miradas al azar
    if (st.glance && now > this.nextGlance) {
      this.glance = Math.random() < 0.35 ? [0, 0] : [rand(-1, 1), rand(-0.7, 0.7)];
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

    // Suavizado hacia los objetivos
    const c = this.cur;
    const k = (speed) => 1 - Math.exp(-dt * speed);
    c.lookX += (clamp(tx, -1, 1) - c.lookX) * k(10);
    c.lookY += (clamp(ty, -1, 1) - c.lookY) * k(10);
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
    this.px(0, 0, GRID_W, GRID_H, C.bg);

    let bob = Math.sin(t * 1.4) > 0.6 ? -1 : 0;          // pequeño "respirar" a saltos
    if (st.breathe) bob = R(Math.sin(t * 0.8));
    let talkH = 0;
    if (st.talk) {
      const v = Math.abs(Math.sin(t * 8)) * (0.6 + 0.4 * Math.sin(t * 2.1));
      talkH = R(v * 3);                                   // los ojos "rebotan" al hablar
      bob -= R(v * 1.5);
    }

    const dx = R(c.lookX * 3);
    const dy = R(c.lookY * 2);
    const sc = c.scale * (1 + this.pop * 0.12);
    const w = R(BASE_W * sc);
    const hFull = R(BASE_H * sc) - talkH;
    const open = 1 - this.blink;

    CENTERS.forEach((cx0, i) => {
      const cx = cx0 + dx;
      const cy = CENTER_Y + dy + bob;
      const left = R(cx - w / 2);

      if (st.shape === 'happy') {
        this.arc(cx, cy - 3, w, 4, 3, C.eye);            // ∩ ∩
      } else if (st.shape === 'closed') {
        this.arc(cx, cy + 2, w, -3, 2, C.eye);           // ‿ ‿
      } else if (open < 0.2) {
        this.px(left, cy - 1, w, 2, C.eye);              // mitad del parpadeo: una raya
      } else {
        const h = Math.max(3, R(hFull * open));
        const top = R(cy - h / 2);
        this.roundedBlock(left, top, w, h, C.eye);
        // Párpado: tapa la parte de arriba con el color del fondo (borde plano)
        const cut = R(h * (i === 0 ? c.lidL : c.lidR));
        if (cut > 0) this.px(left, top, w, cut, C.bg);
        // Brillo: bloque crema arriba a la izquierda, se mueve un poco con la mirada
        const visible = h - cut;
        const sx = left + 2 + (c.lookX > 0.5 ? 1 : 0);
        const sy = top + cut + 2;
        if (visible >= 8) this.px(sx, sy, 3, 3, C.shine);
        else if (visible >= 5) this.px(sx, sy, 2, 2, C.shine);
      }

      // Mejillas
      if (c.blush > 0.5) {
        const happy = st.shape === 'happy';
        const out = happy ? 2 : 0;   // contento: un poco más fuera para no tocar el arco
        const bx = i === 0 ? cx - w / 2 - 1 - out : cx + w / 2 - 2 + out;
        this.px(bx, cy + (happy ? 5 : 8), 3, 2, C.blush);
      }
    });

    // Zzz
    if (c.zz > 0.5 && Math.sin(t * 1.6) > -0.5) {
      const zy = 1 + R(Math.sin(t * 0.8));
      Z.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') this.px(34 + x, zy + y, 1, 1, C.zz); }));
    }
  }
}

export const EYE_STATES = Object.keys(STATES);
