# Mealy – plan (v0)

## Users
Mostafa + Menna. Personal use only, phones (iPhone Safari, added to Home Screen). English UI for now.

## Architecture (no servers, no paid services)
- **App**: static PWA in this repo, hosted on GitHub Pages (`ghazawy123.github.io/Mealy`). Repo is public, contains code + built-in recipe library only. No personal data.
- **Data**: private repo `Mealy-data`, JSON files, read/written from the browser via the GitHub REST API with a fine-grained token (Contents: read/write, only `Mealy-data`).
- **Setup link**: Mostafa's phone generates a link with the token in the URL fragment; sent to Menna via WhatsApp; one tap connects her phone. No GitHub account needed for her.
- **Offline**: service worker caches the app; checklist changes queue locally and sync when back online.

## Features
1. Week grid: 7 days x breakfast/lunch/dinner, each slot tagged Both / Mostafa / Menna.
2. Recipe search-as-you-type (local), recipe view with ingredients + steps.
3. Meal card in the grid (photo + name).
4. Merged grocery list across one or more planned weeks.
5. Store tagging per ingredient: Aldi Süd (default, Munich) -> Edeka -> Arab/Turkish market.
6. In-app shopping checklist: Bought / Couldn't find / Skip, synced between phones.
7. Pantry memory: bought items show as optional ("bought N days ago") in later lists.
8. History: past weeks, repeat a meal/week.
9. Share list to WhatsApp (text) as backup.
10. Rough Aldi Süd price estimates (static table, not live).

## Recipes
- Built-in library (Egyptian/Arab focus + everyday European), structured JSON.
- Own recipes: add in app, or import from a URL / pasted text via Claude (see below).
- Imported/own recipes are stored in `Mealy-data/recipes/`.

## Recipe import
Sites are read by Claude in a session (when the site allows it) or pasted/screenshotted by the user. Claude converts to the app format (metric units, catalog item ids, store tags) and commits to `Mealy-data/recipes.json`. Sites that block bots (e.g. Tasty) -> paste text.

## Pantry model
Append-only purchase ledger. Stock before a list = earlier purchases minus planned usage. Ticking an item records a purchase tagged with the list's week; leftovers show as "probably still at home" in later lists.
