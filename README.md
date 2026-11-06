# Mealy

Personal meal planner for Mostafa & Menna: weekly plan (breakfast/lunch/dinner per person), recipe search (Egyptian/Arab focus), one combined grocery list with pantry memory, in-store checklist, history, WhatsApp share.

- App: static PWA, hosted on GitHub Pages. No build step, no server.
- Data: private repo `Mealy-data` (plan, purchases, custom recipes), synced from the browser with a fine-grained token.
- Recipe library: `data/recipes.json`, ingredient catalog + Aldi Süd price estimates: `data/catalog.json`.
- Tests: `node --test tests/logic.test.mjs`

See `docs/PLAN.md`.
