"use strict";

// The "Access banned" screen. A device the owner bans sees it straight away: the lobby server tells an
// open game, and every page checks again when it opens. It's remembered on the device, and it clears
// itself if the owner lifts the ban. Needs lobby-client.js and profile.js loaded first.

const NebulaBan = (function () {
    const KEY = 'nebula-banned';
    const CHECK_EVERY_MS = 60000;
    let screen = null;

    function show() {
        try { localStorage.setItem(KEY, 'yes'); } catch (_) {}
        if (screen) return;
        screen = document.createElement('div');
        screen.setAttribute('role', 'alertdialog');
        screen.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:#0b0d14;color:#f1f5f9;' +
            'font-family:system-ui,-apple-system,sans-serif;text-align:center;touch-action:none';
        screen.innerHTML = '<div style="max-width:420px"><div style="font-size:64px">🚫</div><h1 style="margin:8px 0;font-size:30px">Access banned</h1>' +
            '<p style="color:#94a3b8;line-height:1.5">This device has been banned from Nebula Arcade by the owner.</p></div>';
        // Swallow every tap and key, so nothing underneath can be used.
        ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(type => screen.addEventListener(type, e => { e.stopPropagation(); e.preventDefault(); }, true));
        (document.body || document.documentElement).appendChild(screen);
    }
    function hide() {
        try { localStorage.removeItem(KEY); } catch (_) {}
        if (screen) { screen.remove(); screen = null; }
    }
    function check() {
        NebulaProfile.ready.then(() => fetch(LOBBY_SERVER_URL + '/perks/' + NebulaProfile.deviceId()))
            .then(reply => reply.ok ? reply.json() : null)
            .then(status => { if (status) (status.banned ? show : hide)(); })
            .catch(() => {});
    }

    let remembered = false;
    try { remembered = localStorage.getItem(KEY) === 'yes'; } catch (_) {}
    if (remembered) {
        if (document.body) show(); else addEventListener('DOMContentLoaded', show);
    }
    addEventListener('nebula-banned', show);
    check();
    setInterval(check, CHECK_EVERY_MS);
    return { show, hide, check };
})();
