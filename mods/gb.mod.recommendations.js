(function () {
    'use strict';

    const NS = window.GBSuite || (window.GBSuite = {});
    if (NS.__gbRecommendationsLoaded) return;
    NS.__gbRecommendationsLoaded = true;

    const LS_PROFILE = 'gbReco.profile.v1';
    const LS_STATE = 'gbReco.state.v1';

    const DEFAULTS = {
        Recommendations: true,
        RecoEnabled: true,
        RecoAutoBuild: true,
        RecoUseApi: true,
        RecoMaxPages: 250,
        RecoPageLimit: 100,
        RecoMinTagCount: 2,
        RecoMinScoreToShow: 0,
        RecoSortMode: 'score',      // score | none
        RecoHideWeak: false,
        RecoWeightMode: 'freq',     // freq | tfidf
        RecoNormalizeByTagCount: true,
        RecoShowBadge: true,
        RecoShowReason: true,
        RecoIgnoreTags:
            '1girl 1boy solo rating:safe rating:questionable rating:explicit highres absurdres commentary request commentary',
        RecoCacheHours: 24,
        RecoDecayRecent: false
    };

    Object.assign(NS.settings || {}, Object.fromEntries(
        Object.entries(DEFAULTS).filter(([k]) => !(k in (NS.settings || {})))
    ));

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
                            <option value="freq" ${S.RecoWeightMode === 'freq' ? 'selected' : ''}>Frequency</option>
                            <option value="tfidf" ${S.RecoWeightMode === 'tfidf' ? 'selected' : ''}>TF-IDF Light</option>
                        </select>
                    </div>

                    <div class="gb-form-row">
                        <label>Sortierung</label>
                        <select id="gb-reco-sort" class="gb-inp" style="width:auto">
                            <option value="score" ${S.RecoSortMode !== 'none' ? 'selected' : ''}>Nach Score sortieren</option>
                            <option value="none" ${S.RecoSortMode === 'none' ? 'selected' : ''}>Nicht sortieren</option>
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
                        <input id="gb-reco-maxpages" class="gb-inp" type="number" min="1" max="1000" step="1" style="width:10ch" value="${Number(S.RecoMaxPages ?? 250)}">
                        <span style="opacity:.7;font-size:12px">100 Posts pro API-Seite</span>
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
                        <textarea id="gb-reco-ignore" class="gb-inp" style="width:100%;height:110px;font:13px ui-monospace,Consolas,monospace;">${escapeHtml(String(S.RecoIgnoreTags || ''))}</textarea>
                    </div>

                    <div class="gb-form-row" style="opacity:.75;font-size:12px">
                        Nutzt dein vorhandenes ApiUserId/API Key Setting. Profil wird aus deinen Gelbooru Favorites gebaut.
                    </div>
                `;
            },
            collect(settings, container) {
                settings.RecoEnabled = !!container.querySelector('#gb-reco-enabled')?.checked;
                settings.RecoAutoBuild = !!container.querySelector('#gb-reco-autobuild')?.checked;
                settings.RecoWeightMode = container.querySelector('#gb-reco-weight')?.value || 'freq';
                settings.RecoSortMode = container.querySelector('#gb-reco-sort')?.value || 'score';
                settings.RecoMinScoreToShow = Number(container.querySelector('#gb-reco-minscore')?.value ?? 0) || 0;
                settings.RecoHideWeak = !!container.querySelector('#gb-reco-hideweak')?.checked;
                settings.RecoMinTagCount = Math.max(1, Number(container.querySelector('#gb-reco-mintagcount')?.value ?? 2) || 2);
                settings.RecoMaxPages = Math.max(1, Number(container.querySelector('#gb-reco-maxpages')?.value ?? 250) || 250);
                settings.RecoCacheHours = Math.max(1, Number(container.querySelector('#gb-reco-cachehours')?.value ?? 24) || 24);
                settings.RecoNormalizeByTagCount = !!container.querySelector('#gb-reco-normtags')?.checked;
                settings.RecoShowBadge = !!container.querySelector('#gb-reco-badge')?.checked;
                settings.RecoShowReason = !!container.querySelector('#gb-reco-reason')?.checked;
                settings.RecoIgnoreTags = container.querySelector('#gb-reco-ignore')?.value || '';
            }
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    window.GBSuite.register('Recommendations', (function () {
        let unsub = null;
        let ctxRef = null;
        let profile = null;
        let currentScores = new Map();
        let currentNodes = [];
        let toolbar = null;
        let mutationScheduled = false;
        let isBuilding = false;

        function dbg(...args) {
            // console.log('[GBReco]', ...args);
        }

        function S() {
            return window.GBSuite?.settings || {};
        }

        function now() {
            return Date.now();
        }

        function saveState(partial) {
            try {
                const cur = JSON.parse(localStorage.getItem(LS_STATE) || '{}');
                localStorage.setItem(LS_STATE, JSON.stringify({ ...cur, ...partial }));
            } catch { }
        }

        function loadState() {
            try {
                return JSON.parse(localStorage.getItem(LS_STATE) || '{}');
            } catch {
                return {};
            }
        }

        function normalizeTag(s) {
            return String(s || '')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function denormalizeTag(s) {
            return String(s || '').trim().replace(/\s+/g, '_');
        }

        function getIgnoreSet() {
            const raw = String(S().RecoIgnoreTags || '');
            return new Set(
                raw.split(/\r?\n|,|\s+/g)
                    .map(normalizeTag)
                    .filter(Boolean)
            );
        }

        function getPostIdFromThumb(node) {
            if (!node) return null;
            const a = node.querySelector('a[id^="p"], a[href*="&id="], a[href*="?id="]');
            if (!a) return null;
            if (a.id && /^p\d+$/.test(a.id)) return Number(a.id.slice(1));
            try {
                const u = new URL(a.href, location.origin);
                const id = Number(u.searchParams.get('id'));
                return Number.isFinite(id) ? id : null;
            } catch {
                return null;
            }
        }

        function extractTagsFromThumb(node) {
            const img = node?.querySelector('img');
            if (!img) return [];
            const alt = img.getAttribute('alt') || '';
            let part = alt;
            const pipeIndex = part.indexOf('|');
            if (pipeIndex >= 0) part = part.slice(pipeIndex + 1);

            return part
                .split(',')
                .map(normalizeTag)
                .filter(Boolean);
        }

        function getThumbAnchor(node) {
            return node?.querySelector('a[id^="p"], a[href]');
        }

        function ensureOverlayHost(anchor) {
            const img = anchor?.querySelector('img');
            if (!img) return null;

            let host = img.closest('.gb-anim-wrap') || img.closest('.gb-overlay-wrap') || img.closest('.gb-reco-wrap');
            if (host && host.classList.contains('gb-reco-wrap')) return host;

            host = document.createElement('span');
            host.className = 'gb-reco-wrap';
            const br = getComputedStyle(img).borderRadius;
            if (br && br !== '0px') host.style.borderRadius = br;
            img.style.display = 'block';
            img.parentNode.insertBefore(host, img);
            host.appendChild(img);
            return host;
        }

        function ensureBadge(anchor) {
            const host = ensureOverlayHost(anchor);
            if (!host) return null;
            let badge = host.querySelector('.gb-reco-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'gb-reco-badge';
                host.appendChild(badge);
            }
            return badge;
        }

        function ensureReason(anchor) {
            const host = ensureOverlayHost(anchor);
            if (!host) return null;
            let reason = host.querySelector('.gb-reco-reason');
            if (!reason) {
                reason = document.createElement('div');
                reason.className = 'gb-reco-reason';
                host.appendChild(reason);
            }
            return reason;
        }

        function loadProfileFromCache() {
            try {
                const raw = JSON.parse(localStorage.getItem(LS_PROFILE) || 'null');
                if (!raw || typeof raw !== 'object') return null;
                return raw;
            } catch {
                return null;
            }
        }

        function saveProfileToCache(data) {
            localStorage.setItem(LS_PROFILE, JSON.stringify(data));
        }

        function profileStillFresh(p) {
            if (!p?.ts) return false;
            const hours = Math.max(1, Number(S().RecoCacheHours ?? 24));
            return (now() - p.ts) < hours * 60 * 60 * 1000;
        }

        async function fetchFavoritePostsViaApi(userId, apiKey) {
            const maxPages = Math.max(1, Number(S().RecoMaxPages ?? 250));
            const pageLimit = Math.max(1, Number(S().RecoPageLimit ?? 100));

            const base = new URL(location.origin + '/index.php');
            base.searchParams.set('page', 'dapi');
            base.searchParams.set('s', 'post');
            base.searchParams.set('q', 'index');
            base.searchParams.set('json', '1');
            base.searchParams.set('limit', String(pageLimit));
            base.searchParams.set('tags', `fav:${userId}`);
            if (apiKey && userId) {
                base.searchParams.set('api_key', apiKey);
                base.searchParams.set('user_id', userId);
            }

            const posts = [];
            for (let pid = 0; pid < maxPages; pid++) {
                base.searchParams.set('pid', String(pid));
                const resp = await fetch(base.toString(), {
                    credentials: 'same-origin',
                    cache: 'no-cache'
                });
                if (!resp.ok) break;

                let data = null;
                try { data = await resp.json(); } catch { data = null; }

                const arr = Array.isArray(data) ? data : (Array.isArray(data?.post) ? data.post : []);
                if (!arr.length) break;

                for (const p of arr) {
                    const tags = String(p.tags || p?.['@attributes']?.tags || '').trim();
                    const id = Number(p.id ?? p?.['@attributes']?.id);
                    if (!tags) continue;
                    posts.push({ id, tags });
                }

                if (arr.length < pageLimit) break;
            }
            return posts;
        }

        async function fetchFavoritePostsViaHtml(userId) {
            const maxPages = Math.max(1, Number(S().RecoMaxPages ?? 250));
            const posts = [];

            for (let page = 0; page < maxPages; page++) {
                const u = new URL(location.origin + '/index.php');
                u.searchParams.set('page', 'favorites');
                u.searchParams.set('s', 'view');
                u.searchParams.set('id', userId);
                u.searchParams.set('pid', String(page * 50));

                const resp = await fetch(u.toString(), {
                    credentials: 'same-origin',
                    cache: 'no-cache'
                });
                if (!resp.ok) break;

                const html = await resp.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const thumbs = [...doc.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];
                if (!thumbs.length) break;

                let count = 0;
                for (const n of thumbs) {
                    const id = getPostIdFromThumb(n);
                    const tags = extractTagsFromThumb(n).map(denormalizeTag).join(' ');
                    if (Number.isFinite(id) && tags) {
                        posts.push({ id, tags });
                        count++;
                    }
                }

                if (count < 50) break;
            }

            return posts;
        }

        function buildProfileFromPosts(posts) {
            const ignore = getIgnoreSet();
            const minTagCount = Math.max(1, Number(S().RecoMinTagCount ?? 2));
            const mode = String(S().RecoWeightMode || 'freq');

            const tagFreq = new Map();
            const docFreq = new Map();
            let docCount = 0;

            for (const post of posts) {
                const tags = String(post.tags || '')
                    .split(/\s+/g)
                    .map(normalizeTag)
                    .filter(Boolean)
                    .filter(t => !ignore.has(t));

                if (!tags.length) continue;

                docCount++;
                const seen = new Set();

                for (const t of tags) {
                    tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
                    if (!seen.has(t)) {
                        docFreq.set(t, (docFreq.get(t) || 0) + 1);
                        seen.add(t);
                    }
                }
            }

            const weights = {};
            const rawCounts = {};
            for (const [tag, freq] of tagFreq.entries()) {
                if (freq < minTagCount) continue;
                rawCounts[tag] = freq;

                if (mode === 'tfidf') {
                    const df = docFreq.get(tag) || 1;
                    const idf = Math.log((1 + docCount) / (1 + df)) + 1;
                    weights[tag] = freq * idf;
                } else {
                    weights[tag] = freq;
                }
            }

            const entries = Object.entries(weights).sort((a, b) => b[1] - a[1]);
            const topTags = entries.slice(0, 300).map(([tag, weight]) => ({
                tag,
                weight,
                count: rawCounts[tag] || 0
            }));

            return {
                ts: now(),
                sourceUserId: String(S().ApiUserId || '').trim(),
                sourceMode: mode,
                docCount,
                postCount: posts.length,
                weights,
                rawCounts,
                topTags
            };
        }

        async function buildProfile(force = false) {
            if (isBuilding) return profile;
            isBuilding = true;
            setToolbarStatus('Building profile…');

            try {
                const userId = String(S().ApiUserId || '').trim();
                const apiKey = String(S().ApiKey || '').trim();

                if (!userId) {
                    setToolbarStatus('No ApiUserId set');
                    throw new Error('Reco requires ApiUserId in Suite Settings');
                }

                if (!force) {
                    const cached = loadProfileFromCache();
                    if (
                        cached &&
                        cached.sourceUserId === userId &&
                        cached.sourceMode === String(S().RecoWeightMode || 'freq') &&
                        profileStillFresh(cached)
                    ) {
                        profile = cached;
                        setToolbarStatus(`Profile cached (${cached.postCount} favs)`);
                        return profile;
                    }
                }

                let posts = [];
                if (S().RecoUseApi !== false) {
                    try {
                        posts = await fetchFavoritePostsViaApi(userId, apiKey);
                    } catch (e) {
                        dbg('API profile build failed, fallback to HTML', e);
                    }
                }

                if (!posts.length) {
                    posts = await fetchFavoritePostsViaHtml(userId);
                }

                if (!posts.length) {
                    setToolbarStatus('No favorites found');
                    throw new Error('Could not load favorite posts');
                }

                profile = buildProfileFromPosts(posts);
                saveProfileToCache(profile);
                setToolbarStatus(`Profile ready (${profile.postCount} favs, ${Object.keys(profile.weights).length} tags)`);
                return profile;
            } finally {
                isBuilding = false;
            }
        }

        function scoreTags(tags) {
            if (!profile?.weights) return { score: 0, matched: [] }

            const weights = profile.weights
            const favArtists = new Set((window.GBSuite.settings.TagFavs_Artists || []).map(t => t.toLowerCase()))
            const favChars   = new Set((window.GBSuite.settings.TagFavs_Characters || []).map(t => t.toLowerCase()))

            // Heavily nerf generic tags that are common in many posts, even if they appear in the profile. This helps to surface more unique matches.
            const GENERIC_TAGS = new Set([
                "breasts","large breasts","long hair","blush",
                "looking at viewer","navel","smile","thighs"
            ])

            let sum = 0
            const matched = []

            for (const t of tags) {
                const tag = t.toLowerCase()

                let w = weights[tag] || 0

                // GENERIC NERF
                if (GENERIC_TAGS.has(tag)) {
                    w *= 0.2
                }

                // ARTIST BOOST
                if (favArtists.has(tag)) {
                    w += 5000
                }

                // CHARACTER BOOST
                if (favChars.has(tag)) {
                    w += 3000
                }

                if (w > 0) {
                    sum += w
                    matched.push([tag, w])
                }
            }

            matched.sort((a, b) => b[1] - a[1])

            if (window.GBSuite.settings.RecoNormalizeByTagCount !== false) {
                sum = sum / Math.max(1, Math.sqrt(tags.length))
            }

            return {
                score: sum,
                matched: matched.slice(0, 5)
            }
        }

        function formatScore(score) {
            if (score >= 1000) return (score / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
            if (score >= 100) return Math.round(score).toString();
            if (score >= 10) return score.toFixed(1).replace(/\.0$/, '');
            return score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        }

        function applyScoreToNode(node) {
            if (!node) return;

            const tags = extractTagsFromThumb(node);
            const anchor = getThumbAnchor(node);
            const postId = getPostIdFromThumb(node);
            if (!anchor || !tags.length) return;

            const result = scoreTags(tags);
            currentScores.set(postId || Symbol(), { node, ...result });

            node.dataset.gbRecoScore = String(result.score || 0);
            node.classList.toggle('gb-reco-hidden', !!S().RecoHideWeak && result.score < Number(S().RecoMinScoreToShow ?? 0));
            node.classList.toggle('gb-reco-hit', result.score > 0);

            if (S().RecoShowBadge !== false) {
                const badge = ensureBadge(anchor);
                if (badge) {
                    if (result.score > 0) {
                        badge.textContent = '★ ' + formatScore(result.score);
                        badge.style.display = '';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }

            if (S().RecoShowReason !== false) {
                const reason = ensureReason(anchor);
                if (reason) {
                    if (result.matched.length) {
                        reason.textContent = result.matched.slice(0, 3).map(([tag]) => tag.replace(/\s+/g, '_')).join(' • ');
                        reason.style.display = '';
                    } else {
                        reason.style.display = 'none';
                    }
                }
            }

            const tooltip = result.matched.length
                ? 'Recommended by: ' + result.matched.map(([tag, w]) => `${tag.replace(/\s+/g, '_')} (${formatScore(w)})`).join(', ')
                : 'No favorite-tag match';
            anchor.title = tooltip;
        }

        function applyTo(nodes) {
            const list = (nodes && nodes.length)
                ? [...nodes]
                : [...document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];

            currentNodes = [...new Set([...currentNodes, ...list])];

            for (const n of list) {
                applyScoreToNode(n);
            }

            if (S().RecoSortMode !== 'none') {
                scheduleResort();
            }

            updateToolbarStats();
        }

        function getGrid() {
            return document.querySelector('.thumbnail-container');
        }

        function scheduleResort() {
            if (mutationScheduled) return;
            mutationScheduled = true;
            requestAnimationFrame(() => {
                mutationScheduled = false;
                resortGrid();
            });
        }

        function resortGrid() {
            const grid = getGrid();
            if (!grid || S().RecoSortMode === 'none') return;

            const thumbs = [...grid.querySelectorAll('.thumbnail-preview')];
            if (!thumbs.length) return;

            const pageDividers = [...grid.querySelectorAll('.gb-page-divider')];
            const sentinel = [...grid.children].find(x => x.style?.height === '1px');

            thumbs.sort((a, b) => {
                const sa = Number(a.dataset.gbRecoScore || '0');
                const sb = Number(b.dataset.gbRecoScore || '0');
                return sb - sa;
            });

            for (const t of thumbs) grid.appendChild(t);
            for (const d of pageDividers) grid.appendChild(d);
            if (sentinel) grid.appendChild(sentinel);
        }

        function setToolbarStatus(text) {
            if (!toolbar) return;
            const el = toolbar.querySelector('.gb-reco-status');
            if (el) el.textContent = text || '';
        }

        function updateToolbarStats() {
            if (!toolbar) return;
            const all = [...document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb')];
            const scored = all.filter(n => Number(n.dataset.gbRecoScore || '0') > 0);
            const top = scored
                .map(n => Number(n.dataset.gbRecoScore || '0'))
                .sort((a, b) => b - a)[0] || 0;

            const el = toolbar.querySelector('.gb-reco-stats');
            if (el) {
                el.textContent =
                    `Hits: ${scored.length}/${all.length}` +
                    ` · Top: ${formatScore(top)}` +
                    ` · Tags: ${profile ? Object.keys(profile.weights || {}).length : 0}`;
            }
        }

        function setSearchForTopTags() {
            if (!profile?.topTags?.length) return;
            const input = document.querySelector('#tags-search');
            if (!input) return;

            const tags = profile.topTags
                .slice(0, 8)
                .map(x => x.tag.replace(/\s+/g, '_'));

            input.value = tags.join(' ');
            const form = input.closest('form');
            if (form) form.submit();
        }

        function mountToolbar() {
            const navSub = document.querySelector('.navSubmenu');
            if (!navSub || document.getElementById('gb-reco-toolbar')) return;

            const wrap = document.createElement('span');
            wrap.id = 'gb-reco-toolbar';
            wrap.className = 'gb-reco-toolbar';
            wrap.innerHTML = `
                <a href="javascript:void(0)" class="gb-reco-link" data-act="rebuild">Rebuild Reco</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="toggle-sort">Sort: ${S().RecoSortMode === 'none' ? 'Off' : 'On'}</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="toggle-hide">Hide Weak: ${S().RecoHideWeak ? 'On' : 'Off'}</a>
                <a href="javascript:void(0)" class="gb-reco-link" data-act="top-tags">Use Top Tags</a>
                <span class="gb-reco-status" style="margin-left:10px;opacity:.8"></span>
                <span class="gb-reco-stats" style="margin-left:10px;opacity:.8"></span>
            `;

            wrap.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-act]');
                if (!btn) return;
                e.preventDefault();

                const act = btn.getAttribute('data-act');
                if (act === 'rebuild') {
                    try {
                        await buildProfile(true);
                        applyTo();
                    } catch (err) {
                        console.error('[GBReco] rebuild failed', err);
                        setToolbarStatus('Rebuild failed');
                    }
                    return;
                }

                if (act === 'toggle-sort') {
                    S().RecoSortMode = S().RecoSortMode === 'none' ? 'score' : 'none';
                    window.GBSuite?.saveSettings?.();
                    btn.textContent = `Sort: ${S().RecoSortMode === 'none' ? 'Off' : 'On'}`;
                    if (S().RecoSortMode !== 'none') resortGrid();
                    return;
                }

                if (act === 'toggle-hide') {
                    S().RecoHideWeak = !S().RecoHideWeak;
                    window.GBSuite?.saveSettings?.();
                    btn.textContent = `Hide Weak: ${S().RecoHideWeak ? 'On' : 'Off'}`;
                    applyTo();
                    return;
                }

                if (act === 'top-tags') {
                    setSearchForTopTags();
                }
            });

            navSub.appendChild(wrap);
            toolbar = wrap;
        }

        function addStyles() {
            const css = `
                .gb-reco-toolbar{ margin-left:12px; }
                .gb-reco-link{
                    margin-left:10px;
                    color: var(--gb-primary, #5d8eff);
                    text-decoration:none;
                    font-weight:700;
                    cursor:pointer;
                }
                .gb-reco-link:hover{ filter: brightness(1.1); }

                .gb-reco-wrap{
                    position:relative;
                    display:inline-block;
                    line-height:0;
                    border-radius:8px;
                    overflow:hidden;
                }

                .gb-reco-badge{
                    position:absolute;
                    top:6px;
                    left:6px;
                    z-index:4;
                    min-height:22px;
                    padding:2px 7px;
                    border-radius:6px;
                    background:rgba(15, 23, 42, .86);
                    color:#f8fafc;
                    font:700 12px/18px system-ui, sans-serif;
                    box-shadow:0 2px 6px rgba(0,0,0,.25);
                    pointer-events:none;
                }

                .gb-reco-reason{
                    position:absolute;
                    left:6px;
                    right:6px;
                    bottom:6px;
                    z-index:4;
                    padding:3px 6px;
                    border-radius:6px;
                    background:rgba(15, 23, 42, .72);
                    color:#e2e8f0;
                    font:11px/1.25 system-ui, sans-serif;
                    white-space:nowrap;
                    overflow:hidden;
                    text-overflow:ellipsis;
                    pointer-events:none;
                }

                .thumbnail-preview.gb-reco-hit,
                .thumb.gb-reco-hit,
                .content .thumb.gb-reco-hit{
                    transform: translateY(-1px);
                }

                .thumbnail-preview.gb-reco-hidden,
                .thumb.gb-reco-hidden,
                .content .thumb.gb-reco-hidden{
                    display:none !important;
                }
            `;
            const s = document.createElement('style');
            s.id = 'gb-reco-style';
            s.textContent = css;
            document.head.appendChild(s);
        }

        async function initReco() {
            if (S().RecoEnabled === false) return;

            mountToolbar();
            setToolbarStatus('Initializing…');

            const shouldAutoBuild = S().RecoAutoBuild !== false;
            if (!shouldAutoBuild) {
                profile = loadProfileFromCache();
                if (profile) {
                    setToolbarStatus(`Profile cached (${profile.postCount} favs)`);
                    applyTo();
                } else {
                    setToolbarStatus('AutoBuild disabled');
                }
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
                ctxRef = ctx;
                addStyles();
                mountToolbar();

                const handler = (nodes) => applyTo(nodes);
                ctx.bus.on('newThumbs', handler);
                unsub = () => ctx.bus.off('newThumbs', handler);

                await initReco();

                applyTo(document.querySelectorAll('.thumbnail-preview, .thumb, .content .thumb'));
                saveState({ lastInit: now() });
            },
            destroy() {
                unsub?.();
                toolbar?.remove?.();
            }
        };
    })());
})();