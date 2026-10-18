'use strict';

/**
 * Module: qr
 * Owner: Person A
 * Spec: Section 5.6 (QR deep-linking), Section 8.2 (match status transitions)
 *
 * Routes:
 *   GET  /audit/v1/qr/:entity_id              — QR metadata + signature
 *   GET  /audit/v1/qr/:entity_id?inspect=true — same but no scan_count increment
 *   GET  /audit/v1/qr/:entity_id/export.svg   — SVG export
 *   GET  /audit/v1/qr/:entity_id/export.png   — PNG export
 *   GET  /audit/v1/qr/:entity_id/export.pdf   — PDF export
 *   GET  /q/:short_code                        — public 302 redirect + telemetry
 */

const QRCode      = require('qrcode');
const PDFDocument = require('pdfkit');
const db          = require('../../config/db');
const { sign_day2, throwNotFound, config } = require('../../shared');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive the live target_route from DB state (spec 5.6 Dynamic Target Mutation).
 * MUST be async — reads match status from DB for match entities.
 *
 *   match upcoming               → /web/matches/{id}/preview
 *   match in_progress            → /web/matches/{id}/live
 *   match completed              → /web/matches/{id}/vod
 *   match postponed/cancelled/abandoned → /web/matches/{id}/notice?state={status}
 *   player  (player-*)           → /web/players/{id}
 *   club    (club-*)             → /web/clubs/{id}
 *   costream (cs-session-*)      → /web/costream/{id}
 */
async function buildTargetRoute(entityType, entityId) {
  if (entityType === 'match') {
    const match  = await db('matches').where({ match_id: entityId }).first();
    const status = match ? match.status : 'upcoming';
    switch (status) {
      case 'in_progress': return `/web/matches/${entityId}/live`;
      case 'completed':   return `/web/matches/${entityId}/vod`;
      case 'postponed':
      case 'cancelled':
      case 'abandoned':   return `/web/matches/${entityId}/notice?state=${status}`;
      default:            return `/web/matches/${entityId}/preview`;
    }
  }
  if (entityType === 'player')   return `/web/players/${entityId}`;
  if (entityType === 'club')     return `/web/clubs/${entityId}`;
  if (entityType === 'costream') return `/web/costream/${entityId}`;
  return `/web/${entityType}/${entityId}`;
}

/** Get entity_status for the response (match only; others return null). */
async function getEntityStatus(entityType, entityId) {
  if (entityType === 'match') {
    const match = await db('matches').where({ match_id: entityId }).first();
    return match ? match.status : null;
  }
  return null;
}

/** Derive device family from User-Agent — 'mobile' or 'desktop'. No raw UA stored. */
function deviceFamily(ua) {
  if (!ua) return 'desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** UTC minute bucket — floor to nearest minute (ms). */
function utcMinuteBucket() {
  return Math.floor(Date.now() / 60000) * 60000;
}

/** Look up QR mapping by entity_id; 404 QR_NOT_FOUND if missing. */
async function requireMapping(entityId) {
  const row = await db('qr_mappings').where({ entity_id: entityId }).first();
  if (!row) throwNotFound('QR_NOT_FOUND', `No QR mapping found for entity '${entityId}'.`, { entity_id: entityId });
  return row;
}

// ── Route registration ────────────────────────────────────────────────────────

async function registerRoutes(app) {

  // ── GET /audit/v1/qr/:entity_id  (+ ?inspect=true) ─────────────────────────
  // inspect=true → read metadata, do NOT increment scan_count (spec 5.6)
  app.get('/audit/v1/qr/:entity_id', async (request, reply) => {
    const { entity_id } = request.params;
    const inspect = request.query.inspect === 'true';

    const mapping      = await requireMapping(entity_id);
    const target_route = await buildTargetRoute(mapping.entity_type, entity_id);
    const entity_status = await getEntityStatus(mapping.entity_type, entity_id);

    // Increment scan_count unless ?inspect=true (spec: "reads metadata without incrementing")
    if (!inspect) {
      await db('qr_mappings').where({ entity_id }).increment('scan_count', 1);
    }

    // Re-read scan_count after potential increment
    const updated     = await db('qr_mappings').where({ entity_id }).first();
    const scan_count  = updated ? updated.scan_count : mapping.scan_count;

    // sig_payload per spec 5.3 table: entity_id, short_url, target_route
    const sigPayload = {
      entity_id,
      short_url:    mapping.short_url,
      target_route,
    };
    const signature = sign_day2(entity_id, sigPayload);

    const baseUrl = config.BASE_URL || `http://localhost:${config.PORT}`;

    return reply.status(200).send({
      entity_id,
      entity_type:    mapping.entity_type,
      entity_status,
      short_url:      mapping.short_url,
      target_route,
      deep_link_uri:  `nascon://entity/${entity_id}`,
      scan_count,
      export_formats: {
        svg: `${baseUrl}/audit/v1/qr/${entity_id}/export.svg`,
        png: `${baseUrl}/audit/v1/qr/${entity_id}/export.png`,
        pdf: `${baseUrl}/audit/v1/qr/${entity_id}/export.pdf`,
      },
      signature,
    });
  });

  // ── GET /audit/v1/qr/:entity_id/export.svg ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.svg', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping      = await requireMapping(entity_id);
    const target_route = await buildTargetRoute(mapping.entity_type, entity_id);

    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const svgString = await QRCode.toString(`${baseUrl}${target_route}`, {
      type: 'svg', errorCorrectionLevel: 'M',
    });

    return reply.status(200).header('Content-Type', 'image/svg+xml').send(svgString);
  });

  // ── GET /audit/v1/qr/:entity_id/export.png ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.png', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping      = await requireMapping(entity_id);
    const target_route = await buildTargetRoute(mapping.entity_type, entity_id);

    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const pngBuffer = await QRCode.toBuffer(`${baseUrl}${target_route}`, {
      type: 'png', errorCorrectionLevel: 'M',
    });

    return reply.status(200).header('Content-Type', 'image/png').send(pngBuffer);
  });

  // ── GET /audit/v1/qr/:entity_id/export.pdf ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.pdf', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping      = await requireMapping(entity_id);
    const target_route = await buildTargetRoute(mapping.entity_type, entity_id);

    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const pngBuffer = await QRCode.toBuffer(`${baseUrl}${target_route}`, {
      type: 'png', errorCorrectionLevel: 'M', width: 200,
    });

    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4', margin: 50, compress: false,
        info: { Title: `QR Code — ${entity_id}`, Subject: entity_id, Author: 'NaSCon 26' },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(`QR Code — ${entity_id}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Entity type: ${mapping.entity_type}`, { align: 'center' });
      doc.fontSize(10).text(`Target route: ${target_route}`, { align: 'center' });
      doc.moveDown(1);
      doc.image(pngBuffer, (doc.page.width - 200) / 2, doc.y, { width: 200 });
      doc.end();
    });

    return reply.status(200).header('Content-Type', 'application/pdf').send(pdfBuffer);
  });

  // ── GET /q/:short_code  — public 302 redirect + privacy-safe telemetry ──────
  app.get('/q/:short_code', async (request, reply) => {
    const { short_code } = request.params;

    const mapping = await db('qr_mappings').where({ short_code }).first();
    if (!mapping) {
      return reply.status(404).send({
        error: {
          code:    'QR_NOT_FOUND',
          message: `No QR mapping found for short code '${short_code}'.`,
          details: { short_code },
        },
      });
    }

    const family = deviceFamily(request.headers['user-agent']);
    const bucket = utcMinuteBucket();

    await db.transaction(async (trx) => {
      await trx('qr_scan_events').insert({
        entity_id:         mapping.entity_id,
        device_family:     family,
        scanned_at_minute: bucket,
      });
      await trx('qr_mappings').where({ entity_id: mapping.entity_id }).increment('scan_count', 1);
    });

    const target_route = await buildTargetRoute(mapping.entity_type, mapping.entity_id);
    return reply.redirect(302, target_route);
  });
}

// ── Module lifecycle ──────────────────────────────────────────────────────────

async function reset(trx) {
  await trx('qr_scan_events').truncate();
  await trx('qr_mappings').truncate();
}

async function seed(trx) {
  // Baseline QR mappings seeded in resetService.js before seedAll() — no-op here.
}

module.exports = { registerRoutes, reset, seed };
