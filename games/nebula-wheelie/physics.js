"use strict";

// The bike's physics for Wheelie Life, kept apart from the drawing so it can be tested on its own.
// The angle is in degrees: 0 means both wheels are down and 90 means straight up.

const WheeliePhysics = (function () {
    const TUNE = {
        gasTorque: 240,        // how hard the gas lifts the front wheel
        brakeTorque: 270,      // how hard the brake pulls it down
        gravity: 165,          // how hard the bike falls forward at low angles
        damping: 1.5,
        wobble: 26,            // gentle random-feeling push that grows with speed
        flipAngle: 108,        // past this, the bike loops out
        sweetLow: 55,          // the balance zone that builds your multiplier
        sweetHigh: 85,
        multiplierEvery: 2.5,  // seconds in the zone for each +1
        maxMultiplier: 5,
        minSpeed: 8,
        topSpeed: 24,
        acceleration: 2.42,
        drag: 1.1,
        armAngle: 20,          // once the wheel is this high, touching down ends the run
        stallTime: 5,          // seconds you get to lift the wheel at the start
        oilSlip: 0.55,         // share of the gas left while riding through oil
        nitroSpeed: 7,
        surgeSpeed: 11         // extra top speed from a Speed Boost pickup
    };

    // What each obstacle needs from you when your front wheel reaches it:
    //   min / max: the angle you must be inside
    //   kick:      shoves the bike instead of stopping it (positive lifts the wheel)
    //   oil:       metres of slippery road
    const OBSTACLES = {
        barrier: { name: 'Barrier', hint: 'Wheel up!', min: 50 },
        beam: { name: 'Low beam', hint: 'Stay low!', max: 45 },
        pothole: { name: 'Pothole', hint: 'Hold on!', kick: 62 },
        crack: { name: 'Road crack', hint: 'Hold on!', kick: -58 },
        oil: { name: 'Oil slick', hint: 'Slippery!', oil: 26 }
    };

    function newRider(vehicle, upgrades) {
        const v = vehicle || {}, u = upgrades || {};
        return {
            angle: 0, spin: 0, speed: TUNE.minSpeed, distance: 0, time: 0, armed: false,
            zoneTime: 0, totalZoneTime: 0, multiplier: 1, bestMultiplier: 1, inZone: false,
            score: 0, crashed: null, oilUntil: 0, nitroUntil: 0, doubleUntil: 0, shields: 0, safeUntil: 0,
            surgeUntil: 0, plowUntil: 0, levelSpeed: 0, levelPush: 1,
            gas: TUNE.gasTorque * (v.torque || 1) * (1 + 0.06 * (u.engine || 0)),
            flip: TUNE.flipAngle + (v.flip || 0) + 2 * (u.grip || 0),
            sweetLow: TUNE.sweetLow - (v.zone || 0) - 2 * (u.grip || 0),
            sweetHigh: TUNE.sweetHigh + (v.zone || 0) + (u.grip || 0),
            topSpeed: TUNE.topSpeed + (v.speed || 0),
            scoreBonus: v.score || 1
        };
    }

    // A shield takes the hit and puts the bike back in a safe spot. Otherwise the run ends.
    function crash(r, why) {
        if (r.time < r.safeUntil) return;
        if (r.shields > 0) {
            r.shields--;
            r.angle = 45;
            r.spin = 0;
            r.safeUntil = r.time + 1.5;
            r.shieldUsed = r.time;
            return;
        }
        r.crashed = why;
    }

    // Moves the rider forward by dt seconds. input is { gas, brake }.
    function step(r, input, dt) {
        if (r.crashed) return;
        r.time += dt;

        const nitro = r.distance < r.nitroUntil, surge = r.distance < r.surgeUntil;
        const top = r.topSpeed + r.levelSpeed + (nitro ? TUNE.nitroSpeed : 0) + (surge ? TUNE.surgeSpeed : 0);
        const push = TUNE.acceleration * r.levelPush * (surge ? 4 : nitro ? 3 : 1);
        r.speed += (input.gas || nitro || surge ? push : r.speed > top ? -TUNE.drag * 4 : -TUNE.drag) * dt;
        r.speed = Math.max(TUNE.minSpeed, Math.min(top, r.speed));

        const lean = Math.cos(r.angle * Math.PI / 180);
        let torque = -TUNE.gravity * lean;
        if (input.gas) torque += r.gas * (r.distance < r.oilUntil ? TUNE.oilSlip : 1);
        if (input.brake) torque -= TUNE.brakeTorque;
        if (r.angle > 0) torque += Math.sin(r.time * 2.3) * Math.sin(r.time * 0.7) * TUNE.wobble * (r.speed / TUNE.topSpeed);
        r.spin += (torque - r.spin * TUNE.damping) * dt;
        r.angle += r.spin * dt;

        if (r.angle >= TUNE.armAngle) r.armed = true;
        if (r.angle <= 0) {
            r.angle = 0;
            if (r.spin < 0) r.spin = 0;
            if (r.armed) crash(r, 'ground');
            else if (r.time > TUNE.stallTime) r.crashed = 'stall';
        }
        if (r.angle >= r.flip) crash(r, 'flip');
        if (r.crashed) return;

        // Your multiplier builds in the zone and drains away outside it.
        r.inZone = r.angle >= r.sweetLow && r.angle <= r.sweetHigh;
        if (r.inZone) {
            r.zoneTime += dt;
            r.totalZoneTime += dt;
        }
        else r.zoneTime = Math.max(0, r.zoneTime - dt * 2);
        r.multiplier = Math.min(TUNE.maxMultiplier, 1 + Math.floor(r.zoneTime / TUNE.multiplierEvery));
        r.bestMultiplier = Math.max(r.bestMultiplier, r.multiplier);

        const moved = r.speed * dt;
        r.distance += moved;
        if (r.armed) r.score += moved * r.multiplier * r.scoreBonus * (nitro ? 2 : 1);
    }

    // Runs when the front wheel reaches an obstacle. Returns true if you got past it cleanly.
    function meetObstacle(r, type) {
        const o = OBSTACLES[type];
        if (r.distance < r.plowUntil && (type === 'barrier' || type === 'beam')) { r.smashed = r.time; return true; }
        if (o.kick) { r.spin += o.kick; return true; }
        if (o.oil) { r.oilUntil = r.distance + o.oil; return true; }
        if ((o.min !== undefined && r.angle < o.min) || (o.max !== undefined && r.angle > o.max)) {
            crash(r, type);
            return false;
        }
        return true;
    }

    return { TUNE, OBSTACLES, newRider, step, meetObstacle };
})();

if (typeof module !== 'undefined') module.exports = WheeliePhysics;
