"use strict";

// Touch controls added for Nebula Arcade (iPad).
// The original game sets shot power with the W/S keys, which touch screens don't have.
// Here: touch the table to aim, then pull the power bar down and let go to shoot.
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
    txt.innerHTML = 'PULL<br>DOWN<br>TO<br>SHOOT';
    bar.appendChild(fill);
    bar.appendChild(txt);
    document.body.appendChild(bar);
    document.body.appendChild(tip);

    // Remember when the game loop last ran, so the bar only shows during a match (not on menus).
    var lastLoop = 0, mainLoop = Game.mainLoop;
    Game.mainLoop = function () { lastLoop = Date.now(); return mainLoop.apply(Game, arguments); };

    function stick() { return Game.gameWorld && Game.gameWorld.stick; }
    function cpuTurn() { return Game.policy && AI_ON && Game.policy.turn === AI_PLAYER_NUM; }
    function canShoot() {
        var s = stick();
        return !!s && !GAME_STOPPED && !cpuTurn() && !Game.policy.turnPlayed &&
            s.visible && !s.shooting && !Game.gameWorld.whiteBall.moving;
    }

    var dragging = false, startY = 0, frac = 0;
    function setFrac(f) {
        frac = Math.max(0, Math.min(1, f));
        fill.style.height = (frac * 100) + '%';
        var s = stick();
        if (s && canShoot()) s.origin.x = 970 + frac * 125;   // pull the cue back, same as holding W
    }
    function y(e) { return e.changedTouches[0].clientY; }
    function down(e) {
        e.stopPropagation(); e.preventDefault();               // keep bar touches from moving the aim
        if (!canShoot()) return;
        dragging = true; startY = y(e); setFrac(0);
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
    bar.addEventListener('touchstart', down, { passive: false });
    bar.addEventListener('touchmove', move, { passive: false });
    bar.addEventListener('touchend', up, { passive: false });
    bar.addEventListener('touchcancel', up, { passive: false });

    setInterval(function () {
        var playing = touch && Game.gameWorld && !GAME_STOPPED && Date.now() - lastLoop < 500;
        bar.style.display = playing ? 'block' : 'none';
        bar.style.opacity = canShoot() || dragging ? 1 : 0.35;

        var t = '';
        if (playing) {
            if (innerHeight > innerWidth) t = 'Turn your iPad sideways for a bigger table';
            else if (cpuTurn()) t = 'Computer’s turn…';
            else if (stick() && !stick().visible && !stick().shooting && !Game.gameWorld.whiteBall.moving) t = 'Tap the table to place the white ball';
            else if (canShoot() && !dragging) t = 'Touch the table to aim, then pull the bar down';
        }
        tip.textContent = t;
        tip.style.display = t ? 'block' : 'none';
    }, 150);
}
