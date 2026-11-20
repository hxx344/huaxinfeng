import * as THREE from 'three';
import { commonUniforms, GLSL_COMMON } from '../core/shared.js';
import { mulberry32 } from '../core/noise.js';

export const PALETTE = [
  [0.9, 0.25, 0.45],
  [0.92, 0.9, 0.82],
  [0.95, 0.7, 0.08],
  [0.45, 0.25, 0.8],
  [0.8, 0.06, 0.05],
  [0.2, 0.4, 0.9],
];

// 与花朵着色器里的选色规则一致，粒子用它给飘起的花瓣上色
export function flowerColor(field, rand) {
  const i = ((Math.floor(field * 6 + (rand - 0.5) * 1.4) % 6) + 6) % 6;
  return PALETTE[i];
}

const PLACE = /* glsl */ `
  attribute vec4 aOff;
  uniform float uTile;
  uniform vec2 uCenter;
  vec2 placeBase() {
    return aOff.xy + floor((uCenter - aOff.xy) / uTile + 0.5) * uTile;
  }
  vec2 windLean(vec2 base) {
    vec2 w = vec2(sin(uTime * 1.7 + base.x * 0.11 + base.y * 0.07), cos(uTime * 1.3 + base.y * 0.13)) * 0.1;
    w += vec2(0.8, 0.6) * (0.16 + 0.2 * sin(uTime * 0.6 + dot(base, vec2(0.021, 0.033))));
    return w;
  }
`;

function offsets(count, tile, rng) {
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    off[i * 4] = rng() * tile;
    off[i * 4 + 1] = rng() * tile;
    off[i * 4 + 2] = rng();
    off[i * 4 + 3] = rng();
  }
  return new THREE.InstancedBufferAttribute(off, 4);
}

function grassLayer(count, tile, bladeH, bladeW, rng) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.32, 0.5, 0, 0.32, 0.5, 0, 0, 1, 0]), 3)
  );
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  g.setAttribute('aOff', offsets(count, tile, rng));
  g.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: commonUniforms({
      uTile: { value: tile },
      uCenter: { value: new THREE.Vector2() },
      uBladeH: { value: bladeH },
      uBladeW: { value: bladeW },
    }),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${GLSL_COMMON}
      ${PLACE}
      uniform float uBladeH;
      uniform float uBladeW;
      varying float vY;
      varying float vTint;
      varying float vDist;
      void main() {
        vec2 base = placeBase();
        vec4 t = texture2D(uHeightMap, terrainUV(base));
        float fade = 1.0 - smoothstep(uTile * 0.38, uTile * 0.5, distance(base, uCenter));
        float grow = fade * smoothstep(0.15, 0.6, t.a - aOff.z * 0.3);
        float hgt = uBladeH * (0.55 + 0.9 * aOff.w) * grow;
        float a = aOff.z * 44.0;
        vec2 dir = vec2(cos(a), sin(a));
        vec3 wk = wakeAt(base);
        vec2 lean = windLean(base) + wk.xy * 1.4
          + wk.z * 0.4 * vec2(sin(uTime * 23.0 + aOff.w * 40.0), cos(uTime * 19.0 + aOff.z * 40.0));
        float y = position.y;
        vec3 p = vec3(base.x, t.r, base.y);
        p.xz += dir * position.x * uBladeW * grow;
        p.xz += lean * y * y * hgt;
        p.y += y * hgt / (1.0 + dot(lean, lean) * 0.9);
        vY = y;
        vTint = t.b * 0.7 + aOff.w * 0.3;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying float vY;
      varying float vTint;
      varying float vDist;
      void main() {
        vec3 root = vec3(0.07, 0.17, 0.035);
        vec3 tip = mix(vec3(0.27, 0.5, 0.1), vec3(0.52, 0.55, 0.17), vTint);
        vec3 col = mix(root, tip, vY);
        col *= uSunLight * (0.42 + 0.4 * vY) + uSkyLight * (0.45 + 0.55 * vY);
        col = applyFog(col, vDist);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

function flowerGeometry() {
  const pos = [];
  const part = [];
  const push = (x, y, z, k) => {
    pos.push(x, y, z);
    part.push(k);
  };
  // 茎
  push(-0.014, 0, 0, 0);
  push(0.014, 0, 0, 0);
  push(0, 1, 0, 0);
  // 花心
  const c = 0.26;
  push(-c, 0.04, -c, 1);
  push(c, 0.04, c, 1);
  push(c, 0.04, -c, 1);
  push(-c, 0.04, -c, 1);
  push(-c, 0.04, c, 1);
  push(c, 0.04, c, 1);
  // 六片花瓣，各自带编号，方便一片一片吹掉
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const at = (r, w) => [ca * r - sa * w, sa * r + ca * w];
    const inner = at(0.16, 0);
    const left = at(0.62, 0.27);
    const right = at(0.62, -0.27);
    const tip = at(1.0, 0);
    push(inner[0], 0, inner[1], 2 + k);
    push(left[0], 0.05, left[1], 2 + k);
    push(right[0], 0.05, right[1], 2 + k);
    push(left[0], 0.05, left[1], 2 + k);
    push(tip[0], 0.02, tip[1], 2 + k);
    push(right[0], 0.05, right[1], 2 + k);
  }
  return { pos: new Float32Array(pos), part: new Float32Array(part) };
}

function flowerLayer(count, tile, scale, rng) {
  const base = flowerGeometry();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base.pos, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(base.part, 1));
  g.setAttribute('aOff', offsets(count, tile, rng));
  g.instanceCount = count;
  const pal = PALETTE.map((c) => `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`);
  const material = new THREE.ShaderMaterial({
    uniforms: commonUniforms({
      uTile: { value: tile },
      uCenter: { value: new THREE.Vector2() },
      uScale: { value: scale },
    }),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${GLSL_COMMON}
      ${PLACE}
      attribute float aPart;
      uniform float uScale;
      varying vec3 vCol;
      varying float vDist;
      vec3 palette(float i) {
        if (i < 0.5) return ${pal[0]};
        if (i < 1.5) return ${pal[1]};
        if (i < 2.5) return ${pal[2]};
        if (i < 3.5) return ${pal[3]};
        if (i < 4.5) return ${pal[4]};
        return ${pal[5]};
      }
      void main() {
        vec2 base = placeBase();
        vec4 t = texture2D(uHeightMap, terrainUV(base));
        float dist = distance(base, uCenter);
        float fade = 1.0 - smoothstep(uTile * 0.4, uTile * 0.5, dist);
        // 按“名次”稀疏：离得越远，只留下名次靠前的花
        float present = fade * step(aOff.z, t.g * mix(1.0, 0.4, dist / (uTile * 0.5)));
        float sc = uScale * (0.75 + 0.6 * aOff.w) * present;
        float stemH = (0.42 + 0.4 * fract(aOff.w * 7.3)) * sc * 2.4;
        vec3 wk = wakeAt(base);
        vec2 lean = windLean(base) + wk.xy * 1.2
          + wk.z * 0.3 * vec2(sin(uTime * 21.0 + aOff.w * 50.0), cos(uTime * 17.0 + aOff.z * 50.0));
        vec3 root = vec3(base.x, t.r, base.y);
        vec3 head = root + vec3(lean.x * stemH * 0.6, stemH / (1.0 + 0.5 * dot(lean, lean)), lean.y * stemH * 0.6);
        vec3 p;
        if (aPart < 0.5) {
          p = mix(root, head, position.y);
          p.x += position.x * sc * 2.0;
          vCol = vec3(0.16, 0.36, 0.08);
        } else {
          float strip = texture2D(uStripMap, base / WORLD + 0.5).r;
          float lost = strip * 6.5 * (0.75 + 0.5 * fract(aOff.w * 13.7));
          float order = mod(aPart - 2.0 + floor(aOff.z * 61.0), 6.0);
          float keep = aPart < 1.5 ? 1.0 : step(lost, order + 0.001);
          vec3 toCam = normalize(cameraPosition - head);
          vec3 n = normalize(vec3(toCam.x * 0.7, 1.0, toCam.z * 0.7) + vec3(lean.x, 0.0, lean.y) * 0.5);
          vec3 tx = normalize(cross(vec3(0.0, 0.0, 1.0), n));
          vec3 tz = cross(n, tx);
          float r = aOff.w * 6.2832;
          vec2 q = vec2(position.x * cos(r) - position.z * sin(r), position.x * sin(r) + position.z * cos(r));
          p = head + (tx * q.x + tz * q.y) * sc * keep + n * position.y * sc;
          float idx = mod(floor(t.b * 6.0 + (aOff.w - 0.5) * 1.4) + 6.0, 6.0);
          vec3 petal = palette(idx) * (0.82 + 0.3 * fract(aOff.z * 17.0));
          vCol = aPart < 1.5 ? vec3(0.95, 0.62, 0.05) : petal;
        }
        vCol *= uSunLight * 0.82 + uSkyLight;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vCol;
      varying float vDist;
      void main() {
        gl_FragColor = vec4(applyFog(vCol, vDist), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function createMeadow(scene, quality) {
  const rng = mulberry32(991);
  const n = (v) => Math.max(1000, Math.round(v * quality));
  const layers = [
    grassLayer(n(110000), 72, 0.55, 0.11, rng),
    grassLayer(n(170000), 250, 0.8, 0.21, rng),
    flowerLayer(n(46000), 90, 0.13, rng),
    flowerLayer(n(90000), 320, 0.215, rng),
  ];
  for (const m of layers) scene.add(m);
  const fwd = new THREE.Vector3();
  return {
    update(camera) {
      camera.getWorldDirection(fwd);
      const l = Math.hypot(fwd.x, fwd.z) || 1;
      for (const m of layers) {
        const tile = m.material.uniforms.uTile.value;
        m.material.uniforms.uCenter.value.set(
          camera.position.x + (fwd.x / l) * tile * 0.3,
          camera.position.z + (fwd.z / l) * tile * 0.3
        );
      }
    },
  };
}
