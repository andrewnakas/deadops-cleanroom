export const now = () => Math.floor(Date.now() / 1000);

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

// No 0/O/1/I, so a code read aloud or typed from a screenshot is unambiguous.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function code(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map(v => ALPHA[v % 32]).join('');
}
export const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const secret = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const b64 = text => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = text => decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/'))));
async function mac(key, text) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)));
}
export function signingKey(env) {
  if (env.TICKET_SECRET) return env.TICKET_SECRET;
  if (env.DEV === '1') return 'local-development-only';
  fail(500, 'server is missing its signing secret');
}
export async function sign(env, payload) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + await mac(signingKey(env), body);
}
// Returns the payload of a ticket this server signed and that has not expired, else null.
export async function verify(env, token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || sig !== await mac(signingKey(env), body)) return null;
  try { const p = JSON.parse(unb64(body)); return p.exp > now() ? p : null; } catch { return null; }
}

// Same character sets as the game client (mp.js `clean` and the room code filter).
export const cleanName = n => String(n ?? '').replace(/[^\w .\-]/g, '').slice(0, 14) || 'Guest';
export const cleanRoom = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
export const cleanId = (v, fallback) => /^[a-z0-9_-]{1,16}$/.test(String(v ?? '')) ? String(v) : fallback;
export const int = (v, lo, hi, fallback = lo) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : fallback;
export const baseRoom = c => cleanRoom(c).replace(/M\d+$/, '');
export const envInt = (env, key, fallback) => Number.isFinite(+env[key]) && env[key] !== '' && env[key] != null ? +env[key] : fallback;
