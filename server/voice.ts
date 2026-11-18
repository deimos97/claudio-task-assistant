// Voz: reconocimiento (whisper.cpp en el Mac mini) y síntesis (`say` de macOS).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const WHISPER_URL = process.env.CLAUDIO_WHISPER_URL ?? 'http://127.0.0.1:3120/inference';
// Idioma fijo "es": la detección automática dobla el tiempo (0,85 s → 1,7 s) y el
// modelo turbo transcribe igual de bien el inglés aunque se le diga "es".
const STT_LANGUAGE = process.env.CLAUDIO_STT_LANGUAGE ?? 'es';
// Español: voz del Mac (`say`). Inglés: Kokoro (servicio local en :3121); si no responde, `say`.
const SAY_VOICE_ES = process.env.CLAUDIO_VOICE_ES ?? 'Jorge (Enhanced)';
const SAY_VOICE_EN = process.env.CLAUDIO_VOICE_EN_FALLBACK ?? 'Samantha';
const KOKORO_URL = process.env.CLAUDIO_KOKORO_URL ?? 'http://127.0.0.1:3121/tts';
const KOKORO_VOICE_EN = process.env.CLAUDIO_VOICE_EN ?? 'af_heart';

export class VoiceError extends Error {}

/** WAV (16 kHz mono) → texto. */
export async function transcribe(wav: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
  form.append('language', STT_LANGUAGE);
  form.append('prompt', 'Claudio.');
  form.append('temperature', '0');
  form.append('response_format', 'json');
  let res: Response;
  try {
    res = await fetch(WHISPER_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new VoiceError('El reconocimiento de voz no responde (¿whisper parado?)');
  }
  if (!res.ok) throw new VoiceError(`whisper respondió ${res.status}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new VoiceError(`whisper: ${data.error}`);
  return (data.text ?? '').replace(/\s+/g, ' ').trim();
}

/** Idioma de una respuesta, a ojo: cuenta palabras típicas de cada uno. */
export function guessLanguage(text: string): 'es' | 'en' {
  const es = text.match(/[ñáéíóú¿¡]|\b(el|la|los|las|de|del|que|y|en|un|una|para|con|tu|tienes|he|has|está|mañana|hoy|lo|se)\b/gi)?.length ?? 0;
  const en = text.match(/\b(the|you|your|and|is|are|have|has|to|on|at|for|it|what|tomorrow|today|i|i'm|i've)\b/gi)?.length ?? 0;
  return en > es ? 'en' : 'es';
}

export type Speech = { audio: Buffer; type: 'audio/mp4' | 'audio/wav' };

/** Texto → audio con la voz de Claudio (español: Jorge; inglés: Heart). */
export async function speak(text: string): Promise<Speech> {
  const clean = text
    .replace(/[*_`#>]/g, '')                       // restos de markdown
    .replace(/\p{Extended_Pictographic}/gu, '')    // emojis
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  if (!clean) throw new VoiceError('Nada que decir');
  const lang = guessLanguage(clean);
  if (lang === 'en') {
    try {
      return { audio: await kokoro(clean, KOKORO_VOICE_EN, 'en-us'), type: 'audio/wav' };
    } catch (e) {
      console.error('voz: Kokoro no responde, uso say', e instanceof Error ? e.message : e);
    }
  }
  return { audio: await say(clean, lang === 'en' ? SAY_VOICE_EN : SAY_VOICE_ES), type: 'audio/mp4' };
}

async function kokoro(text: string, voice: string, lang: string): Promise<Buffer> {
  const res = await fetch(KOKORO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, lang }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Kokoro respondió ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function say(text: string, voice: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'claudio-tts-'));
  try {
    const input = join(dir, 'text.txt');
    const output = join(dir, 'voz.m4a');
    await writeFile(input, text);
    await run('say', ['-v', voice, '-f', input, '-o', output, '--file-format=m4af', '--data-format=aac'], { timeout: 30_000 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
