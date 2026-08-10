const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

const isTurso = !!(process.env.TURSO_DATABASE_URL || process.env.VERCEL || process.env.USE_TURSO);

let dbClient = null;

function flattenArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) return args[0];
  return args;
}

if (isTurso) {
  console.log("☁️ Connected to Turso Cloud Database!");
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  dbClient = {
    isTurso: true,
    client,
    async exec(sql) {
      await client.executeMultiple(sql);
    },
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
} else {
  console.log("📁 Connected to Local SQLite Database!");
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'beast_fitness.db');
  const sqlite = new Database(DB_PATH);
  try { sqlite.pragma('journal_mode = WAL'); } catch (e) {}
  sqlite.pragma('foreign_keys = ON');

  dbClient = {
    isTurso: false,
    sqlite,
    async exec(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        async get(...args) {
          return stmt.get(...flattenArgs(args));
        },
        async all(...args) {
          return stmt.all(...flattenArgs(args));
        },
        async run(...args) {
          return stmt.run(...flattenArgs(args));
        }
      };
    }
  };
}

module.exports = dbClient;
