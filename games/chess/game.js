"use strict";

// Chess for Nebula Arcade. Rules come from chess.js and the bots from Stockfish (both in lib/).
// Online games connect the two browsers directly with PeerJS, the same way Classic Pool does:
// the lobby code is the host's PeerJS id.

const $ = id => document.getElementById(id);

const FILES = 'abcdefgh';
// ︎ keeps iPads from drawing the pawn as a colour emoji.
const GLYPHS = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
const PIECE_NAMES = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const HOW_THEY_MOVE = {
    p: 'moves forward 1 square (2 on its first move) and captures diagonally.',
    n: 'moves in an L shape and can jump over pieces.',
    b: 'moves diagonally as far as it wants.',
    r: 'moves in straight lines as far as it wants.',
    q: 'moves in any direction as far as it wants. It’s your strongest piece!',
    k: 'moves 1 square in any direction. Keep it safe!'
};
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };

// skill = Stockfish's own level (0-20), go = how long it thinks,
// mistakes = how often it plays a random move instead, so the low levels are beatable.
const LEVELS = {
    easy:    { name: 'Easy',    skill: 0,  go: 'go depth 1',                 mistakes: 0.45 },
    medium:  { name: 'Medium',  skill: 3,  go: 'go depth 4',                 mistakes: 0.12 },
    hard:    { name: 'Hard',    skill: 11, go: 'go depth 10 movetime 700',   mistakes: 0 },
    extreme: { name: 'Extreme', skill: 20, go: 'go movetime 1500',           mistakes: 0 }
};
const MIN_BOT_THINK_MS = 500;       // so the bot doesn't reply instantly
const ENGINE_TIMEOUT_MS = 12000;
const LOW_TIME_MS = 30000;          // clock turns red under this
const FLAG_GRACE_MS = 2000;         // online: time allowed for a last-second move to arrive

const LOBBY_PREFIX = 'nebula-arcade-chess-';
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L, so codes are easy to read out
const SERVER_TIMEOUT_MS = 12000;
const CONNECT_TIMEOUT_MS = 15000;
const JOIN_RETRIES = 2;

let chess = new Chess();
let mode = null;            // 'bot' or 'online'
let myColor = 'w';
let level = 'easy';
let minutes = 10;           // chosen on the start screen; 0 = no clock
let pickedColor = 'w';
let clock = { w: 0, b: 0 };
let gameId = 0;             // goes up each new game, so a slow bot reply can't land in the next game
let selected = null;
let targets = [];
let lastMove = null;
let hintMove = null;
let thinking = false;
let over = false;

// ---------- Board ----------

const squares = {};         // square name -> its element (kept between renders, so dragging keeps working)

function buildBoard() {
    const board = $('board');
    board.innerHTML = '';
    const ranks = myColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = myColor === 'w' ? FILES.split('') : FILES.split('').reverse();
    ranks.forEach(rank => files.forEach(file => {
        const el = document.createElement('div');
        const name = file + rank;
        el.className = 'sq ' + ((FILES.indexOf(file) + rank) % 2 ? 'l' : 'd');
        el.dataset.sq = name;
        squares[name] = el;
        board.appendChild(el);
    }));
}

function kingInCheckSquare() {
    if (!chess.in_check()) return null;
    for (const name in squares) {
        const p = chess.get(name);
        if (p && p.type === 'k' && p.color === chess.turn()) return name;
    }
    return null;
}

function render() {
    const checkSq = kingInCheckSquare();
    for (const name in squares) {
        const el = squares[name];
        const p = chess.get(name);
        let html = p ? `<span class="piece ${p.color}">${GLYPHS[p.type]}</span>` : '';
        const target = targets.find(m => m.to === name);
        if (target) html += `<span class="${p || target.flags.includes('e') ? 'ring' : 'dot'}"></span>`;
        // Square names along the edges of the board
        const view = el.parentElement.children;
        const index = Array.prototype.indexOf.call(view, el);
        if (index % 8 === 0) html += `<span class="coord rank">${name[1]}</span>`;
        if (index >= 56) html += `<span class="coord file">${name[0]}</span>`;
        el.innerHTML = html;
        el.classList.toggle('last', !!lastMove && lastMove.includes(name));
        el.classList.toggle('sel', name === selected);
        el.classList.toggle('hint', !!hintMove && hintMove.includes(name));
        el.classList.toggle('check', name === checkSq);
    }
    renderStatus();
    renderClocks();
    renderTaken();
    $('undoBtn').disabled = !(mode === 'bot' && !over && !thinking && chess.turn() === myColor && chess.history().length >= 2);
    $('hintBtn').disabled = !(mode === 'bot' && !over && !thinking && chess.turn() === myColor);
    $('resignBtn').disabled = over;
}

function renderStatus() {
    const s = $('status');
    let text;
    s.classList.remove('alert');
    if (over) text = 'Game over';
    else if (chess.turn() !== myColor) text = mode === 'bot' ? '🤖 The bot is thinking…' : '⏳ Waiting for your friend…';
    else if (chess.in_check()) { text = '⚠️ Check! Your king is under attack. You must protect it.'; s.classList.add('alert'); }
    else if (selected) {
        const p = chess.get(selected);
        text = `The ${PIECE_NAMES[p.type].toLowerCase()} ${HOW_THEY_MOVE[p.type]}`;
    }
    else text = 'Your turn! Tap a piece to see where it can go.';
    s.textContent = text;
}

function renderTaken() {
    // Shows the pieces you've captured.
    const left = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    const them = myColor === 'w' ? 'b' : 'w';
    for (const name in squares) {
        const p = chess.get(name);
        if (p && p.color === them && p.type !== 'k') left[p.type]++;
    }
    let out = '';
    for (const t of ['q', 'r', 'b', 'n', 'p']) out += GLYPHS[t].repeat(Math.max(0, START_COUNT[t] - left[t]));
    $('taken').textContent = out;
}

// ---------- Moving pieces ----------

function myTurn() {
    return !over && !thinking && chess.turn() === myColor;
}

function select(square) {
    selected = square;
    targets = square ? chess.moves({ square, verbose: true }) : [];
    render();
}

function onSquare(square) {
    if (!myTurn()) return;
    if (selected && targets.some(m => m.to === square)) { tryMove(selected, square); return; }
    const p = chess.get(square);
    select(p && p.color === myColor && square !== selected ? square : null);
}

function tryMove(from, to) {
    const move = targets.find(m => m.to === to);
    if (move.flags.includes('p')) askPromotion(from, to);
    else doMove(from, to);
}

function askPromotion(from, to) {
    const choices = $('promoChoices');
    choices.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(type => {
        const b = document.createElement('button');
        b.innerHTML = `<span class="piece ${myColor}" style="font-size:40px">${GLYPHS[type]}</span><span>${PIECE_NAMES[type]}</span>`;
        b.addEventListener('click', () => { $('promo').classList.add('hidden'); doMove(from, to, type); });
        choices.appendChild(b);
    });
    $('promo').classList.remove('hidden');
}

function doMove(from, to, promotion, fromFriend) {
    const move = chess.move({ from, to, promotion: promotion || 'q' });
    if (!move) return false;
    lastMove = [from, to];
    selected = null;
    targets = [];
    hintMove = null;
    if (mode === 'online' && !fromFriend) online.send({ t: 'move', from, to, promotion: move.promotion, clock });
    render();
    if (checkGameOver()) return true;
    if (mode === 'bot' && chess.turn() !== myColor) botMove();
    return true;
}

function checkGameOver() {
    if (chess.in_checkmate()) {
        const iWon = chess.turn() !== myColor;
        finish(iWon ? '🏆 Checkmate! You win!' : 'Checkmate. You lost.',
            iWon ? 'The other king has no way to escape. Nice game!' : 'Your king had no way to escape. Good try!');
    }
    else if (chess.in_stalemate()) finish('🤝 Draw: stalemate', 'The player to move has no legal moves but isn’t in check, so nobody wins.');
    else if (chess.insufficient_material()) finish('🤝 Draw', 'There aren’t enough pieces left for anyone to win.');
    else if (chess.in_threefold_repetition()) finish('🤝 Draw', 'The same position came up three times.');
    else if (chess.in_draw()) finish('🤝 Draw', 'Fifty moves went by with no captures or pawn moves.');
    return over;
}

function finish(title, text) {
    if (over) return;
    over = true;
    thinking = false;
    selected = null;
    targets = [];
    online.rematchMine = online.rematchTheirs = false;
    render();
    $('overTitle').textContent = title;
    $('overText').textContent = text;
    $('overAgain').textContent = 'Play again';
    $('overAgain').disabled = false;
    $('over').classList.remove('hidden');
}

// ---------- Clocks ----------

function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
}

function clockRunning() {
    return minutes > 0 && !over && chess.history().length > 0;   // starts after White's first move
}

function renderClocks() {
    $('clocks').classList.toggle('hidden', minutes === 0);
    if (minutes === 0) return;
    const them = myColor === 'w' ? 'b' : 'w';
    $('timeMe').textContent = formatTime(clock[myColor]);
    $('timeThem').textContent = formatTime(clock[them]);
    $('clockMe').classList.toggle('active', !over && chess.turn() === myColor);
    $('clockThem').classList.toggle('active', !over && chess.turn() === them);
    $('clockMe').classList.toggle('low', clock[myColor] < LOW_TIME_MS);
    $('clockThem').classList.toggle('low', clock[them] < LOW_TIME_MS);
}

let lastTick = performance.now();
setInterval(() => {
    const now = performance.now();
    const passed = now - lastTick;
    lastTick = now;
    if (!mode || !clockRunning()) return;

    const turn = chess.turn();
    clock[turn] -= passed;
    renderClocks();
    if (turn === myColor && clock[turn] <= 0) {
        if (mode === 'online') online.send({ t: 'flag' });
        finish('⏰ Out of time. You lost.', 'Your clock reached zero. Try a longer time next game!');
    }
    else if (turn !== myColor && clock[turn] <= (mode === 'online' ? -FLAG_GRACE_MS : 0)) {
        finish('🏆 You win on time!', 'The other player’s clock reached zero.');
    }
}, 100);

// ---------- Bots (Stockfish) ----------

const engine = { worker: null, listener: null, queue: Promise.resolve() };

function startEngine(src) {
    src = src || 'lib/stockfish.wasm.js';
    try {
        const worker = engine.worker = new Worker(src);
        worker.onmessage = e => {
            const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
            if (engine.listener) engine.listener(line);
        };
        worker.onerror = () => {
            // Older browsers without WebAssembly get the slower plain JavaScript build.
            if (src !== 'lib/stockfish.js') startEngine('lib/stockfish.js');
            else { engine.worker = null; if (engine.listener) engine.listener('bestmove (none)'); }
        };
        worker.postMessage('uci');
    } catch (_) { engine.worker = null; }
}

// Resolves with a move like "e2e4", or null if the engine can't answer.
function askEngine(fen, skill, go) {
    if (!engine.worker) startEngine();
    const run = () => new Promise(resolve => {
        if (!engine.worker) { resolve(null); return; }
        const timer = setTimeout(() => done(null), ENGINE_TIMEOUT_MS);
        function done(move) { clearTimeout(timer); engine.listener = null; resolve(move); }
        engine.listener = line => {
            const m = /^bestmove (\S+)/.exec(line);
            if (m) done(m[1] === '(none)' ? null : m[1]);
        };
        engine.worker.postMessage('setoption name Skill Level value ' + skill);
        engine.worker.postMessage('position fen ' + fen);
        engine.worker.postMessage(go);
    });
    return (engine.queue = engine.queue.then(run, run));
}

function randomMove() {
    const moves = chess.moves({ verbose: true });
    const m = moves[Math.floor(Math.random() * moves.length)];
    return m.from + m.to + (m.promotion || '');
}

async function botMove() {
    const id = gameId, settings = LEVELS[level], started = performance.now();
    thinking = true;
    render();

    let go = settings.go;
    // Extreme uses less time when its clock is low, instead of running out.
    if (minutes > 0 && level === 'extreme') go = 'go movetime ' + Math.max(100, Math.min(1500, Math.floor(clock[chess.turn()] / 30)));

    let uci = Math.random() < settings.mistakes ? randomMove() : await askEngine(chess.fen(), settings.skill, go);
    const wait = MIN_BOT_THINK_MS - (performance.now() - started);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (id !== gameId || over) return;

    thinking = false;
    uci = uci || randomMove();
    if (!doMove(uci.slice(0, 2), uci.slice(2, 4), uci[4])) { const r = randomMove(); doMove(r.slice(0, 2), r.slice(2, 4), r[4]); }
}

async function showHint() {
    if (!myTurn()) return;
    const id = gameId;
    $('hintBtn').disabled = true;
    $('status').textContent = '💡 Looking for a good move…';
    const uci = await askEngine(chess.fen(), 20, 'go depth 10 movetime 800');
    if (id !== gameId || over || !uci) { render(); return; }
    hintMove = [uci.slice(0, 2), uci.slice(2, 4)];
    render();
    const p = chess.get(hintMove[0]);
    $('status').textContent = `💡 Try moving your ${PIECE_NAMES[p.type].toLowerCase()} from ${hintMove[0]} to ${hintMove[1]} (shown in green).`;
}

function takeBack() {
    if (mode !== 'bot' || !myTurn() || chess.history().length < 2) return;
    chess.undo();
    chess.undo();
    const history = chess.history({ verbose: true });
    const last = history[history.length - 1];
    lastMove = last ? [last.from, last.to] : null;
    selected = null;
    targets = [];
    hintMove = null;
    render();
}

// ---------- Starting and leaving games ----------

function startGame(newMode, color, newLevel) {
    gameId++;
    mode = newMode;
    myColor = color;
    level = newLevel || level;
    chess = new Chess();
    clock = { w: minutes * 60000, b: minutes * 60000 };
    selected = null; targets = []; lastMove = null; hintMove = null; thinking = false; over = false;

    $('nameThem').textContent = mode === 'bot' ? 'Bot (' + LEVELS[level].name + ')' : 'Friend';
    $('home').classList.add('hidden');
    $('over').classList.add('hidden');
    $('promo').classList.add('hidden');
    $('game').classList.remove('hidden');
    $('hintBtn').classList.toggle('hidden', mode !== 'bot');
    $('undoBtn').classList.toggle('hidden', mode !== 'bot');

    buildBoard();
    render();
    if (mode === 'bot') {
        if (!engine.worker) startEngine();
        if (engine.worker) engine.worker.postMessage('ucinewgame');
        if (myColor === 'b') botMove();
    }
}

function toMenu() {
    gameId++;
    mode = null;
    online.leave();
    $('over').classList.add('hidden');
    $('promo').classList.add('hidden');
    $('game').classList.add('hidden');
    $('home').classList.remove('hidden');
    setMinutes(minutes);   // a guest's time comes from the host, so show it
    showLobby('start');
    lobbyMessage('');
}

function resign() {
    if (over || !mode) return;
    if (!confirm('Give up this game?')) return;
    if (mode === 'online') online.send({ t: 'resign' });
    finish('You resigned.', 'No worries. Every game is good practice!');
}

function playAgain() {
    if (mode === 'bot') { startGame('bot', myColor); return; }
    online.rematchMine = true;
    online.send({ t: 'rematch' });
    if (online.rematchTheirs) online.startRematch();
    else {
        $('overAgain').textContent = 'Waiting for your friend…';
        $('overAgain').disabled = true;
    }
}

// ---------- Online lobby ----------

const online = {
    peer: null, conn: null, retryTimer: null, rematchMine: false, rematchTheirs: false,

    send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); },

    create() {
        if (typeof Peer === 'undefined') { lobbyMessage('Online play couldn’t load. Check your internet and refresh.'); return; }
        this.leave();
        let code = '';
        for (let i = 0; i < 5; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
        lobbyMessage('Creating lobby…');
        const peer = this.peer = new Peer(LOBBY_PREFIX + code);
        this.watchServer(peer);
        peer.on('open', () => { $('lobbyCode').textContent = code; showLobby('wait'); lobbyMessage(''); });
        peer.on('connection', conn => {
            // A join that failed doesn't count as filling the lobby.
            if (this.conn && this.conn.open) { conn.close(); return; }
            if (this.conn) this.conn.close();
            this.attach(conn, 'w');
        });
        peer.on('error', err => {
            if (err.type === 'unavailable-id') this.create();   // someone has this code already
            else this.fail(err);
        });
    },

    join(code, triesLeft) {
        if (typeof Peer === 'undefined') { lobbyMessage('Online play couldn’t load. Check your internet and refresh.'); return; }
        code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 5) { lobbyMessage('That code should be 5 letters or numbers.'); return; }
        if (triesLeft === undefined) triesLeft = JOIN_RETRIES;
        this.leave();
        lobbyMessage('Joining lobby ' + code + '…');
        const peer = this.peer = new Peer();
        this.watchServer(peer);
        peer.on('open', () => {
            if (this.conn) return;   // already joining (this fires again after a reconnect)
            this.attach(peer.connect(LOBBY_PREFIX + code, { reliable: true }), 'b');
        });
        peer.on('error', err => {
            if (err.type === 'peer-unavailable') {
                this.leave();
                // The server sometimes says a lobby doesn't exist when it does, so try again first.
                if (triesLeft > 0) this.retryTimer = setTimeout(() => this.join(code, triesLeft - 1), 1500);
                else lobbyMessage('No lobby with code ' + code + '. Check the code and try again.');
            }
            else this.fail(err);
        });
    },

    // Keeps a lobby reachable if the link to the matchmaking server drops, and gives up
    // with a message if the server never answers.
    watchServer(peer) {
        peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
        setTimeout(() => {
            if (this.peer === peer && !peer.open && !peer.destroyed && !this.conn) {
                this.leave();
                showLobby('start');
                lobbyMessage('The lobby server didn’t answer. Check your internet and try again.');
            }
        }, SERVER_TIMEOUT_MS);
    },

    attach(conn, color) {
        this.conn = conn;
        conn.on('open', () => {
            // The host starts as White and tells the guest how much time was picked.
            if (color === 'w') { this.send({ t: 'start', minutes }); startGame('online', 'w'); }
        });
        conn.on('data', msg => this.receive(msg));
        conn.on('error', err => { if (this.conn === conn) this.fail(err); });
        conn.on('close', () => {
            if (this.conn !== conn) return;
            this.conn = null;
            if (mode === 'online' && !over) finish('🏆 You win!', 'Your friend left the game.');
            else if (mode === 'online') { $('overAgain').textContent = 'Your friend left'; $('overAgain').disabled = true; }
        });
        // If the two computers can't reach each other, say so instead of hanging forever.
        setTimeout(() => {
            if (this.conn !== conn || conn.open) return;
            this.conn = null;
            conn.close();
            if (color === 'b') {
                this.leave();
                lobbyMessage('Couldn’t reach your friend’s game. Make sure their lobby is still open, then try again. ' +
                    'If it keeps failing, one of your networks (often school Wi-Fi) is blocking it.');
            }
        }, CONNECT_TIMEOUT_MS);
    },

    receive(msg) {
        if (!msg || !mode && msg.t !== 'start') return;
        switch (msg.t) {
            case 'start': {
                const m = Number(msg.minutes);
                minutes = m >= 0 && m <= 180 ? m : 10;
                startGame('online', 'b');
                break;
            }
            case 'move':
                if (over || chess.turn() === myColor) return;
                if (doMove(msg.from, msg.to, msg.promotion, true) && msg.clock) {
                    // Use the mover's clocks, so both screens agree.
                    clock = { w: Number(msg.clock.w) || 0, b: Number(msg.clock.b) || 0 };
                    renderClocks();
                }
                break;
            case 'resign':
                finish('🏆 You win!', 'Your friend resigned.');
                break;
            case 'flag':
                finish('🏆 You win on time!', 'Your friend’s clock reached zero.');
                break;
            case 'rematch':
                this.rematchTheirs = true;
                if (this.rematchMine) this.startRematch();
                else if (over) $('overText').textContent = 'Your friend wants to play again!';
                break;
        }
    },

    startRematch() {
        this.rematchMine = this.rematchTheirs = false;
        startGame('online', myColor === 'w' ? 'b' : 'w');   // swap colours
    },

    fail(err) {
        console.warn('Online chess error', err);
        lobbyMessage('Couldn’t connect (' + (err.type || 'network error') +
            '). Some school or work networks block this. Try again, or try another network.');
    },

    leave() {
        clearTimeout(this.retryTimer);
        this.rematchMine = this.rematchTheirs = false;
        if (this.conn) { const c = this.conn; this.conn = null; c.close(); }
        if (this.peer) { this.peer.destroy(); this.peer = null; }
    }
};

function showLobby(which) {
    $('lobbyStart').classList.toggle('hidden', which !== 'start');
    $('lobbyWait').classList.toggle('hidden', which !== 'wait');
}

function lobbyMessage(text) {
    $('lobbyMsg').textContent = text;
    $('lobbyMsg').classList.toggle('hidden', !text);
}

// ---------- Buttons ----------

function fillHowTo() {
    const lines = [
        '<p>You and your opponent take turns moving one piece. <b>Win by trapping the other king</b> so it can’t escape. That’s called <b>checkmate</b>.</p>',
        '<p>Tap a piece and green dots show where it can go. Red circles show what it can capture.</p>'
    ];
    for (const t of ['p', 'n', 'b', 'r', 'q', 'k']) {
        lines.push(`<p><span class="piece w" style="font-size:22px;--size:0">${GLYPHS[t]}</span> <b>${PIECE_NAMES[t]}</b> ${HOW_THEY_MOVE[t]}</p>`);
    }
    $('howList').innerHTML = lines.join('');
}

function setMinutes(value) {
    minutes = value;
    document.querySelectorAll('#times button').forEach(b => b.classList.toggle('on', Number(b.dataset.min) === value));
}

$('times').addEventListener('click', e => {
    const b = e.target.closest('[data-min]');
    if (!b) return;
    $('customMin').value = '';
    setMinutes(Number(b.dataset.min));
});
$('customMin').addEventListener('input', e => {
    const value = Math.floor(Number(e.target.value));
    if (value >= 1 && value <= 180) setMinutes(value);
});
$('colors').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    pickedColor = b.dataset.color;
    document.querySelectorAll('#colors button').forEach(x => x.classList.toggle('on', x === b));
});
$('levels').addEventListener('click', e => {
    const b = e.target.closest('[data-level]');
    if (!b) return;
    const color = pickedColor === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pickedColor;
    startGame('bot', color, b.dataset.level);
});

$('createBtn').addEventListener('click', () => online.create());
$('joinBtn').addEventListener('click', () => online.join($('joinCode').value));
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') online.join($('joinCode').value); });
$('cancelBtn').addEventListener('click', () => { online.leave(); showLobby('start'); lobbyMessage(''); });

$('hintBtn').addEventListener('click', showHint);
$('undoBtn').addEventListener('click', takeBack);
$('resignBtn').addEventListener('click', resign);
$('menuBtn').addEventListener('click', () => {
    if (over || confirm('Leave this game?')) { if (!over && mode === 'online') online.send({ t: 'resign' }); toMenu(); }
});
$('overMenu').addEventListener('click', toMenu);
$('overView').addEventListener('click', () => $('over').classList.add('hidden'));
$('overAgain').addEventListener('click', playAgain);

const openHow = () => $('how').classList.remove('hidden');
$('howBtn').addEventListener('click', openHow);
$('howBtnHome').addEventListener('click', openHow);
$('howClose').addEventListener('click', () => $('how').classList.add('hidden'));

// Tap a piece then a square, or drag a piece to a square.
let pressedOn = null;
$('board').addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-sq]');
    if (!el) return;
    pressedOn = el.dataset.sq;
    onSquare(pressedOn);
});
window.addEventListener('pointerup', e => {
    const start = pressedOn;
    pressedOn = null;
    if (!start || !selected) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sq = el && el.closest && el.closest('[data-sq]');
    if (sq && sq.dataset.sq !== start && targets.some(m => m.to === sq.dataset.sq)) tryMove(selected, sq.dataset.sq);
});

fillHowTo();
