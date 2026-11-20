import { clamp, wrapAngle } from '../core/noise.js';

const $ = (id) => document.getElementById(id);
const MARKS = [
  ['北', 0],
  ['东', Math.PI / 2],
  ['南', Math.PI],
  ['西', -Math.PI / 2],
];

export class Hud {
  constructor() {
    this.el = {
      root: $('hud'),
      target: $('target-name'),
      dist: $('target-dist'),
      delivered: $('delivered'),
      speed: $('speed'),
      gust: $('gust-fill'),
      seeds: $('seeds'),
      flipHint: $('flip-hint'),
      found: $('found'),
      prompt: $('prompt'),
      toast: $('toast'),
      toastSub: $('toast-sub'),
      toastBox: $('toast-box'),
      compass: $('compass'),
      journal: $('journal'),
      journalList: $('journal-list'),
    };
    this.marks = MARKS.map(([label, angle]) => {
      const m = document.createElement('span');
      m.className = 'mark';
      m.textContent = label;
      this.el.compass.appendChild(m);
      return { m, angle };
    });
    this.pin = document.createElement('span');
    this.pin.className = 'pin';
    this.el.compass.appendChild(this.pin);
    this.textTimer = 0;
    this.toastTimer = 0;
    this.promptText = '';
    this.hidden = false;
  }

  toggle() {
    this.hidden = !this.hidden;
    this.el.root.classList.toggle('hidden', this.hidden);
  }

  toast(text, sub = '', seconds = 3.2) {
    this.el.toast.textContent = text;
    this.el.toastSub.textContent = sub;
    this.el.toastBox.classList.add('show');
    this.toastTimer = seconds;
  }

  toggleJournal(items) {
    const open = this.el.journal.classList.toggle('show');
    if (open) {
      this.el.journalList.innerHTML = '';
      for (const it of items) {
        const li = document.createElement('li');
        li.className = it.found ? 'found' : '';
        const title = document.createElement('b');
        title.textContent = it.found ? `${it.name} · ${it.treasure}` : '？？？';
        const body = document.createElement('span');
        body.textContent = it.found ? it.note : it.hint;
        li.append(title, body);
        this.el.journalList.appendChild(li);
      }
    }
    return open;
  }

  update(dt, s) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toastBox.classList.remove('show');
    }

    // 罗盘：只显示前方左右各 100 度，包裹的目的地超出范围时贴在边上
    const half = this.el.compass.clientWidth / 2;
    for (const { m, angle } of this.marks) {
      const rel = wrapAngle(angle - s.heading);
      const show = Math.abs(rel) < 1.75;
      m.style.opacity = show ? 1 : 0;
      if (show) m.style.transform = `translateX(${(rel / 1.75) * half}px)`;
    }
    const rel = wrapAngle(s.bearing - s.heading);
    this.pin.style.transform = `translateX(${clamp(rel / 1.75, -1, 1) * half}px)`;
    this.pin.classList.toggle('edge', Math.abs(rel) > 1.75);

    if (s.prompt !== this.promptText) {
      this.promptText = s.prompt;
      this.el.prompt.textContent = s.prompt;
      this.el.prompt.classList.toggle('show', !!s.prompt);
    }
    this.el.gust.style.transform = `scaleX(${s.gust})`;

    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 0.1;
    this.el.target.textContent = s.targetName;
    this.el.dist.textContent = s.dist >= 1000 ? `${(s.dist / 1000).toFixed(1)} 公里` : `${Math.round(s.dist)} 米`;
    this.el.delivered.textContent = s.deliveries;
    this.el.speed.textContent = Math.round(s.speed * 3.6);
    this.el.seeds.textContent = s.seeds;
    this.el.flipHint.style.display = s.seeds >= 10 ? '' : 'none';
    this.el.found.textContent = `${s.found}/${s.total}`;
  }
}
