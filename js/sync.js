// Mealy – storage + GitHub sync.
// Two JSON files in the private data repo: data.json (plan, purchases, marks, settings) and recipes.json (custom recipes + extra ingredients).
// Every file is { v:1, sections: { name: { id: entry } } }; entries carry u (updated ms) and d (deleted flag).
import { mergeSections, purgeTombstones, sameSections, hasEntries } from './logic.js';

const FILES = {
  'data.json': { plan: {}, purchases: {}, marks: {}, settings: {} },
  'recipes.json': { recipes: {}, catalog: {}, inbox: {} },
};
const K_CFG = 'mealy:cfg';
const K_FILE = (f) => `mealy:file:${f}`;
const DEFAULT_CFG = { token: '', owner: 'ghazawy123', repo: 'Mealy-data', branch: 'main' };

const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function createStore({ onChange = () => {}, onStatus = () => {} } = {}) {
  let cfg = { ...DEFAULT_CFG };
  const files = {};
  let status = 'local', pushTimer = null, pollTimer = null, busy = false, again = false, rev = 0;

  try { cfg = { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(K_CFG) || '{}') }; } catch {}
  for (const f of Object.keys(FILES)) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(K_FILE(f)) || 'null'); } catch {}
    files[f] = { sections: { ...structuredClone(FILES[f]), ...(saved?.sections || {}) }, sha: saved?.sha || null, dirty: !!saved?.dirty };
  }

  const persist = (f) => {
    try { localStorage.setItem(K_FILE(f), JSON.stringify(files[f])); } catch (e) { console.warn('persist failed', e); }
  };
  const setStatus = (s, detail = '') => { status = s; onStatus(s, detail); };
  const connected = () => !!cfg.token;
  const online = () => navigator.onLine !== false;

  async function gh(method, path, body, raw = false) {
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}${method === 'GET' ? `?ref=${cfg.branch}` : ''}`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: method === 'GET' ? 'no-cache' : undefined,
    });
  }
  class AuthError extends Error {}

  async function pullFile(f) {
    const res = await gh('GET', f);
    let remote = null, sha = null;
    if (res.status === 404) { /* file does not exist yet */ }
    else if (res.status === 401 || res.status === 403) throw new AuthError(res.status === 403 ? 'Access denied or rate limited' : 'Token rejected');
    else if (!res.ok) throw new Error(`GitHub ${res.status}`);
    else {
      const j = await res.json();
      sha = j.sha;
      let text = j.content ? b64dec(j.content) : '';
      if (!text) { const r2 = await gh('GET', f, null, true); text = await r2.text(); }
      try { remote = JSON.parse(text).sections || {}; } catch { remote = {}; }
    }
    const local = files[f];
    const merged = purgeTombstones(mergeSections(local.sections, remote || {}));
    const changed = !sameSections(merged, local.sections);
    const needsPush = remote === null ? hasEntries(merged) : !sameSections(merged, remote);
    files[f] = { sections: { ...structuredClone(FILES[f]), ...merged }, sha, dirty: local.dirty || needsPush };
    persist(f);
    return changed;
  }

  async function pushFile(f, attempt = 0) {
    const fs = files[f];
    const myRev = rev;
    const body = {
      message: `Mealy sync ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      content: b64enc(JSON.stringify({ v: 1, sections: fs.sections }, null, 1)),
      branch: cfg.branch,
      ...(fs.sha ? { sha: fs.sha } : {}),
    };
    const res = await gh('PUT', f, body);
    if (res.status === 409 || res.status === 422) {
      if (attempt >= 3) throw new Error('Sync conflict – try again');
      await pullFile(f);
      onChange();
      return pushFile(f, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) throw new AuthError('Token rejected');
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const j = await res.json();
    files[f].sha = j.content.sha;
    if (rev === myRev) files[f].dirty = false;
    persist(f);
  }

  async function sync({ pullOnly = false } = {}) {
    if (!connected()) return setStatus('local');
    if (!online()) return setStatus('offline');
    if (busy) { again = true; return; }
    busy = true;
    try {
      setStatus('syncing');
      let changed = false;
      for (const f of Object.keys(FILES)) if (await pullFile(f)) changed = true;
      if (!pullOnly) for (const f of Object.keys(FILES)) if (files[f].dirty) await pushFile(f);
      if (changed) onChange();
      setStatus('synced');
    } catch (e) {
      if (e instanceof AuthError) setStatus('auth', e.message);
      else if (!online() || e instanceof TypeError) setStatus('offline');
      else setStatus('error', e.message);
    } finally {
      busy = false;
      if (again) { again = false; schedulePush(300); }
    }
  }

  function schedulePush(ms = 1500) {
    if (!connected()) return setStatus('local');
    setStatus('pending');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync(), ms);
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && !busy && !Object.values(files).some((x) => x.dirty)) sync({ pullOnly: true }); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
    window.addEventListener('online', () => sync());
    window.addEventListener('offline', () => setStatus('offline'));
  }

  return {
    get status() { return status; },
    get cfg() { return { ...cfg }; },
    get connected() { return connected(); },
    section(f, name) { return files[f].sections[name]; },
    anyDirty() { return Object.values(files).some((x) => x.dirty); },
    put(f, name, id, patch) {
      const sec = files[f].sections[name];
      sec[id] = { ...(sec[id] || {}), ...patch, id, d: undefined, u: Date.now() };
      delete sec[id].d;
      files[f].dirty = true; rev++; persist(f); schedulePush();
      return sec[id];
    },
    del(f, name, id) {
      const sec = files[f].sections[name];
      if (!sec[id]) return;
      sec[id] = { id, d: 1, u: Date.now() };
      files[f].dirty = true; rev++; persist(f); schedulePush();
    },
    setConfig(next) {
      cfg = { ...cfg, ...next };
      localStorage.setItem(K_CFG, JSON.stringify(cfg));
      if (connected()) sync(); else setStatus('local');
    },
    disconnect() { cfg = { ...cfg, token: '' }; localStorage.setItem(K_CFG, JSON.stringify(cfg)); setStatus('local'); },
    sync, startPolling,
    async test(token, owner, repo) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(res.status === 404 ? 'Repo not found (or token has no access to it)' : res.status === 401 ? 'Token rejected' : `GitHub ${res.status}`);
      const j = await res.json();
      if (j.permissions && j.permissions.push === false) throw new Error('Token needs write access (Contents: read and write)');
      return true;
    },
    inviteLink() {
      const payload = btoa(JSON.stringify({ t: cfg.token, o: cfg.owner, r: cfg.repo, b: cfg.branch }));
      return `${location.origin}${location.pathname}#setup=${encodeURIComponent(payload)}`;
    },
    applyInvite(hash) {
      const m = /setup=([^&]+)/.exec(hash || '');
      if (!m) return false;
      try {
        const j = JSON.parse(atob(decodeURIComponent(m[1])));
        if (!j.t) return false;
        this.setConfig({ token: j.t, owner: j.o || DEFAULT_CFG.owner, repo: j.r || DEFAULT_CFG.repo, branch: j.b || 'main' });
        return true;
      } catch { return false; }
    },
  };
}
