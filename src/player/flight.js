import * as THREE from 'three';
import { clamp, smooth, wrapAngle } from '../core/noise.js';

export const CRUISE = 34;
export const SPRINT = 64;
const SLOW = 11;
const CLEARANCE = 1.1;
const CEILING = 460;
const HOME_RADIUS = 2300;

// 街机式飞行：为贴地飞调的，撞不坏。俯冲会自己拉平并弹一下，墙会把人推开
export class Flight {
  constructor(T, colliders) {
    this.T = T;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.speed = 24;
    this.vy = 0;
    this.gust = 1;
    this.alt = 10;
    this.boosting = false;
    this.bounced = false;
    this.homing = false;
    this.flip = 0;
    this.rollDir = 0;
    this.speedMul = 1;
    this.webbed = 0;
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, input) {
    const { T, pos } = this;
    const sx = input.steerX;
    const sy = input.steerY;
    this.bounced = false;

    const sf = this.speed / CRUISE;
    this.yawRate += ((-sx * 1.3) / (0.55 + 0.45 * sf) - this.yawRate) * Math.min(1, dt * 5);
    this.yaw += this.yawRate * dt;
    this.roll += (-sx * 0.78 - this.roll) * Math.min(1, dt * 4.5);

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let want = sy * 0.62;
    // 往前看两步：前方地面比现在的航线高，就提前拉起来
    for (const look of [0.35, 0.8]) {
      const reach = this.speed * look;
      const need = T.ground(pos.x + fx * reach, pos.z + fz * reach) + 1.7;
      const req = Math.atan2(need - pos.y, reach);
      if (req > want) want = Math.min(1.05, req);
    }
    if (pos.y > CEILING - 60 && want > 0) want *= clamp((CEILING - pos.y) / 60, 0, 1);
    this.pitch += (want - this.pitch) * Math.min(1, dt * 3.4);

    this.boosting = input.boost && this.gust > 0.02;
    const braking = input.brake;
    let target = braking ? SLOW : (this.boosting ? SPRINT : CRUISE) * this.speedMul;
    if (this.webbed > 0) target = Math.min(target, 16);
    target -= Math.sin(this.pitch) * 18;
    const rate = this.boosting ? 1.7 : braking ? 2.2 : 0.8;
    this.speed += (target - this.speed) * Math.min(1, dt * rate);
    this.gust = clamp(this.gust + (this.boosting ? -0.2 : 0.035) * dt, 0, 1);

    const cp = Math.cos(this.pitch);
    pos.x += fx * cp * this.speed * dt;
    pos.z += fz * cp * this.speed * dt;
    pos.y += (Math.sin(this.pitch) * this.speed + this.vy) * dt;
    this.vy *= Math.exp(-3 * dt);
    // 翻滚时往按住的那一侧横移一段，用来闪开咒语
    if (this.flip > 0 && this.rollDir) {
      const k = this.rollDir * 16 * dt;
      pos.x += Math.cos(this.yaw) * k;
      pos.z -= Math.sin(this.yaw) * k;
    }

    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const rr = c.r + 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || pos.y >= c.top + 0.6) continue;
      if (pos.y > c.top - 2) {
        pos.y = c.top + 0.6;
        if (this.pitch < 0) this.pitch *= 0.5;
      } else {
        const d = Math.sqrt(d2) || 0.01;
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
        this.speed *= Math.max(0, 1 - dt * 2);
      }
    }

    const g = T.ground(pos.x, pos.z);
    const floor = g + CLEARANCE;
    if (pos.y < floor) {
      pos.y = floor;
      if (this.pitch < -0.06) {
        this.vy = Math.min(7, -Math.sin(this.pitch) * this.speed * 0.4);
        this.pitch *= 0.3;
        this.bounced = true;
      }
    }
    this.alt = pos.y - g;

    // 飞得太远，风会把人转回岛的方向
    const r = Math.hypot(pos.x, pos.z);
    this.homing = r > HOME_RADIUS;
    if (this.homing) {
      const home = Math.atan2(pos.x, pos.z);
      this.yaw += wrapAngle(home - this.yaw) * Math.min(1, dt * 0.9 * smooth(HOME_RADIUS, HOME_RADIUS + 400, r));
    }

    if (this.flip > 0) this.flip = Math.max(0, this.flip - dt / 0.85);
  }
}
