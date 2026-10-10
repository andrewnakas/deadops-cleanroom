import { now, fail, code, sign, verify, cleanRoom, cleanId, baseRoom, int } from './util.js';
import { division } from './rating.js';
import { publicAccount } from './auth.js';
import { partyFor } from './social.js';

const TTL = 40, RANKED_SIZE = 4;
const sweep = env => env.DB.prepare('DELETE FROM room WHERE expires<?').bind(now()).run();
const listed = r => ({ code: r.code, playlist: r.playlist, map: r.map, mode: r.mode, size: r.size, humans: r.humans, free: r.free, started: !!r.started, rating: r.avg_rating });
// Records where the caller is. A party follows its leader into multiplayer rooms only (zombies co-op has no party yet).
async function follow(env, me, room, party = true) {
  const jobs = [env.DB.prepare('UPDATE account SET room=? WHERE id=?').bind(room, me.id)];
  if (party) jobs.push(env.DB.prepare('UPDATE party SET room=?, updated=? WHERE leader=?').bind(room, now(), me.id));
  await env.DB.batch(jobs);
}

// A host registers its room and repeats the call as a heartbeat. The reply names the players whose tickets
// are genuine, so the host learns account ids and mute flags without being able to invent them.
export async function putRoom({ env, me, body }) {
  const c = cleanRoom(body.code), t = now();
  if (c.length < 3) fail(400, 'bad room code');
  const row = await env.DB.prepare('SELECT * FROM room WHERE code=?').bind(c).first(), mine = row?.host === me.id;
  if (row && !mine && row.expires > t) fail(409, 'room code in use');
  let playlist = mine ? row.playlist : ['casual', 'coop'].includes(body.playlist) ? body.playlist : 'private';
  if (!mine && body.replaces) {
    // Host migration: the heir reopens the match under a new code and takes over the old listing.
    const old = await env.DB.prepare('SELECT * FROM room WHERE code=?').bind(cleanRoom(body.replaces)).first();
    if (old && baseRoom(old.code) === baseRoom(c)) { playlist = old.playlist; await env.DB.prepare('DELETE FROM room WHERE code=?').bind(old.code).run(); }
  }
  const players = await Promise.all((Array.isArray(body.tickets) ? body.tickets.slice(0, 16) : []).map(async tk => {
    const p = await verify(env, tk);
    return p && baseRoom(p.room) === baseRoom(c) ? { id: p.a, name: p.n, rating: p.r, division: division(p.r, p.g), muted: !!p.m } : null;
  }));
  const ratings = [me.rating, ...players.filter(Boolean).map(p => p.rating)], avg = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  await env.DB.prepare(`INSERT INTO room (code, host, playlist, map, mode, size, humans, free, started, avg_rating, expires) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET host=excluded.host, playlist=excluded.playlist, map=excluded.map, mode=excluded.mode, size=excluded.size,
    humans=excluded.humans, free=excluded.free, started=excluded.started, avg_rating=excluded.avg_rating, expires=excluded.expires`)
    .bind(c, me.id, playlist, cleanId(body.map, 'suburb'), cleanId(body.mode, 'tdm'), int(body.size, 1, 8, 6), int(body.humans, 1, 16, 1), int(body.free, 0, 15, 0), body.started ? 1 : 0, avg, t + TTL).run();
  await follow(env, me, c, playlist !== 'coop');
  return { ok: true, playlist, players, me: publicAccount(me) };
}

export async function dropRoom({ env, me, args }) {
  await env.DB.prepare('DELETE FROM room WHERE code=? AND host=?').bind(cleanRoom(args[0]), me.id).run();
  return { ok: true };
}

export async function listRooms({ env, query }) {
  await sweep(env);
  const want = query.get('playlist'), rows = await env.DB.prepare(`SELECT * FROM room WHERE playlist!='private' AND expires>? ORDER BY humans DESC LIMIT 50`).bind(now()).all();
  return { rooms: rows.results.filter(r => !want || r.playlist === want).map(listed) };
}

// Matchmaking: the open room closest to the caller's rating with seats for the whole party; otherwise a fresh
// code for the caller to host. The fresh code is listed at once so the next caller joins it instead of also hosting.
export async function quick({ env, me, body }) {
  const t = now(), playlist = ['ranked', 'coop'].includes(body.playlist) ? body.playlist : 'casual', ranked = playlist === 'ranked';
  if (ranked && me.ranked_block_until > t) fail(403, 'ranked is locked after leaving a match', { wait: me.ranked_block_until - t });
  const party = await partyFor(env, me.id);
  if (party && party.leader !== me.id) fail(409, 'only the party leader can search');
  const need = party?.size ?? 1;
  await sweep(env);
  await env.DB.prepare('DELETE FROM room WHERE host=?').bind(me.id).run();
  const rows = (await env.DB.prepare('SELECT * FROM room WHERE playlist=? AND expires>? AND free>=? LIMIT 50').bind(playlist, t, need).all()).results
    .filter(r => !(ranked && r.started) && (!body.mode || ranked || r.mode === body.mode))
    .sort((a, b) => Math.abs(a.avg_rating - me.rating) - Math.abs(b.avg_rating - me.rating) || b.humans - a.humans);
  if (rows.length) {
    const r = rows[0];
    await env.DB.prepare('UPDATE room SET free=MAX(0, free-?) WHERE code=?').bind(need, r.code).run();
    await follow(env, me, r.code, playlist !== 'coop');
    return { join: r.code, ...listed(r) };
  }
  const c = 'Q' + code(4), size = ranked ? RANKED_SIZE : int(body.size, 1, 8, 6), mode = ranked ? 'tdm' : cleanId(body.mode, 'tdm'), map = cleanId(body.map, 'suburb');
  await env.DB.prepare('INSERT INTO room (code, host, playlist, map, mode, size, humans, free, started, avg_rating, expires) VALUES (?,?,?,?,?,?,?,?,0,?,?)')
    .bind(c, me.id, playlist, map, mode, size, need, size * 2 - need, me.rating, t + 25).run();
  await follow(env, me, c, playlist !== 'coop');
  return { host: c, playlist, map, mode, size };
}

// A joiner shows this to the host, who passes it back to the server. It proves which account sits in the seat.
export async function ticket({ env, me, body }) {
  const room = cleanRoom(body.room), t = now();
  if (room.length < 3) fail(400, 'bad room code');
  await follow(env, me, room);
  return { ticket: await sign(env, { a: me.id, n: me.name, r: me.rating, g: me.games, m: me.muted_until > t ? 1 : 0, room, exp: t + 6 * 3600 }), me: publicAccount(me) };
}
