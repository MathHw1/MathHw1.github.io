"use strict";

// The bike's physics for Wheelie Life, kept apart from the drawing so it can be tested on its own.
// The angle is in degrees: 0 means both wheels are down and 90 means straight up.

const WheeliePhysics = (function () {
    const TUNE = {
        gasTorque: 205,        // how hard the gas lifts the front wheel
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
        acceleration: 2.2,
        drag: 1.1,
        lockAngle: 68,         // Lock mode holds the bike here
        lockSpeed: 13,
        lockEase: 3.5
    };

    // Bumps need the front wheel at least this high to clear them.
    const CLEAR_ANGLE = 14;

    function newRider(upgrades) {
        const u = upgrades || {};
        return {
            angle: 0, spin: 0, speed: TUNE.minSpeed, distance: 0, time: 0,
            zoneTime: 0, totalZoneTime: 0, multiplier: 1, bestMultiplier: 1, inZone: false,
            score: 0, crashed: null,
            gas: TUNE.gasTorque * (1 + 0.06 * (u.engine || 0)),
            flip: TUNE.flipAngle + 2 * (u.grip || 0),
            sweetLow: TUNE.sweetLow - 2 * (u.grip || 0),
            sweetHigh: TUNE.sweetHigh + (u.grip || 0)
        };
    }

    // Lock mode: the bike balances itself so you can just cruise. It can't crash, and it doesn't score.
    function cruise(r, dt) {
        r.angle += (TUNE.lockAngle - r.angle) * Math.min(1, TUNE.lockEase * dt);
        r.speed += (TUNE.lockSpeed - r.speed) * Math.min(1, dt);
        r.spin = 0;
        r.inZone = false;
        r.zoneTime = 0;
        r.multiplier = 1;
        r.distance += r.speed * dt;
    }

    // Moves the rider forward by dt seconds. input is { gas, brake, lock }.
    function step(r, input, dt) {
        if (r.crashed) return;
        r.time += dt;
        if (input.lock) { cruise(r, dt); return; }

        r.speed += (input.gas ? TUNE.acceleration : -TUNE.drag) * dt;
        r.speed = Math.max(TUNE.minSpeed, Math.min(TUNE.topSpeed, r.speed));

        const lean = Math.cos(r.angle * Math.PI / 180);
        let push = -TUNE.gravity * lean;
        if (input.gas) push += r.gas;
        if (input.brake) push -= TUNE.brakeTorque;
        if (r.angle > 0) push += Math.sin(r.time * 2.3) * Math.sin(r.time * 0.7) * TUNE.wobble * (r.speed / TUNE.topSpeed);
        r.spin += (push - r.spin * TUNE.damping) * dt;
        r.angle += r.spin * dt;

        if (r.angle <= 0) {
            r.angle = 0;
            if (r.spin < 0) r.spin = 0;
            r.zoneTime = 0;
            r.multiplier = 1;
        }
        if (r.angle >= r.flip) { r.crashed = 'flip'; return; }

        r.inZone = r.angle >= r.sweetLow && r.angle <= r.sweetHigh;
        if (r.inZone) {
            r.zoneTime += dt;
            r.totalZoneTime += dt;
            r.multiplier = Math.min(TUNE.maxMultiplier, 1 + Math.floor(r.zoneTime / TUNE.multiplierEvery));
            r.bestMultiplier = Math.max(r.bestMultiplier, r.multiplier);
        }

        const moved = r.speed * dt;
        r.distance += moved;
        if (r.angle > 0) r.score += moved * r.multiplier;
    }

    return { TUNE, CLEAR_ANGLE, newRider, step };
})();

if (typeof module !== 'undefined') module.exports = WheeliePhysics;
