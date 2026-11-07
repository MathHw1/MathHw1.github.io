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

const COUNTDOWN_SECONDS = 3;
const GHOST_SEND_SECONDS = 0.1;
const GHOST_SHIFT = 46;            // pixels the ghost sits behind you when you're level
const GHOST_MOST_BEHIND = 40;      // how far the ghost can drift from that spot, so it stays on screen
const GHOST_MOST_AHEAD = 30;       // and it never rides out in front of you, where it would hide the road
const GHOST_SPACING = 30;           // each extra ghost sits this much further back
const LEADERBOARD_GAME = 'wheelie';
const THUMB_KEY = 'wheelie_life_thumb';
const THUMB_SECONDS = 1.5;         // how far into a ride the arcade card's picture is taken
const RACE_GAME_OVER_SECONDS = 1.5;

const METRES_PER_MILE = 1609.344;
const MPH_PER_METRE_SECOND = 2.237;
const LEVEL_METRES = 300;
const LEVEL_NAMES = ['Easy', 'Medium', 'Hard', 'Extreme'];
const MOVING_FROM_LEVEL = 4;       // barriers start rolling towards you
const SWAPPING_FROM_LEVEL = 7;     // obstacles change at the last moment
const PAIRS_FROM_LEVEL = 10;       // two obstacles back to back
const SWAP_SECONDS = 1.05;         // how far ahead a swap happens
const DRIFT_SPEED = 4;
const SURGE_METRES = 180;
const PLOW_METRES = 280;
const CRASH_SHOW_SECONDS = 1.4;    // the rider tumbles this long before the results come up

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
    NebulaProfile.setStats('wheelie', { save });
}
const activeMissions = () => MISSIONS.filter(m => !save.done.includes(m.id)).slice(0, 3);
const myVehicle = () => VEHICLES.find(v => v.id === save.vehicle) || VEHICLES[0];
const money = n => '$' + Math.floor(n).toLocaleString();
const miles = metres => (metres / METRES_PER_MILE).toFixed(2) + ' mi';

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
let screen = 'menu';     // menu, race, board, riding, crashing, paused or over

// Gives the same numbers from the same seed, so both racers get the exact same road.
function seededRandom(seed) {
    let n = seed >>> 0;
    return () => {
        n = (n + 0x6D2B79F5) >>> 0;
        let t = n;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const newSeed = () => Math.floor(Math.random() * 4294967296);

function newRun(seed) {
    if (typeof seed !== 'number') { seed = newSeed(); race.leave(); }
    input.gas = input.brake = false;
    const rider = P.newRider(myVehicle(), save.upgrades);
    if (save.boosts.shield > 0) { save.boosts.shield--; rider.shields = 1; }
    if (save.boosts.nitro > 0) { save.boosts.nitro--; rider.nitroUntil = NITRO_METRES; }
    store();
    state = {
        rider, cash: 0, cleared: 0, things: [], nextCash: 60, nextObstacle: FIRST_OBSTACLE, nextPower: 180,
        theme: 0, doneThisRun: [], shake: 0, cashDoubleUntil: 0,
        countdown: race.on ? COUNTDOWN_SECONDS : 0, sendIn: 0, seed,
        // Each kind of thing gets its own numbers, so they stay matched between two players
        // however much of the road each one has reached.
        roll: { obstacle: seededRandom(seed), cash: seededRandom(seed + 1), power: seededRandom(seed + 2) },
        level: 1, flash: 0, mileMs: 0, rig: newRig(), bits: [], ragdoll: null, wreck: null, crashFor: 0
    };
    show('riding');
    if (!race.on) say('Hold GAS! Don’t let the wheel touch down', 2400);
    sound.start();
}

// Lays out the road ahead. Obstacles get closer together, but cash stays rare.
function spawn() {
    const s = state, ahead = s.rider.distance + LOOK_AHEAD;
    while (s.nextObstacle < ahead) {
        const level = levelAt(s.nextObstacle);
        const types = s.nextObstacle < 250 ? ['barrier', 'beam'] : Object.keys(P.OBSTACLES);
        const thing = { kind: 'obstacle', type: types[Math.floor(s.roll.obstacle() * types.length)], x: s.nextObstacle };
        const trick = s.roll.obstacle(), blocks = thing.type === 'barrier' || thing.type === 'beam';
        if (blocks && level >= SWAPPING_FROM_LEVEL && trick < 0.3) thing.swaps = true;
        else if (thing.type === 'barrier' && level >= MOVING_FROM_LEVEL && trick < 0.65) thing.drifts = true;
        s.things.push(thing);
        if (blocks && level >= PAIRS_FROM_LEVEL) {
            s.nextObstacle += 26;
            s.things.push({ kind: 'obstacle', type: thing.type === 'barrier' ? 'beam' : 'barrier', x: s.nextObstacle });
        }
        s.nextObstacle += obstacleGap(level) + s.roll.obstacle() * obstacleGap(level) * 0.4;
    }
    while (s.nextCash < ahead) {
        const high = s.roll.cash() < 0.5, roll = s.roll.cash();
        s.things.push({ kind: 'cash', high, x: s.nextCash, value: roll < 0.08 ? 25 : roll < 0.4 ? 10 : 5 });
        s.nextCash += 90 + s.roll.cash() * 90;
    }
    while (s.nextPower < ahead) {
        const type = ['shield', 'nitro', 'double', 'surge', 'plow'][Math.floor(s.roll.power() * 5)];
        s.things.push({ kind: 'power', type, x: s.nextPower });
        s.nextPower += 240 + s.roll.power() * 220;
    }
}

const levelAt = distance => 1 + Math.floor(distance / LEVEL_METRES);
const levelTier = level => Math.min(LEVEL_NAMES.length - 1, Math.floor((level - 1) / 3));

// Metres between obstacles: roomy at first, then shrinking faster and faster.
function obstacleGap(level) {
    if (level <= 3) return 76 - 5 * level;
    if (level <= 6) return 72 - 6 * level;
    if (level <= 9) return 60 - 4 * level;
    return Math.max(20, 26 * Math.pow(0.95, level - 10));
}

// Called as you reach each new level.
function setLevel(s, level) {
    const r = s.rider, grown = 0.5 * (Math.pow(1.22, level - 1) - 1);
    s.level = level;
    r.levelSpeed = Math.min(26, grown);
    r.levelPush = Math.min(3, 1 + 0.08 * (level - 1));
    if (level > 1) {
        say('Level ' + level + ': ' + LEVEL_NAMES[levelTier(level)] + '!', 1500);
        sound.beep(880, 0.25);
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
    if (t.type === 'surge') { r.surgeUntil = r.distance + SURGE_METRES; say('⚡ Speed boost!', 1000); }
    if (t.type === 'plow') { r.plowUntil = r.distance + PLOW_METRES; say('💥 Plow ready! Smash the barriers', 1200); }
    sound.beep(1200, 0.2);
}

// Pieces of a smashed barrier, flung off the plow.
function smash(x) {
    for (let i = 0; i < 14; i++) {
        state.bits.push({ x, y: 400 - Math.random() * 40, vx: 120 + Math.random() * 420, vy: -160 - Math.random() * 320, spin: Math.random() * 6, life: 1, color: i % 2 ? '#dc2626' : '#f8fafc' });
    }
}

function meetThings(passed) {
    const s = state, r = s.rider, front = r.distance + FRONT_REACH;
    s.things = s.things.filter(t => {
        if (t.drifts && t.x - front < 70) t.x -= DRIFT_SPEED * passed;
        if (t.swaps && t.x - front < r.speed * SWAP_SECONDS) {
            t.swaps = false;
            t.type = t.type === 'barrier' ? 'beam' : 'barrier';
            t.warned = false;
            s.flash = 1;
        }
        if (t.kind === 'obstacle' && !t.warned && t.x - front < r.speed * 1.6) {
            t.warned = true;
            say(P.OBSTACLES[t.type].hint, 900);
        }
        if (t.x > front) return true;
        if (t.kind === 'cash') grabCash(t);
        else if (t.kind === 'power') grabPower(t);
        else {
            const needsSkill = t.type === 'barrier' || t.type === 'beam', smashing = needsSkill && r.distance < r.plowUntil;
            if (P.meetObstacle(r, t.type) && needsSkill && !r.crashed) {
                s.cleared++;
                r.score += CLEAR_REWARD * r.multiplier;
                say(smashing ? '💥 Smashed!' : '+' + CLEAR_REWARD * r.multiplier + ' cleared!', 600);
                if (smashing) { smash(viewWidth * BIKE_X + FRONT_REACH * PIXELS_PER_METRE); s.shake = 8; sound.beep(160, 0.15); }
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
    startWipeout(s);
    $('overTitle').textContent = text[0];
    $('overText').textContent = newBest && r.score > 0 ? '🏆 New best score!' : text[1];
    $('overScore').textContent = Math.floor(r.score).toLocaleString();
    $('overDist').textContent = miles(r.distance);
    $('overCash').textContent = '+' + money(s.cash);
    $('overLevel').textContent = s.level;
    fillMissions($('overMissions'), s.doneThisRun);
    $('overRace').textContent = '';
    show('crashing');
    saveRun(s);
    race.finished(r);
}

// ---------- Leaderboard ----------

const NEW_STATS = { miles: 0, level: 1, mileMs: 0, runs: 0, wins: 0, losses: 0 };

function saveRun(s) {
    const r = s.rider, stats = NebulaProfile.stats('wheelie', NEW_STATS);
    const totalMiles = stats.miles + r.distance / METRES_PER_MILE;
    const fastest = s.mileMs && (!stats.mileMs || s.mileMs < stats.mileMs) ? s.mileMs : stats.mileMs;
    NebulaProfile.setStats('wheelie', { miles: totalMiles, level: Math.max(stats.level, s.level), mileMs: fastest, runs: stats.runs + 1 });

    const line = $('overRank');
    $('overSaveName').classList.add('hidden');
    line.textContent = '';
    const scored = NebulaScores.record('wheelie:score', r.score);
    if (s.level > stats.level) NebulaScores.record('wheelie:level', s.level);
    NebulaScores.record('wheelie:miles', totalMiles * 100);
    if (s.mileMs) NebulaScores.record('wheelie:time', s.mileMs);
    showRank(scored);
    if (r.score >= 1 && !NebulaProfile.name()) $('overSaveName').classList.remove('hidden');
}

function showRank(reply) {
    if (!reply) return;
    const line = $('overRank');
    reply.then(result => { line.textContent = '🏆 You’re #' + result.rank + ' on the leaderboard!'; })
        .catch(problem => { line.textContent = problem.message; });
}

// ---------- Racing friends ----------

const race = {
    lobby: null, on: false, racers: [], friends: new Map(), results: new Map(), resultsShown: false, saved: null,

    connect() {
        this.leave();
        this.lobby = new NebulaLobby('wheelie', {
            onWaiting: code => this.showLobby(code),
            onStart: () => {},
            onRoster: () => this.rosterChanged(),
            onMessage: msg => this.receive(msg),
            onStatus: text => {
                if (screen === 'race') raceMessage(text);
                else if (text) say(text, 2500);
            },
            onOpponentAway: () => {},
            onOpponentBack: () => {},
            onOpponentLeft: () => {},
            onResumed: () => this.resumed(),
            onResumeRefused: () => { this.leave(); raceReset(); show('menu'); },
            onKicked: () => {
                this.leave();
                raceReset();
                show('race');
                raceMessage('The host removed you from the lobby.');
            },
            onError: text => {
                if (screen === 'race') { raceMessage(text); raceReset(); }
                else say(text, 3000);
            }
        }, { manualStart: true, resumable: true });
    },

    // What's needed to put this rider back on the road after a reload.
    snapshot() {
        const s = state;
        if (!this.on || !s || s.wreck) return null;
        return { seed: s.seed, racers: this.racers, results: [...this.results], rider: s.rider, cash: s.cash, cleared: s.cleared, level: s.level, theme: s.theme, mileMs: s.mileMs, cashDoubleUntil: s.cashDoubleUntil };
    },

    // Runs when the page opens, in case a reload or closed tab left a race behind.
    tryResume() {
        const saved = NebulaLobby.savedSession('wheelie');
        if (!saved) return;
        this.connect();
        this.saved = saved.data;
        show('race');
        this.showLobby(saved.code);
        this.lobby.resume(saved);
    },

    resumed() {
        const data = this.saved;
        this.saved = null;
        this.rosterChanged();
        if (this.on) return;                    // a new race started while we were gone
        if (data) this.restoreRun(data);
        else { this.showLobby(this.lobby.code); show('race'); }
    },

    restoreRun(data) {
        const seen = [...this.results];
        this.lobby.started = true;
        this.on = true;
        this.racers = data.racers.filter(n => this.lobby.roster.seats[n]);
        this.results = new Map([...data.results, ...seen]);
        newRun(data.seed);
        const s = state;
        Object.assign(s.rider, data.rider);
        Object.assign(s, { cash: data.cash, cleared: data.cleared, level: data.level, theme: data.theme, mileMs: data.mileMs, cashDoubleUntil: data.cashDoubleUntil, resuming: true });
        // The road comes from the seed, so laying it out again gives the same one.
        spawn();
        const front = s.rider.distance + FRONT_REACH;
        s.things = s.things.filter(t => t.x > front);
        this.lobby.setAway(true);               // the others wait for our countdown
        updateHud();
    },

    showLobby(code) {
        $('raceCode').textContent = code;
        $('raceStart').classList.add('hidden');
        $('raceWait').classList.remove('hidden');
        raceMessage('');
    },

    rosterChanged() {
        const lobby = this.lobby;
        if (!lobby || !lobby.roster) return;
        lobby.roster.seats.forEach((seat, n) => { if (!seat) { this.friends.delete(n); this.racers = this.racers.filter(r => r !== n); } });
        NebulaLobby.fillRoster($('raceRoster'), lobby);
        NebulaLobby.fillRoster($('overRoster'), lobby);
        const count = lobby.roster.seats.filter(Boolean).length;
        $('raceGo').classList.toggle('hidden', !lobby.isHost);
        $('raceGo').disabled = count < 2 || !lobby.allReady;
        $('raceReady').textContent = lobby.isReady ? 'Not ready' : 'Ready';
        $('raceReady').classList.toggle('primary', !lobby.isReady);
        $('raceHint').textContent = lobby.readyHint(count);
        if (this.on) this.showResult();
    },

    nameOf(seat) {
        const person = this.lobby && this.lobby.roster && this.lobby.roster.seats[seat];
        return person ? person.name : 'Friend';
    },

    // Who the race has to wait for.
    away() {
        if (!this.on || !this.lobby || !this.lobby.roster) return [];
        return this.racers.filter(n => n !== this.lobby.seat && !this.results.has(n) && this.lobby.roster.seats[n] && this.lobby.roster.seats[n].away);
    },

    // The host picks the road, so everyone gets the same one.
    go() {
        const lobby = this.lobby;
        if (!lobby || !lobby.isHost) return;
        const seed = newSeed(), racers = lobby.roster.seats.flatMap((seat, n) => seat ? [n] : []);
        if (racers.length < 2) return;
        lobby.send({ t: 'go', seed, racers });
        lobby.clearReady();
        this.begin(seed, racers);
    },

    begin(seed, racers) {
        this.lobby.started = true;
        this.on = true;
        this.racers = racers;
        this.friends.clear();
        this.results.clear();
        this.resultsShown = false;
        $('overRoster').textContent = '';
        newRun(seed);
    },

    receive(msg) {
        if (!msg) return;
        if (msg.t === 'go' && Number.isFinite(msg.seed) && Array.isArray(msg.racers)) {
            if (msg.racers.includes(this.lobby.seat)) this.begin(msg.seed, msg.racers);
        }
        else if (msg.t === 'pos' && Number.isInteger(msg.s) && Number.isFinite(msg.d) && Number.isFinite(msg.a)) {
            const old = this.friends.get(msg.s);
            this.friends.set(msg.s, {
                distance: msg.d, angle: Math.max(0, Math.min(120, msg.a)), vehicle: VEHICLES.find(v => v.id === msg.v) || VEHICLES[0],
                rig: old ? old.rig : newRig(), spin: old ? (msg.a - old.angle) / GHOST_SEND_SECONDS : 0
            });
        }
        else if (msg.t === 'done' && Number.isInteger(msg.s)) {
            this.friends.delete(msg.s);
            this.results.set(msg.s, Number(msg.score) || 0);
            if (screen === 'riding') say(this.nameOf(msg.s) + ' crashed with ' + Math.floor(msg.score).toLocaleString() + '!', 2000);
            this.showResult();
        }
    },

    sendPosition(r) {
        this.lobby.sendLive({ t: 'pos', s: this.lobby.seat, d: r.distance, a: r.angle, v: save.vehicle });
    },

    finished(r) {
        if (!this.on) return;
        this.results.set(this.lobby.seat, r.score);
        this.lobby.send({ t: 'done', s: this.lobby.seat, score: r.score });
        this.showResult();
    },

    showResult() {
        const line = $('overRace'), me = this.lobby ? this.lobby.seat : null;
        if (!this.results.has(me) || screen === 'riding') return;
        const left = this.racers.filter(n => !this.results.has(n)), order = [...this.results].sort((a, b) => b[1] - a[1]);
        const place = order.findIndex(([seat]) => seat === me) + 1;
        if (left.length) line.textContent = '🏁 Still riding: ' + left.map(n => this.nameOf(n)).join(', ');
        else {
            line.textContent = order.map(([seat, score], i) => (i + 1) + '. ' + (seat === me ? 'You' : this.nameOf(seat)) + ' ' + Math.floor(score).toLocaleString()).join('   ');
            if (!this.resultsShown && order.length > 1) {
                this.resultsShown = true;
                const stats = NebulaProfile.stats('wheelie', NEW_STATS);
                NebulaProfile.setStats('wheelie', place === 1 ? { wins: stats.wins + 1 } : { losses: stats.losses + 1 });
                $('overTitle').textContent = place === 1 ? '🏆 You won the race!' : 'You came ' + ['', '1st', '2nd', '3rd', '4th'][place];
            }
        }
        const ready = !left.length && this.lobby.isHost;
        $('againBtn').textContent = ready ? 'Race again' : 'Waiting…';
        $('againBtn').disabled = !ready;
    },

    leave() {
        this.on = false;
        this.racers = [];
        this.friends.clear();
        this.results.clear();
        $('overRace').textContent = '';
        $('overRoster').textContent = '';
        $('againBtn').textContent = 'Ride again';
        $('againBtn').disabled = false;
        if (this.lobby) { const lobby = this.lobby; this.lobby = null; lobby.leave(); }
    }
};

const fillBoard = NebulaScores.mount($('boardMount'), [LEADERBOARD_GAME]);

function raceMessage(text) {
    $('raceMsg').textContent = text;
    $('raceMsg').classList.toggle('hidden', !text);
}

function raceReset() {
    $('raceStart').classList.remove('hidden');
    $('raceWait').classList.add('hidden');
}

// ---------- Screens ----------

function show(name) {
    screen = name;
    const riding = name === 'riding';
    for (const id of ['menu', 'garage', 'paused', 'over', 'race', 'board']) $(id).classList.toggle('hidden', name !== id);
    for (const id of ['hud', 'mission', 'gasBtn', 'brakeBtn', 'boostChips']) $(id).classList.toggle('hidden', !riding);
    if (!riding) { input.gas = input.brake = false; sound.silence(); }
    $('gasBtn').classList.remove('down');
    $('brakeBtn').classList.remove('down');
    if (name === 'menu') fillMenu();
    if (name === 'garage') fillGarage();
    if (name === 'board') fillBoard();
    if (name === 'over') race.showResult();
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

const canvas = $('game'), ctx = canvas.getContext('2d', { desynchronized: true });
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
    const icon = { shield: '🛡️', nitro: '🔥', double: '💵', surge: '⚡', plow: '💥' }[t.type];
    const glow = t.type === 'surge' ? '56,189,248' : t.type === 'plow' ? '250,204,21' : null;
    if (glow) {
        const pulse = 44 + Math.sin(performance.now() / 130) * 8;
        const halo = ctx.createRadialGradient(x, 322, 18, x, 322, pulse);
        halo.addColorStop(0, 'rgba(' + glow + ',.85)');
        halo.addColorStop(1, 'rgba(' + glow + ',0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        circle(x, 322, pulse);
        ctx.fill();
    }
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
        if (!(x >= -130 && x <= viewWidth + 130)) continue;
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

// ---------- The rider ----------

// Two-bone reach, as for a leg from hip to foot. Returns the knee or elbow.
function joint(from, to, firstBone, secondBone, bend) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const reach = Math.min(Math.hypot(dx, dy) || 1, firstBone + secondBone - 0.5);
    const along = (reach * reach + firstBone * firstBone - secondBone * secondBone) / (2 * reach);
    const out = Math.sqrt(Math.max(0, firstBone * firstBone - along * along));
    const ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1);
    return { x: from.x + ux * along - uy * out * bend, y: from.y + uy * along + ux * out * bend };
}

// Lean and crouch run on soft springs, so the body lags behind the bike instead of snapping.
const newRig = () => ({ lean: 0, leanSpeed: 0, crouch: 0, crouchSpeed: 0, slide: 0, slideSpeed: 0, lastSpin: 0 });

function moveRig(rig, angle, spin, gas, brake, passed) {
    const dt = Math.min(passed, 0.05);
    const leanTo = Math.min(angle, 85) * 0.58 + (brake ? 9 : 0) - (gas ? 5 : 0);
    rig.leanSpeed += (70 * (leanTo - rig.lean) - 13 * rig.leanSpeed) * dt;
    rig.lean += rig.leanSpeed * dt;
    // A sudden kick from the road squashes the knees and elbows, and they spring back.
    rig.crouchSpeed += (Math.abs(spin - rig.lastSpin) * 0.5 + 95 * (-rig.crouch) - 12 * rig.crouchSpeed) * dt;
    rig.crouch += rig.crouchSpeed * dt;
    rig.crouch = Math.max(-0.4, Math.min(1.2, rig.crouch));
    rig.lastSpin = spin;
    // Weight slides back on the gas and forward on the brake.
    const slideTo = (brake ? 7 : 0) - (gas ? 5 : 0);
    rig.slideSpeed += (60 * (slideTo - rig.slide) - 12 * rig.slideSpeed) * dt;
    rig.slide += rig.slideSpeed * dt;
}

// Where each body part sits on the bike, in the bike's own frame.
function pose(rig) {
    const tilt = (14 + rig.lean) * Math.PI / 180;
    const hip = { x: 12 + rig.slide, y: -58 + rig.crouch * 10 };
    const across = Math.sin(tilt), up = Math.cos(tilt);
    const neck = { x: hip.x + across * 54, y: hip.y - up * 54 };
    const head = { x: neck.x + across * 24, y: neck.y - up * 24 };
    const foot = { x: 44, y: -14 }, hand = { x: 70, y: -66 };
    return { hip, neck, head, foot, hand, knee: joint(hip, foot, 32, 34, -1), elbow: joint(neck, hand, 32, 32, 1) };
}

function limb(points, width, color) {
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 7;
    ctx.beginPath();
    line(points.map(p => [p.x, p.y]));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    line(points.map(p => [p.x, p.y]));
    ctx.stroke();
}

function drawHelmet(color, neck, head) {
    const turn = Math.atan2(head.x - neck.x, neck.y - head.y);
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(turn);
    shape('#1c1f2b', 5, () => circle(0, 0, 20));
    shape('#7dd3fc', 3, () => ctx.roundRect(3, -7, 17, 11, 4));
    shape('#1c1f2b', 4, () => line([[3, -18], [29, -16], [23, -10], [1, -10]]));
    shape(color, 0, () => ctx.rect(-16, -2, 11, 5));
    ctx.restore();
}

function drawBody(color, b) {
    if (b.knee2) {
        limb([b.hip, b.knee2, b.foot2], 10, '#1c1f2b');
        limb([b.neck, b.elbow2, b.hand2], 7, '#cbd5e1');
    }
    limb([b.hip, b.knee, b.foot], 12, '#2b2f3d');                         // pants
    shape('#fff', 4, () => { ctx.save(); ctx.translate(b.foot.x, b.foot.y); ctx.rotate(Math.atan2(b.foot.y - b.knee.y, b.foot.x - b.knee.x) - 1.1); ctx.roundRect(-6, -7, 26, 13, 4); ctx.restore(); });
    limb([b.hip, b.neck], 26, '#f8fafc');                                 // jersey
    const mid = { x: b.hip.x + (b.neck.x - b.hip.x) * 0.55, y: b.hip.y + (b.neck.y - b.hip.y) * 0.55 };
    const end = { x: b.hip.x + (b.neck.x - b.hip.x) * 0.68, y: b.hip.y + (b.neck.y - b.hip.y) * 0.68 };
    ctx.strokeStyle = color;
    ctx.lineWidth = 24;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    line([[mid.x, mid.y], [end.x, end.y]]);
    ctx.stroke();
    limb([b.neck, b.elbow, b.hand], 8, '#f8fafc');                        // arm
    shape(INK, 0, () => circle(b.hand.x, b.hand.y, 6));
    drawHelmet(color, b.neck, b.head);
}

// ---------- Crashing ----------

const RAGDOLL_BONES = [['hip', 'neck'], ['neck', 'head'], ['hip', 'knee'], ['knee', 'foot'], ['hip', 'knee2'], ['knee2', 'foot2'], ['neck', 'elbow'], ['elbow', 'hand'], ['neck', 'elbow2'], ['elbow2', 'hand2'], ['head', 'hip']];
const RAGDOLL_GRAVITY = 1700, RAGDOLL_STEP = 1 / 90, RAGDOLL_GROUND = 436;

function startWipeout(s) {
    const r = s.rider, vehicle = myVehicle();
    const x = viewWidth * BIKE_X - 36, y = 413 + (vehicle.kind === 'truck' ? -11 : 0);
    const turn = -r.angle * Math.PI / 180, speed = r.speed * PIXELS_PER_METRE;
    s.wreck = { x, y, angle: turn, vx: speed * 0.35, vy: -220, spin: r.crashed === 'flip' ? -7 : 5, speed: r.speed };
    if (vehicle.kind !== 'bike') return;

    const b = pose(s.rig);
    Object.assign(b, { knee2: { x: b.knee.x + 5, y: b.knee.y + 3 }, foot2: { x: b.foot.x + 6, y: b.foot.y }, elbow2: { x: b.elbow.x + 4, y: b.elbow.y + 3 }, hand2: { x: b.hand.x + 4, y: b.hand.y } });
    const toScreen = p => ({ x: x + p.x * Math.cos(turn) - p.y * Math.sin(turn), y: y + p.x * Math.sin(turn) + p.y * Math.cos(turn) });
    const parts = {};
    for (const name in b) {
        const p = toScreen(b[name]), kick = 1 + Math.random() * 0.25;
        // Verlet: the gap between now and last holds the speed, so bones can just be pulled back to length.
        parts[name] = { x: p.x, y: p.y, oldX: p.x - speed * 0.6 * kick * RAGDOLL_STEP, oldY: p.y + (260 + Math.random() * 120) * RAGDOLL_STEP };
    }
    const bones = RAGDOLL_BONES.map(([from, to]) => ({ from: parts[from], to: parts[to], length: Math.hypot(parts[to].x - parts[from].x, parts[to].y - parts[from].y) }));
    s.ragdoll = { parts, bones, spare: 0 };
}

function moveRagdoll(doll, camera, passed) {
    doll.spare += Math.min(passed, 0.05);
    while (doll.spare >= RAGDOLL_STEP) {
        doll.spare -= RAGDOLL_STEP;
        for (const p of Object.values(doll.parts)) {
            const vx = (p.x - p.oldX) * 0.998, vy = (p.y - p.oldY) * 0.998;
            p.oldX = p.x;
            p.oldY = p.y;
            p.x += vx - camera * RAGDOLL_STEP;
            p.oldX -= camera * RAGDOLL_STEP;
            p.y += vy + RAGDOLL_GRAVITY * RAGDOLL_STEP * RAGDOLL_STEP;
        }
        for (let pass = 0; pass < 6; pass++) {
            for (const bone of doll.bones) {
                const dx = bone.to.x - bone.from.x, dy = bone.to.y - bone.from.y, now = Math.hypot(dx, dy) || 1;
                const fix = (now - bone.length) / now / 2;
                bone.from.x += dx * fix; bone.from.y += dy * fix;
                bone.to.x -= dx * fix; bone.to.y -= dy * fix;
            }
            for (const p of Object.values(doll.parts)) {
                if (p.y > RAGDOLL_GROUND) {
                    p.y = RAGDOLL_GROUND;
                    p.oldX = p.x - (p.x - p.oldX) * 0.8;      // the road drags on whatever touches it
                    p.oldY = p.y + (p.y - p.oldY) * 0.3;      // and it bounces a little
                }
            }
        }
    }
}

function moveWreck(s, passed) {
    const w = s.wreck, r = s.rider;
    w.speed = Math.max(0, w.speed - 18 * passed);
    r.distance += w.speed * passed;                 // the road slides to a stop
    const camera = w.speed * PIXELS_PER_METRE;
    w.vy += RAGDOLL_GRAVITY * passed;
    w.x += (w.vx - camera * 0.4) * passed;
    w.y += w.vy * passed;
    w.angle += w.spin * passed;
    if (w.y > 413) {
        w.y = 413;
        w.vy *= -0.3;
        w.vx *= 0.7;
        w.spin *= 0.55;
    }
    if (s.ragdoll) moveRagdoll(s.ragdoll, camera, passed);
    for (const b of s.bits) {
        b.vy += 900 * passed;
        b.x += (b.vx - camera) * passed;
        b.y += b.vy * passed;
        b.life -= passed;
    }
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

function drawVehicle(r, distance, vehicle, shift, rig, wreck) {
    const spin = distance * 2.4;
    const x = viewWidth * BIKE_X - 36 + (shift || 0), y = 413 + (vehicle.kind === 'truck' ? -11 : 0);
    ctx.save();
    if (wreck) { ctx.translate(wreck.x, wreck.y); ctx.rotate(wreck.angle); }
    else { ctx.translate(x, y); ctx.rotate(-r.angle * Math.PI / 180); }
    if (vehicle.kind === 'bike') {
        drawDirtBike(vehicle.color, spin);
        if (!wreck) drawBody(vehicle.color, pose(rig || newRig()));
    }
    else drawCar(vehicle.color, spin, vehicle.kind === 'truck');
    if (r.plowing && !wreck) {
        const nose = vehicle.kind === 'bike' ? 118 : 165;
        ctx.globalAlpha *= 0.85;
        shape('#fde047', 4, () => line([[nose, -44], [nose + 26, -6], [nose, 14]]));
    }
    ctx.restore();
}

// Your friends, shaded and drawn behind you. Same road, but they can't touch you or block your view.
function drawGhosts(me) {
    let place = 0;
    ctx.save();
    for (const [seat, friend] of race.friends) {
        const gap = (friend.distance - me.distance) * PIXELS_PER_METRE;
        const shift = Math.max(-GHOST_MOST_BEHIND, Math.min(GHOST_MOST_AHEAD, gap)) - GHOST_SHIFT - place++ * GHOST_SPACING;
        ctx.globalAlpha = 0.42;
        drawVehicle({ angle: friend.angle }, friend.distance, { ...friend.vehicle, color: '#94a3b8' }, shift, friend.rig);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(race.nameOf(seat), Math.max(36, viewWidth * BIKE_X + shift - 10), 262 + place * 15);
    }
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
    drawGhosts(s.rider);
    s.rider.plowing = s.rider.distance < s.rider.plowUntil;
    drawVehicle(s.rider, s.rider.distance, myVehicle(), 0, s.rig, s.wreck);
    if (s.ragdoll) drawBody(myVehicle().color, Object.fromEntries(Object.entries(s.ragdoll.parts)));
    for (const b of s.bits) {
        if (b.life <= 0) continue;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, 9, 9);
    }
    if (s.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (s.flash * 0.22).toFixed(3) + ')';
        ctx.fillRect(0, 0, viewWidth, VIEW_HEIGHT);
    }
    if (screen === 'riding') drawGauge(s.rider);
}

function updateHud() {
    const s = state, r = s.rider;
    $('hudScore').textContent = Math.floor(r.score).toLocaleString();
    $('hudMult').textContent = '×' + r.multiplier;
    $('multStat').classList.toggle('hot', r.multiplier > 1);
    $('hudDist').textContent = miles(r.distance);
    $('hudMph').textContent = Math.round(r.speed * MPH_PER_METRE_SECOND);
    $('hudLevel').textContent = s.level + ' ' + LEVEL_NAMES[levelTier(s.level)];
    $('hudCash').textContent = money(s.cash);
    const m = activeMissions()[0];
    $('mission').textContent = m ? m.text + ' (' + Math.floor(Math.min(m.value(s), m.goal)) + '/' + m.goal + ')' : 'All missions done!';
    const chips = [];
    if (r.shields > 0) chips.push('🛡️ ×' + r.shields);
    if (r.distance < r.nitroUntil) chips.push('🔥 ' + Math.ceil(r.nitroUntil - r.distance) + 'm');
    if (r.distance < s.cashDoubleUntil) chips.push('💵 ' + Math.ceil(s.cashDoubleUntil - r.distance) + 'm');
    if (r.distance < r.oilUntil) chips.push('🛢️ Oil!');
    if (r.distance < r.surgeUntil) chips.push('⚡ ' + Math.ceil(r.surgeUntil - r.distance) + 'm');
    if (r.distance < r.plowUntil) chips.push('💥 ' + Math.ceil(r.plowUntil - r.distance) + 'm');
    for (const [seat, friend] of race.friends) chips.push('👻 ' + race.nameOf(seat) + ' ' + miles(friend.distance));
    $('boostChips').textContent = chips.join('   ');
}

// ---------- Main loop ----------

let last = performance.now(), spare = 0, thumbTaken = false;

function frame(now) {
    requestAnimationFrame(frame);
    const passed = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (screen === 'riding' && race.away().length) {
        say('Waiting for ' + race.away().map(n => race.nameOf(n)).join(', ') + ' to come back…', 400);
    }
    else if (screen === 'riding') {
        const r = state.rider;
        if (state.countdown > 0) {
            state.countdown -= passed;
            say(state.countdown > 0 ? String(Math.ceil(state.countdown)) : 'GO!', 900);
            if (state.countdown <= 0 && state.resuming) {
                state.resuming = false;
                if (race.lobby) race.lobby.setAway(false);
            }
        }
        else spare += passed;
        while (spare >= STEP) {
            P.step(r, input, STEP);
            spare -= STEP;
        }
        moveRig(state.rig, r.angle, r.spin, input.gas, input.brake, passed);
        if (!state.mileMs && r.distance >= METRES_PER_MILE) {
            state.mileMs = Math.round(r.time * 1000);
            say('🏁 First mile done!', 1500);
        }
        if (r.shieldUsed !== undefined && r.time - r.shieldUsed < passed + STEP) say('🛡️ Shield saved you!', 1100);
        const level = levelAt(r.distance);
        if (level !== state.level) setLevel(state, level);
        spawn();
        meetThings(passed);
        checkMissions();
        const theme = Math.floor(r.distance / THEME_EVERY);
        if (theme !== state.theme) { state.theme = theme; say(THEMES[theme % THEMES.length].name, 1800); }
        sound.run(r.speed, input.gas);
        updateHud();
        for (const friend of race.friends.values()) moveRig(friend.rig, friend.angle, friend.spin, true, false, passed);
        if (race.on && race.lobby) {
            state.sendIn -= passed;
            if (state.sendIn <= 0) { state.sendIn = GHOST_SEND_SECONDS; race.sendPosition(r); }
        }
        if (r.crashed) endRun();
    }
    else if (state && state.wreck) {
        moveWreck(state, passed);
        for (const friend of race.friends.values()) moveRig(friend.rig, friend.angle, friend.spin, true, false, passed);
        if (screen === 'crashing') {
            state.crashFor += passed;
            if (state.crashFor >= CRASH_SHOW_SECONDS) show('over');
        }
    }
    if (state) {
        state.flash = Math.max(0, state.flash - passed * 5);
        if (!state.wreck) {
            for (const b of state.bits) {
                b.vy += 900 * passed;
                b.x += b.vx * passed;
                b.y += b.vy * passed;
                b.life -= passed;
            }
            state.bits = state.bits.filter(b => b.life > 0);
        }
    }
    render();
    if (!thumbTaken && screen === 'riding' && state.rider.time >= THUMB_SECONDS) {
        thumbTaken = true;
        saveThumbnail(canvas, THUMB_KEY, BIKE_X + 0.05);
    }
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
addEventListener('blur', () => { if (!race.on) pause(); });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (race.on && screen === 'paused') show('riding');
});
addEventListener('resize', resize);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());

$('playBtn').addEventListener('click', () => newRun());
$('againBtn').addEventListener('click', () => { if (race.on) race.go(); else newRun(); });
$('raceGo').addEventListener('click', () => { if (race.lobby.allReady) race.go(); });
$('raceReady').addEventListener('click', () => race.lobby.setReady(!race.lobby.isReady));
$('raceBtn').addEventListener('click', () => { raceReset(); raceMessage(''); show('race'); });
$('raceBack').addEventListener('click', () => { race.leave(); show('menu'); });
$('raceCreate').addEventListener('click', () => { race.connect(); race.lobby.create(); });
$('raceCancel').addEventListener('click', () => { race.leave(); raceReset(); raceMessage(''); });
$('raceJoin').addEventListener('click', () => {
    showTouchKeyboard({ title: 'Type your friend’s lobby code', maxLength: 5, exactLength: 5, okLabel: 'Join', onDone: code => { race.connect(); race.lobby.join(code); } });
});
$('boardBtn').addEventListener('click', () => show('board'));
$('boardBack').addEventListener('click', () => show('menu'));
$('overSaveName').addEventListener('click', () => NebulaScores.askName(() => {
    $('overSaveName').classList.add('hidden');
    showRank(NebulaScores.send('wheelie:score', NebulaScores.best('wheelie:score')));
    NebulaScores.hello(LEADERBOARD_GAME);
}));
$('garageBtn').addEventListener('click', () => show('garage'));
$('overGarage').addEventListener('click', () => show('garage'));
$('garageBack').addEventListener('click', () => show('menu'));
$('overMenu').addEventListener('click', () => { race.leave(); state = null; show('menu'); });
$('quitBtn').addEventListener('click', () => { save.cash += state.cash; store(); state = null; race.leave(); show('menu'); });
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
race.tryResume();
const saveRace = () => { if (race.lobby) race.lobby.remember(race.snapshot()); };
setInterval(saveRace, 1000);
addEventListener('pagehide', saveRace);
NebulaLobby.warmUp();
NebulaScores.hello(LEADERBOARD_GAME);
// A wiped device gets its bikes and cash back from the backup.
NebulaProfile.ready.then(() => {
    const backup = NebulaProfile.stats('wheelie', {}).save;
    if (!readJson(SAVE_KEY) && backup) { Object.assign(save, backup); store(); fillMenu(); }
});
