'use strict';

/**
 * streaming/recorder.js
 *
 * Handles VOD recording lifecycle:
 *   1. MediaMTX calls POST /internal/mediamtx/recording when a stream ends
 *      and a local recording file is ready.
 *   2. We upload the file to RustFS via the AWS S3 SDK (S3-compatible).
 *   3. We insert a row into vod_recordings with the VOD URL.
 *
 * All S3 config comes from env vars ONLY (spec project.md rule):
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION
 *
 * The S3 client is lazily initialised on first use so the backend starts
 * even before @aws-sdk/client-s3 is installed (install on Docker bring-up).
 *
 * MediaMTX recording webhook body (mediamtx.yml onRecordSegmentComplete):
 * {
 *   "stream_key": "sk_live_...",
 *   "file_path":  "/recordings/sk_live_.../2026-10-18_10-30-00-000.mp4",
 *   "duration":   120,            // seconds (optional)
 *   "size":       52428800        // bytes (optional)
 * }
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db   = require('../../config/db');

// ── S3 client (lazy) ──────────────────────────────────────────────────────────
let _s3Client = null;

function getS3Client() {
  if (_s3Client) return _s3Client;

  // Lazy require so the module loads even if the SDK isn't installed yet
  const { S3Client } = require('@aws-sdk/client-s3');

  _s3Client = new S3Client({
    endpoint:         process.env.S3_ENDPOINT || 'http://rustfs:9000',
    region:           process.env.S3_REGION   || 'us-east-1',
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY || 'rustfsadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'rustfsadmin',
    },
    forcePathStyle: true, // required for RustFS / MinIO-compatible servers
  });
  return _s3Client;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive the player_id for a stream key from the DB. Returns null if not found. */
async function getPlayerForKey(streamKey) {
  const row = await db('stream_keys').where({ stream_key: streamKey }).first();
  return row ? row.player_id : null;
}

/**
 * Upload a local file to RustFS and return the public VOD URL.
 * s3Key format: recordings/{stream_key}/{filename}
 */
async function uploadToS3(filePath, streamKey) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');

  const bucket   = process.env.S3_BUCKET || 'nascon';
  const filename = path.basename(filePath);
  const s3Key    = `recordings/${streamKey}/${filename}`;
  const endpoint = (process.env.S3_ENDPOINT || 'http://rustfs:9000').replace(/\/$/, '');
  const vodUrl   = `${endpoint}/${bucket}/${s3Key}`;

  const fileStream = fs.createReadStream(filePath);

  await getS3Client().send(new PutObjectCommand({
    Bucket:      bucket,
    Key:         s3Key,
    Body:        fileStream,
    ContentType: 'video/mp4',
  }));

  return { bucket, s3Key, vodUrl };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Process a recording-complete event from MediaMTX.
 * Called by the /internal/mediamtx/recording route handler.
 *
 * @param {object} body  — { stream_key, file_path, duration?, size? }
 * @returns {object}     — the vod_recordings row that was inserted
 */
async function processRecording(body) {
  const { stream_key, file_path, duration, size } = body;

  if (!stream_key || typeof stream_key !== 'string') {
    throw Object.assign(new Error('stream_key is required'), { statusCode: 400 });
  }
  if (!file_path || typeof file_path !== 'string') {
    throw Object.assign(new Error('file_path is required'), { statusCode: 400 });
  }

  const playerId    = await getPlayerForKey(stream_key);
  const recordingId = uuidv4();

  // ── Insert "pending" row immediately so the VOD is indexed even if upload fails
  const bucket  = process.env.S3_BUCKET || 'nascon';
  const s3Key   = `recordings/${stream_key}/${path.basename(file_path)}`;
  const endpoint = (process.env.S3_ENDPOINT || 'http://rustfs:9000').replace(/\/$/, '');
  const vodUrl  = `${endpoint}/${bucket}/${s3Key}`;

  await db('vod_recordings').insert({
    recording_id:    recordingId,
    stream_key,
    player_id:       playerId || 'unknown',
    s3_bucket:       bucket,
    s3_key:          s3Key,
    vod_url:         vodUrl,
    duration_sec:    duration  || null,
    file_size_bytes: size      || null,
    status:          'pending',
    recorded_at:     new Date().toISOString(),
  });

  // ── Attempt S3 upload (fire-and-forget style — update status after) ─────────
  uploadToS3(file_path, stream_key)
    .then(async () => {
      await db('vod_recordings')
        .where({ recording_id: recordingId })
        .update({ status: 'uploaded' });
      console.log(`[recorder] VOD uploaded: ${s3Key}`);
    })
    .catch(async (err) => {
      await db('vod_recordings')
        .where({ recording_id: recordingId })
        .update({ status: 'failed' });
      console.error(`[recorder] VOD upload failed for ${stream_key}: ${err.message}`);
    });

  return {
    recording_id: recordingId,
    stream_key,
    player_id:    playerId || 'unknown',
    vod_url:      vodUrl,
    status:       'pending',
  };
}

/**
 * List all VOD recordings for a stream key.
 * Used by the athlete profile (FR-3.1) to show the VOD archive.
 */
async function listVods(streamKey) {
  return db('vod_recordings')
    .where({ stream_key: streamKey })
    .orderBy('recorded_at', 'desc');
}

module.exports = { processRecording, listVods, uploadToS3, getPlayerForKey };
