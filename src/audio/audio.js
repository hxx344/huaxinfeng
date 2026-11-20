const SCALE = [0, 2, 4, 7, 9];
const note = (n) => 220 * Math.pow(2, (SCALE[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);

// 所有声音都在浏览器里合成，没有音频文件
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.combo = 0;
    this.comboTime = 0;
    this.musicTimer = 2;
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
      src.connect(filter).connect(gain).connect(this.master);
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

  tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, echo = 0.5, slide = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(this.master);
    if (echo > 0) {
      const send = ctx.createGain();
      send.gain.value = echo;
      g.connect(send).connect(this.echo);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  seed() {
    this.combo = this.comboTime > 0 ? this.combo + 1 : 0;
    this.comboTime = 2.5;
    const n = 5 + Math.min(this.combo, 12);
    this.tone(note(n), 0.5, { type: 'triangle', vol: 0.16 });
    this.tone(note(n + 2), 0.6, { vol: 0.08, at: 0.06 });
  }

  deliver() {
    [5, 7, 9, 12].forEach((n, i) => this.tone(note(n), 0.9, { type: 'triangle', vol: 0.15, at: i * 0.11 }));
  }

  treasure() {
    [7, 9, 10, 12, 14].forEach((n, i) => this.tone(note(n), 1.2, { vol: 0.14, at: i * 0.09 }));
    this.tone(note(0), 1.6, { type: 'triangle', vol: 0.1 });
  }

  land() {
    this.tone(110, 0.25, { vol: 0.25, echo: 0.1, slide: 0.5 });
  }

  bounce() {
    this.tone(160, 0.2, { vol: 0.18, echo: 0.1, slide: 0.6 });
  }

  flip() {
    this.tone(300, 0.7, { type: 'triangle', vol: 0.1, slide: 3 });
  }

  update(dt, { speed, boosting, alt, overSea, shore }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.comboTime -= dt;
    const s = Math.min(1, speed / 64);
    this.wind.gain.gain.setTargetAtTime(0.015 + 0.2 * s * s + (boosting ? 0.06 : 0), t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(280 + 1100 * s, t, 0.15);
    this.sea.gain.gain.setTargetAtTime(0.11 * shore * (0.75 + 0.25 * Math.sin(t * 0.7)), t, 0.4);
    const low = Math.max(0, 1 - alt / 5) * s;
    this.skim.gain.gain.setTargetAtTime(low * (overSea ? 0.09 : 0.045), t, 0.1);

    // 很轻的五声音阶背景音，随机落几个音
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 2.2 + Math.random() * 3.5;
      const n = Math.floor(Math.random() * 8);
      this.tone(note(n) / 2, 3.5, { vol: 0.035, echo: 0.8 });
      if (Math.random() < 0.5) this.tone(note(n + 2) / 2, 3.2, { vol: 0.028, at: 0.4, echo: 0.8 });
    }
  }
}
