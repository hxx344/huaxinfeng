// 小调五声音阶：比原来的大调暗一些
const SCALE = [0, 3, 5, 7, 10];
const note = (n) => 220 * Math.pow(2, (SCALE[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);
const semi = (s) => 220 * Math.pow(2, s / 12);
// A 小调、F、D 小调、E 小调
const CHORDS = [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -2, 2]];
const BAR = 4;

// 所有声音都在浏览器里合成，没有音频文件
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.combo = 0;
    this.comboTime = 0;
    this.nextBar = 0;
    this.bar = 0;
    this.melody = 7;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);
    // 风声水声和音乐各走一路，音量分开定
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0.4;
    this.ambient.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 1;
    this.music.connect(this.master);
    this.nextBar = ctx.currentTime + 1.5;

    // 一点回声，让音符有空间感
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(this.master);
    this.echo = delay;

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.ambient);
      src.start();
      return { filter, gain };
    };
    this.wind = loop('bandpass', 500, 0.7);
    this.sea = loop('lowpass', 420, 0.3);
    this.skim = loop('highpass', 2600, 0.5);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, echo = 0.5, slide = 0, attack = 0.012, out = this.master } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(out);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send).connect(this.echo);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  arp(notes, dur, step, opt = {}) {
    notes.forEach((n, i) => this.tone(note(n), dur, { type: 'triangle', vol: 0.13, ...opt, at: i * step }));
  }

  orb() {
    this.combo = this.comboTime > 0 ? this.combo + 1 : 0;
    this.comboTime = 2.5;
    const n = 5 + Math.min(this.combo, 12);
    this.tone(note(n), 0.5, { type: 'triangle', vol: 0.14 });
    this.tone(note(n + 2), 0.6, { vol: 0.07, at: 0.06 });
  }

  sfx(name) {
    const dry = { echo: 0.1 };
    switch (name) {
      case 'cast': this.tone(900, 0.13, { type: 'triangle', vol: 0.05, slide: 0.45, ...dry }); break;
      case 'enemyCast': this.tone(420, 0.16, { type: 'sawtooth', vol: 0.03, slide: 0.6, ...dry }); break;
      case 'hit': this.tone(560, 0.08, { type: 'square', vol: 0.035, slide: 0.7, ...dry }); break;
      case 'kill':
        this.tone(300, 0.4, { type: 'sawtooth', vol: 0.07, slide: 0.25 });
        this.tone(note(9), 0.5, { type: 'triangle', vol: 0.08, at: 0.05 });
        break;
      case 'hurt': this.tone(150, 0.32, { type: 'sawtooth', vol: 0.16, slide: 0.45, ...dry }); break;
      case 'block': this.tone(1250, 0.16, { vol: 0.07 }); break;
      case 'swing': this.tone(520, 0.1, { vol: 0.04, slide: 1.6, ...dry }); break;
      case 'parry':
        this.tone(900, 0.3, { type: 'triangle', vol: 0.1 });
        this.tone(1350, 0.35, { type: 'triangle', vol: 0.08, at: 0.04 });
        break;
      case 'shield': this.tone(380, 0.45, { type: 'triangle', vol: 0.08, slide: 2 }); break;
      case 'roll': this.tone(300, 0.6, { type: 'triangle', vol: 0.08, slide: 3 }); break;
      case 'patronus': this.arp([7, 9, 12, 14, 17], 1.4, 0.08, { vol: 0.12, echo: 0.7 }); break;
      case 'charge': this.tone(180, 0.9, { type: 'sawtooth', vol: 0.07, slide: 3.5, ...dry }); break;
      case 'avada': this.tone(1500, 0.5, { type: 'sawtooth', vol: 0.11, slide: 0.18 }); break;
      case 'horcrux':
        this.tone(90, 1.3, { type: 'sawtooth', vol: 0.2, slide: 0.45 });
        this.arp([14, 12, 10, 9, 7], 1.0, 0.09, { vol: 0.1 });
        break;
      case 'alarm':
        this.tone(110, 0.9, { type: 'sawtooth', vol: 0.09, attack: 0.1 });
        this.tone(104, 0.9, { type: 'sawtooth', vol: 0.09, attack: 0.1, at: 0.45 });
        break;
      case 'duel':
        this.tone(330, 1.6, { type: 'sawtooth', vol: 0.05, attack: 0.2 });
        this.tone(337, 1.6, { type: 'sawtooth', vol: 0.05, attack: 0.2 });
        break;
      case 'duelWin': this.arp([5, 7, 9, 12, 14, 17], 1.0, 0.07); break;
      case 'pick': this.arp([7, 10, 12], 0.5, 0.07, { vol: 0.1 }); break;
      case 'win': this.arp([5, 7, 9, 10, 12, 14, 15, 17], 1.8, 0.14, { vol: 0.14, echo: 0.7 }); break;
      case 'lose': this.arp([9, 7, 6, 5, 2, 0], 1.6, 0.2, { vol: 0.12 }); break;
    }
  }

  update(dt, { speed, boosting, alt, overSea, shore, tension }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.comboTime -= dt;
    const s = Math.min(1, speed / 64);
    this.wind.gain.gain.setTargetAtTime(0.015 + 0.2 * s * s + (boosting ? 0.06 : 0), t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(280 + 1100 * s, t, 0.15);
    this.sea.gain.gain.setTargetAtTime(0.11 * shore * (0.75 + 0.25 * Math.sin(t * 0.7)), t, 0.4);
    const low = Math.max(0, 1 - alt / 5) * s;
    this.skim.gain.gain.setTargetAtTime(low * (overSea ? 0.09 : 0.045), t, 0.1);

    // 背景音乐：四小节一轮的和弦铺底，加一条在五声音阶上随机游走的旋律；
    // 和伏地魔交手时低音改成一拍一下的脉冲
    if (t > this.nextBar + 1) this.nextBar = t + 0.1;
    if (t > this.nextBar - 0.3) {
      const at = this.nextBar - t;
      const chord = CHORDS[this.bar++ % CHORDS.length];
      const music = { out: this.music };
      if (tension) {
        for (let i = 0; i < 8; i++) {
          this.tone(semi(chord[0]) / 2, 0.4, { ...music, type: 'sawtooth', vol: 0.06, at: at + (i * BAR) / 8, echo: 0.1 });
        }
      } else {
        this.tone(semi(chord[0]) / 2, BAR * 1.05, { ...music, vol: 0.11, at, attack: 0.08, echo: 0.2 });
      }
      for (const c of chord) {
        this.tone(semi(c), BAR * 1.15, { ...music, type: 'triangle', vol: 0.045, at, attack: 0.9, echo: 0.3 });
        this.tone(semi(c) * 1.004, BAR * 1.15, { ...music, vol: 0.04, at, attack: 0.9, echo: 0 });
      }
      for (let i = 0; i < 8; i++) {
        if (Math.random() > (i % 2 === 0 ? 0.7 : 0.35)) continue;
        this.melody = Math.max(4, Math.min(13, this.melody + Math.floor(Math.random() * 5) - 2));
        this.tone(note(this.melody), 1.1, { ...music, type: 'triangle', vol: 0.085, at: at + (i * BAR) / 8, echo: 0.6 });
      }
      this.nextBar += BAR;
    }
  }
}
