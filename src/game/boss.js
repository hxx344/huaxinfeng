import * as THREE from 'three';
import { Builder } from '../core/kit.js';
import { SPARK } from '../fx/particles.js';
import { bossMaxHp, bossRate } from './rules.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function additive(r, g, b, opacity) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// 伏地魔：三个阶段。索命咒只能躲；血量过半召来仆从；最后是魔杖对射
export class Boss {
  constructor(scene, glowMap, home) {
    this.home = new THREE.Vector3(home.x, home.y, home.z);
    this.name = '伏地魔';
    this.radius = 3.8;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    const B = new Builder();
    const robe = [0.03, 0.03, 0.04];
    const pale = [0.85, 0.88, 0.82];
    B.cone(0, -2.4, 0, 1.0, 3.8, robe, 10);
    B.ball(0, 1.25, 0, 0.55, robe);
    B.ball(0, 2.0, -0.05, 0.4, pale);
    for (const s of [-1, 1]) {
      B.put(new THREE.CylinderGeometry(0.09, 0.07, 1.5, 6), s * 0.95, 1.5, -0.1, robe, 0, 0, s * -1.2);
      B.ball(s * 1.65, 1.78, -0.1, 0.13, pale, 0);
    }
    B.put(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 5), 1.7, 1.85, -0.55, pale, 0, -Math.PI / 2 + 0.2);
    const mesh = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    mesh.scale.setScalar(1.8);
    this.group.add(mesh);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(0.2, 1.0, 0.35), opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    this.group.add(this.glow);
    scene.add(this.group);

    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 420, 14, 1, true), additive(0.15, 1.0, 0.3, 0.2));
    this.marker.position.set(home.x, home.y + 190, home.z);
    this.marker.frustumCulled = false;
    scene.add(this.marker);

    const beamGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8, 1, true).translate(0, 0.5, 0);
    this.beamMine = new THREE.Mesh(beamGeo, additive(1.0, 0.25, 0.12, 0.9));
    this.beamHis = new THREE.Mesh(beamGeo, additive(0.15, 1.0, 0.3, 0.9));
    this.clash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(1.0, 0.85, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    this.clash.scale.setScalar(14);
    for (const m of [this.beamMine, this.beamHis, this.clash]) {
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
    }
    this.duel = { active: false, tug: 0.5, cd: 0, t: 0 };
    this.reset();
  }

  get alive() {
    return this.state === 'fight' && this.hiddenT <= 0;
  }

  reset() {
    this.state = 'idle';
    this.pos.copy(this.home);
    this.baseY = this.home.y;
    this.group.visible = true;
    this.marker.visible = true;
    this.hp = this.maxHp = 1;
    this.rate = 1;
    this.phase = 1;
    this.hiddenT = 0;
    this.passT = 0;
    this.charge = 0;
    this.avadaCd = 3;
    this.tripleCd = 2;
    this.summonCd = 0;
    this.stagger = 0;
    this.flash = 0;
    this.minions = [];
    this.endDuel(0);
  }

  start(remaining) {
    this.maxHp = this.hp = bossMaxHp(remaining);
    this.rate = bossRate(remaining);
    this.state = 'fight';
    this.marker.visible = false;
    this.avadaCd = 2.5;
  }

  damage(d, ctx) {
    if (!this.alive) return;
    this.hp -= d;
    this.flash = 0.15;
    ctx.on.sfx('hit');
    if (this.hp <= 0) {
      this.state = 'dead';
      this.group.visible = false;
      this.endDuel(0);
      this.smoke(ctx, 120, 14);
      ctx.bossDefeated();
    }
  }

  smoke(ctx, n, speed) {
    const p = this.pos;
    for (let i = 0; i < n; i++) {
      const dark = i % 3 > 0;
      ctx.particles.spawn(SPARK, p.x + (Math.random() - 0.5) * 3, p.y + (Math.random() - 0.5) * 5, p.z + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * speed, (Math.random() - 0.3) * speed, (Math.random() - 0.5) * speed,
        0.6 + Math.random() * 0.9, dark ? 1.8 : 0.5, dark ? 0.012 : 0.2, dark ? 0.014 : 1.0, dark ? 0.012 : 0.35);
    }
  }

  vanish(ctx) {
    this.smoke(ctx, 40, 8);
    this.group.visible = false;
    this.hiddenT = 0.7;
    this.passT = 0;
    this.charge = 0;
  }

  appear(ctx) {
    const f = ctx.flight;
    const a = f.yaw + (Math.random() - 0.5) * 0.9;
    const d = 120 + Math.random() * 40;
    const x = f.pos.x - Math.sin(a) * d;
    const z = f.pos.z - Math.cos(a) * d;
    this.baseY = Math.max(ctx.T.ground(x, z) + 18, f.pos.y + Math.random() * 16 - 2);
    this.pos.set(x, this.baseY, z);
    this.group.visible = true;
    this.smoke(ctx, 40, 8);
  }

  startDuel(ctx) {
    const d = this.duel;
    d.active = true;
    d.tug = 0.5;
    d.t = 0;
    this.charge = 0;
    for (const m of [this.beamMine, this.beamHis, this.clash]) m.visible = true;
    ctx.on.sfx('duel');
  }

  endDuel(cd) {
    const d = this.duel;
    d.active = false;
    d.cd = cd;
    for (const m of [this.beamMine, this.beamHis, this.clash]) m.visible = false;
  }

  beam(mesh, from, to) {
    _c.copy(to).sub(from);
    const len = _c.length() || 0.001;
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(UP, _c.divideScalar(len));
    mesh.scale.set(1, len, 1);
  }

  updateDuel(dt, time, ctx) {
    const d = this.duel;
    const f = ctx.flight;
    const p = f.pos;
    const { fwd, right } = ctx;
    d.t += dt;
    // 他在前方来回游走，要一直把他压在准星里
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const side = Math.sin(d.t * 1.15) * 28;
    _a.set(p.x + (fwd.x / fl) * 85 + right.x * side, 0, p.z + (fwd.z / fl) * 85 + right.z * side);
    _a.y = Math.max(ctx.T.ground(_a.x, _a.z) + 10, p.y + 6 + Math.sin(d.t * 0.8) * 9);
    this.pos.lerp(_a, Math.min(1, dt * 2.4));

    _b.copy(this.pos).sub(p).normalize();
    const aimed = _b.dot(fwd) > Math.cos(Math.acos(ctx.stats.lockCos) * 1.15);
    const pushing = ctx.castHeld && aimed;
    d.tug += (pushing ? 0.26 : -0.2) * dt - 0.05 * dt;
    ctx.warn = pushing ? '闪回咒：稳住！' : '闪回咒：对准他，按住施咒';

    _a.copy(p).addScaledVector(fwd, 1.5);
    _b.copy(_a).lerp(this.pos, Math.min(0.97, Math.max(0.03, d.tug)));
    this.beam(this.beamMine, _a, _b);
    this.beam(this.beamHis, this.pos, _b);
    this.clash.position.copy(_b);
    this.clash.scale.setScalar(12 + Math.sin(time * 30) * 3);
    for (let i = 0; i < 2; i++) {
      ctx.particles.spawn(SPARK, _b.x, _b.y, _b.z, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, 0.4, 0.35, 1.0, 0.85, 0.4);
    }

    if (d.tug >= 1) {
      this.endDuel(13);
      this.stagger = 3;
      ctx.on.toast('咒语顶了回去', '他被自己的咒语击中了', 3);
      ctx.on.sfx('duelWin');
      this.damage(this.maxHp * 0.22, ctx);
    } else if (d.tug <= 0) {
      this.endDuel(10);
      ctx.hurt(30);
    }
  }

  update(dt, time, ctx) {
    if (this.state === 'dead') return;
    const f = ctx.flight;
    const p = f.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    this.group.rotation.y = Math.atan2(-dx, -dz);
    if (this.flash > 0) this.flash -= dt;
    const charging = this.charge > 0 ? (0.9 - this.charge) * 34 : 0;
    this.glow.scale.setScalar(18 + charging + Math.sin(time * 3) * 2);
    this.glow.material.opacity = this.flash > 0 ? 1 : 0.55;

    if (this.state === 'idle') {
      this.pos.y = this.home.y + Math.sin(time) * 1.5;
      return;
    }
    if (this.hiddenT > 0) {
      this.hiddenT -= dt;
      if (this.hiddenT <= 0) this.appear(ctx);
      return;
    }

    const frac = this.hp / this.maxHp;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase !== this.phase) {
      this.phase = phase;
      if (phase === 2) {
        this.summonCd = 0;
        ctx.on.toast('伏地魔召来了仆从', '食死徒和摄魂怪正在赶来', 4);
      } else if (phase === 3) {
        this.duel.cd = 0.5;
        ctx.on.toast('闪回咒', '两道咒语顶在了一起：对准他，按住施咒', 5);
      }
    }
    if (this.stagger > 0) this.stagger -= dt;
    if (Math.random() < dt * 30) this.smoke(ctx, 1, 2);

    if (this.duel.active) {
      this.updateDuel(dt, time, ctx);
      return;
    }

    // 玩家飞过去或飞远了，他化成黑烟，在前方重新现身
    const dist = Math.hypot(dx, p.y - this.pos.y, dz);
    const ahead = -(dx * ctx.fwd.x + dz * ctx.fwd.z);
    if ((ahead < -15 && dist > 60) || dist > 300) {
      this.passT += dt;
      if (this.passT > 0.8) {
        this.vanish(ctx);
        return;
      }
    } else this.passT = 0;
    this.pos.y = this.baseY + Math.sin(time * 1.3) * 2.5;
    if (this.stagger > 0) return;

    if (this.charge > 0) {
      this.charge -= dt;
      ctx.warn = '他在念索命咒……';
      if (this.charge <= 0) {
        ctx.hostileFire(this, 'avada', 0);
        ctx.on.sfx('avada');
      }
    } else {
      this.avadaCd -= dt * this.rate;
      if (this.avadaCd <= 0 && dist < 240) {
        this.charge = 0.9;
        this.avadaCd = phase === 3 ? 3.0 : 4.2;
        ctx.on.sfx('charge');
      }
    }

    if (phase >= 2) {
      this.tripleCd -= dt * this.rate;
      if (this.tripleCd <= 0 && dist < 200) {
        this.tripleCd = 3.4;
        for (let i = 0; i < 3; i++) ctx.hostileFire(this, 'curse', 0.09);
      }
      this.summonCd -= dt;
      this.minions = this.minions.filter((m) => m.alive);
      if (this.summonCd <= 0 && this.minions.length < 2) {
        this.summonCd = 28;
        for (const [type, n] of [['eater', 2], ['dementor', 2]]) {
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            this.minions.push(ctx.spawn(type, this.pos.x + Math.cos(a) * 30, this.pos.y + Math.random() * 10, this.pos.z + Math.sin(a) * 30));
          }
        }
      }
    }
    if (phase === 3) {
      this.duel.cd -= dt;
      if (this.duel.cd <= 0 && this.charge <= 0) this.startDuel(ctx);
    }
  }
}
