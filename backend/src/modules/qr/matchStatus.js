'use strict';

/**
 * matchStatus.js — spec section 8.2
 *
 * applyMatchEvent(event) maps an incoming match event type to the new match
 * status string. Returns null if the event does not change match status.
 *
 * Spec 8.2 status transitions:
 *   match_start    → in_progress
 *   match_end      → completed
 *   postponed      → postponed
 *   cancelled      → cancelled
 *   suspended      → suspended
 *   resumed        → in_progress
 *
 * Signature is stable: applyMatchEvent({ type, ...rest }) → string | null
 */

const STATUS_MAP = {
  match_start: 'in_progress',
  match_end:   'completed',
  postponed:   'postponed',
  cancelled:   'cancelled',
  suspended:   'suspended',
  resumed:     'in_progress',
};

/**
 * @param {{ type: string }} event
 * @returns {string|null} new status string, or null if event doesn't affect status
 */
function applyMatchEvent(event) {
  if (!event || typeof event.type !== 'string') return null;
  return STATUS_MAP[event.type] ?? null;
}

module.exports = { applyMatchEvent };
