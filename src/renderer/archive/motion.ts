// 档案终端动效基元：缓动 / 弹簧 / 波浪 / 循环。独立实现。
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (t: number) => { t = clamp(t); return t * t * t * (10 + t * (-15 + 6 * t)); };
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const bell = (x: number, width: number) => Math.exp(-0.5 * (x / width) ** 2);

export interface Spring { value: number; velocity: number }
export function damp(s: Spring, target: number, rate: number, dt: number) {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}

export const wrap = (v: number, n: number) => ((v % n) + n) % n;
// 在无界循环序列里取离 center 最近的一次出现，首尾相接不反向。
export function nearestOccurrence(value: number, center: number, period: number) {
  return value + Math.floor((center - value + period / 2) / period) * period;
}

// 选档脉冲：以选中卡片为源点的余弦波包向外传播，带负向波谷。
export function selectionWave(distance: number, age: number) {
  if (age < 0 || age > 3.2) return 0;
  return 0.8 * smooth(age / 0.2) * Math.exp(-age * 1.15) *
    Math.cos((distance - age * 8) * 0.58) * bell(distance - age * 8, 3.4);
}

// 静置呼吸：相邻卡片错相，幅度 < 3% 卡高。
export function idleWave(row: number, lane: number, time: number) {
  return 0.075 * Math.sin((time * Math.PI * 2) / 8 + row * 0.3 - lane * 0.45)
    + 0.027 * Math.sin((time * Math.PI * 2) / 13 - row * 0.17 + lane * 0.3);
}

export const COLUMN_SPACING = 5.2;
export const ROW_SPACING = 0.62;
export const INSPECTION_LIFT = 4.05;
export const ALIGNMENT_EPSILON = 0.001;
// 归位：保持高度先转正，再下降。
export function returnStep(angle: number, dt: number, reduced = false) {
  const next = angle * Math.exp(-dt * (reduced ? 35 : 7));
  return Math.abs(next) <= ALIGNMENT_EPSILON ? 0 : next;
}
