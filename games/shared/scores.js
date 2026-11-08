"use strict";

// Leaderboards for Nebula Arcade. Scores save on this device and go to the lobby server, which holds
// the boards for everyone. Needs lobby-client.js, touch-keyboard.js and profile.js loaded first.
// Free servers forget everything when they sleep, so hello() sends your bests again on each visit.

const NebulaScores = (function () {
    const OLD_LOCAL_KEY = 'nebula-scores:wheelie';
    const LOCAL_SIZE = 10;
    const TIMEOUT_MS = 12000;
    const NAME_PICKS = ['SPEEDY FOX', 'WHEELIE KING', 'TURBO TIGER', 'SHADOW RIDER', 'NEON WOLF', 'ROCKET ACE'];

    // AbortSignal.timeout only exists from iPadOS 16, so older iPads build the same thing by hand.
    function timeLimit() {
        if (AbortSignal.timeout) return AbortSignal.timeout(TIMEOUT_MS);
        const stop = new AbortController();
        setTimeout(() => stop.abort(), TIMEOUT_MS);
        return stop.signal;
    }

    const minutes = ms => {
        const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
        return m + ':' + s.toFixed(2).padStart(5, '0');
    };
    const GAMES = [
        { id: 'wheelie', name: '🏍️ Wheelie Life', boards: [
            { id: 'wheelie:score', name: 'High Score', show: n => n.toLocaleString() },
            { id: 'wheelie:level', name: 'Highest Level', show: n => 'Level ' + n },
            { id: 'wheelie:miles', name: 'Total Miles', show: n => (n / 100).toFixed(2) + ' mi' },
            { id: 'wheelie:time', name: 'Fastest Mile', show: minutes, lower: true }
        ] },
        { id: 'racing', name: '🏎️ Tiny Turbo', boards: [{ id: 'racing:time', name: 'Fastest Race', show: minutes, lower: true }] },
        { id: 'chess', name: '♟️ Chess', boards: [{ id: 'chess:elo', name: 'ELO Rating', show: n => n.toLocaleString() }] },
        { id: 'pool', name: '🎱 Pool', boards: [{ id: 'pool:wins', name: 'Online Wins', show: n => n + ' · ' + poolRank(n) }] }
    ];
    const allBoards = GAMES.flatMap(game => game.boards);
    const boardInfo = id => allBoards.find(b => b.id === id);

    function poolRank(wins) {
        return wins >= 30 ? 'Table Legend' : wins >= 15 ? 'Hustler' : wins >= 5 ? 'Room Shark' : 'Novice Cue';
    }

    function local(board) {
        return NebulaProfile.stats('boards', {})[board] || [];
    }
    function addLocal(board, value) {
        const lower = boardInfo(board).lower;
        const list = [...local(board), { name: NebulaProfile.name() || 'YOU', score: value }]
            .sort((a, b) => lower ? a.score - b.score : b.score - a.score);
        NebulaProfile.setStats('boards', { [board]: list.slice(0, LOCAL_SIZE) });
    }
    const best = board => (local(board)[0] || { score: 0 }).score;

    // Scores from before there were several boards.
    NebulaProfile.ready.then(() => {
        try {
            const old = JSON.parse(localStorage.getItem(OLD_LOCAL_KEY));
            if (old && !local('wheelie:score').length) NebulaProfile.setStats('boards', { 'wheelie:score': old });
            localStorage.removeItem(OLD_LOCAL_KEY);
        } catch (_) {}
    });

    async function everyone(board) {
        const [game, category] = board.split(':');
        const reply = await fetch(LOBBY_SERVER_URL + '/scores/' + game + '/' + category, { signal: timeLimit() });
        if (!reply.ok) throw new Error('Leaderboard error ' + reply.status);
        return (await reply.json()).scores;
    }

    // Returns { scores, rank }. A failed reply is thrown with a message fit to show the player.
    async function send(board, value) {
        const reply = await fetch(LOBBY_SERVER_URL + '/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board, name: NebulaProfile.name(), score: Math.round(value), deviceId: NebulaProfile.deviceId() }),
            signal: timeLimit()
        });
        if (reply.status === 422) throw new Error('That username isn’t allowed. Pick a different one.');
        if (reply.status === 403) throw new Error('This device can’t post scores.');
        if (!reply.ok) throw new Error('Saved here. The leaderboard couldn’t be reached right now.');
        return reply.json();
    }

    // Saves a result on this device, then posts it if the player has a name.
    function record(board, value) {
        const rounded = Math.round(value);
        if (rounded < 1) return null;
        addLocal(board, rounded);
        return NebulaProfile.name() ? send(board, rounded) : null;
    }

    // Puts this player's bests back on the boards, in case the server was wiped.
    function hello(game) {
        NebulaProfile.ready.then(() => {
            if (!NebulaProfile.name()) return;
            for (const board of GAMES.find(g => g.id === game).boards) {
                if (best(board.id) >= 1) send(board.id, best(board.id)).catch(() => {});
            }
        });
    }

    function askName(onDone, onCancel) {
        showTouchKeyboard({ title: 'Pick a username. Everyone can see it.', value: NebulaProfile.name(), maxLength: 12, picks: NAME_PICKS, okLabel: 'Save name', onCancel,
            onDone(name) { NebulaProfile.setName(name); onDone(name); } });
    }

    function addStyles() {
        if (document.getElementById('scoreBoardStyles')) return;
        const css = document.createElement('style');
        css.id = 'scoreBoardStyles';
        css.textContent =
            '.sb-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
            '.sb-tabs button{flex:1 1 auto;padding:9px 10px;font:inherit;font-size:14px;font-weight:700;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:9px;cursor:pointer;touch-action:manipulation}' +
            '.sb-tabs button.on{background:#7c3aed;border-color:#7c3aed}' +
            '.sb-list{list-style:none;margin:8px 0;padding:0;max-height:40vh;overflow:auto;touch-action:pan-y}' +
            '.sb-list li{display:flex;justify-content:space-between;gap:10px;padding:7px 4px;border-top:1px solid rgba(255,255,255,.1)}' +
            '.sb-list li.empty{display:block;color:#94a3b8}' +
            '.sb-name{margin:6px 0 10px;color:#94a3b8}.sb-name b{color:#fff}.sb-name button{margin-left:8px;padding:6px 10px;font:inherit;font-size:13px;font-weight:700;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:8px;cursor:pointer}';
        document.head.appendChild(css);
    }

    // Fills `box` with the boards. `gameIds` picks which games to offer.
    function mount(box, gameIds) {
        addStyles();
        const games = GAMES.filter(g => gameIds.includes(g.id));
        let game = games[0], board = game.boards[0], scope = 'everyone', turn = 0;
        const tabs = () => {
            const row = document.createElement('div');
            row.className = 'sb-tabs';
            return row;
        };
        const gameRow = tabs(), boardRow = tabs(), scopeRow = tabs();
        const list = document.createElement('ol');
        list.className = 'sb-list';
        const nameLine = document.createElement('p');
        nameLine.className = 'sb-name';
        box.textContent = '';
        if (games.length > 1) box.appendChild(gameRow);
        box.append(boardRow, scopeRow, list, nameLine);

        function row(parent, label, on, pick) {
            const b = document.createElement('button');
            b.textContent = label;
            b.className = on ? 'on' : '';
            b.addEventListener('click', () => { pick(); fill(); });
            parent.appendChild(b);
        }
        function note(text) {
            list.textContent = '';
            const item = document.createElement('li');
            item.className = 'empty';
            item.textContent = text;
            list.appendChild(item);
        }
        function draw(rows) {
            list.textContent = '';
            rows.forEach((entry, i) => {
                const item = document.createElement('li'), name = document.createElement('span'), score = document.createElement('b');
                name.textContent = (i + 1) + '. ' + entry.name;
                score.textContent = board.show(entry.score);
                item.append(name, score);
                list.appendChild(item);
            });
            if (!rows.length) note('No scores yet. Go set one!');
        }
        async function fill() {
            const mine = ++turn;
            gameRow.textContent = boardRow.textContent = scopeRow.textContent = '';
            games.forEach(g => row(gameRow, g.name, g === game, () => { game = g; board = g.boards[0]; }));
            game.boards.forEach(b => row(boardRow, b.name, b === board, () => { board = b; }));
            row(scopeRow, 'Everyone', scope === 'everyone', () => { scope = 'everyone'; });
            row(scopeRow, 'This device', scope === 'mine', () => { scope = 'mine'; });

            nameLine.textContent = 'Your name: ';
            const shown = document.createElement('b');
            shown.textContent = NebulaProfile.name() || 'None yet';
            const rename = document.createElement('button');
            rename.textContent = 'Change';
            rename.addEventListener('click', () => askName(() => { hello(game.id); fill(); }));
            nameLine.append(shown, rename);

            if (scope === 'mine') { draw(local(board.id)); return; }
            note('Loading…');
            try {
                const rows = await everyone(board.id);
                if (mine === turn) draw(rows);
            } catch (_) {
                if (mine === turn) note('Couldn’t reach the leaderboard. The server may be waking up, so try again in a minute.');
            }
        }
        NebulaProfile.ready.then(fill);
        return fill;
    }

    return { GAMES, poolRank, local, best, everyone, send, record, hello, askName, mount };
})();
