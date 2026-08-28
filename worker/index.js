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

let dbInitPromise = null;
const ensureDb = (env, ctx) => {
  if (env.DB) setD1Database(env.DB);
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        if (typeof app.initDb === 'function') await app.initDb();
        if (typeof app.autoActivateAdvanceBookings === 'function') await app.autoActivateAdvanceBookings();
        if (typeof app.autoExpireAssignments === 'function') await app.autoExpireAssignments();
      } catch (err) {
        console.error('Worker background task error:', err);
      }
    })();
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(dbInitPromise);
    }
  }
};

export default {
  /**
   * @param {Request} request
   * @param {object} env   Cloudflare bindings (DB = D1, ASSETS = static dist files)
   * @param {object} ctx   Execution context
   */
  async fetch(request, env, ctx) {
    try {
      // ── Inject D1 database binding into db.js & ensure DB schema & PT backfill ──
      if (env.DB) {
        ensureDb(env, ctx);
      }

      // ── Copy secret env vars for WhatsApp ──
      if (env.WHATSAPP_KEY)                 process.env.WHATSAPP_KEY                 = env.WHATSAPP_KEY;
      if (env.WHATSAPP_TOKEN)               process.env.WHATSAPP_TOKEN               = env.WHATSAPP_TOKEN;
      if (env.WHATSAPP_PHONE_NUMBER_ID)     process.env.WHATSAPP_PHONE_NUMBER_ID     = env.WHATSAPP_PHONE_NUMBER_ID;
      if (env.WHATSAPP_BUSINESS_ACCOUNT_ID) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      if (env.COUNTRY_CODE)                 process.env.COUNTRY_CODE                 = env.COUNTRY_CODE;

      const url = new URL(request.url);

      // ── Route 0: R2 Profile Pictures (/api/images/*) ──
      if (request.method === 'GET' && url.pathname.startsWith('/api/images/')) {
        const objectKey = decodeURIComponent(url.pathname.replace('/api/images/', ''));
        if (env.GYM_PROFILE_PICTURES) {
          const object = await env.GYM_PROFILE_PICTURES.get(objectKey);
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            headers.set('Cache-Control', 'public, max-age=31536000');
            headers.set('Access-Control-Allow-Origin', '*');
            return new Response(object.body, { headers });
          }
        }
      }

      // ── Route 1: Backend API calls (/api/*) ──
      if (url.pathname.startsWith('/api')) {
        return await handler(request, env, ctx);
      }

      // ── Route 2: Static assets via Cloudflare env.ASSETS ──
      if (env.ASSETS) {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          const resHeaders = new Headers(assetResponse.headers);
          if (/\.(js|css|woff2?|png|jpe?g|svg|ico|webp)$/i.test(url.pathname)) {
            resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          }
          return new Response(assetResponse.body, {
            status: assetResponse.status,
            statusText: assetResponse.statusText,
            headers: resHeaders
          });
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
