import { clamp } from '../core/noise.js';

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.hit = new Set();
    this.mx = 0;
    this.my = 0;
    this.mouseBoost = false;
    this.mouseBrake = false;
    this.locked = false;
    this.pointerEnabled = false;
    this.invert = false;
    this.lastSpace = -1e9;
    this.doubleSpace = false;
    this.gp = { x: 0, y: 0, boost: false, brake: false };

    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.hit.add(e.code);
      if (e.code === 'Space') {
        const now = performance.now();
        if (now - this.lastSpace < 380) this.doubleSpace = true;
        this.lastSpace = now;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseBoost = this.mouseBrake = false;
    });
    dom.addEventListener('click', () => {
      if (this.pointerEnabled && !this.locked) dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.mouseBoost = this.mouseBrake = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mx = clamp(this.mx + e.movementX * 0.0035, -1, 1);
      this.my = clamp(this.my + e.movementY * 0.0035, -1, 1);
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseBoost = true;
      if (e.button === 2) this.mouseBrake = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseBoost = false;
      if (e.button === 2) this.mouseBrake = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // 本帧是否刚按下；读过即清
  take(code) {
    const h = this.hit.has(code);
    this.hit.delete(code);
    return h;
  }

  update(dt) {
    const decay = Math.exp(-1.3 * dt);
    this.mx *= decay;
    this.my *= decay;
    const pad = navigator.getGamepads ? Array.from(navigator.getGamepads()).find((g) => g) : null;
    if (pad) {
      const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      this.gp.x = dead(pad.axes[0] || 0);
      this.gp.y = dead(pad.axes[1] || 0);
      this.gp.boost = !!(pad.buttons[7]?.pressed || pad.buttons[0]?.pressed);
      this.gp.brake = !!(pad.buttons[6]?.pressed || pad.buttons[1]?.pressed);
    } else {
      this.gp.x = this.gp.y = 0;
      this.gp.boost = this.gp.brake = false;
    }
  }

  // +1 向右
  get steerX() {
    const kb = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    return clamp(kb + this.mx + this.gp.x, -1, 1);
  }

  // +1 爬升。W 俯冲、S 拉起；鼠标往回拉是拉起
  get steerY() {
    const kb = (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0);
    const v = clamp(kb + this.my + this.gp.y, -1, 1);
    return this.invert ? -v : v;
  }

  get boost() {
    return this.down('ShiftLeft', 'ShiftRight') || this.mouseBoost || this.gp.boost;
  }

  get brake() {
    return this.down('Space') || this.mouseBrake || this.gp.brake;
  }

  endFrame() {
    this.hit.clear();
    this.doubleSpace = false;
  }
}
