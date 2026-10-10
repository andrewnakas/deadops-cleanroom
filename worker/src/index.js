// Graveshift backend: a small JSON API in front of one D1 database. The game is still peer-to-peer; this only
// lists rooms, pairs players, keeps accounts and results, and hands out relay credentials.
import { HttpError, fail } from './util.js';
import { createAccount, authenticate, me, rename, putProfile, getProfile } from './auth.js';
import { putRoom, dropRoom, listRooms, quick, ticket } from './rooms.js';
import { startGame, addPlayer, reportGame, getGame } from './match.js';
import { social, addFriend, removeFriend, createParty, inviteToParty, joinParty, leaveParty, report, board, stats } from './social.js';
import { turn } from './turn.js';

// [method, path pattern, handler, open to callers without an account]
const ROUTES = [
  ['POST', /^\/v1\/account$/, createAccount, true],
  ['GET', /^\/v1\/me$/, me], ['PUT', /^\/v1\/me$/, rename],
  ['GET', /^\/v1\/profile$/, getProfile], ['PUT', /^\/v1\/profile$/, putProfile],
  ['GET', /^\/v1\/rooms$/, listRooms], ['POST', /^\/v1\/rooms$/, putRoom], ['DELETE', /^\/v1\/rooms\/([A-Za-z0-9]+)$/, dropRoom],
  ['POST', /^\/v1\/quick$/, quick], ['POST', /^\/v1\/ticket$/, ticket], ['GET', /^\/v1\/turn$/, turn],
  ['POST', /^\/v1\/game$/, startGame], ['GET', /^\/v1\/game\/([A-Z0-9]+)$/, getGame],
  ['POST', /^\/v1\/game\/([A-Z0-9]+)\/add$/, addPlayer], ['POST', /^\/v1\/game\/([A-Z0-9]+)\/report$/, reportGame],
  ['GET', /^\/v1\/social$/, social], ['POST', /^\/v1\/friends$/, addFriend], ['POST', /^\/v1\/friends\/remove$/, removeFriend],
  ['POST', /^\/v1\/party$/, createParty], ['POST', /^\/v1\/party\/invite$/, inviteToParty], ['POST', /^\/v1\/party\/join$/, joinParty], ['POST', /^\/v1\/party\/leave$/, leaveParty],
  ['POST', /^\/v1\/report$/, report], ['GET', /^\/v1\/board$/, board], ['GET', /^\/v1\/stats\/([A-Z0-9]+)$/, stats],
];

// Best-effort limiter: counters live in this isolate only, so it slows a runaway client rather than a determined one.
const hits = new Map();
function limit(key, max) {
  const minute = Math.floor(Date.now() / 60000), h = hits.get(key);
  if (hits.size > 5000) hits.clear();
  if (!h || h.minute !== minute) { hits.set(key, { minute, n: 1 }); return; }
  if (++h.n > max) fail(429, 'slow down');
}

function cors(env, req) {
  const origin = req.headers.get('Origin') ?? '', allowed = String(env.ORIGINS ?? '').split(',').map(s => s.trim());
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '', Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '86400' };
}

export default {
  async fetch(req, env) {
    const headers = { ...cors(env, req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const send = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const url = new URL(req.url), route = ROUTES.find(r => r[0] === req.method && r[1].test(url.pathname));
      if (!route) fail(404, 'not found');
      const [, pattern, handler, open] = route, ip = req.headers.get('CF-Connecting-IP') ?? 'local';
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT') {
        const text = await req.text();
        if (text.length > 16000) fail(413, 'request too large');
        try { body = text ? JSON.parse(text) : {}; } catch { fail(400, 'bad JSON'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'bad JSON');
      }
      let account = null;
      if (open) limit('new:' + ip, 10);
      else { account = await authenticate(env, req); limit(account.id, 240); }
      return send(200, await handler({ env, req, body, query: url.searchParams, args: pattern.exec(url.pathname).slice(1), me: account }));
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message, ...e.extra });
      console.error(e);
      return send(500, { error: 'server error' });
    }
  },
};
