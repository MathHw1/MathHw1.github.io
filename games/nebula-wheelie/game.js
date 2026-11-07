"use strict";

// Wheelie Life: an original wheelie game for Nebula Arcade. The bike's physics are in physics.js.
// This file handles the road, cash, boosts, missions, garage, drawing and controls.

const $ = id => document.getElementById(id);
const P = WheeliePhysics;
const STEP = 1 / 120;
const SAVE_KEY = 'wheelie-life-save';
const OLD_SAVE_KEY = 'nebula-wheelie-save';
const COINS_PER_DOLLAR = 10;       // old saves swap their coins for cash at this rate
const PIXELS_PER_METRE = 26;
const VIEW_HEIGHT = 540;           // the game is drawn in this many units tall, then scaled to the screen
const BIKE_X = 0.27;               // where the bike sits across the screen
const FRONT_REACH = 1.4;           // metres from the rider to the front wheel
const THEME_EVERY = 400;           // metres between scenery changes
const FIRST_OBSTACLE = 90;         // gives new riders time to learn the wheelie
const CLEAR_REWARD = 50;
const LOOK_AHEAD = 70;             // metres of road laid out in front of you
const INK = '#14161f';             // the thick cartoon outline colour

// Cash floats at a set height, so you have to ride at the right angle to reach it.
const CASH_HIGH_ANGLE = 62;        // high bills need the wheel at least this far up
const CASH_LOW_ANGLE = 38;         // low bills need it at most this far up
const MAGNET_ANGLE = 6;            // each Cash Magnet level makes those heights easier
const DOUBLE_CASH_METRES = 300;
const NITRO_METRES = 200;

const VEHICLES = [
    { id: 'dirt', kind: 'bike', name: 'Dirt Bike', cost: 0, color: '#f97316', about: 'Your first ride.' },
    { id: 'street', kind: 'bike', name: 'Street Bike', cost: 400, color: '#2563eb', about: 'Faster, with 10% more points.', torque: 1.05, speed: 3, score: 1.1 },
    { id: 'chopper', kind: 'bike', name: 'Chopper', cost: 900, color: '#a21caf', about: 'Heavy and steady. Hard to flip.', torque: 0.97, flip: 6, zone: 3, score: 1.15 },
    { id: 'rocket', kind: 'bike', name: 'Rocket Bike', cost: 2000, color: '#dc2626', about: 'Very fast, with 25% more points.', torque: 1.12, speed: 6, score: 1.25 },
    { id: 'muscle', kind: 'car', name: 'Muscle Car', cost: 3500, color: '#eab308', about: 'A car on its back wheels! 40% more points.', torque: 1.05, flip: 8, zone: 4, speed: 3, score: 1.4 },
    { id: 'monster', kind: 'truck', name: 'Monster Truck', cost: 7500, color: '#16a34a', about: 'The steadiest ride, with 75% more points.', torque: 1.02, flip: 10, zone: 6, speed: 2, score: 1.75 }
];
const UPGRADES = [
    { id: 'engine', name: 'Engine', about: 'Lifts the front wheel faster.', costs: [150, 400, 900] },
    { id: 'grip', name: 'Balance', about: 'Wider green zone and harder to flip.', costs: [200, 500, 1100] },
    { id: 'magnet', name: 'Cash Magnet', about: 'Makes floating cash easier to reach.', costs: [120, 350, 800] }
];
// Bought in the garage, then used up automatically at the start of your next run.
const START_BOOSTS = [
    { id: 'shield', name: 'Shield', about: 'Saves you from one crash.', cost: 75 },
    { id: 'nitro', name: 'Nitro Start', about: 'Double points for your first 200m.', cost: 50 }
];
const THEMES = [
    { name: 'Ocean Drive', top: '#4cc4f4', bottom: '#b9ecfb', sea: '#1aa7d8', far: '#37b6e0', near: '#1787b5', ground: '#4a5060' },
    { name: 'Sunset Boulevard', top: '#ff7e5f', bottom: '#feb47b', sea: '#d9694e', far: '#c8553d', near: '#7a3b4e', ground: '#3a3f55' },
    { name: 'Neon City', top: '#120458', bottom: '#7a04eb', sea: '#3b0aa8', far: '#2d0a6b', near: '#ff2a6d', ground: '#1a1a2e' },
    { name: 'Deep Space', top: '#020617', bottom: '#312e81', sea: '#1e1b4b', far: '#4338ca', near: '#1e1b4b', ground: '#1e293b' }
];
// value() reads this run's stats; missions stay until they're finished.
const MISSIONS = [
    { id: 'ride300', text: 'Ride 300m in one run', goal: 300, reward: 40, value: s => s.rider.distance },
    { id: 'mult3', text: 'Reach a ×3 multiplier', goal: 3, reward: 50, value: s => s.rider.bestMultiplier },
    { id: 'clear5', text: 'Clear 5 barriers or beams in one run', goal: 5, reward: 75, value: s => s.cleared },
    { id: 'cash20', text: 'Grab $20 in one run', goal: 20, reward: 60, value: s => s.cash },
    { id: 'zone20', text: 'Stay in the green zone for 20 seconds', goal: 20, reward: 90, value: s => s.rider.totalZoneTime },
    { id: 'mult5', text: 'Reach a ×5 multiplier', goal: 5, reward: 150, value: s => s.rider.bestMultiplier },
    { id: 'ride1000', text: 'Ride 1000m in one run', goal: 1000, reward: 200, value: s => s.rider.distance },
    { id: 'score5000', text: 'Score 5,000 in one run', goal: 5000, reward: 250, value: s => s.rider.score },
    { id: 'clear20', text: 'Clear 20 barriers or beams in one run', goal: 20, reward: 300, value: s => s.cleared },
    { id: 'ride3000', text: 'Ride 3000m in one run', goal: 3000, reward: 800, value: s => s.rider.distance }
];

// ---------- Saving ----------

function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

function load() {
    const fresh = { best: 0, cash: 0, vehicle: 'dirt', owned: ['dirt'], upgrades: { engine: 0, grip: 0, magnet: 0 }, boosts: { shield: 0, nitro: 0 }, done: [], sound: true };
    const saved = readJson(SAVE_KEY);
    if (saved) return { ...fresh, ...saved, upgrades: { ...fresh.upgrades, ...saved.upgrades }, boosts: { ...fresh.boosts, ...saved.boosts } };

    // Players from before cash keep their score and upgrades, and their coins become cash.
    const old = readJson(OLD_SAVE_KEY);
    if (old) return { ...fresh, best: old.best || 0, cash: Math.floor((old.coins || 0) / COINS_PER_DOLLAR), upgrades: { ...fresh.upgrades, ...old.upgrades }, sound: old.sound !== false };
    return fresh;
}
const save = load();
function store() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
}
const activeMissions = () => MISSIONS.filter(m => !save.done.includes(m.id)).slice(0, 3);
const myVehicle = () => VEHICLES.find(v => v.id === save.vehicle) || VEHICLES[0];
const money = n => '$' + Math.floor(n).toLocaleString();

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

const input = { gas: false, brake: false };
let state = null;        // the current ride
let screen = 'menu';     // menu, riding, paused or over

function newRun() {
    input.gas = input.brake = false;
    const rider = P.newRider(myVehicle(), save.upgrades);
    if (save.boosts.shield > 0) { save.boosts.shield--; rider.shields = 1; }
    if (save.boosts.nitro > 0) { save.boosts.nitro--; rider.nitroUntil = NITRO_METRES; }
    store();
    state = {
        rider, cash: 0, cleared: 0, things: [], nextCash: 60, nextObstacle: FIRST_OBSTACLE, nextPower: 180,
        theme: 0, doneThisRun: [], shake: 0, cashDoubleUntil: 0
    };
    show('riding');
    say('Hold GAS! Don’t let the wheel touch down', 2400);
    sound.start();
}

// Lays out the road ahead. Obstacles get closer together, but cash stays rare.
function spawn() {
    const s = state, ahead = s.rider.distance + LOOK_AHEAD;
    while (s.nextObstacle < ahead) {
        const types = s.nextObstacle < 250 ? ['barrier', 'beam'] : Object.keys(P.OBSTACLES);
        s.things.push({ kind: 'obstacle', type: types[Math.floor(Math.random() * types.length)], x: s.nextObstacle });
        s.nextObstacle += Math.max(30, 70 - s.nextObstacle / 40) + Math.random() * 26;
    }
    while (s.nextCash < ahead) {
        const high = Math.random() < 0.5, roll = Math.random();
        s.things.push({ kind: 'cash', high, x: s.nextCash, value: roll < 0.08 ? 25 : roll < 0.4 ? 10 : 5 });
        s.nextCash += 90 + Math.random() * 90;
    }
    while (s.nextPower < ahead) {
        const type = ['shield', 'nitro', 'double'][Math.floor(Math.random() * 3)];
        s.things.push({ kind: 'power', type, x: s.nextPower });
        s.nextPower += 240 + Math.random() * 220;
    }
}

function grabCash(t) {
    const s = state, r = s.rider, help = MAGNET_ANGLE * save.upgrades.magnet;
    if (t.high ? r.angle < CASH_HIGH_ANGLE - help : r.angle > CASH_LOW_ANGLE + help) return;
    const value = t.value * (r.distance < s.cashDoubleUntil ? 2 : 1);
    s.cash += value;
    say('+' + money(value), 700);
    sound.beep(980, 0.1);
}

function grabPower(t) {
    const s = state, r = s.rider;
    if (t.type === 'shield') { r.shields++; say('🛡️ Shield ready!', 1000); }
    if (t.type === 'nitro') { r.nitroUntil = r.distance + NITRO_METRES; say('🔥 Nitro! Double points', 1000); }
    if (t.type === 'double') { s.cashDoubleUntil = r.distance + DOUBLE_CASH_METRES; say('💵 Double cash!', 1000); }
    sound.beep(1200, 0.2);
}

function meetThings() {
    const s = state, r = s.rider, front = r.distance + FRONT_REACH;
    s.things = s.things.filter(t => {
        if (t.kind === 'obstacle' && !t.warned && t.x - front < r.speed * 1.6) {
            t.warned = true;
            say(P.OBSTACLES[t.type].hint, 900);
        }
        if (t.x > front) return true;
        if (t.kind === 'cash') grabCash(t);
        else if (t.kind === 'power') grabPower(t);
        else {
            const needsSkill = t.type === 'barrier' || t.type === 'beam';
            if (P.meetObstacle(r, t.type) && needsSkill && !r.crashed) {
                s.cleared++;
                r.score += CLEAR_REWARD * r.multiplier;
                say('+' + CLEAR_REWARD * r.multiplier + ' cleared!', 600);
            }
        }
        return false;
    });
}

function checkMissions() {
    for (const m of activeMissions()) {
        if (m.value(state) >= m.goal) {
            save.done.push(m.id);
            save.cash += m.reward;
            state.doneThisRun.push(m);
            store();
            sound.beep(1320, 0.3);
            say('Mission done! +' + money(m.reward), 1500);
        }
    }
}

const CRASH_TEXT = {
    ground: ['Your wheel hit the ground!', 'Keep the gas on and don’t let the front wheel touch down.'],
    flip: ['You flipped over!', 'Tap the brake to bring the front wheel down.'],
    stall: ['You never lifted the wheel!', 'Hold GAS right away to get into a wheelie.'],
    barrier: ['You hit a barrier!', 'Get your wheel high before you reach a barrier.'],
    beam: ['You hit a low beam!', 'Bring your wheel down to fit under a beam.']
};

function endRun() {
    const s = state, r = s.rider, text = CRASH_TEXT[r.crashed] || CRASH_TEXT.ground;
    save.cash += s.cash;
    const newBest = r.score > save.best;
    if (newBest) save.best = Math.floor(r.score);
    store();
    sound.silence();
    sound.beep(120, 0.5);
    s.shake = 18;
    $('overTitle').textContent = text[0];
    $('overText').textContent = newBest && r.score > 0 ? '🏆 New best score!' : text[1];
    $('overScore').textContent = Math.floor(r.score).toLocaleString();
    $('overDist').textContent = Math.floor(r.distance) + 'm';
    $('overCash').textContent = '+' + money(s.cash);
    fillMissions($('overMissions'), s.doneThisRun);
    show('over');
}

// ---------- Screens ----------

function show(name) {
    screen = name;
    const riding = name === 'riding';
    for (const id of ['menu', 'garage', 'paused', 'over']) $(id).classList.toggle('hidden', name !== id);
    for (const id of ['hud', 'mission', 'gasBtn', 'brakeBtn', 'boostChips']) $(id).classList.toggle('hidden', !riding);
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
        item.textContent = '✓ ' + m.text + ' (+' + money(m.reward) + ')';
        list.appendChild(item);
    });
    activeMissions().forEach(m => {
        const item = document.createElement('li');
        item.textContent = '○ ' + m.text + ' (+' + money(m.reward) + ')';
        list.appendChild(item);
    });
}

function fillMenu() {
    $('menuBest').textContent = save.best.toLocaleString();
    $('menuCash').textContent = money(save.cash);
    $('menuRide').textContent = myVehicle().name;
    fillMissions($('menuMissions'), []);
}

function shopHeading(text) {
    const heading = document.createElement('h3');
    heading.textContent = text;
    $('shop').appendChild(heading);
}

function shopLine(title, about, buttonText, disabled, action, color) {
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
    $('garageCash').textContent = money(save.cash);
    $('shop').textContent = '';
    const pay = cost => { save.cash -= cost; store(); fillGarage(); };

    shopHeading('Vehicles');
    VEHICLES.forEach(v => {
        const owned = save.owned.includes(v.id), riding = save.vehicle === v.id;
        shopLine(v.name, v.about, riding ? 'Riding' : owned ? 'Ride' : money(v.cost), riding || (!owned && save.cash < v.cost), () => {
            if (!owned) save.owned.push(v.id);
            save.vehicle = v.id;
            pay(owned ? 0 : v.cost);
        }, v.color);
    });

    shopHeading('Upgrades');
    UPGRADES.forEach(u => {
        const level = save.upgrades[u.id], cost = u.costs[level];
        shopLine(u.name + ' (level ' + level + '/' + u.costs.length + ')', u.about,
            cost === undefined ? 'Maxed' : money(cost), cost === undefined || save.cash < cost,
            () => { save.upgrades[u.id]++; pay(cost); });
    });

    shopHeading('Boosts for your next run');
    START_BOOSTS.forEach(b => {
        shopLine(b.name + ' (you have ' + save.boosts[b.id] + ')', b.about, money(b.cost), save.cash < b.cost,
            () => { save.boosts[b.id]++; pay(b.cost); });
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

// Draws a filled shape with the thick cartoon outline from the Wheelie Life picture.
function shape(fill, outline, draw) {
    ctx.beginPath();
    draw();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (outline) { ctx.strokeStyle = INK; ctx.lineWidth = outline; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
const circle = (x, y, r) => ctx.arc(x, y, r, 0, Math.PI * 2);
const line = (points) => points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));

function drawWorld(distance, themeIndex) {
    const t = THEMES[themeIndex % THEMES.length];
    const sky = ctx.createLinearGradient(0, 0, 0, 290);
    sky.addColorStop(0, t.top);
    sky.addColorStop(1, t.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewWidth, VIEW_HEIGHT);

    // Sea with a far island, then the guard rail and road, like the picture
    ctx.fillStyle = t.far;
    const island = (distance * 3) % (viewWidth + 400);
    ctx.beginPath();
    ctx.ellipse(viewWidth + 200 - island, 292, 180, 30, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = t.sea;
    ctx.fillRect(0, 290, viewWidth, 65);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = -((distance * 6) % 170); x < viewWidth; x += 170) ctx.fillRect(x, 318, 62, 4);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 355, viewWidth, 12);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 372, viewWidth, 9);
    ctx.fillStyle = INK;
    for (let x = -(distance * PIXELS_PER_METRE % 150); x < viewWidth; x += 150) ctx.fillRect(x, 352, 9, 48);
    ctx.fillRect(0, 353, viewWidth, 3);
    ctx.fillRect(0, 367, viewWidth, 3);

    ctx.fillStyle = t.ground;
    ctx.fillRect(0, 400, viewWidth, 140);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 398, viewWidth, 4);
    ctx.fillStyle = '#facc15';
    for (let x = -(distance * PIXELS_PER_METRE % 110); x < viewWidth; x += 110) ctx.fillRect(x, 482, 60, 7);
}

function drawObstacle(t, x) {
    const road = 442;
    if (t.type === 'barrier') {
        shape('#fff', 4, () => ctx.rect(x - 8, road - 54, 18, 54));
        ctx.fillStyle = '#dc2626';
        for (let y = road - 50; y < road - 4; y += 18) ctx.fillRect(x - 6, y, 14, 9);
        shape('#facc15', 4, () => ctx.rect(x - 24, road - 8, 50, 8));
    }
    else if (t.type === 'beam') {
        shape('#6b7280', 4, () => ctx.rect(x - 8, 215, 16, road - 215));
        shape('#f59e0b', 5, () => ctx.rect(x - 70, 305, 140, 28));
        ctx.fillStyle = INK;
        for (let i = -56; i < 60; i += 34) {
            ctx.beginPath();
            line([[x + i, 307], [x + i + 14, 307], [x + i + 2, 331], [x + i - 12, 331]]);
            ctx.fill();
        }
    }
    else if (t.type === 'pothole') {
        shape('#0b0d14', 4, () => ctx.ellipse(x, road + 1, 34, 9, 0, 0, Math.PI * 2));
    }
    else if (t.type === 'crack') {
        shape(null, 6, () => line([[x - 26, road - 2], [x - 12, road + 6], [x - 4, road - 3], [x + 8, road + 8], [x + 24, road]]));
    }
    else {
        ctx.fillStyle = 'rgba(8,9,14,.9)';
        ctx.beginPath();
        ctx.ellipse(x + 60, road + 3, 112, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(147,51,234,.55)';
        ctx.beginPath();
        ctx.ellipse(x + 40, road + 1, 34, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCash(t, x) {
    const y = t.high ? 300 : 352;
    shape('#22c55e', 4, () => ctx.roundRect(x - 27, y - 15, 54, 30, 4));
    ctx.fillStyle = '#dcfce7';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$' + t.value, x, y + 1);
}

function drawPower(t, x) {
    const icon = { shield: '🛡️', nitro: '🔥', double: '💵' }[t.type];
    shape('rgba(255,255,255,.85)', 4, () => circle(x, 322, 25));
    ctx.font = '27px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, 324);
}

function drawThings(s) {
    const bikeX = viewWidth * BIKE_X;
    for (const t of s.things) {
        const x = bikeX + (t.x - s.rider.distance) * PIXELS_PER_METRE;
        if (x < -130 || x > viewWidth + 130) continue;
        if (t.kind === 'cash') drawCash(t, x);
        else if (t.kind === 'power') drawPower(t, x);
        else drawObstacle(t, x);
    }
}

function wheel(x, y, radius, spin, big) {
    shape('#1c1f2b', 5, () => circle(x, y, radius));
    ctx.fillStyle = INK;
    for (let i = 0; i < (big ? 12 : 16); i++) {      // chunky tyre knobs
        const a = spin + i * Math.PI * 2 / (big ? 12 : 16);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * radius, y + Math.sin(a) * radius, big ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
    }
    shape('#d1d5db', 4, () => circle(x, y, radius * 0.56));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
        const a = spin + i * Math.PI / 4;
        ctx.beginPath();
        line([[x - Math.cos(a) * radius * 0.56, y - Math.sin(a) * radius * 0.56], [x + Math.cos(a) * radius * 0.56, y + Math.sin(a) * radius * 0.56]]);
        ctx.stroke();
    }
    shape('#f97316', 3, () => circle(x, y, radius * 0.16));
}

function drawRider(color, x, y) {
    // Black pants and boots
    shape(null, 16, () => line([[x + 2, y + 2], [x + 22, y + 26], [x + 34, y + 40]]));
    ctx.strokeStyle = '#2b2f3d';
    ctx.lineWidth = 10;
    ctx.beginPath();
    line([[x + 2, y + 2], [x + 22, y + 26], [x + 34, y + 40]]);
    ctx.stroke();
    shape('#fff', 4, () => ctx.roundRect(x + 24, y + 36, 26, 13, 4));

    // White jersey with a coloured stripe
    shape('#f8fafc', 5, () => ctx.roundRect(x - 13, y - 52, 29, 58, 12));
    ctx.fillStyle = color;
    ctx.fillRect(x - 10, y - 26, 24, 8);

    // Arm reaching to the bars
    shape(null, 13, () => line([[x + 3, y - 42], [x + 26, y - 28], [x + 46, y - 34]]));
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.beginPath();
    line([[x + 3, y - 42], [x + 26, y - 28], [x + 46, y - 34]]);
    ctx.stroke();
    shape(INK, 0, () => circle(x + 47, y - 34, 6));

    // Black helmet with a visor and peak
    shape('#1c1f2b', 5, () => circle(x + 5, y - 70, 20));
    shape('#7dd3fc', 3, () => ctx.roundRect(x + 8, y - 77, 17, 11, 4));
    shape('#1c1f2b', 4, () => line([[x + 8, y - 88], [x + 34, y - 86], [x + 28, y - 80], [x + 6, y - 80]]));
    shape(color, 0, () => ctx.rect(x - 11, y - 72, 11, 5));
}

function drawDirtBike(color, spin) {
    wheel(0, 0, 29, spin);
    wheel(96, 0, 29, spin);
    shape(null, 13, () => line([[0, 0], [34, -26]]));                 // swing arm
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 6;
    ctx.beginPath();
    line([[0, 0], [34, -26]]);
    ctx.stroke();
    shape(null, 13, () => line([[96, 0], [70, -54]]));                // long front forks
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 6;
    ctx.beginPath();
    line([[96, 0], [70, -54]]);
    ctx.stroke();
    shape('#1c1f2b', 4, () => ctx.roundRect(30, -32, 34, 26, 6));      // engine
    shape(color, 5, () => line([[-22, -36], [18, -28], [36, -48], [74, -50], [64, -26], [34, -14], [8, -22]]));   // body
    ctx.closePath();
    shape('#fff', 4, () => line([[10, -39], [32, -46], [42, -36], [18, -28]]));                                   // number panel
    shape('#1c1f2b', 4, () => ctx.roundRect(-6, -48, 44, 11, 5));      // seat
    shape(color, 4, () => line([[66, -40], [112, -42], [100, -30], [76, -30]]));                                  // front fender
    shape(null, 7, () => line([[68, -56], [62, -66], [76, -68]]));     // handlebars
}

function drawCar(color, spin, truck) {
    const r = truck ? 40 : 26, lift = truck ? 26 : 8, length = truck ? 126 : 128;
    wheel(0, 0, r, spin, truck);
    wheel(length, 0, r, spin, truck);
    shape(color, 5, () => ctx.roundRect(-34, -40 - lift, length + 68, 38, 12));
    shape(color, 5, () => ctx.roundRect(4, -74 - lift, 92, 40, 16));
    shape('#7dd3fc', 4, () => ctx.roundRect(50, -68 - lift, 38, 26, 6));
    shape('#7dd3fc', 4, () => ctx.roundRect(12, -68 - lift, 32, 26, 6));
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(-24, -22 - lift, length + 48, 6);
    shape('#fde047', 3, () => circle(length + 28, -24 - lift, 7));
    shape('#1c1f2b', 3, () => circle(30, -56 - lift, 11));             // the driver's helmet
}

function drawVehicle(r, distance, vehicle) {
    const spin = distance * 2.4;
    const x = viewWidth * BIKE_X - 36, y = 413 + (vehicle.kind === 'truck' ? -11 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(r.angle + (r.crashed ? 18 : 0)) * Math.PI / 180);
    if (vehicle.kind === 'bike') {
        drawDirtBike(vehicle.color, spin);
        ctx.rotate(Math.min(r.angle, 80) * 0.55 * Math.PI / 180);      // the rider leans forward against the lift
        drawRider(vehicle.color, 24, -56);
    }
    else drawCar(vehicle.color, spin, vehicle.kind === 'truck');
    ctx.restore();
}

// The balance gauge: an arc that shows where the wheel is, with the green zone marked.
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
    arc(0, 120, 'rgba(0,0,0,.5)', 15);
    arc(0, 12, '#ef4444', 15);
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
        const distance = performance.now() / 110;
        drawWorld(distance, 0);
        drawVehicle({ angle: 42 + Math.sin(performance.now() / 700) * 12 }, distance, myVehicle());
        return;
    }
    drawWorld(s.rider.distance, s.theme);
    drawThings(s);
    drawVehicle(s.rider, s.rider.distance, myVehicle());
    if (screen === 'riding') drawGauge(s.rider);
}

function updateHud() {
    const s = state, r = s.rider;
    $('hudScore').textContent = Math.floor(r.score).toLocaleString();
    $('hudMult').textContent = '×' + r.multiplier;
    $('multStat').classList.toggle('hot', r.multiplier > 1);
    $('hudDist').textContent = Math.floor(r.distance) + 'm';
    $('hudCash').textContent = money(s.cash);
    const m = activeMissions()[0];
    $('mission').textContent = m ? m.text + ' (' + Math.floor(Math.min(m.value(s), m.goal)) + '/' + m.goal + ')' : 'All missions done!';
    const chips = [];
    if (r.shields > 0) chips.push('🛡️ ×' + r.shields);
    if (r.distance < r.nitroUntil) chips.push('🔥 ' + Math.ceil(r.nitroUntil - r.distance) + 'm');
    if (r.distance < s.cashDoubleUntil) chips.push('💵 ' + Math.ceil(s.cashDoubleUntil - r.distance) + 'm');
    if (r.distance < r.oilUntil) chips.push('🛢️ Oil!');
    $('boostChips').textContent = chips.join('   ');
}

// ---------- Main loop ----------

let last = performance.now(), spare = 0;

function frame(now) {
    requestAnimationFrame(frame);
    const passed = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (screen === 'riding') {
        const r = state.rider;
        spare += passed;
        while (spare >= STEP) {
            P.step(r, input, STEP);
            spare -= STEP;
        }
        if (r.shieldUsed !== undefined && r.time - r.shieldUsed < passed + STEP) say('🛡️ Shield saved you!', 1100);
        spawn();
        meetThings();
        checkMissions();
        const theme = Math.floor(r.distance / THEME_EVERY);
        if (theme !== state.theme) { state.theme = theme; say(THEMES[theme % THEMES.length].name, 1800); }
        sound.run(r.speed, input.gas);
        updateHud();
        if (r.crashed) endRun();
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
    const action = KEYS[e.code];
    if (!action) return;
    e.preventDefault();
    if (screen === 'riding') {
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

$('playBtn').addEventListener('click', newRun);
$('againBtn').addEventListener('click', newRun);
$('garageBtn').addEventListener('click', () => show('garage'));
$('overGarage').addEventListener('click', () => show('garage'));
$('garageBack').addEventListener('click', () => show('menu'));
$('overMenu').addEventListener('click', () => show('menu'));
$('quitBtn').addEventListener('click', () => { save.cash += state.cash; store(); state = null; show('menu'); });
$('resumeBtn').addEventListener('click', () => show('riding'));
$('pauseBtn').addEventListener('click', pause);
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
