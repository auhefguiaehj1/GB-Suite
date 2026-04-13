(function () {
    'use strict';

    const NS = window.GBSuite || (window.GBSuite = {});
    if (NS.__gbRecommendationsLoaded) return;
    NS.__gbRecommendationsLoaded = true;

    // ─────────────────────────────────────────────
    //  Storage keys
    // ─────────────────────────────────────────────
    const LS_PROFILE  = 'gbReco.profile.v2';   // computed weights → localStorage (small)
    const IDB_NAME    = 'gbRecoPostCache';      // raw post data   → IndexedDB   (large)
    const IDB_STORE   = 'posts';
    const IDB_VERSION = 1;

    // ─────────────────────────────────────────────
    //  Default settings
    // ─────────────────────────────────────────────
    const DEFAULTS = {
        Recommendations:         true,
        RecoEnabled:             true,
        RecoAutoBuild:           true,
        RecoUseApi:              true,
        RecoMaxPages:            500,           // raised – before_id pagination bypasses pid=200 cap
        RecoPageLimit:           100,
        RecoMinTagCount:         2,
        RecoMinScoreToShow:      0,
        RecoSortMode:            'score',       // 'score' | 'none'
        RecoHideWeak:            false,
        RecoWeightMode:          'tfidf',       // 'freq' | 'tfidf'
        RecoNormalizeByTagCount: true,
        RecoShowBadge:           true,
        RecoShowReason:          true,
        RecoIgnoreTags:
            '1girl 1boy 2girls 3girls solo duo trio rating:safe rating:questionable rating:explicit ' +
            'highres absurdres commentary request simple background white background',
        RecoCacheHours:          24,
        RecoDecayHalfLifeDays:   180,           // Zeit-Decay: Halbwertszeit in Tagen (0 = deaktiviert)
        RecoCooccurTopN:         50,            // Co-occurrence: wie viele Top-Tags als Paare
        RecoCooccurBoost:        0.3,           // Co-occurrence Gewicht-Multiplikator
        RecoFetchConcurrency:    4,             // parallele API-Requests beim Fetchen
    };

    Object.assign(NS.settings || {}, Object.fromEntries(
        Object.entries(DEFAULTS).filter(([k]) => !(k in (NS.settings || {})))
    ));

    // ─────────────────────────────────────────────
    //  Settings Tab
    // ─────────────────────────────────────────────
    if (typeof NS.addSettingsTab === 'function') {
        NS.addSettingsTab({
            id: 'recommendations',
            title: 'Recommendations',
            render(container, { settings }) {
                const S = settings || {};
                container.innerHTML = `
                    <div class="gb-form-row">
                        <label><input id="gb-reco-enabled" type="checkbox" ${S.RecoEnabled !== false ? 'checked' : ''}> Recommendations aktivieren</label>
                    </div>
                    <div class="gb-form-row">
                        <label><input id="gb-reco-autobuild" type="checkbox" ${S.RecoAutoBuild !== false ? 'checked' : ''}> Profil automatisch laden/aktualisieren</label>
                    </div>
                    <div class="gb-form-row">
                        <label>Weight Mode</label>
                        <select id="gb-reco-weight" class="gb-inp" style="width:auto">
                            <option value="freq"  ${S.RecoWeightMode === 'freq'  ? 'selected' : ''}>Frequency</option>
                            <option value="tfidf" ${S.RecoWeightMode !== 'freq'  ? 'selected' : ''}>TF-IDF (empfohlen)</option>
                        </select>
                    </div>
                    <div class="gb-form-row">
                        <label>Zeit-Decay Halbwertszeit (Tage)</label>
                        <input id="gb-reco-decay" class="gb-inp" type="number" min="0" max="3650" step="1" style="width:10ch" value="${Number(S.RecoDecayHalfLifeDays ?? 180)}">
                        <span style="opacity:.7;font-size:12px">0 = deaktiviert. Ältere Favs werden weniger gewichtet.</span>
                    </div>
                    <div class="gb-form-row">
                        <label>Co-occurrence Boost</label>
                        <input id="gb-reco-cooccur" class="gb-inp" type="number" min="0" max="5" step="0.05" style="width:10ch" value="${Number(S.RecoCooccurBoost ?? 0.3)}">
                        <span style="opacity:.7;font-size:12px">Bonus wenn mehrere häufig gemeinsam vorkommende Tags matchen. 0 = aus.</span>
                    </div>
                    <div class="gb-form-row">
                        <label>Sortierung</label>
                        <select id="gb-reco-sort" class="gb-inp" style="width:auto">
                            <option value="score" ${S.RecoSortMode !== 'none' ? 'selected' : ''}>Nach Score sortieren</option>
                            <option value="none"  ${S.RecoSortMode === 'none'  ? 'selected' : ''}>Nicht sortieren</option>
                        </select>
                    </div>
                    <div class="gb-form-row">
                        <label>Min Score sichtbar</label>
                        <input id="gb-reco-minscore" class="gb-inp" type="number" step="0.1" style="width:10ch" value="${Number(S.RecoMinScoreToShow ?? 0)}">
                        <label style="min-width:auto"><input id="gb-reco-hideweak" type="checkbox" ${S.RecoHideWeak ? 'checked' : ''}> Schwache Treffer ausblenden</label>
                    </div>
                    <div class="gb-form-row">
                        <label>Min Tag Frequency</label>
                        <input id="gb-reco-mintagcount" class="gb-inp" type="number" min="1" step="1" style="width:10ch" value="${Number(S.RecoMinTagCount ?? 2)}">
                    </div>
                    <div class="gb-form-row">
                        <label>Max Favorites Pages</label>
                        <input id="gb-reco-maxpages" class="gb-inp" type="number" min="1" max="2000" step="1" style="width:10ch" value="${Number(S.RecoMaxPages ?? 500)}">
                        <span style="opacity:.7;font-size:12px">100 Posts/Seite, before_id-Pagination → kein 20k-Limit mehr</span>
                    </div>
                    <div class="gb-form-row">
                        <label>Fetch Parallelität</label>
                        <input id="gb-reco-concurrency" class="gb-inp" type="number" min="1" max="8" step="1" style="width:8ch" value="${Number(S.RecoFetchConcurrency ?? 4)}">
                        <span style="opacity:.7;font-size:12px">Parallele API-Requests (2–4 empfohlen)</span>
                    </div>
                    <div class="gb-form-row">
                        <label>Cache (Stunden)</label>
                        <input id="gb-reco-cachehours" class="gb-inp" type="number" min="1" max="720" step="1" style="width:10ch" value="${Number(S.RecoCacheHours ?? 24)}">
                    </div>
                    <div class="gb-form-row">
                        <label><input id="gb-reco-normtags" type="checkbox" ${S.RecoNormalizeByTagCount !== false ? 'checked' : ''}> Score nach Tag-Anzahl normalisieren</label>
                    </div>
                    <div class="gb-form-row">
                        <label><input id="gb-reco-badge" type="checkbox" ${S.RecoShowBadge !== false ? 'checked' : ''}> Score-Badge auf Thumbnails</label>
                    </div>
                    <div class="gb-form-row">
                        <label><input id="gb-reco-reason" type="checkbox" ${S.RecoShowReason !== false ? 'checked' : ''}> Beste Matching-Tags im Tooltip zeigen</label>
                    </div>
                    <div class="gb-form-row" style="align-items:flex-start">
                        <label>Ignore Tags</label>
                        <textarea id="gb-reco-ignore" class="gb-inp" style="width:100%;height:110px;font:13px ui-monospace,Consolas,monospace;">${escHtml(String(S.RecoIgnoreTags || ''))}</textarea>
                    </div>
                    <div class="gb-form-row" style="gap:8px">
                        <button class="gb-suite-btn" id="gb-reco-clear-idb">🗑 Post-Cache leeren (IndexedDB)</button>
                        <span style="opacity:.7;font-size:12px">Erzwingt beim nächsten Rebuild ein vollständiges Neu-Fetchen aller Favoriten.</span>
                    </div>
                    <div class="gb-form-row" style="opacity:.75;font-size:12px">
                        Nutzt ApiUserId / API Key aus den General Settings. Profil wird aus deinen Gelbooru Favorites gebaut.<br>
                        Posts werden in IndexedDB gecacht – Profil-Rebuilds ohne API-Fetching möglich solange Cache frisch ist.
                    </div>
                `;
                container.querySelector('#gb-reco-clear-idb')?.addEventListener('click', async () => {
                    await clearPostCache();
                    alert('Post-Cache geleert. Beim nächsten Rebuild werden alle Favoriten neu geladen.');
                });
            },
            collect(settings, container) {
                settings.RecoEnabled             = !!container.querySelector('#gb-reco-enabled')?.checked;
                settings.RecoAutoBuild           = !!container.querySelector('#gb-reco-autobuild')?.checked;
                settings.RecoWeightMode          = container.querySelector('#gb-reco-weight')?.value || 'tfidf';
                settings.RecoDecayHalfLifeDays   = Math.max(0, Number(container.querySelector('#gb-reco-decay')?.value ?? 180) || 0);
                settings.RecoCooccurBoost        = Math.max(0, Number(container.querySelector('#gb-reco-cooccur')?.value ?? 0.3) || 0);
                settings.RecoSortMode            = container.querySelector('#gb-reco-sort')?.value || 'score';
                settings.RecoMinScoreToShow      = Number(container.querySelector('#gb-reco-minscore')?.value ?? 0) || 0;
                settings.RecoHideWeak            = !!container.querySelector('#gb-reco-hideweak')?.checked;
                settings.RecoMinTagCount         = Math.max(1, Number(container.querySelector('#gb-reco-mintagcount')?.value ?? 2) || 2);
                settings.RecoMaxPages            = Math.max(1, Number(container.querySelector('#gb-reco-maxpages')?.value ?? 500) || 500);
                settings.RecoFetchConcurrency    = Math.max(1, Math.min(8, Number(container.querySelector('#gb-reco-concurrency')?.value ?? 4) || 4));
                settings.RecoCacheHours          = Math.max(1, Number(container.querySelector('#gb-reco-cachehours')?.value ?? 24) || 24);
                settings.RecoNormalizeByTagCount = !!container.querySelector('#gb-reco-normtags')?.checked;
                settings.RecoShowBadge           = !!container.querySelector('#gb-reco-badge')?.checked;
                settings.RecoShowReason          = !!container.querySelector('#gb-reco-reason')?.checked;
                settings.RecoIgnoreTags          = container.querySelector('#gb-reco-ignore')?.value || '';
            }
        });
    }

    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // ─────────────────────────────────────────────
    //  IndexedDB helpers
    // ─────────────────────────────────────────────
    let _idb = null;

    function openIDB() {
        if (_idb) return Promise.resolve(_idb);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    // keyPath = id, plus index on userId for fast per-user lookup
                    const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                    store.createIndex('userId', 'userId', { unique: false });
                }
            };
            req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbGetAllForUser(userId) {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(IDB_STORE, 'readonly');
            const idx   = tx.objectStore(IDB_STORE).index('userId');
            const req   = idx.getAll(userId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbPutBatch(records) {
        if (!records.length) return;
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            for (const r of records) store.put(r);
            tx.oncomplete = resolve;
            tx.onerror    = () => reject(tx.error);
        });
    }

    async function idbGetMeta(userId) {
        // meta record uses a string key like "meta:userId"
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(`meta:${userId}`);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbSetMeta(userId, data) {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            store.put({ id: `meta:${userId}`, userId, ...data });
            tx.oncomplete = resolve;
            tx.onerror    = () => reject(tx.error);
        });
    }

    async function clearPostCache() {
        try {
            const db = await openIDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).clear();
                tx.oncomplete = resolve;
                tx.onerror    = () => reject(tx.error);
            });
        } catch (e) {
            console.warn('[GBReco] clearPostCache failed', e);
        }
    }

    // ─────────────────────────────────────────────
    //  Module state
    // ─────────────────────────────────────────────
    window.GBSuite.register('Recommendations', (function () {
        let unsub          = null;
        let profile        = null;
        let toolbar        = null;
        let mutationScheduled = false;
        let isBuilding     = false;

        function S() { return window.GBSuite?.settings || {}; }
        function now() { return Date.now(); }

        // ── localStorage profile cache ──────────────────────
        function loadProfileFromLS() {
            try { return JSON.parse(localStorage.getItem(LS_PROFILE) || 'null') || null; } catch { return null; }
        }
        function saveProfileToLS(p) {
            try { localStorage.setItem(LS_PROFILE, JSON.stringify(p)); } catch (e) {
                console.warn('[GBReco] localStorage save failed (quota?), profile only in memory.', e);
            }
        }
        function profileFresh(p) {
            if (!p?.ts) return false;
            return (now() - p.ts) < Math.max(1, Number(S().RecoCacheHours ?? 24)) * 3_600_000;
        }

        // ── Tag normalization ───────────────────────────────
        function normalizeTag(s)   { return String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
        function denormalizeTag(s) { return String(s).trim().replace(/\s+/g, '_'); }
        function getIgnoreSet() {
            return new Set(String(S().RecoIgnoreTags || '').split(/\r?\n|,|\s+/g).map(normalizeTag).filter(Boolean));
        }

        // ── DOM helpers ─────────────────────────────────────
        function getPostIdFromThumb(node) {
            if (!node) return null;
            const a = node.querySelector('a[id^="p"], a[href*="&id="], a[href*="?id="]');
            if (!a) return null;
            if (/^p\d+$/.test(a.id)) return Number(a.id.slice(1));
            try { return Number(new URL(a.href, location.origin).searchParams.get('id')) || null; } catch { return null; }
        }
        function extractTagsFromThumb(node) {
            const alt = node?.querySelector('img')?.getAttribute('alt') || '';
            let part = alt;
            const i = part.indexOf('|'); if (i >= 0) part = part.slice(i + 1);
            return part.split(',').map(normalizeTag).filter(Boolean);
        }
        function getThumbAnchor(node) { return node?.querySelector('a[id^="p"], a[href]'); }

        // ── Overlay wrappers ────────────────────────────────
        function ensureOverlayHost(anchor) {
            const img = anchor?.querySelector('img'); if (!img) return null;
            let host = img.closest('.gb-anim-wrap') || img.closest('.gb-overlay-wrap') || img.closest('.gb-reco-wrap');
            if (host) return host;
            host = document.createElement('span'); host.className = 'gb-reco-wrap';
            const br = getComputedStyle(img).borderRadius;
            if (br && br !== '0px') host.style.borderRadius = br;
            img.style.display = 'block';
            img.parentNode.insertBefore(host, img); host.appendChild(img);
            return host;
        }
        function ensureBadge(anchor) {
            const host = ensureOverlayHost(anchor); if (!host) return null;
            let b = host.querySelector('.gb-reco-badge');
            if (!b) { b = document.createElement('div'); b.className = 'gb-reco-badge'; host.appendChild(b); }
            return b;
        }
        function ensureReason(anchor) {
            const host = ensureOverlayHost(anchor); if (!host) return null;
            let r = host.querySelector('.gb-reco-reason');
            if (!r) { r = document.createElement('div'); r.className = 'gb-reco-reason'; host.appendChild(r); }
            return r;
        }

        // ─────────────────────────────────────────────────────
        //  FETCHING – with before_id pagination to bypass pid≤200
        // ─────────────────────────────────────────────────────

        /**
         * Fetches a single page of favorites via the Gelbooru API.
         * Returns { posts: [{id, tags, created_at}], minId: number|null }
         */
        async function fetchPageApi(userId, apiKey, beforeId, pageLimit) {
            const u = new URL(location.origin + '/index.php');
            u.searchParams.set('page',  'dapi');
            u.searchParams.set('s',     'post');
            u.searchParams.set('q',     'index');
            u.searchParams.set('json',  '1');
            u.searchParams.set('limit', String(pageLimit));
            u.searchParams.set('tags',  `fav:${userId}` + (beforeId ? ` id:<${beforeId}` : ''));
            u.searchParams.set('sort',  'id');
            u.searchParams.set('order', 'desc');
            if (apiKey && userId) {
                u.searchParams.set('api_key',  apiKey);
                u.searchParams.set('user_id',  userId);
            }

            const resp = await fetch(u.toString(), { credentials: 'same-origin', cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            let data; try { data = await resp.json(); } catch { data = null; }
            const arr = Array.isArray(data) ? data : (Array.isArray(data?.post) ? data.post : []);

            const posts = [];
            let minId = null;
            for (const p of arr) {
                const attr = p?.['@attributes'] || p;
                const id   = Number(attr.id ?? p.id);
                const tags = String(attr.tags ?? p.tags ?? '').trim();
                const created_at = attr.created_at ?? p.created_at ?? null;
                if (!tags || !Number.isFinite(id)) continue;
                posts.push({ id, tags, created_at, userId });
                if (minId === null || id < minId) minId = id;
            }
            return { posts, minId, count: arr.length };
        }

        /**
         * Full fetch with before_id pagination.
         * Strategy:
         *   1. Load what we already have in IndexedDB for this user.
         *   2. Fetch only posts NEWER than the most recent cached id (incremental update).
         *   3. If cache is empty, do a full fetch from scratch using before_id pages.
         *   4. Persist everything back to IndexedDB.
         */
        async function fetchAndCacheAllPosts(userId, apiKey, onProgress) {
            const maxPages   = Math.max(1, Number(S().RecoMaxPages ?? 500));
            const pageLimit  = Math.max(1, Number(S().RecoPageLimit ?? 100));
            const concurrency = Math.max(1, Math.min(8, Number(S().RecoFetchConcurrency ?? 4)));

            // Load existing cache
            let cached = [];
            try { cached = await idbGetAllForUser(userId); } catch { cached = []; }
            // Filter out meta record
            cached = cached.filter(p => typeof p.id === 'number');

            const cachedIds = new Set(cached.map(p => p.id));
            const maxCachedId = cached.length ? Math.max(...cached.map(p => p.id)) : null;

            const newPosts = [];
            let fetched = 0;

            if (maxCachedId !== null) {
                // ── Incremental: only fetch posts newer than cache ──────
                onProgress?.(`Updating cache (${cached.length} posts cached)…`);
                let beforeId = null;
                let page = 0;
                let done = false;
                while (!done && page < maxPages) {
                    const { posts, minId, count } = await fetchPageApi(userId, apiKey, beforeId, pageLimit);
                    fetched += count;
                    if (!count) break;

                    let addedThisPage = 0;
                    for (const p of posts) {
                        if (p.id <= maxCachedId) { done = true; break; }
                        if (!cachedIds.has(p.id)) { newPosts.push(p); addedThisPage++; }
                    }
                    onProgress?.(`Fetching new favs… +${newPosts.length} new`);
                    if (count < pageLimit || minId === null) break;
                    beforeId = minId;
                    page++;
                }
            } else {
                // ── Full fetch with parallel before_id pages ────────────
                onProgress?.('Fetching all favorites (first time, may take a while)…');

                // Seed: get first page to know total count direction
                const seed = await fetchPageApi(userId, apiKey, null, pageLimit);
                for (const p of seed.posts) { if (!cachedIds.has(p.id)) newPosts.push(p); }
                fetched += seed.count;
                onProgress?.(`Fetched ${newPosts.length} posts…`);

                if (seed.count >= pageLimit && seed.minId !== null) {
                    // Parallel fetch using a queue of before_ids
                    let beforeId = seed.minId;
                    let exhausted = false;
                    let page = 1;

                    while (!exhausted && page < maxPages) {
                        // Build batch of concurrent requests
                        const batchBeforeIds = [];
                        for (let i = 0; i < concurrency && page + i < maxPages; i++) {
                            // We approximate before_id for parallel pages by stepping back
                            // We'll correct with actual minIds as responses come in
                            batchBeforeIds.push(beforeId);
                            // placeholder – real before_id will be chained below
                            if (i === 0) break; // first pass: chain sequentially to get correct before_ids
                        }

                        // Sequential chaining to keep before_id accurate, but use Promise.all
                        // for a small lookahead window
                        const batch = [];
                        let bid = beforeId;
                        for (let i = 0; i < concurrency && page < maxPages; i++, page++) {
                            if (bid === null) break;
                            batch.push(fetchPageApi(userId, apiKey, bid, pageLimit));
                            // We don't know next bid yet; will chain after results
                            // For first iteration just queue one at a time if uncertain
                            break; // safe sequential until we have accurate bid chain
                        }

                        const results = await Promise.allSettled(batch);
                        for (const res of results) {
                            if (res.status !== 'fulfilled') { exhausted = true; break; }
                            const { posts, minId, count } = res.value;
                            fetched += count;
                            for (const p of posts) { if (!cachedIds.has(p.id)) newPosts.push(p); }
                            onProgress?.(`Fetched ${cached.length + newPosts.length} posts…`);
                            if (count < pageLimit || minId === null) { exhausted = true; }
                            beforeId = minId;
                        }
                    }
                }
            }

            // Persist new posts to IndexedDB
            if (newPosts.length) {
                onProgress?.(`Saving ${newPosts.length} new posts to cache…`);
                try {
                    // Batch in chunks of 500 to avoid large transactions
                    const CHUNK = 500;
                    for (let i = 0; i < newPosts.length; i += CHUNK) {
                        await idbPutBatch(newPosts.slice(i, i + CHUNK));
                    }
                } catch (e) {
                    console.warn('[GBReco] IndexedDB write failed:', e);
                }
            }

            // Update meta
            const allPosts = [...cached, ...newPosts];
            try {
                await idbSetMeta(userId, {
                    ts: now(),
                    count: allPosts.length,
                    maxId: allPosts.length ? Math.max(...allPosts.map(p => p.id)) : 0
                });
            } catch {}

            return allPosts;
        }

        // ─────────────────────────────────────────────────────
        //  PROFILE BUILDING – TF-IDF + Zeit-Decay + Co-occurrence
        // ─────────────────────────────────────────────────────

        function buildProfileFromPosts(posts) {
            const ignore       = getIgnoreSet();
            const minTagCount  = Math.max(1, Number(S().RecoMinTagCount ?? 2));
            const mode         = String(S().RecoWeightMode || 'tfidf');
            const halfLifeDays = Number(S().RecoDecayHalfLifeDays ?? 180);
            const cooccurTopN  = Math.max(0, Number(S().RecoCooccurTopN ?? 50));
            const cooccurBoost = Math.max(0, Number(S().RecoCooccurBoost ?? 0.3));

            const nowMs = now();

            // ── Zeit-Decay: weight multiplier per post ──────────────
            function decayWeight(created_at) {
                if (!halfLifeDays || !created_at) return 1;
                let ts = null;
                // Gelbooru returns "Fri Jan 01 00:00:00 +0000 2021" or Unix-like strings
                if (typeof created_at === 'number') {
                    ts = created_at * 1000;
                } else {
                    const d = new Date(created_at);
                    if (!isNaN(d)) ts = d.getTime();
                }
                if (!ts) return 1;
                const ageDays = (nowMs - ts) / 86_400_000;
                return Math.pow(0.5, ageDays / halfLifeDays);
            }

            // ── Pass 1: tag frequencies + document frequencies ──────
            const tagFreq  = new Map(); // tag → weighted sum
            const docFreq  = new Map(); // tag → # docs containing it
            const tagPairs = new Map(); // "a\tb" → cooccurrence count (only for top candidates)
            let docCount   = 0;

            for (const post of posts) {
                const rawTags = String(post.tags || '')
                    .split(/\s+/g)
                    .map(normalizeTag)
                    .filter(t => t && !ignore.has(t));

                if (!rawTags.length) continue;
                docCount++;

                const dw = decayWeight(post.created_at);
                const seen = new Set();

                for (const t of rawTags) {
                    tagFreq.set(t, (tagFreq.get(t) || 0) + dw);
                    if (!seen.has(t)) {
                        docFreq.set(t, (docFreq.get(t) || 0) + 1);
                        seen.add(t);
                    }
                }
            }

            // ── Pass 2: compute base weights ────────────────────────
            const weights    = {};
            const rawCounts  = {};

            for (const [tag, freq] of tagFreq.entries()) {
                // Use integer count for minTagCount check (not decayed sum)
                const intCount = docFreq.get(tag) || 0;
                if (intCount < minTagCount) continue;
                rawCounts[tag] = intCount;

                if (mode === 'tfidf') {
                    const df  = intCount;
                    // Smooth IDF: log((N+1)/(df+1)) + 1
                    const idf = Math.log((docCount + 1) / (df + 1)) + 1;
                    weights[tag] = freq * idf;
                } else {
                    weights[tag] = freq;
                }
            }

            // ── Pass 3: co-occurrence for top N tags ────────────────
            const cooccur = {};
            if (cooccurBoost > 0 && cooccurTopN > 0) {
                // Take topN tags by weight
                const topTagSet = new Set(
                    Object.entries(weights)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, cooccurTopN)
                        .map(([t]) => t)
                );

                for (const post of posts) {
                    const rawTags = String(post.tags || '')
                        .split(/\s+/g)
                        .map(normalizeTag)
                        .filter(t => t && !ignore.has(t) && topTagSet.has(t));

                    if (rawTags.length < 2) continue;
                    const dw = decayWeight(post.created_at);
                    const uniq = [...new Set(rawTags)];
                    for (let i = 0; i < uniq.length; i++) {
                        for (let j = i + 1; j < uniq.length; j++) {
                            // canonical order so a-b === b-a
                            const key = uniq[i] < uniq[j] ? `${uniq[i]}\t${uniq[j]}` : `${uniq[j]}\t${uniq[i]}`;
                            tagPairs.set(key, (tagPairs.get(key) || 0) + dw);
                        }
                    }
                }

                // Normalize pairs: store as { "a\tb": normalizedWeight }
                const maxPairWeight = Math.max(1, ...tagPairs.values());
                for (const [key, w] of tagPairs.entries()) {
                    cooccur[key] = w / maxPairWeight;
                }
            }

            // ── Top tags for display ─────────────────────────────────
            const topTags = Object.entries(weights)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 300)
                .map(([tag, weight]) => ({ tag, weight, count: rawCounts[tag] || 0 }));

            return {
                ts: now(),
                sourceUserId: String(S().ApiUserId || '').trim(),
                sourceMode:   mode,
                decayDays:    halfLifeDays,
                docCount,
                postCount:    posts.length,
                weights,
                rawCounts,
                cooccur,
                topTags
            };
        }

        // ─────────────────────────────────────────────────────
        //  BUILD PROFILE (orchestrator)
        // ─────────────────────────────────────────────────────
        async function buildProfile(force = false) {
            if (isBuilding) return profile;
            isBuilding = true;
            setToolbarStatus('Building profile…');

            try {
                const userId = String(S().ApiUserId || '').trim();
                const apiKey = String(S().ApiKey    || '').trim();

                if (!userId) {
                    setToolbarStatus('No ApiUserId set');
                    throw new Error('Reco requires ApiUserId in Suite Settings');
                }

                // Check if cached profile is still valid (and not a force rebuild)
                if (!force) {
                    const cached = loadProfileFromLS();
                    if (
                        cached &&
                        cached.sourceUserId === userId &&
                        cached.sourceMode   === String(S().RecoWeightMode || 'tfidf') &&
                        cached.decayDays    === Number(S().RecoDecayHalfLifeDays ?? 180) &&
                        profileFresh(cached)
                    ) {
                        profile = cached;
                        setToolbarStatus(`Profile cached (${cached.postCount} posts, ${Object.keys(cached.weights).length} tags)`);
                        return profile;
                    }
                }

                // Fetch posts (incremental via IndexedDB)
                let posts = [];
                if (S().RecoUseApi !== false) {
                    try {
                        posts = await fetchAndCacheAllPosts(userId, apiKey, setToolbarStatus);
                    } catch (e) {
                        console.warn('[GBReco] fetchAndCacheAllPosts failed:', e);
                    }
                }

                if (!posts.length) {
                    setToolbarStatus('No favorites found');
                    throw new Error('Could not load favorite posts');
                }

                profile = buildProfileFromPosts(posts);
                saveProfileToLS(profile);

                const tagCount = Object.keys(profile.weights).length;
                const pairCount = Object.keys(profile.cooccur).length;
                setToolbarStatus(`Profile ready – ${profile.postCount} posts · ${tagCount} tags · ${pairCount} pairs`);
                return profile;
            } finally {
                isBuilding = false;
            }
        }

        // ─────────────────────────────────────────────────────
        //  SCORING
        // ─────────────────────────────────────────────────────
        function scoreTags(tags) {
            if (!profile?.weights) return { score: 0, matched: [] };

            const weights      = profile.weights;
            const cooccur      = profile.cooccur || {};
            const cooccurBoost = Math.max(0, Number(S().RecoCooccurBoost ?? 0.3));
            const favArtists   = new Set((NS.settings.TagFavs_Artists    || []).map(t => normalizeTag(t)));
            const favChars     = new Set((NS.settings.TagFavs_Characters || []).map(t => normalizeTag(t)));

            let sum = 0;
            const matched = [];
            const presentWeightedTags = []; // for co-occurrence pass

            // ── Base scores ─────────────────────────────────────────
            for (const t of tags) {
                const tag = normalizeTag(t);
                let w = weights[tag] || 0;

                // Artist / Character boost: use percentile-relative boost instead of
                // magic numbers. We anchor to the 95th-percentile weight in the profile.
                if (favArtists.has(tag) || favChars.has(tag)) {
                    const sorted = Object.values(weights).sort((a, b) => b - a);
                    const p95    = sorted[Math.floor(sorted.length * 0.05)] || sorted[0] || 1;
                    const mult   = favArtists.has(tag) ? 1.5 : 1.2;
                    w = Math.max(w, p95 * mult);
                }

                if (w > 0) {
                    sum += w;
                    matched.push([tag, w]);
                    presentWeightedTags.push(tag);
                }
            }

            // ── Co-occurrence bonus ──────────────────────────────────
            if (cooccurBoost > 0 && presentWeightedTags.length >= 2) {
                let coBonus = 0;
                for (let i = 0; i < presentWeightedTags.length; i++) {
                    for (let j = i + 1; j < presentWeightedTags.length; j++) {
                        const a = presentWeightedTags[i], b = presentWeightedTags[j];
                        const key = a < b ? `${a}\t${b}` : `${b}\t${a}`;
                        const co = cooccur[key];
                        if (co) coBonus += co * cooccurBoost * (weights[a] || 0);
                    }
                }
                sum += coBonus;
            }

            matched.sort((a, b) => b[1] - a[1]);

            // ── Normalize by tag count (sqrt dampening) ──────────────
            if (S().RecoNormalizeByTagCount !== false) {
                sum = sum / Math.max(1, Math.sqrt(tags.length));
            }

            return { score: sum, matched: matched.slice(0, 5) };
        }

        function formatScore(score) {
            if (score >= 1000) return (score / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
            if (score >= 100)  return Math.round(score).toString();
            if (score >= 10)   return score.toFixed(1).replace(/\.0$/, '');
            return score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        }

        // ─────────────────────────────────────────────────────
        //  APPLY TO DOM
        // ─────────────────────────────────────────────────────
        function applyScoreToNode(node) {
            if (!node) return;
            const tags   = extractTagsFromThumb(node);
            const anchor = getThumbAnchor(node);
            if (!anchor || !tags.length) return;

            const result = scoreTags(tags);
            const postId = getPostIdFromThumb(node);
            node.dataset.gbRecoScore = String(result.score || 0);
            node.classList.toggle('gb-reco-hidden', !!S().RecoHideWeak && result.score < Number(S().RecoMinScoreToShow ?? 0));
            node.classList.toggle('gb-reco-hit', result.score > 0);

            if (S().RecoShowBadge !== false) {
                const badge = ensureBadge(anchor);
                if (badge) {
                    if (result.score > 0) { badge.textContent = '★ ' + formatScore(result.score); badge.style.display = ''; }
                    else badge.style.display = 'none';
                }
            }

            if (S().RecoShowReason !== false) {
                const reason = ensureReason(anchor);
                if (reason) {
                    if (result.matched.length) {
                        reason.textContent = result.matched.slice(0, 3).map(([t]) => t.replace(/\s+/g, '_')).join(' • ');
                        reason.style.display = '';
                    } else reason.style.display = 'none';
                }
            }

            anchor.title = result.matched.length
                ? 'Recommended: ' + result.matched.map(([t, w]) => `${t.replace(/\s+/g, '_')} (${formatScore(w)})`).join(', ')
                : 'No match';
        }

        let mutScheduled = false;
        function applyTo(nodes) {
            const list = (nodes && nodes.length)
                ? [...nodes]
                : [...document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];
            for (const n of list) applyScoreToNode(n);
            if (S().RecoSortMode !== 'none') scheduleResort();
            updateToolbarStats();
        }

        function scheduleResort() {
            if (mutScheduled) return; mutScheduled = true;
            requestAnimationFrame(() => { mutScheduled = false; resortGrid(); });
        }

        function resortGrid() {
            const grid = document.querySelector('.thumbnail-container');
            if (!grid || S().RecoSortMode === 'none') return;
            const thumbs   = [...grid.querySelectorAll('.thumbnail-preview')];
            const dividers = [...grid.querySelectorAll('.gb-page-divider')];
            const sentinel = [...grid.children].find(x => x.style?.height === '1px');
            thumbs.sort((a, b) => Number(b.dataset.gbRecoScore || 0) - Number(a.dataset.gbRecoScore || 0));
            for (const t of thumbs)   grid.appendChild(t);
            for (const d of dividers) grid.appendChild(d);
            if (sentinel) grid.appendChild(sentinel);
        }

        // ─────────────────────────────────────────────────────
        //  TOOLBAR
        // ─────────────────────────────────────────────────────
        function setToolbarStatus(text) {
            toolbar?.querySelector('.gb-reco-status') && (toolbar.querySelector('.gb-reco-status').textContent = text || '');
        }

        function updateToolbarStats() {
            if (!toolbar) return;
            const all    = [...document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];
            const scored = all.filter(n => Number(n.dataset.gbRecoScore || 0) > 0);
            const top    = scored.map(n => Number(n.dataset.gbRecoScore || 0)).sort((a, b) => b - a)[0] || 0;
            const el     = toolbar.querySelector('.gb-reco-stats');
            if (el) el.textContent = `Hits: ${scored.length}/${all.length} · Top: ${formatScore(top)} · Tags: ${profile ? Object.keys(profile.weights).length : 0}`;
        }

        function setSearchForTopTags() {
            if (!profile?.topTags?.length) return;
            const input = document.querySelector('#tags-search'); if (!input) return;
            input.value = profile.topTags.slice(0, 8).map(x => x.tag.replace(/\s+/g, '_')).join(' ');
            input.closest('form')?.submit();
        }

        function mountToolbar() {
            const navSub = document.querySelector('.navSubmenu');
            if (!navSub || document.getElementById('gb-reco-toolbar')) return;

            const wrap = document.createElement('span');
            wrap.id = 'gb-reco-toolbar'; wrap.className = 'gb-reco-toolbar';
            wrap.innerHTML = `
                <a href="javascript:void(0)" class="gb-reco-link" data-act="rebuild">Rebuild Reco</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="toggle-sort">Sort: ${S().RecoSortMode === 'none' ? 'Off' : 'On'}</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="toggle-hide">Hide Weak: ${S().RecoHideWeak ? 'On' : 'Off'}</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="top-tags">Use Top Tags</a>
                <span class="gb-reco-status" style="margin-left:10px;opacity:.8;font-size:12px"></span>
                <span class="gb-reco-stats"  style="margin-left:10px;opacity:.8;font-size:12px"></span>
            `;
            wrap.addEventListener('click', async e => {
                const btn = e.target.closest('[data-act]'); if (!btn) return;
                e.preventDefault();
                const act = btn.getAttribute('data-act');

                if (act === 'rebuild') {
                    try { await buildProfile(true); applyTo(); }
                    catch (err) { console.error('[GBReco] rebuild failed', err); setToolbarStatus('Rebuild failed'); }
                    return;
                }
                if (act === 'toggle-sort') {
                    S().RecoSortMode = S().RecoSortMode === 'none' ? 'score' : 'none';
                    NS.saveSettings?.();
                    btn.textContent = `Sort: ${S().RecoSortMode === 'none' ? 'Off' : 'On'}`;
                    if (S().RecoSortMode !== 'none') resortGrid();
                    return;
                }
                if (act === 'toggle-hide') {
                    S().RecoHideWeak = !S().RecoHideWeak;
                    NS.saveSettings?.();
                    btn.textContent = `Hide Weak: ${S().RecoHideWeak ? 'On' : 'Off'}`;
                    applyTo(); return;
                }
                if (act === 'top-tags') setSearchForTopTags();
            });
            navSub.appendChild(wrap);
            toolbar = wrap;
        }

        // ─────────────────────────────────────────────────────
        //  STYLES
        // ─────────────────────────────────────────────────────
        function addStyles() {
            if (document.getElementById('gb-reco-style')) return;
            const s = document.createElement('style'); s.id = 'gb-reco-style';
            s.textContent = `
                .gb-reco-toolbar{ margin-left:12px; }
                .gb-reco-link{ margin-left:10px; color:var(--gb-primary,#5d8eff); text-decoration:none; font-weight:700; cursor:pointer; }
                .gb-reco-link:hover{ filter:brightness(1.1); }
                .gb-reco-wrap{ position:relative; display:inline-block; line-height:0; border-radius:8px; overflow:hidden; }
                .gb-reco-badge{
                    position:absolute; top:6px; left:6px; z-index:4;
                    min-height:22px; padding:2px 7px; border-radius:6px;
                    background:rgba(15,23,42,.86); color:#f8fafc;
                    font:700 12px/18px system-ui,sans-serif;
                    box-shadow:0 2px 6px rgba(0,0,0,.25); pointer-events:none;
                }
                .gb-reco-reason{
                    position:absolute; left:6px; right:6px; bottom:6px; z-index:4;
                    padding:3px 6px; border-radius:6px;
                    background:rgba(15,23,42,.72); color:#e2e8f0;
                    font:11px/1.25 system-ui,sans-serif;
                    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;
                }
                .thumbnail-preview.gb-reco-hit,
                .thumb.gb-reco-hit,
                .content .thumb.gb-reco-hit{ transform:translateY(-1px); }
                .thumbnail-preview.gb-reco-hidden,
                .thumb.gb-reco-hidden,
                .content .thumb.gb-reco-hidden{ display:none !important; }
            `;
            document.head.appendChild(s);
        }

        // ─────────────────────────────────────────────────────
        //  INIT
        // ─────────────────────────────────────────────────────
        async function initReco() {
            if (S().RecoEnabled === false) return;
            mountToolbar();
            setToolbarStatus('Initializing…');

            if (S().RecoAutoBuild === false) {
                profile = loadProfileFromLS();
                if (profile) { setToolbarStatus(`Profile cached (${profile.postCount} posts)`); applyTo(); }
                else setToolbarStatus('AutoBuild disabled – no cached profile');
                return;
            }

            try {
                await buildProfile(false);
                applyTo();
            } catch (err) {
                console.error('[GBReco] init failed:', err);
                setToolbarStatus('Reco unavailable');
            }
        }

        return {
            async init(ctx) {
                if (ctx?.settings?.Recommendations === false) return;
                addStyles();
                mountToolbar();
                const handler = nodes => applyTo(nodes);
                ctx.bus.on('newThumbs', handler);
                unsub = () => ctx.bus.off('newThumbs', handler);
                await initReco();
                applyTo(document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb'));
            },
            destroy() {
                unsub?.();
                toolbar?.remove?.();
            }
        };
    })());
})();