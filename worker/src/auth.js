import { now, fail, code, secret, sha256, cleanName } from './util.js';
import { START_RATING, seasonAt, softReset, division } from './rating.js';

export const publicAccount = a => ({ id: a.id, name: a.name, rating: a.rating, games: a.games, division: division(a.rating, a.games) });

export async function createAccount({ env, body }) {
  const t = now(), id = code(12), key = secret(24), name = cleanName(body.name);
  for (let n = 0; ; n++) {
    try {
      await env.DB.prepare('INSERT INTO account (id, token_hash, name, friend_code, rating, season, created, seen) VALUES (?,?,?,?,?,?,?,?)')
        .bind(id, await sha256(key), name, code(8), START_RATING, seasonAt(t), t, t).run();
      break;
    } catch (e) { if (n >= 2) throw e; }
  }
  const row = await env.DB.prepare('SELECT * FROM account WHERE id=?').bind(id).first();
  return { ...publicAccount(row), friendCode: row.friend_code, token: id + '.' + key };
}

// "Authorization: Bearer <id>.<key>". Only a hash of the key is stored.
export async function authenticate(env, req) {
  const m = /^Bearer ([A-Z0-9]{12})\.([0-9a-f]{48})$/.exec(req.headers.get('Authorization') ?? '');
  if (!m) fail(401, 'sign in first');
  const a = await env.DB.prepare('SELECT * FROM account WHERE id=?').bind(m[1]).first();
  if (!a || a.token_hash !== await sha256(m[2])) fail(401, 'unknown account');
  const t = now(), season = seasonAt(t);
  if (a.season !== season) {
    Object.assign(a, { rating: softReset(a.rating), games: 0, leaves: 0, season, seen: t });
    await env.DB.prepare('UPDATE account SET rating=?, games=0, leaves=0, season=?, seen=? WHERE id=?').bind(a.rating, season, t, a.id).run();
  } else if (t - a.seen > 20) {
    a.seen = t;
    await env.DB.prepare('UPDATE account SET seen=? WHERE id=?').bind(t, a.id).run();
  }
  return a;
}

export const me = ({ me }) => ({ ...publicAccount(me), friendCode: me.friend_code, mutedFor: Math.max(0, me.muted_until - now()), rankedBlock: Math.max(0, me.ranked_block_until - now()) });

export async function rename({ env, me, body }) {
  const name = cleanName(body.name);
  await env.DB.prepare('UPDATE account SET name=? WHERE id=?').bind(name, me.id).run();
  return { name };
}

// Backup of the browser's local progress blob, so a player can carry it to another device.
export async function putProfile({ env, me, body }) {
  const json = JSON.stringify(body.profile ?? {});
  if (json.length > 4000) fail(413, 'profile too large');
  await env.DB.prepare('INSERT INTO profile (account, json, updated) VALUES (?,?,?) ON CONFLICT(account) DO UPDATE SET json=excluded.json, updated=excluded.updated')
    .bind(me.id, json, now()).run();
  return { ok: true };
}
export async function getProfile({ env, me }) {
  const row = await env.DB.prepare('SELECT json, updated FROM profile WHERE account=?').bind(me.id).first();
  return { profile: row ? JSON.parse(row.json) : null, updated: row?.updated ?? 0 };
}
