import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';

const rawCat = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url)));
const rawRec = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url)));
const catalog = L.normalizeCatalog(rawCat);
const recipes = Object.fromEntries(rawRec.map((r) => [r.id, L.normalizeRecipe(r)]));

const W1 = '2026-11-09'; // Monday
const W2 = '2026-11-16';
const mk = (entries) => Object.fromEntries(entries.map((e, i) => [`e${i}`, { id: `e${i}`, u: 1, ...e }]));
const buy = (id, itemId, qty, date, list = '', kind = 'buy') => ({ id, itemId, qty, date, list, kind, u: 1 });
const rowOf = (list, id) => list.rows.find((r) => r.id === id);

test('library: every ingredient exists in the catalog, ids unique', () => {
  const ids = new Set();
  for (const r of rawRec) {
    assert.ok(!ids.has(r.id), 'dup ' + r.id); ids.add(r.id);
    assert.ok(r.title && r.steps.length >= 3, r.id + ' needs title/steps');
    for (const [item, qty] of r.ing) { assert.ok(catalog[item], `${r.id}: unknown item ${item}`); assert.ok(qty > 0, `${r.id}: bad qty for ${item}`); }
  }
  for (const c of Object.values(catalog)) {
    assert.ok(['g', 'ml', 'pcs'].includes(c.unit), c.id);
    assert.ok(c.pack > 0 && c.price >= 0, c.id);
    assert.ok(L.STORE_ORDER.includes(c.store), c.id);
    if (c.alt) assert.ok(L.STORE_ORDER.includes(c.alt), c.id);
    assert.ok(L.AISLES.includes(c.aisle), c.id + ' aisle ' + c.aisle);
  }
});

test('dates', () => {
  assert.equal(L.weekStart('2026-11-15'), '2026-11-09');
  assert.equal(L.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(L.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(L.isoWeek('2026-11-09'), 46);
});

test('basic list: rice for koshari needs 1 pack, scaled by servings', () => {
  const plan = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'koshari', servings: 4 }]);
  const l = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-08' });
  const rice = rowOf(l, 'rice');
  assert.equal(rice.need, 250);
  assert.equal(rice.packsNeeded, 1);
  assert.equal(rice.section, 'buy');
  const plan2 = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'koshari', servings: 2 }]);
  const l2 = L.buildList({ plan: plan2, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(rowOf(l2, 'rice').need, 125);
});

test('merging across meals and weeks: one pack covers two meals', () => {
  const plan = mk([
    { date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' },
    { date: '2026-11-12', slot: 'dinner', recipeId: 'roz-shaareya' },
    { date: '2026-11-18', slot: 'dinner', recipeId: 'molokhia-chicken' },
  ]);
  const one = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, weeks: 1, today: '2026-11-08' });
  assert.equal(rowOf(one, 'rice').need, 550);
  assert.equal(rowOf(one, 'rice').packsNeeded, 1);
  const two = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, weeks: 2, today: '2026-11-08' });
  assert.equal(rowOf(two, 'rice').need, 850);
  assert.equal(rowOf(two, 'rice').packsNeeded, 1);
});

test('ticking = purchase tagged for the list; row stays done', () => {
  const plan = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' }]);
  const purchases = { b1: buy('b1', 'rice', 1000, '2026-11-09', W1) };
  const l = L.buildList({ plan, purchases, marks: {}, recipes, catalog, from: W1, today: '2026-11-09' });
  const r = rowOf(l, 'rice');
  assert.equal(r.done, true); assert.equal(r.packsBought, 1); assert.equal(r.section, 'buy');
});

test('pantry: leftover rice from last week shows as "home" next week', () => {
  const plan = mk([
    { date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' },        // 250 g rice
    { date: '2026-11-17', slot: 'dinner', recipeId: 'roz-shaareya' },   // 300 g rice
  ]);
  const purchases = { b1: buy('b1', 'rice', 1000, '2026-11-09', W1) };
  const l2 = L.buildList({ plan, purchases, marks: {}, recipes, catalog, from: W2, today: '2026-11-13' });
  const r = rowOf(l2, 'rice');
  assert.equal(r.section, 'home');
  assert.equal(Math.round(r.have), 750);
  assert.equal(r.packsNeeded, 0);
});

test('pantry: not enough leftover -> buy only the remainder (as packs)', () => {
  const plan = mk([
    { date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' },        // 250
    { date: '2026-11-17', slot: 'dinner', recipeId: 'molokhia-chicken' }, // 300
    { date: '2026-11-18', slot: 'dinner', recipeId: 'fattah' },          // 300
    { date: '2026-11-19', slot: 'dinner', recipeId: 'bamya' },           // 250
  ]);
  const purchases = { b1: buy('b1', 'rice', 1000, '2026-11-09', W1) };
  const l2 = L.buildList({ plan, purchases, marks: {}, recipes, catalog, from: W2, today: '2026-11-13' });
  const r = rowOf(l2, 'rice');
  assert.equal(Math.round(r.have), 750);
  assert.equal(r.need, 850);
  assert.equal(Math.round(r.toBuy), 100);
  assert.equal(r.packsNeeded, 1);
  assert.equal(r.section, 'buy');
});

test('"I ran out" overrides stock', () => {
  const plan = mk([
    { date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' },
    { date: '2026-11-17', slot: 'dinner', recipeId: 'roz-shaareya' },
  ]);
  const purchases = { b1: buy('b1', 'rice', 1000, '2026-11-09', W1), z: buy('z', 'rice', 0, '2026-11-14', '', 'zero') };
  const l2 = L.buildList({ plan, purchases, marks: {}, recipes, catalog, from: W2, today: '2026-11-14' });
  assert.equal(rowOf(l2, 'rice').section, 'buy');
  assert.equal(rowOf(l2, 'rice').packsNeeded, 1);
});

test('past meals of the current week are not shopped for, but still use stock', () => {
  const plan = mk([
    { date: '2026-11-09', slot: 'dinner', recipeId: 'koshari' },   // past (today is Wed)
    { date: '2026-11-13', slot: 'dinner', recipeId: 'roz-shaareya' },
  ]);
  const l = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-11' });
  assert.equal(rowOf(l, 'rice').need, 300);
  assert.equal(rowOf(l, 'macaroni'), undefined);
});

test('skipped meals do not need groceries', () => {
  const plan = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'koshari', skip: true }]);
  const l = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(l.rows.length, 0);
});

test('staples go to their own section; "not found" moves store; skip hides', () => {
  const plan = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'molokhia-chicken' }]);
  let l = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(rowOf(l, 'salt').section, 'staple');
  assert.equal(rowOf(l, 'molokhia_frozen').store, 'arab');
  const marks = { m1: { id: 'm1', list: W1, itemId: 'cumin', state: 'missing', at: 'aldi', u: 1 } };
  const plan2 = mk([{ date: '2026-11-10', slot: 'dinner', recipeId: 'koshari' }]);
  l = L.buildList({ plan: plan2, purchases: {}, marks, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(rowOf(l, 'cumin').store, 'arab');
  assert.equal(rowOf(l, 'cumin').movedFrom, 'aldi');
  const marks2 = { m1: { id: 'm1', list: W1, itemId: 'cumin', state: 'skip', u: 1 } };
  l = L.buildList({ plan: plan2, purchases: {}, marks: marks2, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(rowOf(l, 'cumin').section, 'skip');
});

test('deleted (tombstoned) entries are ignored', () => {
  const plan = { e: { id: 'e', date: '2026-11-10', slot: 'dinner', recipeId: 'koshari', u: 5, d: 1 } };
  const l = L.buildList({ plan, purchases: {}, marks: {}, recipes, catalog, from: W1, today: '2026-11-08' });
  assert.equal(l.rows.length, 0);
});

test('merge: newest wins, tombstones win when newer, union of ids', () => {
  const a = { plan: { x: { id: 'x', v: 'local', u: 5 }, y: { id: 'y', u: 1 } } };
  const b = { plan: { x: { id: 'x', v: 'remote', u: 3 }, z: { id: 'z', u: 2 }, y: { id: 'y', d: 1, u: 4 } } };
  const m = L.mergeSections(a, b);
  assert.equal(m.plan.x.v, 'local');
  assert.equal(m.plan.y.d, 1);
  assert.ok(m.plan.z);
  assert.ok(L.sameSections(L.mergeSections(m, b), L.mergeSections(m, a)));
});

test('search: "chicken" finds chicken dishes first; Arabic and aka work', () => {
  const list = Object.values(recipes);
  const names = L.searchRecipes(list, catalog, 'chicken').map((r) => r.id);
  assert.ok(names.includes('chicken-alfredo') && names.includes('chicken-parmesan') && names.includes('molokhia-chicken'));
  assert.ok(names.indexOf('chicken-alfredo') < names.indexOf('molokhia-chicken'));
  assert.equal(L.searchRecipes(list, catalog, 'كشري')[0].id, 'koshari');
  assert.equal(L.searchRecipes(list, catalog, 'kushari')[0].id, 'koshari');
  assert.equal(L.searchRecipes(list, catalog, 'bechamel')[0].id, 'macarona-bechamel');
  assert.ok(L.searchRecipes(list, catalog, '', { tag: 'breakfast' }).every((r) => r.slots.includes('breakfast') || r.tags.includes('breakfast')));
});

test('format', () => {
  assert.equal(L.fmtQty(1500, catalog.rice), '1.5 kg');
  assert.equal(L.fmtQty(311, catalog.butter), '311 g');
  assert.equal(L.fmtQty(2, catalog.onion), '2 onions');
  assert.equal(L.fmtQty(1, catalog.chickpeas_can), '1 can');
  assert.equal(L.fmtQty(1, catalog.parsley), '1 bunch');
  assert.equal(L.fmtQty(1, catalog.onion), '1 onion');
  assert.equal(L.fmtQty(0.5, catalog.parsley), '0.5 bunches');
  assert.equal(L.fmtEuro(3.5), '€3,50');
});

test('meal traits', async () => {
  const fs = await import('node:fs');
  const cat = L.normalizeCatalog(JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url))));
  const recipes = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url))).map(L.normalizeRecipe).map((r) => [r.id, r]));
  const tr = (id) => L.mealTraits(recipes[id]);
  assert.ok(tr('chicken-alfredo').includes('chicken') && tr('chicken-alfredo').includes('dairy') && !tr('chicken-alfredo').includes('beef'));
  assert.ok(tr('kofta-potatoes').includes('beef') && tr('kofta-potatoes').includes('veg'));
  assert.ok(tr('salmon-potatoes').includes('fish'));
  assert.ok(tr('koshari').includes('veg') && !tr('koshari').includes('chicken'));
  assert.ok(tr('pancakes').includes('egg') && tr('pancakes').includes('veg'));
  for (const r of Object.values(recipes)) assert.ok(L.mealTraits(r).length <= 4);
});
