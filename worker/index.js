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
        if (typeof app.cleanupDuplicateAdvanceBookingTransactions === 'function') await app.cleanupDuplicateAdvanceBookingTransactions();
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
      if (env.WHATSAPP_PROJECT_ID)          process.env.WHATSAPP_PROJECT_ID          = env.WHATSAPP_PROJECT_ID;
      if (env.WHATSAPP_PHONE_NUMBER_ID)     process.env.WHATSAPP_PHONE_NUMBER_ID     = env.WHATSAPP_PHONE_NUMBER_ID;
      if (env.WHATSAPP_BUSINESS_ACCOUNT_ID) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      if (env.WHATSAPP_TEMPLATE_INVOICE)    process.env.WHATSAPP_TEMPLATE_INVOICE    = env.WHATSAPP_TEMPLATE_INVOICE;
      if (env.WHATSAPP_TEMPLATE_PAYMENT_DUE) process.env.WHATSAPP_TEMPLATE_PAYMENT_DUE = env.WHATSAPP_TEMPLATE_PAYMENT_DUE;
      if (env.WHATSAPP_TEMPLATE_EXPIRY)     process.env.WHATSAPP_TEMPLATE_EXPIRY     = env.WHATSAPP_TEMPLATE_EXPIRY;
      if (env.WHATSAPP_TEMPLATE_REMINDER)   process.env.WHATSAPP_TEMPLATE_REMINDER   = env.WHATSAPP_TEMPLATE_REMINDER;
      if (env.COUNTRY_CODE)                 process.env.COUNTRY_CODE                 = env.COUNTRY_CODE;
      if (env.JWT_SECRET)                   process.env.JWT_SECRET                   = env.JWT_SECRET;

      const url = new URL(request.url);

      // ── Route 0: R2 Profile Pictures & Invoices (/api/images/*) ──
      if (url.pathname.startsWith('/api/images/')) {
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
              'Access-Control-Allow-Headers': '*'
            }
          });
        }
        if (request.method === 'GET' || request.method === 'HEAD') {
          const objectKey = decodeURIComponent(url.pathname.replace('/api/images/', ''));
          if (env.GYM_PROFILE_PICTURES) {
            try {
              let object = request.method === 'HEAD'
                ? await env.GYM_PROFILE_PICTURES.head(objectKey)
                : await env.GYM_PROFILE_PICTURES.get(objectKey);

              // Fallback: try alternative key prefixes if not directly matched
              if (!object) {
                const candidates = [];
                if (objectKey.startsWith('profile_photos/')) {
                  const stripped = objectKey.replace(/^profile_photos\//, '');
                  candidates.push(stripped);
                  candidates.push(`gallery/${stripped}`);
                } else if (objectKey.startsWith('gallery/')) {
                  const stripped = objectKey.replace(/^gallery\//, '');
                  candidates.push(stripped);
                  candidates.push(`profile_photos/${stripped}`);
                } else {
                  candidates.push(`gallery/${objectKey}`);
                  candidates.push(`profile_photos/${objectKey}`);
                }

                for (const cand of candidates) {
                  object = request.method === 'HEAD'
                    ? await env.GYM_PROFILE_PICTURES.head(cand)
                    : await env.GYM_PROFILE_PICTURES.get(cand);
                  if (object) break;
                }
              }

              if (object) {
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                const isPdf = objectKey.endsWith('.pdf');
                headers.set('Content-Type', isPdf ? 'application/pdf' : (headers.get('Content-Type') || 'image/jpeg'));
                if (object.size !== undefined) {
                  headers.set('Content-Length', String(object.size));
                }
                headers.set('Accept-Ranges', 'bytes');
                headers.set('etag', object.httpEtag);
                headers.set('Cache-Control', 'public, max-age=31536000');
                headers.set('Access-Control-Allow-Origin', '*');
                headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                const safeBasename = objectKey.split('/').pop() || 'document.pdf';
                headers.set('Content-Disposition', `inline; filename="${safeBasename}"`);
                return new Response(request.method === 'HEAD' ? null : object.body, { headers });
              }
            } catch (r2Err) {
              console.warn('R2 worker image access warning:', r2Err.message);
            }
          }

          // Resilient SVG fallback instead of broken 404 / 500
          const isGallery = objectKey.toLowerCase().includes('gallery');
          const isPdf = objectKey.toLowerCase().endsWith('.pdf');
          if (isPdf) {
            return new Response('PDF document not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
          }

          const svg = isGallery
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="none"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><rect width="600" height="400" rx="12" fill="url(#bg)"/><rect x="2" y="2" width="596" height="396" rx="10" fill="none" stroke="#334155" stroke-width="2"/><circle cx="300" cy="165" r="48" fill="#1e293b" stroke="url(#accent)" stroke-width="2.5"/><path d="M280 178l14-18 12 14 8-10 16 17h-50z" fill="url(#accent)"/><circle cx="288" cy="150" r="5" fill="#facc15"/><text x="300" y="250" text-anchor="middle" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">OLYMPIA FITNESS</text><text x="300" y="275" text-anchor="middle" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="500">Gallery Image</text></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none"><defs><linearGradient id="avatarBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#avatarBg)"/><circle cx="80" cy="62" r="28" fill="#94a3b8"/><path d="M36 136c0-24.3 19.7-44 44-44s44 19.7 44 44v4H36v-4z" fill="#94a3b8"/></svg>`;

          return new Response(svg, {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=60',
              'Access-Control-Allow-Origin': '*'
            }
          });
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
      console.error('[Worker Fatal Error]', err.message, err.stack);
      return new Response(JSON.stringify({
        error: 'An unexpected internal server error occurred. Please try again later.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
