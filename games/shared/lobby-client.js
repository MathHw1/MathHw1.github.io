"use strict";

// Online lobby for Nebula Arcade games, talking to lobby-server/ over Socket.io.
// Needs socket.io.min.js loaded first. Used by Classic Pool and Chess.
//
//   const lobby = new NebulaLobby('chess', {
//       onWaiting(code)       the lobby exists; show the code to share
//       onStart(seat)         both players are in (seat 0 = host, 1 = guest)
//       onMessage(data)       the other player sent something
//       onStatus(text)        connection news to show ('' clears it)
//       onOpponentAway()      the other player's connection dropped (they may come back)
//       onOpponentBack()
//       onOpponentLeft()      they've gone for good
//       onError(text)         couldn't create or join, or the game is lost
//   });
//   lobby.create();  lobby.join('ABCDE');  lobby.send({...});  lobby.leave();

// The address of the deployed lobby server. Testing on this computer uses a local one.
const LOBBY_SERVER_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://localhost:3000'
    : 'https://nebula-lobby-server.onrender.com';

const SLOW_START_NOTICE_MS = 4000;    // free hosts sleep when idle, so the first connection can be slow
const CONNECT_TIMEOUT_MS = 75000;
const ATTEMPT_TIMEOUT_MS = 8000;      // how long one connection attempt can take before trying again
const LOBBY_ERRORS = {
    'not-found': code => 'No lobby with code ' + code + '. Check the code and try again.',
    'full': () => 'That lobby is already full.',
    'server-full': () => 'The lobby server is full right now. Try again soon.'
};

class NebulaLobby {
    constructor(game, handlers) {
        this.game = game;
        this.on = handlers;
        this.socket = null;
        this.reset();
    }

    reset() {
        this.code = '';
        this.seat = null;
        this.playerId = '';
        this.lastSeq = 0;         // newest message seen from the other player
        this.nextId = 1;
        this.unconfirmed = [];    // sent, but the server hasn't confirmed them yet
        this.started = false;
        this.joined = false;
        clearTimeout(this.slowTimer);
        clearTimeout(this.giveUpTimer);
    }

    get connected() { return this.joined && !!this.socket && this.socket.connected; }

    // Wakes a sleeping server early, so Create and Join feel quicker. Failure doesn't matter here.
    static warmUp() { fetch(LOBBY_SERVER_URL + '/health').catch(() => {}); }

    create() { this.open({ create: true }); }

    join(rawCode) {
        const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 5) { this.on.onError('That code should be 5 letters or numbers.'); return; }
        this.open({ room: code });
    }

    open(target) {
        if (typeof io === 'undefined') { this.on.onError('Online play couldn’t load. Check your internet and refresh.'); return; }
        this.leave();
        this.target = target;
        this.playerId = crypto.randomUUID();
        this.on.onStatus(target.create ? 'Creating lobby…' : 'Joining lobby ' + target.room + '…');

        this.slowTimer = setTimeout(() => this.on.onStatus('Waking up the game server. This can take up to a minute…'), SLOW_START_NOTICE_MS);
        this.giveUpTimer = setTimeout(() => {
            this.leave();
            this.on.onError('Couldn’t reach the game server. Check your internet and try again. If it keeps failing, this network may be blocking it.');
        }, CONNECT_TIMEOUT_MS);

        // Tries WebSockets first, then plain HTTPS requests if a network blocks them.
        const socket = this.socket = io(LOBBY_SERVER_URL, {
            transports: ['websocket', 'polling'],
            tryAllTransports: true,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 4000,
            reconnectionAttempts: Infinity,
            timeout: ATTEMPT_TIMEOUT_MS
        });
        // Some firewalls silently ignore WebSockets instead of refusing them, which would
        // hang every attempt. So after a failed try, start with plain HTTPS requests.
        socket.io.on('reconnect_attempt', () => { socket.io.opts.transports = ['polling', 'websocket']; });
        socket.on('connect', () => this.enterRoom());
        socket.on('disconnect', reason => {
            if (this.started && reason !== 'io client disconnect') this.on.onStatus('Connection lost. Reconnecting…');
        });
        socket.on('player-joined', info => this.onPlayerJoined(info));
        socket.on('player-away', () => this.on.onOpponentAway());
        socket.on('player-left', () => this.on.onOpponentLeft());
        socket.on('game-state-update', update => {
            // Numbered updates can arrive twice around a reconnect. Live ones have no number.
            if (update.seq) {
                if (update.seq <= this.lastSeq) return;
                this.lastSeq = update.seq;
            }
            this.on.onMessage(update.data);
        });
    }

    // Runs on the first connection and after every reconnect.
    enterRoom() {
        const returning = this.seat !== null;
        const request = returning
            ? { game: this.game, room: this.code, playerId: this.playerId, lastSeq: this.lastSeq }
            : { game: this.game, playerId: this.playerId, ...this.target };

        this.socket.emit('join-room', request, reply => {
            clearTimeout(this.slowTimer);
            clearTimeout(this.giveUpTimer);

            if (!reply.ok) {
                const message = returning
                    ? 'The game ended while you were disconnected.'
                    : (LOBBY_ERRORS[reply.error] || (() => 'Couldn’t join that lobby. Try again.'))(this.target.room);
                this.leave();
                this.on.onError(message);
                return;
            }

            this.joined = true;
            this.code = reply.room;
            this.seat = reply.seat;
            this.unconfirmed.forEach(update => this.emitUpdate(update));

            if (returning) this.on.onStatus('');
            else if (reply.players === 2) { this.on.onStatus(''); this.begin(); }
            else { this.on.onStatus(''); this.on.onWaiting(this.code); }
        });
    }

    onPlayerJoined(info) {
        if (info.rejoined) this.on.onOpponentBack();
        else this.begin();
    }

    begin() {
        if (this.started) return;
        this.started = true;
        this.on.onStart(this.seat);
    }

    // Moves and results. These are confirmed, and resent after a reconnect if needed.
    send(data) {
        const update = { id: this.nextId++, data };
        this.unconfirmed.push(update);
        if (this.connected) this.emitUpdate(update);
    }

    emitUpdate(update) {
        this.socket.emit('game-state-update', update, () => {
            this.unconfirmed = this.unconfirmed.filter(u => u !== update);
        });
    }

    // Live extras, like the cue moving. Fine to lose, so they're never queued or replayed.
    sendLive(data) {
        if (this.connected) this.socket.volatile.emit('game-state-update', { volatile: true, data });
    }

    leave() {
        const socket = this.socket;
        this.socket = null;
        this.reset();
        if (!socket) return;
        if (socket.connected) socket.emit('leave-room');
        socket.disconnect();
    }
}
