"use strict";

// Nebula Arcade lobby server. Two players share a 5-letter room code, and everything one
// sends is passed to the other. Hosts like Render handle HTTPS, so players connect
// to wss://…:443 while this app just listens on the PORT the host gives it.

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mathhw1.github.io').split(',').map(s => s.trim());
// Set TRANSPORTS=polling to test how clients cope on a network that blocks WebSockets.
const TRANSPORTS = (process.env.TRANSPORTS || 'websocket,polling').split(',');

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L, so codes are easy to read out
const CODE_LENGTH = 5;
const SEATS = 2;
const GAMES = ['pool', 'chess'];
const MAX_ROOMS = 5000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_SECOND = 40;
const LOG_LENGTH = 1000;                       // messages kept per room, for players catching up
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 120000;   // how long a dropped player keeps their seat
const WAITING_ROOM_MS = 30 * 60000;            // a lobby nobody joined closes after this
const CLEANUP_MS = Math.min(5000, RECONNECT_GRACE_MS / 2);

const rooms = new Map();   // code -> { code, game, seats: [seat, seat], log, nextSeq, createdAt }

function newCode() {
    for (;;) {
        let code = '';
        for (const byte of crypto.randomBytes(CODE_LENGTH)) code += CODE_LETTERS[byte % CODE_LETTERS.length];
        if (!rooms.has(code)) return code;
    }
}

function newSeat(playerId, socket) {
    return { playerId, socketId: socket.id, lastClientId: 0, droppedAt: 0 };
}

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
    return { ok: true, room: room.code, seat: seatNum, players: playerCount(room) };
}

function joinRoom(socket, request) {
    const { game, room: wanted, create, playerId } = request || {};
    if (!GAMES.includes(game) || typeof playerId !== 'string' || playerId.length < 8 || playerId.length > 64) {
        return { ok: false, error: 'bad-request' };
    }

    if (create) {
        if (rooms.size >= MAX_ROOMS) return { ok: false, error: 'server-full' };
        const room = { code: newCode(), game, seats: [newSeat(playerId, socket), null], log: [], nextSeq: 1, createdAt: Date.now() };
        rooms.set(room.code, room);
        return takeSeat(socket, room, 0, 0);
    }

    const code = String(wanted || '').toUpperCase();
    const room = rooms.get(code);
    if (!room || room.game !== game) return { ok: false, error: 'not-found' };

    // Coming back to a seat they already have?
    const mine = room.seats.findIndex(s => s && s.playerId === playerId);
    if (mine !== -1) {
        const seat = room.seats[mine];
        const old = io.sockets.sockets.get(seat.socketId);
        if (old && old.id !== socket.id) { old.data.room = null; old.disconnect(true); }
        seat.socketId = socket.id;
        seat.droppedAt = 0;
        const reply = takeSeat(socket, room, mine, Number(request.lastSeq) || 0);
        socket.to(room.code).emit('player-joined', { seat: mine, players: playerCount(room), rejoined: true });
        return reply;
    }

    const free = room.seats.findIndex(s => !s);
    if (free === -1) return { ok: false, error: 'full' };
    room.seats[free] = newSeat(playerId, socket);
    const reply = takeSeat(socket, room, free, 0);
    socket.to(room.code).emit('player-joined', { seat: free, players: playerCount(room), rejoined: false });
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
    io.to(room.code).emit('player-left', { seat: seatNum, players: playerCount(room) });
}

const app = express();
app.disable('x-powered-by');
app.get('/', (req, res) => res.type('text').send('Nebula Arcade lobby server is running.'));
app.get('/health', (req, res) => {
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(req.headers.origin) ? req.headers.origin : ALLOWED_ORIGINS[0]);
    res.json({ ok: true });
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
    });
});

setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
        room.seats.forEach((seat, seatNum) => {
            if (seat && seat.droppedAt && now - seat.droppedAt > RECONNECT_GRACE_MS) leaveSeat(room, seatNum);
        });
        if (rooms.has(room.code) && playerCount(room) === 1 && room.log.length === 0 && now - room.createdAt > WAITING_ROOM_MS) closeRoom(room);
    }
}, CLEANUP_MS);

server.listen(PORT, () => console.log('Lobby server listening on port ' + PORT + ', allowing ' + ALLOWED_ORIGINS.join(', ')));
