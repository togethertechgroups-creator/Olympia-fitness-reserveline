/**
 * Cloudflare Worker entry point for Olympia Fitness.
 *
 * Handles:
 *  1. /api/* requests → Express app (DB operations with D1)
 *  2. Static files (HTML, JS, CSS, images) → env.ASSETS (Cloudflare Edge CDN)
 *  3. SPA routing fallback → env.ASSETS (/index.html)
 */

import app from '../server/index.js';
import { setD1Database } from '../server/db.js';
import { expressToFetch } from './express-adapter.js';

const handler = expressToFetch(app);

export default {
  /**
   * @param {Request} request
   * @param {object} env   Cloudflare bindings (DB = D1, ASSETS = static dist files)
   * @param {object} ctx   Execution context
   */
  async fetch(request, env, ctx) {
    try {
      // ── Inject D1 database binding into db.js ──
      if (env.DB) setD1Database(env.DB);

      // ── Copy secret env vars for WhatsApp ──
      if (env.WHATSAPP_TOKEN)               process.env.WHATSAPP_TOKEN               = env.WHATSAPP_TOKEN;
      if (env.WHATSAPP_PHONE_NUMBER_ID)     process.env.WHATSAPP_PHONE_NUMBER_ID     = env.WHATSAPP_PHONE_NUMBER_ID;
      if (env.WHATSAPP_BUSINESS_ACCOUNT_ID) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      if (env.COUNTRY_CODE)                 process.env.COUNTRY_CODE                 = env.COUNTRY_CODE;

      const url = new URL(request.url);

      // ── Route 1: Backend API calls (/api/*) ──
      if (url.pathname.startsWith('/api')) {
        return await handler(request, env, ctx);
      }

      // ── Route 2: Static assets via Cloudflare env.ASSETS ──
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
        // SPA Fallback for client-side routing (e.g. /clients, /dashboard -> /index.html)
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      }

      // Fallback to Express handler
      return await handler(request, env, ctx);
    } catch (err) {
      return new Response(JSON.stringify({
        error: err.message,
        name:  err.name,
        stack: err.stack?.split('\n').slice(0, 8).join('\n')
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
