/**
 * Native Express → Cloudflare Worker Fetch API Bridge
 *
 * Strategy: pre-parse the JSON body ourselves, set req.body directly,
 * and set a flag so Express's body-parser skips re-parsing.
 * This bypasses all stream/readable issues in the Workers runtime.
 */

import http from 'node:http';
import { EventEmitter } from 'node:events';

export function expressToFetch(expressApp) {
  return async function fetchHandler(request, env, ctx) {
    const url = new URL(request.url);

    // ── Pre-read the body as text ──────────────────────────────────────────
    let rawBody = '';
    let parsedBody = undefined;
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        rawBody = await request.text();
        if (rawBody) {
          const ct = (request.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            parsedBody = JSON.parse(rawBody);
          } else {
            parsedBody = rawBody;
          }
        }
      } catch (_) {
        parsedBody = rawBody || undefined;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        // ── Mock socket ───────────────────────────────────────────────────
        const dummySocket = new EventEmitter();
        dummySocket.encrypted    = true;
        dummySocket.remoteAddress = '127.0.0.1';
        dummySocket.destroy      = () => {};
        dummySocket.write        = () => {};
        dummySocket.end          = () => {};

        // ── Mock IncomingMessage ──────────────────────────────────────────
        const req = new http.IncomingMessage(dummySocket);
        req.url    = url.pathname + url.search;
        req.method = request.method;

        // Copy headers
        const reqHeaders = {};
        for (const [k, v] of request.headers.entries()) {
          reqHeaders[k.toLowerCase()] = v;
        }
        if (rawBody) {
          reqHeaders['content-length'] = String(Buffer.byteLength(rawBody));
        }
        req.headers = reqHeaders;

        // ── Pre-set body so body-parser middleware skips streaming ─────────
        if (parsedBody !== undefined) {
          req.body = parsedBody;         // Express reads req.body directly if set
          req._body = true;              // tell body-parser it's already parsed
        }

        // ── Mock ServerResponse ───────────────────────────────────────────
        const res = new http.ServerResponse(req);
        const chunks = [];

        res.write = function(chunk, encoding, cb) {
          if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
          }
          if (typeof encoding === 'function') encoding();
          if (typeof cb === 'function') cb();
          return true;
        };

        res.end = function(chunk, encoding, cb) {
          if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8'));
          }
          if (typeof encoding === 'function') encoding();
          if (typeof cb === 'function') cb();

          const responseBuffer = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, val] of Object.entries(res.getHeaders())) {
            if (Array.isArray(val)) {
              val.forEach(v => headers.append(key, String(v)));
            } else if (val !== undefined) {
              headers.set(key, String(val));
            }
          }

          resolve(new Response(responseBuffer, {
            status:     res.statusCode  || 200,
            statusText: res.statusMessage || 'OK',
            headers
          }));
        };

        // ── Hand off to Express (no body stream needed) ───────────────────
        expressApp(req, res);

      } catch (err) {
        reject(err);
      }
    });
  };
}
