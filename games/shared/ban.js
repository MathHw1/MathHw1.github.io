"use strict";

// The "Access banned" screen. A device the owner bans sees it straight away: the lobby server tells an
// open game, and every page checks again when it opens. It's remembered on the device, and it clears
// itself if the owner lifts the ban. Needs lobby-client.js and profile.js loaded first.

const NebulaBan = (function () {
    const KEY = 'nebula-banned';
    const CHECK_EVERY_MS = 15000;
    let screen = null;

    // Remembered in three places: localStorage, a long-lived cookie, and the profile (backed up to
    // IndexedDB). Any one of them is enough, so clearing one doesn't lift the ban.
    const COOKIE_DAYS = 400;
    const inCookie = () => document.cookie.split('; ').includes(KEY + '=yes');
    function remembered() {
        let here = false;
        try { here = localStorage.getItem(KEY) === 'yes'; } catch (_) {}
        return here || inCookie() || !!NebulaProfile.stats('device', {}).banned;
    }
    function remember(banned) {
        try { banned ? localStorage.setItem(KEY, 'yes') : localStorage.removeItem(KEY); } catch (_) {}
        document.cookie = KEY + '=' + (banned ? 'yes' : '') + '; path=/; SameSite=Lax; max-age=' + (banned ? COOKIE_DAYS * 86400 : 0);
        NebulaProfile.setStats('device', { banned });
    }

    function show() {
        remember(true);
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
        remember(false);
        if (screen) { screen.remove(); screen = null; }
    }
    // A device that remembers a ban tells the server, so the ban survives the server restarting.
    // Only the owner's unban (status.unbanned) lifts a remembered ban.
    function check() {
        NebulaProfile.ready.then(() => {
            const wasBanned = remembered();
            if (wasBanned) show();
            // The username goes along too, so a banned name is caught on a new device.
            const ask = new URLSearchParams({ name: NebulaProfile.name() });
            if (wasBanned) ask.set('banned', '1');
            return fetch(LOBBY_SERVER_URL + '/perks/' + NebulaProfile.deviceId() + '?' + ask)
                .then(reply => reply.ok ? reply.json() : null)
                .then(status => {
                    if (!status) return;
                    if (status.banned) show();
                    else if (!wasBanned || status.unbanned) hide();
                });
        }).catch(() => {});
    }

    let early = inCookie();
    try { early = early || localStorage.getItem(KEY) === 'yes'; } catch (_) {}
    if (early) {
        if (document.body) show(); else addEventListener('DOMContentLoaded', show);
    }
    addEventListener('nebula-banned', show);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    check();
    setInterval(check, CHECK_EVERY_MS);
    return { show, hide, check };
})();
