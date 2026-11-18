// Oídos y voz de Claudio en el navegador:
// micro → bloques a 16 kHz → detector de voz por energía (VAD) → frases en WAV.
// El reconocimiento (whisper) y la voz (say) están en el servidor.

const RATE = 16000;
const PREROLL_MS = 350;   // audio que se guarda antes de detectar voz (para no comerse el principio)
const START_BLOCKS = 3;   // bloques seguidos con voz para empezar una frase (~65 ms)
const END_MS = 700;       // silencio que cierra una frase
const MIN_SPEECH_MS = 250;
const MAX_MS = 15_000;

export class Ears {
  /** @param {(wav: ArrayBuffer, ms: number, f0: number | null) => void} onPhrase  f0: tono medio en Hz */
  constructor(onPhrase) {
    this.onPhrase = onPhrase;
    this.ctx = null;
    this.stream = null;
    this.muted = false;          // mientras Claudio habla no se escucha
    this.onLevel = null;         // (hablando: boolean) => void, para animaciones
    this.#reset();
  }

  get running() { return !!this.stream && this.ctx?.state === 'running'; }

  async start() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      await this.ctx.audioWorklet.addModule('capture-worklet.js');
      const src = this.ctx.createMediaStreamSource(this.stream);
      const node = new AudioWorkletNode(this.ctx, 'claudio-capture');
      node.port.onmessage = (e) => this.#block(e.data);
      src.connect(node);
      // Sin conexión a la salida algunos navegadores no ejecutan el nodo: se conecta mudo.
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(this.ctx.destination);
      this.step = this.ctx.sampleRate / RATE;
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.ctx.state !== 'running') throw new Error('audio-suspended');
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    this.#reset();
  }

  #reset() {
    this.floor = -60;      // ruido de fondo estimado (dBFS)
    this.pos = 0;          // posición fraccionaria del remuestreo
    this.last = 0;
    this.pre = [];         // bloques de antes de la frase
    this.preLen = 0;
    this.phrase = null;    // bloques de la frase en curso
    this.voiced = 0;
    this.silentMs = 0;
    this.speechMs = 0;
  }

  // Remuestreo lineal a 16 kHz, conservando la fase entre bloques. `pos` puede quedar
  // en [-1, 0): entonces se interpola con la última muestra del bloque anterior.
  #resample(input) {
    const out = [];
    let p = this.pos;
    while (p < input.length - 1) {
      const i = Math.floor(p);
      const a = i < 0 ? this.last : input[i];
      out.push(a + (input[i + 1] - a) * (p - i));
      p += this.step;
    }
    this.pos = p - input.length;
    this.last = input[input.length - 1];
    return Float32Array.from(out);
  }

  #block(raw) {
    const block = this.#resample(raw);
    if (!block.length) return;
    const ms = (block.length / RATE) * 1000;
    if (this.muted) { this.phrase = null; this.voiced = 0; return; }

    let sum = 0;
    for (const s of block) sum += s * s;
    const db = 10 * Math.log10(sum / block.length + 1e-12);
    const loud = db > Math.max(this.floor + 12, -52);

    if (!this.phrase) {
      // Ruido de fondo: baja rápido, sube despacio
      this.floor = db < this.floor ? this.floor * 0.7 + db * 0.3 : this.floor * 0.995 + db * 0.005;
      this.pre.push(block);
      this.preLen += ms;
      while (this.preLen > PREROLL_MS && this.pre.length > 1) this.preLen -= (this.pre.shift().length / RATE) * 1000;
      this.voiced = loud ? this.voiced + 1 : 0;
      if (this.voiced >= START_BLOCKS) {
        this.phrase = [...this.pre];
        this.phraseMs = this.preLen;
        this.speechMs = this.voiced * ms;
        this.silentMs = 0;
        this.onLevel?.(true);
      }
      return;
    }

    this.phrase.push(block);
    this.phraseMs += ms;
    if (loud) { this.speechMs += ms; this.silentMs = 0; } else this.silentMs += ms;
    if (this.silentMs >= END_MS || this.phraseMs >= MAX_MS) {
      const blocks = this.phrase;
      const speech = this.speechMs;
      this.phrase = null;
      this.voiced = 0;
      this.pre = [];
      this.preLen = 0;
      this.onLevel?.(false);
      if (speech >= MIN_SPEECH_MS) this.onPhrase(toWav(blocks), this.phraseMs, pitchOf(blocks));
    }
  }

  /** Pitido de "te escucho" (sube) o de "lo dejo" (baja). */
  beep(up = true) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const tones = up ? [660, 990] : [660, 440];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.25, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.085);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.09);
    });
  }

  /** Reproduce audio (ArrayBuffer) y resuelve al terminar. Mientras suena, no se escucha. */
  async play(data) {
    const ctx = this.ctx;
    if (!ctx) return;
    const buffer = await ctx.decodeAudioData(data);
    this.muted = true;
    try {
      await new Promise((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.onended = resolve;
        src.start();
      });
      await new Promise((r) => setTimeout(r, 350)); // que no se oiga a sí mismo en la cola
    } finally {
      this.muted = false;
    }
  }
}

function toWav(blocks) {
  const n = blocks.reduce((a, b) => a + b.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const b of blocks) for (const s of b) { v.setInt16(o, Math.max(-1, Math.min(1, s)) * 0x7fff, true); o += 2; }
  return buf;
}

/** "Claudio" al principio (con "oye", "hey"… delante). Devuelve lo que sigue, o null si no lo han llamado. */
export function wakeWord(text) {
  // Quitar tildes letra a letra, para que las posiciones sigan valiendo en el texto original
  const plain = Array.from(text, (c) => c.normalize('NFD')[0]).join('');
  const m = plain.match(/^\s*(?:(?:oye|hey|hola|ok|okay|vale|eh|ey)[\s,]+)?claudio\b[\s,.!?¡¿:;-]*/i);
  if (!m) return null;
  return Array.from(text).slice(Array.from(m[0]).length).join('').trim();
}

/** Tono medio (frecuencia fundamental, Hz) de una frase a 16 kHz, o null si no hay voz clara.
 *  Autocorrelación normalizada en ventanas de 32 ms; mediana de las ventanas con voz.
 *  Sirve para distinguir una voz grave de una aguda (Javier / Ana). */
export function pitchOf(blocks) {
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const x = new Float32Array(total);
  let o = 0;
  for (const b of blocks) { x.set(b, o); o += b.length; }
  const N = 512, HOP = 256;
  const minLag = Math.floor(RATE / 350), maxLag = Math.ceil(RATE / 70);
  // Solo las ventanas con más energía (la voz, no las pausas)
  const frames = [];
  for (let i = 0; i + N + maxLag < x.length; i += HOP) {
    let e = 0;
    for (let j = 0; j < N; j++) e += x[i + j] * x[i + j];
    frames.push([i, e]);
  }
  if (!frames.length) return null;
  const sorted = frames.map((f) => f[1]).sort((a, b) => a - b);
  const gate = sorted[Math.floor(sorted.length * 0.5)];
  const f0s = [];
  for (const [i, e0] of frames) {
    if (e0 < gate || e0 < 1e-4) continue;
    const r = new Float32Array(maxLag + 1);
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0, e1 = 0;
      for (let j = 0; j < N; j++) { num += x[i + j] * x[i + j + lag]; e1 += x[i + j + lag] * x[i + j + lag]; }
      r[lag] = num / Math.sqrt(e0 * e1 + 1e-12);
      if (r[lag] > best) best = r[lag];
    }
    if (best < 0.6) continue;
    // El primer pico cerca del máximo (evita confundir el tono con su octava baja)
    let lag = minLag;
    while (lag < maxLag && !(r[lag] >= best * 0.9 && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1])) lag++;
    f0s.push(RATE / lag);
  }
  if (f0s.length < 3) return null;
  f0s.sort((a, b) => a - b);
  return Math.round(f0s[Math.floor(f0s.length / 2)]);
}
