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

// 骑着火弩箭的哈利，全部由基本几何体拼成。原点在座位处，-z 为前
export class Rider {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);

    const wood = mat(0.3, 0.12, 0.06, { roughness: 0.5 });
    const twig = mat(0.45, 0.31, 0.14);
    const robe = mat(0.05, 0.05, 0.065);
    const skin = mat(0.95, 0.74, 0.6);
    const hair = mat(0.03, 0.025, 0.02);
    const gold = mat(0.95, 0.68, 0.1, { metalness: 0.4, roughness: 0.45 });
    const dark = mat(0.07, 0.06, 0.05);
    const grey = mat(0.3, 0.3, 0.33);

    const add = (parent, geo, material, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parent.add(m);
      return m;
    };

    this.broom = new THREE.Group();
    this.group.add(this.broom);
    add(this.broom, new THREE.CylinderGeometry(0.028, 0.04, 2.4, 8), wood, 0, 0, 0.0, Math.PI / 2);
    add(this.broom, new THREE.ConeGeometry(0.17, 1.25, 10), twig, 0, 0, 1.7, -Math.PI / 2);
    add(this.broom, new THREE.CylinderGeometry(0.07, 0.07, 0.09, 8), gold, 0, 0, 1.14, Math.PI / 2);
    add(this.broom, new THREE.CylinderGeometry(0.11, 0.09, 0.07, 8), gold, 0, 0, 1.5, Math.PI / 2);
    add(this.broom, new THREE.BoxGeometry(0.5, 0.025, 0.05), gold, 0, -0.1, 0.72);

    this.body = new THREE.Group();
    this.body.position.set(0, 0.05, 0.25);
    this.group.add(this.body);
    const w = this.body;
    add(w, new THREE.ConeGeometry(0.34, 0.8, 10), robe, 0, 0.2, 0);
    add(w, new THREE.CapsuleGeometry(0.15, 0.3, 4, 8), robe, 0, 0.62, -0.12, -0.5);
    add(w, new THREE.SphereGeometry(0.17, 12, 10), skin, 0, 0.98, -0.3);
    const h = add(w, new THREE.SphereGeometry(0.185, 10, 8), hair, 0, 1.01, -0.25);
    h.scale.set(1.02, 0.98, 1.05);
    // 永远压不平的头发
    for (const [x, y, z, rx] of [[0, 1.2, -0.3, -0.5], [0.09, 1.18, -0.22, 0.3], [-0.1, 1.17, -0.24, 0.2], [0.03, 1.16, -0.12, 0.9], [-0.05, 1.19, -0.36, -0.8]]) {
      add(w, new THREE.ConeGeometry(0.05, 0.13, 5), hair, x, y, z, rx);
    }
    // 圆眼镜和额头上的伤疤
    for (const s of [-1, 1]) add(w, new THREE.TorusGeometry(0.048, 0.01, 6, 14), dark, s * 0.063, 0.99, -0.462);
    add(w, new THREE.BoxGeometry(0.04, 0.01, 0.01), dark, 0, 0.995, -0.468);
    const scar = add(w, new THREE.BoxGeometry(0.012, 0.055, 0.01), mat(1, 0.75, 0.3, { emissive: new THREE.Color(1, 0.5, 0.1) }), 0.05, 1.075, -0.452);
    scar.rotation.z = 0.5;
    this.scar = scar;

    limb(w, [-0.17, 0.74, -0.22], [-0.05, 0.02, -0.62], 0.045, robe);
    limb(w, [0.17, 0.74, -0.22], [0.24, 0.5, -0.66], 0.045, robe);
    limb(w, [0.24, 0.5, -0.66], [0.25, 0.56, -1.08], 0.012, twig);
    add(w, new THREE.BoxGeometry(0.11, 0.14, 0.26), dark, 0.13, -0.22, -0.12);
    add(w, new THREE.BoxGeometry(0.11, 0.14, 0.26), dark, -0.13, -0.22, -0.12);
    add(w, new THREE.BoxGeometry(0.1, 0.3, 0.1), grey, 0.13, -0.05, -0.08);
    add(w, new THREE.BoxGeometry(0.1, 0.3, 0.1), grey, -0.13, -0.05, -0.08);

    // 格兰芬多围巾：红金相间的一串小片，速度越快甩得越直
    const red = mat(0.6, 0.06, 0.05, { side: THREE.DoubleSide });
    const yellow = mat(0.95, 0.68, 0.1, { side: THREE.DoubleSide });
    this.scarf = [];
    let parent = new THREE.Group();
    parent.position.set(0, 0.86, -0.16);
    w.add(parent);
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : 0.26;
      const piece = new THREE.Mesh(new THREE.BoxGeometry(0.17 - i * 0.01, 0.02, 0.26), i % 2 ? yellow : red);
      piece.position.z = 0.13;
      seg.add(piece);
      parent.add(seg);
      parent = seg;
      this.scarf.push(seg);
    }

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  update(dt, time, flight) {
    const g = this.group;
    const t = 1 - flight.flip;
    const flip = flight.flip > 0 ? t * t * (3 - 2 * t) * Math.PI * 2 * (flight.rollDir || 1) : 0;
    const hop = flight.flip > 0 ? Math.sin(t * Math.PI) * 0.8 : 0;
    g.position.copy(flight.pos);
    g.position.y += hop + Math.sin(time * 2.1) * 0.05;
    g.rotation.set(flight.pitch, flight.yaw, flight.roll - flip);

    const sp = Math.min(1, flight.speed / 60);
    this.scarf.forEach((seg, i) => {
      const wave = Math.sin(time * (9 + sp * 9) - i * 0.9);
      seg.rotation.x = (i === 0 ? -0.15 : 0) + wave * (0.12 + 0.1 * sp) + (1 - sp) * (i === 0 ? 0.9 : 0.12);
      seg.rotation.y = Math.cos(time * 7 - i * 0.7) * 0.14 - flight.yawRate * 0.12;
    });
  }
}
