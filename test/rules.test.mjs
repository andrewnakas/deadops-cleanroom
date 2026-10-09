import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zombieHealth, roundPopulation, POWERUP_LIFETIME, powerupVisible } from '../export/web/rules.js';
import { SurvivalSession as Session } from '../export/web/session.js';
const data = JSON.parse(fs.readFileSync(new URL('../export/web/data/game.json', import.meta.url)));
for (const [id, w] of Object.entries(data.weapons)) { w.id = id; w.startAmmo ??= w.reserveMax; }
let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('zombie health grows linearly then geometrically', () => {
  assert.equal(zombieHealth(1, data.rules), 150);
  assert.equal(zombieHealth(2, data.rules), 250);
  assert.equal(zombieHealth(9, data.rules), 950);
  assert.ok(zombieHealth(20, data.rules) > zombieHealth(10, data.rules) * 2);
});
test('round population ramps up', () => {
  assert.ok(roundPopulation(1, data.rules) < roundPopulation(5, data.rules));
  assert.ok(roundPopulation(10, data.rules) > roundPopulation(5, data.rules));
});
test('every weapon is complete and uses an original CC0 model', () => {
  for (const [id, w] of Object.entries(data.weapons)) {
    for (const k of ['name', 'clipSize', 'reserveMax', 'fireTime', 'reloadTime', 'view']) assert.ok(w[k] !== undefined, `${id}.${k}`);
    assert.ok(fs.existsSync(new URL('../export/web/' + w.view.model, import.meta.url)), w.view.model);
    if (w.upgrade) assert.ok(w.upgrade.name && w.upgrade.name !== w.name, `${id} upgrade name`);
  }
  for (const id of data.boxPool) assert.ok(data.weapons[id] || data.equipment[id], id);
});
test('start, spend, buy and refine', () => {
  const s = new Session(data, random);
  assert.equal(s.points, 500); assert.equal(s.weapon.id, 'warden'); assert.equal(s.weapon.mag, 9);
  assert.ok(!s.spend(600)); assert.ok(s.spend(500));
  s.points = 10000; s.giveWeapon('halvard'); assert.equal(s.inventory.length, 2);
  assert.ok(!s.beginRefine(), 'needs power'); s.power = true; assert.ok(s.beginRefine());
  assert.ok(s.weaponUnavailable); assert.ok(!s.takeRefined()); s.update(4.1); assert.ok(s.takeRefined());
  assert.equal(s.def.name, 'Halvard Requiem'); assert.equal(s.weapon.mag, 45);
});
test('fire, reload and perks', () => {
  const s = new Session(data, random); s.phase = 'fighting';
  assert.ok(s.fire()); assert.equal(s.weapon.mag, 8); s.update(.2); assert.ok(s.reload()); s.update(2); assert.equal(s.weapon.mag, 9);
  assert.ok(s.drink('perk_hide')); s.update(2.3); assert.ok(s.perks.has('perk_hide')); assert.equal(s.maxHealth, 250);
  s.perks.add('perk_hands'); s.weapon.mag = 0; s.reload(); assert.ok(s.reloadLeft < 1);
});
test('second wind revives once, then game over', () => {
  const s = new Session(data, random); s.phase = 'fighting'; s.perks.add('perk_wind');
  s.damage(100); assert.equal(s.phase, 'reviving'); s.update(4.1); assert.equal(s.phase, 'fighting'); assert.equal(s.health, 100);
  s.effects.invulnerable = 0; s.damage(100); assert.equal(s.phase, 'gameover');
});
test('power-ups', () => {
  const s = new Session(data, random); s.weapon.reserve = 0;
  s.powerup('supply'); assert.equal(s.weapon.reserve, data.weapons.warden.reserveMax);
  const p = s.points; s.powerup('blackout'); s.powerup('rebuild'); assert.equal(s.points - p, 600);
  s.powerup('double'); const q = s.points; s.addPoints(50); assert.equal(s.points - q, 100);
  assert.ok(powerupVisible(1)); assert.ok(!powerupVisible(POWERUP_LIFETIME + 1));
  for (let i = 0; i < 40; i++) { s.totalScore += 5000; const t = s.drops.tryDrop(s); if (t) assert.ok(data.powerups[t], t); }
});
test('hound rounds come every few rounds', () => {
  const s = new Session(data, random); let hounds = 0;
  for (let r = 0; r < 20; r++) { s.nextRound(); if (s.dogRound) hounds++; }
  assert.ok(hounds >= 3 && hounds <= 6, String(hounds));
});
