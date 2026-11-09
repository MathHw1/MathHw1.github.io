"use strict";

// Keeps the boards, bans and perks in a Postgres database, so they survive the free host sleeping or
// restarting. Set DATABASE_URL (from Neon, Supabase or any Postgres) to turn it on. Without it the
// server keeps everything in memory, as before.
//
// Everything is one JSON snapshot in one row: the server loads it once when it starts, and writes it
// back a few seconds after anything changes. That's plenty for a few thousand players.

const SAVE_DELAY_MS = 5000;
const LOAD_TRIES = 5;
const KEY = 'state';

function createStore({ url = process.env.DATABASE_URL, pool = null, log = console } = {}) {
    if (!pool && !url) return { enabled: false, load: async () => null, changed() {}, flush: async () => {} };
    if (!pool) {
        const { Pool } = require('pg');
        pool = new Pool({ connectionString: url, max: 2, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
        pool.on('error', error => log.error('Database connection error:', error.message));
    }

    let snapshot = null;      // a function returning what to save, given by the server
    let loaded = false;       // never save over the database before reading what's in it
    let timer = null, saving = null, again = false;

    async function setUp() {
        await pool.query('CREATE TABLE IF NOT EXISTS nebula_state (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    }

    // Reads the saved state. Retries, because a free database can take a few seconds to wake up.
    async function load(getSnapshot) {
        snapshot = getSnapshot;
        for (let attempt = 1; attempt <= LOAD_TRIES; attempt++) {
            try {
                await setUp();
                const { rows } = await pool.query('SELECT value FROM nebula_state WHERE key = $1', [KEY]);
                loaded = true;
                return rows.length ? rows[0].value : null;
            } catch (error) {
                log.error('Couldn’t read the database (try ' + attempt + ' of ' + LOAD_TRIES + '):', error.message);
                await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            }
        }
        log.error('Carrying on without the database. Nothing will be saved until the server restarts and reaches it.');
        return null;
    }

    async function save() {
        if (!loaded || !snapshot) return;
        if (saving) { again = true; return saving; }
        saving = pool.query(
            'INSERT INTO nebula_state (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
            [KEY, JSON.stringify(snapshot())]
        ).catch(error => { log.error('Couldn’t save to the database:', error.message); changed(); })
            .finally(() => { saving = null; if (again) { again = false; changed(); } });
        return saving;
    }

    // Call after anything worth keeping changes. Saves are bunched up so a busy minute is a few writes.
    function changed() {
        if (!loaded || timer) return;
        timer = setTimeout(() => { timer = null; save(); }, SAVE_DELAY_MS);
    }

    // Saves straight away, for when the host is shutting the server down.
    async function flush() {
        if (timer) { clearTimeout(timer); timer = null; }
        await save();
        if (saving) await saving;
    }

    return { enabled: true, load, changed, flush, pool };
}

module.exports = { createStore };
