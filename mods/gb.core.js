(function () {
    'use strict';

    const SUITE_NS = 'gbSuite';
    const LS_SETTINGS = 'gbSuite.settings';

    const defaultSettings = {
        InfiniteScroll: true,
        Blacklist: true,
        TagGroups: true,
        Columns: 6,
        ShowHidden: false,
        Theme: 'system', // 'light' | 'dark' | 'system'
    };

    function loadSettings() {
        try { return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')); }
        catch { return { ...defaultSettings }; }
    }
    const settings = loadSettings();
    function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }

    // Event-Bus
    const bus = (() => {
        const map = new Map();
        return {
            on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); },
            off(ev, fn) { map.get(ev)?.delete(fn); },
            emit(ev, payload) { map.get(ev)?.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); }
        };
    })();

    // Helpers (auch für Module exportiert)
    function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; }
    function addStyle(css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
    function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // --- THEME ---
    function getActiveTheme() {
        const prefDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (settings.Theme === 'dark') return 'dark';
        if (settings.Theme === 'light') return 'light';
        return prefDark ? 'dark' : 'light'; // system
    }

    function applyTheme() {
        const t = getActiveTheme();
        document.documentElement.setAttribute('data-gbsuite-theme', t);
    }

    // Liest die Site-Header-Farbe und setzt sie als Accent für Tabellenköpfe im Light-Theme
    function syncSiteAccentFromHeader() {
        const t = getActiveTheme();
        if (t !== 'light') return; // nur im Light-Theme anpassen (Dark bleibt deine dunkelblaue Vorgabe)

        // Versuche die Haupt-Navigationsleiste zu finden (Fallbacks eingeschlossen)
        const bar = document.querySelector(
            '.maintabs, .maintab, .navbar, .header, .topbar, .menu, #maintabmenu'
        );
        if (!bar) return;

        const cs = getComputedStyle(bar);

        // 1) background-color direkt nehmen, wenn vorhanden
        let col = cs.backgroundColor;

        // 2) Falls Gradient benutzt wird, erstes rgb(...) aus background-image „parsen“
        if ((!col || col === 'rgba(0, 0, 0, 0)' || col === 'transparent')
            && cs.backgroundImage && cs.backgroundImage !== 'none') {
            const m = cs.backgroundImage.match(/rgba?\([^)]+\)/);
            if (m) col = m[0];
        }

        // 3) Falls immer noch nichts: freundliches Default
        if (!col || col === 'rgba(0, 0, 0, 0)' || col === 'transparent') {
            col = '#4da3ff'; // fallback
        }

        // Variable setzen – TagGroups nutzt var(--gb-table-head-bg) bereits
        document.documentElement.style.setProperty('--gb-table-head-bg', col);
    }

    // beim Start + bei System-Theme-Wechsel anwenden
    const _origApplyTheme = applyTheme;
    applyTheme = function () {
        _origApplyTheme();
        syncSiteAccentFromHeader();
    };

    function watchSystemTheme() {
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => { if (settings.Theme === 'system') { applyTheme(); } };
        mq.addEventListener?.('change', handler);
    }

    // Globale CSS-Variablen für alle Suite-Elemente
    addStyle(`
        :root{
            --gb-bg:#ffffff; --gb-bg-muted:#f6f7f8; --gb-text:#111; --gb-text-muted:#444;
            --gb-border:#d0d7e1; --gb-border-dark:#c9ced8;
            --gb-panel-bg:#ffffff; --gb-overlay:rgba(0,0,0,.45);
            --gb-primary:#2a6df4; --gb-primary-contrast:#ffffff;
            --gb-danger:#d23c3c;
            --gb-chip-bg:#eceff3; --gb-chip-border:#cfd6e0;
            --gb-table-head-bg:#e8eefc;
        }
        [data-gbsuite-theme="dark"]{
            --gb-bg:#1a1a1a; --gb-bg-muted:#2a2a2a; --gb-text:#eee; --gb-text-muted:#bbb;
            --gb-border:#444; --gb-border-dark:#333;
            --gb-panel-bg:#1f1f1f; --gb-overlay:rgba(0,0,0,.55);
            --gb-primary:#5d8eff; --gb-primary-contrast:#0b1224;
            --gb-danger:#ff6b6b;
            --gb-chip-bg:#2a2a2a; --gb-chip-border:#3f3f3f;
            --gb-table-head-bg:#0b57d0;
        }

        /* Basiskomponenten der Suite auf Variablen umstellen */
        .gb-suite-btn{
            font:12px system-ui,sans-serif; color:var(--gb-primary); text-decoration:none;
            border:1px solid var(--gb-border); background:var(--gb-primary-contrast);
            border-radius:8px; padding:6px 10px; cursor:pointer;
        }
        .gb-ovl{position:fixed;inset:0;background:var(--gb-overlay);display:flex;align-items:center;justify-content:center;z-index:99999;}
        .gb-modal{
            background:var(--gb-panel-bg); color:var(--gb-text); border:1px solid var(--gb-border);
            border-radius:10px; padding:16px; width:min(800px,95vw); box-shadow:0 10px 30px rgba(0,0,0,.35);
            font:14px/1.4 system-ui,sans-serif; max-height:90vh; overflow:auto;
        }
        .gb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
        .gb-switch{display:flex;align-items:center;gap:8px}
        .gb-inp{
            background:var(--gb-bg-muted); color:var(--gb-text); border:1px solid var(--gb-border);
            border-radius:8px; padding:6px 10px;
        }
        .gb-table{width:100%;border-collapse:collapse;margin-top:6px;}
        .gb-table th,.gb-table td{border-bottom:1px solid var(--gb-border);padding:8px;vertical-align:top;}
        .gb-table thead th{background:var(--gb-table-head-bg); color:#fff; text-align:left; font-weight:700; position:sticky; top:0; z-index:2;}
        .gb-suite-link{
            background:transparent!important;border:none!important;padding:0!important;margin-left:12px;
            color:var(--gb-primary)!important;font-weight:700!important;text-decoration:none!important;cursor:pointer;
        }
        .gb-suite-link:hover{ filter:brightness(1.08); }
    `);

    addStyle(`
        [data-gbsuite-theme] .gb-modal{
            background:var(--gb-panel-bg) !important;
            color:var(--gb-text) !important;
            border-color:var(--gb-border) !important;
        }
        [data-gbsuite-theme] .gb-ovl{ background:var(--gb-overlay) !important; }
        [data-gbsuite-theme] .gb-inp{
            background:var(--gb-bg-muted) !important;
            color:var(--gb-text) !important;
            border-color:var(--gb-border) !important;
        }
        [data-gbsuite-theme] .gb-suite-btn{
            background:var(--gb-primary-contrast) !important;
            color:var(--gb-primary) !important;
            border-color:var(--gb-border) !important;
        }
        [data-gbsuite-theme] .gb-table th,
        [data-gbsuite-theme] .gb-table td{ border-bottom:1px solid var(--gb-border) !important; }
        [data-gbsuite-theme] .gb-table thead th{
            background:var(--gb-table-head-bg) !important;
            color:#fff !important;
        }
        [data-gbsuite-theme] .gb-suite-link{ color:var(--gb-primary) !important; }
        [data-gbsuite-theme] .gb-favwrap{
            background:var(--gb-bg-muted) !important;
            border-top:1px solid var(--gb-border) !important;
            border-bottom:1px solid var(--gb-border-dark) !important;
        }
        [data-gbsuite-theme] .gb-chip{
            background:var(--gb-chip-bg) !important;
            border-color:var(--gb-chip-border) !important;
            color:var(--gb-text) !important;
        }
    `);

    // Styles
    addStyle(`
        .gb-suite-btn{ font:12px system-ui,sans-serif; color:#2a6df4; text-decoration:none; border:1px solid #d0d7e1;
        background:#fff; border-radius:8px; padding:6px 10px; cursor:pointer; }
        .gb-ovl{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;}
        .gb-modal{background:#1f1f1f;color:#eee;border:1px solid #444;border-radius:10px;padding:16px;width:min(800px,95vw);
        box-shadow:0 10px 30px rgba(0,0,0,.35);font:14px/1.4 system-ui,sans-serif;max-height:90vh;overflow:auto;}
        .gb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
        .gb-switch{display:flex;align-items:center;gap:8px}
        .gb-inp{background:#121212;color:#eee;border:1px solid #444;border-radius:8px;padding:6px 10px; width:8ch}
        .gb-table{width:100%;border-collapse:collapse;margin-top:6px;}
        .gb-table th,.gb-table td{border-bottom:1px solid #333;padding:8px;vertical-align:top;}
        .gb-suite-link{background:transparent!important;border:none!important;padding:0!important;margin-left:12px;
        color:#2a6df4!important;font-weight:700!important;text-decoration:none!important;cursor:pointer;}
        .gb-suite-link:hover{ filter:brightness(1.08); }
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

    // Settings-UI
    function openSettingsModal() {
        const overlay = el('div', 'gb-ovl'); const modal = el('div', 'gb-modal'); overlay.appendChild(modal);
        modal.innerHTML = `
            <h3>Gelbooru Suite – Settings</h3>
            <div class="gb-row">
                ${toggleRow('InfiniteScroll', 'Infinite Scroll')}
                ${toggleRow('Blacklist', 'Blacklist (Tags aus ALT)')}
                ${toggleRow('TagGroups', 'Favorite Tag-Groups (Top-Bar)')}
            </div>
            <div class="gb-row">
                <label>Theme
                    <select id="gb-theme" class="gb-inp" style="width:auto">
                    <option value="system" ${settings.Theme === 'system' ? 'selected' : ''}>System</option>
                    <option value="light" ${settings.Theme === 'light' ? 'selected' : ''}>Light</option>
                    <option value="dark"  ${settings.Theme === 'dark' ? 'selected' : ''}>Dark</option>
                    </select>
                </label>
            </div>
            <table class="gb-table">
                <tbody>
                    <tr>
                        <td>Columns (2–12)</td>
                        <td><input id="gb-col" class="gb-inp" type="number" min="2" max="12" value="${Number(settings.Columns) || 6}"/></td>
                    </tr>
                    <tr>
                        <td>Show hidden (Blacklist)</td>
                        <td>
                            <label class="gb-switch">
                                <input id="gb-showhidden" type="checkbox" ${settings.ShowHidden ? 'checked' : ''}/>
                                <span>Zeige ausgeblendete Einträge</span>
                            </label>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="gb-row">
                <button id="gb-save" class="gb-suite-btn">Speichern</button>
                <button id="gb-close" class="gb-suite-btn">Schließen</button>
            </div>
        `;
        function toggleRow(key, label) {
            const on = settings[key] !== false; return `
                <label class="gb-switch"><input type="checkbox" data-key="${key}" ${on ? 'checked' : ''}/><span>${label}</span></label>
            `;
        }
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        modal.querySelector('#gb-close').addEventListener('click', close);
        modal.querySelector('#gb-save').addEventListener('click', () => {
            modal.querySelectorAll('input[type="checkbox"][data-key]').forEach(chk => {
                settings[chk.getAttribute('data-key')] = !!chk.checked;
            });
            const col = Number(modal.querySelector('#gb-col').value || 6);
            settings.Columns = Math.max(2, Math.min(12, col));
            settings.ShowHidden = !!modal.querySelector('#gb-showhidden').checked;
            settings.Theme = modal.querySelector('#gb-theme').value;     // <-- NEU
            saveSettings();
            location.reload();
        });
        document.body.appendChild(overlay);
        function close() { overlay.remove(); }
    }

    (function mountSettingsButton() {
        const navSub = document.querySelector('.navSubmenu');
        if (!navSub) return;
        const btn = el('a', 'gb-suite-link', 'Suite Settings');
        btn.href = 'javascript:void(0)'; btn.addEventListener('click', openSettingsModal);
        navSub.appendChild(btn);
    })();

    // Export
    window.GBSuite = {
        settings, saveSettings, bus,
        register: (n, m) => Registry.register(n, m),
        start() {
            const grid = document.querySelector('.thumbnail-container');
            if (!grid) return;
            Registry.initEnabled();
        },
        util: { el, addStyle, escapeRegExp }
    };
    applyTheme();
    watchSystemTheme();
})();