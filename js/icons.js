// Hairline icons, 24x24 grid, drawn with strokes only so they inherit the gold hairline look.
const P = {
  chicken: '<path d="M7.5 11.2c0-2.6 1.9-4.2 4.6-4.2h.9c3 0 5.2 1.9 5.2 5 0 3.8-2.8 6.6-6.8 6.6-2.6 0-3.9-2.1-3.9-4.3v-3.1Z"/><circle cx="7" cy="6.5" r="2.1"/><path d="M4.9 6.2 3 6.9l1.9.8M6.3 4.4c.2-1 1.2-1 1.4 0 .3-.9 1.2-.7 1.2.2M16.8 9.6c.9-1.6 2-2.5 3.6-2.8M10.5 18.6v2.6M13.5 18.6v2.6"/>',
  beef: '<path d="M8.5 8.5h7l1 5.5c0 2.8-1.8 4.7-4.5 4.7S7.5 16.8 7.5 14l1-5.5ZM8.5 8.5C8 6 6.2 4.8 4.5 5M15.5 8.5C16 6 17.8 4.8 19.5 5M7.8 11.5 3.5 10.5l1.6 3.2 3 .3M16.2 11.5l4.3-1-1.6 3.2-3 .3"/><ellipse cx="12" cy="16" rx="2.6" ry="1.7"/>',
  fish: '<path d="M3 12c2.9-4.3 7.2-5.5 11-3.5L19.5 6v12L14 15.5C10.2 17.5 5.9 16.3 3 12Z"/><circle cx="7.8" cy="11.3" r=".5"/>',
  egg: '<path d="M12 3.5c3.4 0 6 4.9 6 9a6 6 0 0 1-12 0c0-4.1 2.6-9 6-9Z"/>',
  veg: '<path d="M4.5 19.5C4 11 9 5 19.5 4.5 19 14 13 19.5 4.5 19.5ZM4.5 19.5 14 10"/>',
  dairy: '<path d="M10 3h4v3l2 3v10a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19V9l2-3V3ZM8 12.5h8"/>',
  grain: '<path d="M12 21.5V8M12 7C10.8 5.9 10.8 3.4 12 2.2c1.2 1.2 1.2 3.7 0 4.8ZM12 11c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM12 11c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4ZM12 16c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM12 16c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;
