// Lo que enseña el panel de abajo. En reposo, "Próximo"; cuando Claudio quiere enseñar algo
// (herramienta `show`), una vista filtrada: una lista, una categoría (con sus subcategorías),
// lo de una persona, lo de los próximos días, por prioridad…
// La pantalla guarda la especificación y vuelve a pedir la vista cuando cambia algo.
import { checkCategory, checkPriority, InputError, isPastEvent, listItems, pastCutoff, upcoming, type Item } from './items.ts';
import { allLists, entries, findList } from './lists.ts';
import { listRoutines, type RoutineStatus } from './routines.ts';
import { isWho, PEOPLE, type Who } from './config.ts';

export type ViewSpec = {
  title?: string;
  list?: string;                // una lista concreta ("Compra")
  lists?: boolean;              // todas las listas
  category?: string;            // solo esta categoría y sus subcategorías
  kinds?: ('events' | 'tasks' | 'routines')[];
  days?: number;                // solo lo de los próximos N días (más lo vencido)
  who?: Who;                    // lo de esta persona + lo compartido
  min_priority?: number;        // solo desde esta prioridad
  sort?: 'priority';            // agrupar por prioridad en vez de por fecha
};
export type Row = {
  key: string;
  kind: 'event' | 'task' | 'routine' | 'entry';
  id: number;
  title: string;
  at: string | null;
  end_at?: string | null;
  category: string | null;
  owner?: Who | null;
  priority?: number;
  start_at?: string | null;
  detail?: string;
  done?: boolean;
  past?: boolean;               // evento que ya pasó sin marcar
  progress?: number | null;     // rutina: parte del ciclo transcurrida (1 = toca)
  cycle?: string | null;        // rutina: "día 3 de 5"
};
export type View = { spec: ViewSpec; title: string; groups: { title: string; rows: Row[] }[] };

const ROUTINE_HORIZON_DAYS = 14; // en "Próximo" salen las rutinas que tocan en las próximas 2 semanas
export const PRIORITY_LABEL = ['Algún día', 'Normal', 'Importante', 'Crítico'];

const itemRow = (it: Item): Row => ({
  key: `i${it.id}`, kind: it.kind, id: it.id, title: it.title, at: it.at, end_at: it.end_at,
  category: it.category, owner: it.owner, priority: it.priority, start_at: it.start_at,
  ...(isPastEvent(it) ? { past: true } : {}),
});
const routineRow = (r: RoutineStatus): Row => ({
  key: `r${r.id}`, kind: 'routine', id: r.id, title: r.title, at: r.due_at, category: r.category,
  owner: r.owner, priority: r.priority, detail: r.detail, progress: r.progress, cycle: r.cycle,
});
const entryRow = (e: { id: number; text: string; category: string | null; done_at?: string | null }): Row => ({
  key: `e${e.id}`, kind: 'entry', id: e.id, title: e.text, at: null, category: e.category, done: !!e.done_at,
});
const byDate = (a: Row, b: Row) => (a.at ?? '9999').localeCompare(b.at ?? '9999');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "casa/gatos" → "Casa › Gatos" */
export const catLabel = (c: string) => c.split('/').map(cap).join(' › ');

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export function checkSpec(v: unknown): ViewSpec {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const spec: ViewSpec = {};
  if (typeof o.title === 'string' && o.title.trim()) spec.title = o.title.trim().slice(0, 60);
  if (typeof o.list === 'string' && o.list.trim()) spec.list = o.list.trim();
  if (o.lists === true) spec.lists = true;
  if (typeof o.category === 'string' && o.category.trim()) spec.category = checkCategory(o.category) ?? undefined;
  if (Array.isArray(o.kinds)) {
    const k = o.kinds.filter((x): x is 'events' | 'tasks' | 'routines' => x === 'events' || x === 'tasks' || x === 'routines');
    if (k.length) spec.kinds = k;
  }
  if (typeof o.days === 'number' && o.days > 0) spec.days = Math.min(366, Math.round(o.days));
  if (isWho(o.who)) spec.who = o.who;
  if (o.min_priority !== undefined && o.min_priority !== null) spec.min_priority = checkPriority(o.min_priority);
  if (o.sort === 'priority') spec.sort = 'priority';
  if (spec.list && !findList(spec.list)) throw new InputError(`no existe la lista "${spec.list}"`);
  return spec;
}

export function buildView(spec: ViewSpec = {}): View {
  // Una lista: entradas agrupadas por categoría (las tachadas en las últimas 24 h, al final)
  if (spec.list) {
    const l = findList(spec.list)!;
    const groups = new Map<string, Row[]>();
    for (const e of entries(l.id, true)) {
      const g = e.category ? catLabel(e.category) : 'Otros';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(entryRow(e));
    }
    return { spec, title: spec.title ?? l.name, groups: [...groups].map(([title, rows]) => ({ title, rows })) };
  }
  if (spec.lists) {
    return {
      spec, title: spec.title ?? 'Listas',
      groups: allLists()
        .filter((l) => !spec.who || !l.owner || l.owner === spec.who)
        .filter((l) => !spec.category || l.category === spec.category || l.category?.startsWith(`${spec.category}/`))
        .map((l) => ({ title: l.name, rows: entries(l.id).map(entryRow) })),
    };
  }

  const kinds = spec.kinds ?? ['events', 'tasks', 'routines'];
  const until = spec.days ? addDays(today(), spec.days - 1) : null; // days: 1 = hoy
  // Una tarea con margen entra en "los próximos N días" en cuanto toca empezarla
  const inRange = (r: Row) => !until || (r.at !== null && r.at.slice(0, 10) <= until)
    || (r.kind === 'task' && (!r.at || (r.start_at != null && r.start_at <= until)));
  const forWho = (r: Row) => !spec.who || !r.owner || r.owner === spec.who;
  const prioOk = (r: Row) => spec.min_priority === undefined || (r.priority ?? 1) >= spec.min_priority;

  const filteredEarly = !!(spec.category || spec.kinds || spec.days || spec.who || spec.min_priority !== undefined || spec.sort);
  // "Próximo" no enseña lo que aún no toca empezar; una vista pedida sí (salvo "hoy/N días")
  const items = (spec.category ? listItems({ category: spec.category }) : upcoming(80, filteredEarly && !spec.days))
    .filter((it) => (it.kind === 'event' ? kinds.includes('events') : kinds.includes('tasks')))
    .filter((it) => it.kind === 'task' || !it.at || (it.end_at ?? it.at) >= pastCutoff());
  const filtered = !!(spec.category || spec.kinds || spec.days || spec.who || spec.min_priority !== undefined || spec.sort);
  const horizon = addDays(today(), spec.days ?? ROUTINE_HORIZON_DAYS);
  const routines = kinds.includes('routines')
    ? listRoutines(spec.category).filter((r) => (filtered && !spec.days) || (r.due_at !== null && r.due_at <= horizon))
    : [];
  const rows = [...items.map(itemRow), ...routines.map(routineRow)].filter(inRange).filter(forWho).filter(prioOk).sort(byDate);

  const who = spec.who ? PEOPLE[spec.who].name : '';
  if (!filtered) return { spec, title: spec.title ?? 'Próximo', groups: [{ title: '', rows }] };

  // Agrupar: por prioridad si se pide; dentro de una categoría, por subcategoría; si no, por categoría.
  const label = (r: Row): string => {
    if (spec.sort === 'priority') return PRIORITY_LABEL[r.priority ?? 1];
    if (spec.category) {
      const rest = r.category && r.category !== spec.category ? r.category.slice(spec.category.length + 1) : '';
      return rest ? catLabel(rest) : 'General';
    }
    return r.category ? catLabel(r.category) : 'Sin categoría';
  };
  const groups = new Map<string, Row[]>();
  const ordered = spec.sort === 'priority' ? [...rows].sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1) || byDate(a, b)) : rows;
  for (const r of ordered) {
    const g = label(r);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  if (spec.category && !spec.sort) {
    // Las listas de esa categoría, también
    for (const l of allLists().filter((x) => x.category === spec.category || x.category?.startsWith(`${spec.category}/`))) {
      if (spec.who && l.owner && l.owner !== spec.who) continue;
      groups.set(l.name, entries(l.id).map(entryRow));
    }
  }
  const title = spec.title ?? [spec.category ? catLabel(spec.category) : 'Próximo', who].filter(Boolean).join(' · ');
  return { spec, title, groups: [...groups].map(([t, r]) => ({ title: t, rows: r })) };
}
