import * as THREE from 'three';

const mat = (r, g, b, extra = {}) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.85, ...extra });

function limb(parent, a, b, radius, material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, va.distanceTo(vb), 6), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  parent.add(m);
  return m;
}

// 骑着扫帚的小魔女，全部由基本几何体拼成。原点在座位处，-z 为前
export class Rider {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);

    const wood = mat(0.36, 0.22, 0.1);
    const straw = mat(0.78, 0.6, 0.25);
    const dress = mat(0.2, 0.09, 0.3);
    const skin = mat(0.95, 0.72, 0.58);
    const hair = mat(0.6, 0.2, 0.05);
    const gold = mat(0.95, 0.68, 0.1);
    const leather = mat(0.38, 0.23, 0.12);

    const add = (parent, geo, material, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parent.add(m);
      return m;
    };

    this.broom = new THREE.Group();
    this.group.add(this.broom);
    add(this.broom, new THREE.CylinderGeometry(0.03, 0.04, 2.3, 8), wood, 0, 0, 0.05, Math.PI / 2);
    add(this.broom, new THREE.ConeGeometry(0.24, 0.95, 10), straw, 0, 0, 1.6, -Math.PI / 2);
    add(this.broom, new THREE.CylinderGeometry(0.075, 0.075, 0.1, 8), gold, 0, 0, 1.18, Math.PI / 2);

    this.witch = new THREE.Group();
    this.witch.position.set(0, 0.05, 0.25);
    this.group.add(this.witch);
    const w = this.witch;
    add(w, new THREE.ConeGeometry(0.36, 0.85, 10), dress, 0, 0.2, 0);
    add(w, new THREE.CapsuleGeometry(0.15, 0.3, 4, 8), dress, 0, 0.62, -0.12, -0.5);
    add(w, new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 0.98, -0.3);
    const h = add(w, new THREE.SphereGeometry(0.19, 10, 8), hair, 0, 0.97, -0.2);
    h.scale.set(1, 1.05, 1.1);
    add(w, new THREE.ConeGeometry(0.1, 0.5, 6), hair, 0, 0.8, 0.02, 0.5);
    add(w, new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), dress, 0, 1.12, -0.29, -0.15);
    add(w, new THREE.ConeGeometry(0.21, 0.6, 10), dress, 0, 1.4, -0.2, 0.3);
    add(w, new THREE.CylinderGeometry(0.215, 0.225, 0.07, 12), gold, 0, 1.16, -0.28, -0.15);
    this.arms = [
      limb(w, [0.17, 0.74, -0.22], [0.06, 0.02, -0.62], 0.045, dress),
      limb(w, [-0.17, 0.74, -0.22], [-0.06, 0.02, -0.62], 0.045, dress),
    ];
    add(w, new THREE.BoxGeometry(0.11, 0.14, 0.26), leather, 0.13, -0.22, -0.12);
    add(w, new THREE.BoxGeometry(0.11, 0.14, 0.26), leather, -0.13, -0.22, -0.12);
    add(w, new THREE.BoxGeometry(0.3, 0.26, 0.15), leather, 0.3, 0.36, 0.14);
    add(w, new THREE.BoxGeometry(0.2, 0.16, 0.16), mat(0.75, 0.6, 0.42), 0.3, 0.36, 0.24);

    // 围巾：一串首尾相接的小片，速度越快甩得越直
    const scarfMat = mat(0.95, 0.66, 0.08, { side: THREE.DoubleSide });
    this.scarf = [];
    let parent = new THREE.Group();
    parent.position.set(0, 0.86, -0.16);
    w.add(parent);
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : 0.3;
      const piece = new THREE.Mesh(new THREE.BoxGeometry(0.17 - i * 0.012, 0.02, 0.3), scarfMat);
      piece.position.z = 0.15;
      seg.add(piece);
      parent.add(seg);
      parent = seg;
      this.scarf.push(seg);
    }

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.stand = 0;
  }

  update(dt, time, flight, landed) {
    const g = this.group;
    this.stand += ((landed ? 1 : 0) - this.stand) * Math.min(1, dt * 5);
    const s = this.stand;
    const t = 1 - flight.flip;
    const flip = flight.flip > 0 ? t * t * (3 - 2 * t) * Math.PI * 2 : 0;
    const hop = flight.flip > 0 ? Math.sin(t * Math.PI) * 1.3 : 0;
    g.position.copy(flight.pos);
    g.position.y += hop + Math.sin(time * 2.1) * 0.05 * (1 - s);
    g.rotation.set(flight.pitch * (1 - s), flight.yaw, (flight.roll + flip) * (1 - s));

    // 落地后：人站直，扫帚竖在手边
    this.broom.rotation.x = s * (Math.PI / 2 - 0.12);
    this.broom.position.set(-0.5 * s, 0.95 * s, 0.1 * s);
    for (const a of this.arms) a.visible = s < 0.5;

    const sp = Math.min(1, flight.speed / 60) * (1 - s);
    this.scarf.forEach((seg, i) => {
      const wave = Math.sin(time * (9 + sp * 9) - i * 0.9);
      seg.rotation.x = (i === 0 ? -0.15 : 0) + wave * (0.12 + 0.1 * sp) + (1 - sp) * (i === 0 ? 0.9 : 0.12);
      seg.rotation.y = Math.cos(time * 7 - i * 0.7) * 0.14 - flight.yawRate * 0.12;
    });
  }
}
