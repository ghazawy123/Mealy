// Mealy – pure logic (no DOM). Tested in tests/logic.test.mjs

export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const STORES = {
  aldi: 'Aldi Süd',
  edeka: 'Edeka',
  arab: 'Arab / Turkish market',
};
export const STORE_ORDER = ['aldi', 'edeka', 'arab'];
export const AISLES = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Bakery', 'Dry goods', 'Canned & jars', 'Frozen', 'Spices', 'Oils & condiments', 'Other'];
const EPS = 1e-6;

// ---------- dates (local, ISO yyyy-mm-dd) ----------
const pad = (n) => String(n).padStart(2, '0');
export const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const todayISO = (now = new Date()) => fmtISO(now);
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return fmtISO(d); }
export function weekStart(s) { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmtISO(d); }
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export function isoWeek(s) {
  const d = parseISO(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWF = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dowFull = (s) => DOWF[parseISO(s).getDay()];
export const monFull = (s) => MONF[parseISO(s).getMonth()];
export const dowName = (s) => DOW[parseISO(s).getDay()];
export const dayNum = (s) => parseISO(s).getDate();
export const monName = (s) => MON[parseISO(s).getMonth()];
export const prettyDate = (s) => `${dowName(s)} ${dayNum(s)} ${monName(s)}`;
export function prettyRange(from, weeks = 1) {
  const a = from, b = addDays(from, weeks * 7 - 1);
  return monName(a) === monName(b) ? `${dayNum(a)} – ${dayNum(b)} ${monFull(b)}` : `${dayNum(a)} ${monName(a)} – ${dayNum(b)} ${monName(b)}`;
}

// ---------- entries (id -> {..., u, d}) ----------
export const live = (map) => Object.values(map || {}).filter((e) => e && !e.d);
export const newId = () => Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-4);

// ---------- recipe / catalog normalisation ----------
export function normalizeRecipe(r) {
  const ingredients = (r.ingredients || r.ing || []).map((x) =>
    Array.isArray(x) ? { item: x[0], qty: x[1], disp: x[2] || '', note: x[3] || '', section: x[4] || '' } : { item: x.item, qty: x.qty, disp: x.disp || '', note: x.note || '', section: x.section || '' });
  const steps = (r.steps || []).map((s) => (typeof s === 'string' ? { text: s } : s));
  return { ...r, ingredients, steps, ing: undefined, servings: r.servings || 4, tags: r.tags || [], slots: r.slots || [] };
}
export function normalizeCatalog(raw) {
  const out = {};
  for (const [id, c] of Object.entries(raw || {})) {
    if (id.startsWith('_') || !c || c.d) continue;
    out[id] = { id, unit: 'pcs', pack: 1, price: 0, store: 'aldi', aisle: 'Other', ...c };
  }
  return out;
}

// ---------- formatting ----------
const trim1 = (n) => String(Math.round(n * 10) / 10);
export function fmtQty(q, item) {
  const u = item?.unit || 'pcs';
  if (u === 'g') return q >= 1000 ? `${trim1(q / 1000)} kg` : `${q < 10 ? trim1(q) : Math.round(q)} g`;
  if (u === 'ml') return q >= 1000 ? `${trim1(q / 1000)} l` : `${q < 10 ? trim1(q) : Math.round(q)} ml`;
  let lab = item?.label || 'pcs';
  if (Math.abs(q - 1) < 1e-9) lab = lab.replace(/ies$/, 'y').replace(/(ch|sh|x)es$/, '$1').replace(/s$/, '');
  return `${trim1(q)} ${lab}`;
}
export const fmtEuro = (n) => `€${n.toFixed(2).replace('.', ',')}`;

// ---------- merge (last-writer-wins per entry) ----------
export function mergeSections(a, b) {
  const out = {};
  for (const sec of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = (a || {})[sec] || {}, y = (b || {})[sec] || {};
    const m = {};
    for (const id of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const ex = x[id], ey = y[id];
      m[id] = !ex ? ey : !ey ? ex : (ex.u || 0) > (ey.u || 0) ? ex : ey; // tie -> remote
    }
    out[sec] = m;
  }
  return out;
}
export function purgeTombstones(sections, now = Date.now(), maxAge = 90 * 864e5) {
  for (const sec of Object.values(sections)) for (const [id, e] of Object.entries(sec)) if (e && e.d && now - (e.u || 0) > maxAge) delete sec[id];
  return sections;
}
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const sameSections = (a, b) => stable(a || {}) === stable(b || {});
export const hasEntries = (sections) => Object.values(sections || {}).some((m) => Object.keys(m || {}).length > 0);

// ---------- shopping list with pantry ledger ----------
// Ledger: purchases = {id,itemId,qty,date,list,kind:'buy'|'zero'}. `list` = week-start of the list it was bought for.
// Stock before a list starts = simulate all earlier purchases (not tagged for this list) minus planned usage.
export function buildList({ plan, purchases, marks, recipes, catalog, from, weeks = 1, today }) {
  const to = addDays(from, weeks * 7 - 1);
  const effFrom = from > today ? from : today;
  const entries = live(plan).filter((e) => !e.skip);
  const buys = live(purchases);
  const markMap = {};
  for (const m of live(marks)) if (m.list === from) markMap[m.itemId] = m;

  const usage = new Map();
  for (const e of entries) {
    const r = recipes[e.recipeId];
    if (!r) continue;
    const f = (e.servings || r.servings) / r.servings;
    for (const ing of r.ingredients) {
      if (!usage.has(ing.item)) usage.set(ing.item, []);
      usage.get(ing.item).push({ date: e.date, qty: ing.qty * f, recipeId: e.recipeId, title: r.title });
    }
  }
  const ids = new Set();
  for (const [id, list] of usage) if (list.some((u) => u.date >= from && u.date <= to)) ids.add(id);
  for (const b of buys) if (b.list === from && b.kind !== 'zero') ids.add(b.itemId);

  const rows = [];
  for (const id of ids) {
    const item = catalog[id];
    if (!item) continue;
    const uses = (usage.get(id) || []).filter((u) => u.date >= from && u.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
    const needFuture = uses.filter((u) => u.date >= effFrom).reduce((s, u) => s + u.qty, 0);
    const usagePast = uses.filter((u) => u.date < effFrom).reduce((s, u) => s + u.qty, 0);

    // stock on hand when the list starts
    const ev = [];
    for (const b of buys) if (b.itemId === id && b.list !== from && b.date < from) ev.push({ date: b.date, k: b.kind === 'zero' ? 'zero' : 'buy', qty: b.qty, o: 0 });
    for (const u of usage.get(id) || []) if (u.date < from) ev.push({ date: u.date, k: 'use', qty: u.qty, o: 1 });
    ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.o - b.o));
    let bal = 0;
    for (const x of ev) bal = x.k === 'buy' ? bal + x.qty : x.k === 'zero' ? 0 : Math.max(0, bal - x.qty);
    const zeroNow = buys.some((b) => b.itemId === id && b.kind === 'zero' && b.date >= from && b.date <= today);
    const have = zeroNow ? 0 : Math.max(0, bal - usagePast);

    const toBuy = Math.max(0, needFuture - have);
    const pack = item.pack || 1;
    const packsNeeded = toBuy > EPS ? Math.ceil(toBuy / pack - EPS) : 0;
    const bought = buys.filter((b) => b.itemId === id && b.list === from && b.kind !== 'zero');
    const boughtQty = bought.reduce((s, b) => s + b.qty, 0);
    const packsBought = Math.floor(boughtQty / pack + EPS);
    if (needFuture <= EPS && boughtQty <= EPS) continue;

    const mark = markMap[id];
    const chain = [...new Set([item.store, item.alt, ...STORE_ORDER].filter(Boolean))];
    let store = item.store, movedFrom = null;
    if (mark && mark.state === 'missing' && mark.at) {
      movedFrom = mark.at;
      store = chain[Math.min(chain.indexOf(mark.at) + 1, chain.length - 1)];
    }
    let section = 'buy';
    if (mark && mark.state === 'skip') section = 'skip';
    else if (item.staple) section = 'staple';
    else if (toBuy <= EPS && boughtQty <= EPS) section = 'home';
    const done = packsNeeded > 0 ? packsBought >= packsNeeded : boughtQty > EPS;
    const packsShown = Math.max(packsNeeded, packsBought);
    rows.push({
      id, item, store, movedFrom, aisle: item.aisle || 'Other', section, done,
      need: needFuture, have, toBuy, packsNeeded, packsBought, packsShown, boughtQty,
      price: packsShown * (item.price || 0), uses, left: Math.max(0, have - needFuture),
      markState: mark?.state || null,
    });
  }
  rows.sort((a, b) => (STORE_ORDER.indexOf(a.store) - STORE_ORDER.indexOf(b.store)) || (AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle)) || a.item.name.localeCompare(b.item.name));
  const buyRows = rows.filter((r) => r.section === 'buy');
  return {
    from, to, weeks, rows,
    total: buyRows.reduce((s, r) => s + r.price, 0),
    doneCount: buyRows.filter((r) => r.done).length,
    buyCount: buyRows.length,
  };
}

export function shareText(list, { title = 'Shopping list' } = {}) {
  const lines = [`*${title}*`, prettyRange(list.from, list.weeks)];
  const open = list.rows.filter((r) => r.section === 'buy' && !r.done);
  for (const st of STORE_ORDER) {
    const rs = open.filter((r) => r.store === st);
    if (!rs.length) continue;
    lines.push('', `*${STORES[st]}*`);
    for (const r of rs) { const n = r.packsNeeded - r.packsBought > 0 ? r.packsNeeded - r.packsBought : r.packsNeeded; lines.push(`- ${r.item.name}, ${n} x ${r.item.packLabel || 'pack'}`); }
  }
  const home = list.rows.filter((r) => r.section === 'home');
  if (home.length) lines.push('', 'Maybe still at home: ' + home.map((r) => r.item.name).join(', '));
  if (lines.length === 2) lines.push('', 'Nothing to buy.');
  return lines.join('\n');
}

// ---------- search ----------
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function searchRecipes(recipes, catalog, q, { tag = '', boost = {}, limit = 60 } = {}) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const r of recipes) {
    if (tag === 'mine' ? !r.mine : tag === 'fav' ? !r.fav : tag && !(r.tags.includes(tag) || r.slots.includes(tag) || (tag === 'quick' && r.time <= 30))) continue;
    const title = norm(r.title), aka = norm(`${r.aka || ''} ${r.ar || ''}`), tags = norm(`${r.tags.join(' ')} ${r.slots.join(' ')}`);
    const ings = norm(r.ingredients.map((i) => catalog[i.item]?.name || i.item).join(' '));
    let score = 0, ok = true;
    for (const t of tokens) {
      let s = 0;
      if (title.startsWith(t) || title.includes(' ' + t)) s = 10;
      else if (title.includes(t)) s = 6;
      else if (aka.includes(t)) s = 5;
      else if (tags.includes(t)) s = 3;
      else if (ings.includes(t)) s = 1;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    out.push({ r, score: score + Math.min(5, boost[r.id] || 0) * 0.5 });
  }
  out.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title));
  return out.slice(0, limit).map((x) => x.r);
}

export function recipeText(r, catalog, factor = 1) {
  const L = [`*${r.title}*${r.ar ? ' (' + r.ar + ')' : ''}`, `Serves ${Math.round(r.servings * factor * 10) / 10}${r.time ? ', ' + r.time + ' minutes' : ''}`, '', '*Ingredients*'];
  for (const i of r.ingredients) L.push(`- ${i.disp && factor === 1 ? i.disp + ' ' : ''}${catalog[i.item]?.name || i.item} – ${fmtQty(i.qty * factor, catalog[i.item])}`);
  L.push('', '*Steps*');
  r.steps.forEach((s, n) => L.push(`${n + 1}. ${s.text}`));
  if (r.source?.url) L.push('', r.source.url);
  return L.join('\n');
}
