'use strict';

/**
 * Unit tests for streaming/recorder.js
 *
 * Tests without hitting S3 or the real DB:
 *   1. processRecording() — validation, DB insert, status lifecycle
 *   2. S3 upload success path — status updated to 'uploaded'
 *   3. S3 upload failure path — status updated to 'failed'
 *   4. listVods() — returns sorted rows for a stream key
 *   5. getPlayerForKey() — returns player_id or null
 */

// ── env ───────────────────────────────────────────────────────────────────────
process.env.S3_ENDPOINT   = 'http://rustfs:9000';
process.env.S3_BUCKET     = 'nascon';
process.env.S3_ACCESS_KEY = 'rustfsadmin';
process.env.S3_SECRET_KEY = 'rustfsadmin';
process.env.S3_REGION     = 'us-east-1';

// ── mock uuid so recording_id is deterministic ────────────────────────────────
jest.mock('uuid', () => ({ v4: jest.fn(() => 'rec-test-uuid-001') }));

// ── mock fs (no real files needed) ───────────────────────────────────────────
jest.mock('fs', () => ({
  createReadStream: jest.fn(() => 'FAKE_STREAM'),
}));

// ── DB mock (mockX prefix for Jest factory rules) ─────────────────────────────
const mockStreamKeys = {
  'sk_live_aabbccdd11223344': { stream_key: 'sk_live_aabbccdd11223344', player_id: 'player-alpha-1', status: 'active' },
};
const mockVods = [];  // array — recorder inserts rows here

jest.mock('../src/config/db', () => {
  const streamKeys = mockStreamKeys; // eslint-disable-line no-undef
  const vods       = mockVods;       // eslint-disable-line no-undef

  const builder = (table) => {
    const b = {
      _table:  table,
      _wheres: {},
      _orderCol: null,
      _orderDir: 'asc',
      where(q) { this._wheres = { ...this._wheres, ...q }; return this; },
      orderBy(col, dir) { this._orderCol = col; this._orderDir = dir; return this; },
      async first() {
        if (this._table === 'stream_keys') {
          return Object.values(streamKeys).find(r =>
            Object.entries(this._wheres).every(([k, v]) => r[k] === v)
          ) || null;
        }
        return null;
      },
      async insert(row) {
        if (this._table === 'vod_recordings') vods.push({ ...row });
      },
      async update(patch) {
        if (this._table === 'vod_recordings') {
          for (const row of vods) {
            if (Object.entries(this._wheres).every(([k, v]) => row[k] === v))
              Object.assign(row, patch);
          }
        }
      },
      then(resolve) {
        // Support: db('vod_recordings').where({stream_key}).orderBy().then(...)
        // i.e. used as a thenable (await db(...).where().orderBy())
        if (this._table === 'vod_recordings') {
          const wheres = this._wheres;
          const filtered = vods.filter(r =>
            Object.entries(wheres).every(([k, v]) => r[k] === v)
          );
          return Promise.resolve(filtered).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
    };
    // Make builder awaitable (Knex query builders are thenables)
    b[Symbol.for('nodejs.rejection')] = undefined;
    return b;
  };

  builder.transaction = async (fn) => fn(builder);
  builder.raw = () => {};
  return builder;
});

// ── mock @aws-sdk/client-s3 ───────────────────────────────────────────────────
const mockS3Send = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client:        jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((params) => ({ _params: params })),
}));

// ─────────────────────────────────────────────────────────────────────────────
const { processRecording, listVods, getPlayerForKey } =
  require('../src/modules/streaming/recorder');

function clearVods() { mockVods.length = 0; }

beforeEach(() => {
  clearVods();
  mockS3Send.mockClear();
  require('uuid').v4.mockReturnValue('rec-test-uuid-001');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Input validation
// ─────────────────────────────────────────────────────────────────────────────
describe('processRecording() — validation', () => {
  test('missing stream_key throws 400', async () => {
    expect.assertions(1);
    try {
      await processRecording({ file_path: '/recordings/test.mp4' });
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });

  test('missing file_path throws 400', async () => {
    expect.assertions(1);
    try {
      await processRecording({ stream_key: 'sk_live_aabbccdd11223344' });
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });

  test('non-string stream_key throws 400', async () => {
    expect.assertions(1);
    try {
      await processRecording({ stream_key: 123, file_path: '/recordings/test.mp4' });
    } catch (e) {
      expect(e.statusCode).toBe(400);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Happy path — DB insert
// ─────────────────────────────────────────────────────────────────────────────
describe('processRecording() — DB insert', () => {
  test('inserts a pending row and returns recording metadata', async () => {
    const result = await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/sk_live_aabbccdd11223344/2026-10-18_10-30-00.mp4',
      duration:   120,
      size:       52428800,
    });

    expect(result.recording_id).toBe('rec-test-uuid-001');
    expect(result.stream_key).toBe('sk_live_aabbccdd11223344');
    expect(result.player_id).toBe('player-alpha-1');
    expect(result.status).toBe('pending');
    expect(result.vod_url).toContain('recordings/sk_live_aabbccdd11223344');
  });

  test('inserted row has correct s3_key path', async () => {
    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/sk_live_aabbccdd11223344/2026-10-18.mp4',
    });

    const row = mockVods[0];
    expect(row.s3_key).toBe('recordings/sk_live_aabbccdd11223344/2026-10-18.mp4');
    expect(row.s3_bucket).toBe('nascon');
  });

  test('vod_url uses S3_ENDPOINT + bucket + s3_key', async () => {
    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/sk_live_aabbccdd11223344/clip.mp4',
    });

    const row = mockVods[0];
    expect(row.vod_url).toBe(
      'http://rustfs:9000/nascon/recordings/sk_live_aabbccdd11223344/clip.mp4'
    );
  });

  test('duration_sec and file_size_bytes are stored when provided', async () => {
    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/test.mp4',
      duration:   300,
      size:       104857600,
    });

    const row = mockVods[0];
    expect(row.duration_sec).toBe(300);
    expect(row.file_size_bytes).toBe(104857600);
  });

  test('duration_sec and file_size_bytes are null when not provided', async () => {
    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/test.mp4',
    });

    const row = mockVods[0];
    expect(row.duration_sec).toBeNull();
    expect(row.file_size_bytes).toBeNull();
  });

  test('player_id is "unknown" when stream key not in DB', async () => {
    const result = await processRecording({
      stream_key: 'sk_live_0000000000000000', // not in mockStreamKeys
      file_path:  '/recordings/test.mp4',
    });

    expect(result.player_id).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. S3 upload success — status → 'uploaded'
// ─────────────────────────────────────────────────────────────────────────────
describe('processRecording() — S3 upload success', () => {
  test('status updated to uploaded after successful S3 send', async () => {
    mockS3Send.mockResolvedValueOnce({});

    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/test.mp4',
    });

    // The upload is fire-and-forget via .then() — flush microtasks
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    const row = mockVods[0];
    expect(row.status).toBe('uploaded');
  });

  test('S3 send called with correct Bucket, Key, ContentType', async () => {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    PutObjectCommand.mockClear();  // clear any calls from prior tests
    mockS3Send.mockResolvedValueOnce({});

    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/sk_live_aabbccdd11223344/video.mp4',
    });

    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(mockS3Send).toHaveBeenCalled();
    expect(PutObjectCommand).toHaveBeenCalled();
    const callArg = PutObjectCommand.mock.calls[0][0];
    expect(callArg.Bucket).toBe('nascon');
    expect(callArg.Key).toBe('recordings/sk_live_aabbccdd11223344/video.mp4');
    expect(callArg.ContentType).toBe('video/mp4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. S3 upload failure — status → 'failed'
// ─────────────────────────────────────────────────────────────────────────────
describe('processRecording() — S3 upload failure', () => {
  test('status updated to failed when S3 send throws', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('Connection refused'));

    await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/test.mp4',
    });

    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    const row = mockVods[0];
    expect(row.status).toBe('failed');
  });

  test('processRecording still returns 202-style result even when S3 will fail', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 down'));

    const result = await processRecording({
      stream_key: 'sk_live_aabbccdd11223344',
      file_path:  '/recordings/test.mp4',
    });

    // Should return immediately without waiting for S3
    expect(result.status).toBe('pending');
    expect(result.recording_id).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. listVods()
// ─────────────────────────────────────────────────────────────────────────────
describe('listVods()', () => {
  test('returns rows for matching stream_key', async () => {
    mockVods.push(
      { stream_key: 'sk_live_aabbccdd11223344', vod_url: 'http://rustfs/1.mp4', recorded_at: '2026-10-18T10:00:00Z', status: 'uploaded' },
      { stream_key: 'sk_live_aabbccdd11223344', vod_url: 'http://rustfs/2.mp4', recorded_at: '2026-10-18T11:00:00Z', status: 'uploaded' },
      { stream_key: 'sk_live_zzzzzzzzzzzzzzzz', vod_url: 'http://rustfs/3.mp4', recorded_at: '2026-10-18T12:00:00Z', status: 'uploaded' },
    );

    const result = await listVods('sk_live_aabbccdd11223344');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.stream_key === 'sk_live_aabbccdd11223344')).toBe(true);
  });

  test('returns empty array when no recordings exist', async () => {
    const result = await listVods('sk_live_nonexistent');
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getPlayerForKey()
// ─────────────────────────────────────────────────────────────────────────────
describe('getPlayerForKey()', () => {
  test('returns player_id for known stream key', async () => {
    const playerId = await getPlayerForKey('sk_live_aabbccdd11223344');
    expect(playerId).toBe('player-alpha-1');
  });

  test('returns null for unknown stream key', async () => {
    const playerId = await getPlayerForKey('sk_live_0000000000000000');
    expect(playerId).toBeNull();
  });
});
