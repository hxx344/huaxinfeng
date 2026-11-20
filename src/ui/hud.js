import { clamp, wrapAngle } from '../core/noise.js';
import { HORCRUX_TOTAL, UPGRADES } from '../game/rules.js';

const $ = (id) => document.getElementById(id);
const MARKS = [
  ['北', 0],
  ['东', Math.PI / 2],
  ['南', Math.PI],
  ['西', -Math.PI / 2],
];
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'hx-count', 'hx-near', 'night', 'compass', 'boss', 'boss-fill', 'toast', 'toast-sub', 'toast-box', 'duel', 'duel-fill',
      'prompt', 'reticle', 'hp-fill', 'hp-text', 'mana', 'mana-fill', 'skim', 'speed', 'kills', 'hurt', 'chill', 'journal', 'journal-list',
      'journal-ups', 'choice', 'cards', 'over', 'over-title', 'over-sub', 'over-stats', 'again']) {
      this.el[id] = $(id);
    }
    this.marks = MARKS.map(([label, angle]) => {
      const m = document.createElement('span');
      m.className = 'mark';
      m.textContent = label;
      this.el.compass.appendChild(m);
      return { m, angle };
    });
    this.pins = ['pin', 'pin dark'].map((cls) => {
      const pin = document.createElement('span');
      pin.className = cls;
      this.el.compass.appendChild(pin);
      return pin;
    });
    this.skills = {};
    for (const node of document.querySelectorAll('[data-skill]')) (this.skills[node.dataset.skill] ||= []).push(node);
    this.textTimer = 0;
    this.toastTimer = 0;
    this.promptText = '';
    this.hidden = false;
  }

  toggle() {
    this.hidden = !this.hidden;
    this.el.hud.classList.toggle('hidden', this.hidden);
  }

  toast(text, sub = '', seconds = 3.2) {
    this.el.toast.textContent = text;
    this.el['toast-sub'].textContent = sub;
    this.el['toast-box'].classList.add('show');
    this.toastTimer = seconds;
  }

  toggleJournal(horcruxes, scarGone, owned) {
    const open = this.el.journal.classList.toggle('show');
    if (!open) return false;
    const list = this.el['journal-list'];
    list.innerHTML = '';
    const rows = horcruxes.map((h) => ({ name: `${h.name} · ${h.place}`, body: h.hint, done: !h.alive }));
    rows.push({ name: '第七件 · 你的伤疤', body: '只有伏地魔的索命咒能毁掉它：挨第一下不会死', done: scarGone });
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = r.done ? 'done' : '';
      const title = document.createElement('b');
      title.textContent = r.name;
      const body = document.createElement('span');
      body.textContent = r.body;
      li.append(title, body);
      list.appendChild(li);
    }
    this.el['journal-ups'].textContent = `已有的强化：${this.upgradeNames(owned) || '还没有'}`;
    return true;
  }

  upgradeNames(owned) {
    return UPGRADES.filter((u) => owned[u.id]).map((u) => (owned[u.id] > 1 ? `${u.name}×${owned[u.id]}` : u.name)).join('、');
  }

  showChoice(offers, owned, pick) {
    const cards = this.el.cards;
    cards.innerHTML = '';
    offers.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      const key = document.createElement('kbd');
      key.textContent = i + 1;
      const name = document.createElement('b');
      name.textContent = u.name;
      const desc = document.createElement('span');
      desc.textContent = u.desc;
      const have = document.createElement('i');
      have.textContent = u.max > 1 ? `已有 ${owned[u.id] || 0}/${u.max}` : '';
      b.append(key, name, desc, have);
      b.addEventListener('click', () => pick(u.id));
      cards.appendChild(b);
    });
    this.el.choice.classList.add('show');
  }

  hideChoice() {
    this.el.choice.classList.remove('show');
  }

  showOver({ win, destroyed, kills, elapsed, owned, save }) {
    this.el['over-title'].textContent = win ? '伏地魔倒下了' : '你被击落了';
    this.el['over-sub'].textContent = win ? '天快亮了，城堡的灯还亮着。' : '夜还很长，伏地魔还在黑湖上等着。';
    const rows = [
      ['毁掉的魂器', `${destroyed}/${HORCRUX_TOTAL}`],
      ['击败的敌人', kills],
      ['这一夜', clock(elapsed)],
      ['带着的强化', this.upgradeNames(owned) || '没有'],
      ['战绩', `${save.wins} 胜 / ${save.runs} 局${save.bestTime ? ` · 最快 ${clock(save.bestTime)}` : ''}`],
    ];
    const box = this.el['over-stats'];
    box.innerHTML = '';
    for (const [k, v] of rows) {
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('span');
      b.textContent = v;
      box.append(a, b);
    }
    this.el.over.classList.add('show');
  }

  hideOver() {
    this.el.over.classList.remove('show');
  }

  update(dt, s) {
    const el = this.el;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el['toast-box'].classList.remove('show');
    }

    // 罗盘：只显示前方左右各 100 度，目标超出范围时贴在边上
    const half = el.compass.clientWidth / 2;
    for (const { m, angle } of this.marks) {
      const rel = wrapAngle(angle - s.heading);
      const show = Math.abs(rel) < 1.75;
      m.style.opacity = show ? 1 : 0;
      if (show) m.style.transform = `translateX(${(rel / 1.75) * half}px)`;
    }
    this.pins.forEach((pin, i) => {
      const bearing = s.bearings[i];
      pin.style.display = bearing === null ? 'none' : '';
      if (bearing === null) return;
      const rel = wrapAngle(bearing - s.heading);
      pin.style.transform = `translateX(${clamp(rel / 1.75, -1, 1) * half}px)`;
      pin.classList.toggle('edge', Math.abs(rel) > 1.75);
    });

    if (s.prompt !== this.promptText) {
      this.promptText = s.prompt;
      el.prompt.textContent = s.prompt;
      el.prompt.classList.toggle('show', !!s.prompt);
      el.prompt.classList.toggle('alert', s.alert);
    }
    el['hp-fill'].style.transform = `scaleX(${clamp(s.hp / s.maxHp, 0, 1)})`;
    el['mana-fill'].style.transform = `scaleX(${s.mana})`;
    el.mana.classList.toggle('skim', s.skim > 0.3);
    el.skim.classList.toggle('on', s.skim > 0.3);
    el.hurt.style.opacity = s.hurt;
    el.chill.style.opacity = s.chill;

    el.reticle.classList.toggle('show', !!s.reticle);
    if (s.reticle) {
      el.reticle.style.transform = `translate(${s.reticle.x}px, ${s.reticle.y}px)`;
      el.reticle.classList.toggle('shield', s.reticle.shielded);
    }
    el.boss.classList.toggle('show', s.boss !== null);
    if (s.boss !== null) el['boss-fill'].style.transform = `scaleX(${clamp(s.boss, 0, 1)})`;
    el.duel.classList.toggle('show', s.duel !== null);
    if (s.duel !== null) el['duel-fill'].style.transform = `scaleX(${clamp(s.duel, 0, 1)})`;

    for (const [name, st] of Object.entries(s.skills)) {
      for (const node of this.skills[name] || []) {
        node.style.setProperty('--cd', clamp(st.cd || 0, 0, 1));
        node.classList.toggle('off', !!st.off);
        node.classList.toggle('active', !!st.active);
      }
    }

    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 0.1;
    el['hx-count'].textContent = `${s.destroyed}/${HORCRUX_TOTAL}`;
    el['hx-near'].textContent = s.near;
    el.night.textContent = `入夜 ${clock(s.elapsed)}`;
    el['hp-text'].textContent = `${Math.ceil(s.hp)}/${s.maxHp}`;
    el.speed.textContent = Math.round(s.speed * 3.6);
    el.kills.textContent = s.kills;
  }
}
