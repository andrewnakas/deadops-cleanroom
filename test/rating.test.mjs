import test from 'node:test';
import assert from 'node:assert/strict';
import { rate, division, leaveBlock, seasonAt, softReset, SEASON_EPOCH, SEASON_SECONDS } from '../worker/src/rating.js';

test('equal teams move by half the K factor', () => {
  const r = rate([{ a: 'x', team: 0, rating: 1000, games: 0 }, { a: 'y', team: 1, rating: 1000, games: 20 }], 0);
  assert.equal(r.x.after, 1016); assert.equal(r.y.after, 990);
});
test('an upset pays more than an expected win', () => {
  const p = [{ a: 'low', team: 0, rating: 900, games: 20 }, { a: 'high', team: 1, rating: 1300, games: 20 }];
  assert.ok(rate(p, 0).low.after - 900 > 1300 - rate(p, 0).high.after - 1 && rate(p, 0).low.after - 900 > rate(p, 1).high.after - 1300);
});
test('a draw between equals changes nothing, and a leaver always loses rating', () => {
  const p = [{ a: 'x', team: 0, rating: 1000, games: 20 }, { a: 'y', team: 1, rating: 1000, games: 20 }, { a: 'z', team: 0, rating: 1000, games: 20, left: true }];
  const r = rate(p, null); assert.equal(r.x.after, 1000); assert.ok(r.z.after <= 992);
  assert.ok(rate(p, 0).z.after < 1000);
});
test('divisions, placement, leave blocks and seasons', () => {
  assert.equal(division(1600, 2), 'Unplaced'); assert.equal(division(1600, 5), 'Zenith'); assert.equal(division(1000, 9), 'Flint'); assert.equal(division(100, 9), 'Ember');
  assert.deepEqual([1, 2, 3, 9].map(leaveBlock), [300, 900, 3600, 3600]);
  assert.equal(seasonAt(SEASON_EPOCH - 5), 0); assert.equal(seasonAt(SEASON_EPOCH + SEASON_SECONDS + 1), 1); assert.equal(softReset(1400), 1200);
});
