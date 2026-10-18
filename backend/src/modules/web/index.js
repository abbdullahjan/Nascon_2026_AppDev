'use strict';

/**
 * Module: web
 * Owner: Person A
 * Handles: Guest Web Player UI served at /web/*
 * Surfaces: /web/matches/:id/live, /web/matches/:id/vod, /web/matches/:id/preview,
 *           /web/matches/:id/notice, /web/players/:id, /web/clubs/:id,
 *           /web/costream/:id
 * DOM contract: 9 mandatory data-testid attributes (Section 6.2.2)
 */

async function registerRoutes(app) {
  // TODO: implement Guest Web Player HTML/SSE routes (Section 6.2.2)
}

async function reset(trx) {
  // No DB state to reset — static templates.
}

async function seed(trx) {
  // No seed data required.
}

module.exports = { registerRoutes, reset, seed };
