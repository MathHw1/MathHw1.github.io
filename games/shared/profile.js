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
    // The game blanks itself on the very first sign of leaving (blur, hide or pagehide), before an iPad
    // takes its tab-switcher snapshot. It comes back if it turns out the player only clicked elsewhere
    // on the page: focus returning, or the arcade saying 'stay'.
    const blank = on => { document.documentElement.style.visibility = on ? 'hidden' : ''; };
    document.addEventListener('visibilitychange', () => {
        blank(document.hidden);
        if (document.hidden) leave();
    });
    addEventListener('pagehide', () => blank(true));
    addEventListener('focus', () => blank(false));
    addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.nebula === 'stay') blank(false); });
    addEventListener('blur', () => {
        blank(true);
        if (window.top !== window) { leave(); return; }          // the arcade decides, and says 'stay' if it was just a click
        setTimeout(() => { if (document.hasFocus()) blank(false); else leave(); }, 150);
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
