"use strict";

// Neon Tunnel: drawing, controls, screens and saving. The rules are in engine.js.
//
// Drawing with no 3D library: the camera looks straight down the tunnel's middle. Something at
// depth z in front of the camera appears at radius  R × focal ÷ z  from the screen's centre, so
// far rings bunch up in the middle and near ones fill the screen. A point on the wall at tunnel
// angle φ is drawn at screen angle  φ − playerAngle + 90°,  which keeps the ship at the bottom and
// turns the tunnel around it.

const $ = id => document.getElementById(id);
const E = TunnelEngine;
const STEP = 1 / 120;
const SIDES = 24;                  // wall panels around the tunnel
const RING_GAP = 14;               // units between wall rings
const FAR = 260;                   // how deep the tunnel is drawn
const NEAR = 1.2;
const SHIP_SCREEN = 0.42;          // the ship's distance from the centre, as a share of the screen
const PLATE_DEPTH = 3;             // how thick hazards look
const LEADERBOARD_GAME = 'tunnel';
const NEW_STATS = { score: 0, level: 1, distance: 0, timeMs: 0, runs: 0 };
// Each level has its own colours, and they blend from one to the next as you pass a level ring.
const ZONES = [
    { name: 'Ember', walls: ['#2b0f3a', '#3f1456'], edge: '#ffb020', fog: '#140820' },
    { name: 'Glacier', walls: ['#062a40', '#0c4466'], edge: '#7cf7ff', fog: '#04141f' },
    { name: 'Jungle', walls: ['#0a2c18', '#15502c'], edge: '#c6ff4d', fog: '#04140b' },
    { name: 'Orchid', walls: ['#30092e', '#4d1049'], edge: '#ff7ae0', fog: '#170415' },
    { name: 'Abyss', walls: ['#0c0c30', '#1b1b58'], edge: '#ffffff', fog: '#05051a' },
    { name: 'Solar', walls: ['#331805', '#552908'], edge: '#ffe14d', fog: '#180b02' }
];

// ---------- Saving ----------

const stats = () => NebulaProfile.stats(LEADERBOARD_GAME, NEW_STATS);

function saveRun(run) {
    const old = stats(), timeMs = Math.round(run.time * 1000);
    NebulaProfile.setStats(LEADERBOARD_GAME, {
        score: Math.max(old.score, Math.floor(run.score)), level: Math.max(old.level, run.level),
        distance: Math.max(old.distance, Math.floor(run.distance)), timeMs: Math.max(old.timeMs, timeMs), runs: old.runs + 1
    });
    const scored = NebulaScores.record('tunnel:score', run.score);
    if (run.level > old.level) NebulaScores.record('tunnel:level', run.level);
    if (run.distance > old.distance) NebulaScores.record('tunnel:distance', run.distance);
    if (timeMs > old.timeMs) NebulaScores.record('tunnel:time', timeMs);
    return { scored, newBest: run.score > old.score };
}

// ---------- Screens ----------

let run = null;
let screen = 'menu';        // menu, board, playing, paused or over
const input = { left: false, right: false };

function show(name) {
    screen = name;
    for (const id of ['menu', 'board', 'paused', 'over']) $(id).classList.toggle('hidden', name !== id);
    $('hud').classList.toggle('hidden', name !== 'playing' && name !== 'paused');
    $('touch').classList.toggle('hidden', name !== 'playing');
    if (name === 'menu') fillMenu();
    if (name === 'board') fillBoard();
}

function fillMenu() {
    const s = stats();
    $('menuBest').textContent = s.score ? Math.floor(s.score).toLocaleString() + ' · level ' + s.level + ' of ' + E.TUNE.levels : 'No runs yet';
}

const seconds = t => t.toFixed(1) + 's';
const tierName = level => ['Beginner', 'Intermediate', 'Advanced', 'Nightmare'][E.tier(level)];

function start() {
    run = E.newRun(Math.floor(Math.random() * 4294967296));
    input.left = input.right = false;
    zone.from = zone.to = 0;
    zone.blend = 1;
    show('playing');
    say('Level 1: ' + tierName(1), 1200);
}

function crash() {
    const result = saveRun(run);
    shake = 22;
    flash = 1;
    $('overTitle').textContent = result.newBest ? '🏆 New best score!' : 'You crashed!';
    $('overScore').textContent = Math.floor(run.score).toLocaleString();
    $('overLevel').textContent = run.level;
    $('overDist').textContent = Math.floor(run.distance).toLocaleString();
    $('overTime').textContent = seconds(run.time);
    $('overRank').textContent = '';
    $('overSaveName').classList.toggle('hidden', !!NebulaProfile.name() || run.score < 1);
    if (result.scored) {
        result.scored.then(reply => { $('overRank').textContent = '🏆 You’re #' + reply.rank + ' on the leaderboard!'; })
            .catch(problem => { $('overRank').textContent = problem.message; });
    }
    setTimeout(() => { if (screen === 'playing') show('over'); }, 700);
}

function pause() { if (screen === 'playing') show('paused'); }
function resume() { if (screen === 'paused') { last = performance.now(); show('playing'); } }

let sayTimer = 0;
function say(text, ms) {
    $('message').textContent = text;
    $('message').classList.add('show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => $('message').classList.remove('show'), ms);
}

// ---------- Drawing ----------

const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
let width = 0, height = 0, cx = 0, cy = 0, focal = 0, shake = 0, flash = 0;
const zone = { from: 0, to: 0, blend: 1 };

function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, navigator.maxTouchPoints > 0 ? 1.5 : 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    width = canvas.width;
    height = canvas.height;
    cx = width / 2;
    cy = height * 0.45;
    // Picked so the ship's ring is SHIP_SCREEN of the screen away from the centre.
    focal = Math.min(width, height) * SHIP_SCREEN * E.TUNE.playerDepth;
}

const radiusAt = z => focal / z;
const screenAngle = (angle, playerAngle) => angle - playerAngle + Math.PI / 2;

function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = shift => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}
function zoneColour(part, index) {
    const a = ZONES[zone.from % ZONES.length], b = ZONES[zone.to % ZONES.length];
    return mix(index === undefined ? a[part] : a[part][index], index === undefined ? b[part] : b[part][index], zone.blend);
}

function drawTunnel(r) {
    const fog = zoneColour('fog');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);
    const walls = [zoneColour('walls', 0), zoneColour('walls', 1)];
    const offset = r.distance % RING_GAP, first = Math.floor(r.distance / RING_GAP);
    const step = Math.PI * 2 / SIDES;

    // Far rings first, so near ones paint over them.
    for (let k = Math.ceil(FAR / RING_GAP); k >= 0; k--) {
        const zNear = Math.max(NEAR, k * RING_GAP - offset), zFar = zNear + RING_GAP;
        if (zFar <= NEAR) continue;
        const rNear = radiusAt(zNear), rFar = radiusAt(zFar), fade = Math.min(1, zNear / FAR);
        for (let i = 0; i < SIDES; i++) {
            const a0 = screenAngle(i * step, r.angle), a1 = a0 + step;
            ctx.fillStyle = walls[(i + first + k) % 2];
            ctx.globalAlpha = 1 - fade * 0.85;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a0) * rNear, cy + Math.sin(a0) * rNear);
            ctx.lineTo(cx + Math.cos(a1) * rNear, cy + Math.sin(a1) * rNear);
            ctx.lineTo(cx + Math.cos(a1) * rFar, cy + Math.sin(a1) * rFar);
            ctx.lineTo(cx + Math.cos(a0) * rFar, cy + Math.sin(a0) * rFar);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}

// The glowing ring that marks the start of each level.
function drawLevelRings(r) {
    const next = Math.ceil(r.distance / E.TUNE.levelDistance) * E.TUNE.levelDistance;
    for (const at of [next, next + E.TUNE.levelDistance]) {
        const z = at - r.distance;
        if (z < NEAR || z > FAR) continue;
        const level = Math.round(at / E.TUNE.levelDistance) + 1;
        if (level > E.TUNE.levels) continue;
        ctx.strokeStyle = ZONES[(level - 1) % ZONES.length].edge;
        ctx.globalAlpha = Math.max(0.15, 1 - z / FAR);
        ctx.lineWidth = Math.max(2, radiusAt(z) * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, radiusAt(z) * 0.97, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

// Hazards are drawn as flat plates: a slice of the tunnel's cross-section, from the wall inwards.
function plate(o, z, shift, r, fill, edge) {
    const rad = radiusAt(z);
    for (const [start, widthAngle] of o.arcs) {
        const a0 = screenAngle(start + shift, r.angle), a1 = a0 + widthAngle, steps = Math.max(2, Math.ceil(widthAngle / 0.15));
        ctx.beginPath();
        if (o.kind === 'wedge') ctx.moveTo(cx + Math.cos((a0 + a1) / 2) * rad * 0.2, cy + Math.sin((a0 + a1) / 2) * rad * 0.2);
        else if (o.kind === 'half' || o.kind === 'gate') ctx.arc(cx, cy, rad * 0.18, a1, a0, true);
        else ctx.moveTo(cx, cy);
        for (let i = 0; i <= steps; i++) {
            const a = a0 + (a1 - a0) * i / steps;
            ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (edge) {
            ctx.strokeStyle = edge;
            ctx.lineWidth = Math.max(1.5, rad * 0.018);
            ctx.stroke();
        }
    }
}

function drawHazards(r) {
    const edge = zoneColour('edge');
    const near = [...r.obstacles].sort((a, b) => b.at - a.at);
    for (const o of near) {
        const z = o.at - r.distance;
        if (z < NEAR || z > FAR) continue;
        const shift = E.offsetAt(o, r.distance);
        ctx.globalAlpha = Math.max(0.2, 1 - z / FAR);
        plate(o, z + PLATE_DEPTH, shift, r, 'rgba(0,0,0,.55)');                   // the back, for some depth
        plate(o, z, shift, r, 'rgba(10,10,18,.88)', edge);
    }
    ctx.globalAlpha = 1;
}

function drawShip(r) {
    const y = cy + Math.min(width, height) * SHIP_SCREEN * 0.93, lean = r.turn * 0.06;
    const size = Math.min(width, height) * 0.035;
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(lean);
    ctx.shadowColor = zoneColour('edge');
    ctx.shadowBlur = size;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.2);
    ctx.lineTo(size, size * 0.6);
    ctx.lineTo(0, size * 0.25);
    ctx.lineTo(-size, size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function render() {
    const r = run || { distance: performance.now() / 20, angle: performance.now() / 4000, turn: 0, obstacles: [] };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= 0.88;
    }
    drawTunnel(r);
    drawLevelRings(r);
    drawHazards(r);
    if (run && !run.crashed) drawShip(r);
    if (flash > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.3).toFixed(3) + ')';
        ctx.fillRect(0, 0, width, height);
        flash = Math.max(0, flash - 0.06);
    }
}

function updateHud() {
    $('hudScore').textContent = Math.floor(run.score).toLocaleString();
    $('hudLevel').textContent = run.level + '/' + E.TUNE.levels;
    $('hudDist').textContent = Math.floor(run.distance).toLocaleString();
    $('hudTime').textContent = seconds(run.time);
}

// ---------- Main loop ----------

let last = performance.now(), spare = 0;

function frame(now) {
    requestAnimationFrame(frame);
    const passed = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (screen === 'playing' && run && !run.crashed) {
        const level = run.level;
        spare += passed;
        while (spare >= STEP && !run.crashed) {
            E.step(run, input, STEP);
            spare -= STEP;
        }
        if (run.level !== level) {
            zone.from = zone.to;
            zone.to = run.level - 1;
            zone.blend = 0;
            say('Level ' + run.level + ': ' + tierName(run.level), 1100);
        }
        updateHud();
        if (run.crashed) crash();
    }
    // Colours change smoothly between levels. Later levels just change faster, with no flashing.
    zone.blend = Math.min(1, zone.blend + passed * (run ? 1.2 + E.tier(run.level) * 0.8 : 1));
    render();
}

// ---------- Controls ----------

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
function key(e, down) {
    if (down && (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape')) {
        e.preventDefault();
        if (e.repeat) return;
        if (screen === 'playing') pause();
        else if (screen === 'paused') resume();
        else if (e.code === 'Space' && (screen === 'over' || screen === 'menu')) start();
        return;
    }
    const side = KEYS[e.code];
    if (!side) return;
    e.preventDefault();
    input[side] = down;
}
addEventListener('keydown', e => key(e, true));
addEventListener('keyup', e => key(e, false));

function releaseAll() {
    input.left = input.right = false;
    document.querySelectorAll('.pad.down').forEach(p => p.classList.remove('down'));
}
addEventListener('blur', () => { releaseAll(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); pause(); } });

// Touch: hold the left or right half of the screen. Each finger counts on its own.
for (const pad of document.querySelectorAll('.pad')) {
    const side = pad.dataset.side;
    const set = (down, e) => {
        e.preventDefault();
        input[side] = down;
        pad.classList.toggle('down', down);
    };
    pad.addEventListener('pointerdown', e => {
        set(true, e);
        try { pad.setPointerCapture(e.pointerId); } catch (_) {}
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => pad.addEventListener(type, e => set(false, e)));
    pad.addEventListener('contextmenu', e => e.preventDefault());
}
document.addEventListener('contextmenu', e => e.preventDefault());

$('playBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('overMenu').addEventListener('click', () => { run = null; show('menu'); });
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => { run = null; show('menu'); });
$('boardBtn').addEventListener('click', () => show('board'));
$('boardBack').addEventListener('click', () => show('menu'));
$('overSaveName').addEventListener('click', () => NebulaScores.askName(() => {
    $('overSaveName').classList.add('hidden');
    NebulaScores.hello(LEADERBOARD_GAME);
    $('overRank').textContent = 'Saved! Your bests are on the leaderboard.';
}));

const fillBoard = NebulaScores.mount($('boardMount'), [LEADERBOARD_GAME]);

if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
addEventListener('resize', resize);
resize();
show('menu');
requestAnimationFrame(frame);
NebulaLobby.warmUp();
NebulaScores.hello(LEADERBOARD_GAME);
NebulaProfile.ready.then(fillMenu);
