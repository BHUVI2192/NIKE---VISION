import type { StylingBagController } from './bag';
import {
  clamp,
  computeClassicPose,
  computeFootOffset,
  computeFrameMetrics,
  computeRingRank,
  computeRingSlotPose,
  shortestLoopDelta,
  stepClassicBody,
  wrapN,
  type ClassicBodyState,
} from './math';

interface VariantDef {
  id: number;
  a: boolean;
  o: string[];
}

interface QueueBody {
  el: HTMLElement;
  lookIndex: number;
  artEl: HTMLElement;
  hitEl: HTMLButtonElement | null;
  w: number;
  lastBlur: string;
  classic: ClassicBodyState;
}

declare global {
  interface Window {
    __runwayBag?: StylingBagController;
    Shopify?: { designMode?: boolean };
  }
}

export class RunwaySection extends HTMLElement {
  private readonly lookCount = 6;
  private readonly bodyCount = 12;

  private bodies: QueueBody[] = [];
  private heroes: HTMLElement[] = [];
  private ticks: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];

  private stageEl!: HTMLElement;
  private actorsEl!: HTMLElement;
  private heroesEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private piecesLabelEl: HTMLElement | null = null;
  private liveEl: HTMLElement | null = null;
  private autoBtn: HTMLButtonElement | null = null;
  private cursorEl: HTMLElement | null = null;
  private lbEl: HTMLElement | null = null;
  private lbStageEl: HTMLElement | null = null;
  private lbKickerEl: HTMLElement | null = null;
  private lbNameEl: HTMLElement | null = null;
  private lbCloseBtn: HTMLButtonElement | null = null;

  private index = 0;
  private target = 0;
  private cur = 0;
  private vel = 0;
  private still = false;

  private isMobile = false;
  private mode: 'ring' | 'classic' = 'ring';
  private fs = 1.08;
  private stageW = 0;
  private stageH = 0;
  private unit = 300;
  private lastW = 0;
  private lastVh = 0;

  private reducedMotion = false;
  private visible = true;
  private playing = false;
  private engaged = false;
  private panelHover = false;
  private zoomed = false;
  private dragging = false;
  private suppressClickUntil = 0;

  private rafId: number | null = null;
  private lastFrameTs = 0;
  private autoTimer: number | null = null;
  private resizeTimer: number | null = null;
  private lbCleanupTimer: number | null = null;
  private wheelLockUntil = 0;
  private wheelAcc = 0;

  private cursorRafId: number | null = null;
  private cursorTx = 0;
  private cursorTy = 0;
  private cursorX = 0;
  private cursorY = 0;
  private cursorInited = false;

  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTarget = 0;
  private dragAbandoned = false;
  private dragSamples: Array<{ x: number; t: number }> = [];

  private sheetHost: HTMLDivElement | null = null;
  private activeSheetCard: HTMLElement | null = null;
  private activeSheetOrigin: HTMLElement | null = null;

  private visObserver: IntersectionObserver | null = null;
  private introObserver: IntersectionObserver | null = null;
  private stageResizeObserver: ResizeObserver | null = null;
  private cleanups: Array<() => void> = [];
  private initialized = false;

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.classList.add('rw--js');

    this.stageEl = this.querySelector('[data-rw-stage]') as HTMLElement;
    this.actorsEl = this.querySelector('[data-rw-actors]') as HTMLElement;
    this.heroesEl = this.querySelector('[data-rw-heroes]') as HTMLElement;
    this.panelEl = this.querySelector('.rw__panel') as HTMLElement;
    this.piecesLabelEl = this.querySelector('[data-rw-pieces]');
    this.liveEl = this.querySelector('[data-rw-live]');
    this.autoBtn = this.querySelector('[data-rw-auto]');
    this.cursorEl = this.querySelector('[data-rw-cursor]');
    this.lbEl = this.querySelector('[data-rw-lb]');
    this.lbStageEl = this.querySelector('[data-rw-lb-stage]');
    this.lbKickerEl = this.querySelector('[data-rw-lb-kicker]');
    this.lbNameEl = this.querySelector('[data-rw-lb-name]');
    this.lbCloseBtn = this.querySelector('[data-rw-zoom-close]');

    this.heroes = Array.from(this.querySelectorAll('[data-rw-hero]'));
    this.ticks = Array.from(this.querySelectorAll('[data-rw-tick]'));
    this.panels = Array.from(this.querySelectorAll('[data-rw-panel]'));

    this.setupBodies();
    this.setupImagesAndFeet();
    this.initCards();
    this.setupCursor();
    this.setupObservers();
    this.bindEvents();

    const startOffset = this.reducedMotion ? 0 : 1.15;
    this.target = 0;
    this.cur = -startOffset;
    this.vel = 0;
    for (let a = 0; a < this.bodies.length; a++) {
      const b = this.bodies[a];
      const goal = wrapN(a - this.target, this.bodyCount);
      b.classic = {
        x: goal + startOffset,
        v: 0,
        g: goal + startOffset,
        goal,
        from: goal,
        trip: false,
      };
    }

    this.lastW = window.innerWidth;
    this.lastVh = window.innerHeight;
    this.measure();
    this.setIndex(0, true);
    this.setStill(this.reducedMotion);
    this.renderAll();

    if (this.reducedMotion) {
      this.classList.add('is-revealed');
    } else {
      this.kick();
    }

    if (
      this.dataset.autoplay === 'true' &&
      !this.reducedMotion &&
      !window.Shopify?.designMode
    ) {
      this.play(true);
    }

    if (window.Shopify?.designMode) {
      this.classList.add('rw--design');
    }
  }

  disconnectedCallback(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.cursorRafId !== null) cancelAnimationFrame(this.cursorRafId);
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    if (this.lbCleanupTimer !== null) window.clearTimeout(this.lbCleanupTimer);

    this.visObserver?.disconnect();
    this.introObserver?.disconnect();
    this.stageResizeObserver?.disconnect();

    for (const fn of this.cleanups) fn();
    this.cleanups = [];

    this.dockAllSheets();
    if (this.sheetHost) {
      this.sheetHost.remove();
      this.sheetHost = null;
    }
  }

  private setupBodies(): void {
    const originals = Array.from(this.actorsEl.querySelectorAll('[data-rw-model]')) as HTMLElement[];
    for (let i = 0; i < originals.length; i++) {
      const clone = originals[i].cloneNode(true) as HTMLElement;
      clone.setAttribute('data-rw-clone', '');
      clone.querySelectorAll('img').forEach((img) => {
        img.setAttribute('loading', 'lazy');
      });
      this.actorsEl.appendChild(clone);
    }

    const allModels = Array.from(this.actorsEl.querySelectorAll('[data-rw-model]')) as HTMLElement[];
    this.bodies = allModels.map((el, a) => {
      const lookIndex = Number(el.dataset.index ?? a % this.lookCount);
      return {
        el,
        lookIndex,
        artEl: el.querySelector('.rw__art') as HTMLElement,
        hitEl: el.querySelector('.rw__hit') as HTMLButtonElement | null,
        w: 0,
        lastBlur: '',
        classic: { x: a, v: 0, g: a, goal: a, from: a, trip: false },
      };
    });
  }

  private setupImagesAndFeet(): void {
    const markDecoded = (img: HTMLImageElement) => {
      img.classList.add('is-decoded');
    };

    this.querySelectorAll<HTMLImageElement>('[data-model-image]').forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        markDecoded(img);
      } else if (typeof img.decode === 'function') {
        img.decode().then(() => markDecoded(img)).catch(() => {
          if (img.naturalWidth > 0) {
            markDecoded(img);
          } else {
            img.addEventListener('load', () => markDecoded(img), { once: true });
          }
        });
      } else {
        img.addEventListener('load', () => markDecoded(img), { once: true });
      }
    });

    // Feet detection from hero data-probe
    this.heroes.forEach((hero, lookIdx) => {
      const probeUrl = hero.getAttribute('data-probe');
      if (!probeUrl) return;
      const probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = () => {
        try {
          const w = 48;
          const h = Math.max(1, Math.round((48 * probe.naturalHeight) / Math.max(1, probe.naturalWidth)));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(probe, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const foot = computeFootOffset(data, w, h, 40);
          const val = foot.toFixed(4);
          hero.style.setProperty('--rw-foot', val);
          for (const b of this.bodies) {
            if (b.lookIndex === lookIdx) {
              b.el.style.setProperty('--rw-foot', val);
            }
          }
        } catch {
          // Tainted canvas or CORS error: silently keep offset 0
        }
      };
      probe.src = probeUrl;
    });
  }

  private initCards(): void {
    this.querySelectorAll<HTMLElement>('.rw__item').forEach((card) => {
      this.syncCardOptions(card, false);
    });
  }

  private getVariants(card: HTMLElement): VariantDef[] {
    const script = card.querySelector<HTMLScriptElement>('script[data-rw-variants]');
    if (!script) return [];
    try {
      const parsed = JSON.parse(script.textContent || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private syncCardOptions(card: HTMLElement, isUserChange: boolean): void {
    const picker = card.querySelector<HTMLElement>('[data-rw-picker]') || this.getDetachedPickerForCard(card);
    if (!picker) return;
    const variants = this.getVariants(card);
    const radios = Array.from(picker.querySelectorAll<HTMLInputElement>('input[type="radio"][data-rw-option]'));
    if (radios.length === 0) return;

    const checked = radios.find((r) => r.checked) || radios[0];
    const selectedOpt = checked.value;

    const match = variants.find((v) => v.o[0] === selectedOpt && v.a);
    const anyMatch = variants.find((v) => v.o[0] === selectedOpt);

    for (const r of radios) {
      const pill = r.closest('.rw__pill');
      const avail = variants.some((v) => v.o[0] === r.value && v.a);
      pill?.classList.toggle('is-unavailable', !avail);
    }

    const confirmBtn = picker.querySelector<HTMLButtonElement>('[data-rw-confirm]');
    const confirmLabel = picker.querySelector<HTMLElement>('[data-rw-confirm-label]');
    if (match) {
      card.dataset.selected = String(match.id);
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmLabel) confirmLabel.textContent = confirmLabel.dataset.add || 'Add to bag';
    } else if (anyMatch && !anyMatch.a) {
      delete card.dataset.selected;
      if (confirmBtn) confirmBtn.disabled = true;
      if (confirmLabel) confirmLabel.textContent = this.dataset.msgSoldout || 'Sold out';
    } else {
      delete card.dataset.selected;
      if (confirmBtn) confirmBtn.disabled = true;
      if (confirmLabel) confirmLabel.textContent = this.dataset.msgSoldout || 'Sold out';
    }

    if (isUserChange) {
      card.dataset.touched = '1';
    }
  }

  private getDetachedPickerForCard(card: HTMLElement): HTMLElement | null {
    if (this.activeSheetCard === card && this.sheetHost) {
      return this.sheetHost.querySelector<HTMLElement>('[data-rw-picker]');
    }
    return null;
  }

  private measure(): void {
    const wasMobile = this.isMobile;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w !== this.lastW || Math.abs(h - this.lastVh) >= 160) {
      this.lastW = w;
      this.lastVh = h;
    }
    this.isMobile = w <= 749;
    this.mode = this.isMobile
      ? ((this.dataset.mstyle as 'ring' | 'classic') || 'classic')
      : ((this.dataset.style as 'ring' | 'classic') || 'ring');

    if (wasMobile && !this.isMobile) {
      this.dockAllSheets();
    }

    let headerHeight = 0;
    document
      .querySelectorAll<HTMLElement>(
        '.shopify-section-group-header-group, #shopify-section-header, #shopify-section-announcement-bar'
      )
      .forEach((el) => {
        if (el.contains(this)) return;
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && getComputedStyle(el).display !== 'none') {
          headerHeight += rect.height;
        }
      });

    const mheightVh = Number(this.dataset.mheightVh || 109);
    const frameOnly = computeFrameMetrics({
      isMobile: this.isMobile,
      style: this.mode,
      innerHeight: this.lastVh,
      headerHeight,
      mheightVh,
      stageW: this.stageEl.clientWidth || w,
      stageH: this.stageEl.clientHeight || 500,
    });

    this.style.setProperty('--rw-frame-h', `${frameOnly.frameH}px`);

    const rect = this.stageEl.getBoundingClientRect();
    this.stageW = rect.width || this.stageEl.clientWidth || w;
    this.stageH = rect.height || this.stageEl.clientHeight || 500;

    const metrics = computeFrameMetrics({
      isMobile: this.isMobile,
      style: this.mode,
      innerHeight: this.lastVh,
      headerHeight,
      mheightVh,
      stageW: this.stageW,
      stageH: this.stageH,
    });

    this.fs = metrics.fs;
    this.style.setProperty('--rw-ax', `${metrics.axPct.toFixed(2)}%`);
    this.stageEl.style.setProperty('--rw-model-h', `${metrics.modelH}px`);
    this.stageEl.style.setProperty('--rw-hx', `${metrics.hx}px`);
    this.stageEl.style.setProperty('--rw-hy', `${metrics.hy}px`);
    this.stageEl.style.setProperty('--rw-fs', `${metrics.fs}`);

    this.unit =
      this.mode === 'ring'
        ? Math.max(this.isMobile ? 90 : 120, 0.3 * this.stageW)
        : Math.max(90, this.stageW * 0.32 * 1.6);

    for (const b of this.bodies) {
      b.w = b.el.offsetWidth || Math.round(metrics.modelH * 0.5625);
    }

    if (this.zoomed) {
      this.sizeLightboxModel();
    }
  }

  private setStill(val: boolean): void {
    if (this.still === val) return;
    this.still = val;
    this.classList.toggle('rw--still', val);
  }

  private put(
    b: QueueBody,
    x: number,
    bottom: number,
    scale: number,
    opacity: number,
    blur: number,
    z: number
  ): void {
    let op = opacity;
    const halfW = (b.w * scale) / 2;
    if (x + halfW < -4 || x - halfW > this.stageW + 4) {
      op = 0;
    }

    b.el.style.transform = `translate3d(${x.toFixed(2)}px, ${(-bottom).toFixed(2)}px, 0) translateX(-50%) scale(${scale.toFixed(4)})`;
    b.el.style.opacity = op.toFixed(3);
    b.el.style.zIndex = String(z);
    b.el.style.visibility = op < 0.01 ? 'hidden' : '';
    b.el.style.pointerEvents = op < 0.5 ? 'none' : '';

    const roundedBlur = Math.round(blur * 10) / 10;
    const blurStr = roundedBlur <= 0.05 ? '' : `blur(${roundedBlur.toFixed(1)}px)`;
    if (blurStr !== b.lastBlur) {
      b.lastBlur = blurStr;
      b.el.style.filter = blurStr;
    }
  }

  private renderAll(): void {
    const useBlur = this.dataset.blur !== 'false';
    const W = this.stageW;
    const H = this.stageH;
    if (W <= 0 || H <= 0) return;

    if (this.mode === 'ring') {
      for (let a = 0; a < this.bodies.length; a++) {
        const b = this.bodies[a];
        const pose = computeRingSlotPose({
          bodyIndex: a,
          bodyCount: this.bodyCount,
          cur: this.cur,
          W,
          H,
          fs: this.fs,
          still: this.still,
          isMobile: this.isMobile,
          useBlur,
        });
        this.put(b, pose.x, pose.bottom, pose.scale, pose.opacity, pose.blur, pose.z);
      }
    } else {
      for (let a = 0; a < this.bodies.length; a++) {
        const b = this.bodies[a];
        const pose = computeClassicPose(b.classic, W, this.isMobile, this.still, useBlur);
        this.put(b, pose.x, pose.bottom, pose.scale, pose.opacity, pose.blur, pose.z);
      }
    }
  }

  private kick(): void {
    if (!this.visible || document.hidden) return;
    if (this.rafId !== null) return;
    this.lastFrameTs = 0;
    this.rafId = requestAnimationFrame(this.tickFrame);
  }

  private tickFrame = (ts: number): void => {
    this.rafId = null;
    if (!this.visible || document.hidden) return;

    const dt = this.lastFrameTs === 0 ? 1 / 60 : Math.min(0.034, (ts - this.lastFrameTs) / 1000);
    this.lastFrameTs = ts;

    let settled = true;

    if (this.mode === 'ring') {
      if (this.reducedMotion) {
        this.cur = this.target;
        this.vel = 0;
      } else {
        const K = 95;
        const C = 2 * Math.sqrt(K);
        const sub = 3;
        const h = dt / sub;
        for (let s = 0; s < sub; s++) {
          const acc = -K * (this.cur - this.target) - C * this.vel;
          this.vel += acc * h;
          this.cur += this.vel * h;
        }
        if (
          !this.dragging &&
          Math.abs(this.cur - this.target) <= 0.0005 &&
          Math.abs(this.vel) <= 0.0005
        ) {
          this.cur = this.target;
          this.vel = 0;
        } else {
          settled = false;
        }
      }
    } else {
      for (let a = 0; a < this.bodies.length; a++) {
        const b = this.bodies[a];
        const goal = wrapN(a - this.target, this.bodyCount);
        const res = stepClassicBody(
          b.classic,
          goal,
          this.bodyCount,
          dt,
          this.dragging,
          this.reducedMotion
        );
        if (!res.settled) settled = false;
      }
      if (this.dragging) settled = false;
    }

    if (settled && !this.dragging) {
      this.setStill(true);
      this.renderAll();
      return;
    }

    this.setStill(false);
    this.renderAll();
    this.rafId = requestAnimationFrame(this.tickFrame);
  };

  private setIndex(i: number, silent = false): void {
    const nextIdx = wrapN(i, this.lookCount);
    const prevIdx = this.index;
    this.index = nextIdx;
    this.kick();

    // Queue body accessibility
    const maxRank = this.mode === 'ring' ? 2 : 3;
    const baseTarget = Math.round(this.target);
    for (let a = 0; a < this.bodies.length; a++) {
      const b = this.bodies[a];
      const rank =
        this.mode === 'ring'
          ? computeRingRank(a, wrapN(baseTarget, this.bodyCount), this.bodyCount)
          : wrapN(a - baseTarget, this.bodyCount);
      const reachable = rank !== 0 && Math.abs(rank) <= maxRank;
      if (reachable) {
        b.el.removeAttribute('aria-hidden');
        if (b.hitEl) b.hitEl.tabIndex = 0;
      } else {
        b.el.setAttribute('aria-hidden', 'true');
        if (b.hitEl) b.hitEl.tabIndex = -1;
      }
    }

    this.style.setProperty('--rw-progress', ((nextIdx + 1) / this.lookCount).toFixed(3));

    if (!silent) {
      if (this.zoomed) this.closeZoom();
      if (this.isMobile) this.dockAllSheets();

      this.heroes.forEach((hero, idx) => {
        const isNew = idx === nextIdx;
        const wasOld = idx === prevIdx && idx !== nextIdx;
        hero.classList.toggle('is-on', isNew);
        hero.classList.toggle('was', wasOld);
        hero.setAttribute('aria-hidden', isNew ? 'false' : 'true');
        const zoomBtn = hero.querySelector<HTMLButtonElement>('[data-rw-zoom]');
        if (zoomBtn) zoomBtn.tabIndex = isNew ? 0 : -1;
      });

      if (!this.reducedMotion) {
        this.stageEl.classList.remove('is-sweep');
        void this.stageEl.offsetWidth;
        this.stageEl.classList.add('is-sweep');
      }

      const activeHero = this.heroes[nextIdx];
      if (this.liveEl && activeHero) {
        this.liveEl.textContent = activeHero.dataset.label || '';
      }

      this.ticks.forEach((tick, idx) => {
        tick.setAttribute('aria-current', idx === nextIdx ? 'true' : 'false');
        tick.classList.toggle('is-past', idx < nextIdx);
      });

      this.panels.forEach((panel, idx) => {
        const active = idx === nextIdx;
        panel.hidden = !active;
        panel.classList.remove('is-in');
      });
      const activePanel = this.panels[nextIdx];
      if (activePanel) {
        void activePanel.offsetWidth;
        activePanel.classList.add('is-in');

        const tpl = activePanel.querySelector<HTMLTemplateElement>('template[data-rw-pieces-text]');
        if (this.piecesLabelEl && tpl) {
          this.piecesLabelEl.textContent = tpl.content.textContent || '';
          this.piecesLabelEl.classList.remove('is-swap');
          void this.piecesLabelEl.offsetWidth;
          this.piecesLabelEl.classList.add('is-swap');
        }
      }

      this.clearHot();
    } else {
      this.heroes.forEach((hero, idx) => {
        const isNew = idx === nextIdx;
        hero.classList.toggle('is-on', isNew);
        hero.setAttribute('aria-hidden', isNew ? 'false' : 'true');
        const zoomBtn = hero.querySelector<HTMLButtonElement>('[data-rw-zoom]');
        if (zoomBtn) zoomBtn.tabIndex = isNew ? 0 : -1;
      });
      this.ticks.forEach((tick, idx) => {
        tick.setAttribute('aria-current', idx === nextIdx ? 'true' : 'false');
        tick.classList.toggle('is-past', idx < nextIdx);
      });
      const activePanel = this.panels[nextIdx];
      const tpl = activePanel?.querySelector<HTMLTemplateElement>('template[data-rw-pieces-text]');
      if (this.piecesLabelEl && tpl) {
        this.piecesLabelEl.textContent = tpl.content.textContent || '';
      }
    }

    this.restartBar();
  }

  public moveTo(T: number): void {
    this.target = T;
    this.setStill(false);
    this.setIndex(wrapN(Math.round(T), this.lookCount), false);
    this.kick();
  }

  public next(): void {
    this.moveTo(Math.round(this.target) + 1);
  }

  public prev(): void {
    this.moveTo(Math.round(this.target) - 1);
  }

  public go(i: number): void {
    const d = shortestLoopDelta(i, this.index, this.lookCount);
    this.moveTo(Math.round(this.target) + d);
  }

  private play(on: boolean): void {
    this.playing = on;
    this.classList.toggle('is-playing', on);
    if (this.autoBtn) {
      this.autoBtn.classList.toggle('is-playing', on);
      this.autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (on) {
      this.restartBar();
    } else {
      if (this.autoTimer !== null) {
        window.clearTimeout(this.autoTimer);
        this.autoTimer = null;
      }
      this.ticks.forEach((t) => t.classList.remove('is-run'));
    }
  }

  private restartBar(): void {
    if (this.autoTimer !== null) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    this.ticks.forEach((t) => t.classList.remove('is-run'));
    if (!this.playing) return;

    const currentTick = this.ticks[this.index];
    if (currentTick) {
      void currentTick.offsetWidth;
      currentTick.classList.add('is-run');
    }

    const speed = Math.max(1000, Number(this.dataset.speed || 5000));
    this.autoTimer = window.setTimeout(() => {
      if (
        this.playing &&
        this.visible &&
        !this.dragging &&
        !document.hidden &&
        !this.panelHover &&
        !this.zoomed &&
        !this.engaged
      ) {
        this.next();
      } else if (this.playing) {
        this.restartBar();
      }
    }, speed);
  }

  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.play(false);
  }

  private setupObservers(): void {
    this.visObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.visible = entry.isIntersecting;
          if (this.visible) {
            this.kick();
            if (this.playing) this.restartBar();
          }
        }
      },
      { threshold: 0 }
    );
    this.visObserver.observe(this);

    if (!this.reducedMotion) {
      this.introObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            this.introObserver?.disconnect();
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                this.classList.add('is-revealed');
                this.kick();
              });
            });
          }
        },
        { threshold: 0, rootMargin: '0px 0px -22% 0px' }
      );
      this.introObserver.observe(this);
    }

    this.stageResizeObserver = new ResizeObserver(() => {
      this.measure();
      this.renderAll();
    });
    this.stageResizeObserver.observe(this.stageEl);
  }

  private setupCursor(): void {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) {
      this.cursorEl?.remove();
      this.cursorEl = null;
      return;
    }

    this.classList.add('rw--cursor');

    const stepCursor = () => {
      this.cursorRafId = null;
      if (!this.cursorEl) return;
      const factor = this.reducedMotion ? 1 : 0.18;
      this.cursorX += (this.cursorTx - this.cursorX) * factor;
      this.cursorY += (this.cursorTy - this.cursorY) * factor;
      this.cursorEl.style.transform = `translate3d(${this.cursorX.toFixed(1)}px, ${this.cursorY.toFixed(1)}px, 0)`;

      if (
        Math.abs(this.cursorTx - this.cursorX) >= 0.2 ||
        Math.abs(this.cursorTy - this.cursorY) >= 0.2
      ) {
        this.cursorRafId = requestAnimationFrame(stepCursor);
      }
    };

    const onStagePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !this.cursorEl) return;
      const rect = this.stageEl.getBoundingClientRect();
      this.cursorTx = e.clientX - rect.left;
      this.cursorTy = e.clientY - rect.top;

      if (!this.cursorInited) {
        this.cursorInited = true;
        this.cursorX = this.cursorTx;
        this.cursorY = this.cursorTy;
        this.cursorEl.style.transform = `translate3d(${this.cursorX.toFixed(1)}px, ${this.cursorY.toFixed(1)}px, 0)`;
        this.cursorEl.classList.add('is-on');
      }

      const targetEl = e.target as HTMLElement | null;
      const overZoom = Boolean(targetEl?.closest('.rw__hero.is-on .rw__zoom')) && !this.dragging;
      const overLink = Boolean(targetEl?.closest('.rw__pin, .rw__hit')) && !this.dragging;
      this.cursorEl.classList.toggle('is-view', overZoom);
      this.cursorEl.classList.toggle('is-link', overLink);

      if (this.cursorRafId === null) {
        this.cursorRafId = requestAnimationFrame(stepCursor);
      }
    };

    const onStagePointerLeave = () => {
      this.cursorInited = false;
      this.cursorEl?.classList.remove('is-on', 'is-link', 'is-view');
    };

    this.stageEl.addEventListener('pointermove', onStagePointerMove);
    this.stageEl.addEventListener('pointerleave', onStagePointerLeave);
    this.cleanups.push(() => {
      this.stageEl.removeEventListener('pointermove', onStagePointerMove);
      this.stageEl.removeEventListener('pointerleave', onStagePointerLeave);
    });
  }

  private bindEvents(): void {
    const onResize = () => {
      if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.measure();
        this.renderAll();
      }, 120);
    };
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    const onVisibility = () => {
      if (!document.hidden) {
        this.kick();
        if (this.playing) this.restartBar();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Panel hover pauses autoplay timer
    const onPanelEnter = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') this.panelHover = true;
    };
    const onPanelLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        this.panelHover = false;
        if (this.playing) this.restartBar();
      }
    };
    this.panelEl.addEventListener('pointerenter', onPanelEnter);
    this.panelEl.addEventListener('pointerleave', onPanelLeave);
    this.cleanups.push(() => {
      this.panelEl.removeEventListener('pointerenter', onPanelEnter);
      this.panelEl.removeEventListener('pointerleave', onPanelLeave);
    });

    // Panel interactions engage & hot-link
    const onPanelClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select, label')) {
        this.engage();
      }
    };
    const onPanelChange = (e: Event) => {
      this.engage();
      const input = e.target as HTMLElement | null;
      const card = input?.closest<HTMLElement>('.rw__item');
      if (card) this.syncCardOptions(card, true);
    };
    const onPanelOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rw__item');
      if (card?.dataset.rwCard) {
        this.hot(Number(card.dataset.rwCard), false);
      }
    };
    const onPanelOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rw__item');
      if (!card) return;
      const rel = e.relatedTarget as Node | null;
      if (!rel || !card.contains(rel)) {
        this.clearHot();
      }
    };
    this.panelEl.addEventListener('click', onPanelClick);
    this.panelEl.addEventListener('change', onPanelChange);
    this.panelEl.addEventListener('pointerover', onPanelOver);
    this.panelEl.addEventListener('pointerout', onPanelOut);
    this.cleanups.push(() => {
      this.panelEl.removeEventListener('click', onPanelClick);
      this.panelEl.removeEventListener('change', onPanelChange);
      this.panelEl.removeEventListener('pointerover', onPanelOver);
      this.panelEl.removeEventListener('pointerout', onPanelOut);
    });

    // Pointer drag / swipe on stage
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest('[data-rw-pin]')) return;
      this.dragPointerId = e.pointerId;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartTarget = this.target;
      this.dragAbandoned = false;
      this.dragSamples = [{ x: e.clientX, t: performance.now() }];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.dragPointerId !== e.pointerId || this.dragAbandoned) return;
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        this.finishDrag(e);
        return;
      }
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;

      if (!this.dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          this.dragAbandoned = true;
          this.dragPointerId = null;
          return;
        }
        if (Math.abs(dx) > 8 && Math.abs(dx) > 1.2 * Math.abs(dy)) {
          this.dragging = true;
          this.classList.add('is-dragging');
          this.setStill(false);
          try {
            this.stageEl.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        } else {
          return;
        }
      }

      this.dragSamples.push({ x: e.clientX, t: performance.now() });
      if (this.dragSamples.length > 6) this.dragSamples.shift();

      this.target = this.dragStartTarget - dx / this.unit;
      this.kick();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.dragPointerId !== e.pointerId) return;
      this.finishDrag(e);
    };

    this.stageEl.addEventListener('pointerdown', onPointerDown);
    this.stageEl.addEventListener('pointermove', onPointerMove);
    this.stageEl.addEventListener('pointerup', onPointerUp);
    this.stageEl.addEventListener('pointercancel', onPointerUp);
    this.cleanups.push(() => {
      this.stageEl.removeEventListener('pointerdown', onPointerDown);
      this.stageEl.removeEventListener('pointermove', onPointerMove);
      this.stageEl.removeEventListener('pointerup', onPointerUp);
      this.stageEl.removeEventListener('pointercancel', onPointerUp);
    });

    // Suppress click after drag
    const onCaptureClick = (e: MouseEvent) => {
      if (performance.now() < this.suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.stageEl.addEventListener('click', onCaptureClick, true);
    this.cleanups.push(() => this.stageEl.removeEventListener('click', onCaptureClick, true));

    // Trackpad horizontal wheel
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < this.wheelLockUntil) return;
      this.wheelAcc += e.deltaX;
      if (Math.abs(this.wheelAcc) > 45) {
        if (this.wheelAcc > 0) this.next();
        else this.prev();
        this.wheelAcc = 0;
        this.wheelLockUntil = now + 520;
      }
    };
    this.stageEl.addEventListener('wheel', onWheel, { passive: false });
    this.cleanups.push(() => this.stageEl.removeEventListener('wheel', onWheel));

    // Keyboard navigation
    const onStageKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      }
    };
    this.stageEl.addEventListener('keydown', onStageKeyDown);
    this.cleanups.push(() => this.stageEl.removeEventListener('keydown', onStageKeyDown));

    const onSectionKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.activeSheetCard) {
          const trigger = this.activeSheetCard.querySelector<HTMLButtonElement>('[data-rw-add]');
          this.dockAllSheets();
          trigger?.focus();
        } else if (this.zoomed) {
          this.closeZoom();
        }
      }
    };
    this.addEventListener('keydown', onSectionKeyDown);
    this.cleanups.push(() => this.removeEventListener('keydown', onSectionKeyDown));

    // Delegated clicks on section
    const onClick = (e: MouseEvent) => {
      this.routeClick(e);
    };
    this.addEventListener('click', onClick);
    this.cleanups.push(() => this.removeEventListener('click', onClick));
  }

  private finishDrag(e: PointerEvent): void {
    const wasDragging = this.dragging;
    this.dragging = false;
    this.dragPointerId = null;
    this.classList.remove('is-dragging');
    try {
      if (this.stageEl.hasPointerCapture(e.pointerId)) {
        this.stageEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (!wasDragging) return;

    this.suppressClickUntil = performance.now() + 60;

    const first = this.dragSamples[0];
    const last = this.dragSamples[this.dragSamples.length - 1];
    const dt = last && first ? Math.max(1, last.t - first.t) : 1;
    const vx = last && first ? (last.x - first.x) / dt : 0; // px/ms
    const dx = e.clientX - this.dragStartX;
    const from = Math.round(this.dragStartTarget);
    const sign = -1;

    if (this.isMobile) {
      if (Math.abs(dx) > 30 || Math.abs(vx) > 0.3) {
        this.moveTo(from + sign * (dx > 0 ? 1 : -1));
      } else {
        this.moveTo(from);
      }
    } else {
      let i = Math.round(this.target + (sign * vx * 160) / this.unit);
      if (i === from && Math.abs(vx) > 0.3) {
        i = from + sign * (vx > 0 ? 1 : -1);
      }
      i = clamp(i, from - 2, from + 2);
      this.moveTo(i);
    }
  }

  private routeClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. pick-close
    if (target.closest('[data-rw-pick-close]')) {
      const originCard = this.activeSheetCard;
      this.dockAllSheets();
      originCard?.querySelector<HTMLButtonElement>('[data-rw-add]')?.focus();
      return;
    }

    // 2. popup close button
    if (target.closest('[data-rw-zoom-close]')) {
      this.closeZoom();
      return;
    }

    // 3. click on popup backdrop or stage beside model
    if (
      this.zoomed &&
      target.closest('[data-rw-lb]') &&
      !target.closest('.rw__lb-model') &&
      !target.closest('.rw__lb-top')
    ) {
      this.closeZoom();
      return;
    }

    // 4. [data-rw-zoom]
    if (target.closest('[data-rw-zoom]')) {
      this.openZoom();
      return;
    }

    // 5. next
    if (target.closest('[data-rw-next]')) {
      this.next();
      return;
    }

    // 6. prev
    if (target.closest('[data-rw-prev]')) {
      this.prev();
      return;
    }

    // 7. tick
    const tickBtn = target.closest<HTMLElement>('[data-rw-tick]');
    if (tickBtn) {
      this.go(Number(tickBtn.dataset.rwTick));
      return;
    }

    // 8. autoplay toggle
    if (target.closest('[data-rw-auto]')) {
      if (!this.playing) {
        this.engaged = false;
        this.play(true);
      } else {
        this.play(false);
      }
      return;
    }

    // 9. pin
    const pinBtn = target.closest<HTMLElement>('[data-rw-pin]');
    if (pinBtn) {
      this.engage();
      this.hot(Number(pinBtn.dataset.rwPin), true);
      return;
    }

    // 10. queue body [data-rw-go]
    const goBtn = target.closest<HTMLElement>('[data-rw-go]');
    if (goBtn) {
      const modelEl = goBtn.closest<HTMLElement>('[data-rw-model]');
      const bodyIndex = this.bodies.findIndex((b) => b.el === modelEl);
      if (bodyIndex >= 0) {
        const baseTarget = Math.round(this.target);
        const k =
          this.mode === 'ring'
            ? computeRingRank(bodyIndex, wrapN(baseTarget, this.bodyCount), this.bodyCount)
            : wrapN(bodyIndex - baseTarget, this.bodyCount);
        if (k === 0) {
          this.openZoom();
        } else if (Math.abs(k) < 6) {
          this.moveTo(baseTarget + k);
        }
      }
      return;
    }

    // 11. size confirm
    const confirmBtn = target.closest<HTMLElement>('[data-rw-confirm]');
    if (confirmBtn) {
      const picker = confirmBtn.closest<HTMLElement>('[data-rw-picker]');
      const card =
        picker?.closest<HTMLElement>('.rw__item') ||
        (this.activeSheetCard && this.sheetHost?.contains(picker || null)
          ? this.activeSheetCard
          : null);
      if (card) {
        this.handleConfirmAdd(card);
      }
      return;
    }

    // 12. plus button
    const addBtn = target.closest<HTMLElement>('[data-rw-add]');
    if (addBtn) {
      const card = addBtn.closest<HTMLElement>('.rw__item');
      if (card) this.togglePicker(card);
      return;
    }

    // 13. "add full look"
    const allBtn = target.closest<HTMLElement>('[data-rw-all]');
    if (allBtn) {
      const panel = allBtn.closest<HTMLElement>('[data-rw-panel]');
      if (panel) this.handleAddFullLook(panel);
    }
  }

  private clearHot(): void {
    this.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
  }

  private hot(n: number, scroll: boolean): void {
    this.clearHot();
    const pinContainer = this.zoomed ? this.lbStageEl : this.heroes[this.index];
    pinContainer?.querySelector(`[data-rw-pin="${n}"]`)?.classList.add('is-hot');

    const activePanel = this.panels[this.index];
    const card = activePanel?.querySelector<HTMLElement>(`[data-rw-card="${n}"]`);
    if (card) {
      card.classList.add('is-hot');
      if (scroll) {
        this.revealCard(card, activePanel);
      }
    }
  }

  private revealCard(card: HTMLElement, panel: HTMLElement): void {
    const list = panel.querySelector<HTMLElement>('.rw__items');
    if (!list) return;
    const behavior: ScrollBehavior = this.reducedMotion ? 'auto' : 'smooth';

    if (list.scrollWidth > list.clientWidth + 4) {
      const cardRect = card.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      list.scrollTo({
        left: list.scrollLeft + (cardRect.left - listRect.left) - 20,
        behavior,
      });
    } else if (list.scrollHeight > list.clientHeight + 4) {
      list.scrollTo({
        top: card.offsetTop - list.offsetTop - 12,
        behavior,
      });
    } else {
      const r = card.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight - 140) {
        window.scrollBy({
          top: r.top - 0.3 * window.innerHeight,
          behavior,
        });
      }
    }
  }

  private togglePicker(card: HTMLElement): void {
    if (card.classList.contains('is-added') || card.classList.contains('is-loading')) return;
    if (card.classList.contains('is-picking')) {
      this.closePicker(card);
    } else {
      this.openPicker(card, true);
    }
  }

  private openPicker(card: HTMLElement, focusRadio: boolean): void {
    if (card.classList.contains('is-added')) return;
    const addBtn = card.querySelector<HTMLButtonElement>('[data-rw-add]');

    if (this.isMobile) {
      this.dockAllSheets();
      const picker = card.querySelector<HTMLElement>('[data-rw-picker]');
      if (!picker) return;
      this.ensureSheetHost();
      if (!this.sheetHost) return;

      this.activeSheetCard = card;
      this.activeSheetOrigin = card;
      picker.hidden = false;
      this.sheetHost.appendChild(picker);
      this.classList.add('rw--picking');
      requestAnimationFrame(() => {
        this.sheetHost?.classList.add('is-open');
      });

      card.classList.add('is-picking');
      addBtn?.setAttribute('aria-expanded', 'true');

      if (focusRadio) {
        const checked =
          picker.querySelector<HTMLInputElement>('input[type="radio"]:checked') ||
          picker.querySelector<HTMLInputElement>('input[type="radio"]');
        checked?.focus({ preventScroll: true });
      }
    } else {
      const picker = card.querySelector<HTMLElement>('[data-rw-picker]');
      if (!picker) return;
      picker.hidden = false;
      card.classList.add('is-picking');
      addBtn?.setAttribute('aria-expanded', 'true');
      const panel = card.closest<HTMLElement>('[data-rw-panel]');
      if (panel) this.revealCard(card, panel);
      if (focusRadio) {
        const checked =
          picker.querySelector<HTMLInputElement>('input[type="radio"]:checked') ||
          picker.querySelector<HTMLInputElement>('input[type="radio"]');
        checked?.focus({ preventScroll: true });
      }
    }
  }

  private closePicker(card: HTMLElement): void {
    const addBtn = card.querySelector<HTMLButtonElement>('[data-rw-add]');
    if (this.activeSheetCard === card) {
      this.dockAllSheets();
      return;
    }
    const picker = card.querySelector<HTMLElement>('[data-rw-picker]');
    if (picker) picker.hidden = true;
    card.classList.remove('is-picking');
    addBtn?.setAttribute('aria-expanded', 'false');
  }

  private ensureSheetHost(): void {
    if (this.sheetHost) return;
    const host = document.createElement('div');
    host.className = 'rw-sheet-host';

    const cs = getComputedStyle(this);
    const props = [
      '--rw-panel',
      '--rw-text',
      '--rw-muted',
      '--rw-line',
      '--rw-accent',
      '--rw-on-accent',
      '--rw-btn-bg',
      '--rw-btn-fg',
      '--rw-btn-radius',
      '--rw-pill-radius',
      '--rw-bar-r',
      '--rw-thumb-radius',
      '--rw-pt-size',
      '--rw-price',
      '--rw-opt',
      '--rw-ease',
      '--rw-ease-sheet',
      '--rw-ease-spring',
    ];
    for (const p of props) {
      host.style.setProperty(p, cs.getPropertyValue(p));
    }
    host.style.fontFamily = cs.fontFamily;
    host.style.color = cs.color;

    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'rw__pick-scrim';
    scrim.setAttribute('data-rw-pick-close', '');
    scrim.tabIndex = -1;
    scrim.setAttribute('aria-hidden', 'true');
    host.appendChild(scrim);

    host.addEventListener('click', (e) => this.routeClick(e));
    host.addEventListener('change', (e) => {
      this.engage();
      if (this.activeSheetCard) {
        this.syncCardOptions(this.activeSheetCard, true);
      }
      void e;
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeSheetCard) {
        const trigger = this.activeSheetCard.querySelector<HTMLButtonElement>('[data-rw-add]');
        this.dockAllSheets();
        trigger?.focus();
      }
    });

    document.body.appendChild(host);
    this.sheetHost = host;
  }

  private dockAllSheets(): void {
    if (!this.sheetHost) return;
    this.sheetHost.classList.remove('is-open');
    this.classList.remove('rw--picking');
    const picker = this.sheetHost.querySelector<HTMLElement>('[data-rw-picker]');
    if (picker && this.activeSheetOrigin) {
      picker.hidden = true;
      this.activeSheetOrigin.appendChild(picker);
    }
    if (this.activeSheetCard) {
      this.activeSheetCard.classList.remove('is-picking');
      this.activeSheetCard
        .querySelector<HTMLButtonElement>('[data-rw-add]')
        ?.setAttribute('aria-expanded', 'false');
    }
    this.activeSheetCard = null;
    this.activeSheetOrigin = null;
  }

  private markCardAdded(card: HTMLElement): void {
    this.closePicker(card);
    card.classList.remove('is-loading', 'is-picking');
    card.classList.add('is-added');
    const addBtn = card.querySelector<HTMLButtonElement>('[data-rw-add]');
    if (addBtn) {
      addBtn.setAttribute('aria-label', addBtn.dataset.addedLabel || 'Added to bag');
      addBtn.removeAttribute('aria-expanded');
    }
  }

  private handleConfirmAdd(card: HTMLElement): void {
    if (card.classList.contains('is-added') || card.classList.contains('is-loading')) return;
    const panel = card.closest<HTMLElement>('[data-rw-panel]');
    const msgEl = panel?.querySelector<HTMLElement>('[data-rw-msg]');
    if (msgEl) msgEl.textContent = '';

    card.dataset.touched = '1';
    const selectedId = Number(card.dataset.selected || '');
    if (!Number.isSafeInteger(selectedId)) {
      if (msgEl) msgEl.textContent = this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
      return;
    }

    card.classList.add('is-loading');
    try {
      const bag = window.__runwayBag;
      if (!bag) throw new Error('Bag unavailable');
      bag.add([{ id: selectedId, quantity: 1 }]);
      this.markCardAdded(card);
      if (this.isMobile && !this.reducedMotion && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      if (panel) this.checkPanelComplete(panel);
    } catch {
      card.classList.remove('is-loading');
      if (msgEl) {
        msgEl.textContent = this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
      }
    }
  }

  private handleAddFullLook(panel: HTMLElement): void {
    if (panel.classList.contains('is-complete')) return;
    const cta = panel.querySelector<HTMLButtonElement>('[data-rw-all]');
    if (!cta || cta.classList.contains('is-loading')) return;

    const msgEl = panel.querySelector<HTMLElement>('[data-rw-msg]');
    if (msgEl) msgEl.textContent = '';

    const cards = Array.from(panel.querySelectorAll<HTMLElement>('.rw__item'));
    const unadded = cards.filter((c) => !c.classList.contains('is-added'));

    const ready: Array<{ card: HTMLElement; variantId: number }> = [];
    const pending: HTMLElement[] = [];

    for (const card of unadded) {
      const confirmBtn = card.querySelector<HTMLButtonElement>('[data-rw-confirm]');
      const detachedPicker = this.getDetachedPickerForCard(card);
      const isSoldOut =
        confirmBtn?.disabled ||
        detachedPicker?.querySelector<HTMLButtonElement>('[data-rw-confirm]')?.disabled;
      if (isSoldOut) continue;

      const directId = card.dataset.variantId ? Number(card.dataset.variantId) : NaN;
      const selectedId = card.dataset.selected ? Number(card.dataset.selected) : NaN;

      if (Number.isSafeInteger(directId)) {
        ready.push({ card, variantId: directId });
      } else if (card.dataset.touched === '1' && Number.isSafeInteger(selectedId)) {
        ready.push({ card, variantId: selectedId });
      } else {
        pending.push(card);
      }
    }

    if (ready.length > 0) {
      cta.classList.add('is-loading');
      ready.forEach((r) => r.card.classList.add('is-loading'));
      try {
        const bag = window.__runwayBag;
        if (!bag) throw new Error('Bag unavailable');
        bag.add(ready.map((r) => ({ id: r.variantId, quantity: 1 })));
        ready.forEach((r) => this.markCardAdded(r.card));
        if (this.isMobile && !this.reducedMotion && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
      } catch {
        ready.forEach((r) => r.card.classList.remove('is-loading'));
        if (msgEl) {
          msgEl.textContent = this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
        }
      } finally {
        cta.classList.remove('is-loading');
      }
    }

    if (pending.length > 0) {
      if (this.isMobile) {
        this.openPicker(pending[0], true);
      } else {
        pending.forEach((c, idx) => this.openPicker(c, idx === 0));
      }
      this.revealCard(pending[0], panel);
      const titles = pending.map((c) => c.dataset.title || '').filter(Boolean);
      if (msgEl) {
        const tpl = this.dataset.msgChoose || 'Pick a size for: [items]';
        msgEl.textContent = tpl.replace('[items]', titles.join(', '));
      }
    }

    this.checkPanelComplete(panel);
  }

  private checkPanelComplete(panel: HTMLElement): void {
    const cards = Array.from(panel.querySelectorAll<HTMLElement>('.rw__item'));
    if (cards.length >= 2 && cards.every((c) => c.classList.contains('is-added'))) {
      panel.classList.add('is-complete');
      const msgEl = panel.querySelector<HTMLElement>('[data-rw-msg]');
      if (msgEl) msgEl.textContent = '';
    }
  }

  private sizeLightboxModel(): void {
    if (!this.lbStageEl) return;
    const lbModel = this.lbStageEl.querySelector<HTMLElement>('.rw__lb-model');
    if (!lbModel) return;
    const stageRect = this.lbStageEl.getBoundingClientRect();
    const h = Math.max(160, Math.min(stageRect.height, stageRect.width / 0.5625));
    lbModel.style.setProperty('--rw-model-h', `${Math.round(h)}px`);
    const sizeAttr = `${Math.round(h * 0.5625)}px`;
    lbModel.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.sizes = sizeAttr;
    });
  }

  private openZoom(): void {
    if (this.zoomed || !this.lbEl || !this.lbStageEl) return;
    const activeHero = this.heroes[this.index];
    if (!activeHero) return;
    const heroFig = activeHero.querySelector<HTMLElement>('.rw__figure');
    const heroMorph = activeHero.querySelector<HTMLElement>('.rw__morph');
    if (!heroFig || !heroMorph) return;

    this.engage();
    this.clearHot();

    const a = heroFig.getBoundingClientRect();

    if (this.lbCleanupTimer !== null) {
      window.clearTimeout(this.lbCleanupTimer);
      this.lbCleanupTimer = null;
    }
    this.lbStageEl.replaceChildren();

    const wrapper = document.createElement('div');
    wrapper.className = 'rw__lb-model';

    const foot = activeHero.style.getPropertyValue('--rw-foot');
    if (foot) wrapper.style.setProperty('--rw-foot', foot);

    const clonedMorph = heroMorph.cloneNode(true) as HTMLElement;
    clonedMorph.querySelector('[data-rw-zoom]')?.remove();
    clonedMorph.querySelectorAll<HTMLButtonElement>('[data-rw-pin]').forEach((pin) => {
      pin.tabIndex = 0;
    });
    clonedMorph.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.loading = 'eager';
      img.classList.add('is-decoded');
    });

    wrapper.appendChild(clonedMorph);
    this.lbStageEl.appendChild(wrapper);
    this.sizeLightboxModel();

    const word = this.lbEl.dataset.word || 'Look';
    if (this.lbKickerEl) {
      this.lbKickerEl.textContent = `${word} ${String(this.index + 1).padStart(2, '0')}`;
    }
    if (this.lbNameEl) {
      this.lbNameEl.textContent = activeHero.dataset.name || '';
    }

    this.zoomed = true;
    this.classList.add('rw--zoom');
    this.lbEl.setAttribute('aria-hidden', 'false');

    const lbFig = wrapper.querySelector<HTMLElement>('.rw__figure');
    if (!this.reducedMotion && lbFig && a.height > 0) {
      const b = lbFig.getBoundingClientRect();
      if (b.height > 0) {
        wrapper.style.transition = 'none';
        wrapper.style.transformOrigin = '0 100%';
        wrapper.style.transform = `translate3d(${(a.left - b.left).toFixed(2)}px, ${(a.bottom - b.bottom).toFixed(2)}px, 0) scale(${(a.height / b.height).toFixed(4)})`;
        void wrapper.offsetWidth;
        wrapper.style.transition = '';
        wrapper.style.transform = '';
      }
    }

    this.lbCloseBtn?.focus({ preventScroll: true });
  }

  private closeZoom(): void {
    if (!this.zoomed || !this.lbEl || !this.lbStageEl) return;
    const focusInside = this.lbEl.contains(document.activeElement);
    this.zoomed = false;

    const wrapper = this.lbStageEl.querySelector<HTMLElement>('.rw__lb-model');
    const lbFig = wrapper?.querySelector<HTMLElement>('.rw__figure');
    const heroFig = this.heroes[this.index]?.querySelector<HTMLElement>('.rw__figure');

    if (!this.reducedMotion && wrapper && lbFig && heroFig) {
      const a = heroFig.getBoundingClientRect();
      const b = lbFig.getBoundingClientRect();
      if (a.height > 0 && b.height > 0) {
        wrapper.style.transformOrigin = '0 100%';
        wrapper.style.transform = `translate3d(${(a.left - b.left).toFixed(2)}px, ${(a.bottom - b.bottom).toFixed(2)}px, 0) scale(${(a.height / b.height).toFixed(4)})`;
      }
    }

    this.classList.remove('rw--zoom');
    this.lbEl.setAttribute('aria-hidden', 'true');

    if (this.lbCleanupTimer !== null) window.clearTimeout(this.lbCleanupTimer);
    this.lbCleanupTimer = window.setTimeout(
      () => {
        if (!this.zoomed) {
          this.lbStageEl?.replaceChildren();
        }
        this.lbCleanupTimer = null;
      },
      this.reducedMotion ? 0 : 950
    );

    if (focusInside) {
      this.stageEl.focus({ preventScroll: true });
    }
  }
}

if (!customElements.get('runway-section')) {
  customElements.define('runway-section', RunwaySection);
}
