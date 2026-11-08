"use strict";

// Tests for the lobby server: `npm test`. Starts its own copy on a spare port.

const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3456, ORIGIN = 'https://mathhw1.github.io';
const url = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('node', ['index.js'], { env: { ...process.env, PORT, RECONNECT_GRACE_MS: 1500, ADMIN_PASSWORD: 'test-owner-pass' }, stdio: ['ignore', 'pipe', 'inherit'] });

function connect(options) {
    const socket = io(url, { extraHeaders: { origin: ORIGIN }, forceNew: true, reconnection: false, ...options });
    socket.inbox = [];
    socket.on('game-state-update', u => socket.inbox.push(u));
    for (const event of ['player-joined', 'player-away', 'player-left', 'kicked']) socket.on(event, e => { socket.last = { event, ...e }; });
    socket.on('roster', r => { socket.roster = r; });
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
    async 'fits four in a race but two in chess, and hands over the host'() {
        const players = await Promise.all([1, 2, 3, 4, 5].map(() => connect()));
        const [a, b, c, d, e] = players;
        const { room } = await join(a, { game: 'wheelie', create: true, playerId: 'player-a-9', name: 'ANNA' });
        await join(b, { game: 'wheelie', room, playerId: 'player-b-9', name: 'BEN' });
        await join(c, { game: 'wheelie', room, playerId: 'player-c-9', name: 'BAD NAME!!' });
        assert.strictEqual((await join(d, { game: 'wheelie', room, playerId: 'player-d-9', name: 'F4CK' })).seat, 3);
        assert.strictEqual((await join(e, { game: 'wheelie', room, playerId: 'player-e-9' })).error, 'full');
        await sleep(50);
        assert.deepStrictEqual(a.roster.seats.map(s => s.name), ['ANNA', 'BEN', 'PLAYER', 'PLAYER']);
        a.emit('leave-room');
        await sleep(50);
        assert.strictEqual(b.roster.host, 1);
        players.forEach(p => p.close());
    },
    async 'lets only the host kick, opens the seat and keeps them out'() {
        const a = await connect(), b = await connect(), c = await connect();
        const { room } = await join(a, { game: 'pool', create: true, playerId: 'player-a-10', deviceId: 'device-a-10' });
        await join(b, { game: 'pool', room, playerId: 'player-b-10', deviceId: 'device-b-10' });
        const kick = (s, seat) => new Promise(r => s.emit('kick-player', seat, r));
        assert.strictEqual((await kick(b, 0)).ok, false);
        assert.strictEqual((await kick(a, 1)).ok, true);
        await sleep(50);
        assert.strictEqual(b.last.event, 'kicked');
        assert.strictEqual(a.roster.seats[1], null);
        assert.strictEqual((await join(c, { game: 'pool', room, playerId: 'player-b-11', deviceId: 'device-b-10' })).error, 'kicked');
        assert.strictEqual((await join(c, { game: 'pool', room, playerId: 'player-c-10' })).seat, 1);
        a.close(); b.close(); c.close();
    },
    async 'tells the others when someone hides the game'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { create: true, playerId: 'player-a-12' });
        await join(b, { room, playerId: 'player-b-12' });
        b.emit('player-status', true);
        await sleep(50);
        assert.strictEqual(a.last.event, 'player-away');
        assert.strictEqual(a.roster.seats[1].away, true);
        b.emit('player-status', false);
        await sleep(50);
        assert.ok(a.last.rejoined && !a.roster.seats[1].away);
        a.close(); b.close();
    },
    async 'lets a new tab back into a dropped seat but not one still in use'() {
        const a = await connect(), b = await connect(), c = await connect();
        const { room } = await join(a, { game: 'wheelie', create: true, playerId: 'player-a-13' });
        await join(b, { game: 'wheelie', room, playerId: 'player-b-13' });
        assert.strictEqual((await join(c, { game: 'wheelie', room, playerId: 'player-a-13', onlyIfDropped: true })).error, 'seat-in-use');
        a.close();
        await sleep(100);
        const back = await join(c, { game: 'wheelie', room, playerId: 'player-a-13', onlyIfDropped: true });
        assert.ok(back.ok && back.seat === 0);
        b.close(); c.close();
    },
    async 'tracks who is ready and lets only the host clear it'() {
        const a = await connect(), b = await connect();
        const { room } = await join(a, { game: 'racing', create: true, playerId: 'player-a-14' });
        await join(b, { game: 'racing', room, playerId: 'player-b-14' });
        await sleep(50);
        assert.deepStrictEqual(a.roster.seats.slice(0, 2).map(s => s.ready), [false, false]);
        a.emit('set-ready', true);
        b.emit('set-ready', true);
        await sleep(50);
        assert.deepStrictEqual(a.roster.seats.slice(0, 2).map(s => s.ready), [true, true]);
        b.emit('clear-ready');
        await sleep(50);
        assert.strictEqual(a.roster.seats[1].ready, true);
        a.emit('clear-ready');
        await sleep(50);
        assert.deepStrictEqual(b.roster.seats.slice(0, 2).map(s => s.ready), [false, false]);
        a.close(); b.close();
    },
    async 'bans kick a device out of its room and keep it out, and perks follow the device'() {
        const a = await connect(), b = await connect(), c = await connect();
        const deviceId = 'device-banned-15';
        const { room } = await join(a, { game: 'racing', create: true, playerId: 'player-a-15', deviceId: 'device-host-15' });
        await join(b, { game: 'racing', room, playerId: 'player-b-15', deviceId, name: 'TROUBLE' });
        const call = (path, body) => fetch(url + '/admin/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'x-admin-password': 'test-owner-pass' }, body: body && JSON.stringify(body) });
        const seen = await (await call('view')).json();
        assert.ok(seen.players.some(p => p.deviceId === deviceId && p.name === 'TROUBLE'));
        await call('perk', { deviceId, coins: true, speed: 3 });
        assert.deepStrictEqual(await (await fetch(url + '/perks/' + deviceId, { headers: { origin: ORIGIN } })).json(), { coins: true, speed: 3, banned: false, unbanned: false });
        assert.strictEqual((await call('perk', { deviceId, coins: true, speed: 9 })).status, 400);
        await call('ban', { deviceId });
        await sleep(50);
        assert.strictEqual(b.last.event, 'kicked');
        assert.strictEqual(a.roster.seats[1], null);
        assert.strictEqual((await join(c, { game: 'racing', room, playerId: 'player-c-15', deviceId })).error, 'banned');
        assert.strictEqual((await (await fetch(url + '/perks/' + deviceId, { headers: { origin: ORIGIN } })).json()).banned, true);
        await call('unban', { deviceId });
        // After an unban, the device's own memory of the ban can't put it back.
        assert.strictEqual((await (await fetch(url + '/perks/' + deviceId + '?banned=1', { headers: { origin: ORIGIN } })).json()).banned, false);
        // The banned player's username is banned too: a brand-new device using it gets caught.
        await call('ban', { deviceId });
        assert.strictEqual((await join(c, { game: 'racing', room, playerId: 'player-c-17', deviceId: 'device-new-17', name: 'TROUBLE' })).error, 'banned');
        assert.strictEqual((await (await fetch(url + '/perks/device-new-18?name=TROUBLE', { headers: { origin: ORIGIN } })).json()).banned, true);
        // A shared name like PLAYER is never banned.
        assert.strictEqual((await (await fetch(url + '/perks/device-new-19?name=PLAYER', { headers: { origin: ORIGIN } })).json()).banned, false);
        await call('unban', { deviceId });
        assert.strictEqual((await (await fetch(url + '/perks/device-new-20?name=TROUBLE', { headers: { origin: ORIGIN } })).json()).banned, false);
        // But a device the server has never heard of (as after a restart) is banned again when it reports it.
        const forgotten = 'device-forgotten-15';
        const back = await (await fetch(url + '/perks/' + forgotten + '?banned=1', { headers: { origin: ORIGIN } })).json();
        assert.strictEqual(back.banned, true);
        assert.strictEqual((await join(c, { game: 'racing', room, playerId: 'player-c-16', deviceId: forgotten })).error, 'banned');
        a.close(); b.close(); c.close();
    },
    async 'stops rude names getting through disguises and leaves normal ones'() {
        const { isRude } = require('./name-filter');
        for (const rude of ['FUCK', 'F U C K', 'FUUUCK', 'SH1T', 'B1TCH', 'N1GGER', 'N1GG3R', 'NIGGA', 'NAGGOR', 'F@G', 'A55', 'H1TL3R']) assert.ok(isRude(rude), rude);
        for (const fine of ['WHEELIE KING', 'SPEEDY FOX', 'PHOENIX', 'RACCOON', 'GRAPE', 'ESSEX', 'PEACOCK', 'NIGEL', 'KNIGHT', 'SAM', 'GINGER', 'TIGER']) assert.ok(!isRude(fine), fine);
    },
    async 'keeps the best per device, and fastest times count lowest first'() {
        const post = (body, origin = ORIGIN) => fetch(url + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) });
        const board = 'wheelie:score', one = 'device-one-1', two = 'device-two-2';
        assert.strictEqual((await post({ board, name: 'SAM', score: 100, deviceId: one })).status, 200);
        assert.strictEqual((await post({ board, name: 'AL', score: 300, deviceId: two })).status, 200);
        const lower = await (await post({ board, name: 'SAMMY', score: 50, deviceId: one })).json();
        assert.deepStrictEqual(lower.scores, [{ name: 'AL', score: 300 }, { name: 'SAMMY', score: 100 }]);
        assert.strictEqual(lower.rank, 2);
        for (const bad of [{ board, name: '<b>x', score: 5, deviceId: one }, { board, name: 'OK', score: 1.5, deviceId: one }, { board, name: 'OK', score: 999999999, deviceId: one }, { board: 'nope', name: 'OK', score: 5, deviceId: one }, { board, name: '   ', score: 5, deviceId: one }, { board, name: 'OK', score: 5 }]) {
            assert.strictEqual((await post(bad)).status, 400);
        }
        assert.strictEqual((await post({ board, name: 'SH1T', score: 5, deviceId: 'device-three' })).status, 422);
        assert.strictEqual((await post({ board, name: 'BAD', score: 5, deviceId: one }, 'https://evil.example')).status, 403);
        const read = await fetch(url + '/scores/wheelie/score', { headers: { origin: ORIGIN } });
        assert.strictEqual(read.headers.get('access-control-allow-origin'), ORIGIN);
        assert.strictEqual((await read.json()).scores.length, 2);
        await post({ board: 'wheelie:time', name: 'SAM', score: 9000, deviceId: one });
        await post({ board: 'wheelie:time', name: 'AL', score: 7000, deviceId: two });
        const times = await (await post({ board: 'wheelie:time', name: 'SAM', score: 8000, deviceId: one })).json();
        assert.deepStrictEqual(times.scores.map(s => s.score), [7000, 8000]);
    },
    async 'keeps owner tools behind the password'() {
        const call = (path, body, password) => fetch(url + '/admin/' + path, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'x-admin-password': password || '' },
            body: body && JSON.stringify(body)
        });
        const pass = 'test-owner-pass', deviceId = 'device-owner-test';
        const post = body => fetch(url + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) });
        await post({ board: 'pool:wins', name: 'RUDE ONE', score: 9, deviceId });
        assert.strictEqual((await call('view')).status, 401);
        assert.strictEqual((await call('ban', { deviceId }, 'wrong')).status, 401);
        const seen = await (await call('view', null, pass)).json();
        assert.strictEqual(seen.boards['pool:wins'].find(e => e.deviceId === deviceId).name, 'RUDE ONE');
        const renamed = await (await call('rename', { deviceId, name: 'FIXED' }, pass)).json();
        assert.strictEqual(renamed.boards['pool:wins'].find(e => e.deviceId === deviceId).name, 'FIXED');
        const banned = await (await call('ban', { deviceId }, pass)).json();
        assert.ok(banned.banned.includes(deviceId) && !banned.boards['pool:wins'].some(e => e.deviceId === deviceId));
        assert.strictEqual((await post({ board: 'pool:wins', name: 'AGAIN', score: 9, deviceId })).status, 403);
        await call('unban', { deviceId }, pass);
        assert.strictEqual((await post({ board: 'pool:wins', name: 'AGAIN', score: 9, deviceId })).status, 200);
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
