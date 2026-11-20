import * as THREE from 'three';

export const WORLD = 3200;
export const HALF = WORLD / 2;
export const GRID = 512;
export const TRAIL_N = 24;

const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.62).normalize();
// 月夜：主光是偏蓝的月光，天光压暗
const SUN_COLOR = new THREE.Color(0.62, 0.74, 1.0);
const SKY_COLOR = new THREE.Color(0.3, 0.42, 0.8);
const GROUND_COLOR = new THREE.Color(0.12, 0.14, 0.2);

export const LIGHT = {
  sunDir: SUN_DIR,
  sunColor: SUN_COLOR,
  sunIntensity: 1.9,
  skyColor: SKY_COLOR,
  groundColor: GROUND_COLOR,
  hemiIntensity: 1.0,
};

// 所有自写着色器共用的 uniform；内置材质的灯光用同一组数值，保证两者亮度一致
export const U = {
  uTime: { value: 0 },
  uHeightMap: { value: null },
  uStripMap: { value: null },
  uNoiseMap: { value: null },
  uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uSunDir: { value: SUN_DIR },
  uSunColor: { value: SUN_COLOR },
  uSunLight: { value: SUN_COLOR.clone().multiplyScalar(LIGHT.sunIntensity / Math.PI) },
  uSkyLight: { value: SKY_COLOR.clone().multiplyScalar(LIGHT.hemiIntensity / Math.PI) },
  uFogColor: { value: new THREE.Color(0.09, 0.13, 0.24) },
  uFogDensity: { value: 0.00026 },
  uZenith: { value: new THREE.Color(0.012, 0.03, 0.1) },
};

export function commonUniforms(extra = {}) {
  return { ...U, ...extra };
}

export const GLSL_COMMON = /* glsl */ `
const float WORLD = ${WORLD.toFixed(1)};
const float GRID = ${GRID.toFixed(1)};
uniform float uTime;
uniform sampler2D uHeightMap;
uniform sampler2D uStripMap;
uniform sampler2D uNoiseMap;
uniform vec4 uTrail[${TRAIL_N}];
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunLight;
uniform vec3 uSkyLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uZenith;

vec2 terrainUV(vec2 xz) {
  return (xz / WORLD + 0.5) * (GRID / (GRID + 1.0)) + 0.5 / (GRID + 1.0);
}
vec3 applyFog(vec3 c, float dist) {
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  return mix(c, uFogColor, f);
}
vec3 skyColor(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uFogColor, uZenith, pow(y, 0.6));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(s, 6.0) * 0.22 + pow(s, 90.0) * 0.6);
  return c;
}
// 云影：随风慢慢移过地面的大块明暗
float cloudShade(vec2 p) {
  float n = texture2D(uNoiseMap, p * 0.00115 + uTime * vec2(0.0035, 0.002)).r;
  return mix(0.62, 1.0, smoothstep(0.36, 0.6, n));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}
// 尾流对地面的影响：xy 为把草推开的方向，z 为强度
vec3 wakeAt(vec2 p) {
  vec2 push = vec2(0.0);
  float s = 0.0;
  for (int i = 0; i < ${TRAIL_N}; i++) {
    vec4 t = uTrail[i];
    vec2 d = p - t.xy;
    float r2 = dot(d, d);
    float f = t.z * exp(-r2 / (t.w * t.w));
    push += f * d / (sqrt(r2) + 0.6);
    s += f;
  }
  float l = length(push);
  if (l > 1.6) push *= 1.6 / l;
  return vec3(push, min(s, 1.5));
}
`;

// 给 three.js 的内置材质接上云影，让它们和自写着色器一起明暗；
// pars 和 body 是额外插进片元着色器的全局声明和改 diffuseColor 的语句
export function patchLit(material, pars = '', body = '') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wPos = instanceMatrix * wPos;
        #endif
        vWPos = (modelMatrix * wPos).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nvarying vec3 vWPos;\n${pars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${body}\ndiffuseColor.rgb *= cloudShade(vWPos.xz);`);
  };
  material.customProgramCacheKey = () => `lit:${pars}${body}`;
  return material;
}
