'use strict';

// ── Mock DB (all state inside factory) ──────────────────────────────────────
jest.mock('../src/config/db', () => {
  const sports = {
    football: {
      sport_id: 'football', name: 'Football', scoring_model: 'event',
      config: JSON.stringify({
        sport_id: 'football', scoring_model: 'event',
        periods: { count: 2, duration_minutes: 45 },
        scoring_events: { goal: { points: 1 } },
        draw_allowed: true,
        overtime: { policy: 'none' },
        tie_break_order: ['h2h_points','h2h_diff','overall_diff','scored','fair_play','draw_lots'],
      }),
    },
    basketball: {
      sport_id: 'basketball', name: 'Basketball', scoring_model: 'event',
      config: JSON.stringify({
        sport_id: 'basketball', scoring_model: 'event',
        periods: { count: 4, duration_minutes: 12 },
        scoring_events: { free_throw: { points: 1 }, two_pointer: { points: 2 }, three_pointer: { points: 3 } },
        draw_allowed: false,
        overtime: { policy: 'extra_time', duration_minutes: 5 },
      }),
    },
    cricket: {
      sport_id: 'cricket', name: 'Cricket', scoring_model: 'innings',
      config: JSON.stringify({
        sport_id: 'cricket', scoring_model: 'innings',
        periods: { innings_per_team: 1, overs_per_innings: 2, balls_per_over: 6, wickets_per_innings: 2 },
        scoring_events: {
          single: { runs: 1, legal_ball: true, wicket: false },
          four:   { runs: 4, legal_ball: true, wicket: false },
          wicket: { runs: 0, legal_ball: true, wicket: true },
        },
        draw_allowed: true,
        overtime: { policy: 'super_over' },
      }),
    },
    esports: {
      sport_id: 'esports', name: 'Esports', scoring_model: 'round',
      config: JSON.stringify({
        sport_id: 'esports', scoring_model: 'round',
        periods: { best_of: 3 },
        scoring_events: { round_win: { rounds: 1 } },
        draw_allowed: false,
        overtime: { policy: 'none' },
      }),
    },
  };

  const matches = {};
  const events  = {};
  let   eventSeq = 0;

  const mockDb = jest.fn((table) => ({
    where: (q) => ({
      first: async () => {
        if (table === 'sports')      return sports[q.sport_id]  || null;
        if (table === 'matches')     return matches[q.match_id] || null;
        if (table === 'match_events') {
          if (q.event_id)  return events[q.event_id] || null;
          // No event_id filter — return all for count
          return null;
        }
        return null;
      },
      count: function() {
        const all = Object.values(events).filter(e => e.match_id === q.match_id);
        return { first: async () => ({ cnt: all.length }) };
      },
      orderBy: () => ({
        then: () => {},
      }),
      update: async (patch) => {
        if (table === 'matches' && matches[q.match_id])     Object.assign(matches[q.match_id], patch);
        if (table === 'match_events' && events[q.event_id]) Object.assign(events[q.event_id], patch);
      },
      delete: async () => {
        if (table === 'match_events' && events[q.event_id]) delete events[q.event_id];
      },
    }),
    insert: async (row) => {
      if (table === 'matches')     matches[row.match_id] = row;
      if (table === 'match_events') {
        events[row.event_id] = { ...row, id: ++eventSeq };
      }
    },
  }));

  // Support: db('match_events').where({match_id}).orderBy('sequence','asc')
  // Need to return an array-like
  const origFn = mockDb;
  function dbProxy(table) {
    const builder = origFn(table);
    // Add chained where().orderBy() that returns a Promise of array
    const origWhere = builder.where;
    builder.where = function(q) {
      const w = origWhere(q);
      // Add orderBy that resolves to filtered array
      w.orderBy = () => {
        if (table === 'match_events') {
          const all = Object.values(events)
            .filter(e => e.match_id === q.match_id)
            .sort((a, b) => a.sequence - b.sequence);
          return Promise.resolve(all);
        }
        return Promise.resolve([]);
      };
      return w;
    };
    return builder;
  }
  dbProxy.transaction = async (fn) => { await fn(dbProxy); };
  dbProxy.raw = async () => {};
  dbProxy.__state = { sports, matches, events };

  return dbProxy;
});

// Mock HMAC
jest.mock('../src/config/env', () => ({
  PORT: 8080, NODE_ENV: 'test', DAY1_SALT: 'demo-salt',
  DATABASE_URL: '', REDIS_URL: '', JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '2h',
}));

const eventsService = require('../src/services/eventsService');
const scoreService  = require('../src/services/scoreService');
const db            = require('../src/config/db');

beforeEach(() => {
  for (const k of Object.keys(db.__state.matches)) delete db.__state.matches[k];
  for (const k of Object.keys(db.__state.events))  delete db.__state.events[k];
});

// ── Helper: init + start a match ────────────────────────────────────────────
async function startMatch(matchId, sportId, home, away) {
  await eventsService.appendEvent({
    event_id: `init-${matchId}`, match_id: matchId, type: 'match_init',
    payload: { sport_id: sportId, home_team_id: home, away_team_id: away },
  });
  await eventsService.appendEvent({
    event_id: `start-${matchId}`, match_id: matchId, type: 'match_start', payload: {},
  });
}

describe('Event-Sourced Scoring Engine', () => {

  // ── match_init ────────────────────────────────────────────────────────────
  describe('match_init', () => {
    test('creates a standalone match with status upcoming', async () => {
      await eventsService.appendEvent({
        event_id: 'e1', match_id: 'm1', type: 'match_init',
        payload: { sport_id: 'football', home_team_id: 't1', away_team_id: 't2' },
      });
      expect(db.__state.matches['m1'].status).toBe('upcoming');
      expect(db.__state.matches['m1'].home_team).toBe('t1');
    });

    test('match_init on existing stream → 409 MATCH_EXISTS', async () => {
      await eventsService.appendEvent({
        event_id: 'e2', match_id: 'm2', type: 'match_init',
        payload: { sport_id: 'football', home_team_id: 't1', away_team_id: 't2' },
      });
      await expect(
        eventsService.appendEvent({
          event_id: 'e3', match_id: 'm2', type: 'match_init',
          payload: { sport_id: 'football', home_team_id: 't1', away_team_id: 't2' },
        })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'MATCH_EXISTS' });
    });

    test('match_init unknown sport → 404 SPORT_NOT_FOUND', async () => {
      await expect(
        eventsService.appendEvent({
          event_id: 'e4', match_id: 'm3', type: 'match_init',
          payload: { sport_id: 'unknown', home_team_id: 't1', away_team_id: 't2' },
        })
      ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'SPORT_NOT_FOUND' });
    });

    test('any event on missing stream (non-init) → 404 MATCH_NOT_FOUND', async () => {
      await expect(
        eventsService.appendEvent({ event_id: 'e5', match_id: 'nope', type: 'score', payload: { team_id: 't1', event_type: 'goal' } })
      ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'MATCH_NOT_FOUND' });
    });
  });

  // ── match_start ───────────────────────────────────────────────────────────
  describe('match_start', () => {
    test('starts upcoming match → in_progress', async () => {
      await startMatch('m10', 'football', 't1', 't2');
      expect(db.__state.matches['m10'].status).toBe('in_progress');
    });

    test('match_start when already in_progress → 409 ILLEGAL_TRANSITION', async () => {
      await startMatch('m11', 'football', 't1', 't2');
      await expect(
        eventsService.appendEvent({ event_id: 's2', match_id: 'm11', type: 'match_start', payload: {} })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'ILLEGAL_TRANSITION' });
    });
  });

  // ── score ─────────────────────────────────────────────────────────────────
  describe('score events', () => {
    test('football goal → home score 1', async () => {
      await startMatch('m20', 'football', 't1', 't2');
      await eventsService.appendEvent({
        event_id: 'sc1', match_id: 'm20', type: 'score',
        payload: { team_id: 't1', event_type: 'goal' },
      });
      const score = await scoreService.getScore('m20');
      expect(score.home.score).toBe(1);
      expect(score.away.score).toBe(0);
    });

    test('basketball two_pointer → score 2', async () => {
      await startMatch('m21', 'basketball', 't1', 't2');
      await eventsService.appendEvent({
        event_id: 'sc2', match_id: 'm21', type: 'score',
        payload: { team_id: 't1', event_type: 'two_pointer' },
      });
      const score = await scoreService.getScore('m21');
      expect(score.home.score).toBe(2);
    });

    test('score when not in_progress → 409 MATCH_NOT_IN_PROGRESS', async () => {
      await eventsService.appendEvent({
        event_id: 'i1', match_id: 'm22', type: 'match_init',
        payload: { sport_id: 'football', home_team_id: 't1', away_team_id: 't2' },
      });
      await expect(
        eventsService.appendEvent({
          event_id: 'sc3', match_id: 'm22', type: 'score',
          payload: { team_id: 't1', event_type: 'goal' },
        })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'MATCH_NOT_IN_PROGRESS' });
    });

    test('unknown event_type → 400 UNKNOWN_EVENT_TYPE', async () => {
      await startMatch('m23', 'football', 't1', 't2');
      await expect(
        eventsService.appendEvent({
          event_id: 'sc4', match_id: 'm23', type: 'score',
          payload: { team_id: 't1', event_type: 'touchdown' },
        })
      ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'UNKNOWN_EVENT_TYPE' });
    });

    test('invalid team_id → 400 VALIDATION_ERROR', async () => {
      await startMatch('m24', 'football', 't1', 't2');
      await expect(
        eventsService.appendEvent({
          event_id: 'sc5', match_id: 'm24', type: 'score',
          payload: { team_id: 't99', event_type: 'goal' },
        })
      ).rejects.toMatchObject({ httpStatus: 400, errorCode: 'VALIDATION_ERROR' });
    });
  });

  // ── cricket innings model ─────────────────────────────────────────────────
  describe('innings model (cricket)', () => {
    test('runs and overs tracked correctly', async () => {
      await startMatch('m30', 'cricket', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'c1', match_id: 'm30', type: 'score', payload: { team_id: 't1', event_type: 'single' } });
      await eventsService.appendEvent({ event_id: 'c2', match_id: 'm30', type: 'score', payload: { team_id: 't1', event_type: 'four' } });
      const score = await scoreService.getScore('m30');
      expect(score.home.score).toBe(5);   // 1+4
      expect(score.home.balls).toBe(2);    // 2 legal balls
      expect(score.home.overs).toBe('0.2'); // 2 balls = 0.2 overs
    });

    test('wicket increments wickets count', async () => {
      await startMatch('m31', 'cricket', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'c3', match_id: 'm31', type: 'score', payload: { team_id: 't1', event_type: 'wicket' } });
      const score = await scoreService.getScore('m31');
      expect(score.home.wickets).toBe(1);
    });
  });

  // ── match_end ─────────────────────────────────────────────────────────────
  describe('match_end', () => {
    test('ends match when in_progress → completed', async () => {
      await startMatch('m40', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'g1', match_id: 'm40', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await eventsService.appendEvent({ event_id: 'end1', match_id: 'm40', type: 'match_end', payload: {} });
      expect(db.__state.matches['m40'].status).toBe('completed');
      const score = await scoreService.getScore('m40');
      expect(score.outcome).toBe('home_win');
      expect(score.winner_team_id).toBe('t1');
    });

    test('TIE_NOT_ALLOWED when level score, draw_allowed=false, no tiebreak', async () => {
      await startMatch('m41', 'basketball', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'b1', match_id: 'm41', type: 'score', payload: { team_id: 't1', event_type: 'free_throw' } });
      await eventsService.appendEvent({ event_id: 'b2', match_id: 'm41', type: 'score', payload: { team_id: 't2', event_type: 'free_throw' } });
      await expect(
        eventsService.appendEvent({ event_id: 'end2', match_id: 'm41', type: 'match_end', payload: {} })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'TIE_NOT_ALLOWED' });
    });

    test('draw allowed when sport permits it', async () => {
      await startMatch('m42', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'g2', match_id: 'm42', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await eventsService.appendEvent({ event_id: 'g3', match_id: 'm42', type: 'score', payload: { team_id: 't2', event_type: 'goal' } });
      await eventsService.appendEvent({ event_id: 'end3', match_id: 'm42', type: 'match_end', payload: {} });
      const score = await scoreService.getScore('m42');
      expect(score.outcome).toBe('draw');
    });
  });

  // ── compensation ───────────────────────────────────────────────────────────
  describe('compensation', () => {
    test('compensation marks original event as compensated', async () => {
      await startMatch('m50', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'comp1', match_id: 'm50', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await eventsService.appendEvent({ event_id: 'comp2', match_id: 'm50', type: 'compensation', payload: { compensates: 'comp1', reason: 'disallowed' } });
      const score = await scoreService.getScore('m50');
      // Original goal is compensated → score should be 0
      expect(score.home.score).toBe(0);
      // Original event marked compensated
      const origEvent = score.events.find(e => e.event_id === 'comp1');
      expect(origEvent.compensated).toBe(true);
      expect(origEvent.compensated_by).toBe('comp2');
    });

    test('compensation on non-existent event → 404 EVENT_NOT_FOUND', async () => {
      await startMatch('m51', 'football', 't1', 't2');
      await expect(
        eventsService.appendEvent({ event_id: 'comp3', match_id: 'm51', type: 'compensation', payload: { compensates: 'nonexistent' } })
      ).rejects.toMatchObject({ httpStatus: 404, errorCode: 'EVENT_NOT_FOUND' });
    });

    test('compensation on already compensated → 409 INVALID_COMPENSATION', async () => {
      await startMatch('m52', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'comp4', match_id: 'm52', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await eventsService.appendEvent({ event_id: 'comp5', match_id: 'm52', type: 'compensation', payload: { compensates: 'comp4' } });
      await expect(
        eventsService.appendEvent({ event_id: 'comp6', match_id: 'm52', type: 'compensation', payload: { compensates: 'comp4' } })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'INVALID_COMPENSATION' });
    });

    test('compensation on different match → 409 INVALID_COMPENSATION', async () => {
      await startMatch('m53', 'football', 't1', 't2');
      await startMatch('m54', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'comp7', match_id: 'm53', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await expect(
        eventsService.appendEvent({ event_id: 'comp8', match_id: 'm54', type: 'compensation', payload: { compensates: 'comp7' } })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'INVALID_COMPENSATION' });
    });
  });

  // ── idempotency ────────────────────────────────────────────────────────────
  describe('idempotency', () => {
    test('same event_id + same body → 200 with stored response', async () => {
      await startMatch('m60', 'football', 't1', 't2');
      const body = { event_id: 'idem1', match_id: 'm60', type: 'score', payload: { team_id: 't1', event_type: 'goal' } };
      const r1 = await eventsService.appendEvent(body);
      expect(r1._isReplay).toBe(false);
      const r2 = await eventsService.appendEvent(body);
      expect(r2._isReplay).toBe(true);
    });

    test('same event_id + different body → 409 DUPLICATE_EVENT_ID', async () => {
      await startMatch('m61', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'idem2', match_id: 'm61', type: 'score', payload: { team_id: 't1', event_type: 'goal' } });
      await expect(
        eventsService.appendEvent({ event_id: 'idem2', match_id: 'm61', type: 'score', payload: { team_id: 't2', event_type: 'goal' } })
      ).rejects.toMatchObject({ httpStatus: 409, errorCode: 'DUPLICATE_EVENT_ID' });
    });
  });

  // ── signature ──────────────────────────────────────────────────────────────
  describe('signature', () => {
    test('event response contains 64-char hex signature', async () => {
      await startMatch('m70', 'football', 't1', 't2');
      const r = await eventsService.appendEvent({
        event_id: 'sig1', match_id: 'm70', type: 'score',
        payload: { team_id: 't1', event_type: 'goal' },
      });
      expect(r.data.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    test('sequence and match_version are correct', async () => {
      const r1 = await eventsService.appendEvent({
        event_id: 'sq1', match_id: 'm71', type: 'match_init',
        payload: { sport_id: 'football', home_team_id: 't1', away_team_id: 't2' },
      });
      expect(r1.data.sequence).toBe(1);
      expect(r1.data.match_version).toBe(1);

      const r2 = await eventsService.appendEvent({
        event_id: 'sq2', match_id: 'm71', type: 'match_start', payload: {},
      });
      expect(r2.data.sequence).toBe(2);
      expect(r2.data.match_version).toBe(2);
    });
  });

  // ── discipline ─────────────────────────────────────────────────────────────
  describe('discipline', () => {
    test('discipline adds to fair_play total', async () => {
      await startMatch('m80', 'football', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'd1', match_id: 'm80', type: 'discipline', payload: { team_id: 't1', points: -1 } });
      const score = await scoreService.getScore('m80');
      expect(score.home.fair_play).toBe(-1);
    });
  });

  // ── tiebreak_winner ───────────────────────────────────────────────────────
  describe('tiebreak_winner', () => {
    test('tiebreak_winner determines winner when score is level', async () => {
      await startMatch('m90', 'basketball', 't1', 't2');
      await eventsService.appendEvent({ event_id: 'tb1', match_id: 'm90', type: 'score', payload: { team_id: 't1', event_type: 'free_throw' } });
      await eventsService.appendEvent({ event_id: 'tb2', match_id: 'm90', type: 'score', payload: { team_id: 't2', event_type: 'free_throw' } });
      await eventsService.appendEvent({ event_id: 'tb3', match_id: 'm90', type: 'tiebreak_winner', payload: { team_id: 't1' } });
      await eventsService.appendEvent({ event_id: 'tb4', match_id: 'm90', type: 'match_end', payload: {} });
      const score = await scoreService.getScore('m90');
      expect(score.outcome).toBe('home_win');
      expect(score.winner_team_id).toBe('t1');
      expect(score.tiebreak_winner_team_id).toBe('t1');
    });
  });
});
