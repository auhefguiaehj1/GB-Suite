(function () {
    'use strict';

    const SUITE_NS = 'gbSuite';
    const LS_SETTINGS = 'gbSuite.settings';

    const defaultSettings = {
        InfiniteScroll: true,
        Blacklist: true,
        TagGroups: true,
        Favorites: true,
        Columns: 6,
        ShowHidden: false,
        Theme: 'system',
        AnimatedBorderColor: '#eb2f05',

        // generic for all Modules
        ApiUserId: '',
        ApiKey: '',

        FavMode: 'off'
    };

    function loadSettings() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            const s = Object.assign({}, defaultSettings, raw);
            // Migration alter Keys
            if (!s.ApiUserId && raw.FavUserId) s.ApiUserId = String(raw.FavUserId);
            if (!s.ApiKey && raw.FavApiKey) s.ApiKey = String(raw.FavApiKey);
            return s;
        } catch {
            return { ...defaultSettings };
        }
    }
    const settings = loadSettings();
    function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

    // Event-Bus
    const bus = (() => {
        const map = new Map();
        return {
            on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); },
            off(ev, fn) { map.get(ev)?.delete(fn); },
            emit(ev, p) { map.get(ev)?.forEach(fn => { try { fn(p); } catch (e) { console.error(e); } }); }
        };
    })();

    // Helpers
    function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; }
    function addStyle(css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
    function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // Theme
    function getActiveTheme() {
        const prefDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (settings.Theme === 'dark') return 'dark';
        if (settings.Theme === 'light') return 'light';
        return prefDark ? 'dark' : 'light';
    }
    function applyTheme() {
        const t = getActiveTheme();
        document.documentElement.setAttribute('data-gbsuite-theme', t);
    }
    function syncSiteAccentFromHeader() {
        const t = getActiveTheme();
        if (t !== 'light') return;
        const bar = document.querySelector('.maintabs, .maintab, .navbar, .header, .topbar, .menu, #maintabmenu');
        if (!bar) return;
        const cs = getComputedStyle(bar);
        let col = cs.backgroundColor;
        if ((!col || col === 'rgba(0, 0, 0, 0)' || col === 'transparent') && cs.backgroundImage && cs.backgroundImage !== 'none') {
            const m = cs.backgroundImage.match(/rgba?\([^)]+\)/);
            if (m) col = m[0];
        }
        if (!col || col === 'rgba(0, 0, 0, 0)' || col === 'transparent') col = '#4da3ff';
        document.documentElement.style.setProperty('--gb-table-head-bg', col);
    }
    const _origApplyTheme = applyTheme;
    applyTheme = function () { _origApplyTheme(); syncSiteAccentFromHeader(); };
    function watchSystemTheme() {
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => { if (settings.Theme === 'system') { applyTheme(); } };
        mq.addEventListener?.('change', handler);
    }

    // Settings-Tabs API
    const __gb_settings_tabs = [];
    function addSettingsTab(def) { if (!def || !def.id || !def.title || typeof def.render !== 'function') return; __gb_settings_tabs.push(def); }

    // Modal Locker
    (function addModalLockStyles() {
        if (document.getElementById('gb-lock-style')) return;
        const s = document.createElement('style'); s.id = 'gb-lock-style';
        s.textContent = `
            html.gb-lock-scroll, body.gb-lock-scroll { overflow: hidden !important; }
            .gb-ovl{ position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100000;
                    display:flex; align-items:flex-start; justify-content:center; overscroll-behavior: contain; }
            .gb-modal{ margin-top:6vh; max-height:88vh; overflow:auto; overscroll-behavior: contain; }
        `;
        document.head.appendChild(s);
    })();

    addStyle(`
    .gb-tabs{display:flex;gap:6px;margin:10px 0 12px;border-bottom:1px solid var(--gb-border)}
    .gb-tab-btn{padding:8px 12px;border:1px solid var(--gb-border);border-bottom:none;border-radius:10px 10px 0 0;background:var(--gb-bg-muted);color:var(--gb-text);cursor:pointer;font:13px system-ui,sans-serif}
    .gb-tab-btn.active{background:var(--gb-panel-bg);font-weight:700}
    .gb-tabpanel{display:none}.gb-tabpanel.active{display:block}
    .gb-form-row{display:flex;align-items:center;gap:12px;margin:10px 0}
    .gb-form-row>label{min-width:220px;font-weight:600}
  `);
    addStyle(`
    :root{
      --gb-bg:#ffffff; --gb-bg-muted:#f6f7f8; --gb-text:#111; --gb-text-muted:#444;
      --gb-border:#d0d7e1; --gb-border-dark:#c9ced8;
      --gb-panel-bg:#ffffff; --gb-overlay:rgba(0,0,0,.45);
      --gb-primary:#2a6df4; --gb-primary-contrast:#ffffff;
      --gb-danger:#d23c3c; --gb-chip-bg:#eceff3; --gb-chip-border:#cfd6e0;
      --gb-table-head-bg:#e8eefc;
    }
    [data-gbsuite-theme="dark"]{
      --gb-bg:#1a1a1a; --gb-bg-muted:#2a2a2a; --gb-text:#eee; --gb-text-muted:#bbb;
      --gb-border:#444; --gb-border-dark:#333;
      --gb-panel-bg:#1f1f1f; --gb-overlay:rgba(0,0,0,.55);
      --gb-primary:#5d8eff; --gb-primary-contrast:#0b1224;
      --gb-danger:#ff6b6b; --gb-chip-bg:#2a2a2a; --gb-chip-border:#3f3f3f;
      --gb-table-head-bg:#0b57d0;
    }
    .gb-suite-btn{font:12px system-ui,sans-serif;color:var(--gb-primary);text-decoration:none;border:1px solid var(--gb-border);background:var(--gb-primary-contrast);border-radius:8px;padding:6px 10px;cursor:pointer}
    .gb-ovl{position:fixed;inset:0;background:var(--gb-overlay);display:flex;align-items:center;justify-content:center;z-index:99999}
    .gb-modal{background:var(--gb-panel-bg);color:var(--gb-text);border:1px solid var(--gb-border);border-radius:10px;padding:16px;width:min(800px,95vw);box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif;max-height:90vh;overflow:auto}
    .gb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
    .gb-switch{display:flex;align-items:center;gap:8px}
    .gb-inp{background:var(--gb-bg-muted);color:var(--gb-text);border:1px solid var(--gb-border);border-radius:8px;padding:6px 10px}
    .gb-table{width:100%;border-collapse:collapse;margin-top:6px}
    .gb-table th,.gb-table td{border-bottom:1px solid var(--gb-border);padding:8px;vertical-align:top}
    .gb-table thead th{background:var(--gb-table-head-bg);color:#fff;text-align:left;font-weight:700;position:sticky;top:0;z-index:2}
    .gb-suite-link{background:transparent!important;border:none!important;padding:0!important;margin-left:12px;color:var(--gb-primary)!important;font-weight:700!important;text-decoration:none!important;cursor:pointer}
    .gb-suite-link:hover{filter:brightness(1.08)}
  `);

    // Module-Registry
    const Registry = {
        _mods: {},
        register(name, mod) { this._mods[name] = mod; },
        initEnabled() {
            for (const [name, mod] of Object.entries(this._mods)) {
                if (settings[name] !== false && typeof mod.init === 'function') {
                    try { mod.init({ settings, bus, util: { el, addStyle, escapeRegExp } }); }
                    catch (e) { console.error(`[${SUITE_NS}] init ${name} failed:`, e); }
                }
            }
        }
    };

    // Settings-Modal (Tabs)
    function openSettingsModal() {
        const overlay = el('div', 'gb-ovl');
        const modal = el('div', 'gb-modal');
        overlay.appendChild(modal);

        const generalHTML = `
            <div class="gb-form-row" style="margin-top:2px; gap:18px">
                <label style="min-width:auto; font-weight:700; font-size:16px">Modules aktivieren</label>
                <label class="gb-switch"><input type="checkbox" data-key="InfiniteScroll" ${settings.InfiniteScroll ? 'checked' : ''}> Infinite Scroll</label>
                <label class="gb-switch"><input type="checkbox" data-key="Blacklist" ${settings.Blacklist ? 'checked' : ''}> Blacklist</label>
                <label class="gb-switch"><input type="checkbox" data-key="TagGroups" ${settings.TagGroups ? 'checked' : ''}> Tag-Groups</label>
                <label class="gb-switch"><input type="checkbox" data-key="Favorites" ${settings.Favorites !== false ? 'checked' : ''}> Favorites</label>
            </div>
            <div class="gb-form-row">
                <label>Theme</label>
                <select id="gb-theme" class="gb-inp" style="width:auto">
                <option value="system" ${settings.Theme === 'system' ? 'selected' : ''}>System</option>
                <option value="light"  ${settings.Theme === 'light' ? 'selected' : ''}>Light</option>
                <option value="dark"   ${settings.Theme === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
            </div>
            <div class="gb-form-row">
                <label>Columns (2–12)</label>
                <input id="gb-col" class="gb-inp" style="width:8ch" type="number" min="2" max="12" value="${settings.Columns ?? 6}">
            </div>
            <div class="gb-form-row">
                <label>Animated Border Color</label>
                <input id="gb-anim-color" class="gb-inp" type="color"
                        value="${settings.AnimatedBorderColor || '#0ea5ff'}" style="width: 8ch">
                <span style="opacity:.7;font-size:12px">Gilt bei Tags <b>animated</b>/<b>animated_gif</b>, außer <b>video</b> oder <b>sound</b>.</span>
            </div>
            <div class="gb-form-row">
                <label>Show hidden (Blacklist)</label>
                <label class="gb-switch"><input id="gb-showhidden" type="checkbox" ${settings.ShowHidden ? 'checked' : ''}> Zeige ausgeblendete Einträge</label>
            </div>
            <div class="gb-form-row">
                <label>User ID</label>
                <input id="gb-user-id" class="gb-inp" style="width:18ch" value="${settings.ApiUserId || ''}" placeholder="z.B. 1394166">
            </div>
            <div class="gb-form-row">
                <label>API Key</label>
                <input id="gb-api-key" class="gb-inp" type="password" value="${settings.ApiKey || ''}" placeholder="in Account Options">
            </div>
        `;

        const tabsBar = document.createElement('div'); tabsBar.className = 'gb-tabs';
        const panelsWrap = document.createElement('div'); panelsWrap.style.minWidth = 'min(72vw, 680px)';

        const makeBtn = (id, title, active = false) => {
            const b = document.createElement('button'); b.type = 'button';
            b.className = 'gb-tab-btn' + (active ? ' active' : ''); b.dataset.tab = id; b.textContent = title;
            b.addEventListener('click', () => {
                modal.querySelectorAll('.gb-tab-btn').forEach(x => x.classList.toggle('active', x === b));
                modal.querySelectorAll('.gb-tabpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === id));
            });
            return b;
        };

        const generalBtn = makeBtn('general', 'General', true);
        tabsBar.appendChild(generalBtn);
        const panelGeneral = document.createElement('div');
        panelGeneral.className = 'gb-tabpanel active'; panelGeneral.dataset.panel = 'general';
        panelGeneral.innerHTML = generalHTML;
        panelsWrap.appendChild(panelGeneral);

        const moduleTabs = __gb_settings_tabs.slice();
        for (const t of moduleTabs) {
            const btn = makeBtn(t.id, t.title, false);
            tabsBar.appendChild(btn);
            const panel = document.createElement('div');
            panel.className = 'gb-tabpanel'; panel.dataset.panel = t.id;
            try { t.render(panel, { settings }); } catch (e) { console.error('Settings tab render error', t.id, e); }
            panelsWrap.appendChild(panel);
        }

        modal.innerHTML = '';
        modal.appendChild(el('h3', '', 'Gelbooru Suite – Settings'));
        modal.appendChild(tabsBar);
        modal.appendChild(panelsWrap);

        const actions = document.createElement('div');
        actions.className = 'gb-row'; actions.style.marginTop = '14px';
        actions.innerHTML = `
            <button class="gb-suite-btn" id="gb-save">Speichern</button>
            <button class="gb-suite-btn" id="gb-close">Schließen</button>
        `;
        modal.appendChild(actions);

        modal.querySelector('#gb-close').addEventListener('click', () => overlay.remove());
        modal.querySelector('#gb-save').addEventListener('click', () => {
            modal.querySelectorAll('input[type="checkbox"][data-key]').forEach(chk => {
                settings[chk.getAttribute('data-key')] = !!chk.checked;
            });
            settings.Columns = Math.max(2, Math.min(12, Number(modal.querySelector('#gb-col')?.value ?? 6)));
            settings.ShowHidden = !!modal.querySelector('#gb-showhidden')?.checked;
            settings.Theme = modal.querySelector('#gb-theme')?.value || 'system';
            settings.AnimatedBorderColor = modal.querySelector('#gb-anim-color')?.value || '#0ea5ff';
            settings.ApiUserId = (modal.querySelector('#gb-user-id')?.value || '').trim();
            settings.ApiKey = (modal.querySelector('#gb-api-key')?.value || '').trim();

            for (const t of moduleTabs) {
                const panel = modal.querySelector(`.gb-tabpanel[data-panel="${t.id}"]`);
                try { t.collect?.(settings, panel); } catch (e) { console.error('Settings collect error', t.id, e); }
            }
            saveSettings();
            location.reload();
        });

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function mountSettingsButton() {
        const navSub = document.querySelector('.navSubmenu');
        if (!navSub) return;
        if (navSub.querySelector('.gb-suite-link')) return;
        const btn = el('a', 'gb-suite-link', 'Suite Settings');
        btn.href = 'javascript:void(0)';
        btn.addEventListener('click', openSettingsModal);
        navSub.appendChild(btn);
    }

    // Export
    window.GBSuite = {
        settings, saveSettings, bus,
        register: (n, m) => Registry.register(n, m),
        addSettingsTab,
        start() {
            const run = () => {
                try { applyTheme(); } catch { }
                mountSettingsButton();
                Registry.initEnabled();
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', run, { once: true });
            } else {
                run();
            }
        },
        util: { el, addStyle, escapeRegExp }
    };

    // Theme initial + Listener
    applyTheme();
    watchSystemTheme();
})();