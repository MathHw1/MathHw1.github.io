"use strict";

// Online lobby for Nebula Arcade games, talking to lobby-server/ over Socket.io.
// Needs socket.io.min.js loaded first. Used by Classic Pool, Chess, Wheelie Life and Car Racing.
//
//   const lobby = new NebulaLobby('chess', {
//       onWaiting(code)       the lobby exists; show the code to share
//       onStart(seat)         both players are in (seat 0 = host, 1 = guest)
//       onMessage(data)       the other player sent something
//       onStatus(text)        connection news to show ('' clears it)
//       onOpponentAway()      the other player's connection dropped (they may come back)
//       onOpponentBack()
//       onOpponentLeft()      they've gone for good
//       onRoster(room)        who's in the room changed: { host, seats: [{ name, away } or null, ...] }
//       onKicked()            the host removed you
//       onError(text)         couldn't create or join, or the game is lost
//   });
//   lobby.create();  lobby.join('ABCDE');  lobby.send({...});  lobby.kick(seat);  lobby.leave();
//   Pass { manualStart: true } as a third option for rooms where the host presses Start, and
//   resumable: true to get a seat back after a reload. See savedSession() and resume().

// The address of the deployed lobby server. Testing on this computer uses a local one.
const LOBBY_SERVER_URL = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)
    ? 'http://' + location.hostname + ':3000'
    : 'https://nebula-lobby-server.onrender.com';

const SLOW_START_NOTICE_MS = 4000;    // free hosts sleep when idle, so the first connection can be slow
const CONNECT_TIMEOUT_MS = 75000;
const ATTEMPT_TIMEOUT_MS = 8000;      // how long one connection attempt can take before trying again
const SESSION_KEY = 'nebula-lobby:';
const SESSION_MS = 150000;            // a saved seat older than this is gone from the server anyway
const LOBBY_ERRORS = {
    'not-found': code => 'No lobby with code ' + code + '. Check the code and try again.',
    'full': () => 'That lobby is already full.',
    'kicked': () => 'The host removed you from that lobby.',
    'server-full': () => 'The lobby server is full right now. Try again soon.'
};

// crypto.randomUUID only exists on https, and testing over Wi-Fi uses plain http.
function newPlayerId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

class NebulaLobby {
    constructor(game, handlers, options) {
        this.game = game;
        this.on = handlers;
        this.manualStart = !!(options && options.manualStart);
        this.resumable = !!(options && options.resumable);
        this.socket = null;
        this.roster = null;
        this.reset();
        // Hiding the game counts as stepping away, so the others wait instead of playing on.
        this.onVisibility = () => { if (this.connected) this.socket.emit('player-status', document.hidden); };
        document.addEventListener('visibilitychange', this.onVisibility);
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
        this.resuming = false;
        clearTimeout(this.slowTimer);
        clearTimeout(this.giveUpTimer);
    }

    get connected() { return this.joined && !!this.socket && this.socket.connected; }

    // Wakes a sleeping server early, so Create and Join feel quicker. Failure doesn't matter here.
    static warmUp() { fetch(LOBBY_SERVER_URL + '/health').catch(() => {}); }

    // The seat this browser left behind, if it's recent enough to go back to. This tab's own copy
    // comes first, so a reload gets its own seat even with the same game open in another tab.
    static savedSession(game) {
        for (const store of [sessionStorage, localStorage]) {
            try {
                const saved = JSON.parse(store.getItem(SESSION_KEY + game));
                if (saved && Date.now() - saved.savedAt < SESSION_MS) return { ...saved, otherTab: store === localStorage };
            } catch (_) {}
        }
        return null;
    }

    // Saves the seat, plus anything the game needs to pick up where it left off.
    remember(data) {
        if (!this.resumable || !this.code) return;
        if (data !== undefined) this.data = data;
        const saved = JSON.stringify({ code: this.code, seat: this.seat, playerId: this.playerId, lastSeq: this.lastSeq, nextId: this.nextId, data: this.data, savedAt: Date.now() });
        for (const store of [sessionStorage, localStorage]) {
            try { store.setItem(SESSION_KEY + this.game, saved); } catch (_) {}
        }
    }

    forget() {
        if (!this.resumable) return;
        for (const store of [sessionStorage, localStorage]) {
            try { store.removeItem(SESSION_KEY + this.game); } catch (_) {}
        }
    }

    create() { this.open({ create: true }); }

    resume(session) { this.open({ resume: session }); }

    join(rawCode) {
        const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 5) { this.on.onError('That code should be 5 letters or numbers.'); return; }
        this.open({ room: code });
    }

    open(target) {
        if (typeof io === 'undefined') { this.on.onError('Online play couldn’t load. Check your internet and refresh.'); return; }
        this.leave();
        this.target = target;
        this.playerId = newPlayerId();
        if (target.resume) {
            ({ code: this.code, seat: this.seat, playerId: this.playerId, lastSeq: this.lastSeq, nextId: this.nextId } = target.resume);
            this.resuming = true;
        }
        this.on.onStatus(target.resume ? 'Getting your seat back…' : target.create ? 'Creating lobby…' : 'Joining lobby ' + target.room + '…');

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
        socket.on('roster', room => this.setRoster(room));
        socket.on('kicked', () => {
            this.leave();
            if (this.on.onKicked) this.on.onKicked();
            else this.on.onError('The host removed you from the lobby.');
        });
        socket.on('game-state-update', update => {
            // Numbered updates can arrive twice around a reconnect. Live ones have no number.
            if (update.seq) {
                if (update.seq <= this.lastSeq) return;
                this.lastSeq = update.seq;
                this.remember();
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
        if (this.resuming && this.target.resume.otherTab) request.onlyIfDropped = true;
        if (typeof NebulaProfile !== 'undefined') {
            request.name = NebulaProfile.name();
            request.deviceId = NebulaProfile.deviceId();
        }

        this.socket.emit('join-room', request, reply => {
            clearTimeout(this.slowTimer);
            clearTimeout(this.giveUpTimer);

            if (reply.error === 'seat-in-use') {
                this.resumable = false;       // that seat is another tab's, so leave its saved copy alone
                this.leave();
                this.on.onResumeRefused();
                return;
            }
            if (!reply.ok) {
                const message = returning
                    ? (this.resuming ? 'That race has ended.' : 'The game ended while you were disconnected.')
                    : (LOBBY_ERRORS[reply.error] || (() => 'Couldn’t join that lobby. Try again.'))(this.target.room);
                this.leave();
                this.on.onError(message);
                return;
            }

            this.joined = true;
            this.code = reply.room;
            this.seat = reply.seat;
            this.setRoster(reply.roster);
            this.unconfirmed.forEach(update => this.emitUpdate(update));

            this.remember();
            if (this.resuming) {
                this.resuming = false;
                this.on.onStatus('');
                this.on.onResumed();
            }
            else if (returning) this.on.onStatus('');
            else if (reply.players >= 2 && !this.manualStart) { this.on.onStatus(''); this.begin(); }
            else { this.on.onStatus(''); this.on.onWaiting(this.code); }
        });
    }

    setRoster(room) {
        this.roster = room;
        if (this.on.onRoster) this.on.onRoster(room);
    }

    // Fills a list with the players, with a Kick button for the host.
    static fillRoster(list, lobby) {
        list.textContent = '';
        if (!lobby || !lobby.roster) return;
        lobby.roster.seats.forEach((seat, n) => {
            if (!seat) return;
            const item = document.createElement('li'), name = document.createElement('span');
            name.textContent = (n === lobby.roster.host ? '👑 ' : '') + seat.name + (n === lobby.seat ? ' (you)' : '') + (seat.away ? ' · away' : '');
            item.appendChild(name);
            if (lobby.isHost && n !== lobby.seat) {
                const kick = document.createElement('button');
                kick.textContent = 'Kick';
                kick.addEventListener('click', () => lobby.kick(n));
                item.appendChild(kick);
            }
            list.appendChild(item);
        });
    }

    get isHost() { return !!this.roster && this.roster.host === this.seat; }

    // Tells the others to wait, or that they can stop waiting.
    setAway(away) {
        if (this.connected) this.socket.emit('player-status', away);
    }

    kick(seat) {
        if (this.connected) this.socket.emit('kick-player', seat);
    }

    onPlayerJoined(info) {
        if (info.rejoined) this.on.onOpponentBack();
        else if (!this.manualStart) this.begin();
    }

    begin() {
        if (this.started) return;
        this.started = true;
        this.on.onStart(this.seat);
    }

    // Moves and results. These are confirmed, and resent after a reconnect if needed.
    send(data) {
        const update = { id: this.nextId++, data };
        this.remember();
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
        this.forget();
        const socket = this.socket;
        this.socket = null;
        this.reset();
        if (!socket) return;
        if (socket.connected) socket.emit('leave-room');
        socket.disconnect();
    }
}
