(function () {
  // =================== Debug ===================
  let DEBUG = false;
  function dbg(...a){ if (DEBUG) console.log('[GBFav]', ...a); }
  window.GBFavDebug = {
    setDebug(v){ DEBUG = !!v; dbg('DEBUG =', DEBUG); },
    state(){ return { hoverId, mode, userId, haveAddFav: typeof window.addFav, loc: location.href }; }
  };

  // ===== Settings-Tab: nur Filter + Hotkeys =====
  if (window.GBSuite && typeof window.GBSuite.addSettingsTab === 'function') {
    window.GBSuite.addSettingsTab({
      id: 'favorites',
      title: 'Favorites',
      render(container, { settings }) {
        container.innerHTML = `
          <div class="gb-form-row">
            <label>Standard-Filter</label>
            <select id="gb-fav-mode" class="gb-inp" style="width:auto">
              <option value="off"  ${settings.FavMode === 'off' ? 'selected' : ''}>Aus</option>
              <option value="only" ${settings.FavMode === 'only' ? 'selected' : ''}>Nur Favoriten</option>
              <option value="hide" ${settings.FavMode === 'hide' ? 'selected' : ''}>Favoriten ausblenden</option>
            </select>
          </div>
          <div class="gb-form-row">
            <label><input type="checkbox" id="gb-fav-hotkey-hover" ${settings.FavHotkeyHover ? 'checked' : ''}> Hotkeys bei Hover (f / x)</label>
          </div>
          <div class="gb-form-row">
            <label><input type="checkbox" id="gb-fav-hotkey-post" ${settings.FavHotkeyPost ? 'checked' : ''}> Hotkeys in Post-Ansicht (f / x)</label>
          </div>
          <div class="gb-form-row" style="opacity:.7">
            <span>Hotkeys: <b>f</b> = zu Favoriten, <b>x</b> = entfernen</span>
          </div>
        `;
      },
      collect(settings, container) {
        settings.FavMode        = container.querySelector('#gb-fav-mode')?.value || 'off';
        settings.FavHotkeyHover = container.querySelector('#gb-fav-hotkey-hover')?.checked || false;
        settings.FavHotkeyPost  = container.querySelector('#gb-fav-hotkey-post')?.checked || false;
      }
    });
  }

  // ===== Modul =====
  window.GBSuite.register('Favorites', (function () {
    const LS_CACHE = 'gbFavCache';          // { userId, ids:[...], ts }
    const LS_SETTINGS = 'gbSuite.settings'; // Fallback, falls Core.saveSettings fehlt
    const MAX_PAGES   = 200;
    const PAGE_LIMIT  = 100;
    const CACHE_TTL_MS = 10 * 60 * 1000;

    // Runtime
    let favSet = new Set();
    let unsub;
    let mode   = 'off'; // 'off' | 'only' | 'hide'
    let userId = '';
    let apiKey = '';
    let cleanupHandlers = [];

    // Hover-State (explizit geloggt)
    let hoverAnchor = null;
    let hoverId = null;
    let lastLoggedHoverId = undefined;

    // ---------- Helpers ----------
    function saveSettingsSafe() {
      if (window.GBSuite && typeof window.GBSuite.saveSettings === 'function') {
        window.GBSuite.saveSettings();
      } else {
        try {
          const s = window.GBSuite?.settings || {};
          localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
        } catch {}
      }
    }

    function extractIdFromAnchor(a){
      if (!a) return null;
      if (a.id && /^p\d+$/.test(a.id)) return Number(a.id.slice(1));
      try {
        const u = new URL(a.href, location.origin);
        const n = Number(u.searchParams.get('id'));
        if (Number.isFinite(n)) return n;
      } catch {}
      return null;
    }

    function getPostIdFromThumb(node) {
      if (!node) return null;
      const a = node.querySelector('a[id^="p"], a[href*="&id="], a[href*="?id="]');
      return extractIdFromAnchor(a);
    }

    function loadCache() { try { return JSON.parse(localStorage.getItem(LS_CACHE) || '{}'); } catch { return {}; } }
    function saveCache(obj) { localStorage.setItem(LS_CACHE, JSON.stringify(obj)); }
    function cacheValid(c) { return c && Array.isArray(c.ids) && c.userId === userId && (Date.now() - (c.ts || 0) < CACHE_TTL_MS); }

    // Suche-Helper
    function getSearchInput() { return document.querySelector('#tags-search'); }
    function normalizeTokens(str) { return (str || '').trim().split(/\s+/g).filter(Boolean); }
    function setTokens(tokens) {
      const inp = getSearchInput(); if (!inp) return false;
      const next = tokens.join(' ').trim();
      const changed = inp.value !== next;
      inp.value = next;
      return changed;
    }
    function submitSearch() {
      const inp = getSearchInput(); if (!inp) return;
      const form = inp.closest('form');
      if (form) { form.submit(); return; }
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      try {
        const u = new URL(location.href);
        u.searchParams.set('tags', inp.value.trim());
        location.href = u.toString();
      } catch {}
    }
    function addFavTagToSearch(uid) {
      const inp = getSearchInput(); if (!inp) return false;
      const tokens = normalizeTokens(inp.value);
      const needle = `fav:${uid}`;
      if (!tokens.includes(needle)) {
        tokens.push(needle);
        return setTokens(tokens);
      }
      return false;
    }
    function removeFavTagsFromSearch() {
      const inp = getSearchInput(); if (!inp) return false;
      const tokens = normalizeTokens(inp.value);
      const next = tokens.filter(t => !/^fav:\S+$/i.test(t));
      return setTokens(next);
    }

    // ---------- Favoriten laden ----------
    async function fetchFavIdsViaApi() {
      const base = new URL(location.origin + '/index.php');
      base.searchParams.set('page', 'dapi');
      base.searchParams.set('s',    'post');
      base.searchParams.set('q',    'index');
      base.searchParams.set('json', '1');
      base.searchParams.set('limit', String(PAGE_LIMIT));
      base.searchParams.set('tags',  `fav:${userId}`);
      if (apiKey && userId) { base.searchParams.set('api_key', apiKey); base.searchParams.set('user_id', userId); }

      const out = [];
      for (let pid = 0; pid < MAX_PAGES; pid++) {
        base.searchParams.set('pid', String(pid));
        const resp = await fetch(base, { credentials: 'same-origin', cache: 'no-cache' });
        if (!resp.ok) break;
        let data; try { data = await resp.json(); } catch { data = null; }
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.post) ? data.post : []);
        if (!arr.length) break;
        for (const p of arr) {
          const id = p.id ?? p?.['@attributes']?.id;
          if (id != null) out.push(Number(id));
        }
        if (arr.length < PAGE_LIMIT) break;
      }
      return out;
    }
    async function fetchFavIdsViaHtml() {
      const out = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const u = new URL(location.origin + '/index.php');
        u.searchParams.set('page', 'favorites');
        u.searchParams.set('s',    'view');
        u.searchParams.set('id',   userId);
        u.searchParams.set('pid',  String(page * 50));
        const resp = await fetch(u, { credentials: 'same-origin', cache: 'no-cache' });
        if (!resp.ok) break;
        const html = await resp.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const thumbs = [...doc.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];
        if (!thumbs.length) break;
        let count = 0;
        for (const n of thumbs) {
          const id = getPostIdFromThumb(n);
          if (Number.isFinite(id)) { out.push(id); count++; }
        }
        if (count < 50) break;
      }
      return out;
    }
    async function fetchFavIds() {
      const c = loadCache();
      if (cacheValid(c)) { favSet = new Set(c.ids); dbg('Cache hit', c.ids.length, 'IDs'); return; }
      let ids = [];
      try { ids = await fetchFavIdsViaApi(); } catch {}
      if (!ids.length) { try { ids = await fetchFavIdsViaHtml(); } catch {} }
      favSet = new Set(ids);
      saveCache({ userId, ids, ts: Date.now() });
      dbg('Fetched fav IDs:', ids.length);
    }

    // ---------- Styles ----------
    (function addStyles() {
      const s = document.createElement('style');
      s.textContent = `
        .thumbnail-preview a{ position:relative !important; display:inline-block !important; line-height:0; }
        .thumbnail-preview a > img{ display:block !important; }

        .gb-fav-badge{
          position:absolute; top:8px; right:8px; z-index:2;
          width:26px; height:26px; border-radius:9999px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,105,155,.95);
          box-shadow:0 2px 6px rgba(0,0,0,.25);
          pointer-events:none;
        }
        .gb-fav-badge .heart{ width:14px; height:14px; display:block; }
        .gb-fav-badge .heart svg{ width:100%; height:100%; fill:#fff; }
        .gb-hidden-by-fav{ display:none !important; }
      `;
      document.head.appendChild(s);
    })();

    // ---------- Rendering ----------
    function ensureBadge(anchor) {
      let badge = anchor.querySelector('.gb-fav-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'gb-fav-badge';
        badge.innerHTML = `
          <span class="heart" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 21s-6.72-4.03-9.33-7.2C-0.3 10.58 1.35 6.5 5 6.5c2.18 0 3.57 1.44 4 2.08.43-.64 1.82-2.08 4-2.08 3.65 0 5.3 4.08 2.33 7.3C18.72 16.97 12 21 12 21z"/>
            </svg>
          </span>
        `;
        anchor.appendChild(badge);
      }
      return badge;
    }
    function markNode(node) {
      const id = getPostIdFromThumb(node);
      if (!Number.isFinite(id)) return;
      const a = node.querySelector('a[id^="p"], a'); if (!a) return;

      const isFav = favSet.has(id);
      if (isFav) ensureBadge(a); else a.querySelector('.gb-fav-badge')?.remove();

      if (mode === 'hide') node.classList.toggle('gb-hidden-by-fav', isFav);
      else node.classList.remove('gb-hidden-by-fav');
    }
    function applyTo(nodes) {
      const list = nodes && nodes.length ? nodes : document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb');
      for (const n of list) markNode(n);
    }

    // ---------- Filter-UI ----------
    function addFilterControls() {
      const mount =
        document.querySelector('.navSubmenu')
        || document.querySelector('#maintabmenu')
        || document.querySelector('.maintabs')
        || document.querySelector('.header, .topbar')
        || document.querySelector('.searchArea');

      if (!mount) return;
      if (mount.querySelector('.gb-fav-filter')) return;

      const wrap = document.createElement('span');
      wrap.className = 'gb-fav-filter';
      wrap.style.marginLeft = '12px';

      const sel = document.createElement('select');
      sel.className = 'gb-inp';
      sel.style.width = 'auto';
      sel.title = 'Favorites-Filter';
      sel.innerHTML = `
        <option value="off"${mode === 'off' ? ' selected' : ''}>Fav-Filter: Aus</option>
        <option value="only"${mode === 'only' ? ' selected' : ''}>Nur Favoriten</option>
        <option value="hide"${mode === 'hide' ? ' selected' : ''}>Favoriten ausblenden</option>
      `;

      sel.addEventListener('change', () => {
        mode = sel.value;
        if (window.GBSuite?.settings) window.GBSuite.settings.FavMode = mode;
        saveSettingsSafe();

        if (mode === 'only') {
          const changed = addFavTagToSearch(userId);
          if (changed) submitSearch();
          return;
        }
        if (mode === 'hide') {
          const changed = removeFavTagsFromSearch();
          if (changed) submitSearch();
          applyTo(document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb'));
          return;
        }
        // off
        const changed = removeFavTagsFromSearch();
        if (changed) submitSearch();
        document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')
          .forEach(n => n.classList.remove('gb-hidden-by-fav'));
      });

      wrap.appendChild(sel);
      if (mount.classList.contains('navSubmenu')) mount.appendChild(wrap);
      else mount.insertAdjacentElement('beforeend', wrap);
    }

    // ---------- Notices ----------
    function showSiteNotice(text){
      if (typeof window.notice === 'function') { dbg('notice() available → using'); window.notice(text); return; }
      let bar = document.getElementById('gb-fav-notice');
      if (!bar){
        bar = document.createElement('div');
        bar.id = 'gb-fav-notice';
        Object.assign(bar.style, {
          position:'fixed', top:'14px', left:'50%', transform:'translateX(-50%)',
          background:'#fff3b0', color:'#222', border:'1px solid #d7ca7a',
          padding:'8px 14px', borderRadius:'6px', zIndex: 99999,
          boxShadow:'0 6px 20px rgba(0,0,0,.25)', font:'13px system-ui,sans-serif'
        });
        document.body.appendChild(bar);
      }
      bar.textContent = text;
      bar.style.opacity = '1';
      clearTimeout(bar._t);
      bar._t = setTimeout(()=>{ bar.style.transition='opacity .25s'; bar.style.opacity='0'; }, 1400);
    }

    function updateAfterToggle(id, added) {
      if (added) favSet.add(id); else favSet.delete(id);
      document.querySelectorAll(`.thumbnail-preview a[id="p${id}"], a[href*="id=${id}"]`)
        .forEach(a => {
          const node = a.closest('.thumbnail-preview, .thumb, .content .thumb');
          if (node) markNode(node);
        });
      dbg('updateAfterToggle → id:', id, 'added:', added, 'favSetSize:', favSet.size);
    }

    // ---------- Add/Remove ----------
    function getRemoveFavFn(){
      const names = ['removeFav','remFav','delFav','deleteFav','unfav','unfavorite'];
      for (const n of names){
        const fn = window[n];
        if (typeof fn === 'function') { dbg('found native remove fn:', n); return { fn, name: n }; }
      }
      dbg('no native remove fn found');
      return null;
    }

    async function toggleFavorite(postId, add) {
      dbg('toggleFavorite start → id:', postId, 'add:', add, 'typeof addFav:', typeof window.addFav);
      if (!postId) { dbg('toggleFavorite aborted (no postId)'); return; }

      if (add) {
        // Bevorzugt: native addFav (zeigt gelben Banner)
        if (typeof window.addFav === 'function') {
          try {
            dbg('using native addFav(postId)');
            window.addFav(String(postId));
            updateAfterToggle(postId, true);
            return;
          } catch (e) { dbg('native addFav threw:', e); /* fallback unten */ }
        } else {
          dbg('native addFav NOT available → fallback');
        }
        // Fallback: POST an favorite/add
        try {
          const u = new URL(location.origin + '/index.php');
          u.searchParams.set('page','favorite');
          u.searchParams.set('s','add');
          const fd = new FormData(); fd.append('id', String(postId));
          if (apiKey && userId){ u.searchParams.set('api_key',apiKey); u.searchParams.set('user_id',userId); fd.append('api_key',apiKey); fd.append('user_id',userId); }
          dbg('fetch add →', u.toString());
          const resp = await fetch(u, { method:'POST', body:fd, credentials:'same-origin' });
          dbg('fetch add status:', resp.status);
          if (!resp.ok) throw new Error('HTTP '+resp.status);
          updateAfterToggle(postId, true);
          showSiteNotice('Post added to favorites');
        } catch (err) {
          console.error('[GBFav] add favorite failed:', err);
          showSiteNotice('Error adding to favorites');
        }
        return;
      }

      // Entfernen: im Hintergrund „delete“-URL
      try {
        const rem = getRemoveFavFn();
        if (rem) {
          dbg('using native remove fn:', rem.name);
          rem.fn(String(postId));
          updateAfterToggle(postId, false);
          showSiteNotice('Post removed from favorites');
          return;
        }
        const u = new URL(location.origin + '/index.php');
        u.searchParams.set('page','favorites');
        u.searchParams.set('s','delete');
        u.searchParams.set('id', String(postId));
        dbg('fetch remove →', u.toString());
        const resp = await fetch(u, { method:'GET', credentials:'same-origin', cache:'no-cache' });
        dbg('fetch remove status:', resp.status);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        updateAfterToggle(postId, false);
        showSiteNotice('Post removed from favorites');
      } catch (err) {
        console.error('[GBFav] remove favorite failed:', err);
        showSiteNotice('Error removing from favorites');
      }
    }

    function getPostIdFromUrl() {
      try { return Number(new URL(location.href).searchParams.get('id')); }
      catch { return null; }
    }

    // ---------- Lifecycle ----------
    return {
      async init(ctx) {
        const s = ctx?.settings;
        if (s?.Favorites === false) { dbg('module disabled via settings'); return; }

        userId = String(s?.ApiUserId || s?.FavUserId || '').trim();
        apiKey = String(s?.ApiKey    || s?.FavApiKey || '').trim();
        mode   = s?.FavMode || 'off';
        dbg('init', { location: location.href, FavMode: mode, FavHotkeyHover: !!s?.FavHotkeyHover, FavHotkeyPost: !!s?.FavHotkeyPost, userIdSet: !!userId, addFavType: typeof window.addFav });

        addFilterControls();

        if (userId) { try { await fetchFavIds(); } catch (e) { dbg('fetchFavIds error', e); } }
        applyTo(document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb'));

        const handler = (nodes) => applyTo(nodes);
        ctx.bus.on('newThumbs', handler);
        unsub = () => ctx.bus.off('newThumbs', handler);

        const hotkeys = { hover: !!s.FavHotkeyHover, post: !!s.FavHotkeyPost };
        dbg('hotkeys active?', hotkeys);

        // Hover-Tracking (nur loggen, wenn ID wechselt)
        const hoverScopeSel = '.thumbnail-preview, .thumb, .content .thumb, .post-preview, .thumbnail';
        const onPointerMove = (e) => {
          const scope = e.target.closest(hoverScopeSel);
          if (!scope) { hoverAnchor = null; hoverId = null; if (lastLoggedHoverId !== null){ dbg('hover left preview scope'); lastLoggedHoverId = null; } return; }
          const a = e.target.closest('a[id^="p"], a[href*="&id="], a[href*="?id="]') ||
                    scope.querySelector('a[id^="p"], a[href*="&id="], a[href*="?id="]');
          hoverAnchor = a || null;
          hoverId = extractIdFromAnchor(hoverAnchor);
          if (hoverId !== lastLoggedHoverId) {
            dbg('hover change → id:', hoverId, 'href:', hoverAnchor?.href);
            lastLoggedHoverId = hoverId;
          }
        };
        document.addEventListener('mousemove', onPointerMove, { capture: true, passive: true });
        document.addEventListener('mouseover', onPointerMove, { capture: true, passive: true });
        cleanupHandlers.push(() => document.removeEventListener('mousemove', onPointerMove, true));
        cleanupHandlers.push(() => document.removeEventListener('mouseover', onPointerMove, true));

        // Key logging & handling
        const onKeyAny = (e) => {
          const tag = (e.target?.tagName || '').toUpperCase();
          const k = (e.key || '').toLowerCase();
          dbg('key event', { type: e.type, key: e.key, tag, ctrl:e.ctrlKey, alt:e.altKey, meta:e.metaKey, composing:e.isComposing });

          if (tag === 'INPUT' || tag === 'TEXTAREA' || e.isComposing) { dbg('skip: typing in input/textarea or composing'); return; }
          if (e.ctrlKey || e.altKey || e.metaKey) { dbg('skip: modifier key pressed'); return; }
          if (k !== 'f' && k !== 'x') { return; }

          // Hover first
          if (hotkeys.hover && hoverId) {
            dbg('action via HOVER', { key:k, hoverId });
            e.preventDefault(); e.stopPropagation();
            toggleFavorite(hoverId, k === 'f');
            return;
          } else {
            dbg('hover path not used', { hotkeysHover: hotkeys.hover, hoverId });
          }

          // Post view
          if (hotkeys.post) {
            const id = getPostIdFromUrl();
            dbg('post path check', { id });
            if (id) {
              e.preventDefault(); e.stopPropagation();
              toggleFavorite(id, k === 'f');
              return;
            }
          } else {
            dbg('post hotkey disabled');
          }
        };
        document.addEventListener('keydown', onKeyAny, { capture: true });
        window.addEventListener('keydown', onKeyAny, { capture: true });
        cleanupHandlers.push(() => document.removeEventListener('keydown', onKeyAny, true));
        cleanupHandlers.push(() => window.removeEventListener('keydown', onKeyAny, true));

        dbg('listeners attached (keydown capture on document & window)');
      },

      destroy() {
        unsub?.();
        for (const fn of cleanupHandlers) { try { fn(); } catch {} }
        cleanupHandlers = [];
        dbg('destroyed');
      }
    };
  })());
})();
