/**
 * Native Express → Cloudflare Worker Fetch API Bridge
 *
 * Strategy: pre-parse the body safely via arrayBuffer, set req.body directly,
 * and push buffer to req stream (req.push(null)) so readable stream is complete.
 * This bypasses all stream/readable issues in the Workers runtime.
 */

import http from 'node:http';
import { EventEmitter } from 'node:events';

export function expressToFetch(expressApp) {
  return async function fetchHandler(request, env, ctx) {
    const url = new URL(request.url);

    // ── 1. Read request body safely ─────────────────────────────────────────
    let rawBody = '';
    let parsedBody = undefined;
    if (request.body && !request.bodyUsed && request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const buffer = await request.arrayBuffer();
        rawBody = new TextDecoder().decode(buffer);
        if (rawBody) {
          const ct = (request.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            parsedBody = JSON.parse(rawBody);
          } else {
            parsedBody = rawBody;
          }
        }
      } catch (_) {
        rawBody = '';
        parsedBody = undefined;
      }
    }

    return new Promise((resolve) => {
      try {
        // ── 2. Mock Socket ──────────────────────────────────────────────────
        const dummySocket = new EventEmitter();
        dummySocket.encrypted     = true;
        dummySocket.remoteAddress = '127.0.0.1';
        dummySocket.destroy       = () => {};
        dummySocket.write         = () => {};
        dummySocket.end           = () => {};

        // ── 3. Mock IncomingMessage ─────────────────────────────────────────
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

        // ── 4. Feed Stream & End it ─────────────────────────────────────────
        if (rawBody) {
          req.push(Buffer.from(rawBody));
        }
        req.push(null); // Signal EOF to Stream.Readable

        if (parsedBody !== undefined) {
          req.body = parsedBody;
          req._body = true;
        }

        // ── 5. Mock ServerResponse ──────────────────────────────────────────
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

        // ── 6. Hand off to Express ──────────────────────────────────────────
        expressApp(req, res);

      } catch (err) {
        resolve(new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    });
  };
}
