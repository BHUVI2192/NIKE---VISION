import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnrichedCatalog, filterAndSortCatalog } from './catalog-meta';
import {
  calculateOrderTotals,
  validateCheckoutForm,
  buildOrderRecord,
  parseOrdersStorage,
  parseWishlistStorage,
} from './checkout';
import type { BagRowViewModel } from '../runway/bag';

test('getEnrichedCatalog enriches all 8 items with look memberships and categories', () => {
  const items = getEnrichedCatalog();
  assert.equal(items.length, 8);
  const tshirt = items.find((i) => i.id === 'tshirt');
  assert.ok(tshirt);
  assert.equal(tshirt.category, 'apparel');
  assert.equal(tshirt.looks.length, 6);
  const jordan = items.find((i) => i.id === 'tatum-5-orbit-copy');
  assert.ok(jordan);
  assert.equal(jordan.category, 'footwear');
  assert.equal(jordan.name, 'Air Jordan 12 Retro');
});

test('filterAndSortCatalog filters by category, query, and price sort order', () => {
  const items = getEnrichedCatalog();
  const footwear = filterAndSortCatalog(items, {
    category: 'footwear',
    query: '',
    sort: 'featured',
  });
  assert.equal(footwear.length, 3);
  assert.ok(footwear.every((i) => i.category === 'footwear'));

  const searched = filterAndSortCatalog(items, {
    category: 'all',
    query: 'luka',
    sort: 'featured',
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, 'Luka 5');

  const asc = filterAndSortCatalog(items, {
    category: 'all',
    query: '',
    sort: 'price-asc',
  });
  assert.equal(asc[0].price, 149);
  assert.equal(asc[asc.length - 1].price, 199);

  const desc = filterAndSortCatalog(items, {
    category: 'all',
    query: '',
    sort: 'price-desc',
  });
  assert.equal(desc[0].price, 199);
  assert.equal(desc[desc.length - 1].price, 149);
});

test('calculateOrderTotals applies 10% bundle or NIKE10 discount and free shipping threshold', () => {
  const singleRow: BagRowViewModel[] = [
    {
      id: 1,
      name: 'Air Jordan 12 Retro',
      size: '42',
      quantity: 1,
      unitPrice: 149,
      lineTotal: 149,
      image: '',
      url: 'https://nike-makknzjs.myshopify.com/products/tatum-5-orbit-copy',
    },
  ];
  const singleStandard = calculateOrderTotals(singleRow, 'standard');
  assert.equal(singleStandard.subtotal, 149);
  assert.equal(singleStandard.discount, 0);
  assert.equal(singleStandard.shipping, 12);
  assert.equal(singleStandard.freeShippingUnlocked, false);
  assert.equal(singleStandard.total, 161);

  const withPromo = calculateOrderTotals(singleRow, 'standard', 'nike10');
  assert.equal(withPromo.promoApplied, 'NIKE10');
  assert.equal(withPromo.discount, 14.9);
  assert.equal(withPromo.total, 146.1);

  const threePieces: BagRowViewModel[] = [
    { ...singleRow[0], quantity: 1, lineTotal: 149 },
    { ...singleRow[0], id: 2, name: 'Tshirt', quantity: 1, unitPrice: 199, lineTotal: 199 },
    { ...singleRow[0], id: 3, name: 'Sweatshirt', quantity: 1, unitPrice: 199, lineTotal: 199 },
  ];
  const bundleTotals = calculateOrderTotals(threePieces, 'standard');
  assert.equal(bundleTotals.subtotal, 547);
  assert.equal(bundleTotals.discount, 54.7);
  assert.equal(bundleTotals.freeShippingUnlocked, true);
  assert.equal(bundleTotals.shipping, 0);
  assert.equal(bundleTotals.total, 492.3);
});

test('validateCheckoutForm rejects missing fields and validates COD vs Card', () => {
  const emptyRes = validateCheckoutForm({
    fullName: '',
    email: 'bad',
    phone: '123',
    address: '',
    city: '',
    postalCode: '',
    delivery: 'standard',
    payment: 'card',
    cardLast4: '',
  });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.fullName);
  assert.ok(emptyRes.errors.email);
  assert.ok(emptyRes.errors.phone);
  assert.ok(emptyRes.errors.address);
  assert.ok(emptyRes.errors.city);
  assert.ok(emptyRes.errors.postalCode);
  assert.ok(emptyRes.errors.cardLast4);

  const validCod = validateCheckoutForm({
    fullName: 'Jordan Mercer',
    email: 'jordan@example.com',
    phone: '415-555-0192',
    address: '420 Mercer Street',
    city: 'New York',
    postalCode: '10013',
    delivery: 'express',
    payment: 'cod',
  });
  assert.equal(validCod.valid, true);
});

test('buildOrderRecord and storage parsers round-trip cleanly', () => {
  const rows: BagRowViewModel[] = [
    {
      id: 1,
      name: 'Air Jordan 12 Retro',
      size: '42',
      quantity: 1,
      unitPrice: 149,
      lineTotal: 149,
      image: 'https://reel-ref-try-the-look.vercel.app/assets/source-tatum-5-orbit-copy.webp',
      url: 'https://nike-makknzjs.myshopify.com/products/tatum-5-orbit-copy',
    },
  ];
  const order = buildOrderRecord(
    {
      fullName: 'Jordan Mercer',
      email: 'jordan@example.com',
      phone: '4155550192',
      address: '420 Mercer St',
      city: 'New York',
      postalCode: '10013',
      delivery: 'standard',
      payment: 'cod',
    },
    rows,
    0,
    new Date('2026-11-21T09:20:00.000Z')
  );
  assert.equal(order.orderId, 'NRW-1042');
  assert.equal(order.status, 'Confirmed — Preparing Shipment');
  assert.equal(parseOrdersStorage(JSON.stringify([order])).length, 1);
  assert.deepEqual(parseOrdersStorage('invalid'), []);
  assert.deepEqual(parseWishlistStorage('["tshirt", 123, ""]'), ['tshirt']);
});

import { buildGradientBarSpecs, resolveGradientBarsProps } from './gradient-bars';

test('GradientBars resolves defaults and builds staggered Y-Axis & X-Axis bar specs', () => {
  const defaults = resolveGradientBarsProps();
  assert.equal(defaults.numBars, 16);
  assert.equal(defaults.gradientFrom, '#7C3AED');
  assert.equal(defaults.gradientTo, '#06B6D4');
  assert.equal(defaults.backgroundColor, '#0B0B0F');

  const yWave = buildGradientBarSpecs({
    numBars: 24,
    barWidth: 4,
    barHeight: 340,
    barDirection: 'Y Axis',
    animationMode: 'Wave',
    animationIntensity: 60,
    stagger: 0.08,
  });
  assert.equal(yWave.bars.length, 24);
  assert.equal(yWave.shouldAnimate, true);
  assert.equal(yWave.keyframeName, 'framerGradientBarsWaveY');
  assert.equal(yWave.bars[0].animationDelay, '0s');
  assert.equal(yWave.bars[2].animationDelay, '0.16s');
  assert.ok(yWave.bars[0].background.includes('180deg'));

  const staticX = buildGradientBarSpecs({
    numBars: 100,
    barDirection: 'X Axis',
    animationMode: 'Pulse',
    isStatic: true,
  });
  assert.equal(staticX.bars.length, 80);
  assert.equal(staticX.shouldAnimate, false);
  assert.equal(staticX.keyframeName, 'framerGradientBarsPulseX');
  assert.equal(staticX.bars[0].animationName, 'none');
  assert.ok(staticX.bars[0].background.includes('90deg'));
});

