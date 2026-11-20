import * as THREE from 'three';
import { U } from './core/shared.js';
import { mulberry32, clamp } from './core/noise.js';
import { glowTexture } from './core/kit.js';
import { Terrain } from './world/terrain.js';
import { planSites, buildTown } from './world/town.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createMeadow, flowerColor } from './world/meadow.js';
import { createProps } from './world/props.js';
import { createSeeds } from './world/seeds.js';
import { createPlaces } from './world/places.js';
import { Wake } from './fx/wake.js';
import { Particles, PETAL, SPRAY, SPARK } from './fx/particles.js';
import { Input } from './player/input.js';
import { Flight } from './player/flight.js';
import { Rider } from './player/rider.js';
import { ChaseCamera } from './player/camera.js';
import { Errands } from './game/errands.js';
import { Hud } from './ui/hud.js';
import { TouchUI } from './ui/touch.js';
import { GameAudio } from './audio/audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = params.has('touch') || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);
// 手机默认用更稀的花草、更低的像素比和更小的阴影贴图
const quality = { low: 0.35, medium: 0.65, high: 1 }[params.get('q')] ?? (isTouch ? 0.4 : 1);
const basePixelRatio = Math.min(Number(params.get('dpr')) || devicePixelRatio || 1, isTouch ? 1.25 : 1.5);
const DENSITY_STEPS = [1, 0.7, 0.5, 0.35];
const SLOW_FRAME = 0.024;
const FLIP_SEEDS = 10;
const SAVE_KEY = 'huaxinfeng.save.v1';

function loadSave() {
  const base = { seeds: 0, deliveries: 0, found: [], invert: false };
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
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
  await stage('正在堆出一座岛…');
  const terrain = new Terrain();
  const sites = planSites(terrain, mulberry32(77));
  terrain.finalize(sites.clears);
  scene.add(terrain.mesh);

  await stage('正在盖房子、种树…');
  const glowMap = glowTexture();
  const sky = createSky(scene, isTouch ? 1024 : 2048);
  createWater(scene);
  const town = buildTown(scene, terrain, sites, mulberry32(303));
  const props = createProps(scene, terrain);

  await stage('正在撒花种…');
  const meadow = createMeadow(scene, quality);
  const seeds = createSeeds(scene, terrain, mulberry32(515));
  const places = createPlaces(scene, terrain, sites, glowMap, save.found);
  const wake = new Wake();
  const particles = new Particles(scene, terrain, wake);

  const input = new Input(canvas);
  input.invert = save.invert;
  const flight = new Flight(terrain, town.colliders);
  const rider = new Rider(scene);
  const chase = new ChaseCamera(camera, terrain);
  const hud = new Hud();
  const audio = new GameAudio();

  const errands = new Errands({
    scene,
    places: town.places,
    flight,
    glowMap,
    deliveries: save.deliveries,
    onDeliver(at, next) {
      save.deliveries = errands.deliveries;
      persist();
      flight.gust = 1;
      audio.deliver();
      hud.toast(`已送达：${at.name}`, `下一件包裹送往 ${next.name}`, 4.5);
      burst(flight.pos, 40, 1.0, 0.75, 0.25);
    },
    onLand(at, delivered) {
      audio.land();
      if (!delivered) hud.toast(at.name, isTouch ? '包裹不是送到这里的，点“起飞”离开' : '包裹不是送到这里的，按空格起飞');
    },
    onTakeoff() {},
  });

  const touchUI = isTouch
    ? new TouchUI(input, {
        onLand() {
          if (errands.state === 'landed') input.press('Space');
          else input.doubleSpace = true;
        },
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

  function burst(p, n, r, g, b) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = 3 + Math.random() * 7;
      particles.spawn(SPARK, p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s,
        0.6 + Math.random() * 0.8, 0.25 + Math.random() * 0.3, r, g, b);
    }
  }

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

  let state = 'title';
  let time = 0;
  let last = performance.now();
  let slow = 0;
  let scaleTimer = 0;
  let densityStep = 0;
  let pendingResize = false;
  const focus = new THREE.Vector3(sites.harbour.x, sites.harbour.y, sites.harbour.z);
  const total = places.items.length;
  let foundCount = places.items.filter((it) => it.found).length;
  rider.group.visible = false;

  function start() {
    if (state !== 'title') return;
    state = 'play';
    $('title').classList.add('gone');
    $('hud').classList.add('on');
    document.body.classList.add('playing');
    if (isTouch) {
      // 这两步都必须在点击的回调里发起
      input.enableTilt().then((granted) => {
        setTimeout(() => {
          const on = granted && input.tilt.active;
          touchUI.setTilt(on);
          hud.toast(on ? '倾斜手机来操纵' : '用左下角的摇杆操纵', on ? '左右倾斜转向，前后倾斜俯冲和拉起' : '没有检测到重力感应', 4.5);
        }, 1200);
      });
      try {
        Promise.resolve(document.documentElement.requestFullscreen?.())
          .then(() => screen.orientation?.lock?.('landscape'))
          .catch(() => {});
      } catch {
        // 不支持全屏或锁定横屏的浏览器照常玩
      }
    }
    const x = sites.harbour.x;
    const z = sites.harbour.z - 330;
    flight.pos.set(x, terrain.ground(x, z) + 9, z);
    // 朝岛中央的草甸飞，而不是一头扎向大山
    flight.yaw = Math.atan2(x + 300, z - 250);
    flight.speed = 26;
    rider.group.visible = true;
    chase.snap(flight);
    input.pointerEnabled = !isTouch;
    audio.start();
    hud.toast(`包裹送往 ${errands.target.name}`, '跟着金色的光柱和罗盘上的金点飞', 5);
  }
  $('start').addEventListener('click', start);
  if (params.has('play')) start();

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
    if (input.take('KeyJ')) hud.toggleJournal(places.items);
    if (input.take('KeyQ') && errands.state === 'fly') {
      if (save.seeds < FLIP_SEEDS) hud.toast('还不会翻转', `再接住 ${FLIP_SEEDS - save.seeds} 颗风种`, 2);
      else if (flight.flip <= 0) {
        flight.flip = 1;
        audio.flip();
        burst(flight.pos, 24, 1.0, 0.85, 0.4);
      }
    }

    errands.update(dt, time, input);
    const flying = errands.state === 'fly';
    if (flying) {
      flight.update(dt, input);
      if (flight.bounced) audio.bounce();
    }
    const landed = errands.state === 'landed';

    for (const s of seeds.update(dt, flight.pos)) {
      const was = save.seeds;
      save.seeds++;
      flight.gust = Math.min(1, flight.gust + 0.34);
      audio.seed();
      burst(s, 14, 1.0, 0.8, 0.3);
      if (was < FLIP_SEEDS && save.seeds >= FLIP_SEEDS) hud.toast('接住了十颗风种', '按 Q 试试翻转', 4);
      persist();
    }
    const hit = places.update(dt, time, flight.pos);
    if (hit) {
      save.found.push(hit.id);
      foundCount++;
      persist();
      audio.treasure();
      burst(hit.pos, 60, 1.0, 0.8, 0.3);
      hud.toast(`找到了：${hit.treasure}`, `${hit.name} · ${hit.note}`, 6);
    }

    wake.update(dt, flight, errands.state !== 'landed');
    if (flying) emitEffects(dt);
    rider.update(dt, time, flight, landed);
    chase.update(dt, flight, landed);
    focus.copy(flight.pos);

    const t = errands.target.spot;
    let prompt = '';
    if (touchUI) {
      touchUI.setLand(landed ? '起飞' : flying && errands.near ? `降落 · ${errands.near.name}` : null);
      touchUI.setFlip(flying && save.seeds >= FLIP_SEEDS);
      if (flying && flight.homing) prompt = '风把你吹回岛的方向';
    } else if (landed) prompt = '按 空格 起飞';
    else if (flying && errands.near) prompt = `连按两次 空格 降落到 ${errands.near.name}`;
    else if (flying && flight.homing) prompt = '风把你吹回岛的方向';
    hud.update(dt, {
      heading: -flight.yaw,
      bearing: Math.atan2(t.x - flight.pos.x, -(t.z - flight.pos.z)),
      targetName: errands.target.name,
      dist: Math.hypot(t.x - flight.pos.x, t.z - flight.pos.z),
      deliveries: errands.deliveries,
      speed: flight.speed,
      gust: flight.gust,
      seeds: save.seeds,
      found: foundCount,
      total,
      prompt,
    });

    const h = terrain.height(flight.pos.x, flight.pos.z);
    audio.update(dt, {
      speed: flight.speed,
      boosting: flight.boosting,
      alt: flight.alt,
      overSea: h <= 0,
      shore: clamp(1 - Math.abs(h) / 14, 0, 1) * clamp(1 - flight.alt / 80, 0.15, 1),
    });
  }

  function title(dt) {
    if (input.take('Enter') || input.take('Space')) start();
    const a = time * 0.07 + 0.6;
    const c = sites.harbour;
    camera.position.set(c.x + Math.sin(a) * 250, 62 + Math.sin(time * 0.1) * 10, c.z + 40 + Math.cos(a) * 250);
    camera.lookAt(c.x, 12, c.z);
    focus.set(c.x, c.y, c.z);
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
    if (state === 'title') title(dt);
    else play(dt);
    town.update(dt);
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

  window.__game = { renderer, meadow, perf: () => ({ densityStep, renderScale }), flight, terrain, sites, errands, town, places, seeds, particles, wake, save, props, input, hud };
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
