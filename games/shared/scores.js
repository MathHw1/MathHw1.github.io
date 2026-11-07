"use strict";

// Leaderboards for Nebula Arcade. Scores save in this browser and go to the lobby server, which holds
// the board for everyone. Needs lobby-client.js loaded first, for the server's address.
// Free servers forget everything when they sleep, so hello() sends your best again on each visit.

const NebulaScores = (function () {
    const NAME_KEY = 'nebula-player-name';
    const LOCAL_KEY = 'nebula-scores:';
    const LOCAL_SIZE = 10;
    const TIMEOUT_MS = 12000;
    const NAME_PICKS = ['SPEEDY FOX', 'WHEELIE KING', 'TURBO TIGER', 'SHADOW RIDER', 'NEON WOLF', 'ROCKET ACE'];

    function read(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, value); } catch (_) {}
    }

    const getName = () => read(NAME_KEY) || '';
    const setName = name => write(NAME_KEY, name);

    function local(game) {
        try { return JSON.parse(read(LOCAL_KEY + game)) || []; } catch (_) { return []; }
    }
    function addLocal(game, score) {
        const list = local(game);
        list.push({ name: getName() || 'YOU', score });
        list.sort((a, b) => b.score - a.score);
        write(LOCAL_KEY + game, JSON.stringify(list.slice(0, LOCAL_SIZE)));
    }
    const best = game => (local(game)[0] || { score: 0 }).score;

    async function everyone(game) {
        const reply = await fetch(LOBBY_SERVER_URL + '/scores/' + game, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!reply.ok) throw new Error('Leaderboard error ' + reply.status);
        return (await reply.json()).scores;
    }

    // Returns { scores, rank }.
    async function send(game, score) {
        const reply = await fetch(LOBBY_SERVER_URL + '/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game, name: getName(), score: Math.floor(score) }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (!reply.ok) throw new Error('Leaderboard error ' + reply.status);
        return reply.json();
    }

    // Puts this player's best back on the board, in case the server was wiped.
    function hello(game) {
        if (getName() && best(game) >= 1) send(game, best(game)).catch(() => {});
    }

    function askName(onDone, onCancel) {
        showTouchKeyboard({ title: 'Pick a name for the leaderboard', value: getName(), maxLength: 12, picks: NAME_PICKS, okLabel: 'Save name', onCancel,
            onDone(name) { setName(name); onDone(name); } });
    }

    return { getName, setName, local, addLocal, best, everyone, send, hello, askName };
})();
