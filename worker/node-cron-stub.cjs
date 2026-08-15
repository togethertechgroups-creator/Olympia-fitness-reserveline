/**
 * node-cron stub for Cloudflare Workers.
 *
 * Cloudflare Workers don't support background timers or cron jobs at the
 * module initialization level (global scope I/O is forbidden).
 * 
 * The scheduled tasks (WhatsApp reminders, auto-expiry) that use node-cron
 * in server/index.js are effectively disabled in the CF Worker context.
 * These can be replaced with Cloudflare Cron Triggers if needed in the future.
 *
 * See: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
 */

'use strict';

const noopTask = {
  start: () => noopTask,
  stop: () => noopTask,
  destroy: () => noopTask,
};

module.exports = {
  schedule: (_expression, _handler, _options) => {
    // Silently no-op in Workers context
    return noopTask;
  },
  validate: (_expression) => true,
  getTasks: () => new Map(),
};
