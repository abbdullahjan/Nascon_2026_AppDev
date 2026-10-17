'use strict';

const db           = require('../config/db');
const { AppError } = require('../utils/errors');
const { getScore } = require('./scoreService');
const crypto       = require('crypto');

async function getStandings(league_id) {
  const leagueRow = await db('leagues').where({ league_id }).first();
  if (!leagueRow) throw new AppError(404, 'LEAGUE_NOT_FOUND', `League '${league_id}' not found.`, {});

  const config   = JSON.parse(leagueRow.config);
  const teams    = config.teams;
  const pts      = config.points || { win: 3, draw: 1, loss: 0 };
  const tbo      = config.tie_break_order;
  const qualSpots = config.qualification.spots;
  const lotsSeed  = config.lots_seed ?? 42;

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

  // Build stats map
  const stats = {};
  for (const t of teams) {
    stats[t] = { team_id: t, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, fair_play: 0, points: 0 };
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

  // Build H2H matrix
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

  // Remaining matches per team
  const remaining = {};
  for (const t of teams) remaining[t] = 0;
  for (const m of matches) {
    if (m.status !== 'completed') {
      remaining[m.home_team]++;
      remaining[m.away_team]++;
    }
  }

  // Resolve tied groups (recursive)
  const teamList = teams.map(t => ({ ...stats[t], diff: stats[t].scored - stats[t].conceded, resolved_by: null }));
  const sorted   = resolveGroup(teamList, tbo, lotsSeed, league_id, h2h, pts, results);

  // Assign ranks and qualification status
  const W = pts.win;
  sorted.forEach((row, i) => {
    row.rank   = i + 1;
    row.status = getQualStatus(row, sorted, remaining, W, qualSpots);
  });

  return {
    league_id,
    sport_id:            config.sport_id,
    qualification_spots: qualSpots,
    table: sorted,
    h2h,
  };
}

function resolveGroup(group, tbo, lotsSeed, league_id, h2h, pts, allResults) {
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
      const resolved = applyTiebreakers(tied, tbo, lotsSeed, league_id, h2h, pts, allResults);
      result.push(...resolved);
    }
    i = j;
  }
  return result;
}

function applyTiebreakers(group, tbo, lotsSeed, league_id, h2h, pts, allResults) {
  if (group.length <= 1) return group;

  for (const criterion of tbo) {
    const scored = computeCriterion(criterion, group, h2h, pts, lotsSeed, league_id, allResults);
    const values = group.map(t => scored[t.team_id]);
    if (new Set(values).size === 1) continue; // all equal — try next

    // Split into sub-groups
    const sorted = [...group].sort((a, b) => values[b.team_id] - values[a.team_id]);
    sorted[0].resolved_by = criterion;

    // Recursively resolve sub-groups
    const result = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && values[sorted[j].team_id] === values[sorted[i].team_id]) j++;
      const sub = sorted.slice(i, j);
      result.push(...(sub.length > 1 ? applyTiebreakers(sub, tbo, lotsSeed, league_id, h2h, pts, allResults) : sub));
      i = j;
    }
    return result;
  }
  return group; // all tiebreakers exhausted
}

function computeCriterion(criterion, group, h2h, pts, lotsSeed, league_id, allResults) {
  const ids = new Set(group.map(t => t.team_id));
  const scores = {};
  for (const t of group) scores[t.team_id] = 0;

  if (criterion === 'h2h_points') {
    for (const t of group) {
      for (const o of group) {
        if (t.team_id !== o.team_id) scores[t.team_id] += h2h[t.team_id][o.team_id]?.points || 0;
      }
    }
  } else if (criterion === 'h2h_diff') {
    for (const t of group) {
      for (const o of group) {
        if (t.team_id !== o.team_id) {
          scores[t.team_id] += (h2h[t.team_id][o.team_id]?.scored || 0) - (h2h[t.team_id][o.team_id]?.conceded || 0);
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
      const hash = crypto.createHash('sha256').update(`${lotsSeed}|${league_id}|${t.team_id}`).digest('hex');
      // Lower hash = better rank — negate for consistent "higher is better" comparison
      scores[t.team_id] = -parseInt(hash.slice(0, 8), 16);
    }
  }
  return scores;
}

function getQualStatus(team, sorted, remaining, W, qualSpots) {
  const myPts  = team.points;
  const myRemain = remaining[team.team_id] || 0;
  const myMax  = myPts + W * myRemain;

  // clinched: fewer than qualSpots other teams can reach >= my points
  const canReachOrBeat = sorted.filter(t => t.team_id !== team.team_id && (t.points + W * (remaining[t.team_id] || 0)) >= myPts);
  if (canReachOrBeat.length < qualSpots) return 'clinched';

  // eliminated: at least qualSpots teams already have more points than my max
  const alreadyAhead = sorted.filter(t => t.team_id !== team.team_id && t.points > myMax);
  if (alreadyAhead.length >= qualSpots) return 'eliminated';

  return 'still_possible';
}

module.exports = { getStandings };
