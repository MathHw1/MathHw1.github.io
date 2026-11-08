"use strict";

// The player's profile for the whole arcade: a private device ID, their username and their stats.
// It lives in localStorage with a copy in IndexedDB, which brings it back if iPad Safari clears one.

// Leaving the game (switching tabs or apps, or minimising) goes straight to study mode, the arcade's 📝 notes.
// Inside the arcade the arcade page switches, so this only tells it; on its own, the page goes to the arcade.
// Focus moving between the arcade and a game frame doesn't count, which is why it checks hasFocus.
(function () {
    if (window.NEBULA_ARCADE) return;
    const home = new URL('../../arcade.html#study', document.currentScript.src).href;
    // Following a link or closing the page hides it too, and that mustn't count as leaving.
    let navigating = false;
    addEventListener('beforeunload', () => { navigating = true; });
    addEventListener('pagehide', () => { navigating = true; });
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('a[href]')) navigating = true; }, true);
    const leave = () => {
        if (navigating) return;
        if (window.top !== window) { try { window.parent.postMessage({ nebula: 'away' }, '*'); } catch (_) {} return; }
        location.replace(home);
    };
    // On the very first sign of leaving, the game is wiped out of sight before anything else runs, so an
    // iPad's tab-switcher snapshot has nothing to show: every canvas is painted black, a full-screen mask
    // goes on top, and the page is hidden. It all comes back if the player only clicked elsewhere on the
    // page (focus returning, or the arcade saying 'stay'), with a forced redraw so nothing stays blank.
    let masked = false;
    // Asking a canvas for a context creates one, which would lock an unused canvas into the wrong kind.
    // So note each context as the game makes it, and only wipe those.
    const contexts = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
        const ctx = getContext.call(this, type, options);
        if (ctx && !contexts.includes(ctx)) contexts.push(ctx);
        return ctx;
    };
    function wipeCanvases() {
        for (const ctx of contexts) {
            try {
                if (ctx.clearColor) { ctx.clearColor(0, 0, 0, 1); ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT); continue; }
                const { width, height } = ctx.canvas;
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); ctx.restore();
            } catch (_) {}
        }
    }
    function mask() {
        if (masked) return;
        masked = true;
        wipeCanvases();
        let cover = document.getElementById('study-mode-mask');
        if (!cover) {
            cover = document.createElement('div');
            cover.id = 'study-mode-mask';
            cover.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#fff';
            (document.body || document.documentElement).appendChild(cover);
        }
        document.documentElement.style.visibility = 'hidden';
    }
    function unmask() {
        if (!masked) return;
        masked = false;
        const cover = document.getElementById('study-mode-mask');
        if (cover) cover.remove();
        document.documentElement.style.visibility = '';
        dispatchEvent(new Event('resize'));          // the games redraw everything on resize
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { mask(); leave(); }
        else unmask();
    });
    addEventListener('pagehide', mask);
    document.addEventListener('freeze', mask);       // Chrome's Page Lifecycle API; Safari doesn't send it
    addEventListener('pageshow', () => { if (!document.hidden && document.hasFocus()) unmask(); });
    addEventListener('focus', unmask);
    addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.nebula === 'stay') unmask(); });
    // A four- or five-finger swipe or pinch is the iPad's app-switch gesture; normal play never uses that many.
    const MANY_FINGERS = 4;
    addEventListener('touchstart', e => { if (e.touches.length >= MANY_FINGERS) mask(); }, { capture: true, passive: true });
    addEventListener('gesturechange', e => { if (e.scale < 0.8) mask(); });       // Safari's pinch: only a clear squeeze inward
    addEventListener('touchend', e => { if (masked && e.touches.length === 0) setTimeout(() => { if (document.hasFocus() && !document.hidden) unmask(); }, 300); }, { capture: true, passive: true });
    addEventListener('blur', () => {
        mask();
        if (window.top !== window) { leave(); return; }          // the arcade decides, and says 'stay' if it was just a click
        setTimeout(() => { if (document.hasFocus()) unmask(); else leave(); }, 150);
    });
})();

const NebulaProfile = (function () {
    const KEY = 'nebula-profile';
    const OLD_NAME_KEY = 'nebula-player-name';
    const DB_NAME = 'nebula-arcade', DB_STORE = 'saves';

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; }
    }
    function fresh() {
        let name = '';
        try { name = localStorage.getItem(OLD_NAME_KEY) || ''; } catch (_) {}
        return { deviceId: newPlayerId(), name, stats: {} };
    }

    const hadSave = !!load();
    let profile = load() || fresh();

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    function backUp() {
        openDb().then(db => {
            db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(JSON.stringify(profile), KEY);
            db.close();
        }).catch(() => {});
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (_) {}
        backUp();
    }

    // Resolves once any backup is back in place, so pages can show the right stats.
    const ready = hadSave ? (backUp(), Promise.resolve()) : openDb().then(db => new Promise(resolve => {
        const read = db.transaction(DB_STORE).objectStore(DB_STORE).get(KEY);
        read.onsuccess = () => {
            db.close();
            try { if (read.result) profile = JSON.parse(read.result); } catch (_) {}
            resolve();
        };
        read.onerror = () => { db.close(); resolve(); };
    })).catch(() => {}).then(save);

    function stats(game, starting) {
        return { ...starting, ...profile.stats[game] };
    }
    function setStats(game, values) {
        profile.stats[game] = { ...profile.stats[game], ...values };
        save();
    }

    return {
        ready, stats, setStats,
        deviceId: () => profile.deviceId,
        name: () => profile.name,
        setName(name) { profile.name = name; save(); }
    };
})();
