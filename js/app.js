// Mealy – UI. Vanilla JS, no build step.
import * as L from './logic.js';
import { createStore } from './sync.js';
import { icon } from './icons.js';

const BUILD = '202611062301';

// ---------- tiny templating ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
class Raw { constructor(s) { this.s = s; } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
const html = (st, ...vs) => new Raw(st.reduce((o, s, i) => o + s + (i < vs.length ? part(vs[i]) : ''), ''));
const slug = (s) => L.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

// ---------- state ----------
const D = 'data.json', R = 'recipes.json';
const store = createStore({ onChange: () => { if (!document.activeElement?.matches?.('input,textarea,select')) render(); }, onStatus: showStatus });
const lib = { recipes: [], catalog: {} };
const today0 = L.todayISO();
const ui = { tab: 'plan', week: L.weekStart(today0), listFrom: L.weekStart(today0), listFromSet: false, listWeeks: 1, q: '', tag: '', folds: new Set() };
const sec = (f, n) => store.section(f, n);
// Remember where you were across reloads (tab, week, list, filter, scroll). Week resets after half a day away.
const UIK = 'mealy:ui';
let scrolls = {};
try {
  const s0 = JSON.parse(localStorage.getItem(UIK) || '{}');
  if (['plan', 'recipes', 'shop', 'history'].includes(s0.tab)) ui.tab = s0.tab;
  ui.tag = typeof s0.tag === 'string' ? s0.tag : ''; ui.q = typeof s0.q === 'string' ? s0.q : '';
  if (s0.listWeeks >= 1 && s0.listWeeks <= 3) ui.listWeeks = s0.listWeeks;
  scrolls = s0.scrolls || {};
  if (Date.now() - (s0.at || 0) < 12 * 36e5) {
    if (/^\d{4}-\d\d-\d\d$/.test(s0.week || '')) ui.week = s0.week;
    if (/^\d{4}-\d\d-\d\d$/.test(s0.listFrom || '')) { ui.listFrom = s0.listFrom; ui.listFromSet = !!s0.listFromSet; }
  } else scrolls = {};
} catch {}
function saveUI(withScroll = false) {
  if (withScroll === true) scrolls[ui.tab] = Math.round(window.scrollY);
  try { localStorage.setItem(UIK, JSON.stringify({ tab: ui.tab, week: ui.week, listFrom: ui.listFrom, listFromSet: ui.listFromSet, listWeeks: ui.listWeeks, tag: ui.tag, q: ui.q, scrolls, at: Date.now() })); } catch {}
}
let scrollT;
window.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => saveUI(true), 250); }, { passive: true });
window.addEventListener('pagehide', () => saveUI(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveUI(true); });

function lookups() {
  const catalog = { ...lib.catalog, ...L.normalizeCatalog(sec(R, 'catalog')) };
  const recipes = {};
  for (const r of lib.recipes) recipes[r.id] = r;
  for (const r of L.live(sec(R, 'recipes'))) recipes[r.id] = { ...L.normalizeRecipe(r), mine: true };
  return { catalog, recipes };
}
const names = () => { const n = sec(D, 'settings').names; return { a: n?.a || 'Mostafa', b: n?.b || 'Menna' }; };
const whoName = (w) => (w === 'both' ? 'Both' : w === 'a' ? names().a : names().b);
const counts = () => { const c = {}; for (const e of L.live(sec(D, 'plan'))) if (!e.skip) c[e.recipeId] = (c[e.recipeId] || 0) + 1; return c; };
const currentList = (ctx) => L.buildList({ plan: sec(D, 'plan'), purchases: sec(D, 'purchases'), marks: sec(D, 'marks'), recipes: ctx.recipes, catalog: ctx.catalog, from: ui.listFrom, weeks: ui.listWeeks, today: L.todayISO() });

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2400); }

function showStatus(s, detail) {
  const label = { local: 'Not synced', synced: 'Synced', syncing: 'Syncing…', pending: 'Saving…', offline: 'Offline', auth: 'Reconnect', error: 'Sync issue' }[s] || s;
  const b = $('#syncBtn');
  b.className = `sync ${s}`; b.title = detail || '';
  $('#syncText').textContent = label;
}

// ---------- sheets ----------
let sheetKind = '', addCtx = null, pick = null;
function sheet(content, kind = '', cls = '') {
  const el = $('#sheet'), y = el.scrollTop, keep = !$('#overlay').hidden && kind && kind === sheetKind;
  el.innerHTML = `<button class="x" data-act="close-sheet">Close</button>${content.s}`;
  el.className = `sheet ${cls}`;
  $('#overlay').hidden = false;
  fitOverlay();
  el.scrollTop = keep ? y : 0;
  sheetKind = kind;
  document.body.style.overflow = 'hidden';
}
// Keep the sheet inside the visible area so the keyboard never covers it.
function fitOverlay() {
  const o = $('#overlay'), vv = window.visualViewport;
  if (!vv) return;
  o.style.top = `${vv.offsetTop}px`; o.style.height = `${vv.height}px`; o.style.bottom = 'auto';
}
window.visualViewport?.addEventListener('resize', fitOverlay);
window.visualViewport?.addEventListener('scroll', fitOverlay);
function closeSheet() { $('#overlay').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; sheetKind = ''; addCtx = null; }

// ---------- views ----------
const metaOf = (r) => [r.time ? `${r.time} minutes` : '', `Serves ${r.servings}`, r.fav ? `${r.fav === 'a' ? names().a : names().b}'s favorite` : ''].filter(Boolean).join(', ');
const arOf = (r) => (r.ar ? html`<span class="ar" dir="rtl">${r.ar}</span>` : '');

const traitRow = (r) => { const t = r ? L.mealTraits(r) : []; return t.length ? html`<span class="tr">${t.map((k) => html`<span title="${L.TRAIT_LABEL[k]}">${new Raw(icon(k))}</span>`)}</span>` : ''; };
function mealBtn(e, ctx) {
  const r = ctx.recipes[e.recipeId];
  return html`<button class="meal ${e.skip ? 'off' : ''}" data-act="entry" data-id="${e.id}"><span class="mn">${r?.title || 'Unknown recipe'}</span><span class="mw">${e.skip ? 'Skipped' : whoName(e.who)}</span>${traitRow(r)}</button>`;
}

function viewPlan(ctx) {
  const days = L.weekDays(ui.week), today = L.todayISO(), n = names();
  const entries = L.live(sec(D, 'plan'));
  const by = {};
  for (const e of entries) (by[`${e.date}|${e.slot}`] ||= []).push(e);
  const order = { both: 0, a: 1, b: 2 };
  const count = entries.filter((e) => e.date >= days[0] && e.date <= days[6] && !e.skip).length;
  const cur = L.weekStart(today) === ui.week;
  return html`
    ${!store.connected ? html`<div class="note"><p>Not synced yet. You and ${n.b} can't see each other's changes.</p><button class="link" data-act="settings">Connect</button></div>` : ''}
    <div class="weekhead">
      <div><h2>${L.prettyRange(ui.week)}</h2><p>Week ${L.isoWeek(ui.week)}${cur ? ', this week' : ''}</p></div>
      <div class="nav"><button data-act="week-prev">Earlier</button>${cur ? '' : html`<button data-act="week-today">Today</button>`}<button data-act="week-next">Later</button></div>
    </div>
    ${days.map((d) => html`<section class="day ${d === today ? 'today' : ''}">
      <header><span class="num">${L.dayNum(d)}</span><div class="dn"><b>${L.dowFull(d)}</b><span>${L.monFull(d)}</span></div>${d === today ? html`<span class="now">Today</span>` : ''}</header>
      ${L.SLOTS.map((s) => html`<div class="slot"><span class="sl">${L.SLOT_LABEL[s]}</span><div class="meals">
        ${(by[`${d}|${s}`] || []).sort((x, y) => order[x.who] - order[y.who] || (x.u || 0) - (y.u || 0)).map((e) => mealBtn(e, ctx))}
        <button class="meal add" data-act="add-slot" data-date="${d}" data-slot="${s}">Add</button>
      </div></div>`)}
    </section>`)}
    <button class="cta" data-act="to-shop" data-from="${ui.week}"><b>Shopping list for this week</b><span>${count === 0 ? 'No meals planned yet' : `${count} meal${count === 1 ? '' : 's'} planned`}</span></button>`;
}

const TAGS = [['', 'All'], ['egyptian', 'Egyptian'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['quick', 'Quick'], ['fav', 'Favorites'], ['mine', 'Mine']];
function recipeCards(list, act = 'open-recipe') {
  if (!list.length) return html`<div class="empty"><h3>No recipes found</h3><p>Try another word, or add your own.</p></div>`;
  return html`${list.map((r) => html`<button class="rrow" data-act="${act}" data-id="${r.id}"><span class="rt">${r.title}</span><span class="rm">${metaOf(r)}${arOf(r)}</span></button>`)}`;
}
const search = (ctx, q, tag) => L.searchRecipes(Object.values(ctx.recipes), ctx.catalog, q, { tag, boost: counts() });

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
function inboxBlock() {
  const items = L.live(sec(R, 'inbox')).sort((x, y) => (x.u || 0) - (y.u || 0));
  if (!items.length) return '';
  return html`<h2 class="hd">Waiting for Mealy</h2>${items.map((i) => html`<button class="rrow" data-act="inbox-open" data-id="${i.id}"><span class="rt" dir="auto">${i.title || (i.url ? hostOf(i.url) : i.lang === 'ar' ? 'Arabic text' : 'Pasted text')}</span><span class="rm">${i.status === 'failed' ? (i.note || "Couldn't read this link. Paste the page text instead.") : i.url ? 'Link saved, ready to read' : 'Text saved, ready to read'}</span></button>`)}<div class="gap2"></div>`;
}
function viewRecipes(ctx) {
  return html`
    <div class="searchbar"><input class="field" data-input="rsearch" placeholder="Search recipes" value="${ui.q}" autocomplete="off" enterkeyhint="search"><button class="plus" data-act="add-recipe" aria-label="Add a recipe"></button></div>
    <div class="chips">${TAGS.map(([k, l]) => html`<button class="chip ${ui.tag === k ? 'on' : ''}" data-act="rtag" data-tag="${k}">${l}</button>`)}</div>
    ${inboxBlock()}
    <div id="rlist">${recipeCards(search(ctx, ui.q, ui.tag))}</div>`;
}

function itemRow(r) {
  const it = r.item;
  const sub = r.section === 'home'
    ? `About ${L.fmtQty(r.have, it)} left, need ${L.fmtQty(r.need, it)}`
    : [`Need ${L.fmtQty(r.need, it)}`, r.have > 0 ? `${L.fmtQty(r.have, it)} at home` : ''].filter(Boolean).join(', ');
  const moved = r.movedFrom ? html` <span class="moved">Not at ${L.STORES[r.movedFrom]}</span>` : '';
  if (r.section === 'home') {
    return html`<div class="item home"><div><span class="nm">${it.name}</span><span class="sub">${sub}</span></div><button class="more" data-act="item-menu" data-id="${r.id}">Edit</button></div>`;
  }
  return html`<div class="item ${r.done ? 'done' : ''}" data-act="tick" data-id="${r.id}">
    <span class="check"></span>
    <div><span class="nm">${it.name}</span><span class="sub">${sub}${moved}</span></div>
    <div class="amt">${r.packsShown === 1 ? '' : r.packsShown + ' × '}${it.packLabel || 'pack'}<small>${r.price ? 'about ' + L.fmtEuro(r.price) : ''}</small></div>
    <button class="more" data-act="item-menu" data-id="${r.id}">Edit</button>
  </div>`;
}
const fold = (key, title, rows) => (rows.length ? html`<details class="fold" data-fold="${key}" ${ui.folds.has(key) ? 'open' : ''}><summary>${title} (${rows.length})</summary><div class="frame group">${rows.map(itemRow)}</div></details>` : '');

function viewShop(ctx) {
  const list = currentList(ctx);
  const buy = list.rows.filter((r) => r.section === 'buy');
  const stores = L.STORE_ORDER.filter((s) => buy.some((r) => r.store === s));
  const pct = list.buyCount ? Math.round((list.doneCount / list.buyCount) * 100) : 0;
  const isCur = ui.listFrom === L.weekStart(L.todayISO());
  return html`
    <div class="weekhead">
      <div><h2>${L.prettyRange(ui.listFrom, ui.listWeeks)}</h2><p>${ui.listWeeks === 1 ? 'Week ' + L.isoWeek(ui.listFrom) : ui.listWeeks + ' weeks'}${isCur ? ', this week' : ''}</p></div>
      <div class="nav"><button data-act="list-prev">Earlier</button><button data-act="list-next">Later</button></div>
    </div>
    <div class="seg" style="margin-bottom:18px">${[1, 2, 3].map((w) => html`<button class="${ui.listWeeks === w ? 'on' : ''}" data-act="list-weeks" data-w="${w}">${w} week${w > 1 ? 's' : ''}</button>`)}</div>
    ${list.rows.length === 0 ? html`<div class="empty"><h3>Nothing to buy</h3><p>Plan some meals and the list builds itself.</p><button class="btn" data-act="tab" data-tab="plan">Go to plan</button></div>` : html`
    <div class="frame sum">
      <div class="row"><span class="big grow">${list.doneCount} of ${list.buyCount} bought</span><span class="est">about ${L.fmtEuro(list.total)}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row"><button class="btn small grow" data-act="share-list">Share</button><button class="btn small grow" data-act="wa-list">WhatsApp</button></div>
    </div>
    ${stores.map((st) => {
      const rs = buy.filter((r) => r.store === st);
      let last = '';
      return html`<div class="store"><h3>${L.STORES[st]}</h3><span>about ${L.fmtEuro(rs.reduce((s, r) => s + r.price, 0))}</span></div>
        <div class="frame group">${rs.map((r) => { const head = r.aisle !== last ? ((last = r.aisle), html`<div class="aisle">${r.aisle}</div>`) : ''; return html`${head}${itemRow(r)}`; })}</div>`;
    })}
    ${buy.length === 0 ? html`<div class="empty"><h3>You have everything</h3><p>Check the list of things at home below.</p></div>` : ''}
    ${fold('home', 'Probably still at home', list.rows.filter((r) => r.section === 'home'))}
    ${fold('staple', 'Staples to check in your cupboard', list.rows.filter((r) => r.section === 'staple'))}
    ${fold('skip', 'Skipped', list.rows.filter((r) => r.section === 'skip'))}`}`;
}

function viewHistory(ctx) {
  const entries = L.live(sec(D, 'plan')).filter((e) => !e.skip && ctx.recipes[e.recipeId]);
  const curWeek = L.weekStart(L.todayISO());
  const c = counts();
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).filter(([id]) => ctx.recipes[id]);
  const weeks = {};
  for (const e of entries) { const w = L.weekStart(e.date); if (w < curWeek) (weeks[w] ||= []).push(e); }
  const wk = Object.keys(weeks).sort().reverse();
  if (!top.length && !wk.length) return html`<div class="empty"><h3>Nothing here yet</h3><p>Once you have planned a few meals, you can cook your favorites again or repeat a whole week.</p></div>`;
  return html`
    ${top.length ? html`<h2 class="hd">Most cooked</h2>${top.map(([id, n]) => { const r = ctx.recipes[id]; return html`<button class="rrow" data-act="pick-recipe-hist" data-id="${id}"><span class="rt">${r.title}</span><span class="rm">Planned ${n} time${n === 1 ? '' : 's'}</span></button>`; })}` : ''}
    ${wk.length ? html`<h2 class="hd" style="margin-top:44px;margin-bottom:16px">Past weeks</h2>${wk.map((w) => html`<div class="frame wkcard">
      <header><b>${L.prettyRange(w)}</b><span class="mute small">${weeks[w].length} meals</span></header>
      ${weeks[w].sort((a, b) => (a.date + a.slot < b.date + b.slot ? -1 : 1)).map((e) => html`<button class="ml" data-act="pick-recipe-hist" data-id="${e.recipeId}">${ctx.recipes[e.recipeId].title}</button>`)}
      <button class="btn small" data-act="repeat-week" data-week="${w}">Repeat this week</button></div>`)}` : ''}`;
}

function render(keepScroll = true) {
  const ctx = lookups();
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const y = window.scrollY;
  $('#view').innerHTML = ({ plan: viewPlan, recipes: viewRecipes, shop: viewShop, history: viewHistory }[ui.tab](ctx)).s;
  if (keepScroll) window.scrollTo(0, y);
  saveUI();
}

// ---------- sheets: recipe, entry, picker, add ----------
const whoSeg = (cur, act, extra = '') => { const n = names(); return html`<div class="seg">${['both', 'a', 'b'].map((w) => html`<button class="${cur === w ? 'on' : ''}" data-act="${act}" ${extra} data-who="${w}">${w === 'both' ? 'Both' : w === 'a' ? n.a : n.b}</button>`)}</div>`; };

function openRecipe(id, servings) {
  const ctx = lookups(), r = ctx.recipes[id];
  if (!r) return;
  const sv = servings || r.servings, f = sv / r.servings;
  const groups = [];
  for (const i of r.ingredients) { const s = i.section || ''; let g = groups.find((x) => x.s === s); if (!g) groups.push((g = { s, items: [] })); g.items.push(i); }
  sheet(html`
    <h2>${r.title}</h2>
    <p class="meta">${[r.time ? `${r.time} minutes` : '', ...(r.tags || []).slice(0, 2).map((t) => t[0].toUpperCase() + t.slice(1))].filter(Boolean).join(', ')}${arOf(r)}</p>
    ${r.source?.url ? html`<p class="meta small">Source: <a href="${r.source.url}" target="_blank" rel="noopener">${r.source.name || r.source.url}</a></p>` : ''}
    <div class="serv"><span>Servings</span><div class="stepper"><button data-act="recipe-serv" data-id="${id}" data-sv="${Math.max(1, sv - 1)}">−</button><b>${Math.round(sv * 10) / 10}</b><button data-act="recipe-serv" data-id="${id}" data-sv="${sv + 1}">+</button></div></div>
    <h3>Ingredients</h3>
    ${groups.map((g) => html`${g.s ? html`<div class="part">${g.s}</div>` : ''}${g.items.map((i) => { const it = ctx.catalog[i.item]; return html`<div class="ing"><span>${it?.name || i.item}${i.note ? html`<span class="muted">, ${i.note}</span>` : ''}</span><b>${f === 1 && i.disp ? i.disp + ', ' : ''}${L.fmtQty(i.qty * f, it)}</b></div>`; })}`)}
    <h3>Steps</h3>
    ${r.steps.length ? r.steps.map((s, n) => html`<div class="step"><i>${n + 1}</i><div>${s.title ? html`<b>${s.title}</b><br>` : ''}${s.text}${s.added ? html`<div class="added">Added by Mealy. Typical for this dish, not from the source.</div>` : ''}${s.timer_min ? html`<span class="t">${s.timer_min} minutes</span>` : ''}</div></div>`) : html`<p class="muted small">No steps saved yet.</p>`}
    <div class="gap2"></div>
    <div class="row"><button class="btn main grow" data-act="plan-recipe" data-id="${id}">Add to plan</button><button class="btn" data-act="share-recipe" data-id="${id}" data-sv="${sv}">Share</button></div>
    ${r.mine ? html`<div class="gap"></div><button class="btn warn block small" data-act="del-recipe" data-id="${id}">Delete recipe</button>` : ''}`, 'recipe');
}

function openEntry(id) {
  const ctx = lookups(), e = sec(D, 'plan')[id];
  if (!e || e.d) return closeSheet();
  const r = ctx.recipes[e.recipeId];
  sheet(html`
    <h2>${r?.title || 'Unknown recipe'}</h2>
    <p class="meta">${L.prettyDate(e.date)}, ${L.SLOT_LABEL[e.slot]}</p>
    <span class="lbl">For</span>
    ${whoSeg(e.who, 'entry-who', html`data-id="${id}"`)}
    <span class="lbl">Servings</span>
    <div class="stepper"><button data-act="entry-serv" data-id="${id}" data-d="-1">−</button><b>${e.servings}</b><button data-act="entry-serv" data-id="${id}" data-d="1">+</button></div>
    <div class="gap2"></div>
    <div class="row">${r ? html`<button class="btn main grow" data-act="open-recipe" data-id="${e.recipeId}">View recipe</button>` : ''}<button class="btn grow" data-act="entry-skip" data-id="${id}">${e.skip ? 'Cook it after all' : 'Not cooking'}</button></div>
    <div class="gap"></div><button class="btn warn block small" data-act="entry-del" data-id="${id}">Remove from plan</button>`, 'entry');
}

function openPicker(recipeId, preset = {}) {
  const ctx = lookups(), r = ctx.recipes[recipeId];
  if (!r) return;
  const slot = preset.slot || r.slots?.[r.slots.length - 1] || 'dinner';
  pick = { recipeId, date: preset.date || (ui.week === L.weekStart(L.todayISO()) ? L.todayISO() : ui.week), slot, who: 'both', servings: r.servings };
  renderPicker();
}
function renderPicker() {
  const ctx = lookups(), r = ctx.recipes[pick.recipeId], t = L.todayISO();
  const dates = Array.from({ length: 28 }, (_, i) => L.addDays(t, i));
  if (!dates.includes(pick.date)) dates.unshift(pick.date);
  sheet(html`
    <h2>${r.title}</h2>
    <p class="meta">Add to your plan</p>
    <span class="lbl">Day</span>
    <select class="field" data-change="pick-date">${dates.map((d) => html`<option value="${d}" ${d === pick.date ? 'selected' : ''}>${L.prettyDate(d)}${d === t ? ' (today)' : ''}</option>`)}</select>
    <span class="lbl">Meal</span>
    <div class="seg">${L.SLOTS.map((s) => html`<button class="${pick.slot === s ? 'on' : ''}" data-act="pick-slot" data-slot="${s}">${L.SLOT_LABEL[s]}</button>`)}</div>
    <span class="lbl">For</span>
    ${whoSeg(pick.who, 'pick-who')}
    <span class="lbl">Servings</span>
    <div class="stepper"><button data-act="pick-serv" data-d="-1">−</button><b>${pick.servings}</b><button data-act="pick-serv" data-d="1">+</button></div>
    <div class="gap2"></div>
    <button class="btn main block" data-act="pick-add">Add to ${L.prettyDate(pick.date)}</button>`, 'pick');
}

function openAdd(date, slot) {
  addCtx = { date, slot };
  sheet(html`<h2>Add a meal</h2><p class="meta">${L.prettyDate(date)}, ${L.SLOT_LABEL[slot]}</p>
    <div style="margin-top:22px"><input class="field" id="addq" data-input="addsearch" placeholder="Search, for example chicken or koshari" autocomplete="off" enterkeyhint="search"></div>
    <div class="list-pick" id="addlist">${recipeCards(search(lookups(), '', slot), 'pick-recipe')}</div>`, 'add', 'fixed');
  setTimeout(() => $('#addq')?.focus(), 250);
}

function openItem(itemId) {
  const ctx = lookups(), list = currentList(ctx), r = list.rows.find((x) => x.id === itemId);
  if (!r) return closeSheet();
  const it = r.item, chain = [...new Set([it.store, it.alt, ...L.STORE_ORDER].filter(Boolean))];
  const canMove = r.section !== 'home' && chain.indexOf(r.store) < chain.length - 1;
  sheet(html`
    <h2>${it.name}</h2>
    <p class="meta">${[`Pack: ${it.packLabel || '1 pack'}`, it.price ? 'about ' + L.fmtEuro(it.price) : '', L.STORES[r.store]].filter(Boolean).join(', ')}</p>
    <div class="gap2"></div>
    <div class="ing"><span>Needed</span><b>${L.fmtQty(r.need, it)}</b></div>
    <div class="ing"><span>At home, estimate</span><b>${L.fmtQty(r.have, it)}</b></div>
    ${r.section !== 'home' ? html`<div class="ing"><span>Packs to buy</span><b>${r.packsNeeded}</b></div>` : ''}
    <div class="part">Used in</div>
    ${r.uses.map((u) => html`<div class="ing"><span>${u.title}<br><span class="mute small">${L.prettyDate(u.date)}</span></span><b>${L.fmtQty(u.qty, it)}</b></div>`)}
    ${r.section !== 'home' && r.section !== 'skip' ? html`<div class="serv"><span>Packs bought</span><div class="stepper"><button data-act="item-packs" data-id="${itemId}" data-d="-1">−</button><b>${r.packsBought}</b><button data-act="item-packs" data-id="${itemId}" data-d="1">+</button></div></div>` : ''}
    <div class="gap2"></div>
    ${r.section === 'home' ? html`<button class="btn main block" data-act="item-out" data-id="${itemId}">I'm out of it, add to list</button>` : ''}
    ${r.section !== 'home' && r.section !== 'skip' ? html`<button class="btn block" data-act="item-have" data-id="${itemId}">I already have enough at home</button><div class="gap"></div>` : ''}
    ${canMove ? html`<button class="btn block" data-act="item-missing" data-id="${itemId}">Couldn't find it at ${L.STORES[r.store]}</button><div class="gap"></div>` : ''}
    ${r.markState === 'missing' ? html`<button class="btn block" data-act="item-unmark" data-id="${itemId}">Back to ${L.STORES[it.store]}</button><div class="gap"></div>` : ''}
    ${r.section === 'skip' ? html`<button class="btn main block" data-act="item-unmark" data-id="${itemId}">Put back on the list</button>` : html`<button class="btn quiet block" data-act="item-skip" data-id="${itemId}">Skip this item</button>`}`, 'item');
}

function openRepeat(week) {
  const cur = L.weekStart(L.todayISO());
  const opts = [[cur, 'This week'], [L.addDays(cur, 7), 'Next week'], [L.addDays(cur, 14), 'In 2 weeks']];
  sheet(html`<h2>Repeat this week</h2><p class="meta">Copies every meal from ${L.prettyRange(week)} into:</p><div class="gap2"></div>
    ${opts.map(([w, l]) => html`<button class="btn block" style="margin-bottom:12px;justify-content:space-between" data-act="do-repeat" data-src="${week}" data-dst="${w}"><span>${l}</span><span class="mute small">${L.prettyRange(w)}</span></button>`)}
    <p class="small muted" style="margin-top:18px">Meals are added next to anything already planned.</p>`);
}

function openAddRecipe(id) {
  const n = names(), cur = id ? sec(R, 'inbox')[id] : null;
  const on = (v, k) => (v === k ? 'on' : '');
  sheet(html`<h2>${cur ? 'Edit recipe' : 'Add a recipe'}</h2>
    <p class="meta">Mealy turns it into ingredients and steps. You only add a link or the page text.</p>
    <span class="lbl">Name</span><input class="field" id="ar-title" dir="auto" placeholder="Leave empty to use the page title" value="${cur?.title || ''}" data-id="${id || ''}">
    <span class="lbl">Favorite of</span>
    <div class="seg" id="ar-fav"><button type="button" class="${on(cur?.fav, 'a')}" data-act="ar-fav" data-v="a">${n.a}</button><button type="button" class="${on(cur?.fav, 'b')}" data-act="ar-fav" data-v="b">${n.b}</button></div>
    <span class="lbl">Good for</span>
    <div class="chips" id="ar-slots">${L.SLOTS.map((s) => html`<button type="button" class="chip ${(cur?.slots || []).includes(s) ? 'on' : ''}" data-act="ar-slot" data-slot="${s}">${L.SLOT_LABEL[s]}</button>`)}</div>
    <span class="lbl">Link</span><input class="field" id="ar-url" type="url" inputmode="url" placeholder="https://" autocomplete="off" autocapitalize="off" value="${cur?.url || ''}">
    <span class="lbl">Or paste the whole page text</span><textarea class="field" id="ar-text" dir="auto" rows="7" placeholder="Select all on the recipe page, copy, and paste here">${cur?.text || ''}</textarea>
    <p class="tiny muted" style="margin-top:12px">Arabic is fine. Mealy translates it into English and builds the recipe. If a site blocks the link, it shows up here and you can paste the text instead.</p>
    <div class="gap2"></div><button class="btn main block" data-act="ar-save" data-id="${id || ''}">Save</button>
    ${cur ? html`<div class="gap"></div><button class="btn warn block small" data-act="ar-del" data-id="${id}">Remove</button>` : ''}`, 'addrecipe');
}

function openSettings() {
  const n = names(), c = store.cfg, st = store.status;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const stText = { local: 'Not connected. Your data stays on this phone only.', synced: 'All changes are saved to GitHub.', syncing: 'Syncing…', pending: 'Saving…', offline: 'Offline. Changes are kept and sync when you are back online.', auth: 'GitHub rejected the token. Reconnect below.', error: 'Sync problem. Mealy will retry.' }[st] || st;
  sheet(html`<h2>Settings</h2>
    <span class="lbl">Names</span>
    <div class="row"><input class="field" id="name-a" value="${n.a}" data-change="names"><input class="field" id="name-b" value="${n.b}" data-change="names"></div>
    <span class="lbl">Sync</span>
    <p class="small muted">${stText}</p>
    ${store.connected ? html`
      <p class="small" style="margin:12px 0">Connected to ${c.owner}/${c.repo}</p>
      <div class="row"><button class="btn small grow" data-act="sync-now">Sync now</button><button class="btn small grow" data-act="invite">Invite ${n.b}</button></div>
      <p class="tiny muted" style="margin-top:10px">The invite link contains the access key. Only send it to ${n.b}.</p>
      <div class="gap"></div><button class="btn quiet small" data-act="disconnect">Disconnect this phone</button>`
      : html`
      <input class="field" id="tok" placeholder="GitHub token (github_pat_…)" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin:12px 0">
      <details><summary class="small muted" style="cursor:pointer">Repository (advanced)</summary><div class="row" style="margin-top:10px"><input class="field" id="own" value="${c.owner}"><input class="field" id="rep" value="${c.repo}"></div></details>
      <div class="gap"></div><button class="btn main block" data-act="connect">Connect</button>
      <p class="tiny muted" style="margin-top:12px">Create the token on GitHub under Settings, Developer settings, Fine-grained tokens. Repository: only ${c.repo}. Permission: Contents, read and write.</p>`}
    <span class="lbl">Data</span>
    <button class="btn quiet small" style="padding-left:0" data-act="backup">Download backup (JSON)</button>
    ${standalone ? '' : html`<div class="note" style="margin:22px 0 0"><p class="small">Open this page in Safari, tap Share, then Add to Home Screen, to use Mealy like an app.</p></div>`}
    <span class="lbl">App</span>
    <button class="btn small" data-act="update-app">Update app</button>
    <p class="tiny muted" style="margin-top:26px;text-align:center">Version ${BUILD}. Prices are rough Aldi Süd estimates.</p>`, 'settings');
}

// ---------- actions ----------
const A = {
  tab(el) { ui.tab = el.dataset.tab; if (ui.tab === 'shop' && !ui.listFromSet) { ui.listFrom = defaultListFrom(); ui.listFromSet = true; } closeSheet(); scrolls[ui.tab] = 0; render(false); window.scrollTo(0, 0); },
  settings: () => openSettings(),
  'close-sheet': () => closeSheet(),
  'week-prev': () => { ui.week = L.addDays(ui.week, -7); render(false); },
  'week-next': () => { ui.week = L.addDays(ui.week, 7); render(false); },
  'week-today': () => { ui.week = L.weekStart(L.todayISO()); render(false); },
  'add-slot': (el) => openAdd(el.dataset.date, el.dataset.slot),
  entry: (el) => openEntry(el.dataset.id),
  'to-shop': (el) => { ui.listFrom = el.dataset.from; ui.listFromSet = true; ui.tab = 'shop'; render(false); window.scrollTo(0, 0); },
  rtag(el) { ui.tag = el.dataset.tag; render(); },
  'open-recipe': (el) => openRecipe(el.dataset.id),
  'recipe-serv': (el) => openRecipe(el.dataset.id, parseFloat(el.dataset.sv)),
  'plan-recipe': (el) => openPicker(el.dataset.id, addCtx || {}),
  'pick-recipe': (el) => openPicker(el.dataset.id, addCtx || {}),
  'pick-recipe-hist': (el) => openPicker(el.dataset.id),
  'pick-slot': (el) => { pick.slot = el.dataset.slot; renderPicker(); },
  'pick-who': (el) => { pick.who = el.dataset.who; renderPicker(); },
  'pick-serv': (el) => { pick.servings = Math.max(1, pick.servings + Number(el.dataset.d)); renderPicker(); },
  'pick-add': () => {
    store.put(D, 'plan', L.newId(), { date: pick.date, slot: pick.slot, recipeId: pick.recipeId, who: pick.who, servings: pick.servings });
    toast(`Added to ${L.prettyDate(pick.date)}, ${L.SLOT_LABEL[pick.slot]}`);
    ui.week = L.weekStart(pick.date);
    closeSheet(); if (ui.tab !== 'plan' && ui.tab !== 'history' && ui.tab !== 'recipes') ui.tab = 'plan'; render(false);
  },
  'entry-who': (el) => { store.put(D, 'plan', el.dataset.id, { who: el.dataset.who }); openEntry(el.dataset.id); render(); },
  'entry-serv': (el) => { const e = sec(D, 'plan')[el.dataset.id]; store.put(D, 'plan', e.id, { servings: Math.max(1, (e.servings || 1) + Number(el.dataset.d)) }); openEntry(e.id); render(); },
  'entry-skip': (el) => { const e = sec(D, 'plan')[el.dataset.id]; store.put(D, 'plan', e.id, { skip: !e.skip }); closeSheet(); render(); },
  'entry-del': (el) => { store.del(D, 'plan', el.dataset.id); closeSheet(); render(); toast('Removed'); },
  'add-recipe': () => openAddRecipe(),
  'inbox-open': (el) => openAddRecipe(el.dataset.id),
  'ar-fav': (el) => { const was = el.classList.contains('on'); $$('#ar-fav button').forEach((b) => b.classList.remove('on')); if (!was) el.classList.add('on'); },
  'ar-slot': (el) => el.classList.toggle('on'),
  'ar-save': (el) => {
    const url = $('#ar-url').value.trim(), text = $('#ar-text').value.trim(), title = $('#ar-title').value.trim();
    if (!url && !text) return toast('Add a link or paste the page text');
    if (url && !/^https?:\/\/\S+$/i.test(url)) return toast('The link should start with https://');
    const id = el.dataset.id || L.newId();
    store.put(R, 'inbox', id, { title, url, text, fav: $('#ar-fav .on')?.dataset.v || '', lang: /[\u0600-\u06FF]/.test(text + title) ? 'ar' : 'en', slots: $$('#ar-slots .chip.on').map((c) => c.dataset.slot), status: 'new', note: '', added: L.todayISO() });
    closeSheet(); ui.tab = 'recipes'; render(); toast('Saved. Ask Mealy to read it.');
  },
  'ar-del': (el) => { store.del(R, 'inbox', el.dataset.id); closeSheet(); render(); toast('Removed'); },
  'del-recipe': (el) => { store.del(R, 'recipes', el.dataset.id); closeSheet(); render(); toast('Recipe deleted'); },
  'share-recipe': async (el) => { const ctx = lookups(), r = ctx.recipes[el.dataset.id]; await shareText(L.recipeText(r, ctx.catalog, parseFloat(el.dataset.sv) / r.servings)); },
  // shopping
  'list-prev': () => { ui.listFrom = L.addDays(ui.listFrom, -7); render(false); },
  'list-next': () => { ui.listFrom = L.addDays(ui.listFrom, 7); render(false); },
  'list-weeks': (el) => { ui.listWeeks = Number(el.dataset.w); render(); },
  tick(el) {
    const ctx = lookups(), row = currentList(ctx).rows.find((r) => r.id === el.dataset.id);
    if (!row) return;
    if (row.done) {
      for (const p of L.live(sec(D, 'purchases'))) if (p.itemId === row.id && p.list === ui.listFrom && p.kind !== 'zero') store.del(D, 'purchases', p.id);
    } else {
      const packs = Math.max(1, row.packsNeeded - row.packsBought);
      store.put(D, 'purchases', L.newId(), { itemId: row.id, qty: packs * (row.item.pack || 1), date: L.todayISO(), list: ui.listFrom, kind: 'buy' });
    }
    navigator.vibrate?.(8);
    render();
  },
  'item-menu': (el) => openItem(el.dataset.id),
  'item-packs': (el) => {
    const ctx = lookups(), row = currentList(ctx).rows.find((r) => r.id === el.dataset.id), d = Number(el.dataset.d), pack = row.item.pack || 1;
    if (d > 0) store.put(D, 'purchases', L.newId(), { itemId: row.id, qty: pack, date: L.todayISO(), list: ui.listFrom, kind: 'buy' });
    else {
      const mine = L.live(sec(D, 'purchases')).filter((p) => p.itemId === row.id && p.list === ui.listFrom && p.kind !== 'zero').sort((a, b) => (b.u || 0) - (a.u || 0));
      if (mine[0]) { if (mine[0].qty > pack + 1e-6) store.put(D, 'purchases', mine[0].id, { qty: mine[0].qty - pack }); else store.del(D, 'purchases', mine[0].id); }
    }
    openItem(el.dataset.id); render();
  },
  'item-have': (el) => {
    const ctx = lookups(), row = currentList(ctx).rows.find((r) => r.id === el.dataset.id);
    store.put(D, 'purchases', L.newId(), { itemId: row.id, qty: Math.max(1, row.packsNeeded) * (row.item.pack || 1), date: L.addDays(ui.listFrom, -1), list: '', kind: 'buy' });
    closeSheet(); render(); toast('Moved to at home');
  },
  'item-out': (el) => { store.put(D, 'purchases', L.newId(), { itemId: el.dataset.id, qty: 0, date: L.todayISO(), list: '', kind: 'zero' }); closeSheet(); render(); toast('Added to the list'); },
  'item-missing': (el) => {
    const ctx = lookups(), row = currentList(ctx).rows.find((r) => r.id === el.dataset.id);
    store.put(D, 'marks', `${ui.listFrom}|${row.id}`, { list: ui.listFrom, itemId: row.id, state: 'missing', at: row.store });
    const after = currentList(ctx).rows.find((r) => r.id === row.id);
    closeSheet(); render(); toast(`Try ${L.STORES[after?.store] || 'another store'}`);
  },
  'item-skip': (el) => { store.put(D, 'marks', `${ui.listFrom}|${el.dataset.id}`, { list: ui.listFrom, itemId: el.dataset.id, state: 'skip' }); closeSheet(); render(); },
  'item-unmark': (el) => { store.del(D, 'marks', `${ui.listFrom}|${el.dataset.id}`); closeSheet(); render(); },
  'share-list': async () => { const ctx = lookups(); await shareText(L.shareText(currentList(ctx), { title: 'Shopping list' })); },
  'wa-list': () => { const ctx = lookups(); window.open(`https://wa.me/?text=${encodeURIComponent(L.shareText(currentList(ctx), { title: 'Shopping list' }))}`, '_blank'); },
  // history
  'repeat-week': (el) => openRepeat(el.dataset.week),
  'do-repeat': (el) => {
    const src = el.dataset.src, dst = el.dataset.dst, off = (new Date(L.parseISO(dst)) - new Date(L.parseISO(src))) / 864e5;
    let n = 0;
    for (const e of L.live(sec(D, 'plan'))) if (e.date >= src && e.date <= L.addDays(src, 6) && !e.skip) { store.put(D, 'plan', L.newId(), { date: L.addDays(e.date, Math.round(off)), slot: e.slot, recipeId: e.recipeId, who: e.who, servings: e.servings }); n++; }
    ui.week = dst; ui.tab = 'plan'; closeSheet(); render(false); toast(`Copied ${n} meals`);
  },
  // settings
  'update-app': () => { toast('Updating…'); refreshApp(); },
  async connect() {
    const token = $('#tok').value.trim(), owner = ($('#own')?.value || '').trim(), repo = ($('#rep')?.value || '').trim();
    if (!token) return toast('Paste the token first');
    try { toast('Checking…'); await store.test(token, owner, repo); store.setConfig({ token, owner, repo }); closeSheet(); toast('Connected'); }
    catch (e) { toast(e.message || 'Could not connect'); }
  },
  disconnect: () => { store.disconnect(); openSettings(); render(); },
  'sync-now': async () => { await store.sync(); toast(store.status === 'synced' ? 'Up to date' : 'Sync: ' + store.status); },
  async invite() {
    const link = store.inviteLink(), msg = `Join our meal planner: ${link}`;
    if (navigator.share) { try { await navigator.share({ text: msg }); return; } catch { return; } }
    try { await navigator.clipboard.writeText(msg); toast('Link copied'); } catch { prompt('Copy this link', link); }
  },
  backup() {
    const out = { exported: new Date().toISOString(), data: { plan: sec(D, 'plan'), purchases: sec(D, 'purchases'), marks: sec(D, 'marks'), settings: sec(D, 'settings') }, recipes: { recipes: sec(R, 'recipes'), catalog: sec(R, 'catalog') } };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    a.download = `mealy-backup-${L.todayISO()}.json`; a.click();
  },
};

// ---------- keep the installed app fresh ----------
async function refreshApp() {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.reload();
}
let lastCheck = 0;
async function checkForUpdate() {
  if (Date.now() - lastCheck < 15000) return;
  lastCheck = Date.now();
  try {
    const v = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
    if (v.build && BUILD !== '0' && v.build !== BUILD) {
      const t = Number(sessionStorage.getItem('mealy:upd')) || 0;
      if (Date.now() - t < 60000) return; // never reload in a loop
      sessionStorage.setItem('mealy:upd', String(Date.now()));
      toast('Updating…'); await refreshApp();
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
window.addEventListener('pageshow', checkForUpdate);
window.addEventListener('focus', checkForUpdate);
setInterval(checkForUpdate, 5 * 60 * 1000);

async function shareText(text) {
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }
}
function defaultListFrom() {
  const t = L.todayISO(), cur = L.weekStart(t), next = L.addDays(cur, 7);
  const dow = (L.parseISO(t).getDay() + 6) % 7;
  const plan = L.live(sec(D, 'plan')).filter((e) => !e.skip);
  const hasNext = plan.some((e) => e.date >= next && e.date <= L.addDays(next, 6));
  const hasCurFuture = plan.some((e) => e.date >= t && e.date <= L.addDays(cur, 6));
  return dow >= 4 && hasNext && !hasCurFuture ? next : cur;
}

// ---------- input handlers ----------
const I = {
  rsearch(el) { ui.q = el.value; saveUI(); $('#rlist').innerHTML = recipeCards(search(lookups(), ui.q, ui.tag)).s; },
  addsearch(el) { $('#addlist').innerHTML = recipeCards(search(lookups(), el.value, el.value ? '' : addCtx?.slot || ''), 'pick-recipe').s; },
};
const C = {
  'pick-date'(el) { pick.date = el.value; renderPicker(); },
  names() { store.put(D, 'settings', 'names', { a: $('#name-a').value.trim() || 'Mostafa', b: $('#name-b').value.trim() || 'Menna' }); render(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act]) return;
  e.preventDefault();
  A[el.dataset.act](el, e);
});
document.addEventListener('input', (e) => { const f = e.target.dataset?.input; if (f && I[f]) I[f](e.target); });
document.addEventListener('change', (e) => { const f = e.target.dataset?.change; if (f && C[f]) C[f](e.target); });
document.addEventListener('toggle', (e) => { const k = e.target.dataset?.fold; if (k) e.target.open ? ui.folds.add(k) : ui.folds.delete(k); }, true);

// ---------- boot ----------
async function boot() {
  try {
    const [cat, recs] = await Promise.all([fetch('data/catalog.json').then((r) => r.json()), fetch('data/recipes.json').then((r) => r.json())]);
    lib.catalog = L.normalizeCatalog(cat);
    lib.recipes = recs.map(L.normalizeRecipe);
  } catch (e) {
    $('#view').innerHTML = '<div class="empty"><h3>Could not load recipes</h3><p>Check your connection and reload.</p></div>';
    return;
  }
  if (location.hash.includes('setup=')) {
    if (store.applyInvite(location.hash)) toast('Connected – syncing…');
    history.replaceState(null, '', location.pathname + location.search);
  }
  showStatus(store.connected ? 'syncing' : 'local');
  render(false);
  requestAnimationFrame(() => {
    const t = $('.day.today'), y = scrolls[ui.tab];
    if (y > 0) window.scrollTo(0, y);
    else if (ui.tab === 'plan' && t && ui.week === L.weekStart(L.todayISO())) window.scrollTo(0, Math.max(0, t.offsetTop - 64));
  });
  store.startPolling();
  store.sync();
  checkForUpdate();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
