'use strict';

const path = require('path');
const fs   = require('fs');

/**
 * Module registry — auto-discovers all Phase II feature modules under
 * src/modules/<name>/index.js and exposes:
 *
 *   registerAll(app)  — calls module.registerRoutes(app) for each module
 *   resetAll(trx)     — calls module.reset(trx) for each module (in reset order)
 *   seedAll(trx)      — calls module.seed(trx) for each module (in seed order)
 *
 * Each module MUST export: { registerRoutes, reset, seed }
 * All three functions receive a Knex transaction (trx) or the Fastify app instance.
 * They must be async and idempotent.
 *
 * Load order (deterministic — alphabetical by folder name):
 *   costream, guest, moderation, qr, realtime, streaming, web
 *
 * To add a new module: create src/modules/<name>/index.js with the three exports.
 * No changes needed here.
 */

const MODULES_DIR = __dirname;

// Collect all sub-directories that contain an index.js
function loadModules() {
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(MODULES_DIR, entry.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;

    try {
      const mod = require(indexPath);
      // Validate the module contract
      if (typeof mod.registerRoutes !== 'function') {
        throw new Error(`Module '${entry.name}' must export registerRoutes(app).`);
      }
      if (typeof mod.reset !== 'function') {
        throw new Error(`Module '${entry.name}' must export reset(trx).`);
      }
      if (typeof mod.seed !== 'function') {
        throw new Error(`Module '${entry.name}' must export seed(trx).`);
      }
      modules.push({ name: entry.name, mod });
    } catch (err) {
      // Re-throw with module name for easier debugging
      throw new Error(`Failed to load module '${entry.name}': ${err.message}`);
    }
  }

  // Sort deterministically so load order is stable across platforms
  modules.sort((a, b) => a.name.localeCompare(b.name));
  return modules;
}

// Lazily loaded once on first call
let _modules = null;
function getModules() {
  if (!_modules) _modules = loadModules();
  return _modules;
}

/**
 * Register all module routes with the Fastify app.
 * Called once during app startup (after Phase I routes are registered).
 * Phase II audit routes use prefix /audit/v1 — modules set their own prefixes internally.
 */
async function registerAll(app) {
  for (const { name, mod } of getModules()) {
    try {
      await mod.registerRoutes(app);
    } catch (err) {
      throw new Error(`registerRoutes failed for module '${name}': ${err.message}`);
    }
  }
}

/**
 * Call reset() on every module (within a Knex transaction).
 * Executed by POST /audit/v1/reset AFTER Phase I tables are truncated.
 * Modules truncate their own Phase II tables here.
 */
async function resetAll(trx) {
  for (const { name, mod } of getModules()) {
    try {
      await mod.reset(trx);
    } catch (err) {
      throw new Error(`reset() failed for module '${name}': ${err.message}`);
    }
  }
}

/**
 * Call seed() on every module (within a Knex transaction).
 * Executed by POST /audit/v1/reset AFTER Phase I baseline data is seeded.
 * Modules insert their Phase II baseline entities here.
 */
async function seedAll(trx) {
  for (const { name, mod } of getModules()) {
    try {
      await mod.seed(trx);
    } catch (err) {
      throw new Error(`seed() failed for module '${name}': ${err.message}`);
    }
  }
}

module.exports = { registerAll, resetAll, seedAll };
