"use strict";

// Online play for Nebula Arcade: two people on different computers, joined by a lobby code.
// GitHub Pages can't run a game server, so the browsers connect straight to each other with
// PeerJS (WebRTC). The code is the host's PeerJS id, which is how the other player finds them.
//
// Each shot runs on both screens. The shooter's game is in charge of that shot: it sends the
// table as it was just before the shot, then the result once the balls stop, so both stay identical.

const LOBBY_PREFIX = 'nebula-arcade-pool-';
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L, so codes are easy to read out
const AIM_SEND_MS = 60;
const MAX_SYNC_WAIT_MS = 4000;
const SERVER_TIMEOUT_MS = 12000;    // how long to wait for the matchmaking server
const CONNECT_TIMEOUT_MS = 15000;   // how long to wait for the two computers to connect
const JOIN_RETRIES = 2;             // extra tries before saying a lobby code doesn't exist

function Online_Singleton() {
    this.on = false;            // true while an online match is being played
    this.myNum = 0;             // 0 = host (Player 1, breaks first), 1 = guest
    this.peer = null;
    this.conn = null;
    this.code = '';
    this.status = '';
    this.applyingRemote = false;
    this.pendingSync = null;
    this.starting = false;
}

Online_Singleton.prototype.isRemoteTurn = function () {
    return this.on && !!Game.policy && Game.policy.turn !== this.myNum;
};

// ---------- Lobby ----------

Online_Singleton.prototype.createLobby = function () {
    this.leave();
    var code = '';
    for (var i = 0; i < 5; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    this.code = code;
    this.setStatus('Creating lobby…');

    var online = this;
    var peer = this.peer = new Peer(LOBBY_PREFIX + code);
    this.watchServer(peer);
    peer.on('open', function () { online.setStatus('waiting'); });
    peer.on('connection', function (conn) {
        // Only a friend who actually got connected fills the lobby. (A join that failed
        // used to count too, which turned every later join away and left the lobby stuck.)
        if (online.conn && online.conn.open) { conn.close(); return; }
        if (online.conn) online.conn.close();
        online.attach(conn, 0);
    });
    peer.on('error', function (err) {
        if (err.type === 'unavailable-id') online.createLobby();   // someone has this code already
        else online.fail(err);
    });
};

// Keeps a lobby reachable: the link to the matchmaking server can drop if you wait a while,
// which left your code not working while the screen still said "Waiting for your friend".
// Also gives up with a message if the server never answers, instead of hanging.
Online_Singleton.prototype.watchServer = function (peer) {
    var online = this;
    peer.on('disconnected', function () {
        if (online.peer === peer && !peer.destroyed) peer.reconnect();
    });
    setTimeout(function () {
        if (online.peer === peer && !peer.open && !peer.destroyed && !online.conn) {
            online.leave();
            online.setStatus('The lobby server didn’t answer. Check your internet and try again.');
        }
    }, SERVER_TIMEOUT_MS);
};

Online_Singleton.prototype.joinLobby = function (code, triesLeft) {
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { this.setStatus('That code should be 5 letters or numbers.'); return; }
    if (triesLeft === undefined) triesLeft = JOIN_RETRIES;
    this.leave();
    this.code = code;
    this.setStatus('Joining lobby ' + code + '…');

    var online = this;
    var peer = this.peer = new Peer();
    this.watchServer(peer);
    peer.on('open', function () {
        if (online.conn) return;   // already joining (this fires again after a reconnect)
        online.attach(peer.connect(LOBBY_PREFIX + code, { reliable: true }), 1);
    });
    peer.on('error', function (err) {
        if (err.type === 'peer-unavailable') {
            online.leave();
            // The matchmaking server sometimes says a lobby doesn't exist when it does
            // (seen right after an earlier failed join), so quietly try again first.
            if (triesLeft > 0) online.retryTimer = setTimeout(function () { online.joinLobby(code, triesLeft - 1); }, 1500);
            else online.setStatus('No lobby with code ' + code + '. Check the code and try again.');
        }
        else online.fail(err);
    });
};

Online_Singleton.prototype.attach = function (conn, playerNum) {
    var online = this;
    this.conn = conn;
    this.myNum = playerNum;

    if (playerNum === 1) this.setStatus('Connecting to your friend…');

    conn.on('open', function () {
        if (playerNum === 0) online.send({ t: 'start' });
    });
    conn.on('data', function (msg) { online.receive(msg); });
    conn.on('error', function (err) { if (online.conn === conn) online.fail(err); });

    // If the two computers can't reach each other, say so instead of hanging forever.
    setTimeout(function () {
        if (online.conn !== conn || conn.open) return;
        online.conn = null;
        conn.close();
        if (playerNum === 1) {
            online.leave();
            online.setStatus('Couldn’t reach your friend’s game. Make sure their lobby is still open, then try again. ' +
                'If it keeps failing, one of your networks (often school Wi-Fi) is blocking it.');
        }
        // The host just keeps waiting, so the friend can try again with the same code.
    }, CONNECT_TIMEOUT_MS);
    conn.on('close', function () {
        if (online.conn !== conn) return;
        var wasPlaying = online.on;
        online.conn = null;
        online.on = false;
        online.setStatus(wasPlaying ? 'Your opponent left. You can keep playing here as a 2-player game.' : 'The connection closed.');
    });
};

Online_Singleton.prototype.fail = function (err) {
    console.warn('Online pool error', err);
    this.setStatus('Couldn’t connect (' + (err.type || err.message || 'network error') +
        '). Some school or work networks block this. Try again, or try another network.');
};

Online_Singleton.prototype.leave = function () {
    clearTimeout(this.retryTimer);
    this.on = false;
    this.pendingSync = null;
    if (this.conn) { var c = this.conn; this.conn = null; c.close(); }
    if (this.peer) { this.peer.destroy(); this.peer = null; }
    this.code = '';
};

Online_Singleton.prototype.send = function (msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
};

// Starts a match on this screen, the same way the 2-player menu button does.
Online_Singleton.prototype.beginMatch = function () {
    this.on = true;
    AI_ON = false;
    this.pendingSync = null;
    this.setStatus('playing');

    Game.mainMenu.active = false;
    GAME_STOPPED = false;
    this.starting = true;
    setTimeout(Game.startNewGame, 200);
    sounds.fadeOut(Game.mainMenu.sound);
};

// ---------- Messages ----------

Online_Singleton.prototype.receive = function (msg) {
    switch (msg.t) {
        case 'start':
            if (this.myNum === 1) this.send({ t: 'start' });   // tell the host we're starting too
            this.beginMatch();
            break;
        case 'aim':
            this.showRemoteAim(msg);
            break;
        case 'shot':
            this.playRemoteShot(msg);
            break;
        case 'sync':
            this.pendingSync = { msg: msg, since: Date.now() };
            break;
    }
};

Online_Singleton.prototype.snapshot = function () {
    return {
        balls: Game.gameWorld.balls.map(function (b) {
            return { x: b.position.x, y: b.position.y, visible: b.visible, inHole: b.inHole };
        }),
        policy: JSON.parse(JSON.stringify(Game.policy))
    };
};

Online_Singleton.prototype.applySnapshot = function (state) {
    var world = Game.gameWorld;
    world.balls.forEach(function (b, i) {
        var s = state.balls[i];
        b.position = new Vector2(s.x, s.y);
        b.visible = s.visible;
        b.inHole = s.inHole;
        b.stop();
    });
    Game.policy.initiateState(state.policy);
    world.stick.position = world.whiteBall.position.copy();
};

// Called by Stick.shoot for every shot.
Online_Singleton.prototype.sendShot = function (power, rotation) {
    if (!this.on || this.applyingRemote || this.isRemoteTurn()) return;
    this.send({ t: 'shot', power: power, rotation: rotation, state: this.snapshot() });
};

Online_Singleton.prototype.playRemoteShot = function (msg) {
    if (!Game.gameWorld) return;
    if (this.pendingSync) this.applyPendingSync();

    this.applySnapshot(msg.state);
    var stick = Game.gameWorld.stick;
    stick.visible = true;
    this.applyingRemote = true;
    stick.shoot(msg.power, msg.rotation);
    this.applyingRemote = false;
};

// Called after the shooter's game has worked out fouls, scores and whose turn is next.
Online_Singleton.prototype.sendResult = function (rackOver) {
    this.send({ t: 'sync', state: this.snapshot(), rackOver: rackOver });
};

Online_Singleton.prototype.applyPendingSync = function () {
    var msg = this.pendingSync.msg;
    this.pendingSync = null;
    this.applySnapshot(msg.state);
    Game.gameWorld.stick.reset();
    if (msg.rackOver) setTimeout(function () { Game.gameWorld.reset(); }, 1000);
};

Online_Singleton.prototype.showRemoteAim = function (msg) {
    var world = Game.gameWorld;
    if (!world || !this.isRemoteTurn() || Game.policy.turnPlayed || world.ballsMoving() || this.pendingSync) return;
    world.stick.rotation = msg.rotation;
    world.stick.origin.x = msg.pull;
    world.stick.visible = msg.stickVisible;
    if (msg.ballInHand) {
        world.whiteBall.position = new Vector2(msg.x, msg.y);
        world.whiteBall.visible = true;
    }
    world.stick.position = world.whiteBall.position.copy();
};

Online_Singleton.prototype.tick = function () {
    if (!this.on || !Game.gameWorld) return;
    var world = Game.gameWorld;

    // Show the opponent's result once our replay of their shot has finished (or it's taking too long).
    if (this.pendingSync && (!world.ballsMoving() || Date.now() - this.pendingSync.since > MAX_SYNC_WAIT_MS)) {
        this.applyPendingSync();
    }

    // While it's our turn, let the opponent watch us aim.
    if (!this.isRemoteTurn() && !Game.policy.turnPlayed && !GAME_STOPPED) {
        this.send({
            t: 'aim',
            rotation: world.stick.rotation,
            pull: world.stick.origin.x,
            stickVisible: world.stick.visible,
            ballInHand: Game.policy.foul,
            x: world.whiteBall.position.x,
            y: world.whiteBall.position.y
        });
    }
};

// ---------- Lobby screen ----------

Online_Singleton.prototype.setStatus = function (status) {
    this.status = status;
    if (this.render) this.render();
};

Online_Singleton.prototype.initUI = function () {
    var css = document.createElement('style');
    css.textContent =
        '#onlineBtn{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;' +
        'font:800 20px system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#7c3aed,#c026d3);border:0;border-radius:14px;' +
        'padding:14px 26px;cursor:pointer;box-shadow:0 10px 30px rgba(124,58,237,.45);display:none}' +
        '#onlineBtn:hover{filter:brightness(1.1)}' +
        '#lobby{position:fixed;inset:0;z-index:30;display:none;place-items:center;background:rgba(0,0,0,.6);font-family:system-ui,sans-serif}' +
        '#lobby .box{width:min(420px,calc(100vw - 32px));background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:22px;box-sizing:border-box}' +
        '#lobby h2{margin:0 0 4px;font-size:22px;color:#fff}#lobby p{margin:8px 0;font-size:14px;line-height:1.45;color:#9ca3af}' +
        '#lobby button{font:700 15px system-ui,sans-serif;border:0;border-radius:10px;padding:11px 16px;cursor:pointer;color:#fff;background:#7c3aed}' +
        '#lobby button.ghost{background:rgba(255,255,255,.08)}#lobby .row{display:flex;gap:8px;margin-top:10px}' +
        '#lobby input{flex:1;min-width:0;font:800 20px ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;padding:10px 12px;' +
        'border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#0b0f19;color:#fff}' +
        '#lobby .code{font:900 40px ui-monospace,monospace;letter-spacing:.25em;color:#fff;text-align:center;margin:10px 0;' +
        'padding:12px;border-radius:12px;background:#0b0f19;border:1px dashed rgba(167,139,250,.6);user-select:all}' +
        '#lobby .or{text-align:center;margin:14px 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em}' +
        '#lobby .msg{color:#fbbf24}';
    document.head.appendChild(css);

    var btn = document.createElement('button');
    btn.id = 'onlineBtn';
    btn.textContent = '🌐 Play Online';
    document.body.appendChild(btn);

    var lobby = document.createElement('div');
    lobby.id = 'lobby';
    document.body.appendChild(lobby);

    var online = this;
    var open = false;
    function stop(e) { e.stopPropagation(); }   // keep lobby clicks away from the game's own menu buttons
    ['mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown'].forEach(function (ev) {
        lobby.addEventListener(ev, stop);
        btn.addEventListener(ev, stop);
    });
    btn.addEventListener('click', function () { open = true; online.render(); });

    this.render = function () {
        if (!open) { lobby.style.display = 'none'; return; }
        lobby.style.display = 'grid';
        var s = online.status;
        var html = '<div class="box"><h2>🌐 Play Online</h2>';

        if (online.on) {
            html += '<p>You’re in an online game (lobby <b>' + online.code + '</b>). Press <b>Continue</b> on the menu to go back to it.</p>' +
                '<div class="row" style="justify-content:space-between"><button class="ghost" data-a="close">Back</button>' +
                '<button data-a="cancel" style="background:#dc2626">Leave online game</button></div>';
        } else if (s === 'waiting' && online.code) {
            html += '<p>Send this code to your friend. The game starts as soon as they join.</p>' +
                '<div class="code">' + online.code + '</div>' +
                '<p>Waiting for your friend…</p>' +
                '<div class="row"><button class="ghost" data-a="cancel">Cancel</button></div>';
        } else {
            html += '<p>Play pool with a friend on another computer.</p>' +
                '<div class="row"><button data-a="create" style="flex:1">Create a lobby</button></div>' +
                '<div class="or">or join one</div>' +
                '<div class="row"><input id="joinCode" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false">' +
                '<button data-a="join">Join</button></div>' +
                (s && s !== 'playing' ? '<p class="msg">' + s + '</p>' : '') +
                '<div class="row" style="justify-content:flex-end"><button class="ghost" data-a="close">Close</button></div>';
        }
        lobby.innerHTML = html + '</div>';

        var input = lobby.querySelector('#joinCode');
        if (input) {
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') online.joinLobby(input.value); });
        }
        lobby.querySelectorAll('[data-a]').forEach(function (b) {
            b.addEventListener('click', function () {
                var a = b.dataset.a;
                if (a === 'create') online.createLobby();
                else if (a === 'join') online.joinLobby(input.value);
                else if (a === 'cancel') { online.leave(); online.setStatus(''); }
                else if (a === 'close') { open = false; online.render(); }
            });
        });
    };

    // Starting a match closes the lobby screen.
    var beginMatch = this.beginMatch;
    this.beginMatch = function () { open = false; beginMatch.call(online); };

    // Picking any other mode from the menu ends the online game.
    var startNewGame = Game.startNewGame;
    Game.startNewGame = function () {
        if (!online.starting) { online.leave(); online.setStatus(''); }
        online.starting = false;
        return startNewGame.apply(Game, arguments);
    };

    setInterval(function () {
        btn.style.display = Game.mainMenu.active && !open ? 'block' : 'none';
        btn.textContent = online.on ? '🌐 Online game' : '🌐 Play Online';
    }, 200);
    setInterval(function () { online.tick(); }, AIM_SEND_MS);
};

var Online = new Online_Singleton();

// The shooter's game sends the result of each shot once it has worked out fouls and turns.
(function () {
    var updateTurnOutcome = GamePolicy.prototype.updateTurnOutcome;
    GamePolicy.prototype.updateTurnOutcome = function () {
        var myShot = Online.on && this === Game.policy && this.turnPlayed && !Online.isRemoteTurn();
        var rackOver = this.won;
        var result = updateTurnOutcome.apply(this, arguments);
        if (myShot) Online.sendResult(rackOver);
        return result;
    };
})();
