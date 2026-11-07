"use strict";

// Scoreboard for Nebula Arcade: a bar across the top showing, for each player, their ball colour,
// balls potted this rack, racks won and total points, with the player whose turn it is lit up.
function initScoreboard() {
    var css = document.createElement('style');
    css.textContent =
        '#score{position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:15;display:none;' +
        'align-items:stretch;gap:6px;font-family:system-ui,sans-serif;pointer-events:none;max-width:calc(100vw - 16px)}' +
        '#score .p{display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:12px;background:rgba(0,0,0,.6);' +
        'border:2px solid transparent;color:#e5e7eb;transition:border-color .2s,background .2s;min-width:0}' +
        '#score .p.turn{border-color:#facc15;background:rgba(0,0,0,.78)}' +
        '#score .name{font-weight:800;font-size:15px;white-space:nowrap;display:flex;align-items:center;gap:6px}' +
        '#score .dot{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.5);box-sizing:border-box}' +
        '#score .stats{display:flex;gap:10px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em}' +
        '#score .stats b{display:block;font-size:17px;color:#fff;letter-spacing:0;text-align:center}' +
        '#score .mid{align-self:center;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.6);color:#facc15;' +
        'font-weight:800;font-size:12px;white-space:nowrap}' +
        '@media (max-width:640px){#score .stats span:nth-child(1){display:none}#score .name{font-size:13px}}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'score';
    document.body.appendChild(bar);

    function name(num) {
        if (Online.on) return num === Online.myNum ? 'You' : 'Opponent';
        if (AI_ON) return num === AI_PLAYER_NUM ? 'Computer' : 'You';
        return 'Player ' + (num + 1);
    }

    function dot(color) {
        if (color === Color.red) return '<span class="dot" style="background:#dc2626" title="Red balls"></span>';
        if (color === Color.yellow) return '<span class="dot" style="background:#facc15" title="Yellow balls"></span>';
        return '<span class="dot" title="Colour not picked yet"></span>';
    }

    function player(num) {
        var p = Game.policy.players[num];
        return '<div class="p' + (Game.policy.turn === num ? ' turn' : '') + '">' +
            '<div class="name">' + dot(p.color) + name(num) + '</div>' +
            '<div class="stats">' +
            '<span><b>' + p.matchScore.value + '/7</b>Balls</span>' +
            '<span><b>' + p.totalScore.value + '</b>Racks</span>' +
            '<span><b>' + (p.points || 0) + '</b>Points</span>' +
            '</div></div>';
    }

    var last = '';
    setInterval(function () {
        var playing = Game.policy && !GAME_STOPPED && Game.lastFrame && performance.now() - Game.lastFrame < 500;
        bar.style.display = playing ? 'flex' : 'none';
        if (!playing) return;

        var mid = Online.notice || (Online.on ? (Online.isRemoteTurn() ? 'Their turn' : 'Your turn') : 'VS');
        var html = player(0) + '<div class="mid">' + mid + '</div>' + player(1);
        if (html !== last) { bar.innerHTML = html; last = html; }
    }, 150);
}
