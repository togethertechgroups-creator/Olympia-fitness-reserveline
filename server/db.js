'use strict';
/**
 * db.js — Unified database client for Olympia Fitness.
 *
 * Supports three backends, selected automatically by environment:
 *
 *  1. Cloudflare D1  (CF Worker + D1 binding injected via setD1Database)
 *  2. Turso (libSQL)  (VERCEL / USE_TURSO / TURSO_DATABASE_URL set)
 *  3. Local SQLite    (better-sqlite3, development mode)
 *
 * D1 binding is per-request in Workers, so it must be injected before the
 * first request via setD1Database(env.DB) in worker/index.js.
 *
 * All three backends expose the same interface:
 *   db.exec(sql)
 *   db.prepare(sql).get(...args)   → row | undefined
 *   db.prepare(sql).all(...args)   → row[]
 *   db.prepare(sql).run(...args)   → { changes, lastInsertRowid }
 */

const path = require('path');

// ─── Helper: flatten args (handles both .get(a,b,c) and .get([a,b,c]) calls)
function flattenArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) return args[0];
  return args;
}

// ─── D1 Adapter ──────────────────────────────────────────────────────────────
// D1 binding is injected per-request from worker/index.js
let _d1 = null;

function setD1Database(d1Binding) {
  if (d1Binding) {
    _d1 = d1Binding;
  }
}

function makeD1Client() {
  return {
    isD1: true,
    get d1() { return _d1; },

    ensureD1() {
      if (!_d1) throw new Error('Cloudflare D1 Database binding (env.DB) is not attached.');
      return _d1;
    },

    async exec(sql) {
      const d1 = this.ensureD1();
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await d1.prepare(stmt).run();
      }
    },

    prepare(sql) {
      const self = this;
      return {
        async get(...args) {
          const d1 = self.ensureD1();
          const flatArgs = flattenArgs(args);
          const stmt = flatArgs.length > 0
            ? d1.prepare(sql).bind(...flatArgs)
            : d1.prepare(sql);
          const row = await stmt.first();
          return row ?? undefined;
        },
        async all(...args) {
          const d1 = self.ensureD1();
          const flatArgs = flattenArgs(args);
          const stmt = flatArgs.length > 0
            ? d1.prepare(sql).bind(...flatArgs)
            : d1.prepare(sql);
          const res = await stmt.all();
          return res.results ?? [];
        },
        async run(...args) {
          const d1 = self.ensureD1();
          const flatArgs = flattenArgs(args);
          const stmt = flatArgs.length > 0
            ? d1.prepare(sql).bind(...flatArgs)
            : d1.prepare(sql);
          const res = await stmt.run();
          return {
            changes: res.meta?.changes ?? 0,
            lastInsertRowid: res.meta?.last_row_id ?? 0
          };
        }
      };
    }
  };
}

// ─── Turso (libSQL) Adapter ───────────────────────────────────────────────────
function makeTursoClient() {
  const { createClient } = require('@libsql/client');
  let rawUrl = process.env.TURSO_DATABASE_URL
    || 'libsql://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
  const authToken = process.env.TURSO_AUTH_TOKEN
    || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

  if (rawUrl.startsWith('libsql://')) rawUrl = rawUrl.replace('libsql://', 'https://');

  console.log('☁️  Connected to Turso Cloud Database via HTTPS!');
  const client = createClient({ url: rawUrl, authToken });

  return {
    isTurso: true,
    client,
    async exec(sql) { await client.executeMultiple(sql); },
    prepare(sql) {
      return {
        async get(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return res.rows.length > 0 ? res.rows[0] : undefined;
        },
        async all(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return res.rows;
        },
        async run(...args) {
          const res = await client.execute({ sql, args: flattenArgs(args) });
          return {
            changes: Number(res.rowsAffected || 0),
            lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0
          };
        }
      };
    }
  };
}

// ─── Local SQLite Adapter (development only) ─────────────────────────────────
function makeSQLiteClient() {
  console.log('📁 Connected to Local SQLite Database!');
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'beast_fitness.db');
  const sqlite = new Database(DB_PATH);
  try { sqlite.pragma('journal_mode = WAL'); } catch (e) {}
  sqlite.pragma('foreign_keys = ON');

  return {
    isTurso: false,
    sqlite,
    exec(sql) { sqlite.exec(sql); },
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        get(...args)  { return stmt.get(...flattenArgs(args)); },
        all(...args)  { return stmt.all(...flattenArgs(args)); },
        run(...args)  { return stmt.run(...flattenArgs(args)); }
      };
    }
  };
}

// ─── Select backend ───────────────────────────────────────────────────────────
// CF_WORKER is set as a build-time define in wrangler.toml → '1'
// The D1 binding is injected at runtime via setD1Database()
const isWorker = !!(process.env.CF_WORKER);
const isTurso  = !isWorker && !!(process.env.TURSO_DATABASE_URL || process.env.VERCEL || process.env.USE_TURSO);

let dbClient;
if (isWorker) {
  // D1 mode: create a proxy that always reads _d1 at call time
  dbClient = makeD1Client();
} else if (isTurso) {
  dbClient = makeTursoClient();
} else {
  dbClient = makeSQLiteClient();
}

module.exports = dbClient;
module.exports.setD1Database = setD1Database;
