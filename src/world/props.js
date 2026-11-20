import * as THREE from 'three';
import { Builder } from '../core/kit.js';
import { mulberry32 } from '../core/noise.js';

function pineGeometry() {
  const b = new Builder();
  b.cyl(0, 0, 0, 0.22, 0.34, 2.4, [0.26, 0.16, 0.09], 7);
  b.cone(0, 1.5, 0, 2.1, 3.3, [0.06, 0.19, 0.09], 8);
  b.cone(0, 3.4, 0, 1.6, 2.9, [0.08, 0.23, 0.1], 8);
  b.cone(0, 5.1, 0, 1.05, 2.5, [0.1, 0.27, 0.11], 8);
  return b.geometry();
}

function leafyGeometry() {
  const b = new Builder();
  b.cyl(0, 0, 0, 0.26, 0.4, 3.2, [0.28, 0.18, 0.1], 7);
  b.ball(0, 4.8, 0, 2.3, [0.15, 0.33, 0.08]);
  b.ball(1.4, 4.0, 0.4, 1.6, [0.19, 0.38, 0.1]);
  b.ball(-1.2, 4.2, -0.7, 1.5, [0.12, 0.29, 0.07]);
  b.ball(0.2, 3.8, 1.3, 1.3, [0.2, 0.4, 0.11]);
  return b.geometry();
}

export function createProps(scene, T) {
  const rng = mulberry32(4711);
  const pines = [];
  const leafies = [];
  for (let i = 0; i < 26000 && pines.length + leafies.length < 2200; i++) {
    const x = (rng() * 2 - 1) * 1400;
    const z = (rng() * 2 - 1) * 1400;
    const k = T.maskIndex(x, z);
    if (k < 0) continue;
    const y = T.height(x, z);
    if (y < 5 || y > 170) continue;
    if (T.clear[k] > 0.01 || T.normalY(x, z) < 0.86) continue;
    if (rng() > T.forest[k] * 0.9 + 0.012) continue;
    const item = { x, y: y - 0.2, z, s: 0.8 + rng() * 1.0, r: rng() * Math.PI * 2, t: 0.8 + rng() * 0.4 };
    if (rng() < 0.25 + y / 110) pines.push(item);
    else leafies.push(item);
  }

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const make = (geo, items) => {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.r, 0);
      dummy.scale.set(it.s, it.s * (0.9 + 0.3 * it.t), it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setRGB(it.t, it.t, it.t * 0.9));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  make(pineGeometry(), pines);
  make(leafyGeometry(), leafies);

  const rocks = [];
  for (let i = 0; i < 30000 && rocks.length < 700; i++) {
    const x = (rng() * 2 - 1) * 1500;
    const z = (rng() * 2 - 1) * 1500;
    const k = T.maskIndex(x, z);
    if (k < 0 || T.clear[k] > 0.01) continue;
    const y = T.height(x, z);
    if (y < -0.5) continue;
    const ny = T.normalY(x, z);
    const onBeach = y < 3 && rng() < 0.25;
    const onScree = ny < 0.8 && ny > 0.45;
    if (!onBeach && !onScree) continue;
    rocks.push({ x, y, z, s: 0.5 + rng() * rng() * 3.2 });
  }
  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.38, 0.35), roughness: 1, flatShading: true }),
    rocks.length
  );
  rocks.forEach((it, i) => {
    dummy.position.set(it.x, it.y - it.s * 0.25, it.z);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.set(it.s * (0.8 + rng() * 0.6), it.s * (0.5 + rng() * 0.4), it.s * (0.8 + rng() * 0.6));
    dummy.updateMatrix();
    rockMesh.setMatrixAt(i, dummy.matrix);
    const t = 0.75 + rng() * 0.45;
    rockMesh.setColorAt(i, color.setRGB(t, t, t));
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  rockMesh.frustumCulled = false;
  scene.add(rockMesh);

  return { trees: pines.length + leafies.length, rocks: rocks.length };
}
