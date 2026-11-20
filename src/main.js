import * as THREE from 'three';
import { U } from './core/shared.js';
import { mulberry32, clamp } from './core/noise.js';
import { glowTexture, noiseTexture } from './core/kit.js';
import { Terrain } from './world/terrain.js';
import { planSites, buildGrounds } from './world/hogwarts.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createMeadow, flowerColor } from './world/meadow.js';
import { createProps } from './world/props.js';
import { createSeeds } from './world/seeds.js';
import { createHorcruxes } from './world/horcruxes.js';
import { Wake } from './fx/wake.js';
import { Particles, PETAL, SPRAY, SPARK } from './fx/particles.js';
import { Input } from './player/input.js';
import { Flight } from './player/flight.js';
import { Rider } from './player/rider.js';
import { ChaseCamera } from './player/camera.js';
import { Combat } from './game/combat.js';
import { Hud } from './ui/hud.js';
import { TouchUI } from './ui/touch.js';
import { GameAudio } from './audio/audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = params.has('touch') || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);
// 手机默认用更稀的花草、更低的像素比和更小的阴影贴图。
// 草叶很细，不开抗锯齿远处会闪成一片，所以两端都开
const quality = { low: 0.35, medium: 0.65, high: 1 }[params.get('q')] ?? (isTouch ? 0.4 : 1);
const basePixelRatio = Math.min(Number(params.get('dpr')) || devicePixelRatio || 1, isTouch ? 1.25 : 1.5);
const DENSITY_STEPS = [1, 0.7, 0.5, 0.35];
const SLOW_FRAME = 0.024;
const SAVE_KEY = 'hunqizhiye.save.v1';

function loadSave() {
  const base = { runs: 0, wins: 0, best: 0, bestTime: 0, invert: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return base;
  }
}
const save = loadSave();
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 存不了档不影响游玩
  }
};

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !params.has('noaa'), powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
let renderScale = 1;
renderer.setPixelRatio(basePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.4, 14000);

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function stage(text) {
  $('loading').textContent = text;
  await nextFrame();
  await nextFrame();
}

async function init() {
  await stage('正在堆出山和黑湖…');
  U.uNoiseMap.value = noiseTexture();
  const terrain = new Terrain();
  const sites = planSites(terrain, mulberry32(77));
  terrain.finalize(sites.clears);
  scene.add(terrain.mesh);

  await stage('正在砌城堡、种禁林…');
  const glowMap = glowTexture();
  const sky = createSky(scene, isTouch ? 1024 : 2048);
  createWater(scene);
  const grounds = buildGrounds(scene, terrain, sites, mulberry32(303));
  const props = createProps(scene, terrain);

  await stage('正在藏魂器…');
  const meadow = createMeadow(scene, quality);
  const seeds = createSeeds(scene, terrain, mulberry32(515));
  const horcruxes = createHorcruxes(scene, terrain, sites, glowMap);
  const wake = new Wake();
  const particles = new Particles(scene, terrain, wake);

  const input = new Input(canvas);
  input.invert = save.invert;
  const flight = new Flight(terrain, grounds.colliders);
  const rider = new Rider(scene);
  const chase = new ChaseCamera(camera, terrain);
  const hud = new Hud();
  const audio = new GameAudio();

  let state = 'title';
  const combat = new Combat({
    scene,
    terrain,
    flight,
    wake,
    particles,
    glowMap,
    horcruxes,
    sites,
    on: {
      sfx: (name) => audio.sfx(name),
      toast: (a, b, sec) => hud.toast(a, b, sec),
      choice(offers) {
        state = 'choice';
        input.pointerEnabled = false;
        document.exitPointerLock?.();
        hud.showChoice(offers, combat.owned, pick);
      },
      over(win) {
        state = 'over';
        input.pointerEnabled = false;
        document.exitPointerLock?.();
        save.runs++;
        save.best = Math.max(save.best, combat.destroyed.size);
        if (win) {
          save.wins++;
          if (!save.bestTime || combat.elapsed < save.bestTime) save.bestTime = Math.round(combat.elapsed);
        }
        persist();
        rider.group.visible = win;
        audio.sfx(win ? 'win' : 'lose');
        hud.showOver({ win, destroyed: combat.destroyed.size, kills: combat.kills, elapsed: combat.elapsed, owned: combat.owned, save });
      },
    },
  });

  let offersOpen = [];
  const showChoice = hud.showChoice.bind(hud);
  hud.showChoice = (offers, owned, fn) => {
    offersOpen = offers;
    showChoice(offers, owned, fn);
  };
  function pick(id) {
    if (state !== 'choice') return;
    combat.applyUpgrade(id);
    hud.hideChoice();
    audio.sfx('pick');
    state = 'play';
    input.pointerEnabled = !isTouch;
  }

  const touchUI = isTouch
    ? new TouchUI(input, {
        onCalibrate() {
          input.calibrate();
          hud.toast('已校准', '现在的拿法就是平飞', 1.6);
        },
      })
    : null;

  // 显存被系统回收后 three.js 会自己重建资源，但掉瓣图是画出来的，得重新清空
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    wake.cleared = false;
    wake.cpu.fill(0);
  });

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(basePixelRatio * renderScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    seeds.setScale((h * basePixelRatio * renderScale * 0.5) / Math.tan((camera.fov * Math.PI) / 360));
  }
  addEventListener('resize', resize);
  resize();

  const fwd = new THREE.Vector3();
  function emitEffects(dt) {
    const p = flight.pos;
    const h = terrain.height(p.x, p.z);
    flight.forward(fwd);
    const rx = Math.cos(flight.yaw);
    const rz = -Math.sin(flight.yaw);
    if (h > 0.5) {
      const k = terrain.maskIndex(p.x, p.z);
      const fl = k < 0 ? 0 : terrain.flower[k];
      if (flight.alt < 7 && flight.speed > 16) {
        // 飞得越低越快，这一处的花掉的瓣越多；第一次掠过时扬起最多
        const s = clamp((flight.speed - 14) / 48, 0, 1) * clamp(1.15 - flight.alt / 7, 0, 1);
        const gain = wake.stamp(p.x, p.z, s);
        let n = fl * (gain * 30 + s * dt * 45) * quality;
        while (n > Math.random()) {
          n -= 1;
          const side = (Math.random() - 0.5) * 7;
          const back = Math.random() * 3;
          const x = p.x + rx * side - fwd.x * back;
          const z = p.z + rz * side - fwd.z * back;
          const c = flowerColor(terrain.field[k], Math.random());
          particles.spawn(PETAL, x, terrain.height(x, z) + 0.3 + Math.random() * 0.5, z,
            fwd.x * flight.speed * 0.25, 1 + Math.random() * 2, fwd.z * flight.speed * 0.25,
            3 + Math.random() * 4, 0.13 + Math.random() * 0.1, c[0], c[1], c[2]);
        }
      }
    } else if (flight.alt < 6 && flight.speed > 18) {
      let n = (1 - flight.alt / 6) * (flight.speed / 60) * dt * 260 * quality;
      while (n > Math.random()) {
        n -= 1;
        const side = (Math.random() - 0.5) * 3.2;
        const back = 1 + Math.random() * 3;
        particles.spawn(SPRAY, p.x + rx * side - fwd.x * back, 0.15, p.z + rz * side - fwd.z * back,
          fwd.x * flight.speed * 0.3 + rx * side * 1.5, 2 + Math.random() * 4.5, fwd.z * flight.speed * 0.3 + rz * side * 1.5,
          0.8 + Math.random() * 1.1, 0.16 + Math.random() * 0.3, 0.95, 0.97, 1.0);
      }
    }
    // 花田上空本来就飘着一些花瓣，尾流有东西可卷
    if (particles.petals < 260 * quality) {
      for (let i = 0; i < 3; i++) {
        const ahead = 8 + Math.random() * 80;
        const side = (Math.random() - 0.5) * 80;
        const x = p.x + fwd.x * ahead + rx * side;
        const z = p.z + fwd.z * ahead + rz * side;
        const k = terrain.maskIndex(x, z);
        if (k < 0 || Math.random() > terrain.flower[k]) continue;
        const c = flowerColor(terrain.field[k], Math.random());
        particles.spawn(PETAL, x, terrain.height(x, z) + 0.3 + Math.random() * 5, z, 1, 0, 0.5,
          5 + Math.random() * 5, 0.12 + Math.random() * 0.09, c[0], c[1], c[2]);
      }
    }
  }

  let time = 0;
  let last = performance.now();
  let slow = 0;
  let scaleTimer = 0;
  let densityStep = 0;
  let pendingResize = false;
  const castle = sites.castle;
  const focus = new THREE.Vector3(castle.x, castle.y, castle.z);
  const proj = new THREE.Vector3();
  rider.group.visible = false;

  // 每一夜都从城堡北边的草坡上空开始，朝着场地中央
  function newRun() {
    combat.reset();
    hud.hideOver();
    hud.hideChoice();
    const x = castle.x;
    const z = castle.z - 430;
    flight.pos.set(x, terrain.ground(x, z) + 14, z);
    flight.yaw = Math.atan2(x + 300, z - 250);
    flight.pitch = 0;
    flight.roll = 0;
    flight.speed = 26;
    rider.group.visible = true;
    chase.snap(flight);
    input.pointerEnabled = !isTouch;
    state = 'play';
    hud.toast('毁掉魂器，再去找伏地魔', '金色光柱下是魂器，绿色光柱下是他。魂器剩得越多，他越强', 7);
  }

  function start() {
    if (state !== 'title') return;
    $('title').classList.add('gone');
    $('hud').classList.add('on');
    document.body.classList.add('playing');
    if (isTouch) {
      // 这两步都必须在点击的回调里发起
      input.enableTilt().then((granted) => {
        setTimeout(() => touchUI.setTilt(granted && input.tilt.active), 1200);
      });
      try {
        Promise.resolve(document.documentElement.requestFullscreen?.())
          .then(() => screen.orientation?.lock?.('landscape'))
          .catch(() => {});
      } catch {
        // 不支持全屏或锁定横屏的浏览器照常玩
      }
    }
    audio.start();
    newRun();
  }
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', () => {
    if (state === 'over') newRun();
  });
  if (params.has('play')) start();

  function hudState() {
    const p = flight.pos;
    const s = combat.stats;
    const near = horcruxes.nearest(p);
    const boss = combat.boss;
    const bearing = (t) => Math.atan2(t.x - p.x, -(t.z - p.z));
    let reticle = null;
    if (combat.target) {
      proj.copy(combat.target.pos).project(camera);
      if (proj.z < 1) reticle = { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, shielded: combat.targetShielded };
    }
    const dist = (t) => {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      return d >= 1000 ? `${(d / 1000).toFixed(1)} 公里` : `${Math.round(d)} 米`;
    };
    let prompt = combat.warn;
    if (!prompt && flight.homing) prompt = '风把你吹回场地的方向';
    return {
      heading: -flight.yaw,
      bearings: [near ? bearing(near.pos) : null, boss.state === 'dead' ? null : bearing(boss.pos)],
      hp: combat.hp,
      maxHp: s.maxHp,
      mana: flight.gust,
      skim: combat.skim,
      speed: flight.speed,
      kills: combat.kills,
      destroyed: combat.destroyed.size,
      near: near ? ` · 最近：${near.place} ${dist(near.pos)}` : ` · 伏地魔 ${dist(boss.pos)}`,
      elapsed: combat.elapsed,
      hurt: clamp(combat.hurtT, 0, 1) * 0.8 + (combat.hp < s.maxHp * 0.3 ? 0.25 + 0.1 * Math.sin(time * 6) : 0),
      chill: combat.chill * 0.8,
      reticle,
      boss: boss.state === 'fight' ? boss.hp / boss.maxHp : null,
      duel: boss.duel.active ? boss.duel.tug : null,
      prompt,
      alert: !!combat.warn,
      skills: {
        cast: { off: flight.gust < s.castCost },
        parry: { cd: combat.parryCd / 0.8 },
        shield: { cd: combat.shieldCd / s.shieldCd, active: combat.shieldT > 0 },
        patronus: { off: flight.gust < 0.5 },
        roll: { cd: combat.rollCd / s.rollCd },
      },
    };
  }

  function play(dt) {
    if (input.take('KeyC')) {
      chase.cycle();
      hud.toast(`镜头：${chase.modeName}`, '', 1.4);
    }
    if (input.take('KeyI')) {
      input.invert = save.invert = !input.invert;
      persist();
      hud.toast(input.invert ? '俯仰已反转' : '俯仰已恢复', '', 1.4);
    }
    if (input.take('KeyP')) hud.toggle();
    if (input.take('KeyM')) hud.toast(audio.toggleMute() ? '已静音' : '声音已打开', '', 1.4);
    if (input.take('KeyJ')) hud.toggleJournal(horcruxes.items, combat.destroyed.has('scar'), combat.owned);

    flight.update(dt, input);
    if (flight.bounced) audio.sfx('swing');

    for (const s of seeds.update(dt, flight.pos)) {
      flight.gust = Math.min(1, flight.gust + 0.3);
      if (combat.stats.orbHeal) combat.heal(combat.stats.orbHeal);
      audio.orb();
      combat.burst(s, 14, [1.0, 0.8, 0.3]);
    }
    combat.update(dt, time, input);
    horcruxes.update(dt, time);

    wake.update(dt, flight, true);
    emitEffects(dt);
    rider.update(dt, time, flight);
    chase.update(dt, flight, false);
    focus.copy(flight.pos);
    // 这一帧里刚结束的话，数字不等节流，立刻刷成最后的样子
    if (state !== 'play') hud.textTimer = 0;
    hud.update(dt, hudState());

    const h = terrain.height(flight.pos.x, flight.pos.z);
    audio.update(dt, {
      speed: flight.speed,
      boosting: flight.boosting,
      alt: flight.alt,
      overSea: h <= 0,
      shore: clamp(1 - Math.abs(h) / 14, 0, 1) * clamp(1 - flight.alt / 80, 0.15, 1),
      tension: combat.boss.state === 'fight',
    });
  }

  function title() {
    if (input.take('Enter') || input.take('Space')) start();
    const a = time * 0.07 + 0.6;
    camera.position.set(castle.x + Math.sin(a) * 270, castle.y + 70 + Math.sin(time * 0.1) * 12, castle.z + Math.cos(a) * 270);
    camera.lookAt(castle.x, castle.y + 30, castle.z);
    focus.set(castle.x, castle.y, castle.z);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, Math.max(0.0001, raw));
    // 改画布大小会清空画面，所以放在这一帧开始、渲染之前做，否则会闪一下
    if (pendingResize) {
      pendingResize = false;
      resize();
    }
    time += dt;
    U.uTime.value = time;
    input.update(dt);
    if (state === 'title') title();
    else if (state === 'play') play(dt);
    else if (state === 'choice') {
      // 挑强化时世界停住
      for (let i = 0; i < offersOpen.length; i++) if (input.take(`Digit${i + 1}`) || input.take(`Numpad${i + 1}`)) pick(offersOpen[i].id);
    } else if (state === 'over' && input.take('Enter')) newRun();
    particles.update(dt, time);
    meadow.update(camera);
    sky.update(camera, focus);
    wake.render(renderer);
    renderer.render(scene, camera);
    input.endFrame();

    // 帧率撑不住时先让花草变稀（不动画布），还不够再降分辨率。
    // 单帧耗时封顶，切回标签页时的一次长停顿不算数
    if (!params.has('noscale') && state === 'play') {
      const sample = Math.min(raw, 0.1);
      slow += (sample - slow) * 0.05;
      scaleTimer += sample;
      if (scaleTimer > 3) {
        scaleTimer = 0;
        if (slow > SLOW_FRAME) {
          if (densityStep < DENSITY_STEPS.length - 1) meadow.setDensity(DENSITY_STEPS[++densityStep]);
          else if (renderScale > 0.6) {
            renderScale -= 0.15;
            pendingResize = true;
          }
        }
      }
    }
  }

  window.__game = {
    renderer, camera, meadow, perf: () => ({ densityStep, renderScale }), flight, terrain, sites, grounds, horcruxes, seeds, particles, wake, save, props,
    input, hud, audio, combat, state: () => state, newRun, pick,
  };
  $('loading').textContent = '';
  $('start').disabled = false;
  $('start').textContent = '起飞';
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

init().catch((err) => {
  console.error(err);
  $('loading').textContent = `启动失败：${err.message}`;
});
