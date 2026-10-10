// Rating maths for the ranked playlist. Pure functions (also run by `node --test`).
export const START_RATING = 1000;
export const SEASON_EPOCH = Date.UTC(2026, 9, 1) / 1000;
export const SEASON_SECONDS = 28 * 86400;
export const PLACEMENT_GAMES = 5;
export const DIVISIONS = [['Ember', 0], ['Flint', 900], ['Iron', 1050], ['Steel', 1200], ['Cobalt', 1350], ['Zenith', 1500]];
const LEAVE_BLOCKS = [300, 900, 3600];

export const seasonAt = t => Math.max(0, Math.floor((t - SEASON_EPOCH) / SEASON_SECONDS));
// A new season pulls everyone halfway back to the start rating.
export const softReset = rating => Math.round(START_RATING + (rating - START_RATING) / 2);
export function division(rating, games) {
  if (games < PLACEMENT_GAMES) return 'Unplaced';
  let name = DIVISIONS[0][0];
  for (const [n, floor] of DIVISIONS) if (rating >= floor) name = n;
  return name;
}
export const leaveBlock = leaves => LEAVE_BLOCKS[Math.min(LEAVE_BLOCKS.length, Math.max(1, leaves)) - 1];
export const kFactor = games => games < 10 ? 32 : 20;
export const expected = (mine, theirs) => 1 / (1 + 10 ** ((theirs - mine) / 400));

// players: [{a, team, rating, games, left}]; winner: 0, 1 or null (draw).
// Each team is rated at the mean of its humans. Someone who left takes a loss whatever the result.
export function rate(players, winner) {
  const mean = t => { const p = players.filter(x => x.team === t); return p.length ? p.reduce((s, x) => s + x.rating, 0) / p.length : START_RATING; };
  const teams = [mean(0), mean(1)], out = {};
  for (const p of players) {
    const e = expected(teams[p.team], teams[1 - p.team]), s = p.left ? 0 : winner === null ? .5 : winner === p.team ? 1 : 0;
    let delta = Math.round(kFactor(p.games) * (s - e));
    if (p.left) delta = Math.min(delta, -8);
    out[p.a] = { before: p.rating, after: Math.max(0, p.rating + delta) };
  }
  return out;
}
