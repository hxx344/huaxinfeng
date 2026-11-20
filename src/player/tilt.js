// 由手机的朝向角算出“重力在屏幕上的方向”，再换成转向和俯仰。
// 不直接用 devicemotion 的重力读数：iOS 和 Android 对它的正负号约定相反，朝向角则一致。
const RAD = Math.PI / 180;
const ROLL_FULL = 0.4;
const PITCH_FULL = 0.33;
const DEAD = 0.07;

// beta、gamma 为 deviceorientation 的角度（度），angle 为屏幕旋转角（度）。
// 返回重力方向在屏幕坐标里的分量：x 向屏幕右，y 向屏幕上，z 朝向使用者
export function gravityOnScreen(beta, gamma, angle) {
  const b = beta * RAD;
  const g = gamma * RAD;
  const a = angle * RAD;
  const dx = Math.cos(b) * Math.sin(g);
  const dy = -Math.sin(b);
  const dz = -Math.cos(b) * Math.cos(g);
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
    z: dz,
  };
}

// roll：屏幕右侧往下沉为正；pitch：屏幕竖直为 0，平放朝上为 90 度（弧度制返回）
export function tiltAngles(beta, gamma, angle) {
  const s = gravityOnScreen(beta, gamma, angle);
  return {
    roll: Math.atan2(s.x, Math.hypot(s.y, s.z)),
    pitch: Math.atan2(-s.z, Math.hypot(s.x, s.y)),
  };
}

function shape(v) {
  const m = Math.abs(v);
  if (m < DEAD) return 0;
  return Math.sign(v) * Math.min(1, (m - DEAD) / (1 - DEAD));
}

// x：+1 向右；y：+1 爬升。把手机上沿往外推（更平）是俯冲，往回扳是拉起
export function tiltSteer(roll, pitch, neutral) {
  return { x: shape(roll / ROLL_FULL), y: shape(-(pitch - neutral) / PITCH_FULL) };
}

export function screenAngle() {
  const a = globalThis.screen?.orientation?.angle;
  if (typeof a === 'number') return a;
  return typeof globalThis.orientation === 'number' ? globalThis.orientation : 0;
}
