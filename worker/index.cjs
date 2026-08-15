/**
 * Cloudflare Worker entry point — CommonJS format (.cjs)
 * This wraps the Express app using @whatwg-node/server for the Fetch API bridge.
 * 
 * We use CommonJS so Wrangler can bundle everything with esbuild without
 * import.meta.url issues. With nodejs_compat flag, Node.js globals are available.
 */

'use strict';

// ─── Inject env before loading server ────────────────────────────────────────
// Cloudflare secrets are injected into `env` in the fetch handler below.
// We pre-set these so db.js picks them up at module load time.
process.env.USE_TURSO = '1';
process.env.CF_WORKER = '1';
process.env.NODE_ENV = 'production';

// ─── Import the fetch bridge and Express app ─────────────────────────────────
const { createServerAdapter } = require('@whatwg-node/server');
const app = require('../server/index.js');

// ─── Create the fetch-compatible handler ─────────────────────────────────────
const fetchHandler = createServerAdapter(app);

// ─── Cloudflare Worker export ─────────────────────────────────────────────────
module.exports = {
  /**
   * @param {Request} request
   * @param {object} env   Cloudflare bindings (secrets, vars, R2 buckets, etc.)
   * @param {object} ctx   Execution context
   */
  async fetch(request, env, ctx) {
    // Copy Cloudflare secrets → process.env so the Express app can read them
    if (env.TURSO_DATABASE_URL)           process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL;
    if (env.TURSO_AUTH_TOKEN)             process.env.TURSO_AUTH_TOKEN   = env.TURSO_AUTH_TOKEN;
    if (env.WHATSAPP_TOKEN)               process.env.WHATSAPP_TOKEN     = env.WHATSAPP_TOKEN;
    if (env.WHATSAPP_PHONE_NUMBER_ID)     process.env.WHATSAPP_PHONE_NUMBER_ID = env.WHATSAPP_PHONE_NUMBER_ID;
    if (env.WHATSAPP_BUSINESS_ACCOUNT_ID) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (env.COUNTRY_CODE)                 process.env.COUNTRY_CODE = env.COUNTRY_CODE;

    return fetchHandler(request, { waitUntil: ctx.waitUntil.bind(ctx) });
  }
};
