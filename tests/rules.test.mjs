import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, offerUpgrades, playerStats, bossMaxHp, bossRate, guardPlan, pickTarget, segDist2, leadPoint } from '../src/game/rules.js';
import { mulberry32 } from '../src/core/noise.js';

test('三选一：不重复，不给已经拿满的强化', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const offers = offerUpgrades({ blast: 1, rapid: 3 }, rng);
    assert.equal(offers.length, 3);
    assert.equal(new Set(offers.map((o) => o.id)).size, 3);
    assert.ok(!offers.some((o) => o.id === 'blast' || o.id === 'rapid'));
  }
});

test('三选一：剩下的不够三个时有几个给几个', () => {
  const owned = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  assert.equal(offerUpgrades(owned, Math.random).length, 0);
  owned.vigor = 0;
  assert.deepEqual(offerUpgrades(owned, Math.random).map((o) => o.id), ['vigor']);
});

test('强化改变的数值', () => {
  const base = playerStats({});
  const up = playerStats({ rapid: 2, power: 1, vigor: 2, shield: 2, parry: 1, seeker: 1, phoenix: 1 });
  assert.ok(up.fireInterval < base.fireInterval * 0.6);
  assert.equal(up.damage, 2);
  assert.equal(up.maxHp, 160);
  assert.equal(up.shieldCd, 4);
  assert.equal(up.parryDamage, 9);
  assert.ok(up.lockRange > base.lockRange && up.lockCos < base.lockCos);
  assert.equal(up.revives, 1);
});

test('伏地魔：魂器剩得越多越强', () => {
  for (let r = 0; r < 7; r++) {
    assert.ok(bossMaxHp(r + 1) > bossMaxHp(r));
    assert.ok(bossRate(r + 1) > bossRate(r));
  }
  assert.ok(bossMaxHp(7) >= 3 * bossMaxHp(0));
});

test('守卫：越往后越多，树蜂只守金杯', () => {
  const count = (p) => Object.values(p).reduce((a, b) => a + b, 0);
  for (const id of ['diary', 'ring', 'locket', 'cup', 'diadem', 'nagini']) {
    assert.ok(count(guardPlan(id, 0)) >= 1);
    assert.ok(count(guardPlan(id, 5)) > count(guardPlan(id, 0)));
    assert.equal(guardPlan(id, 5).dragon || 0, id === 'cup' ? 1 : 0);
  }
});

test('锁定：只锁前方锥形内、射程内最正对的目标', () => {
  const p = { x: 0, y: 0, z: 0 };
  const f = { x: 0, y: 0, z: -1 };
  const at = (x, y, z) => ({ pos: { x, y, z } });
  const cos = Math.cos(0.42);
  assert.equal(pickTarget([at(0, 0, 50)], p, f, 170, cos), -1, '身后的不锁');
  assert.equal(pickTarget([at(0, 0, -300)], p, f, 170, cos), -1, '太远的不锁');
  assert.equal(pickTarget([at(60, 0, -60)], p, f, 170, cos), -1, '偏出锥形的不锁');
  assert.equal(pickTarget([at(20, 0, -80), at(2, 0, -120)], p, f, 170, cos), 1, '更正对的优先');
  assert.equal(pickTarget([at(0, 0, -150), at(0, 0, -40)], p, f, 170, cos), 1, '同样正对时近的优先');
});

test('线段到点的距离', () => {
  assert.equal(segDist2(0, 0, 0, 10, 0, 0, 5, 3, 0), 9);
  assert.equal(segDist2(0, 0, 0, 10, 0, 0, -4, 0, 3), 25);
  assert.equal(segDist2(1, 1, 1, 1, 1, 1, 1, 1, 3), 4);
});

test('提前量：朝算出来的点发射，能在同一时刻碰上目标', () => {
  const p = { x: 100, y: 20, z: -40 };
  const v = { x: -20, y: 2, z: 25 };
  const o = { x: 0, y: 10, z: 0 };
  const speed = 62;
  const aim = leadPoint(p, v, o, speed);
  const t = Math.hypot(aim.x - o.x, aim.y - o.y, aim.z - o.z) / speed;
  assert.ok(Math.abs(p.x + v.x * t - aim.x) < 1e-6);
  assert.ok(Math.abs(p.z + v.z * t - aim.z) < 1e-6);
  const still = leadPoint(p, { x: 0, y: 0, z: 0 }, o, speed);
  assert.deepEqual(still, p);
});
