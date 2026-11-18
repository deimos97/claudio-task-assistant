// Rutas y ajustes comunes. Los datos viven FUERA del repo (deploy.sh hace
// `git reset --hard` en prod): ~/.claudio/<entorno>/.
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.PORT ?? 3111);
export const ENV = process.env.CLAUDIO_ENV ?? 'dev';
export const TZ = 'Europe/Madrid';

export const CLAUDIO_HOME = process.env.CLAUDIO_HOME ?? join(homedir(), '.claudio');
export const DATA_DIR = process.env.CLAUDIO_DATA_DIR ?? join(CLAUDIO_HOME, ENV);
export const DB_FILE = join(DATA_DIR, 'claudio.db');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const BACKUPS_KEPT = 14;
// Clave de Anthropic: la variable de entorno o este fichero (chmod 600), común a dev y prod.
export const ANTHROPIC_KEY_FILE = join(CLAUDIO_HOME, 'anthropic-key');

// Las dos personas que usan a Claudio. owner NULL en la BD = de los dos.
export const PEOPLE = {
  javier: { name: 'Javier', voice: process.env.CLAUDIO_VOICE_ES ?? 'Jorge (Enhanced)' },
  ana: { name: 'Ana', voice: process.env.CLAUDIO_VOICE_ES_ANA ?? 'Mónica (Enhanced)' },
} as const;
export type Who = keyof typeof PEOPLE;
export const isWho = (v: unknown): v is Who => v === 'javier' || v === 'ana';

/** Fecha y hora local de Madrid como "YYYY-MM-DDTHH:MM" (y el día de la semana). */
export function localNow(d = new Date()): { stamp: string; date: string; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { stamp: `${date}T${parts.hour}:${parts.minute}`, date, weekday: parts.weekday };
}
