// Chat con Claude Haiku y herramientas sobre eventos y tareas.
// Bucle manual: cada turno guarda solo el texto del usuario y la respuesta final.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { db } from './db.ts';
import { ANTHROPIC_KEY_FILE, localNow, PEOPLE, type Who } from './config.ts';
import { publish } from './bus.ts';
import { completeItem, createItem, deleteItem, InputError, isPastEvent, listItems, updateItem, upcoming } from './items.ts';
import { nudges, seeNudge } from './nudges.ts';
import { addToList, allLists, checkEntries, clearList, entries, removeEntries, updateEntry } from './lists.ts';
import { assetsSummary, createRoutine, deleteRoutine, doneRoutine, listRoutines, logReading, routineLog, updateRoutine } from './routines.ts';
import { buildView, checkSpec, PRIORITY_LABEL, type ViewSpec } from './view.ts';
import { weather, weatherText } from './weather.ts';

const MODEL = 'claude-haiku-5-5';
// Precios de Haiku 5.5 en USD por millón de tokens (prompts < 100K). Caché: lectura 0,1×, escritura 1,25×.
const PRICE = { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 };
const HISTORY = 20;         // mensajes de contexto (10 idas y vueltas)…
const HISTORY_HOURS = 3;    // …de las últimas 3 horas: lo de ayer ya no es conversación; la agenda va aparte
const MAX_STEPS = 8;        // llamadas al modelo por turno, como mucho

function apiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (existsSync(ANTHROPIC_KEY_FILE)) return readFileSync(ANTHROPIC_KEY_FILE, 'utf8').trim() || undefined;
  return undefined;
}
let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!client) {
    const key = apiKey();
    if (key) client = new Anthropic({ apiKey: key });
  }
  return client;
}
export const chatConfigured = () => apiKey() !== undefined;

const SYSTEM = `Eres Claudio, un pequeño asistente que vive en un iPhone sobre la mesa de casa de Javier y Ana (pareja), con unos ojos en pixel art. Os habla a los dos; Javier es el que más lo usa.
Llevas su agenda (eventos y tareas), sus listas (la compra, ideas, notas…) y sus rutinas de mantenimiento (cosas que se repiten: "cambiar la arena de los gatos cada 5 días", "revisión del coche cada año o 15.000 km"). Lo guardas tú con las herramientas y se ve en el panel bajo tus ojos.

Cómo respondes:
- En el idioma en que te hablen (español o inglés).
- Muy breve: una o dos frases. Se leen en una pantalla pequeña y a menudo se dicen en voz alta. Sin markdown, sin listas largas.
- Cálido y con algo de gracia, sin pasarte.

Cómo usas las herramientas:
- Fechas siempre en hora local de Madrid: "YYYY-MM-DD" para todo el día o "YYYY-MM-DDTHH:MM". Calcula "mañana", "el jueves", etc. a partir de la fecha actual que se te da.
- Al final de estas instrucciones tienes la agenda pendiente tal como está ahora, con ids. También el tiempo. Contesta con ello y úsalo para cambiar, completar o borrar cosas. Usa list_items solo para lo ya hecho o para buscar fuera de esa lista. No inventes ids.
- Evento = algo con día y hora concretos (citas, quedadas): si te dan hora, es un evento aunque suene a tarea ("el dentista el jueves a las 17:00"). Tarea = algo por hacer, con o sin fecha límite.
- Si falta un dato imprescindible (p. ej. la hora de una cita), pregúntalo; si no lo es, apúntalo sin fecha y dilo.
- Categorías: pon siempre category, en minúsculas y como ruta de hasta 3 niveles: "casa/gatos", "casa/limpieza", "yo/salud", "yo/economía", "coche"… Pedir "casa" incluye todas sus subcategorías. Reutiliza las que ya existen si encajan. Si la eliges tú (no te la han dicho), dilo siempre en la respuesta, de pasada ("lo pongo en gatos"). Si algo de la agenda no tiene categoría y lo tocas, pónsela.
- Dueño (owner): "javier", "ana" o "both". Lo de la casa y lo común es "both". Lo personal (su médico, sus pagos, su trabajo) es de quien te habla, salvo que digan que es para el otro ("recuérdale a Ana…" → ana). "Recuérdame…" o "tengo que…" en primera persona → de quien habla, salvo que sea claramente de la casa (limpieza, compra, gatos). Si no sabes quién te habla y es personal, o dudas de si es de uno o de los dos, pregunta.
- Cuando alguien pregunta por "lo mío"/"qué tengo", es lo suyo más lo compartido (show con who). No le cuentes a uno lo personal del otro salvo que lo pida.
- Prioridad (priority, tareas y rutinas): 0 algún día (se puede posponer sin problema) · 1 normal (por defecto) · 2 importante · 3 crítico (si no se hace hay un problema serio: correa de distribución, frenos, pagos o citas críticas o difíciles de conseguir). Ponla tú con criterio; no la digas salvo que sea 2 o 3.
- Plazos con antelación: si algo tiene que ocurrir antes de X pero hay que gestionarlo con margen (pedir una cita, un trámite, un regalo), la tarea es la gestión ("Pedir cita…"): at = último día para hacerla (X menos la antelación; si no la dicen, 2 semanas para citas), start_at = desde cuándo avisar (unas 2 semanas antes de at) y notes con el límite real y el porqué ("el seguro acaba el 1 de diciembre"). Si at ya ha pasado o está a pocos días, dilo y sube la prioridad a 2 (o 3 si perderlo es grave). Antes de start_at la tarea espera sin salir en pantalla. Cuando digan que ya tienen la cita, completa la tarea y crea el evento.
- "¿Qué tengo que hacer hoy sí o sí?" → show con days 1, who, sort "priority" (y min_priority 2 si piden solo lo imprescindible), y comenta lo más importante primero.
- Listas: "apunta leche" o "añade a la compra" → list_add en la lista "Compra", con categoría de sección del súper en cada cosa ("fruta y verdura", "lácteos", "carne y pescado", "panadería", "despensa", "bebidas", "congelados", "limpieza", "higiene", "mascotas"). Lo comprado se tacha con list_check. Para ideas o notas sueltas, listas "Ideas" o "Notas" (o la que pida).
- Rutinas: si algo se repite cada X tiempo o cada X km/horas, es una rutina (create_routine), no una tarea. Al crearla, si no sabes cuándo se hizo por última vez, pregúntalo; si no lo sabe, se queda como pendiente ya. "Ya he cambiado la arena" → routine_done (fecha de hoy salvo que diga otra). Lecturas de contadores ("el coche tiene 12.300 km") → log_reading.
- Enseñar: si te piden ver algo ("enséñame lo de casa", "¿qué hay en la compra?", "¿qué tengo esta semana?"), o acabas de cambiar una lista o una categoría, usa show para que el panel lo enseñe. Entonces no lo enumeres en tu respuesta: un comentario corto basta ("Aquí tienes lo de casa: 3 cosas, la arena toca mañana").
- Citas que ya pasaron sin marcar (salen como "ya pasó, sin confirmar"): cuando digan que la tuvieron, complete_item; si no fueron, ofrece cambiarla de fecha (update_item).
- Avisos: no hablas por tu cuenta. Lo que quieres preguntar sale en pantalla como aviso y, cuando lo tocan, te llega como "Pregúntame si…" o "Dame el resumen de hoy". Entonces haz tú la pregunta a quien te habla (tú, en segunda persona), corta y natural, y termina con ella, sin explicar qué harás después ("¿Has cambiado ya la arena? ¿Cuándo?", "¿Cuántos km lleva el coche?", "¿Fuiste al fisio ayer?"). Apunta la respuesta cuando llegue (routine_done con la fecha que digan, log_reading, complete_item). Si te preguntan "¿qué querías?", pregunta por los avisos pendientes de la agenda, de uno en uno.
- Resumen de hoy: en dos o tres frases, el tiempo, lo de hoy (citas con hora, tareas que vencen o son importantes, rutinas que tocan) y lo que conviene no olvidar mañana; y show con days 1 y sort "priority". Si te habla alguien, lo suyo y lo compartido.
- Tras hacer cambios, confírmalos en una frase.
- No digas que has hecho algo si la herramienta ha dado error.

Sobre la conversación anterior: de los turnos pasados solo ves el texto; las herramientas que usaste entonces no aparecen, pero sí se ejecutaron. Fíate de la agenda actual. No comentes si has mirado o no la lista ni te disculpes por eso.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'list_items',
    description: 'Lista eventos y tareas guardados, con su id. Por defecto solo los pendientes.',
    input_schema: {
      type: 'object',
      properties: {
        include_done: { type: 'boolean', description: 'Incluir también las tareas ya hechas' },
        from: { type: 'string', description: 'Desde esta fecha ("YYYY-MM-DD" o "YYYY-MM-DDTHH:MM")' },
        to: { type: 'string', description: 'Hasta esta fecha' },
        category: { type: 'string', description: 'Incluye sus subcategorías' },
      },
    },
  },
  {
    name: 'create_item',
    description: 'Crea un evento (algo que pasa en un momento concreto) o una tarea (algo que hay que hacer, con o sin fecha límite).',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['event', 'task'] },
        title: { type: 'string', description: 'Título corto, en el idioma del usuario' },
        at: { type: 'string', description: 'Evento: inicio. Tarea: fecha límite (opcional). "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM"' },
        end_at: { type: 'string', description: 'Solo eventos, opcional: fin' },
        notes: { type: 'string' },
        category: { type: 'string', description: 'Ruta en minúsculas: "casa/gatos", "yo/salud"…' },
        start_at: { type: 'string', description: 'Solo tareas: desde cuándo ponerse ("YYYY-MM-DD"); antes no sale en pantalla. at es el plazo' },
        owner: { type: 'string', enum: ['javier', 'ana', 'both'], description: 'De quién es; "both" = de los dos' },
        priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 algún día · 1 normal · 2 importante · 3 crítico' },
      },
      required: ['kind', 'title', 'category', 'owner'],
    },
  },
  {
    name: 'update_item',
    description: 'Cambia campos de un evento o tarea existente. Solo envía los campos que cambian; at = "" quita la fecha de una tarea.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        kind: { type: 'string', enum: ['event', 'task'] },
        title: { type: 'string' },
        at: { type: 'string' },
        end_at: { type: 'string' },
        notes: { type: 'string' },
        category: { type: 'string' },
        start_at: { type: 'string', description: 'Solo tareas: desde cuándo ponerse ("YYYY-MM-DD"); antes no sale en pantalla. at es el plazo' },
        owner: { type: 'string', enum: ['javier', 'ana', 'both'], description: 'De quién es; "both" = de los dos' },
        priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 algún día · 1 normal · 2 importante · 3 crítico' },
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_item',
    description: 'Marca una tarea como hecha o una cita (evento) como ya tenida; done = false la deja pendiente otra vez.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, done: { type: 'boolean' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_item',
    description: 'Borra un evento o tarea. Úsalo solo si el usuario pide quitarlo o se canceló; si está hecho, usa complete_item.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
    },
  },
  {
    name: 'list_add',
    description: 'Añade cosas a una lista ("Compra", "Ideas", "Notas"…). Si la lista no existe, la crea. No duplica lo que ya está pendiente.',
    input_schema: {
      type: 'object',
      properties: {
        list: { type: 'string', description: 'Nombre de la lista' },
        list_category: { type: 'string', description: 'Solo al crear una lista nueva: su categoría' },
        list_owner: { type: 'string', enum: ['javier', 'ana', 'both'], description: 'Solo al crear una lista nueva: de quién es' },
        entries: {
          type: 'array',
          items: { type: 'object', properties: { text: { type: 'string' }, category: { type: 'string' } }, required: ['text'] },
        },
      },
      required: ['list', 'entries'],
    },
  },
  {
    name: 'list_check',
    description: 'Tacha entradas de una lista (comprado / hecho), o las destacha con done = false.',
    input_schema: {
      type: 'object',
      properties: { entry_ids: { type: 'array', items: { type: 'integer' } }, done: { type: 'boolean' } },
      required: ['entry_ids'],
    },
  },
  {
    name: 'list_edit',
    description: 'Cambia el texto o la categoría de una entrada de lista.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, text: { type: 'string' }, category: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'list_remove',
    description: 'Borra entradas de una lista (si se apuntaron por error o ya no hacen falta).',
    input_schema: {
      type: 'object',
      properties: { entry_ids: { type: 'array', items: { type: 'integer' } } },
      required: ['entry_ids'],
    },
  },
  {
    name: 'list_clear',
    description: 'Quita de una lista lo ya tachado; con whole = true borra la lista entera (solo si lo piden).',
    input_schema: {
      type: 'object',
      properties: { list: { type: 'string' }, whole: { type: 'boolean' } },
      required: ['list'],
    },
  },
  {
    name: 'create_routine',
    description: 'Crea una rutina que se repite: cada N días (every_days), cada N unidades de un contador (every_amount + asset + unit, p. ej. cada 15000 km del coche) o lo primero que llegue (ambos).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string' },
        every_days: { type: 'integer', description: 'Cada cuántos días (1 año = 365)' },
        every_amount: { type: 'number', description: 'Cada cuántas unidades del contador' },
        asset: { type: 'string', description: 'Activo: "coche", "bici"… (obligatorio con every_amount)' },
        unit: { type: 'string', description: 'Unidad del contador: "km", "horas"…' },
        last_done_at: { type: 'string', description: 'Última vez que se hizo, "YYYY-MM-DD"' },
        last_done_value: { type: 'number', description: 'Valor del contador la última vez' },
        notes: { type: 'string' },
        owner: { type: 'string', enum: ['javier', 'ana', 'both'], description: 'De quién es; "both" = de los dos' },
        priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 algún día · 1 normal · 2 importante · 3 crítico' },
      },
      required: ['title', 'category', 'owner'],
    },
  },
  {
    name: 'update_routine',
    description: 'Cambia una rutina. Solo los campos que cambian.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' }, title: { type: 'string' }, category: { type: 'string' },
        every_days: { type: 'integer' }, every_amount: { type: 'number' }, asset: { type: 'string' }, unit: { type: 'string' },
        last_done_at: { type: 'string' }, last_done_value: { type: 'number' }, notes: { type: 'string' },
        owner: { type: 'string', enum: ['javier', 'ana', 'both'], description: 'De quién es; "both" = de los dos' },
        priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 algún día · 1 normal · 2 importante · 3 crítico' },
      },
      required: ['id'],
    },
  },
  {
    name: 'routine_done',
    description: 'Apunta que una rutina se ha hecho (hoy por defecto); la siguiente vez se recalcula sola.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        done_at: { type: 'string', description: '"YYYY-MM-DD" si no fue hoy' },
        value: { type: 'number', description: 'Valor del contador al hacerlo (km…), si lo dice' },
      },
      required: ['id'],
    },
  },
  {
    name: 'routine_history',
    description: 'Las últimas veces que se hizo una rutina.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'delete_routine',
    description: 'Borra una rutina (solo si lo piden).',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'log_reading',
    description: 'Apunta una lectura de un contador: "el coche tiene 12300 km". Sirve para estimar cuándo toca el mantenimiento por uso.',
    input_schema: {
      type: 'object',
      properties: {
        asset: { type: 'string' }, unit: { type: 'string' }, value: { type: 'number' },
        at: { type: 'string', description: '"YYYY-MM-DD" si no es de hoy' },
      },
      required: ['asset', 'unit', 'value'],
    },
  },
  {
    name: 'show',
    description: 'Enseña algo en el panel grande bajo tus ojos (crece y se queda un rato). Sin filtros vuelve a "Próximo".',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto del panel; si no, uno automático' },
        list: { type: 'string', description: 'Enseñar una lista ("Compra")' },
        lists: { type: 'boolean', description: 'Enseñar todas las listas' },
        category: { type: 'string', description: 'Solo esta categoría y sus subcategorías ("casa")' },
        kinds: { type: 'array', items: { type: 'string', enum: ['events', 'tasks', 'routines'] } },
        days: { type: 'integer', description: 'Solo lo de los próximos N días, con lo vencido ("hoy" = 1, "esta semana" = 7)' },
        who: { type: 'string', enum: ['javier', 'ana'], description: 'Lo de esta persona más lo compartido' },
        min_priority: { type: 'integer', enum: [0, 1, 2, 3] },
        sort: { type: 'string', enum: ['priority'], description: 'Agrupar por prioridad (lo crítico arriba)' },
      },
    },
  },
];

const READ_ONLY = new Set(['list_items', 'routine_history', 'show']);

type TurnState = { view: ViewSpec | null };

function runTool(name: string, input: unknown, state: TurnState): string {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  switch (name) {
    case 'list_items':
      return JSON.stringify(listItems({ includeDone: args.include_done === true, from: str(args.from), to: str(args.to), category: str(args.category) }));
    case 'list_add': {
      const r = addToList(args);
      return JSON.stringify({ list: r.list.name, added: r.added.map((e) => ({ id: e.id, text: e.text, category: e.category })) });
    }
    case 'list_check': return JSON.stringify(checkEntries(args.entry_ids, args.done !== false));
    case 'list_edit': return JSON.stringify(updateEntry(args));
    case 'list_remove': return JSON.stringify({ removed: removeEntries(args.entry_ids) });
    case 'list_clear': return JSON.stringify(clearList(args.list, args.whole === true));
    case 'create_routine': return JSON.stringify(createRoutine(args));
    case 'update_routine': return JSON.stringify(updateRoutine(args));
    case 'routine_done': return JSON.stringify(doneRoutine(args));
    case 'routine_history': return JSON.stringify(routineLog(args.id));
    case 'delete_routine': return JSON.stringify({ deleted: deleteRoutine(args.id) });
    case 'log_reading': return JSON.stringify(logReading(args));
    case 'show': {
      const spec = checkSpec(args);
      const v = buildView(spec);
      state.view = spec;
      const n = v.groups.reduce((a, g) => a + g.rows.length, 0);
      return `En pantalla: "${v.title}" (${n} elementos).`;
    }
    case 'create_item': return JSON.stringify(createItem(args));
    case 'update_item': return JSON.stringify(updateItem(args));
    case 'complete_item': return JSON.stringify(completeItem(args.id, args.done !== false));
    case 'delete_item': return JSON.stringify({ deleted: deleteItem(args.id) });
    default: throw new InputError(`herramienta desconocida: ${name}`);
  }
}

function recordUsage(u: Anthropic.Usage): number {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost = (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
    + cacheRead * PRICE.cacheRead + cacheWrite * PRICE.cacheWrite) / 1e6;
  db.prepare('INSERT INTO api_usage (model, input_tokens, output_tokens, cache_read, cache_write, cost_usd) VALUES (?, ?, ?, ?, ?, ?)')
    .run(MODEL, u.input_tokens, u.output_tokens, cacheRead, cacheWrite, cost);
  return cost;
}

/** Gasto acumulado: hoy, este mes y desde siempre (USD). */
export function usageSummary() {
  const q = (where: string) => db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input,
    COALESCE(SUM(output_tokens), 0) AS output, COALESCE(SUM(cost_usd), 0) AS cost FROM api_usage ${where}`).get();
  return {
    today: q("WHERE created_at >= strftime('%Y-%m-%dT00:00:00', 'now')"),
    month: q("WHERE created_at >= strftime('%Y-%m-01T00:00:00', 'now')"),
    total: q(''),
  };
}

type ChatRow = { id: number; role: 'user' | 'assistant'; text: string; who: Who | null; created_at: string };

export function recentMessages(limit = HISTORY, hours?: number): ChatRow[] {
  const since = hours ? new Date(Date.now() - hours * 3600_000).toISOString() : '';
  const rows = db.prepare('SELECT id, role, text, who, created_at FROM chat_messages WHERE created_at >= ? ORDER BY id DESC LIMIT ?')
    .all(since, limit) as ChatRow[];
  return rows.reverse();
}

/** Agenda, rutinas, listas, contadores y tiempo en texto, para dárselo al modelo en cada turno. */
async function agendaText(): Promise<string> {
  const out: string[] = [];
  const now = localNow();
  const cat = (c: string | null) => (c ? ` [${c}]` : '');
  const tags = (x: { owner: Who | null; priority: number }) =>
    ` · ${x.owner ? PEOPLE[x.owner].name : 'los dos'}${x.priority !== 1 ? ` · prioridad ${x.priority} (${PRIORITY_LABEL[x.priority].toLowerCase()})` : ''}`;

  const items = upcoming(80, true);
  out.push(items.length
    ? `Agenda pendiente (id · tipo · cuándo · título [categoría] · de quién · prioridad si no es normal):\n${items.map((it) => {
      const when = it.at ? (it.end_at ? `${it.at} → ${it.end_at}` : it.kind === 'task' ? `límite ${it.at}` : it.at) : 'sin fecha';
      const start = it.start_at ? ` · empezar desde ${it.start_at}${it.start_at > now.date ? ' (aún no sale en pantalla)' : ''}` : '';
      const past = isPastEvent(it) ? ' · ya pasó, sin confirmar' : '';
      return `- #${it.id} ${it.kind === 'event' ? 'evento' : 'tarea'} · ${when} · ${it.title}${cat(it.category)}${tags(it)}${start}${past}${it.notes ? ` (${it.notes})` : ''}`;
    }).join('\n')}`
    : 'Agenda pendiente: vacía.');

  const routines = listRoutines();
  out.push(routines.length
    ? `Rutinas (id · título [categoría] · cada cuánto · toca):\n${routines.map((r) =>
      `- id ${r.id} · ${r.title}${cat(r.category)}${tags(r)} · ${r.detail} · toca ${r.due_at ?? 'sin estimar (faltan lecturas)'}`).join('\n')}`
    : 'Rutinas: ninguna.');

  const lists = allLists();
  out.push(lists.length
    ? `Listas (entradas pendientes con id):\n${lists.map((l) => {
      const es = entries(l.id);
      return `- ${l.name}${cat(l.category)}${l.owner ? ` (de ${PEOPLE[l.owner].name})` : ''}: ${es.length ? es.map((e) => `id ${e.id} ${e.text}${cat(e.category)}`).join('; ') : 'vacía'}`;
    }).join('\n')}`
    : 'Listas: ninguna.');

  const counters = assetsSummary();
  if (counters.length) {
    out.push(`Contadores:\n${counters.map((c) => `- ${c.asset} (${c.unit}): ${c.last ? `${c.last.value} el ${c.last.at}` : 'sin lecturas'}${c.rate ? `, ~${c.rate.toFixed(1)}/día` : ''}`).join('\n')}`);
  }

  const cats = (db.prepare(`SELECT category FROM items WHERE category IS NOT NULL UNION SELECT category FROM routines WHERE category IS NOT NULL
    UNION SELECT category FROM lists WHERE category IS NOT NULL`).all() as { category: string }[]).map((r) => r.category);
  if (cats.length) out.push(`Categorías en uso: ${cats.join(', ')}.`);

  const pending = nudges();
  if (pending.length) out.push(`Avisos pendientes en pantalla (aún sin preguntar):\n${pending.map((n) => `- ${n.label}`).join('\n')}`);

  out.push(weatherText(await weather()));
  return out.join('\n\n');
}
function save(role: 'user' | 'assistant', text: string, who: Who | null = null): ChatRow {
  const r = db.prepare('INSERT INTO chat_messages (role, text, who) VALUES (?, ?, ?)').run(role, text, who);
  const row = db.prepare('SELECT id, role, text, who, created_at FROM chat_messages WHERE id = ?').get(Number(r.lastInsertRowid)) as ChatRow;
  publish('chat', row);
  return row;
}

// Un turno cada vez: la conversación es única y compartida entre pantallas.
let queue: Promise<unknown> = Promise.resolve();
export type ChatResult = { reply: string; changed: boolean; view: ViewSpec | null };
/** `who`: quién habla (por el tono de voz o el dueño del dispositivo); null si no se sabe. */
export function chat(text: string, who: Who | null = null): Promise<ChatResult> {
  const run = queue.then(() => turn(text, who));
  queue = run.catch(() => {});
  return run;
}

async function turn(text: string, who: Who | null): Promise<ChatResult> {
  const c = getClient();
  if (!c) throw new Error(`Falta la clave de Anthropic (${ANTHROPIC_KEY_FILE})`);

  // Historial: solo texto; debe empezar por un mensaje del usuario.
  const history = recentMessages(HISTORY, HISTORY_HOURS);
  while (history.length && history[0].role !== 'user') history.shift();
  save('user', text, who);
  // Pedir el resumen (tocando el aviso o de palabra) lo quita de la pantalla por hoy
  if (/\bresumen\b|\bbriefing\b/i.test(text)) seeNudge('briefing');
  const messages: Anthropic.MessageParam[] = [
    // Cada mensaje de usuario lleva quién lo dijo: la conversación es de los dos
    ...history.map((m) => ({ role: m.role, content: m.role === 'user' && m.who ? `[${PEOPLE[m.who].name}] ${m.text}` : m.text })),
    { role: 'user', content: text },
  ];

  const now = localNow();
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Ahora: ${now.weekday} ${now.stamp} (Europe/Madrid).\nTe habla: ${who ? PEOPLE[who].name : 'no se sabe quién (Javier o Ana)'}.\n\n${await agendaText()}` },
  ];

  let changed = false;
  const state: TurnState = { view: null };
  let reply = '';
  let turnCost = 0;
  const started = Date.now();
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
    });

    turnCost += recordUsage(res.usage);
    if (res.stop_reason === 'refusal') { reply = 'Eso no puedo hacerlo.'; break; }
    const textOut = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use') {
      reply = textOut || (res.stop_reason === 'max_tokens' ? 'Me he liado, ¿me lo repites más corto?' : 'Hecho.');
      break;
    }

    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      try {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: runTool(block.name, block.input, state) });
        if (!READ_ONLY.has(block.name)) changed = true;
      } catch (e) {
        if (!(e instanceof InputError)) throw e;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
    if (step === MAX_STEPS - 1) reply = textOut || 'Me he quedado a medias; mira la lista por si acaso.';
  }

  // La vista se avisa antes que la respuesta: las pantallas la enseñan mientras la leen.
  if (state.view) publish('show', state.view);
  save('assistant', reply);
  console.log(`chat: ${Date.now() - started} ms, $${turnCost.toFixed(5)}`);
  return { reply, changed, view: state.view };
}
