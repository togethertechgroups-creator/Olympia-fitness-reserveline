require('dotenv').config();
const { Pool } = require('pg');

// ─── Neon PostgreSQL Connection ───────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

console.log('☁️ Connected to Neon PostgreSQL Database!');

// Convert SQLite ? positional placeholders → PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Normalize args — handle (arg1, arg2, ...) or ([arg1, arg2]) or ({key: val})
function flattenArgs(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    return Object.values(args[0]);
  }
  return args;
}

// Normalize row values — convert boolean-like integers from old SQLite schema
function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v;
  }
  return out;
}

const db = {
  // Tell index.js to skip the SQLite `if (!db.isTurso)` init block
  isTurso: true,
  isNeon: true,
  pool,

  // Run raw SQL (used by migrate-pg.js)
  async exec(sql) {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  },

  // Stub — not used with PostgreSQL (no PRAGMA support)
  pragma() {},

  prepare(sql) {
    const pgSql = convertPlaceholders(sql);
    const isInsert = /^\s*INSERT/i.test(sql);
    const hasReturning = /RETURNING/i.test(sql);

    return {
      // Return first row or undefined
      async get(...args) {
        const params = flattenArgs(args);
        try {
          const result = await pool.query(pgSql, params.length ? params : undefined);
          return result.rows.length > 0 ? normalizeRow(result.rows[0]) : undefined;
        } catch (err) {
          console.error('pg.get error:', err.message, '\nSQL:', pgSql, '\nParams:', params);
          throw err;
        }
      },

      // Return all rows
      async all(...args) {
        const params = flattenArgs(args);
        try {
          const result = await pool.query(pgSql, params.length ? params : undefined);
          return result.rows.map(normalizeRow);
        } catch (err) {
          console.error('pg.all error:', err.message, '\nSQL:', pgSql, '\nParams:', params);
          throw err;
        }
      },

      // Run a mutation (INSERT/UPDATE/DELETE), returns { changes, lastInsertRowid }
      async run(...args) {
        const params = flattenArgs(args);
        let querySql = pgSql;

        // For INSERT without RETURNING, append RETURNING id to get auto-generated key
        if (isInsert && !hasReturning) {
          querySql = pgSql + ' RETURNING id';
        }

        try {
          const result = await pool.query(querySql, params.length ? params : undefined);
          let lastInsertRowid = 0;
          if (isInsert && result.rows.length > 0 && result.rows[0].id !== undefined) {
            lastInsertRowid = result.rows[0].id;
          }
          return { changes: result.rowCount || 0, lastInsertRowid };
        } catch (err) {
          // If RETURNING id fails (table has no integer id), retry without it
          if (isInsert && !hasReturning && err.message.includes('id')) {
            try {
              const result = await pool.query(pgSql, params.length ? params : undefined);
              return { changes: result.rowCount || 0, lastInsertRowid: 0 };
            } catch (err2) {
              console.error('pg.run retry error:', err2.message, '\nSQL:', pgSql);
              throw err2;
            }
          }
          console.error('pg.run error:', err.message, '\nSQL:', pgSql, '\nParams:', params);
          throw err;
        }
      }
    };
  }
};

module.exports = db;
