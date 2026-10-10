import { now, fail, code, verify, cleanRoom, cleanId, baseRoom, int, envInt } from './util.js';
import { rate, division, leaveBlock, seasonAt } from './rating.js';

const MAX_ROSTER = 12;
async function load(env, id) {
  const g = await env.DB.prepare('SELECT * FROM game WHERE id=?').bind(String(id)).first();
  if (!g) fail(404, 'no such match');
  return g;
}
function view(g, id) {
  const r = g.result ? JSON.parse(g.result) : null;
  return { id: g.id, state: g.state, ranked: g.playlist === 'ranked', winner: r?.winner ?? null, score: r?.score ?? null, mine: r?.players?.[id] ?? null };
}

// The host opens a match record with the tickets of everyone in the room. Ranked needs a ranked room (only
// matchmaking creates those) and a human on each team; otherwise the match is recorded as casual.
export async function startGame({ env, me, body }) {
  const c = cleanRoom(body.room), room = await env.DB.prepare('SELECT * FROM room WHERE code=?').bind(c).first();
  if (!room || room.host !== me.id) fail(403, 'register the room first');
  const roster = [{ a: me.id, team: body.team ? 1 : 0, seat: int(body.seat, 0, 31) }];
  for (const p of (Array.isArray(body.players) ? body.players : []).slice(0, MAX_ROSTER - 1)) {
    const tk = await verify(env, p?.ticket);
    if (!tk || baseRoom(tk.room) !== baseRoom(c) || roster.some(r => r.a === tk.a)) continue;
    roster.push({ a: tk.a, team: p.team ? 1 : 0, seat: int(p.seat, 0, 31) });
  }
  const both = roster.some(r => r.team === 0) && roster.some(r => r.team === 1), ranked = room.playlist === 'ranked' && both;
  const playlist = ranked ? 'ranked' : room.playlist === 'ranked' ? 'casual' : room.playlist, id = code(10);
  await env.DB.prepare('INSERT INTO game (id, room, playlist, mode, map, started, roster) VALUES (?,?,?,?,?,?,?)')
    .bind(id, c, playlist, cleanId(body.mode, room.mode), cleanId(body.map, room.map), now(), JSON.stringify(roster)).run();
  return { id, ranked, reason: room.playlist === 'ranked' && !both ? 'ranked needs a player on each team' : undefined };
}

// A player who drops into a casual match in progress is added by someone already in it.
export async function addPlayer({ env, me, body, args }) {
  const g = await load(env, args[0]), roster = JSON.parse(g.roster), tk = await verify(env, body.ticket);
  if (g.state !== 'live' || g.playlist === 'ranked') fail(409, 'match is closed to new players');
  if (!roster.some(r => r.a === me.id)) fail(403, 'not in this match');
  if (!tk || baseRoom(tk.room) !== baseRoom(g.room)) fail(400, 'bad ticket');
  if (!roster.some(r => r.a === tk.a) && roster.length < MAX_ROSTER) {
    roster.push({ a: tk.a, team: body.team ? 1 : 0, seat: int(body.seat, 0, 31) });
    await env.DB.prepare('UPDATE game SET roster=? WHERE id=?').bind(JSON.stringify(roster), g.id).run();
  }
  return { ok: true };
}

// Every human in the match sends what they saw at the end. Calling again later returns the settled result.
export async function reportGame({ env, me, body, args }) {
  let g = await load(env, args[0]);
  const roster = JSON.parse(g.roster);
  if (!roster.some(r => r.a === me.id)) fail(403, 'not in this match');
  if (g.state === 'live') {
    const winner = body.winner === 0 || body.winner === 1 ? body.winner : null, score = [int(body.score?.[0], 0, 9999), int(body.score?.[1], 0, 9999)];
    const present = [...new Set((Array.isArray(body.present) ? body.present : []).slice(0, 32).map(v => int(v, 0, 31)))];
    // A repeat keeps its first timestamp: the grace period runs from the first report, not the latest.
    await env.DB.prepare('INSERT INTO confirm (game, account, hash, json, at) VALUES (?,?,?,?,?) ON CONFLICT(game, account) DO UPDATE SET hash=excluded.hash, json=excluded.json')
      .bind(g.id, me.id, `${winner}|${score[0]}|${score[1]}`, JSON.stringify({ winner, score, k: int(body.k, 0, 400), d: int(body.d, 0, 400), present }), now()).run();
    await settle(env, g, roster);
    g = await load(env, g.id);
  }
  return view(g, me.id);
}
export async function getGame({ env, me, args }) { return view(await load(env, args[0]), me.id); }

// A result stands when more than half the roster report the same winner and score, or, once the grace period
// has passed, when everyone who reported agrees. Disagreement without a majority voids the match.
async function settle(env, g, roster) {
  const t = now(), rows = (await env.DB.prepare('SELECT * FROM confirm WHERE game=? ORDER BY at').bind(g.id).all()).results;
  if (!rows.length) return;
  const tally = {};
  for (const r of rows) (tally[r.hash] ??= []).push(r);
  const top = Object.values(tally).sort((a, b) => b.length - a.length)[0];
  const late = t - rows[0].at >= envInt(env, 'REPORT_GRACE_SECONDS', 20), majority = top.length * 2 > roster.length;
  if (!majority && !(late && top.length === rows.length)) { if (late) await close(env, g, 'void'); return; }
  // A match with one account in it is a game against bots: it is not recorded.
  if (roster.length < 2 || t - g.started < envInt(env, 'MIN_MATCH_SECONDS', 120) || t - g.started > 3 * 3600) { await close(env, g, 'void'); return; }
  if (!await close(env, g, 'done')) return;

  const agreed = JSON.parse(top[0].json), present = new Set(agreed.present), said = new Map(rows.map(r => [r.account, JSON.parse(r.json)]));
  const ranked = g.playlist === 'ranked', season = seasonAt(t), ids = roster.map(r => r.a);
  const accounts = new Map((await env.DB.prepare(`SELECT id, rating, games, leaves FROM account WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map(a => [a.id, a]));
  const players = roster.filter(r => accounts.has(r.a)).map(r => ({ ...r, ...accounts.get(r.a), left: !said.has(r.a) && !present.has(r.seat) }));
  const deltas = ranked ? rate(players, agreed.winner) : {}, result = { winner: agreed.winner, score: agreed.score, players: {} }, batch = [];
  for (const p of players) {
    const mine = said.get(p.a), won = !p.left && agreed.winner === p.team, lost = p.left || (agreed.winner !== null && !won);
    const d = deltas[p.a], after = d?.after ?? p.rating;
    result.players[p.a] = { k: mine?.k ?? 0, d: mine?.d ?? 0, outcome: won ? 'win' : lost ? 'loss' : 'draw', left: p.left, before: p.rating, after, division: division(after, p.games + (ranked ? 1 : 0)) };
    batch.push(env.DB.prepare(`INSERT INTO stats (account, season, mode, kills, deaths, wins, losses, matches) VALUES (?,?,?,?,?,?,?,1)
      ON CONFLICT(account, season, mode) DO UPDATE SET kills=kills+excluded.kills, deaths=deaths+excluded.deaths, wins=wins+excluded.wins, losses=losses+excluded.losses, matches=matches+1`)
      .bind(p.a, season, g.mode, mine?.k ?? 0, mine?.d ?? 0, won ? 1 : 0, lost ? 1 : 0));
    if (ranked && p.left) batch.push(env.DB.prepare('UPDATE account SET rating=?, games=games+1, leaves=leaves+1, ranked_block_until=? WHERE id=?').bind(after, t + leaveBlock(p.leaves + 1), p.a));
    else if (ranked) batch.push(env.DB.prepare('UPDATE account SET rating=?, games=games+1 WHERE id=?').bind(after, p.a));
    for (const q of players) if (q.a !== p.a) batch.push(env.DB.prepare('INSERT OR REPLACE INTO recent (account, other, at) VALUES (?,?,?)').bind(p.a, q.a, t));
  }
  batch.push(env.DB.prepare('UPDATE game SET result=? WHERE id=?').bind(JSON.stringify(result), g.id), env.DB.prepare('DELETE FROM confirm WHERE game=?').bind(g.id));
  await env.DB.batch(batch);
}
// Only the call that moves the match out of 'live' applies the result, so two reports landing together cannot count it twice.
async function close(env, g, state) {
  const r = await env.DB.prepare(`UPDATE game SET state=? WHERE id=? AND state='live'`).bind(state, g.id).run();
  return r.meta.changes === 1;
}
