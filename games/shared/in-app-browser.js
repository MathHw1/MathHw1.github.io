"use strict";

// A banner for players inside an app's built-in browser, like the one Google Sheets opens links in.
// Those browsers can throw away saved data (progress, username, settings) when they close, so the
// banner offers to open the page in Safari instead, or to copy the link.

(function () {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // In-app browsers on iOS either name their app (Google's GSA, Facebook, Instagram...) or leave out
    // the "Safari" word that real Safari and Chrome both include.
    // A web app saved to the Home Screen also leaves "Safari" out, but it keeps its data, so it's left alone.
    const inApp = iOS && !navigator.standalone && (/GSA\/|FBAN|FBAV|Instagram|Line\/|Snapchat|GoogleSheets|\bwv\b/.test(ua) || !/Safari\//.test(ua));
    const DISMISS_KEY = 'nebula-in-app-dismissed';
    if (!inApp || window.top !== window) return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch (_) {}

    function show() {
        const bar = document.createElement('div');
        bar.setAttribute('role', 'note');
        bar.style.cssText = 'position:fixed;left:8px;right:8px;top:max(8px,env(safe-area-inset-top));z-index:2147483000;display:flex;flex-wrap:wrap;gap:8px;align-items:center;' +
            'padding:10px 12px;border-radius:12px;background:#1e1b4b;color:#e0e7ff;font:600 14px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)';
        const text = document.createElement('span');
        text.style.cssText = 'flex:1 1 220px';
        text.textContent = 'You’re in an app’s built-in browser, which may not keep your progress or name. Open this page in Safari to save them.';
        const button = (label, action) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'min-height:40px;padding:0 14px;border:0;border-radius:10px;font:700 14px system-ui,sans-serif;color:#fff;background:#7c3aed;touch-action:manipulation';
            b.addEventListener('click', action);
            return b;
        };
        // x-safari-https:// opens the page in Safari on iOS 17 and later. Older versions just ignore it,
        // which is why copying the link is offered too.
        const open = button('Open in Safari', () => { location.href = 'x-safari-' + location.href; });
        const copy = button('Copy link', () => {
            const done = () => { copy.textContent = 'Copied! Paste it in Safari'; };
            if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, () => prompt('Copy this link:', location.href));
            else prompt('Copy this link:', location.href);
        });
        const close = button('✕', () => { bar.remove(); try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) {} });
        close.style.background = 'rgba(255,255,255,.12)';
        bar.append(text, open, copy, close);
        document.body.appendChild(bar);
    }
    if (document.body) show(); else addEventListener('DOMContentLoaded', show);
})();
