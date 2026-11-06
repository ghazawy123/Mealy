// Mealy – UI. Vanilla JS, no build step.
import * as L from './logic.js';
import { createStore } from './sync.js';

// ---------- tiny templating ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
class Raw { constructor(s) { this.s = s; } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
const html = (st, ...vs) => new Raw(st.reduce((o, s, i) => o + s + (i < vs.length ? part(vs[i]) : ''), ''));
const hue = (id) => { let h = 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const slug = (s) => L.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

// ---------- state ----------
const D = 'data.json', R = 'recipes.json';
const store = createStore({ onChange: () => { if (!document.activeElement?.matches?.('input,textarea,select')) render(); }, onStatus: showStatus });
const lib = { recipes: [], catalog: {} };
const today0 = L.todayISO();
const ui = { tab: 'plan', week: L.weekStart(today0), listFrom: L.weekStart(today0), listFromSet: false, listWeeks: 1, q: '', tag: '', folds: new Set() };
const sec = (f, n) => store.section(f, n);

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
let sheetBack = null;
function sheet(content) {
  $('#sheet').innerHTML = content.s;
  $('#overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#overlay').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; sheetBack = null; addCtx = null; }

// ---------- views ----------
const mealBtn = (e, ctx) => {
  const r = ctx.recipes[e.recipeId];
  return html`<button class="meal" data-act="entry" data-id="${e.id}"><div class="tile" style="--h:${hue(e.recipeId)}">${r?.emoji || '🍽️'}<i class="who ${e.who}"></i>${e.skip ? html`<div class="skip">skipped</div>` : ''}</div><span class="nm">${r?.title || 'Unknown recipe'}</span></button>`;
};

function viewPlan(ctx) {
  const days = L.weekDays(ui.week), today = L.todayISO(), n = names();
  const entries = L.live(sec(D, 'plan'));
  const by = {};
  for (const e of entries) (by[`${e.date}|${e.slot}`] ||= []).push(e);
  const order = { both: 0, a: 1, b: 2 };
  const count = entries.filter((e) => e.date >= days[0] && e.date <= days[6] && !e.skip).length;
  const cur = L.weekStart(today) === ui.week;
  return html`
    ${!store.connected ? html`<div class="banner">☁️<div class="grow">Not synced yet – you and ${n.b} can't see each other's changes.</div><button class="btn small" data-act="settings">Connect</button></div>` : ''}
    <div class="weekbar">
      <button class="nav" data-act="week-prev" aria-label="Previous week">‹</button>
      <div class="wk"><b>${L.prettyRange(ui.week)}</b><small>Week ${L.isoWeek(ui.week)}${cur ? ' · this week' : ''}</small></div>
      <button class="nav" data-act="week-next" aria-label="Next week">›</button>
      ${cur ? '' : html`<button class="pill" data-act="week-today">Today</button>`}
    </div>
    <div class="legend"><span><i class="dot both"></i>Both</span><span><i class="dot a"></i>${n.a}</span><span><i class="dot b"></i>${n.b}</span></div>
    ${days.map((d) => html`<section class="day ${d === today ? 'today' : ''}">
      <header><b>${L.dowName(d)}</b><span>${L.dayNum(d)} ${L.monName(d)}</span>${d === today ? html`<em>TODAY</em>` : ''}</header>
      ${L.SLOTS.map((s) => html`<div class="slot"><label>${L.SLOT_ICON[s]} ${L.SLOT_LABEL[s]}</label><div class="meals">
        ${(by[`${d}|${s}`] || []).sort((x, y) => order[x.who] - order[y.who] || (x.u || 0) - (y.u || 0)).map((e) => mealBtn(e, ctx))}
        <button class="meal add" data-act="add-slot" data-date="${d}" data-slot="${s}"><div class="tile">＋</div><span class="nm">Add</span></button>
      </div></div>`)}
    </section>`)}
    <button class="card cta" data-act="to-shop" data-from="${ui.week}" style="width:100%;text-align:left"><span class="big">🛒</span><span class="grow"><b>Shopping list for this week</b><br><span class="muted small">${count} meal${count === 1 ? '' : 's'} planned</span></span><span>›</span></button>`;
}

const TAGS = [['', 'All'], ['egyptian', 'Egyptian'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['quick', 'Quick'], ['mine', 'Mine']];
function recipeCards(list, act = 'open-recipe') {
  if (!list.length) return html`<div class="empty"><b>🔎</b>No recipes found.<br><span class="small">Try another word, or add your own with ＋ New.</span></div>`;
  return html`${list.map((r) => html`<button class="card rcard" data-act="${act}" data-id="${r.id}"><div class="tile" style="--h:${hue(r.id)}">${r.emoji || '🍽️'}</div><div><h3>${r.title}</h3><p>${r.ar ? r.ar + ' · ' : ''}${r.time ? r.time + ' min · ' : ''}serves ${r.servings}</p>${(r.tags || []).slice(0, 3).map((t) => html`<span class="tag">${t}</span>`)}</div></button>`)}`;
}
const search = (ctx, q, tag) => L.searchRecipes(Object.values(ctx.recipes), ctx.catalog, q, { tag, boost: counts() });

function viewRecipes(ctx) {
  return html`
    <div class="row" style="margin:6px 0 10px"><div class="search grow"><input class="field" data-input="rsearch" placeholder="Search recipes, e.g. chicken" value="${ui.q}" autocomplete="off" enterkeyhint="search"></div><button class="btn small" data-act="new-recipe">＋ New</button></div>
    <div class="chips">${TAGS.map(([k, l]) => html`<button class="chip ${ui.tag === k ? 'on' : ''}" data-act="rtag" data-tag="${k}">${l}</button>`)}</div>
    <div id="rlist">${recipeCards(search(ctx, ui.q, ui.tag))}</div>`;
}

function itemRow(r) {
  const it = r.item;
  const sub = r.section === 'home'
    ? `about ${L.fmtQty(r.have, it)} left · need ${L.fmtQty(r.need, it)}`
    : [`need ${L.fmtQty(r.need, it)}`, r.have > 0 ? `${L.fmtQty(r.have, it)} at home` : ''].filter(Boolean).join(' · ');
  const moved = r.movedFrom ? html` <span class="moved">· not at ${L.STORES[r.movedFrom]}</span>` : '';
  if (r.section === 'home') {
    return html`<div class="item soft" style="grid-template-columns:34px 1fr 28px"><span style="text-align:center">🏠</span><div><div class="nm">${it.name}</div><div class="sub">${sub}</div></div><button class="more" data-act="item-menu" data-id="${r.id}" aria-label="Options">⋯</button></div>`;
  }
  return html`<div class="item ${r.done ? 'done' : ''}" data-act="tick" data-id="${r.id}">
    <span class="check">✓</span>
    <div><div class="nm">${it.name}</div><div class="sub">${sub}${moved}</div></div>
    <div class="amt">${r.packsShown}× ${it.packLabel || 'pack'}<small>${r.price ? '~' + L.fmtEuro(r.price) : ''}</small></div>
    <button class="more" data-act="item-menu" data-id="${r.id}" aria-label="Options">⋯</button>
  </div>`;
}
const fold = (key, title, rows) => (rows.length ? html`<details class="fold" data-fold="${key}" ${ui.folds.has(key) ? 'open' : ''}><summary>${title} (${rows.length})</summary>${rows.map(itemRow)}</details>` : '');

function viewShop(ctx) {
  const list = currentList(ctx);
  const buy = list.rows.filter((r) => r.section === 'buy');
  const stores = L.STORE_ORDER.filter((s) => buy.some((r) => r.store === s));
  const pct = list.buyCount ? Math.round((list.doneCount / list.buyCount) * 100) : 0;
  const isCur = ui.listFrom === L.weekStart(L.todayISO());
  return html`
    <div class="weekbar">
      <button class="nav" data-act="list-prev" aria-label="Earlier">‹</button>
      <div class="wk"><b>${L.prettyRange(ui.listFrom, ui.listWeeks)}</b><small>${ui.listWeeks === 1 ? 'Week ' + L.isoWeek(ui.listFrom) : ui.listWeeks + ' weeks'}${isCur ? ' · this week' : ''}</small></div>
      <button class="nav" data-act="list-next" aria-label="Later">›</button>
    </div>
    <div class="seg" style="margin-bottom:12px">${[1, 2, 3].map((w) => html`<button class="${ui.listWeeks === w ? 'on' : ''}" data-act="list-weeks" data-w="${w}">${w} week${w > 1 ? 's' : ''}</button>`)}</div>
    ${list.rows.length === 0 ? html`<div class="empty"><b>🧺</b>Nothing to buy for these dates.<br><span class="small">Plan some meals first – the list builds itself.</span><div class="gap"></div><button class="btn" data-act="tab" data-tab="plan">Go to plan</button></div>` : html`
    <div class="card sum">
      <div class="row"><b class="grow">${list.doneCount} of ${list.buyCount} items bought</b><span class="muted">~${L.fmtEuro(list.total)}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:12px"><button class="btn small ghost grow" data-act="share-list">⬆︎ Share</button><button class="btn small ghost grow" data-act="wa-list">💬 WhatsApp</button></div>
    </div>
    ${stores.map((st) => {
      const rs = buy.filter((r) => r.store === st);
      let last = '';
      return html`<div class="store"><span>${L.STORES[st]}</span><span>~${L.fmtEuro(rs.reduce((s, r) => s + r.price, 0))}</span></div>
        ${rs.map((r) => { const head = r.aisle !== last ? ((last = r.aisle), html`<div class="aisle">${r.aisle}</div>`) : ''; return html`${head}${itemRow(r)}`; })}`;
    })}
    ${buy.length === 0 ? html`<div class="empty"><b>🏠</b>You already have everything.<br><span class="small">Check the "at home" list below.</span></div>` : ''}
    ${fold('home', '🏠 Probably still at home', list.rows.filter((r) => r.section === 'home'))}
    ${fold('staple', '🧂 Staples – check your cupboard', list.rows.filter((r) => r.section === 'staple'))}
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
  if (!top.length && !wk.length) return html`<div class="empty"><b>🕘</b>Your history shows up here.<br><span class="small">Once you've planned a few meals you can repeat favorites or whole weeks.</span></div>`;
  return html`
    ${top.length ? html`<h2 style="margin:8px 4px">Most cooked</h2>${top.map(([id, n]) => { const r = ctx.recipes[id]; return html`<button class="card rcard" data-act="pick-recipe-hist" data-id="${id}"><div class="tile" style="--h:${hue(id)}">${r.emoji || '🍽️'}</div><div><h3>${r.title}</h3><p>${n}× planned · tap to plan again</p></div></button>`; })}` : ''}
    ${wk.length ? html`<h2 style="margin:18px 4px 8px">Past weeks</h2>${wk.map((w) => html`<div class="card" style="padding:12px;margin-bottom:12px">
      <div class="row"><b class="grow">${L.prettyRange(w)}</b><span class="muted small">${weeks[w].length} meals</span></div>
      <div class="meals" style="margin:10px 0">${weeks[w].sort((a, b) => (a.date + a.slot < b.date + b.slot ? -1 : 1)).map((e) => { const r = ctx.recipes[e.recipeId]; return html`<button class="meal" data-act="pick-recipe-hist" data-id="${e.recipeId}"><div class="tile" style="--h:${hue(e.recipeId)}">${r.emoji || '🍽️'}</div><span class="nm">${r.title}</span></button>`; })}</div>
      <button class="btn small ghost" data-act="repeat-week" data-week="${w}">↻ Repeat this week</button></div>`)}` : ''}`;
}

function render(keepScroll = true) {
  const ctx = lookups();
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const y = window.scrollY;
  $('#view').innerHTML = ({ plan: viewPlan, recipes: viewRecipes, shop: viewShop, history: viewHistory }[ui.tab](ctx)).s;
  if (keepScroll) window.scrollTo(0, y);
}

// ---------- sheets: recipe, entry, picker, add ----------
let addCtx = null, pick = null;

function openRecipe(id, servings) {
  const ctx = lookups(), r = ctx.recipes[id];
  if (!r) return;
  const sv = servings || r.servings, f = sv / r.servings;
  const groups = [];
  for (const i of r.ingredients) { const s = i.section || ''; let g = groups.find((x) => x.s === s); if (!g) groups.push((g = { s, items: [] })); g.items.push(i); }
  sheet(html`
    <div class="hero"><div class="tile" style="--h:${hue(r.id)}">${r.emoji || '🍽️'}</div><div><h2>${r.title}</h2><p class="muted small">${r.ar ? r.ar + ' · ' : ''}${r.time ? r.time + ' min' : ''}</p>${(r.tags || []).slice(0, 4).map((t) => html`<span class="tag">${t}</span>`)}</div></div>
    ${r.source?.url ? html`<p class="small muted">Source: <a href="${r.source.url}" target="_blank" rel="noopener">${r.source.name || r.source.url}</a></p>` : ''}
    <div class="row" style="margin:12px 0"><span class="grow muted">Servings</span><div class="stepper"><button data-act="recipe-serv" data-id="${id}" data-sv="${Math.max(1, sv - 1)}">−</button><b>${Math.round(sv * 10) / 10}</b><button data-act="recipe-serv" data-id="${id}" data-sv="${sv + 1}">+</button></div></div>
    <h2 style="font-size:18px">Ingredients</h2>
    ${groups.map((g) => html`${g.s ? html`<div class="sec">${g.s}</div>` : ''}${g.items.map((i) => { const it = ctx.catalog[i.item]; return html`<div class="ing"><span>${it?.name || i.item}${i.note ? html`<span class="muted">, ${i.note}</span>` : ''}</span><b>${f === 1 && i.disp ? i.disp + ' · ' : ''}${L.fmtQty(i.qty * f, it)}</b></div>`; })}`)}
    <h2 style="font-size:18px;margin-top:18px">Steps</h2>
    ${r.steps.length ? r.steps.map((s, n) => html`<div class="step"><i>${n + 1}</i><div>${s.title ? html`<b>${s.title}</b><br>` : ''}${s.text}${s.added ? html`<div class="added">added by Mealy – typical, not from the source</div>` : ''}${s.timer_min ? html`<span class="t">⏱ ${s.timer_min} min</span>` : ''}</div></div>`) : html`<p class="muted small">No steps saved yet.</p>`}
    <div class="gap"></div>
    <div class="row"><button class="btn grow" data-act="plan-recipe" data-id="${id}">Add to plan</button><button class="btn ghost" data-act="share-recipe" data-id="${id}" data-sv="${sv}">Share</button></div>
    ${r.mine ? html`<div class="gap"></div><button class="btn danger block small" data-act="del-recipe" data-id="${id}">Delete recipe</button>` : ''}`);
}

function openEntry(id) {
  const ctx = lookups(), e = sec(D, 'plan')[id];
  if (!e || e.d) return closeSheet();
  const r = ctx.recipes[e.recipeId], n = names();
  sheet(html`
    <div class="hero"><div class="tile" style="--h:${hue(e.recipeId)}">${r?.emoji || '🍽️'}</div><div><h2>${r?.title || 'Unknown recipe'}</h2><p class="muted small">${L.prettyDate(e.date)} · ${L.SLOT_LABEL[e.slot]}</p></div></div>
    <label class="lbl">For</label>
    <div class="seg">${['both', 'a', 'b'].map((w) => html`<button class="${e.who === w ? 'on' : ''}" data-act="entry-who" data-id="${id}" data-who="${w}"><i class="dot ${w}"></i>${w === 'both' ? 'Both' : w === 'a' ? n.a : n.b}</button>`)}</div>
    <label class="lbl">Servings</label>
    <div class="stepper"><button data-act="entry-serv" data-id="${id}" data-d="-1">−</button><b>${e.servings}</b><button data-act="entry-serv" data-id="${id}" data-d="1">+</button></div>
    <div class="gap"></div><div class="gap"></div>
    <div class="row">${r ? html`<button class="btn grow" data-act="open-recipe" data-id="${e.recipeId}">View recipe</button>` : ''}<button class="btn ghost grow" data-act="entry-skip" data-id="${id}">${e.skip ? 'Cook it after all' : 'Not cooking / eating out'}</button></div>
    <div class="gap"></div><button class="btn danger block small" data-act="entry-del" data-id="${id}">Remove from plan</button>`);
}

function openPicker(recipeId, preset = {}) {
  const ctx = lookups(), r = ctx.recipes[recipeId];
  if (!r) return;
  const slot = preset.slot || r.slots?.[r.slots.length - 1] || 'dinner';
  pick = { recipeId, date: preset.date || (ui.week === L.weekStart(L.todayISO()) ? L.todayISO() : ui.week), slot, who: 'both', servings: r.servings };
  renderPicker();
}
function renderPicker() {
  const ctx = lookups(), r = ctx.recipes[pick.recipeId], n = names(), t = L.todayISO();
  const dates = Array.from({ length: 28 }, (_, i) => L.addDays(t, i));
  if (!dates.includes(pick.date)) dates.unshift(pick.date);
  sheet(html`
    <div class="hero"><div class="tile" style="--h:${hue(r.id)}">${r.emoji || '🍽️'}</div><div><h2>${r.title}</h2><p class="muted small">Add to your plan</p></div></div>
    <label class="lbl">Day</label>
    <select class="field" data-change="pick-date">${dates.map((d) => html`<option value="${d}" ${d === pick.date ? 'selected' : ''}>${L.prettyDate(d)}${d === t ? ' (today)' : ''}</option>`)}</select>
    <label class="lbl">Meal</label>
    <div class="seg">${L.SLOTS.map((s) => html`<button class="${pick.slot === s ? 'on' : ''}" data-act="pick-slot" data-slot="${s}">${L.SLOT_ICON[s]} ${L.SLOT_LABEL[s]}</button>`)}</div>
    <label class="lbl">For</label>
    <div class="seg">${['both', 'a', 'b'].map((w) => html`<button class="${pick.who === w ? 'on' : ''}" data-act="pick-who" data-who="${w}"><i class="dot ${w}"></i>${w === 'both' ? 'Both' : w === 'a' ? n.a : n.b}</button>`)}</div>
    <label class="lbl">Servings</label>
    <div class="stepper"><button data-act="pick-serv" data-d="-1">−</button><b>${pick.servings}</b><button data-act="pick-serv" data-d="1">+</button></div>
    <div class="gap"></div><div class="gap"></div>
    <button class="btn block" data-act="pick-add">Add to ${L.prettyDate(pick.date)}</button>`);
}

function openAdd(date, slot) {
  addCtx = { date, slot };
  sheet(html`<h2>Add a meal</h2><p class="muted small">${L.prettyDate(date)} · ${L.SLOT_LABEL[slot]}</p>
    <div class="search" style="margin-top:10px"><input class="field" id="addq" data-input="addsearch" placeholder="Search: chicken, koshari, pancakes…" autocomplete="off" enterkeyhint="search"></div>
    <div class="list-pick" id="addlist">${recipeCards(search(lookups(), '', slot), 'pick-recipe')}</div>`);
  setTimeout(() => $('#addq')?.focus(), 250);
}

function openItem(itemId) {
  const ctx = lookups(), list = currentList(ctx), r = list.rows.find((x) => x.id === itemId);
  if (!r) return closeSheet();
  const it = r.item, chain = [...new Set([it.store, it.alt, ...L.STORE_ORDER].filter(Boolean))];
  const canMove = r.section !== 'home' && chain.indexOf(r.store) < chain.length - 1;
  sheet(html`
    <h2>${it.name}</h2>
    <p class="muted small">Pack: ${it.packLabel || '1 pack'}${it.price ? ' · about ' + L.fmtEuro(it.price) : ''} · ${L.STORES[r.store]}</p>
    <div class="gap"></div>
    <div class="ing"><span>Needed</span><b>${L.fmtQty(r.need, it)}</b></div>
    <div class="ing"><span>At home (estimate)</span><b>${L.fmtQty(r.have, it)}</b></div>
    ${r.section !== 'home' ? html`<div class="ing"><span>Packs to buy</span><b>${r.packsNeeded}</b></div>` : ''}
    <div class="sec">Used in</div>
    ${r.uses.map((u) => html`<div class="ing"><span>${u.title} <span class="muted">· ${L.prettyDate(u.date)}</span></span><b>${L.fmtQty(u.qty, it)}</b></div>`)}
    ${r.section !== 'home' && r.section !== 'skip' ? html`<div class="row" style="margin-top:14px"><span class="grow">Packs bought</span><div class="stepper"><button data-act="item-packs" data-id="${itemId}" data-d="-1">−</button><b>${r.packsBought}</b><button data-act="item-packs" data-id="${itemId}" data-d="1">+</button></div></div>` : ''}
    <div class="gap"></div>
    ${r.section === 'home' ? html`<button class="btn block" data-act="item-out" data-id="${itemId}">I'm out of it – add to list</button>` : ''}
    ${r.section !== 'home' && r.section !== 'skip' ? html`<button class="btn ghost block" data-act="item-have" data-id="${itemId}">I already have enough at home</button><div class="gap"></div>` : ''}
    ${canMove ? html`<button class="btn ghost block" data-act="item-missing" data-id="${itemId}">Couldn't find it at ${L.STORES[r.store]}</button><div class="gap"></div>` : ''}
    ${r.markState === 'missing' ? html`<button class="btn ghost block" data-act="item-unmark" data-id="${itemId}">Back to ${L.STORES[it.store]}</button><div class="gap"></div>` : ''}
    ${r.section === 'skip' ? html`<button class="btn block" data-act="item-unmark" data-id="${itemId}">Put back on the list</button>` : html`<button class="btn plain block" data-act="item-skip" data-id="${itemId}">Skip this item</button>`}`);
}

function openRepeat(week) {
  const cur = L.weekStart(L.todayISO());
  const opts = [[cur, 'This week'], [L.addDays(cur, 7), 'Next week'], [L.addDays(cur, 14), 'In 2 weeks']];
  sheet(html`<h2>Repeat this week</h2><p class="muted small">Copies all meals from ${L.prettyRange(week)} into:</p><div class="gap"></div>
    ${opts.map(([w, l]) => html`<button class="btn ghost block" style="margin-bottom:10px" data-act="do-repeat" data-src="${week}" data-dst="${w}">${l} <span class="muted small">(${L.prettyRange(w)})</span></button>`)}
    <p class="small muted">Meals are added next to anything already planned.</p>`);
}

function openNewRecipe() {
  const ctx = lookups();
  sheet(html`<h2>New recipe</h2>
    <label class="lbl">Name</label><input class="field" id="nr-title" placeholder="e.g. Rice pudding">
    <div class="row"><div class="grow"><label class="lbl">Emoji</label><input class="field" id="nr-emoji" value="🍽️" maxlength="4"></div><div class="grow"><label class="lbl">Serves</label><input class="field" id="nr-serv" type="number" inputmode="numeric" value="4" min="1"></div><div class="grow"><label class="lbl">Minutes</label><input class="field" id="nr-time" type="number" inputmode="numeric" value="30" min="0"></div></div>
    <label class="lbl">Good for</label><div class="chips" id="nr-slots">${L.SLOTS.map((s) => html`<button type="button" class="chip" data-act="nr-slot" data-slot="${s}">${L.SLOT_LABEL[s]}</button>`)}</div>
    <label class="lbl">Ingredients</label>
    <datalist id="nr-dl">${Object.values(ctx.catalog).map((c) => html`<option value="${c.name}"></option>`)}</datalist>
    <div id="nr-ings"></div><button class="btn ghost small" data-act="nr-addrow">＋ Ingredient</button>
    <label class="lbl">Steps (one per line)</label><textarea class="field" id="nr-steps" rows="6" placeholder="Chop the onions&#10;Fry until golden…"></textarea>
    <div class="gap"></div><button class="btn block" data-act="nr-save">Save recipe</button>`);
  nrRow(); nrRow(); nrRow();
}
function nrRow() {
  const d = document.createElement('div');
  d.className = 'irow';
  d.innerHTML = `<input class="field" list="nr-dl" placeholder="Ingredient" data-input="nr-name" autocomplete="off"><input class="field" type="number" inputmode="decimal" step="any" placeholder="Qty"><select class="field"><option>g</option><option>ml</option><option>pcs</option></select><button type="button" data-act="nr-delrow" aria-label="Remove">✕</button>`;
  $('#nr-ings').appendChild(d);
}

function openSettings() {
  const n = names(), c = store.cfg, st = store.status;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const stText = { local: 'Not connected – data stays on this phone only.', synced: 'All changes are saved to GitHub.', syncing: 'Syncing…', pending: 'Saving…', offline: "Offline – changes are kept and will sync when you're back online.", auth: 'GitHub rejected the token. Reconnect below.', error: 'Sync problem – will retry.' }[st] || st;
  sheet(html`<h2>Settings</h2>
    <label class="lbl">Names</label>
    <div class="row"><input class="field" id="name-a" value="${n.a}" data-change="names"><input class="field" id="name-b" value="${n.b}" data-change="names"></div>
    <label class="lbl">Sync</label>
    <p class="small muted">${stText}</p>
    ${store.connected ? html`
      <p class="small" style="margin:8px 0">Connected to <b>${c.owner}/${c.repo}</b></p>
      <div class="row"><button class="btn ghost small grow" data-act="sync-now">Sync now</button><button class="btn ghost small grow" data-act="invite">Invite link for ${n.b}</button></div>
      <p class="tiny muted" style="margin-top:6px">The invite link contains the access key – only send it to ${n.b}.</p>
      <div class="gap"></div><button class="btn plain small" data-act="disconnect">Disconnect this phone</button>`
      : html`
      <input class="field" id="tok" placeholder="GitHub token (github_pat_…)" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin:8px 0">
      <details><summary class="small muted">Repository (advanced)</summary><div class="row" style="margin-top:6px"><input class="field" id="own" value="${c.owner}"><input class="field" id="rep" value="${c.repo}"></div></details>
      <div class="gap"></div><button class="btn block" data-act="connect">Connect</button>
      <p class="tiny muted" style="margin-top:8px">Create the token on GitHub: Settings → Developer settings → Fine-grained tokens. Repository: only <b>${c.repo}</b>. Permission: Contents → Read and write.</p>`}
    <label class="lbl">Data</label>
    <button class="btn plain small" data-act="backup">Download backup (JSON)</button>
    ${standalone ? '' : html`<div class="banner" style="margin-top:14px;background:var(--brand-soft)">📲<div class="small">Open this page in Safari, tap <b>Share</b> → <b>Add to Home Screen</b> to use Mealy like an app.</div></div>`}
    <p class="tiny muted" style="margin-top:16px;text-align:center">Mealy v1 · prices are rough Aldi Süd estimates</p>`);
}

// ---------- actions ----------
const A = {
  tab(el) { ui.tab = el.dataset.tab; if (ui.tab === 'shop' && !ui.listFromSet) { ui.listFrom = defaultListFrom(); ui.listFromSet = true; } closeSheet(); render(false); window.scrollTo(0, 0); },
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
    toast(`Added to ${L.prettyDate(pick.date)} · ${L.SLOT_LABEL[pick.slot]}`);
    ui.week = L.weekStart(pick.date);
    closeSheet(); if (ui.tab !== 'plan' && ui.tab !== 'history' && ui.tab !== 'recipes') ui.tab = 'plan'; render(false);
  },
  'entry-who': (el) => { store.put(D, 'plan', el.dataset.id, { who: el.dataset.who }); openEntry(el.dataset.id); render(); },
  'entry-serv': (el) => { const e = sec(D, 'plan')[el.dataset.id]; store.put(D, 'plan', e.id, { servings: Math.max(1, (e.servings || 1) + Number(el.dataset.d)) }); openEntry(e.id); render(); },
  'entry-skip': (el) => { const e = sec(D, 'plan')[el.dataset.id]; store.put(D, 'plan', e.id, { skip: !e.skip }); closeSheet(); render(); },
  'entry-del': (el) => { store.del(D, 'plan', el.dataset.id); closeSheet(); render(); toast('Removed'); },
  'new-recipe': () => openNewRecipe(),
  'nr-addrow': () => nrRow(),
  'nr-delrow': (el) => el.parentElement.remove(),
  'nr-slot': (el) => el.classList.toggle('on'),
  'nr-save': () => {
    const ctx = lookups();
    const title = $('#nr-title').value.trim();
    if (!title) return toast('Give the recipe a name');
    const rows = $$('#nr-ings .irow').map((r) => ({ name: r.children[0].value.trim(), qty: parseFloat(r.children[1].value), unit: r.children[2].value })).filter((x) => x.name && x.qty > 0);
    if (!rows.length) return toast('Add at least one ingredient with a quantity');
    const byName = Object.fromEntries(Object.values(ctx.catalog).map((c) => [L.norm(c.name), c]));
    const ingredients = rows.map((x) => {
      let c = byName[L.norm(x.name)];
      if (!c) {
        const id = 'u-' + slug(x.name);
        c = { id, name: x.name, unit: x.unit, pack: x.unit === 'pcs' ? 1 : 500, packLabel: x.unit === 'pcs' ? '1 pc' : `500 ${x.unit}`, price: 0, store: 'aldi', aisle: 'Other', ...(x.unit === 'pcs' ? { label: 'pcs' } : {}) };
        store.put(R, 'catalog', id, c); byName[L.norm(x.name)] = c;
      }
      return { item: c.id, qty: x.qty };
    });
    const steps = $('#nr-steps').value.split('\n').map((s) => s.trim()).filter(Boolean).map((text) => ({ text }));
    const id = `${slug(title)}-${L.newId().slice(0, 3)}`;
    store.put(R, 'recipes', id, { title, emoji: $('#nr-emoji').value.trim() || '🍽️', servings: Math.max(1, parseInt($('#nr-serv').value) || 4), time: parseInt($('#nr-time').value) || 0, slots: $$('#nr-slots .chip.on').map((c) => c.dataset.slot), tags: [], ingredients, steps });
    closeSheet(); ui.tag = 'mine'; ui.q = ''; render(); toast('Recipe saved');
  },
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
    closeSheet(); render(); toast('Moved to "at home"');
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
  async connect() {
    const token = $('#tok').value.trim(), owner = ($('#own')?.value || '').trim(), repo = ($('#rep')?.value || '').trim();
    if (!token) return toast('Paste the token first');
    try { toast('Checking…'); await store.test(token, owner, repo); store.setConfig({ token, owner, repo }); closeSheet(); toast('Connected ✓'); }
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
  rsearch(el) { ui.q = el.value; $('#rlist').innerHTML = recipeCards(search(lookups(), ui.q, ui.tag)).s; },
  addsearch(el) { $('#addlist').innerHTML = recipeCards(search(lookups(), el.value, el.value ? '' : addCtx?.slot || ''), 'pick-recipe').s; },
  'nr-name'(el) {
    const c = Object.values(lookups().catalog).find((x) => L.norm(x.name) === L.norm(el.value));
    const sel = el.parentElement.children[2];
    if (c) { sel.value = c.unit; sel.disabled = true; } else sel.disabled = false;
  },
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
    $('#view').innerHTML = '<div class="empty"><b>📡</b>Could not load the recipe library.<br>Check your connection and reload.</div>';
    return;
  }
  if (location.hash.includes('setup=')) {
    if (store.applyInvite(location.hash)) toast('Connected – syncing…');
    history.replaceState(null, '', location.pathname + location.search);
  }
  showStatus(store.connected ? 'syncing' : 'local');
  render(false);
  requestAnimationFrame(() => { const t = $('.day.today'); if (ui.tab === 'plan' && t) window.scrollTo(0, Math.max(0, t.offsetTop - 64)); });
  store.startPolling();
  store.sync();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
