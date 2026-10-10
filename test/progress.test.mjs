import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, claimChallenges, canTour, startTour, MAX_TOUR, xpForLevel as xpAt } from '../export/web/progress.js';
import { xpForLevel, levelOf, levelProgress, killAwards, xpOf, sanitize, grant, loadProgress, saveProgress, legalPick, isUnlocked, MAX_LEVEL, XP } from '../export/web/progress.js';

test('levels rise with xp and stop at the cap', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(xpForLevel(2) - 1), 1);
  assert.equal(levelOf(xpForLevel(2)), 2);
  for (let l = 2; l <= MAX_LEVEL; l++) assert.ok(xpForLevel(l) > xpForLevel(l - 1));
  assert.equal(levelOf(1e9), MAX_LEVEL);
  assert.equal(levelProgress(1e9), 1);
  assert.ok(Math.abs(levelProgress((xpForLevel(3) + xpForLevel(4)) / 2) - .5) < 1e-9);
});

test('kill awards stack and are priced', () => {
  assert.deepEqual(killAwards(), ['kill']);
  assert.deepEqual(killAwards({ head: true, chain: 2, payback: true, distance: 2000, opening: true }), ['kill', 'head', 'pair', 'payback', 'reach', 'opening']);
  assert.deepEqual(killAwards({ chain: 4 }), ['kill', 'trio']);
  assert.equal(xpOf(['kill', 'head']), XP.kill + XP.head);
});

test('grant records medals, kills and level-ups', () => {
  const p = sanitize();
  const r = grant(p, ['kill', 'head']);
  assert.equal(r.xp, 125); assert.equal(r.levelUp, 0);
  assert.equal(p.kills, 1); assert.equal(p.medals.head, 1);
  p.xp = xpForLevel(2) - 50;
  assert.equal(grant(p, ['kill']).levelUp, 2);
});

test('stored profiles are sanitised and survive a round trip', () => {
  const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadProgress(storage).xp, 0);
  mem.set('graveshift.progress', '{"xp":"<b>","kills":-4,"medals":{"head":2.9,"bogus":7}}');
  const p = loadProgress(storage);
  assert.equal(p.xp, 0); assert.equal(p.kills, 0); assert.equal(p.medals.head, 2); assert.equal(p.medals.bogus, undefined);
  p.xp = 900; saveProgress(p, storage);
  assert.equal(loadProgress(storage).xp, 900);
  mem.set('graveshift.progress', 'not json');
  assert.equal(loadProgress(storage).xp, 0);
});

test('locked picks fall back to an unlocked option', () => {
  const table = { ranger: 4, kestrel: 8 }, options = ['halvard', 'ranger', 'kestrel'];
  assert.equal(isUnlocked(table, 'halvard', 1), true);
  assert.equal(legalPick(table, options, 'kestrel', 5), 'halvard');
  assert.equal(legalPick(table, options, 'ranger', 5), 'ranger');
  assert.equal(legalPick(table, options, 'nonsense', 30), 'halvard');
});

test('challenge tiers pay once each', () => {
  const p = sanitize({ kills: 24 });
  assert.deepEqual(claimChallenges(p), []);
  p.kills = 120;
  const got = claimChallenges(p);
  assert.deepEqual(got.map(g => [g.name, g.tier, g.xp]), [['Marksman', 1, 500], ['Marksman', 2, 1000]]);
  assert.equal(p.xp, 1500);
  assert.deepEqual(claimChallenges(p), []);
  p.medals.head = 10;
  assert.equal(claimChallenges(p)[0].name, 'Clean Shot');
  assert.equal(sanitize({ done: { kills: 99 } }).done.kills, CHALLENGES[0].tiers.length);
});

test('a new tour needs the level cap and stops at the last tour', () => {
  const p = sanitize({ xp: 10, kills: 7 });
  assert.equal(startTour(p), false);
  p.xp = xpAt(MAX_LEVEL);
  assert.ok(canTour(p));
  assert.ok(startTour(p));
  assert.deepEqual([p.xp, p.tour, p.kills], [0, 1, 7]);
  p.xp = xpAt(MAX_LEVEL); p.tour = MAX_TOUR;
  assert.equal(startTour(p), false);
});
