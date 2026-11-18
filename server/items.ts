// Eventos y tareas: acceso a la BD y validación (lo usan la API y las herramientas de Haiku).
import { db } from './db.ts';
import { localNow } from './config.ts';
import { publish } from './bus.ts';

export type Item = {
  id: number;
  kind: 'event' | 'task';
  title: string;
  at: string | null;
  end_at: string | null;
  notes: string | null;
  category: string | null;
  owner: 'javier' | 'ana' | null;
  priority: number;
  done_at: string | null;
};

const COLS = 'id, kind, title, at, end_at, notes, category, owner, priority, done_at';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export class InputError extends Error {}

function checkWhen(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v.length === 10 ? v : `${v}:00`))) {
    throw new InputError(`${field} debe ser "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM" (hora de Madrid)`);
  }
  return v;
}
function checkTitle(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new InputError('title es obligatorio');
  return v.trim().slice(0, 200);
}
function checkKind(v: unknown): 'event' | 'task' {
  if (v !== 'event' && v !== 'task') throw new InputError('kind debe ser "event" o "task"');
  return v;
}
/** Categoría: ruta en minúsculas de hasta 3 niveles, "casa/gatos" ("casa > gatos" también vale). */
export function checkCategory(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new InputError('category debe ser texto');
  const path = v.toLowerCase().split(/[\/>›]/).map((p) => p.trim()).filter(Boolean).slice(0, 3).map((p) => p.slice(0, 30));
  return path.join('/') || null;
}
/** SQL para "esta categoría o cualquiera de sus subcategorías". */
export const categoryWhere = (col = 'category') => `(${col} = ? OR ${col} LIKE ? || '/%')`;

/** Dueño: 'javier', 'ana' o null (de los dos). */
export function checkOwner(v: unknown): 'javier' | 'ana' | null {
  if (v === undefined || v === null || v === '' || v === 'both' || v === 'ambos') return null;
  if (v === 'javier' || v === 'ana') return v;
  throw new InputError('owner debe ser "javier", "ana" o "both"');
}
/** Prioridad 0–3: 0 algún día · 1 normal · 2 importante · 3 crítico. */
export function checkPriority(v: unknown, fallback = 1): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 3) throw new InputError('priority debe ser 0, 1, 2 o 3');
  return n;
}
export function optText(v: unknown, max = 2000): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new InputError('notes debe ser texto');
  return v.slice(0, max);
}

export function getItem(id: number): Item | undefined {
  return db.prepare(`SELECT ${COLS} FROM items WHERE id = ?`).get(id) as Item | undefined;
}
function mustGet(id: unknown): Item {
  const item = typeof id === 'number' ? getItem(id) : undefined;
  if (!item) throw new InputError(`no existe el elemento ${String(id)}`);
  return item;
}

/** Lo que aparece en "Próximo": tareas abiertas (vencidas incluidas) y eventos que no han pasado. */
export function upcoming(limit = 40): Item[] {
  const { stamp, date } = localNow();
  return db.prepare(`
    SELECT ${COLS} FROM items
    WHERE done_at IS NULL
      AND (kind = 'task'
           OR at IS NULL
           OR COALESCE(end_at, at) >= CASE WHEN length(COALESCE(end_at, at)) = 10 THEN ? ELSE ? END)
    ORDER BY at IS NULL, at, id
    LIMIT ?`).all(date, stamp, limit) as Item[];
}

export function listItems(opts: { includeDone?: boolean; from?: string; to?: string; category?: string } = {}): Item[] {
  const where: string[] = [];
  const args: string[] = [];
  if (!opts.includeDone) where.push('done_at IS NULL');
  if (opts.category) { const c = checkCategory(opts.category)!; where.push(categoryWhere()); args.push(c, c); }
  if (opts.from) { where.push('at >= ?'); args.push(opts.from); }
  if (opts.to) { where.push('at <= ?'); args.push(opts.to); }
  return db.prepare(`SELECT ${COLS} FROM items
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at IS NULL, at, id LIMIT 200`).all(...args) as Item[];
}

export function createItem(input: Record<string, unknown>): Item {
  const kind = checkKind(input.kind);
  const title = checkTitle(input.title);
  const at = checkWhen(input.at, 'at');
  const end = kind === 'event' ? checkWhen(input.end_at, 'end_at') : null;
  if (kind === 'event' && !at) throw new InputError('un evento necesita fecha (at)');
  const r = db.prepare('INSERT INTO items (kind, title, at, end_at, notes, category, owner, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(kind, title, at, end, optText(input.notes), checkCategory(input.category), checkOwner(input.owner), checkPriority(input.priority));
  publish('items');
  return getItem(Number(r.lastInsertRowid))!;
}

export function updateItem(input: Record<string, unknown>): Item {
  const item = mustGet(input.id);
  const next = {
    kind: 'kind' in input ? checkKind(input.kind) : item.kind,
    title: 'title' in input ? checkTitle(input.title) : item.title,
    at: 'at' in input ? checkWhen(input.at, 'at') : item.at,
    end_at: 'end_at' in input ? checkWhen(input.end_at, 'end_at') : item.end_at,
    notes: 'notes' in input ? optText(input.notes) : item.notes,
    category: 'category' in input ? checkCategory(input.category) : item.category,
    owner: 'owner' in input ? checkOwner(input.owner) : item.owner,
    priority: 'priority' in input ? checkPriority(input.priority) : item.priority,
  };
  if (next.kind === 'event' && !next.at) throw new InputError('un evento necesita fecha (at)');
  db.prepare(`UPDATE items SET kind = ?, title = ?, at = ?, end_at = ?, notes = ?, category = ?, owner = ?, priority = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .run(next.kind, next.title, next.at, next.end_at, next.notes, next.category, next.owner, next.priority, item.id);
  publish('items');
  return getItem(item.id)!;
}

export function completeItem(id: unknown, done = true): Item {
  const item = mustGet(id);
  db.prepare(`UPDATE items SET done_at = ${done ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : 'NULL'},
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(item.id);
  publish('items');
  return getItem(item.id)!;
}

export function deleteItem(id: unknown): Item {
  const item = mustGet(id);
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  publish('items');
  return item;
}
