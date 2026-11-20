import * as THREE from 'three';
import { commonUniforms, GLSL_COMMON, LIGHT, U } from '../core/shared.js';

export function createSky(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: commonUniforms(),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * smoothstep(0.9993, 0.9997, s) * 14.0;
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.14) * 1.1 + vec2(uTime * 0.006, uTime * 0.003);
          float n = fbm(uv);
          float dens = smoothstep(0.52, 0.8, n) * smoothstep(0.0, 0.1, d.y);
          float lit = fbm(uv + uSunDir.xz * 0.18);
          vec3 cloud = mix(vec3(1.0, 0.97, 0.92) * 1.15, vec3(0.5, 0.56, 0.68), smoothstep(0.35, 0.8, lit));
          cloud += uSunColor * pow(s, 10.0) * 0.5;
          col = mix(col, cloud, dens * 0.92);
        } else {
          col = uFogColor;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(LIGHT.skyColor, LIGHT.groundColor, LIGHT.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110;
  sc.right = 110;
  sc.top = 110;
  sc.bottom = -110;
  sc.near = 10;
  sc.far = 700;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.FogExp2(U.uFogColor.value, U.uFogDensity.value);

  return {
    update(camera, focus) {
      dome.position.copy(camera.position);
      // 阴影相机跟着焦点走，按阴影贴图的像素取整以免闪烁
      const step = 220 / 2048;
      const fx = Math.round(focus.x / step) * step;
      const fz = Math.round(focus.z / step) * step;
      sun.target.position.set(fx, focus.y, fz);
      sun.position.set(fx, focus.y, fz).addScaledVector(LIGHT.sunDir, 350);
    },
  };
}
