import * as THREE from 'three';
import { clamp, lerp, wrapAngle } from '../core/noise.js';

const MODES = [
  { name: '追随', near: 6.5, far: 10.5, height: 2.1 },
  { name: '贴地', near: 4.5, far: 6.5, height: 0.5 },
  { name: '远景', near: 16, far: 23, height: 6 },
];
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _f = new THREE.Vector3();

// 追随镜头：慢下来就贴近，冲刺时拉远并放宽视野
export class ChaseCamera {
  constructor(camera, T) {
    this.camera = camera;
    this.T = T;
    this.mode = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.dist = 8;
    this.orbit = 0;
    this.wasLanded = false;
    this.ease = 0;
  }

  get modeName() {
    return MODES[this.mode].name;
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
  }

  snap(flight) {
    this.yaw = flight.yaw;
    this.pitch = flight.pitch * 0.7;
    this.place(flight, 1);
  }

  place(flight, k) {
    const m = MODES[this.mode];
    const cp = Math.cos(this.pitch);
    _want
      .set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp)
      .multiplyScalar(this.dist)
      .add(flight.pos);
    _want.y += m.height;
    this.camera.position.lerp(_want, k);
  }

  update(dt, flight, landed) {
    const cam = this.camera;
    const m = MODES[this.mode];
    const sf = clamp((flight.speed - 10) / 54, 0, 1);
    let fov;
    if (landed) {
      // 平台多半贴着墙：镜头只在魔女面朝的外侧来回摆，不绕到建筑里面去
      if (!this.wasLanded) this.orbit = 0;
      this.orbit += dt * 0.22;
      const a = flight.yaw + Math.PI + Math.sin(this.orbit) * 0.75;
      _want.set(Math.sin(a) * 9.5, 3.2, Math.cos(a) * 9.5).add(flight.pos);
      cam.position.lerp(_want, 1 - Math.exp(-dt * 2.2));
      _look.copy(flight.pos);
      _look.y += 0.7;
      fov = 55;
      this.yaw = a;
      this.pitch = 0;
    } else {
      this.yaw += wrapAngle(flight.yaw - this.yaw) * (1 - Math.exp(-dt * 5.5));
      this.pitch += (flight.pitch * 0.7 - this.pitch) * (1 - Math.exp(-dt * 4));
      this.dist += (lerp(m.near, m.far, sf) - this.dist) * (1 - Math.exp(-dt * 2.5));
      if (this.wasLanded) this.ease = 1.6;
      this.ease = Math.max(0, this.ease - dt);
      this.place(flight, 1 - Math.exp(-dt * (this.ease > 0 ? 3 : 14)));
      flight.forward(_f);
      _look.copy(flight.pos).addScaledVector(_f, 5);
      _look.y += 0.9;
      fov = 60 + 22 * sf + (flight.boosting ? 4 : 0);
    }
    this.wasLanded = landed;
    const floor = this.T.ground(cam.position.x, cam.position.z) + 0.6;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(_look);
    if (!landed) cam.rotateZ(flight.roll * 0.3);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3));
    cam.updateProjectionMatrix();
  }
}
