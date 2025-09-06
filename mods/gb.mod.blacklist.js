(function(){
  window.GBSuite.register('Blacklist', (function(){
    const LS_BLACKLIST = 'gbBlacklistTags';
    let showHidden=false, unsub;
    const { el } = window.GBSuite.util;

    function normalizeTag(s){ return s.replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
    function getBlacklistArray(){
      const raw = localStorage.getItem(LS_BLACKLIST) || '';
      return Array.from(new Set(raw.split(/\r?\n|,|\s+/g).map(s=>s.trim()).filter(Boolean).map(normalizeTag)));
    }
    function extractTagsFromAlt(alt){
      let part = alt||''; const i = part.indexOf('|'); if (i>=0) part = part.slice(i+1);
      return part.split(',').map(t=>normalizeTag(t)).filter(Boolean);
    }
    function applyBlacklistTo(nodes){
      const blacklist = getBlacklistArray();
      const thumbs = nodes && nodes.length ? nodes : [...document.querySelectorAll('.thumbnail-preview')];
      let hidden=0;
      for (const item of thumbs){
        const img = item.querySelector('img'); if (!img) continue;
        const tags = extractTagsFromAlt(img.alt||'');
        const hit = blacklist.some(b=>tags.includes(b));
        if (hit && !showHidden){ item.style.display='none'; hidden++; }
        else { item.style.display=''; }
      }
      return hidden;
    }
    function addControls(){
      const navSub = document.querySelector('.navSubmenu'); if (!navSub) return;
      const link = document.createElement('a'); link.href='javascript:void(0)'; link.textContent='Blacklist'; link.style.marginLeft='12px';
      link.addEventListener('click', openBlacklistModal);
      const toggle = document.createElement('span'); toggle.style.marginLeft='8px'; toggle.style.cursor='pointer';
      const update =()=> toggle.textContent = showHidden ? '(versteckte anzeigen: AN)' : '(versteckte anzeigen: AUS)';
      toggle.addEventListener('click', ()=>{ showHidden=!showHidden; localStorage.setItem('gbShowHidden', showHidden?'1':'0'); applyBlacklistTo(); update(); });
      update(); navSub.appendChild(link); navSub.appendChild(toggle);
    }
    function openBlacklistModal(){
      const overlay = el('div','gb-ovl'); const modal=el('div','gb-modal'); overlay.appendChild(modal);
      const current = (localStorage.getItem(LS_BLACKLIST)||'').trim();
      modal.innerHTML = `
        <h3>Tag-Blacklist</h3>
        <div class="gb-row" style="opacity:.8;font-size:12px">1 Tag pro Zeile (oder Leerzeichen/Komma getrennt). "_" ≙ Leerzeichen; case-insensitive.</div>
        <textarea id="gb-bll" style="width:100%;height:140px;background:#121212;color:#eee;border:1px solid #444;border-radius:8px;padding:8px;font:13px ui-monospace,Consolas,monospace;">${current}</textarea>
        <div class="gb-row">
          <button id="gb-save" class="gb-suite-btn">Speichern & Anwenden</button>
          <button id="gb-clear" class="gb-suite-btn">Leeren</button>
          <button id="gb-close" class="gb-suite-btn">Schließen</button>
          <span id="gb-stat" style="margin-left:auto;opacity:.8"></span>
        </div>`;
      const stat = modal.querySelector('#gb-stat');
      const refresh = ()=> stat.textContent = `${applyBlacklistTo()} Bilder aktuell ausgeblendet`;
      refresh();
      modal.querySelector('#gb-save').addEventListener('click',()=>{ localStorage.setItem(LS_BLACKLIST, modal.querySelector('#gb-bll').value); applyBlacklistTo(); refresh(); close(); });
      modal.querySelector('#gb-clear').addEventListener('click',()=>{ localStorage.removeItem(LS_BLACKLIST); modal.querySelector('#gb-bll').value=''; applyBlacklistTo(); refresh(); });
      modal.querySelector('#gb-close').addEventListener('click', close);
      overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
      document.body.appendChild(overlay);
      function close(){ overlay.remove(); }
    }

    return {
      init(ctx){
        if (!ctx?.settings?.Blacklist) return;
        showHidden = !!ctx.settings.ShowHidden || (localStorage.getItem('gbShowHidden')==='1');
        addControls();
        const handler = (nodes)=>applyBlacklistTo(nodes);
        ctx.bus.on('newThumbs', handler);
        unsub = ()=> ctx.bus.off('newThumbs', handler);
      },
      destroy(){ unsub?.(); }
    };
  })());
})();
