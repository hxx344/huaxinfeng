import * as THREE from 'three';
import { Builder } from '../core/kit.js';
import { FJORD, CELL } from './terrain.js';
import { GRID, HALF } from '../core/shared.js';

export const HORCRUX_HP = 6;

function model(id) {
  const B = new Builder();
  const gold = [1.0, 0.75, 0.2];
  if (id === 'diary') {
    B.box(0, -0.6, 0, 0.95, 1.25, 0.26, [0.16, 0.13, 0.12]);
    B.box(0.42, -0.55, 0, 0.1, 1.15, 0.28, [0.75, 0.72, 0.6]);
  } else if (id === 'ring') {
    B.put(new THREE.TorusGeometry(0.5, 0.11, 8, 20), 0, 0, 0, gold);
    B.ball(0, 0.62, 0, 0.24, [0.12, 0.12, 0.14], 0);
  } else if (id === 'locket') {
    B.put(new THREE.OctahedronGeometry(0.6, 0), 0, -0.2, 0, [0.75, 0.62, 0.2]);
    B.box(-0.12, -0.4, 0.2, 0.24, 0.4, 0.2, [0.1, 0.6, 0.25]);
    B.put(new THREE.TorusGeometry(0.42, 0.04, 6, 18), 0, 0.6, 0, gold);
  } else if (id === 'cup') {
    B.cyl(0, 0, 0, 0.5, 0.26, 0.7, gold, 12);
    B.cyl(0, -0.45, 0, 0.08, 0.08, 0.45, gold, 8);
    B.cyl(0, -0.55, 0, 0.22, 0.34, 0.12, gold, 12);
    for (const s of [-1, 1]) B.put(new THREE.TorusGeometry(0.24, 0.05, 6, 14), s * 0.58, 0.35, 0, gold);
  } else if (id === 'diadem') {
    B.put(new THREE.TorusGeometry(0.6, 0.07, 8, 22), 0, 0, 0, [0.82, 0.85, 0.9], 0, Math.PI / 2);
    B.cone(0, 0.02, -0.58, 0.2, 0.55, [0.82, 0.85, 0.9], 4);
    B.ball(0, 0.3, -0.6, 0.17, [0.2, 0.4, 1.0], 0);
  } else {
    for (let k = 0; k < 3; k++) {
      B.put(new THREE.TorusGeometry(0.75 - k * 0.2, 0.2 - k * 0.02, 8, 18), 0, -0.5 + k * 0.34, 0, [0.2, 0.42, 0.16], 0, Math.PI / 2);
    }
    B.ball(0.15, 0.75, -0.15, 0.26, [0.26, 0.5, 0.2], 0);
    B.ball(0.2, 0.8, -0.38, 0.06, [1.0, 0.8, 0.1], 0);
  }
  return B.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
}

// 六件散落在场地各处的魂器。位置由地形和场地布置算出来；第七件是哈利的伤疤，不在这里
export function createHorcruxes(scene, T, sites, glowMap) {
  const S = GRID + 1;
  let peak = 0;
  for (let k = 1; k < T.h.length; k++) if (T.h[k] > T.h[peak]) peak = k;
  const peakX = -HALF + (peak % S) * CELL;
  const peakZ = -HALF + Math.floor(peak / S) * CELL;
  const fx = FJORD.bx + (FJORD.ax - FJORD.bx) * 0.06;
  const fz = FJORD.bz + (FJORD.az - FJORD.bz) * 0.06;

  // 禁林深处：林子最密、又离别的地点都远的一处
  const others = [...sites.taken, { x: peakX, z: peakZ }, { x: fx, z: fz }];
  let deep = { x: 0, z: 0, score: -1 };
  for (let x = -1000; x <= 1000; x += 50) {
    for (let z = -1000; z <= 1000; z += 50) {
      const y = T.height(x, z);
      if (y < 8 || y > 90 || T.normalY(x, z) < 0.9) continue;
      if (others.some((o) => Math.hypot(o.x - x, o.z - z) < 330)) continue;
      let score = 0;
      for (const [ox, oz] of [[0, 0], [45, 0], [-45, 0], [0, 45], [0, -45]]) {
        const k = T.maskIndex(x + ox, z + oz);
        if (k >= 0) score += T.forest[k];
      }
      if (score > deep.score) deep = { x, z, score };
    }
  }

  const ground = (x, z) => Math.max(T.height(x, z), 0);
  const { castle, circle, shack } = sites;
  const defs = [
    { id: 'diary', name: '里德尔的日记', place: '环石阵', hint: '草坡上九块立石围成的圈', x: circle.x, z: circle.z, y: ground(circle.x, circle.z) + 6 },
    { id: 'ring', name: '冈特的戒指', place: '尖叫棚屋', hint: '霍格莫德村外那座歪斜木屋的上方', x: shack.x, z: shack.z, y: shack.y + 27 },
    { id: 'locket', name: '斯莱特林的挂坠盒', place: '峡湾尽头', hint: '黑湖向东伸进山里，在水的尽头', x: fx, z: fz, y: 7 },
    { id: 'cup', name: '赫奇帕奇的金杯', place: '云顶', hint: '场地上最高的山顶，一头匈牙利树蜂守着它', x: peakX, z: peakZ, y: ground(peakX, peakZ) + 10 },
    { id: 'diadem', name: '拉文克劳的冠冕', place: '天文塔', hint: '城堡最高的塔尖上方', x: castle.astro.x, z: castle.astro.z, y: castle.astro.top + 9 },
    { id: 'nagini', name: '纳吉尼', place: '禁林深处', hint: '林子最密的地方，八眼巨蛛的地盘', x: deep.x, z: deep.z, y: ground(deep.x, deep.z) + 12 },
  ];

  const shieldGeo = new THREE.IcosahedronGeometry(4.2, 2);
  const beamGeo = new THREE.CylinderGeometry(1.1, 1.1, 360, 12, 1, true);
  const items = defs.map((d) => {
    const group = new THREE.Group();
    group.position.set(d.x, d.y, d.z);
    const mesh = model(d.id);
    mesh.scale.setScalar(2.2);
    group.add(mesh);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowMap, color: new THREE.Color(1.0, 0.8, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    glow.scale.setScalar(13);
    group.add(glow);
    const shield = new THREE.Mesh(
      shieldGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 0.35), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true })
    );
    group.add(shield);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.2), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    beam.position.y = 180;
    beam.frustumCulled = false;
    group.add(beam);
    scene.add(group);
    return { ...d, pos: group.position, baseY: d.y, group, mesh, shield, radius: 3.6, hp: HORCRUX_HP, alive: true, awake: false, shielded: false, guards: [], isHorcrux: true };
  });

  return {
    items,
    reset() {
      for (const it of items) {
        it.hp = HORCRUX_HP;
        it.alive = true;
        it.awake = false;
        it.shielded = false;
        it.guards = [];
        it.group.visible = true;
      }
    },
    destroy(it) {
      it.alive = false;
      it.group.visible = false;
    },
    nearest(p) {
      let best = null;
      let bd = Infinity;
      for (const it of items) {
        if (!it.alive) continue;
        const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
        if (d < bd) {
          bd = d;
          best = it;
        }
      }
      return best;
    },
    update(dt, time) {
      for (const it of items) {
        if (!it.alive) continue;
        it.mesh.rotation.y += dt * 1.4;
        it.pos.y = it.baseY + Math.sin(time * 1.7 + it.x) * 0.5;
        it.shield.visible = it.shielded;
        it.shield.rotation.y -= dt * 0.6;
        it.shield.material.opacity = 0.16 + 0.08 * Math.sin(time * 4);
      }
    },
  };
}
