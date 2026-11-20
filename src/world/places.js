import * as THREE from 'three';
import { Builder } from '../core/kit.js';
import { FJORD, ISLET_E, ISLET_W, CELL } from './terrain.js';
import { GRID, HALF } from '../core/shared.js';

const REACH = 7;

// 八处藏起来的地方，各有一件宝物。位置由地形本身算出来，不是手填的坐标
export function createPlaces(scene, T, sites, glowMap, found) {
  const S = GRID + 1;
  let peak = 0;
  for (let k = 1; k < T.h.length; k++) if (T.h[k] > T.h[peak]) peak = k;
  const peakX = -HALF + (peak % S) * CELL;
  const peakZ = -HALF + Math.floor(peak / S) * CELL;

  let cape = { x: 0, z: 0 };
  for (let x = -500; x <= 500; x += 25) {
    let z = -1500;
    while (z < 0 && T.height(x, z) < 3) z += 5;
    if (z < cape.z) cape = { x, z: z + 6 };
  }

  let bx = sites.harbour.x - 420;
  let bz = sites.harbour.z - 60;
  while (bz < 1500 && T.height(bx, bz) > 2.2) bz += 4;

  const fx = FJORD.bx + (FJORD.ax - FJORD.bx) * 0.04;
  const fz = FJORD.bz + (FJORD.az - FJORD.bz) * 0.04;

  const defs = [
    { id: 'peak', name: '云顶石堆', treasure: '云母石', x: peakX, z: peakZ, lift: 3,
      hint: '全岛最高的地方，离云最近。', note: '山顶的石堆里夹着一片会反光的云母。' },
    { id: 'circle', name: '环石阵', treasure: '月光石', x: sites.circle.x, z: sites.circle.z, lift: 2.4,
      hint: '草甸上有九块立石围成一圈。', note: '祭石上放着一颗白天也泛着凉光的石头。' },
    { id: 'fjord', name: '峡湾尽头', treasure: '古船铃', x: fx, z: fz, lift: 2.6,
      hint: '东边的海伸进山里，一直飞到水的尽头。', note: '浮标上挂着一只生了绿锈的船铃。' },
    { id: 'cape', name: '北角', treasure: '风向鸡', x: cape.x, z: cape.z, lift: 2.6,
      hint: '岛的最北端，再往前只有海。', note: '崖边插着一只被风磨亮的铁皮风向鸡。' },
    { id: 'isletE', name: '东礁', treasure: '漂流瓶', x: ISLET_E.x, z: ISLET_E.z, lift: 2.4,
      hint: '东面海上孤零零的一座小岛。', note: '瓶里的信只写了一句：风会带你回家。' },
    { id: 'isletW', name: '西礁', treasure: '海玻璃', x: ISLET_W.x, z: ISLET_W.z, lift: 2.4,
      hint: '西北海上的另一座小岛。', note: '被浪磨圆的一把绿色碎玻璃。' },
    { id: 'tree', name: '孤树', treasure: '木雕猫头鹰', x: sites.loneTree.x + 3.2, z: sites.loneTree.z, lift: 2.2,
      hint: '山丘上有一棵比别的树都大的老树。', note: '树洞里蹲着一只巴掌大的木头猫头鹰。' },
    { id: 'beach', name: '搁浅的小船', treasure: '珍珠贝', x: bx, z: bz - 5, lift: 2.2,
      hint: '云雀港往西的沙滩上，有条再也下不了水的船。', note: '船舱的积沙里埋着一枚珍珠贝。' },
  ];

  const B = new Builder();
  const stone = [0.42, 0.4, 0.38];
  const items = defs.map((d) => {
    const y = Math.max(T.height(d.x, d.z), 0);
    if (d.id === 'peak') {
      for (let k = 0; k < 5; k++) B.ball(d.x + (k % 2) * 0.5 - 0.25, y + k * 0.42, d.z, 1.1 - k * 0.2, stone, 0);
    } else if (d.id === 'fjord') {
      B.cyl(d.x, -0.6, d.z, 0.9, 1.0, 1.5, [0.7, 0.2, 0.12], 10);
      B.cyl(d.x, 0.9, d.z, 0.06, 0.06, 1.4, [0.2, 0.2, 0.2], 6);
    } else if (d.id === 'beach') {
      B.box(d.x, y - 0.2, d.z, 2.2, 1.0, 6.0, [0.34, 0.24, 0.15], 0.5);
      B.cyl(d.x, y, d.z, 0.07, 0.09, 3.6, [0.3, 0.2, 0.12], 6);
    } else if (d.id === 'cape') {
      B.cyl(d.x, y, d.z, 0.06, 0.08, 2.0, [0.25, 0.25, 0.27], 6);
    } else if (d.id === 'isletE' || d.id === 'isletW') {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        B.box(d.x + Math.cos(a) * 3, y - 0.4, d.z + Math.sin(a) * 3, 0.8, 1.6 + (k % 3) * 0.5, 0.6, stone, a);
      }
    }
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(1.0, 0.75, 0.2),
        emissive: new THREE.Color(1.0, 0.55, 0.1),
        emissiveIntensity: 1.6,
        roughness: 0.3,
        flatShading: true,
      })
    );
    gem.position.set(d.x, y + d.lift, d.z);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color: new THREE.Color(1.0, 0.8, 0.35),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    );
    glow.scale.setScalar(7);
    gem.add(glow);
    scene.add(gem);
    const isFound = found.includes(d.id);
    gem.visible = !isFound;
    return { ...d, pos: gem.position, gem, found: isFound };
  });

  const dress = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  dress.castShadow = true;
  dress.frustumCulled = false;
  scene.add(dress);

  return {
    items,
    // 返回这一帧刚找到的宝物（最多一件）
    update(dt, time, p) {
      let hit = null;
      for (const it of items) {
        if (it.found) continue;
        it.gem.rotation.y += dt * 1.4;
        it.gem.position.y += Math.sin(time * 2 + it.x) * dt * 0.25;
        if (it.pos.distanceTo(p) < REACH) {
          it.found = true;
          it.gem.visible = false;
          hit = it;
        }
      }
      return hit;
    },
  };
}
