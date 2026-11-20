import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityOnScreen, tiltAngles, tiltSteer } from '../src/player/tilt.js';

const deg = (r) => (r * 180) / Math.PI;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} 不接近 ${b}`);

test('竖屏竖直拿着：重力指向屏幕下方', () => {
  const g = gravityOnScreen(90, 0, 0);
  near(g.x, 0);
  near(g.y, -1);
  near(g.z, 0);
});

test('横屏（旋转 90 度或 270 度）竖直拿着：重力仍指向屏幕下方', () => {
  for (const [beta, gamma, angle] of [[0, -90, 90], [0, 90, 270]]) {
    const g = gravityOnScreen(beta, gamma, angle);
    near(g.x, 0);
    near(g.y, -1);
    near(g.z, 0);
  }
});

test('横屏往后仰 45 度：只有俯仰，没有横滚', () => {
  for (const [beta, gamma, angle] of [[0, -45, 90], [0, 45, 270]]) {
    const t = tiltAngles(beta, gamma, angle);
    near(deg(t.roll), 0);
    near(deg(t.pitch), 45);
  }
});

test('屏幕右侧下沉 20 度：横滚为正，俯仰不变', () => {
  // 旋转 90 度时屏幕右侧是机身底部；旋转 270 度时是机身顶部
  for (const [beta, gamma, angle] of [[20, -90, 90], [-20, 90, 270]]) {
    const t = tiltAngles(beta, gamma, angle);
    near(deg(t.roll), 20);
    near(deg(t.pitch), 0);
  }
  near(deg(tiltAngles(45, 20, 0).roll) > 0 ? 1 : 0, 1);
});

test('平放朝上：俯仰 90 度', () => {
  near(deg(tiltAngles(0, 0, 0).pitch), 90);
});

test('换算成操纵量：死区、方向和上限', () => {
  const rest = tiltSteer(0.01, 0.8, 0.8);
  assert.deepEqual(rest, { x: 0, y: 0 });
  assert.ok(tiltSteer(0.2, 0.8, 0.8).x > 0, '右侧下沉向右转');
  assert.ok(tiltSteer(-0.2, 0.8, 0.8).x < 0, '左侧下沉向左转');
  assert.ok(tiltSteer(0, 1.0, 0.8).y < 0, '上沿往外推是俯冲');
  assert.ok(tiltSteer(0, 0.6, 0.8).y > 0, '往回扳是拉起');
  assert.equal(tiltSteer(2, 0.8, 0.8).x, 1);
  assert.equal(tiltSteer(0, -2, 0.8).y, 1);
});
