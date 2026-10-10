import test from 'node:test';
import assert from 'node:assert/strict';
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
