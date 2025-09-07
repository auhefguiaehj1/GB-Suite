// GBSuite - Tag Autocomplete Helper (scrollable, scroll-safe)
// Load this BEFORE modules that want to use it.
(function () {
  const NS = (window.GBSuite = window.GBSuite || {});
  if (NS.tagAutocomplete) return;

  const API_PATH = '/index.php?page=dapi&s=tag&q=index';
  const CACHE_TTL = 60_000;
  const DEFAULT_LIMIT = 12;
  const DEFAULT_MIN_CHARS = 2;
  const SCROLL_MAX_VH = 45;

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const escapeHtml = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmtCount = (n) => { n = +n || 0; if (n >= 1e6) return Math.round(n / 1e5) / 10 + 'm'; if (n >= 1e4) return Math.round(n / 1e3) + 'k'; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return String(n); };
  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // styles (once)
  (function addStyles() {
    if (document.getElementById('gb-ac-style')) return;
    const s = document.createElement('style'); s.id = 'gb-ac-style';
    s.textContent = `
      .gb-ac{ position:fixed; z-index:100003; min-width:260px; max-width:min(520px,95vw);
        background: var(--gb-panel-bg,#1d1f28); color: var(--gb-text,#fff);
        border:1px solid var(--gb-border,#2e3140); border-radius:8px;
        box-shadow:0 10px 30px rgba(0,0,0,.35); overflow:auto; max-height:${SCROLL_MAX_VH}vh;
        overscroll-behavior: contain; pointer-events:auto; /* locks Scrolling out of Modal */ }
      .gb-ac-list{ list-style:none; margin:0; padding:4px 0; }
      .gb-ac-item{ display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:8px 12px; cursor:pointer; font:13px system-ui,sans-serif; }
      .gb-ac-item:hover, .gb-ac-item.active{ background: var(--gb-bg-muted,#2a2e3d); }
      .gb-ac-name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .gb-ac-count{ opacity:.75; font-variant-numeric: tabular-nums; }
    `;
    document.head.appendChild(s);
  })();

  // dropdown (single)
  let DD, DD_LIST, TARGET = null, ITEMS = [], IDX = -1, CLEANUPS = [];
  function ensureDropdown() {
    if (DD) return;
    DD = el('div', 'gb-ac'); DD.style.display = 'none';
    DD_LIST = el('ul', 'gb-ac-list'); DD.appendChild(DD_LIST);
    document.body.appendChild(DD);

    DD.addEventListener('wheel', (e) => {
      const canUp = DD.scrollTop > 0;
      const canDown = DD.scrollTop + DD.clientHeight < DD.scrollHeight;
      if ((e.deltaY < 0 && !canUp) || (e.deltaY > 0 && !canDown)) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });

    DD.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: true });

    const onScroll = (e) => {
      if (!TARGET || DD.style.display === 'none') return;
      const t = e.target;
      const isEl = t && t.nodeType === 1;
      if (isEl && (DD.contains(t) || t.closest?.('.gb-modal') || t.closest?.('.gb-ovl'))) {
        position(TARGET);
        return;
      }
      position(TARGET);
    };
    const onResize = () => { if (TARGET) position(TARGET); };

    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    CLEANUPS.push(() => document.removeEventListener('scroll', onScroll, true));
    CLEANUPS.push(() => window.removeEventListener('resize', onResize));
  }
  function position(target) {
    const r = target.getBoundingClientRect();
    DD.style.top = Math.round(r.bottom + 6) + 'px';
    DD.style.left = Math.round(r.left) + 'px';
    DD.style.minWidth = Math.max(260, Math.floor(r.width * 0.75)) + 'px';
  }
  function show() { DD && (DD.style.display = 'block'); }
  function hide() { if (!DD) return; DD.style.display = 'none'; DD_LIST.innerHTML = ''; ITEMS = []; IDX = -1; TARGET = null; }
  function render(items, info, insert) {
    DD_LIST.innerHTML = ''; ITEMS = []; IDX = -1;
    items.forEach((it, i) => {
      const li = el('li', 'gb-ac-item');
      li.innerHTML = `<span class="gb-ac-name">${escapeHtml(String(it.name || '').replace(/_/g, ' '))}</span><span class="gb-ac-count">${fmtCount(it.count || 0)}</span>`;
      li.addEventListener('mousedown', e => { e.preventDefault(); insert(it, info); });
      DD_LIST.appendChild(li); ITEMS.push(li);
    });
    if (items.length) { IDX = 0; ITEMS[0].classList.add('active'); }
  }
  function move(dir) {
    if (!ITEMS.length) return;
    ITEMS[IDX]?.classList.remove('active');
    IDX = (IDX + dir + ITEMS.length) % ITEMS.length;
    ITEMS[IDX]?.classList.add('active');
    ITEMS[IDX]?.scrollIntoView({ block: 'nearest' });
  }

  // API fetch + cache
  const Cache = new Map();
  async function fetchTags(prefix, limit) {
    const key = prefix.toLowerCase() + '|' + (limit || DEFAULT_LIMIT);
    const cached = Cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.items;

    const u = new URL(API_PATH, location.origin);
    u.searchParams.set('name_pattern', `${prefix}%`);
    u.searchParams.set('limit', String(limit || DEFAULT_LIMIT));
    u.searchParams.set('json', '1');
    u.searchParams.set('orderby', 'count');
    u.searchParams.set('order', 'DESC');

    const set = window.GBSuite?.settings;
    if (set?.ApiKey && set?.ApiUserId) { u.searchParams.set('api_key', set.ApiKey); u.searchParams.set('user_id', set.ApiUserId); }

    try {
      const resp = await fetch(u.toString(), { credentials: 'same-origin', cache: 'no-cache' });
      if (!resp.ok) throw 0;
      let data; try { data = await resp.json(); } catch { data = null; }
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.tag) ? data.tag : []);
      const norm = arr.map(x => { const a = x?.['@attributes'] || x || {}; return { id: +(a.id || x.id) || 0, name: String(a.name || x.name || ''), count: +(a.count || x.count) || 0 }; })
        .filter(t => t.name);
      Cache.set(key, { ts: Date.now(), items: norm });
      return norm;
    } catch { return []; }
  }

  // token helpers
  function getTokenAtCaret(ta) {
    const v = ta.value, pos = ta.selectionStart || 0, isWord = c => /[a-z0-9_]/i.test(c);
    let s = pos, e = pos; while (s > 0 && isWord(v[s - 1])) s--; while (e < v.length && isWord(v[e])) e++; return { token: v.slice(s, e), start: s, end: e, pos };
  }
  const replaceRange = (v, s, e, repl) => v.slice(0, s) + repl + v.slice(e);

  function insertSelection(item, info) {
    if (!TARGET || !item) return;
    const tag = String(item.name || '');
    const next = replaceRange(TARGET.value, info.start, info.end, tag);
    const caret = info.start + tag.length;
    TARGET.value = next; TARGET.setSelectionRange(caret, caret);
    hide(); TARGET.focus();
    TARGET.dispatchEvent(new Event('input', { bubbles: true }));
    TARGET.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // public API
  function bind(textarea, opts = {}) {
    if (!textarea) return () => { };
    const minChars = opts.minChars ?? DEFAULT_MIN_CHARS;
    const limit = opts.limit ?? DEFAULT_LIMIT;

    textarea.setAttribute('autocomplete', 'off');

    const update = debounce(async () => {
      const info = getTokenAtCaret(textarea);
      if (!info.token || info.token.length < minChars) { hide(); return; }
      TARGET = textarea; ensureDropdown(); position(textarea); show();
      const items = await fetchTags(info.token.toLowerCase(), limit);
      render(items, info, insertSelection);
      if (!items.length) hide();
    }, 120);

    const onInput = () => update();
    const onClick = () => update();
    const onKeyNav = (e) => {
      if (TARGET !== textarea || !DD || DD.style.display === 'none') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (!ITEMS.length || IDX < 0) return;
        e.preventDefault();
        const info = getTokenAtCaret(textarea);
        const list = Cache.get((info.token || '').toLowerCase() + '|' + (limit || DEFAULT_LIMIT))?.items || [];
        insertSelection(list[IDX], info);
      } else if (e.key === 'Escape') { hide(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { setTimeout(update, 0); }
    };
    const onBlur = () => setTimeout(hide, 120);

    textarea.addEventListener('input', onInput);
    textarea.addEventListener('click', onClick);
    textarea.addEventListener('keydown', onKeyNav);
    textarea.addEventListener('blur', onBlur);

    return function unbind() {
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('click', onClick);
      textarea.removeEventListener('keydown', onKeyNav);
      textarea.removeEventListener('blur', onBlur);
      hide();
    };
  }

  NS.tagAutocomplete = { bind, fetchTags };
})();
