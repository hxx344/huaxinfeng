import * as THREE from 'three';
import { clamp } from '../core/noise.js';
import { Builder } from '../core/kit.js';
import { SPARK } from '../fx/particles.js';
import { Bolts } from './bolts.js';
import { Boss } from './boss.js';
import { makeEnemy, removeEnemy, updateEnemy } from './enemies.js';
import { playerStats, pickTarget, segDist2, leadPoint, guardPlan, offerUpgrades } from './rules.js';

const KINDS = {
  curse: { color: [0.7, 0.2, 1.0], speed: 62, dmg: 12, size: 3.4 },
  web: { color: [0.85, 0.9, 0.95], speed: 55, dmg: 6, size: 3.0 },
  fire: { color: [1.0, 0.45, 0.08], speed: 74, dmg: 9, size: 3.8 },
  avada: { color: [0.15, 1.0, 0.3], speed: 100, dmg: 45, size: 6 },
};
const STUN = [1.0, 0.22, 0.12];
const GOLD = [1.0, 0.8, 0.3];
const SILVER = [0.6, 0.85, 1.0];
const CULL = 1100;
const PATRONUS_TIME = 1.6;
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _tmp = [0, 0, 0];

function stagMesh() {
  const B = new Builder();
  const c = [0.6, 0.85, 1.0];
  B.box(0, 1.2, 0, 0.7, 0.9, 2.2, c);
  B.put(new THREE.BoxGeometry(0.4, 1.2, 0.45), 0, 2.3, -1.1, c, 0, -0.5);
  B.box(0, 2.7, -1.85, 0.42, 0.42, 0.8, c);
  for (const [x, z] of [[-0.25, -0.85], [0.25, -0.85], [-0.25, 0.85], [0.25, 0.85]]) B.box(x, 0, z, 0.16, 1.25, 0.16, c);
  for (const s of [-1, 1]) {
    B.put(new THREE.BoxGeometry(0.08, 1.3, 0.08), s * 0.35, 3.6, -1.6, c, 0, 0.2, s * -0.5);
    B.put(new THREE.BoxGeometry(0.07, 0.7, 0.07), s * 0.75, 3.9, -1.75, c, 0, -0.5, s * -1.1);
    B.put(new THREE.BoxGeometry(0.07, 0.6, 0.07), s * 0.5, 4.1, -1.4, c, 0, 0.6, s * -0.2);
  }
  const m = B.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.setScalar(2.4);
  m.visible = false;
  return m;
}

// 一局里的全部战斗状态：玩家的生命和咒语、敌人、魂器的守卫、伏地魔
export class Combat {
  constructor({ scene, terrain, flight, wake, particles, glowMap, horcruxes, sites, on }) {
    this.scene = scene;
    this.T = terrain;
    this.flight = flight;
    this.wake = wake;
    this.particles = particles;
    this.glowMap = glowMap;
    this.horcruxes = horcruxes;
    this.on = on;
    this.bolts = new Bolts(scene, glowMap, particles, terrain);
    this.boss = new Boss(scene, glowMap, { x: sites.stack.x, y: sites.stack.y + 62, z: sites.stack.z });
    this.enemies = [];
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.playerVel = new THREE.Vector3();
    this.cands = [];
    this.stag = stagMesh();
    this.stag.rotation.order = 'YXZ';
    scene.add(this.stag);
    this.bubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.6, 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.7, 1.0), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.bubble.visible = false;
    scene.add(this.bubble);
    this.reset();
  }

  reset() {
    for (const e of this.enemies) removeEnemy(e, this.scene);
    this.enemies.length = 0;
    this.bolts.clear();
    this.horcruxes.reset();
    this.boss.reset();
    this.owned = {};
    this.stats = playerStats(this.owned);
    this.hp = this.stats.maxHp;
    this.revivesUsed = 0;
    this.destroyed = new Set();
    this.kills = 0;
    this.elapsed = 0;
    this.castCd = 0;
    this.parryCd = 0;
    this.parryT = 0;
    this.shieldCd = 0;
    this.shieldT = 0;
    this.rollCd = 0;
    this.patT = 0;
    this.patR = 0;
    this.patHit = new Set();
    this.stagT = 0;
    this.hurtT = 0;
    this.chill = 0;
    this.skim = 0;
    this.hintT = 0;
    this.sfxT = 0;
    this.ambientT = 45;
    this.dead = false;
    this.won = false;
    this.target = null;
    this.targetShielded = false;
    this.warn = '';
    this.castHeld = false;
    this.stag.visible = false;
    this.bubble.visible = false;
    const f = this.flight;
    f.gust = 1;
    f.speedMul = 1;
    f.webbed = 0;
    f.flip = 0;
  }

  get fieldLeft() {
    let n = 0;
    for (const h of this.horcruxes.items) if (h.alive) n++;
    return n;
  }

  // 还剩几件魂器，伤疤也算
  get remaining() {
    return this.fieldLeft + (this.destroyed.has('scar') ? 0 : 1);
  }

  applyUpgrade(id) {
    this.owned[id] = (this.owned[id] || 0) + 1;
    this.stats = playerStats(this.owned);
    this.flight.speedMul = this.stats.speedMul;
    if (id === 'vigor') this.hp += 30;
    if (id === 'dittany') this.hp += 50;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  hint(text, sub) {
    if (this.hintT > 0) return;
    this.hintT = 4;
    this.on.toast(text, sub, 2.6);
  }

  burst(p, n, c, speed = 8, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.spawn(SPARK, p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1.5, Math.sin(a) * Math.cos(e) * s,
        0.5 + Math.random() * 0.7, size * (0.6 + Math.random() * 0.8), c[0], c[1], c[2]);
    }
  }

  spawn(type, x, y, z) {
    const floor = this.T.ground(x, z) + 2;
    const e = makeEnemy(type, this.scene, this.glowMap, x, Math.max(y, floor), z);
    this.enemies.push(e);
    return e;
  }

  kill(e, color = KINDS.curse.color) {
    if (!e.alive) return;
    e.alive = false;
    this.kills++;
    this.burst(e.pos, e.type === 'dragon' ? 90 : 30, color, e.type === 'dragon' ? 16 : 9, 0.45);
    this.burst(e.pos, 14, [0.012, 0.012, 0.018], 5, 1.6);
    this.on.sfx('kill');
  }

  heal(n) {
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
  }

  // 摄魂怪靠近时吸走魔力，贴身时吸走生命
  drain(mana, hp) {
    this.flight.gust = Math.max(0, this.flight.gust - mana);
    this.chill = 1;
    if (hp > 0) this.hurt(hp, true);
  }

  hurt(d, quiet = false) {
    if (this.dead || this.won) return;
    this.hp -= d;
    if (!quiet) {
      this.hurtT = 1;
      this.on.sfx('hurt');
    }
    if (this.hp > 0) return;
    if (this.revivesUsed < this.stats.revives) {
      this.revivesUsed++;
      this.hp = this.stats.maxHp * 0.5;
      this.shieldT = Math.max(this.shieldT, 3);
      this.burst(this.flight.pos, 60, [1.0, 0.5, 0.15], 12, 0.5);
      this.on.toast('凤凰眼泪', '福克斯把你拉了回来', 4);
      this.on.sfx('horcrux');
      return;
    }
    this.hp = 0;
    this.dead = true;
    this.warn = '';
    this.burst(this.flight.pos, 60, STUN, 12, 0.5);
    this.on.over(false);
  }

  bossDefeated() {
    this.won = true;
    this.warn = '';
    this.bolts.clear();
    // 他一倒，剩下的仆从跟着散掉，不算进击败数
    const kills = this.kills;
    for (const e of this.enemies) this.kill(e);
    this.kills = kills;
    this.on.over(true);
  }

  hostileFire(owner, kind, spread) {
    const k = KINDS[kind];
    const from = owner.pos;
    const aim = leadPoint(this.flight.pos, this.playerVel, from, k.speed);
    _v.set(aim.x - from.x, aim.y - from.y, aim.z - from.z).normalize();
    if (spread) _v.set(_v.x + (Math.random() - 0.5) * 2 * spread, _v.y + (Math.random() - 0.5) * 2 * spread, _v.z + (Math.random() - 0.5) * 2 * spread).normalize();
    this.bolts.spawn({
      x: from.x + _v.x * owner.radius, y: from.y + _v.y * owner.radius, z: from.z + _v.z * owner.radius,
      vx: _v.x * k.speed, vy: _v.y * k.speed, vz: _v.z * k.speed,
      color: k.color, size: k.size, dmg: k.dmg, kind, owner, life: 4.5,
    });
    if (kind !== 'avada' && this.sfxT <= 0) {
      this.sfxT = 0.12;
      this.on.sfx('enemyCast');
    }
  }

  shoot(target, k) {
    const f = this.flight;
    _o.copy(f.pos).addScaledVector(this.fwd, 1.5);
    if (target) _v.copy(target.pos).sub(_o).normalize();
    else _v.copy(this.fwd);
    if (k > 0) _v.addScaledVector(this.right, (k % 2 ? 1 : -1) * 0.08 * Math.ceil(k / 2)).normalize();
    this.bolts.spawn({
      x: _o.x, y: _o.y, z: _o.z, vx: _v.x * 150, vy: _v.y * 150, vz: _v.z * 150,
      color: STUN, size: 2.8, dmg: this.stats.damage, kind: 'stun', friendly: true, target, turn: 9, life: 1.5,
    });
  }

  damage(h, dmg, b) {
    if (h.isHorcrux) {
      if (h.shielded) {
        this.on.sfx('block');
        const left = h.guards.filter((g) => g.alive).length;
        this.hint('魂器被黑魔法护着', `先清掉守卫，还剩 ${left} 个`);
        return;
      }
      h.hp -= dmg;
      this.on.sfx('hit');
      if (h.hp <= 0) this.destroyHorcrux(h);
      return;
    }
    if (h === this.boss) {
      h.damage(dmg, this);
      return;
    }
    if (!h.alive) return;
    // 树蜂正面的鳞甲很厚，要绕到侧后方打
    if (h.type === 'dragon' && b && b.vel.dot(h.face) < -0.3 * b.speed) {
      dmg *= 0.5;
      this.hint('树蜂正面的鳞甲很厚', '绕到它的侧后方再打');
    }
    h.hp -= dmg;
    h.flash = 0.15;
    if (h.hp <= 0) this.kill(h);
    else this.on.sfx('hit');
  }

  destroyHorcrux(h) {
    this.horcruxes.destroy(h);
    this.destroyed.add(h.id);
    this.heal(25);
    this.burst(h.pos, 90, GOLD, 16, 0.5);
    this.burst(h.pos, 40, [0.012, 0.014, 0.012], 9, 2);
    this.on.sfx('horcrux');
    const left = this.fieldLeft;
    this.on.toast(`${h.name}已毁`, left ? `场地上还剩 ${left} 件魂器` : '场地上的魂器都毁掉了，去找伏地魔', 4.5);
    const offers = offerUpgrades(this.owned, Math.random);
    if (offers.length) this.on.choice(offers);
  }

  breakScar() {
    this.destroyed.add('scar');
    this.hurtT = 1;
    this.shieldT = Math.max(this.shieldT, 1.5);
    this.burst(this.flight.pos, 70, KINDS.avada.color, 14, 0.5);
    this.on.toast('第七件魂器', '索命咒毁掉了你伤疤里的那片灵魂，你还活着', 5);
    this.on.sfx('horcrux');
    this.boss.stagger = 3;
    this.boss.damage(18, this);
  }

  wakeGuards(h) {
    h.awake = true;
    const plan = guardPlan(h.id, this.destroyed.size);
    for (const [type, n] of Object.entries(plan)) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = type === 'dragon' ? 65 : 22 + Math.random() * 30;
        const e = this.spawn(type, h.pos.x + Math.cos(a) * r, h.pos.y + (type === 'dragon' ? 6 : Math.random() * 10 - 2), h.pos.z + Math.sin(a) * r);
        e.guard = true;
        e.home.set(h.pos.x, h.pos.y, h.pos.z);
        h.guards.push(e);
      }
    }
    this.on.toast(`${h.name} · ${h.place}`, '清掉守卫，再击碎魂器', 4);
    this.on.sfx('alarm');
  }

  inputs(input) {
    const f = this.flight;
    const s = this.stats;
    if (input.take('KeyQ') && this.rollCd <= 0 && f.flip <= 0) {
      f.flip = 1;
      f.rollDir = input.steerX < -0.2 ? -1 : input.steerX > 0.2 ? 1 : 0;
      this.rollCd = s.rollCd;
      this.on.sfx('roll');
    }
    if (input.take('KeyR') && this.shieldCd <= 0) {
      if (f.gust >= 0.2) {
        f.gust -= 0.2;
        this.shieldT = s.shieldTime;
        this.shieldCd = s.shieldCd;
        this.on.sfx('shield');
      } else this.hint('魔力不足', '盔甲护身需要两成魔力');
    }
    if (input.take('KeyE') && this.parryCd <= 0) {
      this.parryT = s.parryWindow;
      this.parryCd = 0.8;
      this.on.sfx('swing');
    }
    if (input.take('KeyG') && this.patT <= 0) {
      if (f.gust >= 0.5) {
        this.patR = s.patronusRange * (0.55 + 0.45 * f.gust);
        f.gust = 0;
        this.patT = PATRONUS_TIME;
        this.patHit.clear();
        this.stagT = 2.6;
        this.stag.visible = true;
        this.stag.position.copy(f.pos);
        this.stagYaw = f.yaw;
        this.on.sfx('patronus');
      } else this.hint('魔力不足', '呼神护卫至少需要半条魔力');
    }
  }

  pickLock() {
    const { cands, stats, flight, fwd } = this;
    cands.length = 0;
    for (const e of this.enemies) if (e.alive && e.type !== 'dementor') cands.push(e);
    if (this.boss.alive) cands.push(this.boss);
    for (const h of this.horcruxes.items) if (h.alive && h.awake && !h.shielded) cands.push(h);
    let i = pickTarget(cands, flight.pos, fwd, stats.lockRange, stats.lockCos);
    this.targetShielded = false;
    if (i < 0) {
      cands.length = 0;
      for (const h of this.horcruxes.items) if (h.alive && h.awake) cands.push(h);
      i = pickTarget(cands, flight.pos, fwd, stats.lockRange, stats.lockCos);
      this.targetShielded = i >= 0;
    }
    this.target = i >= 0 ? cands[i] : null;
  }

  cast() {
    const s = this.stats;
    const f = this.flight;
    if (f.gust < s.castCost) {
      this.hint('魔力耗尽', '贴着地面或湖面飞，魔力回得快');
      return;
    }
    f.gust -= s.castCost;
    this.castCd = s.fireInterval;
    this.shoot(this.target, 0);
    if (s.shots > 1) {
      const rest = this.cands.filter((c) => c !== this.target);
      for (let k = 1; k < s.shots; k++) {
        const i = pickTarget(rest, f.pos, this.fwd, s.lockRange, s.lockCos);
        this.shoot(i >= 0 ? rest.splice(i, 1)[0] : this.target, k);
      }
    }
    this.on.sfx('cast');
  }

  collide() {
    const p = this.flight.pos;
    const s = this.stats;
    for (const b of this.bolts.live) {
      if (b.dead) continue;
      const a = b.prev;
      const q = b.pos;
      if (b.friendly) {
        let hit = null;
        for (const e of this.enemies) {
          if (!e.alive || e.type === 'dementor') continue;
          const r = e.radius + 1;
          if (segDist2(a.x, a.y, a.z, q.x, q.y, q.z, e.pos.x, e.pos.y, e.pos.z) < r * r) {
            hit = e;
            break;
          }
        }
        if (!hit && this.boss.alive) {
          const r = this.boss.radius + 1;
          const bp = this.boss.pos;
          if (segDist2(a.x, a.y, a.z, q.x, q.y, q.z, bp.x, bp.y, bp.z) < r * r) hit = this.boss;
        }
        if (!hit) {
          for (const h of this.horcruxes.items) {
            if (!h.alive || !h.awake) continue;
            const r = h.radius + 1;
            if (segDist2(a.x, a.y, a.z, q.x, q.y, q.z, h.pos.x, h.pos.y, h.pos.z) < r * r) {
              hit = h;
              break;
            }
          }
        }
        if (!hit) continue;
        b.dead = true;
        this.burst(q, 10, b.color, 7, 0.3);
        this.damage(hit, b.dmg, b);
        if (s.blast && b.kind === 'stun') {
          for (const e of this.enemies) {
            if (e !== hit && e.alive && e.type !== 'dementor' && e.pos.distanceToSquared(hit.pos) < 196) this.damage(e, 1, null);
          }
        }
        continue;
      }

      if (this.parryT > 0 && b.kind !== 'avada' && q.distanceToSquared(p) < 18 * 18) {
        // 除你武器：把咒语弹回给施咒的人
        b.friendly = true;
        b.kind = 'reflect';
        b.dmg = s.parryDamage;
        b.target = b.owner && b.owner.alive ? b.owner : null;
        if (b.target) _v.copy(b.target.pos).sub(q).normalize();
        else _v.copy(b.vel).normalize().negate();
        b.speed = 120;
        b.vel.copy(_v).multiplyScalar(120);
        b.turn = 8;
        b.life = 3;
        this.bolts.tint(b, GOLD);
        this.burst(q, 12, GOLD, 8, 0.3);
        this.on.sfx('parry');
        continue;
      }
      if (segDist2(a.x, a.y, a.z, q.x, q.y, q.z, p.x, p.y, p.z) > 2.3 * 2.3) continue;
      if (this.flight.flip > 0) continue;
      if (b.kind !== 'avada' && this.shieldT > 0) {
        b.dead = true;
        this.burst(q, 12, [0.4, 0.7, 1.0], 8, 0.3);
        this.on.sfx('block');
        continue;
      }
      b.dead = true;
      if (b.kind === 'avada' && !this.destroyed.has('scar')) this.breakScar();
      else {
        this.hurt(b.dmg);
        if (b.kind === 'web') {
          this.flight.webbed = 2.5;
          this.hint('被蛛网缠住了', '速度暂时提不起来');
        }
      }
    }
  }

  patronus(dt) {
    const f = this.flight;
    const p = f.pos;
    if (this.stagT > 0) {
      this.stagT -= dt;
      const st = this.stag;
      st.position.x -= Math.sin(this.stagYaw) * 75 * dt;
      st.position.z -= Math.cos(this.stagYaw) * 75 * dt;
      const g = this.T.ground(st.position.x, st.position.z) + 0.5;
      st.position.y += (Math.max(g, Math.min(st.position.y, g + 12)) - st.position.y) * Math.min(1, dt * 4);
      st.rotation.set(Math.sin(this.stagT * 14) * 0.18, this.stagYaw, 0);
      st.material.opacity = 0.75 * Math.min(1, this.stagT * 2);
      this.particles.spawn(SPARK, st.position.x, st.position.y + 3, st.position.z, 0, 1, 0, 0.6, 0.5, SILVER[0], SILVER[1], SILVER[2]);
      if (this.stagT <= 0) st.visible = false;
    }
    if (this.patT <= 0) return;
    this.patT -= dt;
    const k = 1 - Math.max(0, this.patT) / PATRONUS_TIME;
    const r = this.patR * (1 - (1 - k) * (1 - k));
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(SPARK, p.x + Math.cos(a) * r, p.y + (Math.random() - 0.5) * 6, p.z + Math.sin(a) * r, 0, 1, 0, 0.5, 0.5, SILVER[0], SILVER[1], SILVER[2]);
    }
    const sp = this.stag.position;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = e.pos.distanceToSquared(p);
      if (e.type === 'dementor') {
        // 银光扫到的、被牡鹿撞上的、还有跟在尾流里的，都会被驱散
        const near = d2 < r * r || (this.stagT > 0 && e.pos.distanceToSquared(sp) < 24 * 24) || this.wake.sample(e.pos.x, e.pos.y, e.pos.z, _tmp);
        if (near) this.kill(e, SILVER);
      } else if (this.stats.patronusDamage > 0 && d2 < r * r && !this.patHit.has(e)) {
        this.patHit.add(e);
        this.damage(e, this.stats.patronusDamage, null);
      }
    }
  }

  ambient(dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0 || this.boss.state === 'fight') return;
    const n = this.destroyed.size;
    this.ambientT = Math.max(14, 34 - 3 * n);
    let roamers = 0;
    for (const e of this.enemies) if (!e.guard) roamers++;
    if (roamers >= 2 + Math.floor(n / 2)) return;
    const p = this.flight.pos;
    const a = this.flight.yaw + Math.PI + (Math.random() - 0.5) * 1.2;
    const x = p.x - Math.sin(a) * 240;
    const z = p.z - Math.cos(a) * 240;
    if (Math.random() < 0.5) this.spawn('eater', x, p.y + 15, z);
    else for (let i = 0; i < 2; i++) this.spawn('dementor', x + i * 12, p.y + 8, z);
  }

  update(dt, time, input) {
    if (this.dead || this.won) return;
    const f = this.flight;
    const p = f.pos;
    const s = this.stats;
    this.elapsed += dt;
    this.warn = '';
    f.forward(this.fwd);
    this.right.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    this.playerVel.copy(this.fwd).multiplyScalar(f.speed);

    // 贴着地面、湖面飞才回得快
    this.skim = clamp(1 - f.alt / 9, 0, 1) * clamp((f.speed - 12) / 20, 0, 1);
    f.gust = clamp(f.gust + s.skimRegen * this.skim * dt, 0, 1);
    for (const k of ['castCd', 'parryCd', 'parryT', 'shieldCd', 'shieldT', 'rollCd', 'hurtT', 'hintT', 'sfxT']) if (this[k] > 0) this[k] -= dt;
    this.chill = Math.max(0, this.chill - dt * 1.5);
    if (f.webbed > 0) f.webbed -= dt;

    this.inputs(input);
    this.castHeld = input.cast;

    for (const h of this.horcruxes.items) {
      if (!h.alive) continue;
      if (!h.awake && h.pos.distanceToSquared(p) < 210 * 210) this.wakeGuards(h);
      h.shielded = h.guards.some((g) => g.alive);
    }
    if (this.boss.state === 'idle' && this.boss.pos.distanceToSquared(p) < 290 * 290) {
      const left = this.fieldLeft;
      this.boss.start(this.remaining);
      this.on.toast('伏地魔', left ? `还有 ${left} 件魂器护着他，他现在很强` : '场地上的魂器都毁了，他只剩最后一片灵魂', 5);
      this.on.sfx('alarm');
    }

    this.pickLock();
    // 没锁定目标时按着不放也不出手，免得白白烧掉魔力
    if (this.castHeld && this.castCd <= 0 && !this.boss.duel.active && this.target) {
      if (this.targetShielded) this.damage(this.target, 0, null);
      else this.cast();
    }

    this.bolts.update(dt);
    this.collide();
    for (const e of this.enemies) if (e.alive) updateEnemy(e, dt, time, this);
    this.boss.update(dt, time, this);
    // 绿光出手之后才是翻滚的时机：念咒的时候滚，落地时咒语刚好到
    for (const b of this.bolts.live) {
      if (b.kind === 'avada' && !b.dead && (p.x - b.pos.x) * b.vel.x + (p.y - b.pos.y) * b.vel.y + (p.z - b.pos.z) * b.vel.z > 0) this.warn = '索命咒！翻滚躲开';
    }
    this.patronus(dt);
    this.ambient(dt);

    let n = 0;
    for (const e of this.enemies) {
      // 没在守魂器的敌人被甩得太远就不再追了
      if (e.alive && !e.guard && e.pos.distanceToSquared(p) > CULL * CULL) e.alive = false;
      if (e.alive) this.enemies[n++] = e;
      else removeEnemy(e, this.scene);
    }
    this.enemies.length = n;
    if (this.target && !this.target.alive) this.target = null;

    this.bubble.visible = this.shieldT > 0;
    if (this.bubble.visible) {
      this.bubble.position.copy(p);
      this.bubble.rotation.y = time * 2;
      this.bubble.material.opacity = 0.14 + 0.1 * Math.min(1, this.shieldT);
    }
  }
}
