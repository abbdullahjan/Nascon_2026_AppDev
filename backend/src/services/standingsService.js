'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { getScore } = require('./scoreService');
const { getSport } = require('./sportsService');
const crypto       = require('crypto');

async function getStandings(league_id) {
  const leagueRow = await db('leagues').where({ league_id }).first();
  if (!leagueRow) throw new AppError(404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});

  const config    = JSON.parse(leagueRow.config);
  const teams     = config.teams;
  const pts       = config.points || { win: 3, draw: 1, loss: 0 };
  const tbo       = config.tie_break_order;
  const qualSpots = config.qualification.spots;
  const lotsSeed  = config.lots_seed ?? 42;

  // Load sport config for scoring model
  const sport     = await getSport(config.sport_id);
  const scoringModel = sport.scoring_model;

  // Fetch all matches in this league
  const matches = await db('matches').where({ league_id });

  // Compute per-match results from event logs
  const results = [];
  for (const m of matches) {
    if (m.status === 'completed') {
      const score = await getScore(m.match_id);
      if (score.outcome !== 'undecided') results.push(score);
    }
  }

  // ── Build stats map ────────────────────────────────────────────────────────
  const stats = {};
  for (const t of teams) {
    stats[t] = {
      team_id: t, played: 0, won: 0, drawn: 0, lost: 0,
      scored: 0, conceded: 0, fair_play: 0, points: 0,
      // For innings model NRR
      balls_faced: 0, balls_bowled: 0,
      // For round model diff
      rounds_won: 0, rounds_lost: 0,
    };
  }

  for (const r of results) {
    const h = r.home.team_id;
    const a = r.away.team_id;
    const hs = r.home.score;
    const as_ = r.away.score;

    stats[h].played++;  stats[a].played++;
    stats[h].scored   += hs; stats[h].conceded += as_;
    stats[a].scored   += as_; stats[a].conceded += hs;
    stats[h].fair_play += r.home.fair_play;
    stats[a].fair_play += r.away.fair_play;

    // Innings model: track balls for NRR
    if (scoringModel === 'innings') {
      const p = sport.periods;
      const fullOversBalls = p.overs_per_innings * p.balls_per_over;

      // Home team balls faced
      let hBalls = r.home.balls || 0;
      // If innings ended with all wickets, count full overs
      if (r.home.wickets >= p.wickets_per_innings) hBalls = fullOversBalls;
      stats[h].balls_faced += hBalls;

      // Home team balls bowled = away team balls faced
      let aBalls = r.away.balls || 0;
      if (r.away.wickets >= p.wickets_per_innings) aBalls = fullOversBalls;
      stats[h].balls_bowled += aBalls;

      // Away team
      stats[a].balls_faced += aBalls;
      stats[a].balls_bowled += hBalls;
    }

    // Round model: track rounds won/lost
    if (scoringModel === 'round') {
      stats[h].rounds_won  += r.home.score;
      stats[h].rounds_lost += r.away.score;
      stats[a].rounds_won  += r.away.score;
      stats[a].rounds_lost += r.home.score;
    }

    if (r.outcome === 'home_win') {
      stats[h].won++; stats[h].points += pts.win;
      stats[a].lost++; stats[a].points += pts.loss;
    } else if (r.outcome === 'away_win') {
      stats[a].won++; stats[a].points += pts.win;
      stats[h].lost++; stats[h].points += pts.loss;
    } else if (r.outcome === 'draw') {
      stats[h].drawn++; stats[h].points += pts.draw;
      stats[a].drawn++; stats[a].points += pts.draw;
    }
  }

  // ── Compute diff based on scoring model ───────────────────────────────────
  for (const t of teams) {
    const s = stats[t];
    if (scoringModel === 'innings') {
      // Net Run Rate = (runs scored / overs faced) - (runs conceded / overs bowled)
      const bpo = sport.periods.balls_per_over;
      const oversFaced  = s.balls_faced  / bpo;
      const oversBowled = s.balls_bowled / bpo;
      if (oversFaced > 0 && oversBowled > 0) {
        s.diff = roundTo3((s.scored / oversFaced) - (s.conceded / oversBowled));
      } else {
        s.diff = 0;
      }
    } else if (scoringModel === 'round') {
      s.diff = s.rounds_won - s.rounds_lost;
    } else {
      // event model
      s.diff = s.scored - s.conceded;
    }
  }

  // ── Build H2H matrix ───────────────────────────────────────────────────────
  const h2h = {};
  for (const t of teams) {
    h2h[t] = {};
    for (const t2 of teams) {
      if (t !== t2) h2h[t][t2] = { played: 0, points: 0, scored: 0, conceded: 0 };
    }
  }
  for (const r of results) {
    const h = r.home.team_id; const a = r.away.team_id;
    h2h[h][a].played++; h2h[a][h].played++;
    h2h[h][a].scored   += r.home.score; h2h[h][a].conceded += r.away.score;
    h2h[a][h].scored   += r.away.score; h2h[a][h].conceded += r.home.score;
    if (r.outcome === 'home_win') {
      h2h[h][a].points += pts.win; h2h[a][h].points += pts.loss;
    } else if (r.outcome === 'away_win') {
      h2h[a][h].points += pts.win; h2h[h][a].points += pts.loss;
    } else if (r.outcome === 'draw') {
      h2h[h][a].points += pts.draw; h2h[a][h].points += pts.draw;
    }
  }

  // ── Remaining matches per team ────────────────────────────────────────────
  const remaining = {};
  for (const t of teams) remaining[t] = 0;
  for (const m of matches) {
    if (m.status !== 'completed') {
      if (remaining[m.home_team] !== undefined) remaining[m.home_team]++;
      if (remaining[m.away_team] !== undefined) remaining[m.away_team]++;
    }
  }

  // ── Build team list and resolve ordering ──────────────────────────────────
  const teamList = teams.map(t => ({ ...stats[t], resolved_by: null }));
  const sorted   = resolveGroup(teamList, tbo, lotsSeed, league_id, h2h, pts, results, scoringModel, sport);

  // ── Assign ranks and qualification status ─────────────────────────────────
  const W = pts.win;
  sorted.forEach((row, i) => {
    row.rank   = i + 1;
    row.status = getQualStatus(row, sorted, remaining, W, qualSpots);
  });

  // ── Clean up internal fields from output ─────────────────────────────────
  const table = sorted.map(t => {
    const clean = { ...t };
    delete clean.balls_faced;
    delete clean.balls_bowled;
    delete clean.rounds_won;
    delete clean.rounds_lost;
    return clean;
  });

  return {
    league_id,
    sport_id:            config.sport_id,
    qualification_spots: qualSpots,
    table,
    h2h,
  };
}

// ── Recursive group resolution ───────────────────────────────────────────────
function resolveGroup(group, tbo, lotsSeed, league_id, h2h, pts, allResults, scoringModel, sport) {
  if (group.length <= 1) return group;

  // Sort by points desc first
  group.sort((a, b) => b.points - a.points);

  const result = [];
  let i = 0;
  while (i < group.length) {
    let j = i;
    while (j < group.length && group[j].points === group[i].points) j++;
    const tied = group.slice(i, j);
    if (tied.length === 1) {
      result.push(tied[0]);
    } else {
      const resolved = applyTiebreakers(tied, tbo, lotsSeed, league_id, h2h, pts, allResults, scoringModel, sport);
      result.push(...resolved);
    }
    i = j;
  }
  return result;
}

function applyTiebreakers(group, tbo, lotsSeed, league_id, h2h, pts, allResults, scoringModel, sport) {
  if (group.length <= 1) return group;

  for (const criterion of tbo) {
    const scored = computeCriterion(criterion, group, h2h, pts, lotsSeed, league_id, allResults, scoringModel, sport);
    const values = group.map(t => scored[t.team_id]);
    if (new Set(values).size === 1) continue; // all equal — try next criterion

    // Sort by criterion value desc (higher is better)
    const sorted = [...group].sort((a, b) => values[b.team_id] - values[a.team_id]);

    // Set resolved_by on the first team that was separated from the next
    // (the team that "wins" the tiebreak gets the label)
    sorted[0].resolved_by = criterion;

    // Recursively resolve sub-groups
    const result = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && values[sorted[j].team_id] === values[sorted[i].team_id]) j++;
      const sub = sorted.slice(i, j);
      if (sub.length > 1) {
        result.push(...applyTiebreakers(sub, tbo, lotsSeed, league_id, h2h, pts, allResults, scoringModel, sport));
      } else {
        result.push(sub[0]);
      }
      i = j;
    }
    return result;
  }
  return group; // all tiebreakers exhausted — order unchanged
}

function computeCriterion(criterion, group, h2h, pts, lotsSeed, league_id, allResults, scoringModel, sport) {
  const scores = {};
  for (const t of group) scores[t.team_id] = 0;

  if (criterion === 'h2h_points') {
    for (const t of group) {
      for (const o of group) {
        if (t.team_id !== o.team_id) scores[t.team_id] += h2h[t.team_id][o.team_id]?.points || 0;
      }
    }
  } else if (criterion === 'h2h_diff') {
    if (scoringModel === 'innings') {
      // Net run rate over H2H matches only
      for (const t of group) {
        let runsScored = 0, runsConceded = 0, ballsFaced = 0, ballsBowled = 0;
        for (const o of group) {
          if (t.team_id === o.team_id) continue;
          const h2hData = h2h[t.team_id][o.team_id];
          if (!h2hData || h2hData.played === 0) continue;
          runsScored  += h2hData.scored;
          runsConceded += h2hData.conceded;
          // Approximate balls from match data (we don't have per-match balls in h2h)
          // Use scored/conceded ratio as fallback
        }
        // Simplified: use scored - conceded for h2h_diff in innings
        // Full NRR over H2H would require per-match ball tracking in h2h
        for (const o of group) {
          if (t.team_id === o.team_id) continue;
          scores[t.team_id] += (h2h[t.team_id][o.team_id]?.scored || 0) - (h2h[t.team_id][o.team_id]?.conceded || 0);
        }
      }
    } else {
      for (const t of group) {
        for (const o of group) {
          if (t.team_id !== o.team_id) {
            scores[t.team_id] += (h2h[t.team_id][o.team_id]?.scored || 0) - (h2h[t.team_id][o.team_id]?.conceded || 0);
          }
        }
      }
    }
  } else if (criterion === 'overall_diff') {
    for (const t of group) scores[t.team_id] = t.diff;
  } else if (criterion === 'scored') {
    for (const t of group) scores[t.team_id] = t.scored;
  } else if (criterion === 'fair_play') {
    for (const t of group) scores[t.team_id] = t.fair_play;
  } else if (criterion === 'draw_lots') {
    for (const t of group) {
      const hash = crypto.createHash('sha256')
        .update(`${lotsSeed}|${league_id}|${t.team_id}`)
        .digest('hex');
      // Lower hash = better rank — negate for "higher is better" comparison
      // Use full 64-char hex as a big number (compare as string is sufficient)
      scores[t.team_id] = '-' + hash; // string comparison: lower hex = higher score after negation
    }
  }
  return scores;
}

// ── Qualification status ────────────────────────────────────────────────────
function getQualStatus(team, sorted, remaining, W, qualSpots) {
  const myPts   = team.points;
  const myRemain = remaining[team.team_id] || 0;
  const myMax   = myPts + W * myRemain;

  // clinched (checked first): fewer than k other teams can reach >= my points
  const canReachOrBeat = sorted.filter(t =>
    t.team_id !== team.team_id &&
    (t.points + W * (remaining[t.team_id] || 0)) >= myPts
  );
  if (canReachOrBeat.length < qualSpots) return 'clinched';

  // eliminated: at least k teams already have more points than my max
  const alreadyAhead = sorted.filter(t =>
    t.team_id !== team.team_id &&
    t.points > myMax
  );
  if (alreadyAhead.length >= qualSpots) return 'eliminated';

  return 'still_possible';
}

function roundTo3(n) {
  return Math.round(n * 1000) / 1000;
}

module.exports = { getStandings };
