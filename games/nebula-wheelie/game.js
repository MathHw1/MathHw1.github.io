"use strict";

// Nebula Wheelie: an original wheelie game for Nebula Arcade. The bike's physics are in physics.js.
// This file handles the road, coins, missions, garage, drawing and controls.

const $ = id => document.getElementById(id);
const P = WheeliePhysics;
const STEP = 1 / 120;
const SAVE_KEY = 'nebula-wheelie-save';
const PIXELS_PER_METRE = 26;
const VIEW_HEIGHT = 540;           // the game is drawn in this many units tall, then scaled to the screen
const BIKE_X = 0.3;                // where the bike sits across the screen
const BUMP_REWARD = 40;
const FRONT_REACH = 1.4;           // metres from the rider to the front wheel
const MAGNET_RANGE = 3;            // extra metres per magnet level
const THEME_EVERY = 400;           // metres between scenery changes
const FIRST_BUMP = 90;             // gives new riders time to learn the wheelie

const BIKES = [
    { id: 'ember', name: 'Ember', color: '#f97316', cost: 0 },
    { id: 'ocean', name: 'Ocean', color: '#0ea5e9', cost: 150 },
    { id: 'toxic', name: 'Toxic', color: '#84cc16', cost: 300 },
    { id: 'nebula', name: 'Nebula', color: '#c026d3', cost: 600 }
];
const UPGRADES = [
    { id: 'engine', name: 'Engine', about: 'Lifts the front wheel faster.', costs: [100, 250, 500] },
    { id: 'grip', name: 'Balance', about: 'Wider green zone and harder to flip.', costs: [120, 300, 600] },
    { id: 'magnet', name: 'Coin Magnet', about: 'Pulls in coins from further away.', costs: [80, 200, 400] }
];
const THEMES = [
    { name: 'Sunset Boulevard', top: '#ff7e5f', bottom: '#feb47b', far: '#c8553d', near: '#7a3b4e', ground: '#3a3f55' },
    { name: 'Neon City', top: '#120458', bottom: '#7a04eb', far: '#2d0a6b', near: '#ff2a6d', ground: '#1a1a2e' },
    { name: 'Ocean Drive', top: '#38bdf8', bottom: '#bae6fd', far: '#0ea5e9', near: '#0369a1', ground: '#475569' },
    { name: 'Deep Space', top: '#020617', bottom: '#312e81', far: '#4338ca', near: '#1e1b4b', ground: '#1e293b' }
];
// value() reads this run's stats; missions stay until they're finished.
const MISSIONS = [
    { id: 'ride300', text: 'Ride 300m in one run', goal: 300, reward: 40, value: s => s.rider.distance },
    { id: 'mult3', text: 'Reach a ×3 multiplier', goal: 3, reward: 50, value: s => s.rider.bestMultiplier },
    { id: 'bumps5', text: 'Clear 5 bumps in one run', goal: 5, reward: 60, value: s => s.bumps },
    { id: 'coins25', text: 'Grab 25 coins in one run', goal: 25, reward: 50, value: s => s.coins },
    { id: 'zone20', text: 'Stay in the green zone for 20 seconds', goal: 20, reward: 70, value: s => s.rider.totalZoneTime },
    { id: 'mult5', text: 'Reach a ×5 multiplier', goal: 5, reward: 120, value: s => s.rider.bestMultiplier },
    { id: 'ride1000', text: 'Ride 1000m in one run', goal: 1000, reward: 150, value: s => s.rider.distance },
    { id: 'score5000', text: 'Score 5,000 in one run', goal: 5000, reward: 200, value: s => s.rider.score },
    { id: 'bumps20', text: 'Clear 20 bumps in one run', goal: 20, reward: 180, value: s => s.bumps }
];

// ---------- Saving ----------

function load() {
    const fresh = { best: 0, coins: 0, bike: 'ember', owned: ['ember'], upgrades: { engine: 0, grip: 0, magnet: 0 }, done: [], sound: true };
    try {
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (saved) return { ...fresh, ...saved, upgrades: { ...fresh.upgrades, ...saved.upgrades } };
    } catch (_) {}
    return fresh;
}
const save = load();
function store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
}
const activeMissions = () => MISSIONS.filter(m => !save.done.includes(m.id)).slice(0, 3);

// ---------- Sound ----------

const sound = {
    context: null, engine: null, gain: null,
    start() {
        if (this.context || !save.sound) return;
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.engine = this.context.createOscillator();
            this.gain = this.context.createGain();
            this.engine.type = 'sawtooth';
            this.gain.gain.value = 0;
            this.engine.connect(this.gain).connect(this.context.destination);
            this.engine.start();
        } catch (_) { this.context = null; }
    },
    run(speed, gas) {
        if (!this.context) return;
        this.engine.frequency.value = 45 + speed * 5 + (gas ? 22 : 0);
        this.gain.gain.value = save.sound ? 0.025 : 0;
    },
    silence() { if (this.gain) this.gain.gain.value = 0; },
    beep(freq, length) {
        if (!this.context || !save.sound) return;
        const tone = this.context.createOscillator(), gain = this.context.createGain();
        tone.frequency.value = freq;
        gain.gain.setValueAtTime(0.09, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + length);
        tone.connect(gain).connect(this.context.destination);
        tone.start();
        tone.stop(this.context.currentTime + length);
    }
};

// ---------- A run ----------

const input = { gas: false, brake: false, lock: false };
let state = null;        // the current ride
let screen = 'menu';     // menu, riding, paused or over

function newRun(startLocked) {
    input.gas = input.brake = false;
    input.lock = !!startLocked;
    state = {
        rider: P.newRider(save.upgrades),
        coins: 0, bumps: 0, things: [], nextThing: 45, nextBump: FIRST_BUMP,
        theme: 0, messageUntil: 0, doneThisRun: [], taught: false, shake: 0
    };
    $('lockBtn').classList.toggle('on', input.lock);
    show('riding');
    say(input.lock ? 'Cruise mode: enjoy the ride' : 'Hold GAS to lift your wheel!', 2200);
    sound.start();
}

// Lays out the road ahead: rows and arcs of coins, plus bumps that get closer together as you go.
function spawn() {
    const s = state, d = s.rider.distance, ahead = d + 60;
    while (s.nextThing < ahead) {
        const count = 4 + Math.floor(Math.random() * 5), arc = Math.random() < 0.5;
        for (let i = 0; i < count; i++) {
            const lift = arc ? Math.sin(i / (count - 1) * Math.PI) * 2.2 : 0.6;
            s.things.push({ type: 'coin', x: s.nextThing + i * 1.7, y: 0.9 + lift });
        }
        s.nextThing += 22 + Math.random() * 30;
    }
    while (s.nextBump < ahead) {
        s.things.push({ type: 'bump', x: s.nextBump });
        s.nextBump += Math.max(24, 62 - s.nextBump / 45) + Math.random() * 26;
    }
}

function collect() {
    const s = state, r = s.rider, front = r.distance + FRONT_REACH;
    const reach = 2 + MAGNET_RANGE * save.upgrades.magnet;
    s.things = s.things.filter(t => {
        if (t.type === 'coin') {
            if (t.x > r.distance - 1 && t.x < r.distance + reach) {
                s.coins++;
                sound.beep(980, 0.08);
                return false;
            }
        }
        else if (t.x <= front) {
            if (input.lock || r.angle >= P.CLEAR_ANGLE) {
                s.bumps++;
                if (!input.lock) { r.score += BUMP_REWARD * r.multiplier; say('+' + BUMP_REWARD * r.multiplier + ' cleared!', 700); }
            }
            else r.crashed = 'bump';
            return false;
        }
        return t.x > r.distance - 30;
    });
}

function checkMissions() {
    if (input.lock) return;
    for (const m of activeMissions()) {
        if (m.value(state) >= m.goal) {
            save.done.push(m.id);
            save.coins += m.reward;
            state.doneThisRun.push(m);
            store();
            sound.beep(1320, 0.3);
            say('Mission done! +' + m.reward + ' coins', 1500);
        }
    }
}

function endRun() {
    const s = state, r = s.rider;
    save.coins += s.coins;
    const newBest = r.score > save.best;
    if (newBest) save.best = Math.floor(r.score);
    store();
    sound.silence();
    sound.beep(120, 0.5);
    s.shake = 18;
    $('overTitle').textContent = r.crashed === 'flip' ? 'You flipped over!' : r.crashed === 'bump' ? 'You hit a bump!' : 'Nice ride!';
    $('overText').textContent = newBest && r.score > 0 ? '🏆 New best score!' :
        r.crashed === 'flip' ? 'Tap the brake to bring the front wheel down.' :
        r.crashed === 'bump' ? 'Keep your front wheel up to ride over bumps.' : '';
    $('overScore').textContent = Math.floor(r.score).toLocaleString();
    $('overDist').textContent = Math.floor(r.distance) + 'm';
    $('overCoins').textContent = '+' + s.coins;
    fillMissions($('overMissions'), s.doneThisRun);
    show('over');
}

// ---------- Screens ----------

function show(name) {
    screen = name;
    const riding = name === 'riding';
    $('menu').classList.toggle('hidden', name !== 'menu');
    $('garage').classList.toggle('hidden', name !== 'garage');
    $('paused').classList.toggle('hidden', name !== 'paused');
    $('over').classList.toggle('hidden', name !== 'over');
    $('hud').classList.toggle('hidden', !riding);
    $('mission').classList.toggle('hidden', !riding);
    $('gasBtn').classList.toggle('hidden', !riding || input.lock);
    $('brakeBtn').classList.toggle('hidden', !riding || input.lock);
    if (!riding) { input.gas = input.brake = false; sound.silence(); }
    $('gasBtn').classList.remove('down');
    $('brakeBtn').classList.remove('down');
    if (name === 'menu') fillMenu();
    if (name === 'garage') fillGarage();
    last = performance.now();
}

function fillMissions(list, finished) {
    list.textContent = '';
    finished.forEach(m => {
        const item = document.createElement('li');
        item.className = 'done';
        item.textContent = '✓ ' + m.text + ' (+' + m.reward + ')';
        list.appendChild(item);
    });
    activeMissions().forEach(m => {
        const item = document.createElement('li');
        item.textContent = '○ ' + m.text + ' (+' + m.reward + ')';
        list.appendChild(item);
    });
}

function fillMenu() {
    $('menuBest').textContent = save.best.toLocaleString();
    $('menuCoins').textContent = save.coins.toLocaleString();
    fillMissions($('menuMissions'), []);
}

function buyLine(title, about, buttonText, disabled, action, color) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    const text = document.createElement('div');
    const name = document.createElement('b');
    if (color) {
        const dot = document.createElement('span');
        dot.className = 'swatch';
        dot.style.background = color;
        name.appendChild(dot);
    }
    name.appendChild(document.createTextNode(title));
    const small = document.createElement('small');
    small.textContent = about;
    text.append(name, small);
    const button = document.createElement('button');
    button.textContent = buttonText;
    button.disabled = disabled;
    button.addEventListener('click', action);
    row.append(text, button);
    $('shop').appendChild(row);
}

function fillGarage() {
    $('garageCoins').textContent = save.coins.toLocaleString();
    $('shop').textContent = '';
    const pay = cost => { save.coins -= cost; store(); fillGarage(); };

    UPGRADES.forEach(u => {
        const level = save.upgrades[u.id], cost = u.costs[level];
        buyLine(u.name + ' (level ' + level + '/' + u.costs.length + ')', u.about,
            cost === undefined ? 'Maxed' : cost + ' coins', cost === undefined || save.coins < cost,
            () => { save.upgrades[u.id]++; pay(cost); });
    });
    BIKES.forEach(b => {
        const owned = save.owned.includes(b.id), riding = save.bike === b.id;
        buyLine(b.name, owned ? 'Your bike' : 'New paint job', riding ? 'Riding' : owned ? 'Ride' : b.cost + ' coins',
            riding || (!owned && save.coins < b.cost),
            () => {
                if (!owned) save.owned.push(b.id);
                save.bike = b.id;
                pay(owned ? 0 : b.cost);
            }, b.color);
    });
}

let messageTimer = 0;
function say(text, ms) {
    const box = $('message');
    box.textContent = text;
    box.classList.add('show');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => box.classList.remove('show'), ms);
}

function setLock(on) {
    input.lock = on;
    input.gas = input.brake = false;
    $('lockBtn').classList.toggle('on', on);
    $('gasBtn').classList.toggle('hidden', on);
    $('brakeBtn').classList.toggle('hidden', on);
    if (screen === 'riding') say(on ? '🔒 Locked: just cruise' : 'You’re in control!', 1200);
}

function pause() { if (screen === 'riding') show('paused'); }

// ---------- Drawing ----------

const canvas = $('game'), ctx = canvas.getContext('2d');
let viewWidth = 960, scale = 1;

function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    scale = canvas.height / VIEW_HEIGHT;
    viewWidth = canvas.width / scale;
}

function skyline(colour, spacing, height, speed, offset) {
    ctx.fillStyle = colour;
    const shift = (offset * speed) % spacing;
    for (let x = -spacing - shift, i = Math.floor(offset * speed / spacing); x < viewWidth + spacing; x += spacing, i++) {
        const tall = height * (0.55 + 0.45 * Math.abs(Math.sin(i * 12.9)));
        ctx.fillRect(x, 400 - tall, spacing * 0.72, tall);
    }
}

function drawWorld(distance, themeIndex) {
    const t = THEMES[themeIndex % THEMES.length];
    const sky = ctx.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, t.top);
    sky.addColorStop(1, t.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewWidth, VIEW_HEIGHT);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.arc(viewWidth * 0.78, 95, 40, 0, Math.PI * 2);
    ctx.fill();

    skyline(t.far, 90, 170, 5, distance);
    skyline(t.near, 130, 110, 12, distance);
    ctx.fillStyle = t.ground;
    ctx.fillRect(0, 400, viewWidth, 140);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let x = -(distance * PIXELS_PER_METRE % 110); x < viewWidth; x += 110) ctx.fillRect(x, 470, 58, 7);
}

function drawThings(s) {
    const bikeX = viewWidth * BIKE_X;
    for (const t of s.things) {
        const x = bikeX + (t.x - s.rider.distance) * PIXELS_PER_METRE;
        if (x < -40 || x > viewWidth + 40) continue;
        if (t.type === 'coin') {
            const y = 430 - t.y * PIXELS_PER_METRE;
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = '#a16207';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        else {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(x - 32, 432);
            ctx.quadraticCurveTo(x, 400, x + 32, 432);
            ctx.fill();
            ctx.fillStyle = '#1f2937';
            for (let i = -16; i <= 12; i += 14) ctx.fillRect(x + i, 418, 6, 12);
        }
    }
}

function wheel(x, y, radius, spin) {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        const a = spin + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * radius * 0.55, y - Math.sin(a) * radius * 0.55);
        ctx.lineTo(x + Math.cos(a) * radius * 0.55, y + Math.sin(a) * radius * 0.55);
        ctx.stroke();
    }
}

function drawBike(r) {
    const colour = (BIKES.find(b => b.id === save.bike) || BIKES[0]).color;
    const spin = r.distance * 2.4;
    const x = viewWidth * BIKE_X, y = 416;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-r.angle * Math.PI / 180);
    if (r.crashed) ctx.rotate(0.3);
    wheel(0, 0, 25, spin);
    wheel(82, 0, 25, spin);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(34, -24);
    ctx.lineTo(62, -30);
    ctx.lineTo(82, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(22, -44, 44, 20, 8);
    ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(0, -36, 36, 11, 5);
    ctx.fill();
    // Rider: stays more upright than the bike, leaning back into the wheelie
    ctx.rotate(r.angle * 0.45 * Math.PI / 180);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.roundRect(8, -86, 21, 50, 9);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(20, -74);
    ctx.lineTo(58, -48);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(19, -99, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(21, -104, 14, 7);
    ctx.restore();
}

// The balance gauge: an arc that shows where the bike is, with the green zone marked.
function drawGauge(r) {
    const cx = viewWidth / 2, cy = 150, radius = 62;
    // 0 degrees sits at the left of the arc and 120 at the right, going over the top.
    const toAngle = deg => Math.PI + (deg / 120) * Math.PI;
    const arc = (from, to, colour, width) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, toAngle(from), toAngle(to));
        ctx.stroke();
    };
    ctx.lineCap = 'butt';
    arc(0, 120, 'rgba(0,0,0,.45)', 15);
    arc(r.sweetLow, r.sweetHigh, '#22c55e', 15);
    arc(r.flip - 8, 120, '#ef4444', 15);
    const a = toAngle(Math.min(r.angle, 120));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
    ctx.lineTo(cx + Math.cos(a) * 74, cy + Math.sin(a) * 74);
    ctx.stroke();
}

function render() {
    const s = state;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (s && s.shake > 0) {
        ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
        s.shake *= 0.9;
    }
    if (!s) {
        const demo = { angle: 28 + Math.sin(performance.now() / 700) * 14, distance: performance.now() / 110, crashed: null };
        drawWorld(demo.distance, 0);
        drawBike(demo);
        return;
    }
    drawWorld(s.rider.distance, s.theme);
    drawThings(s);
    drawBike(s.rider);
    if (screen === 'riding' && !input.lock) drawGauge(s.rider);
}

function updateHud() {
    const s = state, r = s.rider;
    $('hudScore').textContent = Math.floor(r.score).toLocaleString();
    $('hudMult').textContent = input.lock ? '🔒' : '×' + r.multiplier;
    $('multStat').classList.toggle('hot', r.multiplier > 1);
    $('hudDist').textContent = Math.floor(r.distance) + 'm';
    $('hudCoins').textContent = s.coins;
    const m = activeMissions()[0];
    $('mission').textContent = input.lock ? 'Cruising: scores and missions are off. Coins still count.'
        : m ? m.text + ' (' + Math.floor(Math.min(m.value(s), m.goal)) + '/' + m.goal + ')' : 'All missions done!';
}

// ---------- Main loop ----------

let last = performance.now(), spare = 0;

function frame(now) {
    requestAnimationFrame(frame);
    const passed = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (screen === 'riding') {
        spare += passed;
        while (spare >= STEP) {
            P.step(state.rider, input, STEP);
            spare -= STEP;
        }
        spawn();
        collect();
        checkMissions();
        const theme = Math.floor(state.rider.distance / THEME_EVERY);
        if (theme !== state.theme) { state.theme = theme; say(THEMES[theme % THEMES.length].name, 1800); }
        sound.run(state.rider.speed, input.gas);
        updateHud();
        if (state.rider.crashed) endRun();
    }
    render();
}

// ---------- Controls ----------

function hold(button, key) {
    const set = (down, event) => {
        event.preventDefault();
        if (screen !== 'riding') return;
        input[key] = down;
        button.classList.toggle('down', down);
    };
    button.addEventListener('pointerdown', e => {
        set(true, e);
        // Keeps the press going if a thumb slides off the button. The game works without it.
        try { button.setPointerCapture(e.pointerId); } catch (_) {}
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, e => set(false, e)));
    button.addEventListener('contextmenu', e => e.preventDefault());
}
hold($('gasBtn'), 'gas');
hold($('brakeBtn'), 'brake');

const KEYS = { ArrowRight: 'gas', ArrowUp: 'gas', KeyD: 'gas', KeyW: 'gas', Space: 'gas', ArrowLeft: 'brake', ArrowDown: 'brake', KeyA: 'brake', KeyS: 'brake' };
function key(e, down) {
    if (down && e.code === 'KeyP') { if (screen === 'riding') pause(); else if (screen === 'paused') show('riding'); return; }
    if (down && e.code === 'KeyL' && screen === 'riding') { setLock(!input.lock); return; }
    const action = KEYS[e.code];
    if (!action) return;
    e.preventDefault();
    if (screen === 'riding' && !input.lock) {
        input[action] = down;
        $(action === 'gas' ? 'gasBtn' : 'brakeBtn').classList.toggle('down', down);
    }
}
addEventListener('keydown', e => key(e, true));
addEventListener('keyup', e => key(e, false));
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('resize', resize);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());

$('playBtn').addEventListener('click', () => newRun(false));
$('cruiseBtn').addEventListener('click', () => newRun(true));
$('againBtn').addEventListener('click', () => newRun(false));
$('garageBtn').addEventListener('click', () => show('garage'));
$('overGarage').addEventListener('click', () => show('garage'));
$('garageBack').addEventListener('click', () => show('menu'));
$('overMenu').addEventListener('click', () => show('menu'));
$('quitBtn').addEventListener('click', () => { save.coins += state.coins; store(); show('menu'); });
$('resumeBtn').addEventListener('click', () => show('riding'));
$('pauseBtn').addEventListener('click', pause);
$('lockBtn').addEventListener('click', () => setLock(!input.lock));
$('soundBtn').textContent = save.sound ? '🔊' : '🔇';
$('soundBtn').addEventListener('click', () => {
    save.sound = !save.sound;
    store();
    $('soundBtn').textContent = save.sound ? '🔊' : '🔇';
    if (save.sound) sound.start(); else sound.silence();
});

resize();
show('menu');
requestAnimationFrame(frame);
