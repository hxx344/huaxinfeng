import * as THREE from 'three';
import { clamp, wrapAngle } from '../core/noise.js';

const LIT_RANGE = 85;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

// 降落、下扫帚、送包裹。state: fly | approach | landed | takeoff
export class Errands {
  constructor({ scene, places, flight, glowMap, deliveries, onDeliver, onLand, onTakeoff }) {
    this.places = places;
    this.flight = flight;
    this.state = 'fly';
    this.near = null;
    this.at = null;
    this.t = 0;
    this.dur = 1;
    this.deliveries = deliveries;
    this.onDeliver = onDeliver;
    this.onLand = onLand;
    this.onTakeoff = onTakeoff;
    this.from = new THREE.Vector3();
    this.fromYaw = 0;
    this.fromSpeed = 0;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 420, 16, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.5) * (0.4 + 0.12 * sin(uTime * 3.0 - vUv.y * 40.0)); gl_FragColor = vec4(vec3(1.0, 0.72, 0.22) * a, 1.0); }`,
      })
    );
    beam.frustumCulled = false;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        color: new THREE.Color(1, 0.75, 0.3),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    );
    glow.scale.setScalar(26);
    this.beam = beam;
    this.glow = glow;
    scene.add(beam, glow);

    this.target = null;
    this.pick(null);
  }

  // 远近交替：这一趟跨城，下一趟也许要飞到岛的另一头
  pick(from) {
    const pool = this.places.filter((p) => p !== from && p !== this.target);
    if (from) {
      pool.sort((a, b) => a.spot.distanceTo(from.spot) - b.spot.distanceTo(from.spot));
      const half = Math.ceil(pool.length / 2);
      const part = this.deliveries % 2 === 0 ? pool.slice(0, half) : pool.slice(half);
      this.target = part[Math.floor(Math.random() * part.length)];
    } else {
      this.target = pool[Math.floor(Math.random() * pool.length)];
    }
    this.beam.position.copy(this.target.spot);
    this.beam.position.y += 212;
    this.glow.position.copy(this.target.spot);
    this.glow.position.y += 4;
  }

  update(dt, time, input) {
    const f = this.flight;
    this.beam.material.uniforms.uTime.value = time;

    let near = null;
    let best = LIT_RANGE;
    for (const p of this.places) {
      const d = p.spot.distanceTo(f.pos);
      const lit = clamp(1 - d / LIT_RANGE, 0, 1);
      p.ring.material.opacity = 0.18 + lit * (0.55 + 0.25 * Math.sin(time * 5));
      p.ring.scale.setScalar(1 + lit * 0.25 * (1 + Math.sin(time * 3)));
      if (d < best) {
        best = d;
        near = p;
      }
    }
    this.near = near;

    if (this.state === 'fly') {
      if (near && input.doubleSpace) {
        this.state = 'approach';
        this.at = near;
        this.t = 0;
        this.dur = clamp(best / 24, 1.5, 3.6);
        this.from.copy(f.pos);
        this.fromYaw = f.yaw;
        this.fromSpeed = f.speed;
        f.flip = 0;
      }
    } else if (this.state === 'approach') {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * (3 - 2 * this.t);
      const end = _b.copy(this.at.spot);
      end.y += 0.25;
      const mid = _c.copy(this.from).lerp(end, 0.6);
      mid.y = Math.max(this.from.y, end.y) + 5;
      // 二次贝塞尔：先飘到平台上方，再落下去
      _a.copy(this.from).lerp(mid, e);
      mid.lerp(end, e);
      const prevY = f.pos.y;
      f.pos.copy(_a.lerp(mid, e));
      f.yaw = this.fromYaw + wrapAngle(this.at.yaw - this.fromYaw) * e;
      f.pitch = clamp((f.pos.y - prevY) / Math.max(dt, 1e-3) / 30, -0.4, 0.4) * (1 - e);
      f.roll *= Math.exp(-dt * 4);
      f.yawRate = 0;
      f.speed = this.fromSpeed * (1 - e);
      f.alt = 5;
      if (this.t >= 1) {
        this.state = 'landed';
        f.pitch = 0;
        f.roll = 0;
        f.speed = 0;
        const delivered = this.at === this.target;
        if (delivered) {
          this.deliveries++;
          this.pick(this.at);
          this.onDeliver(this.at, this.target);
        }
        this.onLand(this.at, delivered);
      }
    } else if (this.state === 'landed') {
      if (input.take('Space')) {
        this.state = 'takeoff';
        this.t = 0;
        this.onTakeoff(this.at);
      }
    } else if (this.state === 'takeoff') {
      this.t += dt / 0.75;
      f.speed = 6 + 16 * Math.min(1, this.t);
      f.pitch = 0.3 * Math.min(1, this.t);
      f.pos.x += -Math.sin(f.yaw) * f.speed * dt;
      f.pos.z += -Math.cos(f.yaw) * f.speed * dt;
      f.pos.y += 4.5 * dt;
      if (this.t >= 1) this.state = 'fly';
    }
  }
}
