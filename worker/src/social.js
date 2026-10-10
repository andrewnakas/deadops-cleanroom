import { now, fail, code, cleanRoom, envInt } from './util.js';
import { division, seasonAt } from './rating.js';
import { publicAccount } from './auth.js';

const ONLINE = 60, PARTY_MAX = 4, PARTY_IDLE = 600, FRIEND_MAX = 100;
const isId = v => /^[A-Z0-9]{12}$/.test(String(v ?? ''));
const online = (a, t) => t - a.seen < ONLINE;

export async function partyFor(env, id) {
  const p = await env.DB.prepare('SELECT p.* FROM party_member m JOIN party p ON p.id=m.party WHERE m.account=?').bind(id).first();
  if (!p) return null;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM party_member WHERE party=?').bind(p.id).first();
  return { ...p, size: n.n };
}
const areFriends = async (env, a, b) => !!await env.DB.prepare(`SELECT 1 FROM friend WHERE state='ok' AND ((a=?1 AND b=?2) OR (a=?2 AND b=?1))`).bind(a, b).first();

// One poll for the whole social panel: friends, recent players, the caller's party and pending invites.
export async function social({ env, me }) {
  const t = now(), db = env.DB;
  const friends = (await db.prepare(`SELECT f.a, f.state, x.id, x.name, x.seen, x.room, x.rating, x.games FROM friend f
    JOIN account x ON x.id = CASE WHEN f.a=?1 THEN f.b ELSE f.a END WHERE f.a=?1 OR f.b=?1 LIMIT ${FRIEND_MAX}`).bind(me.id).all()).results;
  const codes = [...new Set(friends.filter(f => f.state === 'ok' && f.room && online(f, t)).map(f => f.room))];
  const open = new Set(codes.length ? (await db.prepare(`SELECT code FROM room WHERE free>0 AND expires>? AND code IN (${codes.map(() => '?').join(',')})`).bind(t, ...codes).all()).results.map(r => r.code) : []);
  const recent = (await db.prepare('SELECT x.id, x.name, r.at FROM recent r JOIN account x ON x.id=r.other WHERE r.account=? ORDER BY r.at DESC LIMIT 20').bind(me.id).all()).results;
  const invites = (await db.prepare('SELECT i.party, x.name FROM invite i JOIN account x ON x.id=i.sender JOIN party p ON p.id=i.party WHERE i.account=? AND i.at>?').bind(me.id, t - PARTY_IDLE).all()).results;
  let party = await partyFor(env, me.id);
  if (party) {
    await db.prepare('UPDATE party SET updated=? WHERE id=?').bind(t, party.id).run();
    const members = (await db.prepare('SELECT x.id, x.name, x.seen FROM party_member m JOIN account x ON x.id=m.account WHERE m.party=?').bind(party.id).all()).results;
    party = { id: party.id, leader: party.leader, room: party.room, members: members.map(m => ({ id: m.id, name: m.name, online: online(m, t) })) };
  } else await db.prepare('DELETE FROM party_member WHERE account=?').bind(me.id).run();
  return {
    me: { ...publicAccount(me), friendCode: me.friend_code },
    friends: friends.map(f => ({ id: f.id, name: f.name, division: division(f.rating, f.games), state: f.state === 'ok' ? 'ok' : f.a === me.id ? 'sent' : 'asked', online: f.state === 'ok' && online(f, t), room: f.state === 'ok' && open.has(f.room) ? f.room : null })),
    recent: recent.map(r => ({ id: r.id, name: r.name, at: r.at })), party, invites: invites.map(i => ({ party: i.party, from: i.name })),
  };
}

// Add by friend code or (from the recent list) by account id. A request from the other side is accepted.
export async function addFriend({ env, me, body }) {
  const other = isId(body.id) ? await env.DB.prepare('SELECT id FROM account WHERE id=?').bind(body.id).first()
    : await env.DB.prepare('SELECT id FROM account WHERE friend_code=?').bind(cleanRoom(body.code)).first();
  if (!other) fail(404, 'no player with that code');
  if (other.id === me.id) fail(400, 'that is your own code');
  const back = await env.DB.prepare('SELECT state FROM friend WHERE a=? AND b=?').bind(other.id, me.id).first();
  if (back) { await env.DB.prepare(`UPDATE friend SET state='ok' WHERE a=? AND b=?`).bind(other.id, me.id).run(); return { state: 'ok' }; }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM friend WHERE a=?1 OR b=?1').bind(me.id).first();
  if (n.n >= FRIEND_MAX) fail(409, 'friends list is full');
  await env.DB.prepare(`INSERT OR IGNORE INTO friend (a, b, state, at) VALUES (?,?,'pending',?)`).bind(me.id, other.id, now()).run();
  return { state: 'sent' };
}
export async function removeFriend({ env, me, body }) {
  if (!isId(body.id)) fail(400, 'bad id');
  await env.DB.prepare('DELETE FROM friend WHERE (a=?1 AND b=?2) OR (a=?2 AND b=?1)').bind(me.id, body.id).run();
  return { ok: true };
}

async function leave(env, id) {
  const p = await partyFor(env, id);
  if (!p) return;
  await env.DB.prepare('DELETE FROM party_member WHERE account=?').bind(id).run();
  const next = await env.DB.prepare('SELECT account FROM party_member WHERE party=? LIMIT 1').bind(p.id).first();
  if (!next) await env.DB.batch([env.DB.prepare('DELETE FROM party WHERE id=?').bind(p.id), env.DB.prepare('DELETE FROM invite WHERE party=?').bind(p.id)]);
  else if (p.leader === id) await env.DB.prepare('UPDATE party SET leader=? WHERE id=?').bind(next.account, p.id).run();
}
export async function createParty({ env, me }) {
  const t = now(), have = await partyFor(env, me.id);
  if (have) return { id: have.id };
  const stale = (await env.DB.prepare('SELECT id FROM party WHERE updated<?').bind(t - PARTY_IDLE).all()).results;
  for (const s of stale) await env.DB.batch([env.DB.prepare('DELETE FROM party WHERE id=?').bind(s.id), env.DB.prepare('DELETE FROM party_member WHERE party=?').bind(s.id), env.DB.prepare('DELETE FROM invite WHERE party=?').bind(s.id)]);
  const id = code(6);
  await env.DB.batch([env.DB.prepare('INSERT INTO party (id, leader, updated) VALUES (?,?,?)').bind(id, me.id, t), env.DB.prepare('INSERT OR REPLACE INTO party_member (account, party) VALUES (?,?)').bind(me.id, id)]);
  return { id };
}
export async function inviteToParty({ env, me, body }) {
  const p = await partyFor(env, me.id);
  if (!p) fail(409, 'start a party first');
  if (!isId(body.id) || !await areFriends(env, me.id, body.id)) fail(403, 'you can only invite friends');
  await env.DB.prepare('INSERT OR REPLACE INTO invite (party, account, sender, at) VALUES (?,?,?,?)').bind(p.id, body.id, me.id, now()).run();
  return { ok: true };
}
// Join with an invite, or by typing the party code the leader reads out.
export async function joinParty({ env, me, body }) {
  const id = cleanRoom(body.id), p = await env.DB.prepare('SELECT * FROM party WHERE id=?').bind(id).first();
  if (!p) fail(404, 'no such party');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM party_member WHERE party=? AND account!=?').bind(id, me.id).first();
  if (n.n >= PARTY_MAX) fail(409, 'party is full');
  const cur = await partyFor(env, me.id);
  if (cur && cur.id !== id) await leave(env, me.id);
  await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO party_member (account, party) VALUES (?,?)').bind(me.id, id), env.DB.prepare('DELETE FROM invite WHERE account=? AND party=?').bind(me.id, id), env.DB.prepare('UPDATE party SET updated=? WHERE id=?').bind(now(), id)]);
  return { id };
}
export async function leaveParty({ env, me }) { await leave(env, me.id); return { ok: true }; }

// Reports from enough different players mute the target's chat in rooms for a day.
export async function report({ env, me, body }) {
  if (!isId(body.target) || body.target === me.id) fail(400, 'bad target');
  const t = now(), lines = JSON.stringify((Array.isArray(body.lines) ? body.lines : []).slice(-8).map(l => String(l).slice(0, 100)));
  await env.DB.prepare('INSERT OR REPLACE INTO report (reporter, target, room, lines, at) VALUES (?,?,?,?,?)').bind(me.id, body.target, cleanRoom(body.room), lines, t).run();
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM report WHERE target=? AND at>?').bind(body.target, t - 86400).first();
  if (n.n >= envInt(env, 'REPORTS_TO_MUTE', 3)) await env.DB.prepare('UPDATE account SET muted_until=? WHERE id=?').bind(t + 86400, body.target).run();
  return { ok: true };
}

export async function board({ env, me, query }) {
  const kind = ['kills', 'wins'].includes(query.get('kind')) ? query.get('kind') : 'rating', season = seasonAt(now());
  const rows = kind === 'rating'
    ? (await env.DB.prepare('SELECT id, name, rating AS value, rating, games FROM account WHERE season=? AND games>0 ORDER BY rating DESC LIMIT 50').bind(season).all()).results
    : (await env.DB.prepare(`SELECT a.id, a.name, SUM(s.${kind}) AS value, a.rating, a.games FROM stats s JOIN account a ON a.id=s.account WHERE s.season=? GROUP BY s.account HAVING value>0 ORDER BY value DESC LIMIT 50`).bind(season).all()).results;
  return { kind, season, rows: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, value: r.value, division: division(r.rating, r.games), you: r.id === me.id })) };
}

export async function stats({ env, args }) {
  if (!isId(args[0])) fail(400, 'bad id');
  const a = await env.DB.prepare('SELECT * FROM account WHERE id=?').bind(args[0]).first();
  if (!a) fail(404, 'no such player');
  const rows = (await env.DB.prepare('SELECT season, mode, kills, deaths, wins, losses, matches FROM stats WHERE account=?').bind(a.id).all()).results, season = seasonAt(now());
  const sum = list => list.reduce((s, r) => ({ kills: s.kills + r.kills, deaths: s.deaths + r.deaths, wins: s.wins + r.wins, losses: s.losses + r.losses, matches: s.matches + r.matches }), { kills: 0, deaths: 0, wins: 0, losses: 0, matches: 0 });
  return { player: publicAccount(a), season, thisSeason: sum(rows.filter(r => r.season === season)), allTime: sum(rows), modes: rows.filter(r => r.season === season).map(({ season: _, ...r }) => r) };
}
