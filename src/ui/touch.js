const $ = (id) => document.getElementById(id);
const STICK_REACH = 55;

// 捕获失败（比如指针已经抬起）不该让按钮失灵
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    // 没有捕获也能用，只是手指滑出按钮时会松开
  }
}

// 触屏界面：左半屏是随手落点的虚拟摇杆，右下是施咒、加速和减速，其余是一次性按钮
export class TouchUI {
  constructor(input, { onCalibrate }) {
    this.input = input;
    this.calib = $('btn-calib');

    const hold = (el, set) => {
      const on = (e) => {
        e.preventDefault();
        capture(el, e.pointerId);
        el.classList.add('down');
        set(true);
      };
      const off = () => {
        el.classList.remove('down');
        set(false);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold($('btn-boost'), (v) => (input.touch.boost = v));
    hold($('btn-brake'), (v) => (input.touch.brake = v));
    hold($('btn-cast'), (v) => (input.touch.cast = v));

    const tap = (el, fn) =>
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
    for (const b of document.querySelectorAll('#touch [data-key]')) tap(b, () => input.press(b.dataset.key));
    tap(this.calib, onCalibrate);
    tap($('journal'), () => input.press('KeyJ'));

    const zone = $('stick-zone');
    const ring = $('stick');
    const knob = ring.firstElementChild;
    let id = null;
    let ox = 0;
    let oy = 0;
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      ring.style.display = 'none';
      input.touch.x = input.touch.y = 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      capture(zone, id);
      const r = zone.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      ring.style.left = `${ox - r.left}px`;
      ring.style.top = `${oy - r.top}px`;
      ring.style.display = 'block';
      knob.style.transform = '';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = (e.clientX - ox) / STICK_REACH;
      let dy = (e.clientY - oy) / STICK_REACH;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      knob.style.transform = `translate(${dx * STICK_REACH}px, ${dy * STICK_REACH}px)`;
      // 与键盘一致：往上推是俯冲，往下拉是拉起
      input.touch.x = dx;
      input.touch.y = dy;
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  setTilt(active) {
    this.calib.style.display = active ? '' : 'none';
  }
}
