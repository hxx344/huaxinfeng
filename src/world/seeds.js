import * as THREE from 'three';
import { commonUniforms, GLSL_COMMON } from '../core/shared.js';
import { FJORD } from './terrain.js';

const RESPAWN = 45;
const REACH = 4.6;

// 风种：沿着岛上最好飞的路线撒开的发光小球，接住一颗就补一截阵风
export function createSeeds(scene, T, rng) {
  const pts = [];
  const add = (x, y, z) => pts.push({ x, y, z, wait: 0 });

  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    let r = 300;
    while (r < 1550 && T.height(Math.cos(a) * r, Math.sin(a) * r) > -2) r += 12;
    r += 35;
    if (r < 1560) add(Math.cos(a) * r, 2.6, Math.sin(a) * r);
  }
  for (let line = 0, tries = 0; line < 8 && tries < 4000; tries++) {
    const x = (rng() * 2 - 1) * 1000;
    const z = (rng() * 2 - 1) * 1000;
    const k = T.maskIndex(x, z);
    if (k < 0 || T.flower[k] < 0.4) continue;
    const a = rng() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const px = x + Math.cos(a) * i * 20;
      const pz = z + Math.sin(a) * i * 20;
      const h = T.height(px, pz);
      if (h > 1 && T.normalY(px, pz) > 0.8) add(px, h + 2.4, pz);
    }
    line++;
  }
  for (let i = 0; i < 10; i++) {
    const t = 0.08 + (i / 9) * 0.85;
    add(FJORD.ax + (FJORD.bx - FJORD.ax) * t, 3, FJORD.az + (FJORD.bz - FJORD.az) * t);
  }

  const n = pts.length;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const state = new Float32Array(n).fill(1);
  pts.forEach((p, i) => {
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    phase[i] = rng() * 6.28;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const stateAttr = new THREE.BufferAttribute(state, 1);
  stateAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aState', stateAttr);
  const material = new THREE.ShaderMaterial({
    uniforms: commonUniforms({ uScale: { value: 800 } }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${GLSL_COMMON}
      attribute float aPhase;
      attribute float aState;
      uniform float uScale;
      varying float vState;
      varying float vFog;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 1.6 + aPhase) * 0.35;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vState = aState;
        vFog = exp(-uFogDensity * uFogDensity * d * d);
        gl_PointSize = clamp(3.4 * uScale / d, 3.0, 140.0) * aState * (0.85 + 0.15 * sin(uTime * 5.0 + aPhase));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vState;
      varying float vFog;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.28, 0.0, d);
        float halo = pow(max(1.0 - d, 0.0), 2.2);
        vec3 col = vec3(1.0, 0.82, 0.35) * halo * 0.9 + vec3(1.0, 1.0, 0.85) * core * 1.6;
        gl_FragColor = vec4(col * vState * vFog, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    count: n,
    points: pts,
    setScale(v) {
      material.uniforms.uScale.value = v;
    },
    // 返回这一帧接住的风种位置
    update(dt, p) {
      const got = [];
      let dirty = false;
      for (let i = 0; i < n; i++) {
        const s = pts[i];
        if (s.wait > 0) {
          s.wait -= dt;
          if (s.wait <= 0) {
            state[i] = 1;
            dirty = true;
          }
          continue;
        }
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dz = s.z - p.z;
        if (dx * dx + dy * dy + dz * dz < REACH * REACH) {
          s.wait = RESPAWN;
          state[i] = 0;
          dirty = true;
          got.push(s);
        }
      }
      if (dirty) stateAttr.needsUpdate = true;
      return got;
    },
  };
}
