// 战斗和肉鸽循环里不依赖渲染的规则，单独放着方便测试

export const HORCRUX_TOTAL = 7;

export const UPGRADES = [
  { id: 'rapid', name: '连珠咒', desc: '施咒间隔缩短 25%', max: 3 },
  { id: 'power', name: '强力昏迷咒', desc: '昏昏倒地的伤害 +1', max: 2 },
  { id: 'split', name: '分裂咒', desc: '每次施咒多射出一道咒语', max: 2 },
  { id: 'blast', name: '霹雳爆炸', desc: '咒语命中时波及 14 米内的其他敌人', max: 1 },
  { id: 'broom', name: '火弩箭保养', desc: '飞行速度 +10%', max: 2 },
  { id: 'skim', name: '贴地汲魔', desc: '贴地飞行时魔力回复 +60%', max: 2 },
  { id: 'thrift', name: '无声咒', desc: '施咒消耗的魔力 -30%', max: 2 },
  { id: 'vigor', name: '强身药剂', desc: '生命上限 +30，并立即回复 30', max: 3 },
  { id: 'dittany', name: '白鲜香精', desc: '立即回复 50 生命；之后每个魔力光点回复 3 生命', max: 1 },
  { id: 'shield', name: '铁甲咒精通', desc: '盔甲护身多持续 1.5 秒，冷却缩短 3 秒', max: 2 },
  { id: 'parry', name: '反咒大师', desc: '除你武器的判定时间加倍，弹回的咒语伤害 ×3', max: 1 },
  { id: 'roll', name: '灵巧翻滚', desc: '翻滚的冷却时间减半', max: 1 },
  { id: 'stag', name: '守护神之鹿', desc: '守护神咒范围 +50%，并对其他敌人造成 2 点伤害', max: 2 },
  { id: 'seeker', name: '找球手直觉', desc: '锁定的距离和角度 +35%', max: 1 },
  { id: 'phoenix', name: '凤凰眼泪', desc: '被击落时复活一次，回复一半生命', max: 1 },
];

// 从还没拿满的强化里不重复地抽 n 个
export function offerUpgrades(owned, rng, n = 3) {
  const pool = UPGRADES.filter((u) => (owned[u.id] || 0) < u.max);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function playerStats(owned) {
  const n = (id) => owned[id] || 0;
  const seek = n('seeker') ? 1.35 : 1;
  return {
    fireInterval: 0.26 * Math.pow(0.75, n('rapid')),
    damage: 1 + n('power'),
    shots: 1 + n('split'),
    blast: n('blast') > 0,
    speedMul: 1 + 0.1 * n('broom'),
    skimRegen: 0.15 * (1 + 0.6 * n('skim')),
    castCost: 0.035 * Math.pow(0.7, n('thrift')),
    maxHp: 100 + 30 * n('vigor'),
    orbHeal: n('dittany') ? 3 : 0,
    shieldTime: 2.5 + 1.5 * n('shield'),
    shieldCd: 10 - 3 * n('shield'),
    parryWindow: 0.3 * (n('parry') ? 2 : 1),
    parryDamage: 3 * (n('parry') ? 3 : 1),
    rollCd: n('roll') ? 0.9 : 1.8,
    patronusRange: 70 * (1 + 0.5 * n('stag')),
    patronusDamage: 2 * n('stag'),
    lockRange: 170 * seek,
    lockCos: Math.cos(0.42 * seek),
    revives: n('phoenix'),
  };
}

// 伏地魔的强度取决于还剩几件魂器（含伤疤，0..7）
export function bossMaxHp(remaining) {
  return 110 + 35 * remaining;
}
export function bossRate(remaining) {
  return 1 + 0.1 * remaining;
}

// 每件魂器的守卫；已经毁掉的越多，后面的守卫越多
export function guardPlan(id, destroyed) {
  const base = {
    diary: { dementor: 3 },
    ring: { eater: 3 },
    locket: { dementor: 3, eater: 1 },
    cup: { dragon: 1 },
    diadem: { eater: 3, dementor: 2 },
    nagini: { spider: 4 },
  }[id];
  const plan = { ...base };
  plan.eater = (plan.eater || 0) + Math.floor(destroyed / 2);
  plan.dementor = (plan.dementor || 0) + Math.floor(destroyed / 3);
  return plan;
}

// 在前方锥形范围内挑一个锁定目标：越正对越优先，同样正对时挑近的。
// list 的元素带 pos{x,y,z}；返回下标，没有合适的返回 -1
export function pickTarget(list, p, f, range, cosMin) {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const q = list[i].pos;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dz = q.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > range || d < 0.001) continue;
    const c = (dx * f.x + dy * f.y + dz * f.z) / d;
    if (c < cosMin) continue;
    const score = c - (d / range) * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// 点 q 到线段 a-b 的距离平方
export function segDist2(ax, ay, az, bx, by, bz, qx, qy, qz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((qx - ax) * dx + (qy - ay) * dy + (qz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - qx;
  const ey = ay + dy * t - qy;
  const ez = az + dz * t - qz;
  return ex * ex + ey * ey + ez * ez;
}

// 从 o 以速度 speed 发射，要打中位置 p、速度 v 的目标，应该瞄准的点
export function leadPoint(p, v, o, speed) {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const dz = p.z - o.z;
  const a = v.x * v.x + v.y * v.y + v.z * v.z - speed * speed;
  const b = 2 * (dx * v.x + dy * v.y + dz * v.z);
  const c = dx * dx + dy * dy + dz * dz;
  let t = Math.sqrt(c) / speed;
  const disc = b * b - 4 * a * c;
  if (Math.abs(a) > 1e-6 && disc >= 0) {
    const r = Math.sqrt(disc);
    const t1 = (-b - r) / (2 * a);
    const t2 = (-b + r) / (2 * a);
    const pos = [t1, t2].filter((x) => x > 0);
    if (pos.length) t = Math.min(...pos);
  }
  t = Math.min(t, 4);
  return { x: p.x + v.x * t, y: p.y + v.y * t, z: p.z + v.z * t };
}
