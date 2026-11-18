// Chat con Claude Haiku y herramientas sobre eventos y tareas.
// Bucle manual: cada turno guarda solo el texto del usuario y la respuesta final.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { db } from './db.ts';
import { ANTHROPIC_KEY_FILE, localNow } from './config.ts';
import { publish } from './bus.ts';
import { completeItem, createItem, deleteItem, InputError, listItems, updateItem } from './items.ts';

const MODEL = 'claude-haiku-5-5';
const HISTORY = 20;         // mensajes de contexto (10 idas y vueltas)
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

const SYSTEM = `Eres Claudio, un pequeño asistente que vive en un iPhone sobre la mesa de Javier, con unos ojos en pixel art.
Llevas su agenda: eventos (con fecha y hora) y tareas (con o sin fecha límite). Las guardas tú con las herramientas; lo que guardas aparece en la lista "Próximo" bajo tus ojos.

Cómo respondes:
- En el idioma en que te hablen (español o inglés).
- Muy breve: una o dos frases. Se leen en una pantalla pequeña y más adelante se dirán en voz alta. Sin markdown, sin listas largas.
- Cálido y con algo de gracia, sin pasarte.

Cómo usas las herramientas:
- Fechas siempre en hora local de Madrid: "YYYY-MM-DD" para todo el día o "YYYY-MM-DDTHH:MM". Calcula "mañana", "el jueves", etc. a partir de la fecha actual que se te da.
- Para cambiar, completar o borrar algo, primero mira la lista para saber su id. No inventes ids.
- Si falta un dato imprescindible (p. ej. la hora de una cita), pregúntalo; si no lo es, apúntalo sin fecha y dilo.
- Tras hacer cambios, confírmalos en una frase.
- No digas que has hecho algo si la herramienta ha dado error.`;

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
      },
      required: ['kind', 'title'],
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
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_item',
    description: 'Marca una tarea como hecha (o como pendiente otra vez con done = false).',
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
];

function runTool(name: string, input: unknown): string {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  switch (name) {
    case 'list_items':
      return JSON.stringify(listItems({ includeDone: args.include_done === true, from: str(args.from), to: str(args.to) }));
    case 'create_item': return JSON.stringify(createItem(args));
    case 'update_item': return JSON.stringify(updateItem(args));
    case 'complete_item': return JSON.stringify(completeItem(args.id, args.done !== false));
    case 'delete_item': return JSON.stringify({ deleted: deleteItem(args.id) });
    default: throw new InputError(`herramienta desconocida: ${name}`);
  }
}

type ChatRow = { id: number; role: 'user' | 'assistant'; text: string; created_at: string };

export function recentMessages(limit = HISTORY): ChatRow[] {
  const rows = db.prepare('SELECT id, role, text, created_at FROM chat_messages ORDER BY id DESC LIMIT ?').all(limit) as ChatRow[];
  return rows.reverse();
}
function save(role: 'user' | 'assistant', text: string): ChatRow {
  const r = db.prepare('INSERT INTO chat_messages (role, text) VALUES (?, ?)').run(role, text);
  const row = db.prepare('SELECT id, role, text, created_at FROM chat_messages WHERE id = ?').get(Number(r.lastInsertRowid)) as ChatRow;
  publish('chat', row);
  return row;
}

// Un turno cada vez: la conversación es única y compartida entre pantallas.
let queue: Promise<unknown> = Promise.resolve();
export function chat(text: string): Promise<{ reply: string; changed: boolean }> {
  const run = queue.then(() => turn(text));
  queue = run.catch(() => {});
  return run;
}

async function turn(text: string): Promise<{ reply: string; changed: boolean }> {
  const c = getClient();
  if (!c) throw new Error(`Falta la clave de Anthropic (${ANTHROPIC_KEY_FILE})`);

  // Historial: solo texto; debe empezar por un mensaje del usuario.
  const history = recentMessages();
  while (history.length && history[0].role !== 'user') history.shift();
  save('user', text);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: text },
  ];

  const now = localNow();
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Ahora: ${now.weekday} ${now.stamp} (Europe/Madrid).` },
  ];

  let changed = false;
  let reply = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
    });

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
        results.push({ type: 'tool_result', tool_use_id: block.id, content: runTool(block.name, block.input) });
        if (block.name !== 'list_items') changed = true;
      } catch (e) {
        if (!(e instanceof InputError)) throw e;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
    if (step === MAX_STEPS - 1) reply = textOut || 'Me he quedado a medias; mira la lista por si acaso.';
  }

  save('assistant', reply);
  return { reply, changed };
}
