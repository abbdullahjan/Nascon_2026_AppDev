'use strict';

const db            = require('../config/db');
const { AppError }  = require('../utils/errors');

const SPORT_ID_REGEX    = /^[a-z0-9_-]{2,40}$/;
const EVENT_KEY_REGEX   = /^[a-z0-9_]{1,40}$/;
const VALID_MODELS      = ['event', 'innings', 'round'];
const VALID_OT_POLICIES = ['none', 'extra_time', 'shootout', 'golden_score', 'super_over'];
const VALID_TIEBREAKS   = ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'];

/**
 * Validate and create a sport from JSON config.
 * No sport logic is ever hard-coded — everything comes from this config.
 */
async function createSport(body) {
  const fields = [];

  // Validate sport_id
  if (!body.sport_id || !SPORT_ID_REGEX.test(body.sport_id)) fields.push('sport_id');

  // Validate name
  if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 80) fields.push('name');

  // Validate scoring_model
  if (!VALID_MODELS.includes(body.scoring_model)) fields.push('scoring_model');

  // Validate periods
  if (!body.periods || typeof body.periods !== 'object') {
    fields.push('periods');
  } else {
    const p = body.periods;
    if (body.scoring_model === 'event') {
      if (!Number.isInteger(p.count) || p.count < 1) fields.push('periods.count');
      if (!Number.isInteger(p.duration_minutes) || p.duration_minutes < 1) fields.push('periods.duration_minutes');
    } else if (body.scoring_model === 'innings') {
      if (!Number.isInteger(p.innings_per_team) || p.innings_per_team < 1) fields.push('periods.innings_per_team');
      if (!Number.isInteger(p.overs_per_innings) || p.overs_per_innings < 1) fields.push('periods.overs_per_innings');
      if (!Number.isInteger(p.balls_per_over) || p.balls_per_over < 1) fields.push('periods.balls_per_over');
      if (!Number.isInteger(p.wickets_per_innings) || p.wickets_per_innings < 1) fields.push('periods.wickets_per_innings');
    } else if (body.scoring_model === 'round') {
      if (!Number.isInteger(p.best_of) || p.best_of < 1 || p.best_of % 2 === 0) fields.push('periods.best_of');
    }
  }

  // Validate scoring_events
  if (!body.scoring_events || typeof body.scoring_events !== 'object' || Object.keys(body.scoring_events).length < 1) {
    fields.push('scoring_events');
  } else {
    for (const [key, val] of Object.entries(body.scoring_events)) {
      if (!EVENT_KEY_REGEX.test(key)) { fields.push(`scoring_events.${key}`); continue; }
      if (body.scoring_model === 'event') {
        if (!Number.isInteger(val.points) || val.points < 1) fields.push(`scoring_events.${key}.points`);
      } else if (body.scoring_model === 'innings') {
        if (!Number.isInteger(val.runs) || val.runs < 0) fields.push(`scoring_events.${key}.runs`);
        if (typeof val.legal_ball !== 'boolean') fields.push(`scoring_events.${key}.legal_ball`);
        if (typeof val.wicket !== 'boolean') fields.push(`scoring_events.${key}.wicket`);
      } else if (body.scoring_model === 'round') {
        if (!Number.isInteger(val.rounds) || val.rounds < 1) fields.push(`scoring_events.${key}.rounds`);
      }
    }
  }

  // Validate draw_allowed
  if (typeof body.draw_allowed !== 'boolean') fields.push('draw_allowed');

  // Validate overtime
  if (!body.overtime || !VALID_OT_POLICIES.includes(body.overtime.policy)) fields.push('overtime.policy');

  // Validate tie_break_order (optional)
  if (body.tie_break_order !== undefined) {
    if (!Array.isArray(body.tie_break_order)) {
      fields.push('tie_break_order');
    } else {
      const seen = new Set();
      for (const item of body.tie_break_order) {
        if (!VALID_TIEBREAKS.includes(item) || seen.has(item)) { fields.push('tie_break_order'); break; }
        seen.add(item);
      }
    }
  }

  // Validate roster
  if (!body.roster || !Number.isInteger(body.roster.min_squad_size) || !Number.isInteger(body.roster.max_squad_size)) {
    fields.push('roster');
  } else if (body.roster.min_squad_size > body.roster.max_squad_size) {
    fields.push('roster.min_squad_size');
  }

  if (fields.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'One or more fields are invalid.', { fields });
  }

  // Check duplicate
  const existing = await db('sports').where({ sport_id: body.sport_id }).first();
  if (existing) throw new AppError(409, 'SPORT_EXISTS', `Sport '${body.sport_id}' already exists.`, {});

  // Normalise tie_break_order — draw_lots always last
  let tbo = body.tie_break_order || VALID_TIEBREAKS.filter(t => t !== 'draw_lots');
  if (!tbo.includes('draw_lots')) tbo = [...tbo, 'draw_lots'];

  const config = { ...body, tie_break_order: tbo };

  await db('sports').insert({
    sport_id:      body.sport_id,
    name:          body.name,
    scoring_model: body.scoring_model,
    config:        JSON.stringify(config),
  });

  return { sport_id: body.sport_id, status: 'created', config };
}

/**
 * Fetch a sport by id. Throws 404 if not found.
 */
async function getSport(sport_id) {
  const row = await db('sports').where({ sport_id }).first();
  if (!row) throw new AppError(404, 'SPORT_NOT_FOUND', `Sport '${sport_id}' not found.`, {});
  return JSON.parse(row.config);
}

module.exports = { createSport, getSport };
