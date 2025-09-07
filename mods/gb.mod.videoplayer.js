(function () {
  // ===== Settings-Tab =====
  if (window.GBSuite && typeof window.GBSuite.addSettingsTab === 'function') {
    window.GBSuite.addSettingsTab({
      id: 'videoplayer',
      title: 'Video Player',
      render(container, { settings }) {
        const S = settings || {};
        const vHover = S.VP_HoverPreview ?? true;
        const vAutoplay = S.VP_Autoplay ?? true;
        const vVolume = Number.isFinite(+S.VP_Volume) ? +S.VP_Volume : 10; // %
        const usePx   = S.VP_SizeUsePx ?? true; // neu: Default Pixel
        const vSizePx = Number.isFinite(+S.VP_SizePx) ? +S.VP_SizePx : 1280;
        const vSizeMl = Number.isFinite(+S.VP_Size)   ? +S.VP_Size   : 1.0; // Legacy/Multi

        container.innerHTML = `
          <div class="gb-form-row">
            <label><input id="vp-hover" type="checkbox" ${vHover ? 'checked' : ''}> Preview Video on Hover (muted)</label>
            <div class="gb-help">Spielt in der Liste stumm beim Hover; auch für animated/animated_gif.</div>
          </div>

          <div class="gb-form-row">
            <label><input id="vp-autoplay" type="checkbox" ${vAutoplay ? 'checked' : ''}> Autoplay im Post</label>
            <div class="gb-help">Startet automatisch (muted-Start; wird dann ggf. auf deine Lautstärke entmuted).</div>
          </div>

          <div class="gb-form-row">
            <label>Volume (%)</label>
            <input id="vp-volume" class="gb-inp" type="number" min="0" max="100" step="1" style="width:8ch" value="${vVolume}">
            <div class="gb-help">Gilt in der Post-Ansicht, falls Sound vorhanden ist.</div>
          </div>

          <div class="gb-form-row">
            <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:6px;">
                <input type="radio" name="vp-size-mode" id="vp-size-mode-px" ${usePx ? 'checked' : ''}>
                <span>Size in Pixel</span>
              </label>
              <input id="vp-size-px" class="gb-inp" type="number" min="320" max="4096" step="10" style="width:9ch" value="${vSizePx}">
              <label style="display:flex; align-items:center; gap:6px; margin-left:24px;">
                <input type="radio" name="vp-size-mode" id="vp-size-mode-ml" ${!usePx ? 'checked' : ''}>
                <span>als Multiplikator</span>
              </label>
              <input id="vp-size-ml" class="gb-inp" type="number" min="0.5" max="3" step="0.1" style="width:8ch" value="${vSizeMl.toFixed(1)}">
            </div>
            <div class="gb-help">Wirkt in der Post-Ansicht auf Video/Bild/GIF.</div>
          </div>
        `;
      },
      collect(settings, container) {
        settings.VP_HoverPreview = !!container.querySelector('#vp-hover')?.checked;
        settings.VP_Autoplay     = !!container.querySelector('#vp-autoplay')?.checked;

        const vol  = Math.max(0, Math.min(100, Number(container.querySelector('#vp-volume')?.value ?? 10)));
        settings.VP_Volume = vol;

        const usePx = !!container.querySelector('#vp-size-mode-px')?.checked;
        settings.VP_SizeUsePx = usePx;
        if (usePx) {
          const px = Math.max(320, Math.min(4096, Number(container.querySelector('#vp-size-px')?.value ?? 1280)));
          settings.VP_SizePx = px;
        } else {
          const ml = Math.max(0.5, Math.min(3, Number(container.querySelector('#vp-size-ml')?.value ?? 1.0)));
          settings.VP_Size   = ml;
        }
      }
    });
  }

  // ===== Modul =====
  window.GBSuite.register('VideoPlayer', (function () {
    const util = window.GBSuite.util || {};
    const addStyle = util.addStyle || (css => { const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); });
    addStyle(`
      .gb-vp-thumb { position: relative; overflow: hidden; border-radius: 8px; }
      .gb-vp-thumb-zoom { transform: scale(1.06); transition: transform .12s ease-out; }
      .gb-vp-thumb video.gb-vp-preview,
      .gb-vp-thumb img.gb-vp-preview {
        position:absolute; inset:0; width:100%; height:100%; object-fit:cover; border-radius:inherit;
      }
    `);

    // Tag-Erkennung
    const normalizeTag = s => String(s).replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
    function tagsFromThumb(thumbImg) {
      const alt = thumbImg?.getAttribute('alt') || '';
      let part = alt; const i = part.indexOf('|'); if (i >= 0) part = part.slice(i + 1);
      return part.split(',').map(t => normalizeTag(t)).filter(Boolean);
    }
    function isAnimatedOrVideo(tags) {
      const set = new Set(tags);
      return set.has('video') || set.has('sound') || set.has('animated') || set.has('animated gif');
    }

    // -------- Hover-Preview: Video ODER GIF ----------
    const mediaCache = new Map(); // href -> {type:'video'|'gif', src:string}
    async function getMediaFromPost(href, signal) {
      if (mediaCache.has(href)) return mediaCache.get(href);
      const resp = await fetch(href, { credentials: 'same-origin', cache: 'force-cache', signal });
      const html = await resp.text();

      // 1) Video?
      let m = html.match(/<video[^>]*id=["']gelcomVideoPlayer["'][^>]*>([\s\S]*?)<\/video>/i);
      if (m) {
        const inner = m[1];
        const srcMatch = inner.match(/<source[^>]*src=["']([^"']+)["'][^>]*>/i);
        if (srcMatch) {
          const out = { type:'video', src: srcMatch[1] };
          mediaCache.set(href, out);
          return out;
        }
      }
      // 2) GIF (z.B. <img id="image" src="...gif"> oder irgendein .gif im main image)
      m = html.match(/<img[^>]*id=["']image["'][^>]*src=["']([^"']+\.gif(?:\?[^"']*)?)["'][^>]*>/i)
        || html.match(/<img[^>]*src=["']([^"']+\.gif(?:\?[^"']*)?)["'][^>]*id=["']image["'][^>]*>/i);
      if (m) {
        const out = { type:'gif', src: m[1] };
        mediaCache.set(href, out);
        return out;
      }
      // 3) Fallback: og:video? (manche Posts haben Meta)
      m = html.match(/<meta[^>]*property=["']og:video["'][^>]*content=["']([^"']+)["']/i);
      if (m) {
        const out = { type:'video', src: m[1] };
        mediaCache.set(href, out);
        return out;
      }
      throw new Error('no playable media');
    }

    let activePreview = null; // {wrap, img, node, abortCtrl}
    function mountPreviewForThumb(aEl, img, settings) {
      let wrap = img.closest('.gb-vp-thumb');
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'gb-vp-thumb';
        img.parentNode.insertBefore(wrap, img);
        wrap.appendChild(img);
      }
      wrap.classList.add('gb-vp-thumb-zoom');

      const ac = new AbortController();
      const href = aEl.href;

      getMediaFromPost(href, ac.signal).then(m => {
        if (ac.signal.aborted) return;
        let node;
        if (m.type === 'video') {
          const v = document.createElement('video');
          v.className = 'gb-vp-preview';
          v.muted = true;
          v.autoplay = true;
          v.loop = true;
          v.playsInline = true;
          v.src = m.src;
          node = v;
        } else {
          const g = document.createElement('img');
          g.className = 'gb-vp-preview';
          g.src = m.src; // GIF animiert von allein
          node = g;
        }
        wrap.appendChild(node);
        activePreview = { wrap, img, node, abortCtrl: ac };
      }).catch(() => {
        activePreview = { wrap, img, node: null, abortCtrl: ac };
      });

      return () => {
        ac.abort();
        wrap.classList.remove('gb-vp-thumb-zoom');
        const n = wrap.querySelector('.gb-vp-preview');
        if (n) n.remove();
        activePreview = null;
      };
    }

    // -------- Post-Ansicht: Autoplay, Volume, Size ----------
    function applyOnPost(s) {
      const desiredVol = Math.max(0, Math.min(100, Number(s.VP_Volume ?? 10))) / 100;
      const usePx      = s.VP_SizeUsePx ?? true;
      const px         = Math.max(320, Math.min(4096, Number(s.VP_SizePx ?? 1280)));
      const mul        = Math.max(0.5, Math.min(3, Number(s.VP_Size ?? 1.0)));

      const video = document.getElementById('gelcomVideoPlayer');
      const media = video || document.querySelector('main img, .content img, #image');

      // Size
      if (media) {
        media.style.maxWidth = 'none';
        if (usePx) {
          media.style.width = px + 'px';
        } else {
          media.style.width = (mul * 100) + '%';
        }
        media.style.height = 'auto';
      }

      // Autoplay + Volume (robust)
      if (video) {
        // Setze Ziel-Lautstärke vorab
        try { video.volume = desiredVol; } catch {}
        if (s.VP_Autoplay) {
          // Browser erlauben Autoplay nur sicher, wenn muted => wir starten muted und schalten dann ggf. auf gewünschte Lautstärke
          video.muted = true;
          const start = () => video.play().catch(() => {/* ignorieren */});
          if (video.readyState >= 2) start(); else video.addEventListener('canplay', start, { once: true });

          // Wenn Lautstärke > 0 gewünscht, nach Start entmuten
          if (desiredVol > 0) {
            const unmute = () => { try { video.muted = false; video.volume = desiredVol; } catch {} };
            video.addEventListener('playing', unmute, { once: true });
            // Fallback nach kurzer Zeit
            setTimeout(unmute, 800);
          }
        }
      }
    }

    // -------- Lifecycle --------
    return {
      init(ctx) {
        const s = ctx?.settings || {};

        // Post-Ansicht
        if (/[\?&]page=post(&|$)/.test(location.search) && /[\?&]s=view(&|$)/.test(location.search)) {
          applyOnPost(s);
        }

        // Listen-Ansicht (Hover)
        if (s.VP_HoverPreview !== false && /[\?&]page=post(&|$)/.test(location.search) && /[\?&]s=list(&|$)/.test(location.search)) {
          const scopeSelector = '.thumbnail-preview';
          function wire(nodes) {
            (nodes && nodes.length ? nodes : document.querySelectorAll(scopeSelector)).forEach(item => {
              const a = item.querySelector('a[id^="p"], a[href]');
              const img = item.querySelector('img');
              if (!a || !img) return;
              if (item.__gbVpWired) return;
              item.__gbVpWired = true;

              let cleanup = null;
              item.addEventListener('mouseenter', () => {
                const tags = tagsFromThumb(img);
                if (!isAnimatedOrVideo(tags)) return;
                cleanup = mountPreviewForThumb(a, img, s);
              });
              item.addEventListener('mouseleave', () => {
                if (cleanup) { cleanup(); cleanup = null; }
              });
            });
          }

          // initial + neue Thumbs (z. B. via Infinite Scroll)
          wire();
          ctx.bus.on('newThumbs', wire);
        }
      }
    };
  })());
})();
