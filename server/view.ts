// Lo que enseña el panel de abajo. En reposo, "Próximo"; cuando Claudio quiere enseñar algo
// (herramienta `show`), una vista filtrada: una lista, una categoría, solo rutinas…
// La pantalla guarda la especificación y vuelve a pedir la vista cuando cambia algo.
import { InputError, listItems, upcoming, type Item } from './items.ts';
import { allLists, entries, findList } from './lists.ts';
import { listRoutines, type RoutineStatus } from './routines.ts';

export type ViewSpec = {
  title?: string;
  list?: string;                // una lista concreta ("Compra")
  lists?: boolean;              // todas las listas
  category?: string;            // solo esta categoría
  kinds?: ('events' | 'tasks' | 'routines')[];
  days?: number;                // solo lo de los próximos N días
};
export type Row = {
  key: string;
  kind: 'event' | 'task' | 'routine' | 'entry';
  id: number;
  title: string;
  at: string | null;
  end_at?: string | null;
  category: string | null;
  detail?: string;
  done?: boolean;
};
export type View = { spec: ViewSpec; title: string; groups: { title: string; rows: Row[] }[] };

const ROUTINE_HORIZON_DAYS = 14; // en "Próximo" salen las rutinas que tocan en las próximas 2 semanas

const itemRow = (it: Item): Row => ({
  key: `i${it.id}`, kind: it.kind, id: it.id, title: it.title, at: it.at, end_at: it.end_at, category: it.category,
});
const routineRow = (r: RoutineStatus): Row => ({
  key: `r${r.id}`, kind: 'routine', id: r.id, title: r.title, at: r.due_at, category: r.category, detail: r.detail,
});
const byDate = (a: Row, b: Row) => (a.at ?? '9999').localeCompare(b.at ?? '9999');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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
  if (typeof o.category === 'string' && o.category.trim()) spec.category = o.category.trim().toLowerCase();
  if (Array.isArray(o.kinds)) {
    const k = o.kinds.filter((x): x is 'events' | 'tasks' | 'routines' => x === 'events' || x === 'tasks' || x === 'routines');
    if (k.length) spec.kinds = k;
  }
  if (typeof o.days === 'number' && o.days > 0) spec.days = Math.min(366, Math.round(o.days));
  if (spec.list && !findList(spec.list)) throw new InputError(`no existe la lista "${spec.list}"`);
  return spec;
}

export function buildView(spec: ViewSpec = {}): View {
  // Una lista: entradas agrupadas por categoría (las tachadas en las últimas 24 h, al final)
  if (spec.list) {
    const l = findList(spec.list)!;
    const groups = new Map<string, Row[]>();
    for (const e of entries(l.id, true)) {
      const g = e.category ? cap(e.category) : 'Otros';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ key: `e${e.id}`, kind: 'entry', id: e.id, title: e.text, at: null, category: e.category, done: !!e.done_at });
    }
    return { spec, title: spec.title ?? l.name, groups: [...groups].map(([title, rows]) => ({ title, rows })) };
  }
  if (spec.lists) {
    return {
      spec, title: spec.title ?? 'Listas',
      groups: allLists().filter((l) => !spec.category || l.category === spec.category).map((l) => ({
        title: l.name,
        rows: entries(l.id).map((e) => ({ key: `e${e.id}`, kind: 'entry' as const, id: e.id, title: e.text, at: null, category: e.category })),
      })),
    };
  }

  const kinds = spec.kinds ?? ['events', 'tasks', 'routines'];
  const until = spec.days ? addDays(today(), spec.days) : null;
  const inRange = (r: Row) => !until || (r.at !== null && r.at.slice(0, 10) <= until) || (r.kind === 'task' && !r.at);

  // Vista por defecto ("Próximo") o filtrada: eventos/tareas pendientes + rutinas
  const items = (spec.category ? listItems({ category: spec.category }) : upcoming(60))
    .filter((it) => (it.kind === 'event' ? kinds.includes('events') : kinds.includes('tasks')))
    .filter((it) => it.kind === 'task' || !it.at || it.at >= today() || (it.end_at ?? '') >= today());
  const horizon = addDays(today(), spec.days ?? ROUTINE_HORIZON_DAYS);
  const filtered = !!(spec.category || spec.kinds || spec.days);
  const routines = kinds.includes('routines')
    ? listRoutines(spec.category).filter((r) => (filtered && !spec.days) || (r.due_at !== null && r.due_at <= horizon))
    : [];
  const rows = [...items.map(itemRow), ...routines.map(routineRow)].filter(inRange).sort(byDate);

  if (!filtered) return { spec, title: spec.title ?? 'Próximo', groups: [{ title: '', rows }] };

  // Filtrada: por tipo si es una categoría; por categoría si no
  const groups = new Map<string, Row[]>();
  const label = (r: Row) => spec.category
    ? ({ event: 'Citas', task: 'Tareas', routine: 'Rutinas', entry: 'Listas' } as const)[r.kind]
    : r.category ? cap(r.category) : 'Sin categoría';
  for (const r of rows) {
    const g = label(r);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  if (spec.category) {
    // Listas de esa categoría, también
    for (const l of allLists().filter((x) => x.category === spec.category)) {
      groups.set(l.name, entries(l.id).map((e) => ({ key: `e${e.id}`, kind: 'entry' as const, id: e.id, title: e.text, at: null, category: e.category })));
    }
  }
  const title = spec.title ?? (spec.category ? cap(spec.category) : 'Próximo');
  return { spec, title, groups: [...groups].map(([t, r]) => ({ title: t, rows: r })) };
}
