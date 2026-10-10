// Backend API on its own (no browser): accounts, rooms, matchmaking, tickets, results, rating, friends, parties, reports.
import assert from 'node:assert/strict';
import { startBackend } from './backend.mjs';
const back = await startBackend(5187);
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
const call = async (who, method, path, body) => {
  const r = await fetch(back.url + '/v1/' + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + who.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...await r.json() };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const [a, b, c, d] = await Promise.all(['Ann <b>', 'Bo', 'Cy', 'Di'].map(name => call(null, 'POST', 'account', { name })));
  check('accounts are created with a token and a friend code', a.status === 200 && /^[A-Z0-9]{12}\.[0-9a-f]{48}$/.test(a.token) && a.friendCode.length === 8 && a.name === 'Ann b', a.name);
  check('calls without a valid token are refused', (await call(null, 'GET', 'me')).status === 401 && (await call({ token: a.id + '.' + '0'.repeat(48) }, 'GET', 'me')).status === 401);
  check('rename is sanitised', (await call(a, 'PUT', 'me', { name: 'Ann<script>' })).name === 'Annscript');
  await call(a, 'PUT', 'profile', { profile: { xp: 1200 } });
  check('profile backup round-trips', (await call(a, 'GET', 'profile')).profile.xp === 1200);
  check('relay list is empty without secrets', (await call(a, 'GET', 'turn')).iceServers.length === 0);

  // Rooms and tickets.
  const tb = (await call(b, 'POST', 'ticket', { room: 'ROOM1' })).ticket;
  const reg = await call(a, 'POST', 'rooms', { code: 'ROOM1', playlist: 'casual', map: 'yard', mode: 'tdm', size: 3, humans: 2, free: 4, tickets: [tb, tb.slice(0, -2) + 'zz', 'junk'] });
  check('host learns who holds a real ticket; forged ones are dropped', reg.players[0]?.id === b.id && reg.players[1] === null && reg.players[2] === null, JSON.stringify(reg.players));
  check('another account cannot take a live room code', (await call(c, 'POST', 'rooms', { code: 'ROOM1' })).status === 409);
  await call(c, 'POST', 'rooms', { code: 'HIDE1', map: 'suburb', size: 3, free: 5 });
  const list = await call(d, 'GET', 'rooms');
  check('public rooms are listed, private ones are not', list.rooms.length === 1 && list.rooms[0].code === 'ROOM1' && list.rooms[0].map === 'yard', JSON.stringify(list.rooms));
  const q1 = await call(d, 'POST', 'quick', { playlist: 'casual' });
  check('quick play joins the open casual room', q1.join === 'ROOM1', JSON.stringify(q1));
  await call(a, 'DELETE', 'rooms/ROOM1');
  check('a dropped room leaves the list', (await call(d, 'GET', 'rooms')).rooms.length === 0);

  // Ranked: first caller hosts a fresh code, second is sent to it.
  const r1 = await call(a, 'POST', 'quick', { playlist: 'ranked' }), r2 = await call(b, 'POST', 'quick', { playlist: 'ranked' });
  check('ranked search pairs two players in one room', /^Q/.test(r1.host) && r2.join === r1.host && r1.size === 4, JSON.stringify([r1, r2]));
  const room = r1.host, tickB = (await call(b, 'POST', 'ticket', { room })).ticket, tickC = (await call(c, 'POST', 'ticket', { room })).ticket;
  check('a non-host cannot open a match for the room', (await call(b, 'POST', 'game', { room, players: [] })).status === 403);
  const solo = await call(a, 'POST', 'game', { room, team: 0, seat: 0, players: [{ ticket: tickB, team: 0, seat: 1 }] });
  check('ranked needs a player on each team', solo.ranked === false && !!solo.reason, solo.reason);
  const g = await call(a, 'POST', 'game', { room, mode: 'tdm', map: 'suburb', team: 0, seat: 0, players: [{ ticket: tickB, team: 1, seat: 6 }, { ticket: tickC, team: 1, seat: 7 }, { ticket: 'forged', team: 0, seat: 2 }] });
  check('match opens as ranked with the ticketed roster', g.ranked === true && g.id.length === 10);
  check('an outsider cannot report', (await call(d, 'POST', `game/${g.id}/report`, { winner: 0, score: [75, 10] })).status === 403);
  const rep = { winner: 0, score: [75, 40], present: [0, 6] };
  const p1 = await call(a, 'POST', `game/${g.id}/report`, { ...rep, k: 30, d: 12 });
  check('one report of three is not enough', p1.state === 'live');
  const p2 = await call(b, 'POST', `game/${g.id}/report`, { ...rep, k: 14, d: 20 });
  check('a majority settles the match', p2.state === 'done' && p2.mine.outcome === 'loss' && p2.mine.after < p2.mine.before, JSON.stringify(p2.mine));
  const mineA = (await call(a, 'GET', `game/${g.id}`)).mine, meC = await call(c, 'GET', 'me');
  check('winner gains rating', mineA.outcome === 'win' && mineA.after > 1000 && mineA.k === 30, JSON.stringify(mineA));
  check('the player who left takes a loss and a ranked lock', meC.rating < 1000 && meC.rankedBlock > 0 && (await call(c, 'POST', 'quick', { playlist: 'ranked' })).status === 403, JSON.stringify(meC));
  const again = await call(a, 'POST', `game/${g.id}/report`, { winner: 1, score: [0, 75] });
  check('a settled match cannot be re-reported', again.state === 'done' && again.winner === 0 && (await call(a, 'GET', 'me')).rating === mineA.after);

  // Disagreement voids; a lone agreeing report settles after the grace period.
  await call(a, 'POST', 'rooms', { code: 'ROOM2', playlist: 'casual', size: 3, free: 4 });
  const t2 = (await call(b, 'POST', 'ticket', { room: 'ROOM2' })).ticket;
  const g2 = await call(a, 'POST', 'game', { room: 'ROOM2', team: 0, seat: 0, players: [{ ticket: t2, team: 1, seat: 3 }] });
  await call(a, 'POST', `game/${g2.id}/report`, { winner: 0, score: [75, 1], k: 5, d: 1, present: [0, 3] });
  await call(b, 'POST', `game/${g2.id}/report`, { winner: 1, score: [1, 75], k: 5, d: 1, present: [0, 3] });
  await sleep(2500);
  check('conflicting reports void the match', (await call(a, 'POST', `game/${g2.id}/report`, { winner: 0, score: [75, 1] })).state === 'void');
  const g3 = await call(a, 'POST', 'game', { room: 'ROOM2', team: 0, seat: 0, players: [{ ticket: t2, team: 1, seat: 3 }] });
  await call(a, 'POST', `game/${g3.id}/report`, { winner: 0, score: [75, 9], k: 40, d: 3, present: [0, 3] });
  await sleep(2500);
  const late = await call(a, 'POST', `game/${g3.id}/report`, { winner: 0, score: [75, 9], k: 40, d: 3, present: [0, 3] });
  check('an unopposed report settles after the grace period', late.state === 'done' && late.ranked === false && late.mine.outcome === 'win');
  const st = await call(d, 'GET', 'stats/' + a.id);
  check('stats add up across matches', st.thisSeason.kills === 70 && st.thisSeason.wins === 2 && st.thisSeason.matches === 2, JSON.stringify(st.thisSeason));
  const top = await call(a, 'GET', 'board?kind=rating'), kills = await call(a, 'GET', 'board?kind=kills');
  check('leaderboards rank by rating and by kills', top.rows[0].id === a.id && top.rows[0].you && top.rows.length === 3 && kills.rows[0].value === 70, JSON.stringify(top.rows.map(r => r.value)));

  // Friends, recent players, party.
  check('recent players are recorded', (await call(a, 'GET', 'social')).recent.some(r => r.id === b.id));
  check('friend request by code', (await call(a, 'POST', 'friends', { code: b.friendCode.toLowerCase() })).state === 'sent' && (await call(b, 'GET', 'social')).friends[0].state === 'asked');
  check('own code is refused', (await call(a, 'POST', 'friends', { code: a.friendCode })).status === 400);
  check('the other side accepts by adding back', (await call(b, 'POST', 'friends', { id: a.id })).state === 'ok');
  await call(b, 'POST', 'rooms', { code: 'PRIV9', size: 3, free: 5 });
  const fa = (await call(a, 'GET', 'social')).friends[0];
  check('a friend shows as online with a joinable room', fa.state === 'ok' && fa.online && fa.room === 'PRIV9', JSON.stringify(fa));
  const party = await call(a, 'POST', 'party');
  check('only friends can be invited', (await call(a, 'POST', 'party/invite', { id: d.id })).status === 403 && (await call(a, 'POST', 'party/invite', { id: b.id })).ok);
  const inv = (await call(b, 'GET', 'social')).invites;
  check('the invite arrives', inv.length === 1 && inv[0].party === party.id);
  await call(b, 'POST', 'party/join', { id: party.id });
  check('a member cannot start the search', (await call(b, 'POST', 'quick', { playlist: 'casual' })).status === 409);
  const pq = await call(a, 'POST', 'quick', { playlist: 'casual', map: 'wharf' }), sb = await call(b, 'GET', 'social');
  check('the party follows its leader into the room', pq.host && sb.party.room === pq.host && sb.party.members.length === 2 && sb.invites.length === 0, JSON.stringify(sb.party));
  check('the hosted room keeps seats for the party', (await call(d, 'GET', 'rooms')).rooms.find(r => r.code === pq.host)?.humans === 2);
  await call(a, 'POST', 'party/leave');
  check('leadership passes on when the leader leaves', (await call(b, 'GET', 'social')).party.leader === b.id && (await call(a, 'GET', 'social')).party === null);
  check('removing a friend clears both sides', (await call(b, 'POST', 'friends/remove', { id: a.id })).ok && (await call(a, 'GET', 'social')).friends.length === 0);

  // Reports.
  await call(a, 'POST', 'report', { target: d.id, room: 'ROOM2', lines: ['x'] });
  check('one report does not mute', (await call(d, 'GET', 'me')).mutedFor === 0 && (await call(a, 'POST', 'report', { target: a.id })).status === 400);
  await call(a, 'POST', 'report', { target: d.id, room: 'ROOM2' }); await call(b, 'POST', 'report', { target: d.id, room: 'ROOM2' });
  check('reports from different players mute for a day', (await call(d, 'GET', 'me')).mutedFor > 86000);
  check('unknown routes and bad JSON are refused', (await call(a, 'GET', 'nope')).status === 404 && (await fetch(back.url + '/v1/quick', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token }, body: '{' })).status === 400);
  console.log('API OK');
} finally { back.stop(); }
