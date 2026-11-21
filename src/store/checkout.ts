import type { BagRowViewModel } from '../runway/bag';

export type DeliveryMethod = 'standard' | 'express';
export type PaymentMethod = 'card' | 'cod';

export interface CheckoutFormInput {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  delivery: DeliveryMethod;
  payment: PaymentMethod;
  cardLast4?: string;
  promoCode?: string;
}

export interface CheckoutValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  promoApplied: string | null;
  shipping: number;
  total: number;
  freeShippingUnlocked: boolean;
  amountToFreeShipping: number;
}

export interface OrderRecord {
  orderId: string;
  createdAt: string;
  status: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
  };
  delivery: DeliveryMethod;
  payment: PaymentMethod;
  items: Array<{
    id: number;
    name: string;
    size: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    image: string;
  }>;
  totals: OrderTotals;
}

export const FREE_SHIPPING_THRESHOLD = 300;
export const EXPRESS_SHIPPING_FEE = 18;
export const STANDARD_SHIPPING_FEE = 12;
export const ORDERS_STORAGE_KEY = 'runway-orders-v1';
export const WISHLIST_STORAGE_KEY = 'runway-wishlist-v1';

export function calculateOrderTotals(
  rows: BagRowViewModel[],
  delivery: DeliveryMethod,
  promoCode?: string
): OrderTotals {
  const subtotal = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const cleanPromo = (promoCode ?? '').trim().toUpperCase();
  const hasBundleCount = rows.reduce((sum, r) => sum + r.quantity, 0) >= 3;

  let promoApplied: string | null = null;
  let discount = 0;

  if (cleanPromo === 'NIKE10') {
    promoApplied = 'NIKE10';
    discount = Math.round(subtotal * 0.1 * 100) / 100;
  } else if (cleanPromo === '' && hasBundleCount) {
    promoApplied = 'LOOK10 (3+ pieces)';
    discount = Math.round(subtotal * 0.1 * 100) / 100;
  }

  const afterDiscount = Math.max(0, subtotal - discount);
  const freeShippingUnlocked = afterDiscount >= FREE_SHIPPING_THRESHOLD;
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - afterDiscount);

  let shipping = 0;
  if (rows.length > 0) {
    if (delivery === 'express') {
      shipping = EXPRESS_SHIPPING_FEE;
    } else {
      shipping = freeShippingUnlocked ? 0 : STANDARD_SHIPPING_FEE;
    }
  }

  const total = Math.round((afterDiscount + shipping) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount,
    promoApplied,
    shipping,
    total,
    freeShippingUnlocked,
    amountToFreeShipping: Math.round(amountToFreeShipping * 100) / 100,
  };
}

export function validateCheckoutForm(input: CheckoutFormInput): CheckoutValidationResult {
  const errors: Record<string, string> = {};

  if (input.fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (input.phone.replace(/\D/g, '').length < 7) {
    errors.phone = 'Enter a contact phone number.';
  }
  if (input.address.trim().length < 5) {
    errors.address = 'Enter your street address.';
  }
  if (input.city.trim().length < 2) {
    errors.city = 'Enter your city.';
  }
  if (input.postalCode.trim().length < 3) {
    errors.postalCode = 'Enter a valid postal code.';
  }
  if (input.payment === 'card') {
    const digits = (input.cardLast4 ?? '').replace(/\D/g, '');
    if (digits.length !== 4) {
      errors.cardLast4 = 'Enter 4 card digits for demo verification.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildOrderRecord(
  input: CheckoutFormInput,
  rows: BagRowViewModel[],
  existingCount: number,
  now = new Date()
): OrderRecord {
  const totals = calculateOrderTotals(rows, input.delivery, input.promoCode);
  const num = 1042 + existingCount;
  return {
    orderId: `NRW-${num}`,
    createdAt: now.toISOString(),
    status: 'Confirmed — Preparing Shipment',
    customer: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      postalCode: input.postalCode.trim(),
    },
    delivery: input.delivery,
    payment: input.payment,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      size: r.size,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      lineTotal: r.lineTotal,
      image: r.image,
    })),
    totals,
  };
}

export function parseOrdersStorage(raw: string | null): OrderRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is OrderRecord =>
        Boolean(o) &&
        typeof o === 'object' &&
        typeof o.orderId === 'string' &&
        Array.isArray(o.items) &&
        o.totals &&
        typeof o.totals.total === 'number'
    );
  } catch {
    return [];
  }
}

export function parseWishlistStorage(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}
