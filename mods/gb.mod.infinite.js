(function () {
    window.GBSuite.register('InfiniteScroll', (function () {
        let io, sentinel, grid, paginator, style;
        return {
            init(ctx) {
                if (!ctx?.settings?.InfiniteScroll) return;
                const { el } = ctx.util;
                grid = document.querySelector('.thumbnail-container');
                paginator = document.querySelector('.pagination');
                if (!grid || !paginator) return;

                style = document.createElement('style');
                style.textContent = `
                    .thumbnail-container{display:grid!important;grid-template-columns:repeat(${ctx.settings.Columns},minmax(0,1fr))!important;gap:14px!important;align-items:start!important;}
                    .thumbnail-container .thumbnail-preview{width:100%!important;margin:0!important;}
                    .thumbnail-container .thumbnail-preview a,.thumbnail-container .thumbnail-preview img{width:100%!important;height:auto!important;display:block!important;object-fit:cover;border-radius:8px;}
                    .gb-page-divider{grid-column:1/-1;text-align:center;margin:30px 0 20px;padding:8px;border-top:2px solid #ccc;color:#444;font:14px/1.2 system-ui,sans-serif;opacity:.85;}
                `;
                document.head.appendChild(style);

                const STEP = 42;
                const initialPid = Number(new URL(location.href).searchParams.get('pid') || '0');
                let nextPid = initialPid + STEP, loading = false, reachedEnd = false, pageCounter = 1;
                const seenAnchors = new Set([...grid.querySelectorAll('.thumbnail-preview a[id^="p"]')].map(a => a.id));

                const wrap = paginator.parentElement || grid.parentElement;
                const loader = el('div', null, 'Lade weitere Bilder …');
                Object.assign(loader.style, { textAlign: 'center', padding: '14px', color: '#666', fontFamily: 'system-ui,sans-serif', display: 'none' });
                sentinel = document.createElement('div'); sentinel.style.height = '1px';
                paginator.style.display = 'none';
                wrap.insertBefore(loader, paginator);
                wrap.insertBefore(sentinel, paginator);

                async function loadMore() {
                    if (loading || reachedEnd) return;
                    loading = true; loader.style.display = '';
                    try {
                        const u = new URL(location.href); u.searchParams.set('pid', String(nextPid));
                        const resp = await fetch(u, { credentials: 'same-origin', cache: 'no-cache' });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const html = await resp.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const nextThumbs = [...doc.querySelectorAll('.thumbnail-container .thumbnail-preview')];
                        if (!nextThumbs.length) { reachedEnd = true; loader.textContent = 'Keine weiteren Ergebnisse.'; return; }

                        pageCounter++;
                        grid.appendChild(el('div', 'gb-page-divider', `— Seite ${pageCounter} —`));

                        const toAppend = [];
                        for (const node of nextThumbs) {
                            const a = node.querySelector('a[id^="p"]'); const id = a && a.id;
                            if (!id || seenAnchors.has(id)) continue;
                            seenAnchors.add(id); toAppend.push(node);
                        }
                        for (const n of toAppend) grid.appendChild(n);
                        grid.appendChild(sentinel);

                        ctx.bus.emit('newThumbs', toAppend);
                        nextPid += STEP;
                    } catch (e) {
                        console.error('[Suite] Infinite Scroll error:', e);
                        loader.textContent = 'Fehler beim Laden. Scrolle weiter oder lade neu.';
                    } finally {
                        loading = false; if (!reachedEnd) loader.style.display = 'none';
                    }
                }

                io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) loadMore(); },
                    { root: null, rootMargin: '2000px 0px', threshold: 0 });
                io.observe(sentinel);

                if (document.body.scrollHeight <= window.innerHeight + 1000) loadMore();
                window.addEventListener('keydown', ev => { if (ev.key === 'End') loadMore(); });

                ctx.bus.emit('newThumbs', [...grid.querySelectorAll('.thumbnail-preview')]);
            },
            destroy() { io?.disconnect?.(); sentinel?.remove?.(); style?.remove?.(); }
        };
    })());
})();