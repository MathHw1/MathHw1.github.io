"use strict";

// Nebula Arcade lobby server. Players share a 5-letter room code, and everything one
// sends is passed to the others. Hosts like Render handle HTTPS, so players connect
// to wss://…:443 while this app just listens on the PORT the host gives it.

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { isRude } = require('./name-filter');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mathhw1.github.io').split(',').map(s => s.trim());
// Set TRANSPORTS=polling to test how clients cope on a network that blocks WebSockets.
const TRANSPORTS = (process.env.TRANSPORTS || 'websocket,polling').split(',');

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L, so codes are easy to read out
const CODE_LENGTH = 5;
const ROOM_SIZES = { pool: 4, chess: 2, wheelie: 4, racing: 6 };
const NAME_PATTERN = /^[A-Z0-9 ]{1,12}$/;
const DEVICE_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_ROOMS = 5000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_SECOND = 40;
const LOG_LENGTH = 1000;                       // messages kept per room, for players catching up
// How long a dropped player keeps their seat. Races are short, so nobody should wait long for one.
const GRACE_MS = { pool: 120000, chess: 120000, wheelie: 40000, racing: 40000 };
const TEST_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 0;
const graceFor = room => TEST_GRACE_MS || GRACE_MS[room.game];
const WAITING_ROOM_MS = 30 * 60000;            // a lobby nobody joined closes after this
const CLEANUP_MS = TEST_GRACE_MS ? Math.min(5000, TEST_GRACE_MS / 2) : 5000;

// The leaderboards live in memory, and free hosts wipe that when they sleep. Each player's browser
// keeps their own bests and sends them again on every visit, so the boards fill back up by themselves.
// lower: true means the smallest value wins, as with fastest times.
const BOARDS = {
    'wheelie:score': {}, 'wheelie:level': {}, 'wheelie:miles': {}, 'wheelie:time': { lower: true },
    'racing:time': { lower: true }, 'racing:time50': { lower: true }, 'racing:time150': { lower: true }, 'racing:time200': { lower: true }, 'chess:elo': {}, 'pool:wins': {},
    'tunnel:score': {}, 'tunnel:level': {}, 'tunnel:distance': {}, 'tunnel:time': {}
};
const BOARD_SIZE = 200;
const SHOWN_SCORES = 20;
const MAX_SCORE = 50000000;
const MAX_SUBMITS_PER_MINUTE = 40;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';    // the admin tools stay off until this is set
// Tiny Turbo has a fastest-race board for every course and speed class. Pine Valley keeps its old names.
for (const course of ['dunes', 'frost', 'neon']) for (const cls of ['50', '100', '150', '200']) BOARDS['racing:' + course + cls] = { lower: true };
const scores = new Map(Object.keys(BOARDS).map(board => [board, []]));   // entries: { deviceId, name, score }
const bannedDevices = new Set();
// Free hosts forget everything when they restart, so a banned device remembers its own ban and reports
// it again (see /perks). Only an unban the owner gives since this server started can lift it.
const unbannedDevices = new Set();
// A ban also covers the username, so coming back under the same name on a new device is caught.
// Shared names (the default and the quick picks) are never banned, or it would catch other players.
const bannedNames = new Set();
const SHARED_NAMES = new Set(['PLAYER', 'YOU', 'SPEEDY FOX', 'WHEELIE KING', 'TURBO TIGER', 'SHADOW RIDER', 'NEON WOLF', 'ROCKET ACE']);
const nameBanned = name => typeof name === 'string' && bannedNames.has(name.trim()) && !SHARED_NAMES.has(name.trim());
function banDevice(deviceId) {
    bannedDevices.add(deviceId);
    unbannedDevices.delete(deviceId);
}
// Devices seen lately, so the owner panel can list players. Kept in memory only, newest last.
const seenDevices = new Map();     // deviceId -> { name, game, at }
const MAX_SEEN = 500;
// Owner-granted extras, by device: { coins: true, speed: 1, 2 or 3 }.
const perks = new Map();

function noteDevice(deviceId, name, game) {
    if (typeof deviceId !== 'string' || !DEVICE_PATTERN.test(deviceId)) return;
    seenDevices.delete(deviceId);
    seenDevices.set(deviceId, { name: name || 'PLAYER', game, at: Date.now() });
    if (seenDevices.size > MAX_SEEN) seenDevices.delete(seenDevices.keys().next().value);
}
const submits = new Map();         // address -> { count, resetAt }

const rooms = new Map();   // code -> { code, game, host, seats: [seat, ...], kicked, log, nextSeq, createdAt }

function newCode() {
    for (;;) {
        let code = '';
        for (const byte of crypto.randomBytes(CODE_LENGTH)) code += CODE_LETTERS[byte % CODE_LETTERS.length];
        if (!rooms.has(code)) return code;
    }
}

function cleanName(name) {
    const clean = typeof name === 'string' ? name.trim() : '';
    return NAME_PATTERN.test(clean) && !isRude(clean) ? clean : 'PLAYER';
}

function newSeat(playerId, socket, request) {
    return { playerId, deviceId: String(request.deviceId || ''), name: cleanName(request.name), socketId: socket.id, lastClientId: 0, droppedAt: 0, away: false, ready: false };
}

// Who's in the room, sent to everyone whenever it changes.
function roster(room) {
    return { host: room.host, seats: room.seats.map(seat => seat && { name: seat.name, away: seat.away || !!seat.droppedAt, ready: seat.ready }) };
}
const sendRoster = room => io.to(room.code).emit('roster', roster(room));

const playerCount = room => room.seats.filter(Boolean).length;

function closeRoom(room) {
    io.to(room.code).socketsLeave(room.code);
    rooms.delete(room.code);
}

// Sends `socket` into a seat and replays what it missed. Returns the reply for the client.
function takeSeat(socket, room, seatNum, lastSeq) {
    socket.join(room.code);
    socket.data.room = room;
    socket.data.seat = seatNum;
    for (const entry of room.log) {
        if (entry.from !== seatNum && entry.seq > lastSeq) socket.emit('game-state-update', { seq: entry.seq, data: entry.data });
    }
    return { ok: true, room: room.code, seat: seatNum, players: playerCount(room), roster: roster(room) };
}

function joinRoom(socket, request) {
    const { game, room: wanted, create, playerId } = request || {};
    if (!ROOM_SIZES[game] || typeof playerId !== 'string' || playerId.length < 8 || playerId.length > 64) {
        return { ok: false, error: 'bad-request' };
    }
    if (request.deviceId && nameBanned(request.name) && !unbannedDevices.has(request.deviceId)) banDevice(request.deviceId);
    if (request.deviceId && bannedDevices.has(request.deviceId)) return { ok: false, error: 'banned' };
    noteDevice(request.deviceId, cleanName(request.name), game);

    if (create) {
        if (rooms.size >= MAX_ROOMS) return { ok: false, error: 'server-full' };
        const seats = Array(ROOM_SIZES[game]).fill(null);
        seats[0] = newSeat(playerId, socket, request);
        const room = { code: newCode(), game, host: 0, seats, kicked: new Set(), log: [], nextSeq: 1, createdAt: Date.now() };
        rooms.set(room.code, room);
        return takeSeat(socket, room, 0, 0);
    }

    const code = String(wanted || '').toUpperCase();
    const room = rooms.get(code);
    if (!room || room.game !== game) return { ok: false, error: 'not-found' };
    if (room.kicked.has(playerId) || (request.deviceId && room.kicked.has(request.deviceId))) return { ok: false, error: 'kicked' };

    // Coming back to a seat they already have?
    const mine = room.seats.findIndex(s => s && s.playerId === playerId);
    if (mine !== -1) {
        const seat = room.seats[mine];
        const old = io.sockets.sockets.get(seat.socketId);
        // A second tab mustn't take the seat from a tab that's still playing.
        if (request.onlyIfDropped && !seat.droppedAt && old && old.id !== socket.id) return { ok: false, error: 'seat-in-use' };
        if (old && old.id !== socket.id) { old.data.room = null; old.disconnect(true); }
        seat.socketId = socket.id;
        seat.droppedAt = 0;
        seat.away = false;
        const reply = takeSeat(socket, room, mine, Number(request.lastSeq) || 0);
        socket.to(room.code).emit('player-joined', { seat: mine, players: playerCount(room), rejoined: true });
        sendRoster(room);
        return reply;
    }

    const free = room.seats.findIndex(s => !s);
    if (free === -1) return { ok: false, error: 'full' };
    room.seats[free] = newSeat(playerId, socket, request);
    // Anyone taking a new seat starts fresh, so skip the messages from before they came.
    const reply = takeSeat(socket, room, free, room.nextSeq);
    socket.to(room.code).emit('player-joined', { seat: free, players: playerCount(room), rejoined: false });
    sendRoster(room);
    return reply;
}

function overRateLimit(socket) {
    const now = Date.now();
    if (now - (socket.data.windowStart || 0) >= 1000) { socket.data.windowStart = now; socket.data.sent = 0; }
    socket.data.sent++;
    return socket.data.sent > MAX_MESSAGES_PER_SECOND;
}

function leaveSeat(room, seatNum) {
    room.seats[seatNum] = null;
    if (playerCount(room) === 0) { closeRoom(room); return; }
    if (room.host === seatNum) room.host = room.seats.findIndex(Boolean);    // the next player takes over
    io.to(room.code).emit('player-left', { seat: seatNum, players: playerCount(room) });
    sendRoster(room);
}

// The host removes a player. Their seat opens right up, and they can't come back to this room.
function kickSeat(room, seatNum) {
    const seat = room.seats[seatNum];
    if (seat.deviceId) room.kicked.add(seat.deviceId);
    room.kicked.add(seat.playerId);
    const target = io.sockets.sockets.get(seat.socketId);
    if (target) {
        target.data.room = null;
        target.leave(room.code);
        target.emit('kicked');
    }
    leaveSeat(room, seatNum);
}

const app = express();
app.disable('x-powered-by');
app.get('/', (req, res) => res.type('text').send('Nebula Arcade lobby server is running.'));
// For testing on real devices over Wi-Fi: SERVE_GAMES=1 hands out the games from this same address.
if (process.env.SERVE_GAMES) app.use(express.static(path.join(__dirname, '..', 'games')));
app.get('/health', (req, res) => {
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(req.headers.origin) ? req.headers.origin : ALLOWED_ORIGINS[0]);
    res.json({ ok: true });
});

function allowSite(req, res) {
    if (!ALLOWED_ORIGINS.includes(req.headers.origin)) return false;
    res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.set('Vary', 'Origin');
    return true;
}

function tooManySubmits(req) {
    const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0];
    const now = Date.now();
    let entry = submits.get(address);
    if (!entry || now > entry.resetAt) {
        if (submits.size > 10000) submits.clear();
        entry = { count: 0, resetAt: now + 60000 };
        submits.set(address, entry);
    }
    return ++entry.count > MAX_SUBMITS_PER_MINUTE;
}

const topScores = board => scores.get(board).slice(0, SHOWN_SCORES).map(({ name, score }) => ({ name, score }));

function sortBoard(board) {
    const lower = BOARDS[board].lower, list = scores.get(board);
    list.sort((a, b) => lower ? a.score - b.score : b.score - a.score);
    list.length = Math.min(list.length, BOARD_SIZE);
}

app.options('/scores', (req, res) => {
    if (!allowSite(req, res)) return res.sendStatus(403);
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
});

// Each page asks about its own device now and then: its extras, and whether it's banned.
// ?banned=1 means the device remembers being banned, so the ban goes back on unless it was lifted.
app.get('/perks/:deviceId', (req, res) => {
    allowSite(req, res);
    const id = req.params.deviceId;
    // Pages report the username too, so the owner's player list and name bans see everyone, not just online players.
    if (typeof req.query.name === 'string' && NAME_PATTERN.test(req.query.name.trim())) noteDevice(id, cleanName(req.query.name), seenDevices.has(id) ? seenDevices.get(id).game : 'arcade');
    if ((req.query.banned === '1' || nameBanned(req.query.name)) && DEVICE_PATTERN.test(id) && !unbannedDevices.has(id)) banDevice(id);
    res.json({ ...(perks.get(id) || { coins: false, speed: 1 }), banned: bannedDevices.has(id), unbanned: unbannedDevices.has(id) });
});

app.get('/scores/:game/:category', (req, res) => {
    allowSite(req, res);
    const board = req.params.game + ':' + req.params.category;
    if (!scores.has(board)) return res.sendStatus(404);
    res.json({ scores: topScores(board) });
});

app.post('/scores', express.json({ limit: '1kb' }), (req, res) => {
    if (!allowSite(req, res)) return res.sendStatus(403);
    if (tooManySubmits(req)) return res.sendStatus(429);
    const { board, name, score, deviceId } = req.body || {};
    if (!scores.has(board) || typeof name !== 'string' || !NAME_PATTERN.test(name) || !name.trim() ||
        typeof deviceId !== 'string' || !DEVICE_PATTERN.test(deviceId) ||
        !Number.isInteger(score) || score < 1 || score > MAX_SCORE) return res.sendStatus(400);
    if (nameBanned(name) && !unbannedDevices.has(deviceId)) banDevice(deviceId);
    if (bannedDevices.has(deviceId)) return res.sendStatus(403);
    const clean = name.trim();
    if (isRude(clean)) return res.sendStatus(422);
    noteDevice(deviceId, clean, board.split(':')[0]);

    // One line per device, keeping its best. The newest name replaces the old one.
    const list = scores.get(board), lower = BOARDS[board].lower, mine = list.find(entry => entry.deviceId === deviceId);
    if (!mine) list.push({ deviceId, name: clean, score });
    else {
        mine.name = clean;
        if (lower ? score < mine.score : score > mine.score) mine.score = score;
    }
    sortBoard(board);
    res.json({ scores: topScores(board), rank: list.findIndex(entry => entry.deviceId === deviceId) + 1 });
});

// ---------- Owner tools ----------

function isOwner(req) {
    if (!ADMIN_PASSWORD) return false;
    const given = crypto.createHash('sha256').update(String(req.headers['x-admin-password'] || '')).digest();
    return crypto.timingSafeEqual(given, crypto.createHash('sha256').update(ADMIN_PASSWORD).digest());
}

app.options('/admin/:action', (req, res) => {
    if (!allowSite(req, res)) return res.sendStatus(403);
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
    res.sendStatus(204);
});

const adminView = () => ({
    boards: Object.fromEntries([...scores].map(([board, list]) => [board, list])),
    banned: [...bannedDevices],
    players: [...seenDevices].reverse().map(([deviceId, seen]) => ({ deviceId, ...seen, perks: perks.get(deviceId) || { coins: false, speed: 1 }, banned: bannedDevices.has(deviceId) }))
});

// Removes a banned device from any room it's in, right away.
function kickDevice(deviceId) {
    for (const room of rooms.values()) {
        room.seats.forEach((seat, n) => {
            if (!seat || seat.deviceId !== deviceId) return;
            const target = io.sockets.sockets.get(seat.socketId);
            if (target) target.emit('banned');
            kickSeat(room, n);
        });
    }
}

app.get('/admin/view', (req, res) => {
    if (!allowSite(req, res)) return res.sendStatus(403);
    if (tooManySubmits(req)) return res.sendStatus(429);
    if (!isOwner(req)) return res.sendStatus(401);
    res.json(adminView());
});

app.post('/admin/:action', express.json({ limit: '1kb' }), (req, res) => {
    if (!allowSite(req, res)) return res.sendStatus(403);
    if (tooManySubmits(req)) return res.sendStatus(429);
    if (!isOwner(req)) return res.sendStatus(401);
    const { deviceId, board, name, coins, speed } = req.body || {};
    if (typeof deviceId !== 'string' || !DEVICE_PATTERN.test(deviceId)) return res.sendStatus(400);
    const wipe = list => { for (let i = list.length - 1; i >= 0; i--) if (list[i].deviceId === deviceId) list.splice(i, 1); };

    if (req.params.action === 'rename') {
        if (typeof name !== 'string' || !NAME_PATTERN.test(name) || !name.trim()) return res.sendStatus(400);
        for (const list of scores.values()) for (const entry of list) if (entry.deviceId === deviceId) entry.name = name.trim();
    }
    else if (req.params.action === 'wipe') {
        if (!scores.has(board)) return res.sendStatus(400);
        wipe(scores.get(board));
    }
    else if (req.params.action === 'ban') {
        banDevice(deviceId);
        const seen = seenDevices.get(deviceId);
        if (seen && !SHARED_NAMES.has(seen.name)) bannedNames.add(seen.name);
        for (const list of scores.values()) wipe(list);
        kickDevice(deviceId);
    }
    else if (req.params.action === 'perk') {
        if (typeof coins !== 'boolean' || ![1, 2, 3].includes(speed)) return res.sendStatus(400);
        if (!coins && speed === 1) perks.delete(deviceId);
        else perks.set(deviceId, { coins, speed });
    }
    else if (req.params.action === 'unban') {
        bannedDevices.delete(deviceId);
        unbannedDevices.add(deviceId);
        const seen = seenDevices.get(deviceId);
        if (seen) bannedNames.delete(seen.name);
    }
    else return res.sendStatus(404);
    res.json(adminView());
});

const server = http.createServer(app);
const io = new Server(server, {
    transports: TRANSPORTS,
    cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
    // CORS alone doesn't stop other sites opening a WebSocket, so check the origin here too.
    allowRequest: (req, callback) => callback(null, ALLOWED_ORIGINS.includes(req.headers.origin)),
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    pingInterval: 10000,      // notices a dead connection quickly, and keeps quiet ones open
    pingTimeout: 10000
});

io.on('connection', socket => {
    socket.on('join-room', (request, reply) => {
        if (typeof reply !== 'function') return;
        if (socket.data.room) { reply({ ok: false, error: 'already-in-room' }); return; }
        reply(joinRoom(socket, request));
    });

    // { id, data, volatile }. Volatile updates (like live aiming) aren't worth replaying later.
    socket.on('game-state-update', (update, reply) => {
        const ack = typeof reply === 'function' ? reply : () => {};
        const room = socket.data.room;
        if (!room || !update || overRateLimit(socket)) { ack({ ok: false }); return; }
        const seatNum = socket.data.seat;

        if (update.volatile) {
            socket.to(room.code).volatile.emit('game-state-update', { data: update.data });
            return;
        }

        // A client resends if it never heard back, so skip anything already seen.
        const seat = room.seats[seatNum];
        if (!Number.isInteger(update.id) || update.id <= seat.lastClientId) { ack({ ok: true }); return; }
        seat.lastClientId = update.id;

        const entry = { seq: room.nextSeq++, from: seatNum, data: update.data };
        room.log.push(entry);
        if (room.log.length > LOG_LENGTH) room.log.shift();
        socket.to(room.code).emit('game-state-update', { seq: entry.seq, data: entry.data });
        ack({ ok: true });
    });

    // Only the host can do this, and not to themselves.
    socket.on('kick-player', (seatNum, reply) => {
        const ack = typeof reply === 'function' ? reply : () => {};
        const room = socket.data.room;
        if (!room || socket.data.seat !== room.host || seatNum === room.host || !room.seats[seatNum]) { ack({ ok: false }); return; }
        kickSeat(room, seatNum);
        ack({ ok: true });
    });

    socket.on('set-ready', ready => {
        const room = socket.data.room;
        const seat = room && room.seats[socket.data.seat];
        if (!seat) return;
        seat.ready = !!ready;
        sendRoster(room);
    });

    // The host starts a game, so everyone has to ready up again for the next one.
    socket.on('clear-ready', () => {
        const room = socket.data.room;
        if (!room || socket.data.seat !== room.host) return;
        room.seats.forEach(seat => { if (seat) seat.ready = false; });
        sendRoster(room);
    });

    // Switching tabs or hiding the app. The seat stays, and the others wait.
    socket.on('player-status', away => {
        const room = socket.data.room;
        const seat = room && room.seats[socket.data.seat];
        if (!seat || seat.away === !!away) return;
        seat.away = !!away;
        seat.awayAt = Date.now();
        socket.to(room.code).emit(away ? 'player-away' : 'player-joined', { seat: socket.data.seat, players: playerCount(room), rejoined: true });
        sendRoster(room);
    });

    socket.on('leave-room', () => {
        const room = socket.data.room;
        if (!room) return;
        socket.data.room = null;
        socket.leave(room.code);
        leaveSeat(room, socket.data.seat);
    });

    // A dropped player keeps their seat for a while, so they can reconnect.
    socket.on('disconnect', () => {
        const room = socket.data.room;
        if (!room) return;
        const seat = room.seats[socket.data.seat];
        if (!seat || seat.socketId !== socket.id) return;
        seat.droppedAt = Date.now();
        socket.to(room.code).emit('player-away', { seat: socket.data.seat });
        sendRoster(room);
    });
});

setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
        room.seats.forEach((seat, seatNum) => {
            if (seat && seat.droppedAt && now - seat.droppedAt > graceFor(room)) leaveSeat(room, seatNum);
            // Nobody should be stuck waiting forever for a hidden tab, so the game carries on after this.
            else if (seat && seat.away && now - seat.awayAt > graceFor(room)) {
                seat.away = false;
                sendRoster(room);
            }
        });
        if (rooms.has(room.code) && playerCount(room) === 1 && room.log.length === 0 && now - room.createdAt > WAITING_ROOM_MS) closeRoom(room);
    }
}, CLEANUP_MS);

server.listen(PORT, () => console.log('Lobby server listening on port ' + PORT + ', allowing ' + ALLOWED_ORIGINS.join(', ')));
