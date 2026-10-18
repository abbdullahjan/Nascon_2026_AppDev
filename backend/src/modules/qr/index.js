'use strict';

/**
 * Module: qr
 * Owner: Person A
 * Spec: Section 5.6 (QR deep-linking), Section 8.2 (match status transitions)
 *
 * Routes:
 *   GET  /audit/v1/qr/:entity_id              — QR metadata + signature
 *   GET  /audit/v1/qr/:entity_id?inspect=true — same, explicit inspect mode
 *   GET  /audit/v1/qr/:entity_id/export.svg   — SVG export
 *   GET  /audit/v1/qr/:entity_id/export.png   — PNG export
 *   GET  /audit/v1/qr/:entity_id/export.pdf   — PDF export
 *   GET  /q/:short_code                        — public 302 redirect + telemetry
 */

const QRCode  = require('qrcode');
const PDFDocument = require('pdfkit');
const db      = require('../../config/db');
const { sign_day2, throwNotFound, config } = require('../../shared');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive the live target_route for an entity based on its type and id.
 * This is recomputed from live DB state on every /audit/v1/qr call.
 *
 * Routing rules (spec 5.6):
 *   match    → /api/v1/matches/:entity_id
 *   player   → /api/v1/players/:entity_id
 *   club     → /api/v1/clubs/:entity_id
 *   costream → /audit/v1/costream/session/:entity_id
 */
function buildTargetRoute(entityType, entityId) {
  switch (entityType) {
    case 'match':    return `/api/v1/matches/${entityId}`;
    case 'player':   return `/api/v1/players/${entityId}`;
    case 'club':     return `/api/v1/clubs/${entityId}`;
    case 'costream': return `/audit/v1/costream/session/${entityId}`;
    default:         return `/api/v1/${entityType}/${entityId}`;
  }
}

/**
 * Derive device family from User-Agent string.
 * Returns 'mobile' or 'desktop'. No raw UA stored.
 */
function deviceFamily(ua) {
  if (!ua) return 'desktop';
  const lower = ua.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(lower)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * UTC minute bucket: floor(Date.now() / 60000) * 60000
 * Stored as bigint ms — identifies the UTC minute a scan occurred.
 */
function utcMinuteBucket() {
  return Math.floor(Date.now() / 60000) * 60000;
}

/**
 * Look up a QR mapping by entity_id. Throws 404 QR_NOT_FOUND if missing.
 */
async function requireMapping(entityId) {
  const row = await db('qr_mappings').where({ entity_id: entityId }).first();
  if (!row) {
    throwNotFound('QR_NOT_FOUND', `No QR mapping found for entity '${entityId}'.`, { entity_id: entityId });
  }
  return row;
}

// ── Route registration ────────────────────────────────────────────────────────

async function registerRoutes(app) {

  // ── GET /audit/v1/qr/:entity_id  (+ ?inspect=true) ─────────────────────────
  app.get('/audit/v1/qr/:entity_id', async (request, reply) => {
    const { entity_id } = request.params;
    // inspect param is accepted but does not change the response shape
    // (both modes return the same fields per spec 5.6)

    const mapping = await requireMapping(entity_id);

    // target_route is dynamic — recomputed from live DB state every call
    const target_route = buildTargetRoute(mapping.entity_type, entity_id);

    // sig_payload per spec 5.6 table
    const sigPayload = {
      entity_id,
      entity_type: mapping.entity_type,
      short_code:  mapping.short_code,
      target_route,
    };

    const signature = sign_day2(entity_id, sigPayload);

    return reply.status(200).send({
      entity_id,
      entity_type:  mapping.entity_type,
      short_url:    mapping.short_url,   // never changes — always the seeded value
      target_route,
      signature,
      scan_count:   mapping.scan_count,
    });
  });

  // ── GET /audit/v1/qr/:entity_id/export.svg ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.svg', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping = await requireMapping(entity_id);
    const target_route = buildTargetRoute(mapping.entity_type, entity_id);

    // Generate SVG string pointing to the live target_route URL
    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const qrContent = `${baseUrl}${target_route}`;
    const svgString = await QRCode.toString(qrContent, { type: 'svg', errorCorrectionLevel: 'M' });

    return reply
      .status(200)
      .header('Content-Type', 'image/svg+xml')
      .send(svgString);
  });

  // ── GET /audit/v1/qr/:entity_id/export.png ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.png', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping = await requireMapping(entity_id);
    const target_route = buildTargetRoute(mapping.entity_type, entity_id);

    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const qrContent = `${baseUrl}${target_route}`;
    const pngBuffer = await QRCode.toBuffer(qrContent, { type: 'png', errorCorrectionLevel: 'M' });

    return reply
      .status(200)
      .header('Content-Type', 'image/png')
      .send(pngBuffer);
  });

  // ── GET /audit/v1/qr/:entity_id/export.pdf ─────────────────────────────────
  app.get('/audit/v1/qr/:entity_id/export.pdf', async (request, reply) => {
    const { entity_id } = request.params;
    const mapping = await requireMapping(entity_id);
    const target_route = buildTargetRoute(mapping.entity_type, entity_id);

    const baseUrl   = config.BASE_URL || `http://localhost:${config.PORT}`;
    const qrContent = `${baseUrl}${target_route}`;

    // Generate PNG buffer to embed in PDF
    const pngBuffer = await QRCode.toBuffer(qrContent, { type: 'png', errorCorrectionLevel: 'M', width: 200 });

    // Build PDF synchronously into a Buffer
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc    = new PDFDocument({
        size:     'A4',
        margin:   50,
        compress: false,
        info: {
          Title:   `QR Code — ${entity_id}`,
          Subject: entity_id,
          Author:  'NaSCon 26',
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title line contains entity_id (spec requirement)
      doc.fontSize(16).text(`QR Code — ${entity_id}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Entity type: ${mapping.entity_type}`, { align: 'center' });
      doc.fontSize(10).text(`Target route: ${target_route}`, { align: 'center' });
      doc.moveDown(1);

      // Embed QR image centered
      const imgX = (doc.page.width - 200) / 2;
      doc.image(pngBuffer, imgX, doc.y, { width: 200 });

      doc.end();
    });

    return reply
      .status(200)
      .header('Content-Type', 'application/pdf')
      .send(pdfBuffer);
  });

  // ── GET /q/:short_code  — public redirect + privacy-safe telemetry ──────────
  app.get('/q/:short_code', async (request, reply) => {
    const { short_code } = request.params;

    const mapping = await db('qr_mappings').where({ short_code }).first();
    if (!mapping) {
      // Return error envelope directly — this is a public route not under /audit/v1
      return reply.status(404).send({
        error: {
          code:    'QR_NOT_FOUND',
          message: `No QR mapping found for short code '${short_code}'.`,
          details: { short_code },
        },
      });
    }

    // Record telemetry: upsert per (entity_id, device_family, scanned_at_minute)
    // No IP, no full UA, no cookies — spec NFR-9.
    const family  = deviceFamily(request.headers['user-agent']);
    const bucket  = utcMinuteBucket();

    // Atomic scan_count increment (no read-then-write — CONVENTIONS.md §7)
    await db.transaction(async (trx) => {
      // Insert telemetry row (always append — each scan is its own event)
      await trx('qr_scan_events').insert({
        entity_id:        mapping.entity_id,
        device_family:    family,
        scanned_at_minute: bucket,
      });

      // Increment scan_count atomically in SQL
      await trx('qr_mappings')
        .where({ entity_id: mapping.entity_id })
        .increment('scan_count', 1);
    });

    // Recompute live target_route and redirect
    const target_route = buildTargetRoute(mapping.entity_type, mapping.entity_id);
    return reply.redirect(302, target_route);
  });
}

// ── Module lifecycle ──────────────────────────────────────────────────────────

async function reset(trx) {
  // Truncate in FK-safe order (scan_events references qr_mappings)
  await trx('qr_scan_events').truncate();
  await trx('qr_mappings').truncate();
}

async function seed(trx) {
  // Baseline QR mappings are seeded in resetService.js (spec 5.2).
  // This hook is a no-op to avoid double-insert; resetService inserts
  // match-m1, player-alpha-1, club-alpha-1 before seedAll() is called.
}

module.exports = { registerRoutes, reset, seed };
