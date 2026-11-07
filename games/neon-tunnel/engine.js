"use strict";

// Neon Tunnel: an original tunnel runner for Nebula Arcade. This file is the game's rules, with no
// drawing, so it can be tested on its own.
//
// The tunnel is a cylinder. Positions on its wall are an angle (radians, 0 to 2π) and a distance
// along it. The player always sits at the same spot on screen; steering changes the player's angle,
// and the drawing turns the whole tunnel the other way, so it looks like the tunnel rotates.
// Every obstacle is a set of blocked arcs at one distance. When the player reaches that distance,
// they crash if their angle is inside a blocked arc.

const TunnelEngine = (function () {
    const TAU = Math.PI * 2;
    const DEG = Math.PI / 180;
    const TUNE = {
        levels: 50,
        levelDistance: 450,     // units per level: about 10 seconds at level 1 and 2 at level 50
        baseSpeed: 45,          // V(L) = 45 × 1.032^(L−1), so about 210 units a second at level 50
        speedGrowth: 1.032,
        baseDensity: 2,         // D(L) = 2 + 0.367 × (L−1) hazards every 100 units
        densityGrowth: 0.367,
        // People can't react in under about a third of a second, so hazards never come closer together
        // than this, even where the density formula asks for more. See reactionAt.
        minReaction: 0.35,
        baseSpin: 15 * DEG,     // ω(L) = 15° × 1.045^(L−11) a second, from level 11
        spinGrowth: 1.045,
        firstGap: 150 * DEG,    // the opening shrinks from 150° to 12° by level 50
        lastGap: 12 * DEG,
        baseTurn: 4.2,          // fastest steering, radians a second. Slow enough to line up a 12° opening
        turnGrowth: 0.012,      // a little extra steering per level, so the openings stay reachable
        turnEase: 16,           // how quickly steering reaches full speed
        shipHalf: 4 * DEG,      // half the ship's hitbox, so it still fits the 12° opening
        playerDepth: 6,         // how far in front of the camera the ship sits
        firstObstacle: 160,
        viewDistance: 220       // obstacles are laid out this far ahead
    };

    const wrap = a => ((a % TAU) + TAU) % TAU;
    const tier = level => level <= 10 ? 0 : level <= 25 ? 1 : level <= 40 ? 2 : 3;   // beginner to nightmare
    const levelAt = distance => Math.min(TUNE.levels, 1 + Math.floor(distance / TUNE.levelDistance));
    const speedAt = level => TUNE.baseSpeed * Math.pow(TUNE.speedGrowth, level - 1);
    const densityAt = level => TUNE.baseDensity + TUNE.densityGrowth * (level - 1);
    const spinAt = level => level <= 10 ? 0 : TUNE.baseSpin * Math.pow(TUNE.spinGrowth, level - 11);
    const gapAt = level => TUNE.firstGap * Math.pow(TUNE.lastGap / TUNE.firstGap, (level - 1) / (TUNE.levels - 1));
    const turnAt = level => TUNE.baseTurn * (1 + TUNE.turnGrowth * (level - 1));
    // Seconds between hazards: what the density formula gives, but never under the human limit.
    const reactionAt = level => Math.max(TUNE.minReaction, (100 / densityAt(level)) / speedAt(level));

    // Gives the same numbers from the same seed, so a run can be laid out again after a reload.
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

    function newRun(seed) {
        return {
            distance: 0, time: 0, angle: 0, turn: 0, score: 0, level: 1, crashed: false,
            obstacles: [], nextAt: TUNE.firstObstacle, safe: 0, roll: seededRandom(seed)
        };
    }

    // Blocked arcs, each [start, width], placed so the angle `safe` stays open by at least half a gap.
    function blockedArcs(roll, safe, gap, kind) {
        if (kind === 'gate') return [[safe + gap / 2, TAU - gap]];        // everything but one opening
        if (kind === 'half') return [[safe + gap / 2 + roll() * (Math.PI - gap), Math.PI]];
        const room = TAU - gap, arcs = [], count = kind === 'blades' ? 3 : 1 + Math.floor(roll() * 2);
        for (let i = 0; i < count; i++) {
            const width = Math.max(0.05, Math.min(room / count - 0.15, 0.6 + roll() * 0.8));
            arcs.push([safe + gap / 2 + (room / count) * i + roll() * (room / count - width), width]);
        }
        return arcs;
    }

    function spawn(run) {
        const level = levelAt(run.nextAt), t = tier(level), roll = run.roll, gap = gapAt(level);
        const kinds = [['bar', 'wedge', 'blades'], ['bar', 'wedge', 'blades', 'half'], ['half', 'gate', 'blades'], ['gate', 'half']][t];
        const kind = kinds[Math.floor(roll() * kinds.length)];
        const o = { at: run.nextAt, kind, safe: run.safe, arcs: blockedArcs(roll, run.safe, gap, kind), spin: 0, slideAmp: 0, slideRate: 0 };

        // Moving obstacles. Both moves are measured by distance and are zero when the ship arrives,
        // so the opening is exactly where the safe path says it is at that moment.
        const speed = speedAt(level);
        if (t >= 1 && roll() < (t === 1 ? 0.4 : 0.6)) o.spin = (roll() < 0.5 ? -1 : 1) * spinAt(level) / speed;
        if (t >= 1 && roll() < (t === 3 ? 0.6 : 0.3)) {
            o.slideAmp = 0.35 + roll() * 0.4;
            o.slideRate = (TAU / (1.2 + roll() * 0.8)) / speed;
        }
        run.obstacles.push(o);

        // The next opening is always one the ship can steer to in time.
        const reaction = reactionAt(level), reach = turnAt(level) * reaction * 0.55;
        run.safe = wrap(run.safe + (roll() * 2 - 1) * reach);
        run.nextAt += speed * reaction;
    }

    // How far an obstacle has turned and slid when the run is at `distance`.
    function offsetAt(o, distance) {
        const toGo = distance - (o.at - TUNE.playerDepth);
        return o.spin * toGo + o.slideAmp * Math.sin(o.slideRate * toGo);
    }

    function blocks(o, distance, angle) {
        const shift = offsetAt(o, distance);
        return o.arcs.some(([start, width]) => {
            const into = wrap(angle - (start + shift));
            return into < width + TUNE.shipHalf || into > TAU - TUNE.shipHalf;
        });
    }

    // Moves the run forward by dt seconds. input.left and input.right are true while held.
    function step(run, input, dt) {
        if (run.crashed) return;
        const level = levelAt(run.distance);
        if (level !== run.level) run.level = level;
        const want = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * turnAt(level);
        run.turn += (want - run.turn) * Math.min(1, TUNE.turnEase * dt);
        run.angle = wrap(run.angle + run.turn * dt);

        const before = run.distance, speed = speedAt(level);
        run.distance += speed * dt;
        run.time += dt;
        run.score += speed * dt * (1 + 0.1 * (level - 1));

        while (run.nextAt < run.distance + TUNE.viewDistance) spawn(run);
        for (const o of run.obstacles) {
            const arrive = o.at - TUNE.playerDepth;
            if (before < arrive && run.distance >= arrive && blocks(o, arrive, run.angle)) { run.crashed = true; break; }
        }
        run.obstacles = run.obstacles.filter(o => o.at > run.distance - 2);
    }

    return { TAU, TUNE, tier, levelAt, speedAt, densityAt, spinAt, turnAt, reactionAt, gapAt, newRun, step, offsetAt, blocks, wrap };
})();

if (typeof module !== 'undefined') module.exports = TunnelEngine;
