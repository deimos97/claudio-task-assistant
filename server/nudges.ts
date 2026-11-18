// Avisos: cosas que Claudio quiere decir o preguntar, pero que NO dice solo. Salen en pantalla
// bajo los ojos ("Resumen de hoy", "¿Hecho? Cambiar la arena") y, al tocarlos (o al pedírselo
// por voz), Claudio lo pregunta. Así nunca habla si no hay nadie delante.
// Un aviso tocado o descartado no vuelve a salir ese día.
import { db } from './db.ts';
import { localNow } from './config.ts';
import { publish } from './bus.ts';
import { InputError, isPastEvent, upcoming } from './items.ts';
import { assetsSummary, listRoutines } from './routines.ts';

export type Nudge = {
  key: string;
  kind: 'briefing' | 'routine' | 'reading' | 'event';
  label: string;   // lo que se ve en el botón
  ask: string;     // lo que se le manda a Claudio al tocarlo
};

const BRIEFING_FROM = '06:00';
const BRIEFING_TO = '12:30';
const READING_STALE_DAYS = 21; // pedir los km si la última lectura tiene más de 3 semanas
const MAX = 4;

const toDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function seenToday(): Set<string> {
  const rows = db.prepare('SELECT key FROM nudges_seen WHERE day = ?').all(localNow().date) as { key: string }[];
  return new Set(rows.map((r) => r.key));
}

/** Avisos pendientes de hoy, del más útil al menos. */
export function nudges(): Nudge[] {
  const now = localNow();
  const time = now.stamp.slice(11);
  const out: Nudge[] = [];

  if (time >= BRIEFING_FROM && time <= BRIEFING_TO) {
    out.push({ key: 'briefing', kind: 'briefing', label: 'Resumen de hoy', ask: 'Dame el resumen de hoy.' });
  }
  // Citas que ya pasaron sin marcar: ¿se tuvieron?
  for (const it of upcoming(80, true)) {
    if (!isPastEvent(it)) continue;
    out.push({ key: `event:${it.id}`, kind: 'event', label: `¿Lo tuviste? ${it.title}`, ask: `Pregúntame si ya tuve «${it.title}» (#${it.id}).` });
  }
  // Rutinas que tocan hoy o ya pasaron
  for (const r of listRoutines()) {
    if (!r.due_at || r.due_at > now.date) continue;
    out.push({ key: `routine:${r.id}`, kind: 'routine', label: `¿Hecho? ${r.title}`, ask: `Pregúntame si ya he hecho «${r.title}» (rutina ${r.id}) y cuándo.` });
  }
  // Contadores con rutinas por uso y una lectura vieja (o ninguna)
  const usage = new Set(listRoutines().filter((r) => r.every_amount && r.counter_id).map((r) => r.counter_id));
  for (const c of assetsSummary()) {
    if (!usage.has(c.id)) continue;
    if (c.last && toDay(now.date) - toDay(c.last.at) < READING_STALE_DAYS) continue;
    out.push({ key: `reading:${c.id}`, kind: 'reading', label: `${cap(c.asset)}: ¿cuántos ${c.unit}?`, ask: `Pregúntame cuántos ${c.unit} tiene ${c.asset}.` });
  }

  const seen = seenToday();
  return out.filter((n) => !seen.has(n.key)).slice(0, MAX);
}

/** Tocado o descartado: no vuelve a salir hoy. */
export function seeNudge(key: unknown): void {
  if (typeof key !== 'string' || !/^(briefing|(routine|reading|event):\d+)$/.test(key)) throw new InputError('aviso desconocido');
  db.prepare('INSERT OR IGNORE INTO nudges_seen (key, day) VALUES (?, ?)').run(key, localNow().date);
  // Limpieza: lo de hace más de una semana ya no sirve
  db.prepare("DELETE FROM nudges_seen WHERE day < date(?, '-7 day')").run(localNow().date);
  publish('items');
}
