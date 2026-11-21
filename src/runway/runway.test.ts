import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_CATALOG } from './catalog';
import {
  computeClassicPose,
  computeFootOffset,
  computeFrameMetrics,
  computeRingRank,
  computeRingSlotPose,
  shortestLoopDelta,
  stepClassicBody,
  wrapN,
} from './math';
import {
  addItemsToBag,
  buildShortlistText,
  computeBagSummary,
  formatMoneyUSD,
  parseBagStorage,
  validateCatalog,
} from './bag';

test('wrapN wraps negative and positive indices cleanly', () => {
  assert.equal(wrapN(-1, 6), 5);
  assert.equal(wrapN(6, 6), 0);
  assert.equal(wrapN(13, 6), 1);
});

test('shortestLoopDelta picks shortest direction around 6-item ring', () => {
  assert.equal(shortestLoopDelta(1, 0, 6), 1);
  assert.equal(shortestLoopDelta(5, 0, 6), -1);
  assert.equal(shortestLoopDelta(0, 5, 6), 1);
  assert.equal(shortestLoopDelta(3, 0, 6), 3);
});

test('computeRingRank maps 12 bodies to signed range -5..6', () => {
  assert.equal(computeRingRank(0, 0, 12), 0);
  assert.equal(computeRingRank(1, 0, 12), 1);
  assert.equal(computeRingRank(11, 0, 12), -1);
  assert.equal(computeRingRank(6, 0, 12), 6);
  assert.equal(computeRingRank(7, 0, 12), -5);
});

test('computeFrameMetrics matches desktop ring and mobile classic specs', () => {
  const desktop = computeFrameMetrics({
    isMobile: false,
    style: 'ring',
    innerHeight: 900,
    headerHeight: 88,
    mheightVh: 109,
    stageW: 1060,
    stageH: 700,
  });
  assert.equal(desktop.frameH, 812);
  assert.equal(desktop.fs, 1.08);
  assert.equal(desktop.modelH, Math.round((700 - 34 - 18) / 1.08));
  assert.equal(desktop.hx, 530);
  assert.equal(desktop.hy, 34);
  assert.equal(desktop.axPct, 50);

  const mobile = computeFrameMetrics({
    isMobile: true,
    style: 'classic',
    innerHeight: 800,
    headerHeight: 68,
    mheightVh: 109,
    stageW: 390,
    stageH: 540,
  });
  assert.equal(mobile.frameH, 872);
  assert.equal(mobile.fs, 1);
  assert.equal(mobile.modelH, 540 - 24 - 18);
  assert.equal(mobile.hx, 0.3 * 390);
  assert.equal(mobile.hy, 22);
  assert.equal(mobile.axPct, 30);
});

test('computeRingSlotPose reproduces exact slot values from spec table', () => {
  const W = 1000;
  const H = 700;
  const slot0Still = computeRingSlotPose({
    bodyIndex: 0,
    bodyCount: 12,
    cur: 0,
    W,
    H,
    fs: 1.08,
    still: true,
    isMobile: false,
    useBlur: true,
  });
  assert.equal(slot0Still.scale, 1.08);
  assert.equal(slot0Still.x, 500);
  assert.equal(slot0Still.blur, 0);
  assert.equal(slot0Still.opacity, 0);
  assert.equal(slot0Still.z, 1080);

  const slot1 = computeRingSlotPose({
    bodyIndex: 1,
    bodyCount: 12,
    cur: 0,
    W,
    H,
    fs: 1.08,
    still: true,
    isMobile: false,
    useBlur: true,
  });
  assert.ok(Math.abs(slot1.scale - 0.952) < 0.002);
  assert.ok(Math.abs(slot1.x - 795) < 2);
  assert.ok(Math.abs(slot1.blur - 1.8) < 0.01);
  assert.equal(slot1.opacity, 1);
  assert.ok(Math.abs(slot1.z - 952) <= 1);

  const slot2 = computeRingSlotPose({
    bodyIndex: 2,
    bodyCount: 12,
    cur: 0,
    W,
    H,
    fs: 1.08,
    still: true,
    isMobile: false,
    useBlur: true,
  });
  assert.ok(Math.abs(slot2.scale - 0.842) < 0.002);
  assert.ok(Math.abs(slot2.x - 952) < 2);
  assert.ok(Math.abs(slot2.blur - 3.8) < 0.01);

  const slot4 = computeRingSlotPose({
    bodyIndex: 4,
    bodyCount: 12,
    cur: 0,
    W,
    H,
    fs: 1.08,
    still: true,
    isMobile: false,
    useBlur: true,
  });
  assert.ok(Math.abs(slot4.opacity - 0.167) < 0.002);
  assert.equal(slot4.blur, 6.5);
});

test('computeClassicPose matches mobile slots and exit pose', () => {
  const s0 = { x: 0, v: 0, g: 0, goal: 0, from: 0, trip: false };
  const p0 = computeClassicPose(s0, 390, true, true, true);
  assert.equal(p0.opacity, 0);
  assert.equal(p0.scale, 1);

  const s1 = { x: 1, v: 0, g: 1, goal: 1, from: 1, trip: false };
  const p1 = computeClassicPose(s1, 390, true, true, true);
  assert.ok(Math.abs(p1.x - 0.62 * 390) < 0.01);
  assert.equal(p1.bottom, 44);
  assert.equal(p1.scale, 0.76);
  assert.ok(Math.abs(p1.opacity - 0.87) < 0.001);
  assert.ok(Math.abs(p1.blur - 0.9) < 0.001);

  const sExit = { x: 0, v: 0, g: 0, goal: 11, from: 0, trip: true };
  stepClassicBody(sExit, 11, 12, 0.016, false, false);
  assert.equal(sExit.trip, true);
});

test('computeFootOffset finds transparent margin at bottom of cutout', () => {
  const w = 4;
  const h = 10;
  const buf = new Uint8ClampedArray(w * h * 4);
  // Put opaque pixel on row 7 (rows 8 and 9 are transparent -> 2/10 = 0.2)
  buf[(7 * w + 2) * 4 + 3] = 255;
  const offset = computeFootOffset(buf, w, h, 40);
  assert.ok(Math.abs(offset - 0.2) < 1e-6);
});

test('validateCatalog, addItemsToBag, computeBagSummary and shortlist export', () => {
  const catalogMap = validateCatalog(NATIVE_CATALOG);
  assert.equal(catalogMap.size, 41);

  // Add Air Jordan 12 Retro (42) + Tshirt (M) + Sweatshirt (S)
  let bag = parseBagStorage(null);
  bag = addItemsToBag(
    bag,
    [
      { id: 57015167090993, quantity: 1 },
      { id: 56835911647537, quantity: 1 },
      { id: 56835806396721, quantity: 1 },
    ],
    catalogMap
  );
  assert.equal(bag.length, 3);

  const summary = computeBagSummary(bag, catalogMap);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.subtotal, 547);
  assert.equal(formatMoneyUSD(summary.subtotal), '$547.00');

  const txt = buildShortlistText(summary.rows);
  assert.ok(txt.includes('RUNWAY — STYLING SHORTLIST'));
  assert.ok(txt.includes('Air Jordan 12 Retro · Size 42 · Quantity 1'));
  assert.ok(txt.includes('https://nike-makknzjs.myshopify.com/products/tatum-5-orbit-copy'));

  // Invalid variant throws
  assert.throws(() => addItemsToBag(bag, [{ id: 999999 }], catalogMap), {
    message: 'Please choose an available size.',
  });

  // Storage sanitizer caps quantity at 20 and rejects invalid entries
  const sanitized = parseBagStorage(
    JSON.stringify([
      { id: 57015167090993, quantity: 2 },
      { id: 57015167090993, quantity: 25 },
      { id: 'bad', quantity: 1 },
    ])
  );
  assert.deepEqual(sanitized, [{ id: 57015167090993, quantity: 2 }]);
});
