// Local progression for multiplayer: XP, levels, medals and unlocks. Stored in this browser only.
export const XP = { kill: 100, head: 25, pair: 50, trio: 100, payback: 50, reach: 50, opening: 50, win: 400, finish: 150, collect: 50, deny: 25, hold: 50 };
export const MEDALS = { head: 'Sharp Eye', pair: 'Pair', trio: 'Trio', payback: 'Payback', reach: 'Long Reach', opening: 'Opening Shot' };
export const MAX_LEVEL = 30;
const KEY = 'graveshift.progress';

// Total XP needed to reach a level (level 1 = 0).
export const xpForLevel = level => { const l = Math.max(1, Math.min(MAX_LEVEL, level)) - 1; return 500 * l + 150 * l * (l + 1); };
export function levelOf(xp) { let l = 1; while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++; return l; }
// 0..1 progress through the current level (1 at the level cap).
export function levelProgress(xp) { const l = levelOf(xp); if (l >= MAX_LEVEL) return 1; const a = xpForLevel(l), b = xpForLevel(l + 1); return (xp - a) / (b - a); }

// Which awards one kill earns. chain = kills in quick succession including this one.
export function killAwards({ head = false, distance = 0, chain = 1, payback = false, opening = false } = {}) {
  const out = ['kill'];
  if (head) out.push('head');
  if (chain === 2) out.push('pair'); else if (chain >= 3) out.push('trio');
  if (payback) out.push('payback');
  if (distance >= 1800) out.push('reach');
  if (opening) out.push('opening');
  return out;
}
export const xpOf = awards => awards.reduce((n, a) => n + (XP[a] ?? 0), 0);

const count = v => Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0;
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, medals = {};
  for (const id of Object.keys(MEDALS)) medals[id] = count(r.medals?.[id]);
  return { xp: count(r.xp), kills: count(r.kills), deaths: count(r.deaths), matches: count(r.matches), wins: count(r.wins), medals };
}
export function loadProgress(storage = globalThis.localStorage) { try { return sanitize(JSON.parse(storage.getItem(KEY) || '{}')); } catch { return sanitize(); } }
export function saveProgress(p, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(sanitize(p))); } catch {} }

// Adds awards to a profile; returns { xp, levelUp } for the HUD.
export function grant(profile, awards) {
  const before = levelOf(profile.xp), xp = xpOf(awards);
  profile.xp += xp;
  for (const a of awards) if (a in profile.medals) profile.medals[a]++;
  if (awards.includes('kill')) profile.kills++;
  const after = levelOf(profile.xp);
  return { xp, levelUp: after > before ? after : 0 };
}

// Unlock table: { id: level }. Anything not listed is open from level 1.
export const unlockLevel = (table, id) => table?.[id] ?? 1;
export const isUnlocked = (table, id, level) => level >= unlockLevel(table, id);
// Keeps a loadout legal for a level: locked picks fall back to the first unlocked option.
export function legalPick(table, options, pick, level) { return options.includes(pick) && isUnlocked(table, pick, level) ? pick : options.find(id => isUnlocked(table, id, level)) ?? options[0]; }
