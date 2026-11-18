// Ojos que te siguen: cámara frontal + detector de caras local (MediaPipe BlazeFace, ~230 KB,
// corre en el propio iPhone con WebAssembly). Si hay varias caras, sigue la más grande (la
// más cerca). Si no ve ninguna o el detector no carga, se queda con el respaldo: dónde ha
// cambiado la imagen entre fotogramas (movimiento). Nada sale del dispositivo.
// Ficheros: web/models/blaze_face_short_range.tflite y /vendor/mediapipe/ (node_modules).
const EVERY_MS = 110;
// Respaldo por movimiento: imagen de 48×36 en gris
const MW = 48;
const MH = 36;
const THRESHOLD = 22;          // diferencia de gris (0–255) para contar un píxel como "cambiado"
const MIN_SHARE = 0.012;       // fracción mínima de píxeles cambiados para creer que hay alguien
const MAX_SHARE = 0.6;         // más que esto = cambio de luz o la cámara se movió: se ignora
const FACE_HOLD_MS = 1500;     // tras perder la cara, un rato sin hacer caso al movimiento

let detectorPromise = null;
/** Carga el detector una sola vez; null si no se puede (y se usa el movimiento). */
function loadDetector() {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('./vendor/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', location.href).href);
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('models/blaze_face_short_range.tflite', location.href).href, delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    });
  })().catch((e) => { console.warn('detector de caras:', e); return null; });
  return detectorPromise;
}

export class Watcher {
  /** onSpot(x, y): posición 0–1 desde el punto de vista de la pantalla (ya en espejo). */
  constructor(onSpot) {
    this.onSpot = onSpot;
    this.stream = null;
    this.timer = null;
    this.prev = null;
    this.spot = null;
    this.detector = null;
    this.lastFaceAt = 0;
    // Lo último que ha visto, para el recuadro de depuración
    this.debug = { mode: 'cargando', faces: [], motion: null, ms: 0 };
  }

  get running() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
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
    c.width = MW; c.height = MH;
    this.ctx = c.getContext('2d', { willReadFrequently: true });
    this.timer = setInterval(() => this.tick(), EVERY_MS);
    loadDetector().then((d) => {
      this.detector = d;
      this.debug.mode = d ? 'caras' : 'movimiento (sin detector)';
    });
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
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    let target = null;

    // 1) Caras
    if (this.detector) {
      const t0 = performance.now();
      let dets = [];
      try { dets = this.detector.detectForVideo(v, t0).detections ?? []; } catch { /* fotograma raro */ }
      this.debug.ms = Math.round(performance.now() - t0);
      const W = v.videoWidth, H = v.videoHeight;
      this.debug.faces = dets.map((d) => ({
        x: d.boundingBox.originX / W, y: d.boundingBox.originY / H,
        w: d.boundingBox.width / W, h: d.boundingBox.height / H,
        score: d.categories?.[0]?.score ?? 0,
      }));
      if (this.debug.faces.length) {
        const f = this.debug.faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
        target = { x: 1 - (f.x + f.w / 2), y: f.y + f.h * 0.4 }; // espejo; un poco por encima del centro: los ojos
        this.lastFaceAt = Date.now();
      }
    }

    // 2) Respaldo: movimiento (siempre se calcula, para el recuadro de depuración)
    const motion = this.motion(v);
    this.debug.motion = motion;
    if (!target && motion && Date.now() - this.lastFaceAt > FACE_HOLD_MS) target = motion;

    if (!target) return;
    // Suavizado para que no tiemble
    this.spot = this.spot ? { x: this.spot.x * 0.6 + target.x * 0.4, y: this.spot.y * 0.6 + target.y * 0.4 } : target;
    this.debug.spot = this.spot;
    this.onSpot(this.spot.x, this.spot.y);
  }

  /** Centro de lo que ha cambiado desde el fotograma anterior (en espejo), o null. */
  motion(v) {
    this.ctx.drawImage(v, 0, 0, MW, MH);
    const px = this.ctx.getImageData(0, 0, MW, MH).data;
    const gray = new Uint8Array(MW * MH);
    for (let i = 0; i < MW * MH; i++) gray[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
    const prev = this.prev;
    this.prev = gray;
    if (!prev) return null;
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (Math.abs(gray[i] - prev[i]) > THRESHOLD) { n++; sx += x; sy += y; }
      }
    }
    const share = n / (MW * MH);
    if (share < MIN_SHARE || share > MAX_SHARE) return null;
    return { x: 1 - sx / n / (MW - 1), y: sy / n / (MH - 1) };
  }
}

/** Recuadro de depuración: la cámara (en espejo), las caras, el movimiento y adónde miran los ojos. */
export function drawDebug(canvas, w) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (w?.video) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1); // espejo, como un selfie
    ctx.drawImage(w.video, 0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const d = w?.debug;
  if (d) {
    ctx.lineWidth = 2;
    for (const f of d.faces) {
      ctx.strokeStyle = '#8fbf7f';
      ctx.strokeRect((1 - f.x - f.w) * W, f.y * H, f.w * W, f.h * H);
      ctx.fillStyle = '#8fbf7f';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(`${Math.round(f.score * 100)}%`, (1 - f.x - f.w) * W + 3, f.y * H + 12);
    }
    if (d.motion) {
      ctx.fillStyle = 'rgba(232, 164, 138, .8)';
      ctx.beginPath(); ctx.arc(d.motion.x * W, d.motion.y * H, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (d.spot) {
      ctx.strokeStyle = '#d97757';
      const x = d.spot.x * W, y = d.spot.y * H;
      ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
    }
  }
  ctx.restore();
  return d ? `${d.mode} · caras ${d.faces.length}${d.ms ? ` · ${d.ms} ms` : ''}${d.motion ? ' · movimiento' : ''}` : 'cámara apagada';
}
