// GBSuite – Animated Outline (Update: inset overlay, no overflow)
(function () {
    window.GBSuite.register('AnimatedOutline', (function () {
        const CLS = 'gb-anim-outline';
        let color = '#0ea5ff';

        // einmal globales CSS einhängen
        function ensureStyle() {
            if (document.getElementById('gb-anim-outline-style')) return;
            const css = `
                .gb-anim-wrap{ display:inline-block; position:relative; line-height:0; border-radius:8px; }
                .gb-anim-wrap::after{
                content:""; position:absolute; inset:0;
                border-radius:inherit;
                box-shadow: inset 0 0 0 3px var(--gb-anim-border, #0ea5ff);
                pointer-events:none;
                }
            `;
            const el = document.createElement('style');
            el.id = 'gb-anim-outline-style';
            el.textContent = css;
            document.head.appendChild(el);
        }

        function wrapImg(img) {
            if (!img || img.closest('.gb-anim-wrap')) return img.closest('.gb-anim-wrap');
            const wrap = document.createElement('span');
            wrap.className = 'gb-anim-wrap';
            // Bild block-level, damit kein Baseline-Weißraum entsteht
            img.style.display = 'block';
            // vorhandenen Border-Radius übernehmen, falls gesetzt
            const br = getComputedStyle(img).borderRadius;
            if (br && br !== '0px') wrap.style.borderRadius = br;
            img.parentNode.insertBefore(wrap, img);
            wrap.appendChild(img);
            return wrap;
        }

        function unwrapImg(img) {
            const wrap = img && img.parentElement;
            if (!wrap || !wrap.classList.contains('gb-anim-wrap')) return;
            wrap.parentNode.insertBefore(img, wrap);
            wrap.remove();
            img.style.display = ''; // reset
        }

        function normalizeTag(s) { return String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
        function extractTagsFromAlt(alt) {
            let part = alt || '';
            const i = part.indexOf('|'); if (i >= 0) part = part.slice(i + 1);
            return part.split(',').map(t => normalizeTag(t)).filter(Boolean);
        }

        function applyTo(nodes) {
            const thumbs = (nodes && nodes.length) ? nodes : document.querySelectorAll('.thumbnail-preview');
            for (const item of thumbs) {
                const a = item.querySelector('a[id^="p"], a[href]') || item.querySelector('a');
                const img = item.querySelector('img');
                if (!a || !img) continue;

                // Tags lesen
                const tags = extractTagsFromAlt(img.alt || '');
                const hasAnim = tags.includes('animated') || tags.includes('animated gif');
                const hasVideoOrSound = tags.includes('video') || tags.includes('sound');

                // Erst aufräumen (falls vorher gewrappt)
                unwrapImg(img);

                if (hasAnim && !hasVideoOrSound) {
                    // Wrap nur fürs Outline – passt sich exakt der Bildgröße an
                    wrapImg(img);
                }
            }
        }

        return {
            init(ctx) {
                ensureStyle();
                color = ctx?.settings?.AnimatedBorderColor || color;
                document.documentElement.style.setProperty('--gb-anim-border', color);
                applyTo();
                ctx.bus.on('newThumbs', applyTo);
            }
        };
    })());
})();
