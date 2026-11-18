// Listas (compra, ideas, notas…): cada una con sus entradas, que se tachan o se borran.
import { db } from './db.ts';
import { publish } from './bus.ts';
import { checkCategory, checkOwner, InputError } from './items.ts';

export type List = { id: number; name: string; category: string | null; owner: 'javier' | 'ana' | null };
export type Entry = { id: number; list_id: number; text: string; category: string | null; done_at: string | null };

const ENTRY_COLS = 'id, list_id, text, category, done_at';

function checkName(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new InputError('list (nombre de la lista) es obligatorio');
  const t = v.trim().slice(0, 60);
  return t[0].toUpperCase() + t.slice(1);
}

export function findList(name: unknown): List | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return db.prepare('SELECT id, name, category, owner FROM lists WHERE name = ?').get(name.trim()) as List | undefined;
}
function mustList(name: unknown): List {
  const l = findList(name);
  if (!l) throw new InputError(`no existe la lista "${String(name)}"`);
  return l;
}

export function allLists(): List[] {
  return db.prepare('SELECT id, name, category, owner FROM lists ORDER BY id').all() as List[];
}

/** Entradas de una lista: pendientes primero; las hechas solo de las últimas 24 h. */
export function entries(listId: number, includeDone = false): Entry[] {
  return db.prepare(`SELECT ${ENTRY_COLS} FROM list_entries WHERE list_id = ?
    AND (done_at IS NULL OR (? AND done_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')))
    ORDER BY done_at IS NOT NULL, category IS NULL, category, id`).all(listId, includeDone ? 1 : 0) as Entry[];
}

/** Añade entradas a una lista; si la lista no existe, la crea. */
export function addToList(input: Record<string, unknown>): { list: List; added: Entry[] } {
  const name = checkName(input.list);
  let list = findList(name);
  if (!list) {
    const category = checkCategory(input.list_category);
    const owner = checkOwner(input.list_owner);
    const r = db.prepare('INSERT INTO lists (name, category, owner) VALUES (?, ?, ?)').run(name, category, owner);
    list = { id: Number(r.lastInsertRowid), name, category, owner };
  }
  const raw = Array.isArray(input.entries) ? input.entries : [];
  if (!raw.length) throw new InputError('entries debe tener al menos una entrada');
  const added: Entry[] = [];
  const ins = db.prepare('INSERT INTO list_entries (list_id, text, category) VALUES (?, ?, ?)');
  for (const e of raw.slice(0, 50)) {
    const obj = (typeof e === 'string' ? { text: e } : e) as Record<string, unknown>;
    const text = typeof obj?.text === 'string' ? obj.text.trim().slice(0, 300) : '';
    if (!text) continue;
    // Si ya estaba pendiente, no se duplica
    const dup = db.prepare(`SELECT ${ENTRY_COLS} FROM list_entries WHERE list_id = ? AND done_at IS NULL AND text = ? COLLATE NOCASE`)
      .get(list.id, text) as Entry | undefined;
    if (dup) { added.push(dup); continue; }
    const r = ins.run(list.id, text, checkCategory(obj.category));
    added.push(db.prepare(`SELECT ${ENTRY_COLS} FROM list_entries WHERE id = ?`).get(Number(r.lastInsertRowid)) as Entry);
  }
  publish('items');
  return { list, added };
}

function ids(v: unknown): number[] {
  const arr = Array.isArray(v) ? v : [v];
  const out = arr.filter((x): x is number => typeof x === 'number' && Number.isInteger(x));
  if (!out.length) throw new InputError('entry_ids: lista de ids de entradas');
  return out;
}

/** Tacha (comprado/hecho) o destacha entradas. */
export function checkEntries(entryIds: unknown, done = true): Entry[] {
  const list = ids(entryIds);
  const upd = db.prepare(`UPDATE list_entries SET done_at = ${done ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : 'NULL'} WHERE id = ?`);
  const out: Entry[] = [];
  for (const id of list) {
    if (!upd.run(id).changes) throw new InputError(`no existe la entrada ${id}`);
    out.push(db.prepare(`SELECT ${ENTRY_COLS} FROM list_entries WHERE id = ?`).get(id) as Entry);
  }
  publish('items');
  return out;
}

export function updateEntry(input: Record<string, unknown>): Entry {
  const id = ids(input.id)[0];
  const cur = db.prepare(`SELECT ${ENTRY_COLS} FROM list_entries WHERE id = ?`).get(id) as Entry | undefined;
  if (!cur) throw new InputError(`no existe la entrada ${id}`);
  const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim().slice(0, 300) : cur.text;
  const category = 'category' in input ? checkCategory(input.category) : cur.category;
  db.prepare('UPDATE list_entries SET text = ?, category = ? WHERE id = ?').run(text, category, id);
  publish('items');
  return { ...cur, text, category };
}

export function removeEntries(entryIds: unknown): number {
  let n = 0;
  for (const id of ids(entryIds)) n += Number(db.prepare('DELETE FROM list_entries WHERE id = ?').run(id).changes);
  publish('items');
  return n;
}

/** Borra las entradas ya tachadas de una lista, o la lista entera. */
export function clearList(name: unknown, whole = false): { list: string; removed: number } {
  const l = mustList(name);
  const removed = whole
    ? Number(db.prepare('SELECT COUNT(*) AS n FROM list_entries WHERE list_id = ?').get(l.id)!.n)
    : Number(db.prepare('DELETE FROM list_entries WHERE list_id = ? AND done_at IS NOT NULL').run(l.id).changes);
  if (whole) db.prepare('DELETE FROM lists WHERE id = ?').run(l.id);
  publish('items');
  return { list: l.name, removed };
}
