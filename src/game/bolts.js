import * as THREE from 'three';
import { SPARK } from '../fx/particles.js';

const MAX = 140;
const _d = new THREE.Vector3();

// 所有飞行中的咒语：玩家的、敌人的、被弹回去的。每道是一个发光的小球加一串火花
export class Bolts {
  constructor(scene, glowMap, particles, T) {
    this.particles = particles;
    this.T = T;
    this.live = [];
    this.free = [];
    for (let i = 0; i < MAX; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })
      );
      sprite.visible = false;
      scene.add(sprite);
      this.free.push({ sprite, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }

  spawn(o) {
    const b = this.free.pop();
    if (!b) return null;
    b.pos.set(o.x, o.y, o.z);
    b.prev.copy(b.pos);
    b.vel.set(o.vx, o.vy, o.vz);
    b.speed = b.vel.length();
    b.life = o.life ?? 3;
    b.friendly = !!o.friendly;
    b.dmg = o.dmg ?? 1;
    b.kind = o.kind;
    b.target = o.target || null;
    b.owner = o.owner || null;
    b.turn = o.turn ?? 0;
    b.size = o.size ?? 2.5;
    b.dead = false;
    b.dodged = false;
    this.tint(b, o.color);
    b.sprite.scale.setScalar(b.size);
    b.sprite.position.copy(b.pos);
    b.sprite.visible = true;
    this.live.push(b);
    return b;
  }

  tint(b, color) {
    b.color = color;
    b.sprite.material.color.setRGB(color[0], color[1], color[2]);
  }

  release(b) {
    b.sprite.visible = false;
    b.target = b.owner = null;
    this.free.push(b);
  }

  clear() {
    for (const b of this.live) this.release(b);
    this.live.length = 0;
  }

  update(dt) {
    const { live, particles, T } = this;
    let n = 0;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      b.life -= dt;
      if (b.dead || b.life <= 0) {
        this.release(b);
        continue;
      }
      live[n++] = b;
      b.prev.copy(b.pos);
      if (b.turn > 0 && b.target && b.target.alive) {
        _d.copy(b.target.pos).sub(b.pos).normalize();
        b.vel.normalize().addScaledVector(_d, b.turn * dt).normalize().multiplyScalar(b.speed);
      }
      b.pos.addScaledVector(b.vel, dt);
      const c = b.color;
      if (b.pos.y < T.ground(b.pos.x, b.pos.z)) {
        b.dead = true;
        for (let k = 0; k < 6; k++) {
          particles.spawn(SPARK, b.pos.x, b.pos.y + 0.3, b.pos.z, (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8, 0.4, 0.3, c[0], c[1], c[2]);
        }
      }
      b.sprite.position.copy(b.pos);
      particles.spawn(SPARK, b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, 0.2, b.size * 0.16, c[0], c[1], c[2]);
    }
    live.length = n;
  }
}
