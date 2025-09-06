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
      off(ev, fn){ map.get(ev)?.delete(fn); },
      emit(ev, payload){ map.get(ev)?.forEach(fn => { try { fn(payload); } catch(e){ console.error(e); } }); }
    };
  })();

  // Helpers (auch für Module exportiert)
  function el(tag, className, text){ const n=document.createElement(tag); if(className) n.className=className; if(text!=null) n.textContent=text; return n; }
  function addStyle(css){ const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
  function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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
    register(name, mod){ this._mods[name] = mod; },
    initEnabled(){
      for (const [name, mod] of Object.entries(this._mods)) {
        if (settings[name] !== false && typeof mod.init === 'function') {
          try { mod.init({ settings, bus, util:{ el, addStyle, escapeRegExp } }); }
          catch(e){ console.error(`[${SUITE_NS}] init ${name} failed:`, e); }
        }
      }
    }
  };

  // Settings-UI
  function openSettingsModal(){
    const overlay = el('div','gb-ovl'); const modal=el('div','gb-modal'); overlay.appendChild(modal);
    modal.innerHTML = `
      <h3>Gelbooru Suite – Settings</h3>
      <div class="gb-row">
        ${toggleRow('InfiniteScroll','Infinite Scroll')}
        ${toggleRow('Blacklist','Blacklist (Tags aus ALT)')}
        ${toggleRow('TagGroups','Favorite Tag-Groups (Top-Bar)')}
      </div>
      <table class="gb-table"><tbody>
        <tr><td>Columns (2–12)</td>
            <td><input id="gb-col" class="gb-inp" type="number" min="2" max="12" value="${Number(settings.Columns)||6}"/></td></tr>
        <tr><td>Show hidden (Blacklist)</td>
            <td><label class="gb-switch">
                  <input id="gb-showhidden" type="checkbox" ${settings.ShowHidden?'checked':''}/>
                  <span>Zeige ausgeblendete Einträge</span>
                </label></td></tr>
      </tbody></table>
      <div class="gb-row">
        <button id="gb-save" class="gb-suite-btn">Speichern</button>
        <button id="gb-close" class="gb-suite-btn">Schließen</button>
      </div>`;
    function toggleRow(key,label){ const on = settings[key]!==false; return `
      <label class="gb-switch"><input type="checkbox" data-key="${key}" ${on?'checked':''}/><span>${label}</span></label>`; }
    overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
    modal.querySelector('#gb-close').addEventListener('click', close);
    modal.querySelector('#gb-save').addEventListener('click', ()=>{
      modal.querySelectorAll('input[type="checkbox"][data-key]').forEach(chk=>{
        settings[chk.getAttribute('data-key')] = !!chk.checked;
      });
      const col = Number(modal.querySelector('#gb-col').value||6);
      settings.Columns = Math.max(2, Math.min(12, col));
      settings.ShowHidden = !!modal.querySelector('#gb-showhidden').checked;
      saveSettings(); location.reload();
    });
    document.body.appendChild(overlay);
    function close(){ overlay.remove(); }
  }

  (function mountSettingsButton(){
    const navSub = document.querySelector('.navSubmenu');
    if (!navSub) return;
    const btn = el('a','gb-suite-link','Suite Settings');
    btn.href='javascript:void(0)'; btn.addEventListener('click', openSettingsModal);
    navSub.appendChild(btn);
  })();

  // Export
  window.GBSuite = {
    settings, saveSettings, bus,
    register: (n,m)=>Registry.register(n,m),
    start(){
      const grid = document.querySelector('.thumbnail-container');
      if (!grid) return;
      Registry.initEnabled();
    },
    util: { el, addStyle, escapeRegExp }
  };
})();
