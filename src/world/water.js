import * as THREE from 'three';
import { commonUniforms, GLSL_COMMON } from '../core/shared.js';

export function createWater(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: commonUniforms(),
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vWorld;

      vec2 swell(vec2 p, float t, float dist) {
        vec2 g = vec2(0.0);
        float k = 0.045;
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          vec2 d = vec2(cos(fi * 1.87 + 0.6), sin(fi * 1.87 + 0.6));
          float w = sqrt(9.8 * k) * 0.8;
          // 远处看不清的短波逐级淡出，否则会出摩尔纹
          float keep = 1.0 - smoothstep(0.35, 1.3, k * dist * 0.004);
          g += d * 0.085 * keep * cos(dot(d, p) * k + w * t + fi * 2.1);
          k *= 1.62;
        }
        return g;
      }

      void main() {
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        vec2 uv = terrainUV(p);
        float ground = -38.0;
        if (abs(p.x) < WORLD * 0.5 && abs(p.y) < WORLD * 0.5) ground = texture2D(uHeightMap, uv).r;
        float depth = max(-ground, 0.0);

        float detail = 1.0 - smoothstep(60.0, 700.0, dist);
        vec2 g = swell(p, uTime, dist);
        g += (vec2(vnoise(p * 0.9 + uTime * 0.7), vnoise(p * 0.9 - uTime * 0.6 + 31.0)) - 0.5) * 0.22 * detail;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vec3 sky = skyColor(R);
        float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * 5.0 + pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.12;

        vec3 deep = vec3(0.012, 0.085, 0.16);
        vec3 shallow = vec3(0.04, 0.4, 0.42);
        vec3 sandy = vec3(0.5, 0.52, 0.38);
        vec3 body = mix(deep, shallow, exp(-depth * 0.16));
        body = mix(body, sandy, exp(-depth * 1.4) * 0.75);
        body *= uSunLight * (0.35 + 0.65 * max(dot(n, uSunDir), 0.0)) + uSkyLight;

        vec3 col = mix(body, sky, fres) + uSunColor * spec;

        // 岸边一圈圈往里推的浪沫
        float shore = smoothstep(2.4, 0.0, depth);
        float band = sin(depth * 4.2 + uTime * 1.6 + vnoise(p * 0.12) * 6.0);
        float foam = shore * smoothstep(0.35, 0.9, band * 0.5 + 0.5 + shore * 0.45 - vnoise(p * 1.7 + uTime * 0.3) * 0.6);
        // 扫帚贴着海面飞过留下的白沫
        vec3 wk = wakeAt(p);
        foam = max(foam, 0.8 * smoothstep(0.3, 1.0, wk.z * (0.25 + 1.1 * vnoise(p * 1.6 + uTime * 0.8))));
        col = mix(col, vec3(1.0) * (uSunLight * 0.75 + uSkyLight), clamp(foam, 0.0, 1.0) * 0.9);

        col = applyFog(col, dist);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
