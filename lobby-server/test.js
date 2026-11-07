"use strict";

// Tests for the lobby server: `npm test`. Starts its own copy on a spare port.

const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3456, ORIGIN = 'https://mathhw1.github.io';
const url = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('node', ['index.js'], { env: { ...process.env, PORT, RECONNECT_GRACE_MS: 1500 }, stdio: ['ignore', 'pipe', 'inherit'] });

function connect(options) {
    const socket = io(url, { extraHeaders: { origin: ORIGIN }, forceNew: true, reconnection: false, ...options });
    socket.inbox = [];
    socket.on('game-state-update', u => socket.inbox.push(u));
    for (const event of ['player-joined', 'player-away', 'player-left']) socket.on(event, e => { socket.last = { event, ...e }; });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}
const join = (socket, request) => new Promise(r => socket.emit('join-room', { game: 'chess', ...request }, r));
const send = (socket, update) => new Promise(r => socket.emit('game-state-update', update, r));

const tests = {
    async 'rejects other websites'() {
        await assert.rejects(connect({ extraHeaders: { origin: 'https://evil.example' } }));
    },
    async 'creates a room and a friend joins it'() {
        const a = await connect(), b = await connect();
        const made = await join(a, { create: true, playerId: 'player-a-1' });
        assert.ok(made.ok && made.seat === 0 && /^[A-Z2-9]{5}$/.test(made.room));
        const joined = await join(b, { room: made.room.toLowerCase(), playerId: 'player-b-1' });
        assert.ok(joined.ok && joined.seat === 1 && joined.players === 2);
        await sleep(50);
        assert.strictEqual(a.last.event, 'player-joined');
        a.close(); b.close();
    },
    async 'turns away a wrong code, a third player and the wrong game'() {
        const a = await connect(), b = await connect(), c = await connect();
        assert.strictEqual((await join(c, { room: 'ZZZZZ', playerId: 'player-c-2' })).error, 'not-found');
        const { room } = await join(a, { create: true, playerId: 'player-a-2' });
        assert.strictEqual((await join(c, { game: 'pool', room, playerId: 'player-c-2' })).error, 'not-found');
        await join(b, { room, playerId: 'player-b-2' });
        assert.strictEqual((await join(c, { room, playerId: 'player-c-2' })).error, 'full');
        a.close(); b.close(); c.close();
    },
    async 'passes messages to the other player only and ignores repeats'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { create: true, playerId: 'player-a-3' });
        await join(b, { room, playerId: 'player-b-3' });
        await send(a, { id: 1, data: { t: 'move' } });
        await send(a, { id: 1, data: { t: 'move' } });
        await send(a, { id: 2, data: { t: 'second' } });
        await sleep(50);
        assert.deepStrictEqual(b.inbox.map(u => u.data.t), ['move', 'second']);
        assert.strictEqual(a.inbox.length, 0);
        a.close(); b.close();
    },
    async 'a dropped player gets their seat back and catches up'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { create: true, playerId: 'player-a-4' });
        await join(b, { room, playerId: 'player-b-4' });
        await send(a, { id: 1, data: { n: 1 } });
        await sleep(50);
        const lastSeq = b.inbox[0].seq;
        b.disconnect();
        await sleep(100);
        assert.strictEqual(a.last.event, 'player-away');
        await send(a, { id: 2, data: { n: 2 } });

        const back = await connect();
        const reply = await join(back, { room, playerId: 'player-b-4', lastSeq });
        assert.ok(reply.ok && reply.seat === 1);
        await sleep(50);
        assert.deepStrictEqual(back.inbox.map(u => u.data.n), [2]);
        assert.ok(a.last.rejoined);
        a.close(); back.close();
    },
    async 'someone else can’t take a dropped player’s seat, but it opens after the grace time'() {
        const a = await connect(), b = await connect(), c = await connect();
        const { room } = await join(a, { create: true, playerId: 'player-a-5' });
        await join(b, { room, playerId: 'player-b-5' });
        b.disconnect();
        await sleep(100);
        assert.strictEqual((await join(c, { room, playerId: 'player-c-5' })).error, 'full');
        await sleep(2600);
        assert.strictEqual(a.last.event, 'player-left');
        assert.ok((await join(c, { room, playerId: 'player-c-5' })).ok);
        a.close(); c.close();
    },
    async 'leaving tells the other player straight away and empty rooms close'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { create: true, playerId: 'player-a-6' });
        await join(b, { room, playerId: 'player-b-6' });
        b.emit('leave-room');
        await sleep(50);
        assert.strictEqual(a.last.event, 'player-left');
        a.emit('leave-room');
        await sleep(50);
        assert.strictEqual((await join(b, { room, playerId: 'player-b-6' })).error, 'not-found');
        a.close(); b.close();
    },
    async 'lets a wheelie race join a room'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { game: 'wheelie', create: true, playerId: 'player-a-8' });
        assert.strictEqual((await join(b, { game: 'chess', room, playerId: 'player-b-8' })).error, 'not-found');
        assert.ok((await join(b, { game: 'wheelie', room, playerId: 'player-b-8' })).ok);
        a.close(); b.close();
    },
    async 'keeps the best score per name in order and rejects bad ones'() {
        const post = (body, origin = ORIGIN) => fetch(url + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) });
        assert.strictEqual((await post({ game: 'wheelie', name: 'SAM', score: 100 })).status, 200);
        assert.strictEqual((await post({ game: 'wheelie', name: 'AL', score: 300 })).status, 200);
        const lower = await (await post({ game: 'wheelie', name: 'SAM', score: 50 })).json();
        assert.deepStrictEqual(lower.scores, [{ name: 'AL', score: 300 }, { name: 'SAM', score: 100 }]);
        assert.strictEqual(lower.rank, 2);
        for (const bad of [{ game: 'wheelie', name: '<b>x', score: 5 }, { game: 'wheelie', name: 'OK', score: 1.5 }, { game: 'wheelie', name: 'OK', score: 999999999 }, { game: 'nope', name: 'OK', score: 5 }, { game: 'wheelie', name: '   ', score: 5 }]) {
            assert.strictEqual((await post(bad)).status, 400);
        }
        assert.strictEqual((await post({ game: 'wheelie', name: 'BAD', score: 5 }, 'https://evil.example')).status, 403);
        const read = await fetch(url + '/scores/wheelie', { headers: { origin: ORIGIN } });
        assert.strictEqual(read.headers.get('access-control-allow-origin'), ORIGIN);
        assert.strictEqual((await read.json()).scores.length, 2);
    },
    async 'works over plain HTTPS requests, without WebSockets'() {
        const a = await connect({ transports: ['polling'] });
        assert.ok((await join(a, { create: true, playerId: 'player-a-7' })).ok);
        a.close();
    }
};

(async () => {
    await new Promise(resolve => server.stdout.once('data', resolve));
    let failed = 0;
    for (const [name, test] of Object.entries(tests)) {
        try { await test(); console.log('ok    ' + name); }
        catch (error) { failed++; console.log('FAIL  ' + name + '\n      ' + error.message); }
    }
    server.kill();
    process.exit(failed ? 1 : 0);
})();
