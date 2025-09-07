// GBSuite – TagFavs v4.2 (fix: Suite Settings bleibt, Searchbar 1 Zeile)
(function () {
    const NS = window.GBSuite || (window.GBSuite = {});
    if (NS.TagFavsV42) return; NS.TagFavsV42 = true;

    const S = (NS.settings = NS.settings || {});
    S.TagFavs_Artists = Array.isArray(S.TagFavs_Artists) ? S.TagFavs_Artists : [];
    S.TagFavs_Characters = Array.isArray(S.TagFavs_Characters) ? S.TagFavs_Characters : [];
    const save = () => NS.saveSettings && NS.saveSettings();

    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
    const pretty = s => String(s || '').replace(/_/g, ' ');
    const has = (arr, name) => arr.some(x => norm(x) === norm(name));
    const toggle = (arr, name) => { const k = norm(name); const i = arr.findIndex(x => norm(x) === k); if (i >= 0) { arr.splice(i, 1); return false; } arr.push(k); return true; };

    function getSearchInput() { return document.querySelector('#tags-search'); }
    function getTagsArray() { const i = getSearchInput(); const r = (i?.value || '').trim(); return r ? r.split(/\s+/) : []; }
    function setTagsArray(arr) { const i = getSearchInput(); if (!i) return; i.value = arr.join(' '); i.dispatchEvent(new Event('change', { bubbles: true })); }
    function appendToSearch(t) { if (!t) return; const a = getTagsArray(); a.push(t.trim()); setTagsArray(a); }
    function removeFromSearch(t) { const k = norm(t); setTagsArray(getTagsArray().filter(x => norm(x) !== k)); }

    // --- Sidebar Stars ---
    function mountSidebarStars() {
        const containers = document.querySelectorAll('#tag-list, .tag-list');
        containers.forEach(sec => {
            const headings = [...sec.querySelectorAll('b')].filter(h => /^(artist|character)$/i.test(h.textContent.trim()));
            headings.forEach(h => {
                const kind = /artist/i.test(h.textContent) ? 'artist' : 'character';
                const favArr = kind === 'artist' ? S.TagFavs_Artists : S.TagFavs_Characters;

                const lis = []; let start = (h.closest('li') || h.parentElement);
                for (let n = start && start.nextElementSibling; n; n = n.nextElementSibling) {
                    if (n.querySelector('b')) break;
                    if (!n.matches('li')) break;
                    lis.push(n);
                }
                lis.forEach(li => {
                    const a = li.querySelector('a[href*="&tags="]');
                    if (!a || a._gbStarWired) return; a._gbStarWired = true;
                    const tagName = (a.textContent || '').trim();

                    const star = document.createElement('a');
                    star.href = 'javascript:void(0)';
                    star.title = kind === 'artist' ? 'Favorite artist' : 'Favorite character';
                    star.className = 'gb-suite-btn';
                    star.style.cssText = 'margin-left:6px;padding:0 6px;line-height:18px;font-size:12px;';
                    const refresh = () => { star.textContent = has(favArr, tagName) ? '★' : '☆'; };
                    refresh();
                    star.addEventListener('click', e => { e.preventDefault(); toggle(favArr, tagName); refresh(); save(); });
                    a.insertAdjacentElement('afterend', star);
                });
            });
        });
    }

    // --- Searchbar Button ---
    function mountSearchButton() {
        if (document.getElementById('gb-save-one-tag')) return;
        const form = document.querySelector('.searchArea form');
        const inp = getSearchInput(); if (!form || !inp) return;

        // Breite anpassen: Input kleiner, damit Buttons + Search in 1 Zeile passen
        inp.style.width = 'calc(100% - 280px)';

        const saveBtn = document.createElement('a');
        saveBtn.id = 'gb-save-one-tag';
        saveBtn.href = 'javascript:void(0)';
        saveBtn.textContent = '★ Save Tag';
        saveBtn.className = 'gb-suite-btn';
        saveBtn.style.margin = '0 6px 0 6px';

        // Hinweis-Bubble
        const bubble = document.createElement('div');
        bubble.style.cssText = 'position:absolute;display:none;background:#111;border:1px solid #333;padding:6px 8px;border-radius:8px;font-size:12px;margin-top:6px;z-index:9999;';
        bubble.textContent = 'Bitte genau 1 Tag im Suchfeld haben.';

        const wrap = document.createElement('span'); wrap.style.position = 'relative';
        wrap.appendChild(saveBtn); wrap.appendChild(bubble);

        const menu = document.createElement('div');
        menu.style.cssText = 'position:absolute;display:none;flex-direction:column;gap:6px;background:#1e1e1e;border:1px solid #333;padding:6px;border-radius:8px;top:28px;right:0;';
        const asA = document.createElement('a'); asA.className = 'gb-suite-btn'; asA.textContent = 'Save as Artist';
        const asC = document.createElement('a'); asC.className = 'gb-suite-btn'; asC.textContent = 'Save as Character';
        menu.appendChild(asA); menu.appendChild(asC); wrap.appendChild(menu);

        function oneTagOrWarn() {
            const tags = getTagsArray();
            if (tags.length !== 1) { bubble.style.display = 'block'; setTimeout(() => bubble.style.display = 'none', 1500); return null; }
            return tags[0];
        }
        saveBtn.addEventListener('click', () => { const t = oneTagOrWarn(); if (!t) return; menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex'; });
        function saveCurrent(kind) {
            const t = oneTagOrWarn(); if (!t) return;
            const name = t.replace(/^(artist|character):/i, '');
            const arr = (kind === 'artist') ? S.TagFavs_Artists : S.TagFavs_Characters;
            if (!has(arr, name)) { arr.push(norm(name)); save(); }
            menu.style.display = 'none';
            saveBtn.textContent = '★ Saved'; setTimeout(() => saveBtn.textContent = '★ Save Tag', 800);
        }
        asA.addEventListener('click', () => saveCurrent('artist'));
        asC.addEventListener('click', () => saveCurrent('character'));
        document.addEventListener('click', e => { if (!wrap.contains(e.target)) menu.style.display = 'none'; });

        const first = form.querySelector('div') || form;
        first.insertBefore(wrap, inp);
    }

    // --- Modal ---
    function openModal() {
        const ov = document.createElement('div'); ov.className = 'gb-ovl';
        const m = document.createElement('div'); m.className = 'gb-modal gb-tf-modal'; ov.appendChild(m);
        const title = document.createElement('h3'); title.textContent = '★ Fav Tags'; m.appendChild(title);

        document.documentElement.classList.add('gb-lock-scroll');
        document.body.classList.add('gb-lock-scroll');

        ov.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
        ov.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });

        const tabs = document.createElement('div'); tabs.style.cssText = 'display:flex;gap:8px;margin-bottom:10px';
        const tabA = document.createElement('button'); tabA.className = 'gb-suite-btn'; tabA.textContent = 'Artists';
        const tabC = document.createElement('button'); tabC.className = 'gb-suite-btn'; tabC.textContent = 'Characters';
        tabs.appendChild(tabA); tabs.appendChild(tabC); m.appendChild(tabs);

        let active = 'artists';
        const paintTabs = () => {
            tabA.style.filter = active === 'artists' ? 'brightness(1.08)' : '';
            tabC.style.filter = active === 'characters' ? 'brightness(1.08)' : '';
        };

        // Eingabefeld: nur Suche innerhalb gespeicherter Tags
        const row = document.createElement('div'); row.className = 'gb-row';
        const inp = document.createElement('input'); inp.className = 'gb-inp'; inp.placeholder = 'Search favorites…'; inp.style.flex = '1';
        row.appendChild(inp); m.appendChild(row);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow-y:auto;margin-top:8px';
        m.appendChild(list);

        // Scroll nur im Modal erlauben
        list.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
        list.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });

        const actions = document.createElement('div'); actions.className = 'gb-row';
        const close = document.createElement('button');
        close.className = 'gb-suite-btn';
        close.textContent = 'Schließen';
        close.addEventListener('click', () => {
            ov.remove();
            // 🔓 Scroll wieder freigeben
            document.documentElement.classList.remove('gb-lock-scroll');
            document.body.classList.remove('gb-lock-scroll');
        });
        // Overlay-Click
        ov.addEventListener('click', e => {
            if (e.target === ov) {
                ov.remove();
                document.documentElement.classList.remove('gb-lock-scroll');
                document.body.classList.remove('gb-lock-scroll');
            }
        });

        function searchNow(tag) {
            const searchInput = document.querySelector('#tags-search');
            if (searchInput) {
                searchInput.value = tag;
                const form = searchInput.closest('form');
                if (form) form.submit();
            }
        }

        function rowItem(name, kind) {
            const box = document.createElement('div');
            box.style.cssText = `
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding:4px 6px;
                border:1px solid var(--gb-border,#333);
                border-radius:4px;
                background:var(--gb-bg-muted,#262626);
                cursor:pointer;
                position:relative;
            `;

            const label = document.createElement('span');
            label.textContent = pretty(name);
            label.style.flex = '1';
            label.addEventListener('click', () => searchNow(norm(name)));

            const act = document.createElement('span');
            act.style.cssText = 'display:flex;gap:6px;margin-left:8px';

            const plus = document.createElement('a'); plus.href = 'javascript:void(0)'; plus.textContent = '➕';
            const minus = document.createElement('a'); minus.href = 'javascript:void(0)'; minus.textContent = '➖';
            const del = document.createElement('a'); del.href = 'javascript:void(0)'; del.textContent = '✕';
            [plus, minus, del].forEach(b => b.className = 'gb-suite-btn');

            plus.addEventListener('click', e => { e.stopPropagation(); appendToSearch(norm(name)); });
            minus.addEventListener('click', e => { e.stopPropagation(); removeFromSearch(name); });
            del.addEventListener('click', e => {
                e.stopPropagation();
                const arr = (kind === 'artist') ? S.TagFavs_Artists : S.TagFavs_Characters;
                const i = arr.findIndex(x => norm(x) === norm(name));
                if (i >= 0) { arr.splice(i, 1); save(); paint(); }
            });

            act.appendChild(plus); act.appendChild(minus); act.appendChild(del);
            box.appendChild(label); box.appendChild(act);

            // --- Hover Preview ---
            let preview;
            box.addEventListener('mouseenter', async () => {
                if (preview) return;
                preview = document.createElement('div');
                preview.style.cssText = `
                    position:absolute;
                    top:100%; left:0;
                    margin-top:4px;
                    background:#111;
                    border:1px solid #333;
                    padding:6px;
                    border-radius:6px;
                    display:grid;
                    grid-template-columns:repeat(3,1fr);
                    gap:4px;
                    z-index:9999;
                    max-width:240px;
                `;
                box.appendChild(preview);

                try {
                    const resp = await fetch(`/index.php?page=post&s=list&tags=${encodeURIComponent(name)}&limit=9`);
                    const html = await resp.text();
                    const tmp = document.createElement('div');
                    tmp.innerHTML = html;
                    const imgs = [...tmp.querySelectorAll('.thumbnail-preview img, #post-list img')].slice(0, 9);
                    if (imgs.length === 0) {
                        preview.textContent = 'Keine Vorschau';
                    } else {
                        imgs.forEach(img => {
                            const url = img.getAttribute('src') || img.getAttribute('data-src');
                            if (!url) return;
                            const clone = document.createElement('img');
                            clone.src = url;
                            clone.style.cssText = 'width:100%;height:auto;object-fit:cover;border-radius:4px;';
                            preview.appendChild(clone);
                        });
                    }
                } catch (e) {
                    preview.textContent = 'Fehler beim Laden';
                }
            });
            box.addEventListener('mouseleave', () => {
                preview?.remove();
                preview = null;
            });

            return box;
        }

        function paint() {
            list.innerHTML = ''; paintTabs();
            const favs = (active === 'artists' ? S.TagFavs_Artists : S.TagFavs_Characters).slice().sort();
            const filter = (inp.value || '').trim().toLowerCase();
            favs.filter(n => !filter || n.toLowerCase().includes(filter))
                .forEach(n => list.appendChild(rowItem(n, active === 'artists' ? 'artist' : 'character')));
        }

        tabA.addEventListener('click', () => { active = 'artists'; paint(); });
        tabC.addEventListener('click', () => { active = 'characters'; paint(); });
        inp.addEventListener('input', () => paint());

        document.body.appendChild(ov); paint();
    }

    // --- Top-Link ---
    function mountTopLink() {
        if (document.getElementById('gb-open-tagfavs')) return;

        const nav = document.querySelector('.navSubmenu');
        if (!nav) return;

        // unseren neuen Link bauen
        const link = document.createElement('a');
        link.id = 'gb-open-tagfavs';
        link.href = 'javascript:void(0)';
        link.textContent = '★ Fav Tags';
        link.className = ''; // wie Blacklist/Favorites → kein gb-suite-btn
        link.style.color = ''; // Standard-Styling vom Theme übernehmen
        link.addEventListener('click', openModal);

        // Suite Settings wieder vor Blacklist sicherstellen
        const blacklist = [...nav.querySelectorAll('a')].find(a => /blacklist/i.test(a.textContent || ''));
        const suite = [...nav.querySelectorAll('a')].find(a => /suite settings/i.test(a.textContent || ''));
        if (suite && blacklist) {
            nav.insertBefore(suite, blacklist); // sicherstellen, dass Suite Settings vor Blacklist bleibt
        }

        // Fav Tags NACH Favorites einfügen
        const favorites = [...nav.querySelectorAll('a')].find(a => /favorites/i.test(a.textContent || ''));
        if (favorites && favorites.parentElement) {
            favorites.parentElement.insertBefore(link, favorites.nextSibling);
        } else {
            nav.appendChild(link);
        }
    }

    function init() { mountTopLink(); mountSearchButton(); mountSidebarStars(); NS.bus?.on?.('newThumbs', () => mountSidebarStars()); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();