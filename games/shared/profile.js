"use strict";

// The player's profile for the whole arcade: a private device ID, their username and their stats.
// It lives in localStorage with a copy in IndexedDB, which brings it back if iPad Safari clears one.

// Keeps a small picture of a game for its arcade card. A WebGL canvas clears itself after each
// frame, so call this straight after drawing. Shrinking it keeps it from filling localStorage.
// It's cut to the card's 4:3 shape around focusX, a share of the width, to keep the action in frame.
const THUMB_WIDTH = 480, THUMB_HEIGHT = 360;
function saveThumbnail(canvas, key, focusX) {
    try {
        const small = document.createElement('canvas');
        small.width = THUMB_WIDTH;
        small.height = THUMB_HEIGHT;
        const width = Math.min(canvas.width, canvas.height * 4 / 3), height = width * 3 / 4;
        const left = Math.max(0, Math.min(canvas.width - width, canvas.width * (focusX === undefined ? 0.5 : focusX) - width / 2));
        const top = (canvas.height - height) * 0.75;      // the road is near the bottom
        small.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
        localStorage.setItem(key, small.toDataURL('image/png'));
    } catch (_) {}
}

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
