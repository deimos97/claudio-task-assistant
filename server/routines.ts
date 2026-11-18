// Motor de mantenimiento: activos (coche, bici…), contadores (km, horas), lecturas y
// rutinas que vencen por tiempo ("cada 5 días"), por uso ("cada 15.000 km") o lo primero.
// Con dos o más lecturas se estima el ritmo de uso (unidades/día) y se proyecta la fecha.
import { db } from './db.ts';
import { localNow } from './config.ts';
import { publish } from './bus.ts';
import { checkCategory, InputError, optText } from './items.ts';

export type Routine = {
  id: number; title: string; category: string | null;
  asset_id: number | null; counter_id: number | null;
  every_days: number | null; every_amount: number | null;
  last_done_at: string | null; last_done_value: number | null; notes: string | null;
};
export type RoutineStatus = Routine & {
  asset: string | null; unit: string | null;
  due_at: string | null;      // fecha local en que toca (la más temprana de tiempo y uso)
  due_value: number | null;   // valor del contador en que toca
  current: number | null;     // valor estimado hoy
  detail: string;             // "cada 5 días · última vez 15-11"
};

const COLS = 'id, title, category, asset_id, counter_id, every_days, every_amount, last_done_at, last_done_value, notes';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

// ---------- fechas locales "YYYY-MM-DD" ----------
const toDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;
const fromDay = (n: number) => new Date(Math.round(n) * 86_400_000).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => fromDay(toDay(s) + n);

function checkDay(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  if (!DAY_RE.test(s) || Number.isNaN(Date.parse(s))) throw new InputError(`${field} debe ser "YYYY-MM-DD"`);
  return s;
}
function checkNum(v: unknown, field: string, positive = false): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || (positive && n <= 0)) throw new InputError(`${field} debe ser un número${positive ? ' mayor que 0' : ''}`);
  return n;
}

// ---------- activos, contadores y lecturas ----------
type Counter = { id: number; asset_id: number; unit: string; asset: string };

function ensureCounter(assetName: unknown, unit: unknown, assetCategory?: unknown): Counter {
  if (typeof assetName !== 'string' || !assetName.trim()) throw new InputError('asset (coche, bici…) es obligatorio');
  if (typeof unit !== 'string' || !unit.trim()) throw new InputError('unit (km, horas…) es obligatorio');
  const name = assetName.trim().slice(0, 60);
  let asset = db.prepare('SELECT id, name FROM assets WHERE name = ?').get(name) as { id: number; name: string } | undefined;
  if (!asset) {
    const r = db.prepare('INSERT INTO assets (name, category) VALUES (?, ?)').run(name, checkCategory(assetCategory));
    asset = { id: Number(r.lastInsertRowid), name };
  }
  const u = unit.trim().toLowerCase().slice(0, 20);
  let c = db.prepare('SELECT id, asset_id, unit FROM counters WHERE asset_id = ? AND unit = ?').get(asset.id, u) as Omit<Counter, 'asset'> | undefined;
  if (!c) {
    const r = db.prepare('INSERT INTO counters (asset_id, unit) VALUES (?, ?)').run(asset.id, u);
    c = { id: Number(r.lastInsertRowid), asset_id: asset.id, unit: u };
  }
  return { ...c, asset: asset.name };
}

export function logReading(input: Record<string, unknown>) {
  const c = ensureCounter(input.asset, input.unit, input.asset_category);
  const value = checkNum(input.value, 'value');
  if (value === null) throw new InputError('value es obligatorio');
  const at = checkDay(input.at, 'at') ?? localNow().date;
  db.prepare('INSERT INTO readings (counter_id, value, at) VALUES (?, ?, ?)').run(c.id, value, at);
  publish('items');
  return { asset: c.asset, unit: c.unit, value, at, ...counterState(c.id) };
}

/** Última lectura, ritmo de uso (unidades/día) y valor estimado hoy. */
export function counterState(counterId: number) {
  const rows = db.prepare('SELECT value, at FROM readings WHERE counter_id = ? ORDER BY at, id').all(counterId) as { value: number; at: string }[];
  if (!rows.length) return { last: null, rate: null, current: null };
  const last = rows[rows.length - 1];
  // Ritmo con las lecturas del último año (o todas, si son de antes)
  const yearAgo = addDays(last.at, -365);
  const first = rows.find((r) => r.at >= yearAgo) ?? rows[0];
  const days = toDay(last.at) - toDay(first.at);
  const rate = days >= 1 && last.value > first.value ? (last.value - first.value) / days : null;
  const elapsed = toDay(localNow().date) - toDay(last.at);
  const current = rate ? last.value + rate * Math.max(0, elapsed) : last.value;
  return { last, rate, current };
}

/** Activos con sus contadores, última lectura y ritmo: para la agenda que ve Claudio. */
export function assetsSummary() {
  const counters = db.prepare(`SELECT c.id, c.unit, a.name AS asset FROM counters c JOIN assets a ON a.id = c.asset_id ORDER BY a.id, c.id`)
    .all() as { id: number; unit: string; asset: string }[];
  return counters.map((c) => ({ ...c, ...counterState(c.id) }));
}

// ---------- rutinas ----------
function getRoutine(id: unknown): Routine {
  const r = typeof id === 'number' ? db.prepare(`SELECT ${COLS} FROM routines WHERE id = ?`).get(id) as Routine | undefined : undefined;
  if (!r) throw new InputError(`no existe la rutina ${String(id)}`);
  return r;
}

export function status(r: Routine): RoutineStatus {
  const today = localNow().date;
  const meta = r.counter_id
    ? db.prepare('SELECT c.unit, a.name AS asset FROM counters c JOIN assets a ON a.id = c.asset_id WHERE c.id = ?').get(r.counter_id) as { unit: string; asset: string } | undefined
    : undefined;
  const asset = meta?.asset ?? (r.asset_id ? (db.prepare('SELECT name FROM assets WHERE id = ?').get(r.asset_id) as { name: string } | undefined)?.name ?? null : null);
  const unit = meta?.unit ?? null;

  const dates: string[] = [];
  // Por tiempo: desde la última vez; si nunca se hizo, toca ya.
  if (r.every_days) dates.push(r.last_done_at ? addDays(r.last_done_at, r.every_days) : today);

  // Por uso: valor objetivo y, con ritmo conocido, fecha proyectada.
  let dueValue: number | null = null;
  let current: number | null = null;
  if (r.every_amount && r.counter_id) {
    const st = counterState(r.counter_id);
    current = st.current;
    const base = r.last_done_value ?? null;
    if (base !== null) dueValue = base + r.every_amount;
    if (dueValue !== null && st.last) {
      if (st.current !== null && st.current >= dueValue) dates.push(today);
      else if (st.rate) dates.push(addDays(st.last.at, Math.ceil((dueValue - st.last.value) / st.rate)));
    }
  }
  const dueAt = dates.length ? dates.sort()[0] : null;

  const every = [
    r.every_days ? `cada ${r.every_days === 1 ? 'día' : `${r.every_days} días`}` : '',
    r.every_amount && unit ? `${r.every_days ? 'o ' : 'cada '}${fmt.format(r.every_amount)} ${unit}` : '',
  ].filter(Boolean).join(' ');
  const parts = [every];
  if (r.last_done_at) parts.push(`última vez ${r.last_done_at.slice(8, 10)}-${r.last_done_at.slice(5, 7)}`);
  else parts.push('sin hacer aún');
  if (dueValue !== null && current !== null) parts.push(`≈ ${fmt.format(Math.round(current))} / ${fmt.format(dueValue)} ${unit}`);
  return { ...r, asset, unit, due_at: dueAt, due_value: dueValue, current, detail: parts.join(' · ') };
}

export function listRoutines(category?: string): RoutineStatus[] {
  const rows = (category
    ? db.prepare(`SELECT ${COLS} FROM routines WHERE category = ? ORDER BY id`).all(category.toLowerCase())
    : db.prepare(`SELECT ${COLS} FROM routines ORDER BY id`).all()) as Routine[];
  return rows.map(status).sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
}

export function createRoutine(input: Record<string, unknown>): RoutineStatus {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new InputError('title es obligatorio');
  const everyDays = checkNum(input.every_days, 'every_days', true);
  const everyAmount = checkNum(input.every_amount, 'every_amount', true);
  if (!everyDays && !everyAmount) throw new InputError('hace falta every_days, every_amount (con asset y unit) o ambos');
  // Por uso hace falta contador (se crea si no existe); por tiempo, el activo es opcional.
  const counter = everyAmount || (input.asset && input.unit) ? ensureCounter(input.asset, input.unit, input.category) : null;
  const lastValue = checkNum(input.last_done_value, 'last_done_value');
  const r = db.prepare(`INSERT INTO routines (title, category, asset_id, counter_id, every_days, every_amount, last_done_at, last_done_value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.title.trim().slice(0, 200), checkCategory(input.category), counter?.asset_id ?? null, counter?.id ?? null,
    everyDays === null ? null : Math.round(everyDays), everyAmount, checkDay(input.last_done_at, 'last_done_at'), lastValue, optText(input.notes),
  );
  publish('items');
  return status(getRoutine(Number(r.lastInsertRowid)));
}

export function updateRoutine(input: Record<string, unknown>): RoutineStatus {
  const cur = getRoutine(input.id);
  const next = { ...cur };
  if ('title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim()) throw new InputError('title no puede quedar vacío');
    next.title = input.title.trim().slice(0, 200);
  }
  if ('category' in input) next.category = checkCategory(input.category);
  if ('every_days' in input) { const n = checkNum(input.every_days, 'every_days', true); next.every_days = n === null ? null : Math.round(n); }
  if ('every_amount' in input) next.every_amount = checkNum(input.every_amount, 'every_amount', true);
  if ('last_done_at' in input) next.last_done_at = checkDay(input.last_done_at, 'last_done_at');
  if ('last_done_value' in input) next.last_done_value = checkNum(input.last_done_value, 'last_done_value');
  if ('notes' in input) next.notes = optText(input.notes);
  if (input.asset && input.unit) {
    const c = ensureCounter(input.asset, input.unit, next.category);
    next.asset_id = c.asset_id; next.counter_id = c.id;
  }
  if (!next.every_days && !next.every_amount) throw new InputError('la rutina necesita every_days o every_amount');
  if (next.every_amount && !next.counter_id) throw new InputError('every_amount necesita asset y unit');
  db.prepare(`UPDATE routines SET title = ?, category = ?, asset_id = ?, counter_id = ?, every_days = ?, every_amount = ?,
    last_done_at = ?, last_done_value = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(
    next.title, next.category, next.asset_id, next.counter_id, next.every_days, next.every_amount,
    next.last_done_at, next.last_done_value, next.notes, cur.id,
  );
  publish('items');
  return status(getRoutine(cur.id));
}

/** "Lo he hecho": apunta la fecha (hoy por defecto) y el valor del contador; la siguiente se recalcula sola. */
export function doneRoutine(input: Record<string, unknown>): RoutineStatus {
  const cur = getRoutine(input.id);
  const at = checkDay(input.done_at, 'done_at') ?? localNow().date;
  let value = checkNum(input.value, 'value');
  if (value !== null && cur.counter_id) {
    // Un valor dicho al hacerlo es también una lectura del contador
    db.prepare('INSERT INTO readings (counter_id, value, at) VALUES (?, ?, ?)').run(cur.counter_id, value, at);
  } else if (value === null && cur.counter_id) {
    const st = counterState(cur.counter_id);
    value = st.current === null ? null : Math.round(st.current);
  }
  db.prepare('INSERT INTO routine_log (routine_id, done_at, value) VALUES (?, ?, ?)').run(cur.id, at, value);
  // Si se apunta una vez anterior a la última conocida, no se retrocede
  if (!cur.last_done_at || at >= cur.last_done_at) {
    db.prepare(`UPDATE routines SET last_done_at = ?, last_done_value = COALESCE(?, last_done_value),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(at, value, cur.id);
  }
  publish('items');
  return status(getRoutine(cur.id));
}

export function deleteRoutine(id: unknown): Routine {
  const r = getRoutine(id);
  db.prepare('DELETE FROM routines WHERE id = ?').run(r.id);
  publish('items');
  return r;
}

/** Historial de una rutina (las últimas veces que se hizo). */
export function routineLog(id: unknown, limit = 10) {
  const r = getRoutine(id);
  return db.prepare('SELECT done_at, value FROM routine_log WHERE routine_id = ? ORDER BY done_at DESC, id DESC LIMIT ?').all(r.id, limit);
}
