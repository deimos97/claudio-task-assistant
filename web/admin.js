// Gestión: crear, cambiar y borrar citas, tareas, listas y rutinas a mano, sin pasar por
// Claudio. Usa la misma API que el resto; cada cambio llega en vivo a todas las pantallas.
const $ = (sel, root = document) => root.querySelector(sel);
const PEOPLE = { javier: 'Javier', ana: 'Ana' };
const PRIO = ['Algún día', 'Normal', 'Importante', 'Crítico'];

async function api(method, url, body) {
  const r = await fetch(`api/${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
  return data;
}
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}
function flash(form, text, error = false) {
  const m = $('.msg', form);
  m.textContent = text;
  m.classList.toggle('error', error);
  if (!error) setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 3000);
}
const catLabel = (c) => (c ? c.split('/').map((x) => x[0].toUpperCase() + x.slice(1)).join(' › ') : '');
const fmtWhen = (at) => {
  if (!at) return 'sin fecha';
  const [d, t] = at.split('T');
  const day = new Date(`${d}T12:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return t ? `${day} ${t}` : day;
};
const today = () => new Date().toLocaleDateString('en-CA');
const nowStamp = () => `${today()}T${new Date().toTimeString().slice(0, 5)}`;
const meta = (...parts) => parts.filter(Boolean).join(' · ');

// ---------- pestañas ----------
const TAB_PREF = 'claudio.adminTab';
function showTab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  try { localStorage.setItem(TAB_PREF, name); } catch {}
}
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
try { showTab(localStorage.getItem(TAB_PREF) || 'agenda'); } catch { showTab('agenda'); }

// ---------- agenda ----------
const itemForm = $('#item-form');
let editingItem = null;
const kindOf = () => itemForm.elements.kind.value;
function syncKind() { itemForm.dataset.kind = kindOf(); }
for (const r of itemForm.elements.kind) r.addEventListener('change', syncKind);
syncKind();

function resetItemForm() {
  editingItem = null;
  itemForm.reset();
  syncKind();
  $('#item-form-title').hidden = true;
  $('.cancel', itemForm).hidden = true;
  document.querySelectorAll('.item.editing').forEach((x) => x.classList.remove('editing'));
}
$('.cancel', itemForm).addEventListener('click', resetItemForm);

function editItem(it, row) {
  resetItemForm();
  editingItem = it;
  row.classList.add('editing');
  const f = itemForm.elements;
  f.kind.value = it.kind;
  syncKind();
  f.title.value = it.title;
  const [d, t] = (it.at ?? '').split('T');
  f.date.value = d ?? '';
  f.time.value = t ?? '';
  f.end.value = it.end_at?.split('T')[1] ?? '';
  f.start_at.value = it.start_at ?? '';
  f.category.value = it.category ?? '';
  f.owner.value = it.owner ?? 'both';
  f.priority.value = String(it.priority ?? 1);
  f.notes.value = it.notes ?? '';
  $('#item-form-title').textContent = `Editar: ${it.title}`;
  $('#item-form-title').hidden = false;
  $('#item-form-box').open = true;
  $('.cancel', itemForm).hidden = false;
  $('#item-form-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

itemForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = itemForm.elements;
  const kind = kindOf();
  const at = f.date.value ? (f.time.value ? `${f.date.value}T${f.time.value}` : f.date.value) : '';
  const body = {
    kind, title: f.title.value, at, category: f.category.value, owner: f.owner.value,
    priority: Number(f.priority.value), notes: f.notes.value,
  };
  if (kind === 'event') body.end_at = f.date.value && f.end.value ? `${f.date.value}T${f.end.value}` : '';
  else body.start_at = f.start_at.value;
  try {
    if (editingItem) await api('POST', `items/${editingItem.id}`, body);
    else await api('POST', 'items', body);
    flash(itemForm, editingItem ? 'Cambiado.' : 'Guardado.');
    resetItemForm();
    loadItems();
  } catch (e) { flash(itemForm, e.message, true); }
});

async function loadItems() {
  const box = $('#items');
  try {
    const { items } = await api('GET', `items${$('#show-done').checked ? '?done=1' : ''}`);
    box.innerHTML = '';
    const groups = [['Citas', items.filter((i) => i.kind === 'event')], ['Tareas', items.filter((i) => i.kind === 'task')]];
    for (const [title, list] of groups) {
      box.append(el('h3', {}, `${title} (${list.length})`));
      if (!list.length) box.append(el('p', { class: 'empty' }, 'Nada.'));
      for (const it of list) box.append(itemRow(it));
    }
    collectCats(items.map((i) => i.category));
  } catch (e) { box.textContent = e.message; }
}
function itemRow(it) {
  const past = it.kind === 'event' && !it.done_at && (it.end_at ?? it.at ?? '9') < (it.at?.includes('T') ? nowStamp() : today());
  const overdue = it.kind === 'task' && !it.done_at && it.at && it.at.slice(0, 10) < today();
  const row = el('div', { class: `item${it.done_at ? ' done' : ''}` });
  row.append(
    el('div', { class: 'body' },
      el('div', { class: 't' }, it.priority >= 2 ? `${it.priority === 3 ? '‼' : '!'} ` : '', it.title),
      el('div', { class: 'm' },
        el('span', { class: past || overdue ? 'bad' : '' }, fmtWhen(it.at), past ? ' (pasó, sin marcar)' : overdue ? ' (vencida)' : ''),
        ' · ', meta(it.owner ? PEOPLE[it.owner] : 'Los dos', catLabel(it.category), it.priority !== 1 ? PRIO[it.priority] : '',
          it.start_at ? `avisar desde ${fmtWhen(it.start_at)}` : '', it.notes))),
    el('div', { class: 'btns' },
      el('button', {
        class: 'ok', type: 'button', title: it.done_at ? 'Volver a pendiente' : it.kind === 'event' ? 'Ya la tuve' : 'Hecha',
        onclick: async () => { await api('POST', `items/${it.id}/done`, { done: !it.done_at }); loadItems(); },
      }, it.done_at ? '↺' : '✓'),
      el('button', { type: 'button', title: 'Editar', onclick: () => editItem(it, row) }, '✎'),
      el('button', {
        class: 'del', type: 'button', title: 'Borrar',
        onclick: async () => { if (confirm(`¿Borrar «${it.title}»?`)) { await api('DELETE', `items/${it.id}`); loadItems(); } },
      }, '🗑')),
  );
  return row;
}
$('#show-done').addEventListener('change', loadItems);

// ---------- listas ----------
const listForm = $('#list-form');
listForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = listForm.elements;
  try {
    await api('POST', 'lists/entries', { list: f.list.value, entries: [{ text: f.text.value, category: f.category.value }] });
    flash(listForm, `Añadido a ${f.list.value}.`);
    f.text.value = '';
    f.text.focus();
    loadLists();
  } catch (e) { flash(listForm, e.message, true); }
});
async function loadLists() {
  const box = $('#lists');
  try {
    const { lists } = await api('GET', 'lists');
    box.innerHTML = '';
    $('#list-names').replaceChildren(...lists.map((l) => el('option', { value: l.name })));
    if (!lists.length) box.append(el('p', { class: 'empty' }, 'No hay listas. Añade algo arriba y se crea.'));
    for (const l of lists) {
      const card = el('div', { class: 'card' },
        el('div', { class: 'list-head' },
          el('h2', {}, l.name, l.owner ? ` · ${PEOPLE[l.owner]}` : ''),
          el('button', {
            type: 'button', title: 'Quitar lo tachado',
            onclick: async () => { await api('POST', 'lists/clear', { list: l.name }); loadLists(); },
          }, 'Quitar tachadas'),
          el('button', {
            class: 'del', type: 'button', title: 'Borrar la lista',
            onclick: async () => { if (confirm(`¿Borrar la lista «${l.name}» entera?`)) { await api('POST', 'lists/clear', { list: l.name, whole: true }); loadLists(); } },
          }, '🗑')));
      if (!l.entries.length) card.append(el('p', { class: 'empty' }, 'Vacía.'));
      for (const e of l.entries) {
        card.append(el('div', { class: `entry${e.done_at ? ' done' : ''}` },
          el('label', {},
            el('input', {
              type: 'checkbox', checked: !!e.done_at,
              onchange: async (ev) => { await api('POST', `entries/${e.id}/done`, { done: ev.target.checked }); loadLists(); },
            }),
            el('span', {}, e.text),
            e.category ? el('span', { class: 'sec' }, catLabel(e.category)) : null),
          el('button', {
            class: 'del', type: 'button', 'aria-label': `Borrar ${e.text}`,
            onclick: async () => { await api('DELETE', `entries/${e.id}`); loadLists(); },
          }, '×')));
      }
      box.append(card);
      collectCats([l.category, ...l.entries.map((e) => e.category)]);
    }
  } catch (e) { box.textContent = e.message; }
}

// ---------- rutinas ----------
const routineForm = $('#routine-form');
let editingRoutine = null;
function resetRoutineForm() {
  editingRoutine = null;
  routineForm.reset();
  $('#routine-form-title').hidden = true;
  $('.cancel', routineForm).hidden = true;
  document.querySelectorAll('.item.editing').forEach((x) => x.classList.remove('editing'));
}
$('.cancel', routineForm).addEventListener('click', resetRoutineForm);
function editRoutine(r, row) {
  resetRoutineForm();
  editingRoutine = r;
  row.classList.add('editing');
  const f = routineForm.elements;
  for (const k of ['title', 'every_days', 'every_amount', 'unit', 'asset', 'last_done_at', 'last_done_value', 'category', 'notes']) f[k].value = r[k] ?? '';
  f.owner.value = r.owner ?? 'both';
  f.priority.value = String(r.priority ?? 1);
  $('#routine-form-title').textContent = `Editar: ${r.title}`;
  $('#routine-form-title').hidden = false;
  $('#routine-form-box').open = true;
  $('.cancel', routineForm).hidden = false;
  $('#routine-form-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
routineForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = routineForm.elements;
  const body = {};
  for (const k of ['title', 'every_days', 'every_amount', 'unit', 'asset', 'last_done_at', 'last_done_value', 'category', 'notes', 'owner']) body[k] = f[k].value;
  body.priority = Number(f.priority.value);
  if (!body.asset || !body.unit) { delete body.asset; delete body.unit; }
  try {
    if (editingRoutine) await api('POST', `routines/${editingRoutine.id}`, body);
    else await api('POST', 'routines', body);
    flash(routineForm, editingRoutine ? 'Cambiada.' : 'Guardada.');
    resetRoutineForm();
    loadRoutines();
  } catch (e) { flash(routineForm, e.message, true); }
});
async function loadRoutines() {
  const box = $('#routines');
  try {
    const { routines } = await api('GET', 'routines');
    box.innerHTML = '';
    if (!routines.length) box.append(el('p', { class: 'empty' }, 'No hay rutinas.'));
    for (const r of routines) {
      const due = r.due_at && r.due_at <= today();
      const row = el('div', { class: 'item' });
      row.append(
        el('div', { class: 'body' },
          el('div', { class: 't' }, r.title),
          el('div', { class: 'm' },
            el('span', { class: due ? 'bad' : '' }, r.due_at ? `toca ${fmtWhen(r.due_at)}` : 'sin estimar'),
            ' · ', meta(r.cycle, r.detail, r.owner ? PEOPLE[r.owner] : 'Los dos', catLabel(r.category)))),
        el('div', { class: 'btns' },
          el('button', {
            class: 'ok', type: 'button', title: 'Hecha hoy',
            onclick: async () => { await api('POST', `routines/${r.id}/done`, {}); loadRoutines(); },
          }, '✓ hoy'),
          el('button', {
            type: 'button', title: 'Hecha otro día',
            onclick: async () => {
              const d = prompt('¿Qué día? (AAAA-MM-DD)', today());
              if (!d) return;
              try { await api('POST', `routines/${r.id}/done`, { done_at: d }); loadRoutines(); } catch (e) { alert(e.message); }
            },
          }, '✓ el…'),
          el('button', { type: 'button', title: 'Editar', onclick: () => editRoutine(r, row) }, '✎'),
          el('button', {
            class: 'del', type: 'button', title: 'Borrar',
            onclick: async () => { if (confirm(`¿Borrar la rutina «${r.title}»?`)) { await api('DELETE', `routines/${r.id}`); loadRoutines(); } },
          }, '🗑')));
      box.append(row);
    }
    collectCats(routines.map((r) => r.category));
  } catch (e) { box.textContent = e.message; }
}

// ---------- categorías para autocompletar ----------
const cats = new Set();
function collectCats(list) {
  for (const c of list) if (c) { cats.add(c); const top = c.split('/')[0]; cats.add(top); }
  $('#cats').replaceChildren(...[...cats].sort().map((c) => el('option', { value: c })));
}

// ---------- en vivo ----------
function loadAll() { loadItems(); loadLists(); loadRoutines(); }
loadAll();
const es = new EventSource('api/stream');
let t = null;
es.addEventListener('items', () => { clearTimeout(t); t = setTimeout(loadAll, 300); });
