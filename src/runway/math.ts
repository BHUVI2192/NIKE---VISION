export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function wrapN(v: number, n: number): number {
  return ((v % n) + n) % n;
}

export function wrapAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = ((rad % twoPi) + twoPi) % twoPi;
  if (a > Math.PI) a -= twoPi;
  return a;
}

export interface FrameMetricsInput {
  isMobile: boolean;
  style: 'ring' | 'classic';
  innerHeight: number;
  headerHeight: number;
  mheightVh: number;
  stageW: number;
  stageH: number;
}

export interface FrameMetrics {
  frameH: number;
  fs: number;
  modelH: number;
  hx: number;
  hy: number;
  axPct: number;
}

export function computeFrameMetrics(input: FrameMetricsInput): FrameMetrics {
  const { isMobile, style, innerHeight, headerHeight, mheightVh, stageW, stageH } = input;
  const frameH = isMobile
    ? Math.round(innerHeight * (clamp(mheightVh, 50, 120) / 100))
    : Math.max(380, Math.round(innerHeight - headerHeight));

  const fs = style === 'ring' ? 1.08 : 1;
  const modelH =
    style === 'ring'
      ? Math.max(200, Math.round((stageH - 34 - 18) / 1.08))
      : Math.max(200, Math.round(stageH - (isMobile ? 24 : 36) - 18));

  const hx = style === 'ring' ? 0.5 * stageW : (isMobile ? 0.3 : 0.4) * stageW;
  const hy = style === 'ring' ? 34 : isMobile ? 22 : 36;
  const axPct = stageW > 0 ? (hx / stageW) * 100 : style === 'ring' ? 50 : 30;

  return { frameH, fs, modelH, hx, hy, axPct };
}

export interface RingPose {
  x: number;
  bottom: number;
  scale: number;
  opacity: number;
  blur: number;
  z: number;
  sl: number;
  phi: number;
}

export interface RingPoseInput {
  bodyIndex: number;
  bodyCount: number;
  cur: number;
  W: number;
  H: number;
  fs: number;
  still: boolean;
  isMobile: boolean;
  useBlur: boolean;
}

export function computeRingSlotPose(input: RingPoseInput): RingPose {
  const { bodyIndex, bodyCount, cur, W, H, fs, still, isMobile, useBlur } = input;
  const cx = 0.5 * W;
  const R = (isMobile ? 0.72 : 0.62) * W;
  const P = (isMobile ? 1.9 : 1.65) * W;
  const floor = H - 34;
  const horizon = 0.36 * H;
  const step = (Math.PI * 2) / bodyCount;

  const phi = wrapAngle((bodyIndex - cur) * step);
  const zDepth = R * (1 - Math.cos(phi));
  const persp = P / (P + zDepth);
  const sl = Math.abs(phi) / step;
  const scale = persp * (1 + (fs - 1) * clamp(1 - sl, 0, 1));
  const x = cx + R * Math.sin(phi) * persp;
  const feet = horizon + (floor - horizon) * persp;
  const bottom = H - feet;
  const blur = useBlur ? (sl <= 1 ? 1.8 * sl : Math.min(1.8 + (sl - 1) * 2, 6.5)) : 0;
  let opacity = clamp((Math.cos(phi) + 0.55) / 0.3, 0, 1);
  if (still && sl < 0.02) {
    opacity = 0;
  }
  const z = Math.round(scale * 1000);

  return { x, bottom, scale, opacity, blur, z, sl, phi };
}

export interface ClassicBodyState {
  x: number;
  v: number;
  g: number;
  goal: number;
  from: number;
  trip: boolean;
}

export interface ClassicPose {
  x: number;
  bottom: number;
  scale: number;
  opacity: number;
  blur: number;
  z: number;
  k: number;
  e: number;
}

export function stepClassicBody(
  state: ClassicBodyState,
  goal: number,
  bodyCount: number,
  dt: number,
  dragging: boolean,
  reducedMotion: boolean
): { settled: boolean } {
  if (reducedMotion) {
    state.goal = goal;
    state.g = goal;
    state.x = goal;
    state.v = 0;
    state.from = goal;
    state.trip = false;
    return { settled: true };
  }

  if (Math.abs(goal - state.goal) > bodyCount / 2) {
    state.from = state.x;
    state.trip = true;
  }
  state.goal = goal;

  const tau = dragging ? 0.016 : state.trip ? 0.1 : 0.03 + 0.04 * Math.min(goal, 4);
  state.g += (goal - state.g) * (1 - Math.exp(-dt / tau));

  const K = 95;
  const C = 2 * Math.sqrt(K);
  const sub = 3;
  const h = dt / sub;
  for (let s = 0; s < sub; s++) {
    const acc = -K * (state.x - state.g) - C * state.v;
    state.v += acc * h;
    state.x += state.v * h;
  }

  if (state.trip && Math.abs(state.x - goal) < 0.02) {
    state.trip = false;
  }

  const settled =
    !state.trip &&
    Math.abs(state.x - goal) <= 0.0006 &&
    Math.abs(state.g - goal) <= 0.0006 &&
    Math.abs(state.v) <= 0.0006;

  if (settled) {
    state.x = goal;
    state.g = goal;
    state.v = 0;
  }

  return { settled };
}

export function computeClassicPose(
  state: ClassicBodyState,
  W: number,
  isMobile: boolean,
  still: boolean,
  useBlur: boolean
): ClassicPose {
  const ax = isMobile ? 0.3 : 0.4;
  const ay = isMobile ? 22 : 36;
  const sx = isMobile ? 0.32 : 0.125;
  const sy = isMobile ? 22 : 58;
  const sr = 0.76;
  const ex = isMobile ? 0.55 : 0.38;
  const d = isMobile ? 4 : 5;

  let k = state.x;
  let e = -1;

  if (state.trip) {
    const span = Math.abs(state.goal - state.from);
    const u = span > 0.0001 ? clamp(Math.abs(state.x - state.from) / span, 0, 1) : 1;
    if (state.goal > state.from) {
      if (u < 0.5) {
        e = 2 * u * 1.4;
      } else {
        k = state.goal + 2 * (1 - u);
      }
    } else {
      if (u < 0.5) {
        k = state.from + 2 * u;
      } else {
        e = 2 * (1 - u) * 1.4;
      }
    }
  } else if (k < 0) {
    e = Math.min(-k, 1.4);
  }

  if (e >= 0) {
    return {
      x: W * (ax - ex * e),
      bottom: ay - 22 * e,
      scale: 1 + 0.14 * e,
      opacity: Math.max(0, 1 - 1.05 * e),
      blur: useBlur ? 4 * Math.min(e, 1) : 0,
      z: 1100,
      k,
      e,
    };
  }

  const x = W * (ax + sx * k);
  const bottom = ay + sy * k;
  const scale = Math.pow(sr, k);
  let opacity =
    k <= d - 1 ? 1 - 0.13 * k : Math.max(0, (1 - 0.13 * (d - 1)) * (d - k));
  if (still && Math.abs(k) < 0.02) {
    opacity = 0;
  }
  const blur = useBlur ? Math.min(0.9 * k, 3.2) : 0;
  const z = 1000 - Math.round(10 * k);

  return { x, bottom, scale, opacity, blur, z, k, e };
}

export function findLastOpaqueRow(
  rgbaData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 40
): number {
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgbaData[rowOffset + x * 4 + 3] > alphaThreshold) {
        return y;
      }
    }
  }
  return height - 1;
}

export function computeFootOffset(
  rgbaData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 40
): number {
  if (width <= 0 || height <= 0) return 0;
  const lastRow = findLastOpaqueRow(rgbaData, width, height, alphaThreshold);
  return clamp((height - 1 - lastRow) / height, 0, 0.4);
}

export function shortestLoopDelta(targetIndex: number, currentIndex: number, count: number): number {
  let d = wrapN(targetIndex - currentIndex, count);
  if (d > count / 2) d -= count;
  return d;
}

export function computeRingRank(bodyIndex: number, activeIndex: number, bodyCount: number): number {
  const half = bodyCount / 2;
  let r = wrapN(bodyIndex - activeIndex, bodyCount);
  if (r > half) r -= bodyCount;
  return r;
}
