(function () {
    window.GBSuite.register('TagGroups', (function () {
        const LS_FAVS = 'gbFavTagGroups';
        let searchInput, favWrap, favBar;
        const { el, escapeRegExp } = window.GBSuite.util;

        function loadFavs() { try { return JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); } catch { return []; } }
        function saveFavs(arr) { localStorage.setItem(LS_FAVS, JSON.stringify(arr)); }
        function tagsToQuery(text) { return String(text || '').trim(); }

        function appendToSearch(text) {
            const add = tagsToQuery(text); if (!add) return;
            const cur = searchInput.value || '';
            searchInput.value = (cur && !/\s$/.test(cur) ? cur + ' ' : cur) + add;
            searchInput.focus();
        }
        function removeFromSearch(text) {
            const t = tagsToQuery(text); if (!t) return;
            const cur = searchInput.value || '';
            const re = new RegExp(`(?:^|\\s)${escapeRegExp(t)}(?:\\s|$)`, 'g');
            let next = cur.replace(re, ' ');
            searchInput.value = next.replace(/\s+/g, ' ').trim();
            searchInput.focus();
        }
        function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
        function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

        // Styling (theme-aware via CSS-Variablen)
        (function () {
            const s = document.createElement('style');
            s.textContent = `
                .gb-modal .gb-table{ width:100%; border-collapse:separate; border-spacing:0; table-layout:auto; }
                .gb-modal .gb-table thead th{
                position: sticky; top:0; z-index:2;
                background: var(--gb-table-head-bg); color:#fff; text-align:left; font-weight:700;
                }
                .gb-modal .gb-table th, .gb-modal .gb-table td{
                padding:10px; border-bottom:1px solid var(--gb-border); vertical-align:top;
                }
                .gb-modal .gb-table tbody td:first-child{ width:22ch; }
                .gb-modal .gb-table tbody td:nth-child(3){ white-space:nowrap; width:1%; }

                .gb-modal .gb-inp, .gb-modal textarea{
                width:100%; box-sizing:border-box;
                background: var(--gb-bg-muted); color: var(--gb-text); border:1px solid var(--gb-border);
                border-radius:8px; padding:8px; font:13px/1.35 ui-monospace,Consolas,monospace;
                }
                .gb-modal textarea{ min-height:92px; resize:vertical; }

                .gb-modal .gb-suite-btn{
                background: var(--gb-primary-contrast); color: var(--gb-primary); border:1px solid var(--gb-border);
                border-radius:8px; padding:6px 10px; cursor:pointer; font:12px system-ui,sans-serif;
                }

                .gb-favwrap{
                margin-top:8px; padding:8px 10px; background: var(--gb-bg-muted);
                border-top:1px solid var(--gb-border); border-bottom:1px solid var(--gb-border-dark);
                }
                .gb-favbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

                .gb-chip{
                display:inline-flex; align-items:center; gap:8px;
                border:1px solid var(--gb-chip-border); border-radius:9999px; padding:7px 12px;
                background: var(--gb-chip-bg); color: var(--gb-text); font:12px system-ui,sans-serif; cursor:pointer;
                }
                .gb-chip .gb-minus{
                margin-left:4px; border:none; background:transparent;
                color: var(--gb-danger); font-weight:700; cursor:pointer;
                padding:0 6px; border-radius:6px;
                }
                .gb-chip .gb-minus:hover{
                background: rgba(210,60,60,.2); color:#fff;
                }
            `;
            document.head.appendChild(s);
        })();

        function renderChips() {
            const favs = loadFavs(); favBar.innerHTML = '';
            if (!favs.length) {
                const hint = document.createElement('span');
                hint.style.cssText = 'font:12px system-ui,sans-serif;opacity:.8';
                hint.textContent = 'Keine Favorite Tag-Groups – klicke „Manage Favorites“.';
                favBar.appendChild(hint);
                return;
            }
            favs.forEach((f) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'gb-chip';
                chip.title = f.tags;
                chip.addEventListener('click', () => appendToSearch(f.tags));

                const title = el('span', 'gb-title'); title.textContent = f.title;
                const plus = el('span', 'gb-plus', '＋');

                const minus = document.createElement('button');
                minus.type = 'button';
                minus.textContent = '−';
                minus.className = 'gb-minus';
                minus.setAttribute('aria-label', 'Tags aus Suche entfernen');
                minus.title = 'Entfernt diese Tags aus der Suchleiste';
                minus.addEventListener('click', e => { e.stopPropagation(); removeFromSearch(f.tags); });

                chip.appendChild(title);
                chip.appendChild(plus);
                chip.appendChild(minus);
                favBar.appendChild(chip);
            });
        }

        function openFavModal() {
            const overlay = el('div', 'gb-ovl');
            const modal = el('div', 'gb-modal');
            overlay.appendChild(modal);

            function repaint() {
                const favs = loadFavs();
                modal.innerHTML = `
                    <h3>Favorite Tag-Groups</h3>
                    <div class="gb-row" style="opacity:.8;font-size:12px">Jede Gruppe hat Titel + Tags-Text. Klick auf Chip appends die Tags in die Suche.</div>
                    <table class="gb-table">
                        <thead>
                            <tr>
                                <th style="width:18ch">Titel</th>
                                <th>Tags-Text</th>
                                <th>Aktion</th>
                            </tr>
                        </thead>
                        <tbody id="gb-rows"></tbody>
                    </table>
                    <div class="gb-row" style="margin-top:14px">
                        <input id="gb-new-title" class="gb-inp" style="width:22ch" placeholder="Neuer Titel">
                        <textarea id="gb-new-tags" class="gb-inp" style="flex:1;height:70px;font:13px ui-monospace,Consolas,monospace" placeholder="{feet ~ pov ~ footjob}"></textarea>
                    </div>
                    <div class="gb-row">
                        <button class="gb-suite-btn" id="gb-add">Hinzufügen</button>
                        <button class="gb-suite-btn" id="gb-close">Schließen</button>
                    </div>
                `;

                const tbody = modal.querySelector('#gb-rows'); tbody.innerHTML = '';
                favs.forEach((f, idx) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><input class="gb-inp" data-k="title" value="${escapeAttr(f.title)}" style="width:100%"></td>
                        <td><textarea class="gb-inp" data-k="tags" style="height:70px;width:100%">${escapeHtml(f.tags)}</textarea></td>
                        <td>
                        <button class="gb-suite-btn" data-act="apply">+ Suche</button>
                        <button class="gb-suite-btn" data-act="up">▲</button>
                        <button class="gb-suite-btn" data-act="down">▼</button>
                        <button class="gb-suite-btn" data-act="del">Löschen</button>
                        </td>
                    `;

                    tr.querySelectorAll('[data-k]').forEach(elm => {
                        elm.addEventListener('change', () => {
                            const key = elm.getAttribute('data-k');
                            favs[idx][key] = elm.value;
                            saveFavs(favs);
                            renderChips();
                        });
                    });
                    tr.querySelector('[data-act="apply"]').addEventListener('click', () => appendToSearch(favs[idx].tags));
                    tr.querySelector('[data-act="del"]').addEventListener('click', () => {
                        favs.splice(idx, 1); saveFavs(favs); repaint(); renderChips();
                    });
                    tr.querySelector('[data-act="up"]').addEventListener('click', () => {
                        if (idx === 0) return;
                        const t = favs[idx - 1]; favs[idx - 1] = favs[idx]; favs[idx] = t;
                        saveFavs(favs); repaint(); renderChips();
                    });
                    tr.querySelector('[data-act="down"]').addEventListener('click', () => {
                        if (idx === favs.length - 1) return;
                        const t = favs[idx + 1]; favs[idx + 1] = favs[idx]; favs[idx] = t;
                        saveFavs(favs); repaint(); renderChips();
                    });

                    tbody.appendChild(tr);
                });

                modal.querySelector('#gb-add').addEventListener('click', () => {
                    const title = modal.querySelector('#gb-new-title').value.trim();
                    const tags = modal.querySelector('#gb-new-tags').value.trim();
                    if (!title || !tags) return;
                    const favsCur = loadFavs();
                    favsCur.push({ id: Date.now(), title, tags });
                    saveFavs(favsCur);
                    modal.querySelector('#gb-new-title').value = '';
                    modal.querySelector('#gb-new-tags').value = '';
                    repaint();
                    renderChips();
                });

                modal.querySelector('#gb-close').addEventListener('click', close);
            }

            function close() { overlay.remove(); }
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
            document.body.appendChild(overlay);
            repaint();
        }

        function mountUI() {
            const navSub = document.querySelector('.navSubmenu');
            const searchArea = document.querySelector('.searchArea');
            searchInput = document.querySelector('#tags-search');
            if (!navSub || !searchArea || !searchInput) return;

            favWrap = document.createElement('div');
            favWrap.className = 'gb-favwrap';
            favWrap.innerHTML = `
                <div class="gb-favbar" id="gb-favbar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"></div>
                <div class="gb-tools" style="margin-left:auto;display:flex;gap:8px">
                <a href="javascript:void(0)" id="gb-manage" class="gb-suite-btn">Manage Favorites</a>
                </div>
            `;
            searchArea.insertAdjacentElement('afterend', favWrap);
            favBar = favWrap.querySelector('#gb-favbar');
            favWrap.querySelector('#gb-manage').addEventListener('click', openFavModal);

            const favBtn = document.createElement('a');
            favBtn.href = 'javascript:void(0)';
            favBtn.textContent = '★ Favorites';
            favBtn.style.marginLeft = '12px';
            favBtn.addEventListener('click', openFavModal);
            navSub.appendChild(favBtn);

            renderChips();
        }

        return {
            init(ctx) { if (!ctx?.settings?.TagGroups) return; mountUI(); },
            destroy() { favWrap?.remove?.(); }
        };
    })());
})();