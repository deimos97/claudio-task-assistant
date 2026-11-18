// Ojos que te siguen: la cámara frontal a muy baja resolución (48×36, gris) y, en cada
// fotograma, dónde ha cambiado la imagen respecto al anterior. El centro de ese cambio es
// "donde estás". No reconoce caras (Safari no tiene FaceDetector y no queremos librerías
// pesadas): sigue el movimiento, que en la mesa suele ser la persona. Nada sale del iPhone.
const W = 48;
const H = 36;
const EVERY_MS = 110;
const THRESHOLD = 22;          // diferencia de gris (0–255) para contar un píxel como "cambiado"
const MIN_SHARE = 0.012;       // fracción mínima de píxeles cambiados para creer que hay alguien
const MAX_SHARE = 0.6;         // más que esto = cambio de luz o la cámara se movió: se ignora

export class Watcher {
  /** onSpot(x, y): posición 0–1 desde el punto de vista de la pantalla (ya en espejo). */
  constructor(onSpot) {
    this.onSpot = onSpot;
    this.stream = null;
    this.timer = null;
    this.prev = null;
    this.spot = null;
    this.lastSeen = 0;
  }

  get running() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 10 } },
      audio: false,
    });
    const v = document.createElement('video');
    v.playsInline = true;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.srcObject = this.stream;
    await v.play();
    this.video = v;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    this.ctx = c.getContext('2d', { willReadFrequently: true });
    this.timer = setInterval(() => this.tick(), EVERY_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.video = null;
    this.prev = null;
    this.spot = null;
  }

  tick() {
    if (!this.video || this.video.readyState < 2) return;
    this.ctx.drawImage(this.video, 0, 0, W, H);
    const px = this.ctx.getImageData(0, 0, W, H).data;
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) gray[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
    const prev = this.prev;
    this.prev = gray;
    if (!prev) return;
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (Math.abs(gray[i] - prev[i]) > THRESHOLD) { n++; sx += x; sy += y; }
      }
    }
    const share = n / (W * H);
    if (share < MIN_SHARE || share > MAX_SHARE) return;
    // Espejo: la cámara ve tu derecha a su izquierda
    const x = 1 - sx / n / (W - 1);
    const y = sy / n / (H - 1);
    // Suavizado para que no tiemble
    this.spot = this.spot ? { x: this.spot.x * 0.6 + x * 0.4, y: this.spot.y * 0.6 + y * 0.4 } : { x, y };
    this.lastSeen = Date.now();
    this.onSpot(this.spot.x, this.spot.y);
  }
}
