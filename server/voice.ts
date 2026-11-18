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
const VOICES = {
  es: process.env.CLAUDIO_VOICE_ES ?? 'Reed (Spanish (Spain))',
  en: process.env.CLAUDIO_VOICE_EN ?? 'Reed (English (US))',
};

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

/** Texto → audio AAC (.m4a) con la voz de Claudio. */
export async function speak(text: string): Promise<Buffer> {
  const clean = text
    .replace(/[*_`#>]/g, '')                       // restos de markdown
    .replace(/\p{Extended_Pictographic}/gu, '')    // emojis
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  if (!clean) throw new VoiceError('Nada que decir');
  const dir = await mkdtemp(join(tmpdir(), 'claudio-tts-'));
  try {
    const input = join(dir, 'text.txt');
    const output = join(dir, 'voz.m4a');
    await writeFile(input, clean);
    await run('say', ['-v', VOICES[guessLanguage(clean)], '-f', input, '-o', output, '--file-format=m4af', '--data-format=aac'], { timeout: 30_000 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
