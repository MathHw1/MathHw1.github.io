"use strict";

// Touch controls added for Nebula Arcade (iPad).
// The original game sets shot power with the W/S keys, which touch screens don't have.
// Here: touch the table to aim, then pull the power bar down and let go to shoot. On a computer, hold
// the mouse button (or Space) on the table to build power and let go to shoot.
function initTouchUI() {
    var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    var css = document.createElement('style');
    css.textContent =
        '#pwr{position:fixed;right:max(12px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);width:64px;height:62vh;max-height:420px;' +
        'border-radius:32px;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.25);display:none;touch-action:none;z-index:10;overflow:hidden}' +
        '#pwrFill{position:absolute;left:0;right:0;top:0;height:0;background:linear-gradient(#22c55e,#facc15,#ef4444)}' +
        '#pwrTxt{position:absolute;left:0;right:0;bottom:12px;text-align:center;color:#fff;font:700 11px system-ui,sans-serif;line-height:1.35;pointer-events:none}' +
        '#tip{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fff;font:600 13px system-ui,sans-serif;' +
        'padding:7px 14px;border-radius:999px;display:none;z-index:10;pointer-events:none;white-space:nowrap}';
    document.head.appendChild(css);

    function el(id) { var e = document.createElement('div'); e.id = id; return e; }
    var bar = el('pwr'), fill = el('pwrFill'), txt = el('pwrTxt'), tip = el('tip');
    txt.innerHTML = touch ? 'PULL<br>DOWN<br>TO<br>SHOOT' : 'HOLD<br>CLICK<br>OR<br>SPACE';
    bar.appendChild(fill);
    bar.appendChild(txt);
    document.body.appendChild(bar);
    document.body.appendChild(tip);

    // Remember when the game loop last ran, so the bar only shows during a match (not on menus).
    var lastLoop = 0, mainLoop = Game.mainLoop;
    Game.mainLoop = function () { lastLoop = Date.now(); return mainLoop.apply(Game, arguments); };

    function stick() { return Game.gameWorld && Game.gameWorld.stick; }
    function cpuTurn() { return Game.policy && AI_ON && Game.policy.turn === AI_PLAYER_NUM; }
    function otherTurn() { return cpuTurn() || Online.isRemoteTurn(); }
    function canShoot() {
        var s = stick();
        return !!s && !GAME_STOPPED && !otherTurn() && !Game.policy.turnPlayed &&
            s.visible && !s.shooting && !Game.gameWorld.whiteBall.moving;
    }

    var dragging = false, startY = 0, frac = 0;
    function setFrac(f) {
        frac = Math.max(0, Math.min(1, f));
        fill.style.height = (frac * 100) + '%';
        var s = stick();
        if (s && canShoot()) s.origin.x = 970 + frac * 125;   // pull the cue back, same as holding W
    }
    function y(e) { return e.clientY; }
    function down(e) {
        e.stopPropagation(); e.preventDefault();               // keep bar touches from moving the aim
        if (!canShoot()) return;
        dragging = true; startY = y(e); setFrac(0);
        try { bar.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function move(e) {
        e.stopPropagation(); e.preventDefault();
        if (dragging) setFrac((y(e) - startY) / (bar.clientHeight * 0.85));
    }
    function up(e) {
        e.stopPropagation(); e.preventDefault();
        if (!dragging) return;
        dragging = false;
        var s = stick(), power = frac * 75;                    // 75 is the keyboard maximum
        setFrac(0);
        if (!s) return;
        s.origin = new Vector2(970, 11);
        if (canShoot() && power > 3) s.shoot(power, s.rotation);
    }
    bar.addEventListener('pointerdown', down);
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    ['touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (type) {
        bar.addEventListener(type, function (e) { e.stopPropagation(); });     // keep bar presses from moving the aim
    });

    // On a computer: hold the mouse button on the table to build power, and let go to shoot,
    // just like holding Space. The aim stays where it was when the button went down.
    var MOUSE_FULL_POWER_MS = 1050;
    var charging = null;
    function chargeTick() {
        if (!charging) return;
        var s = stick();
        if (!s || !canShoot()) { stopCharge(); return; }
        setFrac((performance.now() - charging.start) / MOUSE_FULL_POWER_MS);
        requestAnimationFrame(chargeTick);
    }
    function stopCharge() {
        var s = stick();
        if (s) s.trackMouse = true;
        charging = null;
    }
    var screen = document.getElementById('screen');
    screen.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !canShoot()) return;
        var s = stick();
        s.trackMouse = false;
        charging = { start: performance.now(), rotation: s.rotation };
        setFrac(0);
        requestAnimationFrame(chargeTick);
    });
    addEventListener('pointerup', function (e) {
        if (!charging || e.pointerType !== 'mouse') return;
        var s = stick(), power = frac * 75, rotation = charging.rotation;
        stopCharge();
        setFrac(0);
        if (!s) return;
        s.origin = new Vector2(970, 11);
        if (canShoot() && power > 3) s.shoot(power, rotation);
    });
    addEventListener('blur', function () { if (charging) { stopCharge(); setFrac(0); var s = stick(); if (s) s.origin = new Vector2(970, 11); } });

    setInterval(function () {
        var playing = Game.gameWorld && !GAME_STOPPED && Date.now() - lastLoop < 500;
        bar.style.display = playing ? 'block' : 'none';
        bar.style.opacity = canShoot() || dragging || charging ? 1 : 0.35;

        var t = '';
        if (playing) {
            if (innerHeight > innerWidth) t = 'Turn your iPad sideways for a bigger table';
            else if (cpuTurn()) t = 'Computer’s turn…';
            else if (Online.isRemoteTurn()) t = Online.turnText();
            else if (stick() && !stick().visible && !stick().shooting && !Game.gameWorld.whiteBall.moving) t = touch ? 'Tap the table to place the white ball' : 'Click the table to place the white ball';
            else if (canShoot() && !dragging && !charging) t = touch ? 'Touch the table to aim, then pull the bar down' : 'Aim with the mouse. Hold the mouse button or Space for power, then let go';
        }
        tip.textContent = t;
        tip.style.display = t ? 'block' : 'none';
    }, 150);
}

// The how-to-play card shown before a match, matching the controls this copy of the game really has.
function drawControlsCard() {
    var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    var lines = touch
        ? ['Touch the table to aim', 'Pull the power bar down, then let go to shoot', 'Tap the table to place the white ball after a foul']
        : ['Move the mouse to aim (arrow keys or A / D turn it too)', 'Hold the mouse button or Space for power', 'Let go to shoot', 'W / S fine-tune the aim', 'Esc goes back to the menu'];
    var ctx = Canvas2D._canvasContext, w = Game.size.x, h = Game.size.y;
    var boxW = 900, boxH = 170 + lines.length * 70, x = (w - boxW) / 2, y = (h - boxH) / 2;
    ctx.save();
    ctx.setTransform(Canvas2D.scale.x, 0, 0, Canvas2D.scale.y, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#721411'; ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 60px system-ui, sans-serif';
    ctx.fillText(touch ? 'HOW TO PLAY' : 'CONTROLS', w / 2, y + 80);
    ctx.font = '36px system-ui, sans-serif';
    lines.forEach(function (line, i) { ctx.fillText(line, w / 2, y + 170 + i * 70); });
    ctx.restore();
}
