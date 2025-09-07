(function () {
    window.GBSuite.register('TagGroups', (function () {
        const LS_FAVS = 'gbFavTagGroups';
        const { el } = (window.GBSuite.util || { el: (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; } });

        let searchInput, favWrap, favBar;

        function loadFavs() { try { return JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); } catch { return []; } }
        function saveFavs(arr) { localStorage.setItem(LS_FAVS, JSON.stringify(arr)); }
        const tagsToQuery = (t) => String(t || '').trim();

        function appendToSearch(text) {
            const add = tagsToQuery(text); if (!add) return;
            const cur = searchInput.value || '';
            searchInput.value = (cur && !/\s$/.test(cur) ? cur + ' ' : cur) + add;
            searchInput.focus();
        }
        function removeFromSearch(text) {
            const t = tagsToQuery(text); if (!t) return;
            const cur = searchInput.value || '';
            const re = new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'g');
            searchInput.value = cur.replace(re, ' ').replace(/\s+/g, ' ').trim();
            searchInput.focus();
        }
        function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
        function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

        (function styles() {
            if (document.getElementById('gb-tg-style')) return;
            const s = document.createElement('style'); s.id = 'gb-tg-style';
            s.textContent = `
        .gb-favwrap{ margin-top:8px; padding:8px 10px; background:var(--gb-bg-muted,#232634);
          border-top:1px solid var(--gb-border,#2e3140); border-bottom:1px solid var(--gb-border-dark,#202334); }
        .gb-favbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .gb-chip{ display:inline-flex; align-items:center; gap:8px; border:1px solid var(--gb-chip-border,#2f3446);
          border-radius:9999px; padding:7px 12px; background:var(--gb-chip-bg,#1d1f28); color:var(--gb-text,#fff); font:12px system-ui,sans-serif; cursor:pointer; }
        .gb-chip .gb-minus{ margin-left:4px; border:none; background:transparent; color:var(--gb-danger,#ff6b6b); font-weight:700; cursor:pointer; padding:0 6px; border-radius:6px; }
        .gb-chip .gb-minus:hover{ background: rgba(210,60,60,.2); color:#fff; }
        .gb-modal .gb-inp, .gb-modal textarea{ width:100%; box-sizing:border-box; background:var(--gb-bg-muted,#232634);
          color:var(--gb-text,#fff); border:1px solid var(--gb-border,#2e3140); border-radius:8px; padding:8px; font:13px/1.35 ui-monospace,Consolas,monospace; }
        .gb-modal textarea{ min-height:92px; resize:vertical; }
        .gb-suite-btn{ background: var(--gb-primary-contrast,#e6ecff); color: var(--gb-primary,#3452ff); border:1px solid var(--gb-border,#2e3140); border-radius:8px; padding:6px 10px; cursor:pointer; font:12px system-ui,sans-serif; }
        .gb-table{ width:100%; border-collapse:separate; border-spacing:0; table-layout:auto; }
        .gb-table th, .gb-table td{ padding:10px; border-bottom:1px solid var(--gb-border,#2e3140); vertical-align:top; }
        .gb-table thead th{ position:sticky; top:0; background:var(--gb-table-head-bg,#11131a); color:#fff; text-align:left; font-weight:700; z-index:2; }
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
                chip.type = 'button'; chip.className = 'gb-chip'; chip.title = f.tags;
                chip.addEventListener('click', () => appendToSearch(f.tags));

                const title = el('span', 'gb-title'); title.textContent = f.title;
                const plus = el('span', 'gb-plus', '＋');

                const minus = document.createElement('button');
                minus.type = 'button'; minus.textContent = '−'; minus.className = 'gb-minus';
                minus.title = 'Entfernt diese Tags aus der Suchleiste';
                minus.addEventListener('click', e => { e.stopPropagation(); removeFromSearch(f.tags); });

                chip.appendChild(title); chip.appendChild(plus); chip.appendChild(minus);
                favBar.appendChild(chip);
            });
        }

        function openFavModal() {
            const overlay = el('div', 'gb-ovl');
            const modal = el('div', 'gb-modal');
            overlay.appendChild(modal);

            document.documentElement.classList.add('gb-lock-scroll');
            document.body.classList.add('gb-lock-scroll');

            overlay.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
            overlay.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });

            document.body.appendChild(overlay);

            function close() {
                overlay.remove();
                document.documentElement.classList.remove('gb-lock-scroll');
                document.body.classList.remove('gb-lock-scroll');
            }

            function repaint() {
                const favs = loadFavs();
                modal.innerHTML = `
                    <h3>Favorite Tag-Groups</h3>
                    <div style="opacity:.75;font-size:12px;margin-bottom:6px">Tippe Tags – Vorschläge erscheinen wie in der Suche. Navigation: ↑/↓, Enter/Tab, Esc.</div>
                    <table class="gb-table"><thead>
                        <tr><th style="width:18ch">Titel</th><th>Tags-Text</th><th>Aktion</th></tr>
                    </thead><tbody id="gb-rows"></tbody></table>
                    <div style="margin-top:14px; display:grid; grid-template-columns: 22ch 1fr; gap:10px; align-items:start">
                        <input id="gb-new-title" class="gb-inp" placeholder="Neuer Titel">
                        <textarea id="gb-new-tags" class="gb-inp" placeholder="{feet ~ pov ~ footjob}"></textarea>
                    </div>
                    <div class="gb-row" style="margin-top:10px">
                        <button class="gb-suite-btn" id="gb-add">Hinzufügen</button>
                        <button class="gb-suite-btn" id="gb-close">Schließen</button>
                    </div>
                `;

                const tbody = modal.querySelector('#gb-rows'); tbody.innerHTML = '';
                favs.forEach((f, i) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><input class="gb-inp" data-k="title" value="${escapeAttr(f.title)}"></td>
                        <td><textarea class="gb-inp gb-ac-bind" data-k="tags">${escapeHtml(f.tags)}</textarea></td>
                        <td>
                        <button class="gb-suite-btn" data-act="apply">+ Suche</button>
                        <button class="gb-suite-btn" data-act="up">▲</button>
                        <button class="gb-suite-btn" data-act="down">▼</button>
                        <button class="gb-suite-btn" data-act="del">Löschen</button>
                        </td>
                    `;
                    tr.querySelectorAll('[data-k]').forEach(inp => {
                        inp.addEventListener('change', () => {
                            const key = inp.getAttribute('data-k');
                            favs[i][key] = inp.value; saveFavs(favs); renderChips();
                        });
                    });
                    tr.querySelector('[data-act="apply"]').addEventListener('click', () => appendToSearch(favs[i].tags));
                    tr.querySelector('[data-act="del"]').addEventListener('click', () => { favs.splice(i, 1); saveFavs(favs); repaint(); renderChips(); });
                    tr.querySelector('[data-act="up"]').addEventListener('click', () => { if (i === 0) return; const t = favs[i - 1]; favs[i - 1] = favs[i]; favs[i] = t; saveFavs(favs); repaint(); renderChips(); });
                    tr.querySelector('[data-act="down"]').addEventListener('click', () => { if (i === favs.length - 1) return; const t = favs[i + 1]; favs[i + 1] = favs[i]; favs[i] = t; saveFavs(favs); repaint(); renderChips(); });

                    // bind autocomplete via helper
                    tr.querySelectorAll('textarea.gb-ac-bind').forEach(ta => window.GBSuite.tagAutocomplete?.bind(ta));
                    tbody.appendChild(tr);
                });

                // new row + AC
                const newTags = modal.querySelector('#gb-new-tags');
                window.GBSuite.tagAutocomplete?.bind(newTags);

                modal.querySelector('#gb-add').addEventListener('click', () => {
                    const title = modal.querySelector('#gb-new-title').value.trim();
                    const tags = modal.querySelector('#gb-new-tags').value.trim();
                    if (!title || !tags) return;
                    const list = loadFavs(); list.push({ id: Date.now(), title, tags });
                    saveFavs(list); modal.querySelector('#gb-new-title').value = ''; modal.querySelector('#gb-new-tags').value = '';
                    repaint(); renderChips();
                });
                modal.querySelector('#gb-close').addEventListener('click', close);
            }

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
        <div class="gb-favbar" id="gb-favbar"></div>
        <div class="gb-tools" style="margin-left:auto;display:flex;gap:8px">
          <a href="javascript:void(0)" id="gb-manage" class="gb-suite-btn">Manage Favorites</a>
        </div>
      `;
            searchArea.insertAdjacentElement('afterend', favWrap);
            favBar = favWrap.querySelector('#gb-favbar');
            favWrap.querySelector('#gb-manage').addEventListener('click', openFavModal);

            const quick = document.createElement('a');
            quick.href = 'javascript:void(0)'; quick.textContent = '★ Favorites'; quick.style.marginLeft = '12px';
            quick.addEventListener('click', openFavModal);
            navSub.appendChild(quick);

            renderChips();
        }

        return {
            init(ctx) { if (!ctx?.settings?.TagGroups) return; mountUI(); },
            destroy() { favWrap?.remove?.(); }
        };
    })());
})();
