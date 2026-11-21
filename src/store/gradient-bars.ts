export type GradientBarDirection = 'Y Axis' | 'X Axis';
export type GradientBarAnimationMode = 'Pulse' | 'Float' | 'Wave' | 'None';

export interface GradientBarsProps {
  numBars?: number;
  barWidth?: number;
  barHeight?: number;
  barDirection?: GradientBarDirection;
  gradientFrom?: string;
  gradientTo?: string;
  animationDuration?: number;
  animationEnabled?: boolean;
  animationMode?: GradientBarAnimationMode;
  animationIntensity?: number;
  stagger?: number;
  backgroundColor?: string;
  isStatic?: boolean;
}

export interface ResolvedGradientBarsProps {
  numBars: number;
  barWidth: number;
  barHeight: number;
  barDirection: GradientBarDirection;
  gradientFrom: string;
  gradientTo: string;
  animationDuration: number;
  animationEnabled: boolean;
  animationMode: GradientBarAnimationMode;
  animationIntensity: number;
  stagger: number;
  backgroundColor: string;
  isStatic: boolean;
}

export interface GradientBarSpec {
  index: number;
  flexBasis: string;
  minWidth?: string;
  minHeight?: string;
  width: string;
  height: string;
  background: string;
  opacity: number;
  animationName: string;
  animationDuration?: string;
  animationDelay?: string;
}

export interface GradientBarsPlan {
  isYAxis: boolean;
  shouldAnimate: boolean;
  keyframeName: string;
  translatePercent: number;
  pulseScale: number;
  minOpacity: number;
  maxOpacity: number;
  backgroundColor: string;
  bars: GradientBarSpec[];
}

export const DEFAULT_GRADIENT_BARS_PROPS: ResolvedGradientBarsProps = {
  numBars: 16,
  barWidth: 4,
  barHeight: 200,
  barDirection: 'Y Axis',
  gradientFrom: '#7C3AED',
  gradientTo: '#06B6D4',
  animationDuration: 5,
  animationEnabled: true,
  animationMode: 'Float',
  animationIntensity: 60,
  stagger: 0.08,
  backgroundColor: '#0B0B0F',
  isStatic: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveGradientBarsProps(
  input: GradientBarsProps = {}
): ResolvedGradientBarsProps {
  const numBars = Math.max(
    1,
    Math.min(80, Math.floor(input.numBars ?? DEFAULT_GRADIENT_BARS_PROPS.numBars))
  );
  const barWidth = clamp(
    input.barWidth ?? DEFAULT_GRADIENT_BARS_PROPS.barWidth,
    1,
    1000
  );
  const barHeight = clamp(
    input.barHeight ?? DEFAULT_GRADIENT_BARS_PROPS.barHeight,
    1,
    1000
  );
  const animationDuration = clamp(
    input.animationDuration ?? DEFAULT_GRADIENT_BARS_PROPS.animationDuration,
    1,
    20
  );
  const animationIntensity = clamp(
    input.animationIntensity ?? DEFAULT_GRADIENT_BARS_PROPS.animationIntensity,
    0,
    100
  );
  const stagger = clamp(
    input.stagger ?? DEFAULT_GRADIENT_BARS_PROPS.stagger,
    0,
    2
  );

  return {
    numBars,
    barWidth,
    barHeight,
    barDirection:
      input.barDirection === 'X Axis' ? 'X Axis' : 'Y Axis',
    gradientFrom:
      input.gradientFrom?.trim() || DEFAULT_GRADIENT_BARS_PROPS.gradientFrom,
    gradientTo:
      input.gradientTo?.trim() || DEFAULT_GRADIENT_BARS_PROPS.gradientTo,
    animationDuration,
    animationEnabled:
      input.animationEnabled ?? DEFAULT_GRADIENT_BARS_PROPS.animationEnabled,
    animationMode: input.animationMode ?? DEFAULT_GRADIENT_BARS_PROPS.animationMode,
    animationIntensity,
    stagger,
    backgroundColor:
      input.backgroundColor?.trim() || DEFAULT_GRADIENT_BARS_PROPS.backgroundColor,
    isStatic: Boolean(input.isStatic),
  };
}

export function buildGradientBarSpecs(
  input: GradientBarsProps = {}
): GradientBarsPlan {
  const props = resolveGradientBarsProps(input);
  const intensityFactor = props.animationIntensity / 100;
  const shouldAnimate =
    !props.isStatic &&
    props.animationEnabled &&
    props.animationMode !== 'None';
  const isYAxis = props.barDirection === 'Y Axis';

  const translatePercent = 4 + intensityFactor * 26;
  const pulseScale = 1 + intensityFactor * 0.35;
  const minOpacity = 0.15 + (1 - intensityFactor) * 0.35;
  const maxOpacity = Math.min(1, 0.35 + intensityFactor * 0.65);

  const keyframeName = isYAxis
    ? props.animationMode === 'Pulse'
      ? 'framerGradientBarsPulseY'
      : props.animationMode === 'Wave'
        ? 'framerGradientBarsWaveY'
        : 'framerGradientBarsFloatY'
    : props.animationMode === 'Pulse'
      ? 'framerGradientBarsPulseX'
      : props.animationMode === 'Wave'
        ? 'framerGradientBarsWaveX'
        : 'framerGradientBarsFloatX';

  const bars: GradientBarSpec[] = [];
  for (let index = 0; index < props.numBars; index += 1) {
    const delay = Number((props.stagger * index).toFixed(4));
    const baseOpacity = 0.25 + (index / props.numBars) * 0.5;
    const staticOpacity = Math.min(
      1,
      Math.max(baseOpacity, (minOpacity + maxOpacity) / 2)
    );
    bars.push({
      index,
      flexBasis: isYAxis ? `${props.barWidth}px` : `${props.barHeight}px`,
      minWidth: isYAxis ? `${props.barWidth}px` : undefined,
      minHeight: isYAxis ? undefined : `${props.barHeight}px`,
      width: isYAxis ? `${props.barWidth}px` : `min(100%, ${props.barWidth}px)`,
      height: isYAxis ? `min(100%, ${props.barHeight}px)` : `${props.barHeight}px`,
      background: `linear-gradient(${isYAxis ? '180deg' : '90deg'}, ${props.gradientFrom}, ${props.gradientTo})`,
      opacity: shouldAnimate ? baseOpacity : staticOpacity,
      animationName: shouldAnimate ? keyframeName : 'none',
      animationDuration: shouldAnimate ? `${props.animationDuration}s` : undefined,
      animationDelay: shouldAnimate ? `${delay}s` : undefined,
    });
  }

  return {
    isYAxis,
    shouldAnimate,
    keyframeName,
    translatePercent,
    pulseScale,
    minOpacity,
    maxOpacity,
    backgroundColor: props.backgroundColor,
    bars,
  };
}

function readDatasetProps(el: HTMLElement): GradientBarsProps {
  const num = (val: string | undefined): number | undefined => {
    if (val === undefined || val === '') return undefined;
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mode = el.dataset.animationMode as GradientBarAnimationMode | undefined;
  const dir = el.dataset.barDirection as GradientBarDirection | undefined;

  return {
    numBars: num(el.dataset.numBars),
    barWidth: num(el.dataset.barWidth),
    barHeight: num(el.dataset.barHeight),
    barDirection: dir === 'X Axis' ? 'X Axis' : 'Y Axis',
    gradientFrom: el.dataset.gradientFrom,
    gradientTo: el.dataset.gradientTo,
    animationDuration: num(el.dataset.animationDuration),
    animationEnabled:
      el.dataset.animationEnabled !== undefined
        ? el.dataset.animationEnabled !== 'false'
        : true,
    animationMode:
      mode === 'Pulse' || mode === 'Float' || mode === 'Wave' || mode === 'None'
        ? mode
        : undefined,
    animationIntensity: num(el.dataset.animationIntensity),
    stagger: num(el.dataset.stagger),
    backgroundColor: el.dataset.backgroundColor,
    isStatic: el.dataset.static === 'true' || reducedMotion,
  };
}

export function mountGradientBars(
  host: HTMLElement,
  overrideProps?: GradientBarsProps
): void {
  const merged = { ...readDatasetProps(host), ...overrideProps };
  const plan = buildGradientBarSpecs(merged);

  host.style.backgroundColor = plan.backgroundColor;

  let backdrop = host.querySelector<HTMLElement>('[data-gb-backdrop]');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'gb-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('data-gb-backdrop', '');
    host.prepend(backdrop);
  }

  backdrop.style.flexDirection = plan.isYAxis ? 'row' : 'column';
  backdrop.style.setProperty('--gb-translate', `${plan.translatePercent}%`);
  backdrop.style.setProperty('--gb-pulse-scale', String(plan.pulseScale));
  backdrop.style.setProperty('--gb-min-opacity', String(plan.minOpacity));
  backdrop.style.setProperty('--gb-max-opacity', String(plan.maxOpacity));

  const nodes = plan.bars.map((spec) => {
    const bar = document.createElement('div');
    bar.className = 'gb-bar';
    bar.style.flexGrow = '1';
    bar.style.flexShrink = '1';
    bar.style.flexBasis = spec.flexBasis;
    if (spec.minWidth) bar.style.minWidth = spec.minWidth;
    if (spec.minHeight) bar.style.minHeight = spec.minHeight;
    bar.style.width = spec.width;
    bar.style.height = spec.height;
    bar.style.background = spec.background;
    bar.style.opacity = String(spec.opacity);
    bar.style.transformOrigin = 'center center';

    if (plan.shouldAnimate && spec.animationDuration && spec.animationDelay) {
      bar.style.animationName = spec.animationName;
      bar.style.animationDuration = spec.animationDuration;
      bar.style.animationDelay = spec.animationDelay;
      bar.style.animationIterationCount = 'infinite';
      bar.style.animationTimingFunction = 'ease-in-out';
      bar.style.animationPlayState = 'running';
      bar.style.willChange = 'transform, opacity';
    } else {
      bar.style.animationName = 'none';
      bar.style.animationPlayState = 'paused';
    }
    return bar;
  });

  backdrop.replaceChildren(...nodes);
}

export function initGradientBars(): void {
  document.querySelectorAll<HTMLElement>('[data-gradient-bars]').forEach((host) => {
    mountGradientBars(host);
  });
}
