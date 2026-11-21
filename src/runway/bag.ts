import { NATIVE_CATALOG, type CatalogItem, type CatalogVariant, type NativeCatalog } from './catalog';

export const BAG_STORAGE_KEY = 'runway-styling-bag-v3';
export const ALLOWED_BAG_HOST = 'nike-makknzjs.myshopify.com';

export interface BagEntry {
  id: number;
  quantity: number;
}

export interface ValidatedVariantRecord {
  item: CatalogItem;
  variant: CatalogVariant;
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatMoneyUSD(amount: number): string {
  return usdFormatter.format(amount);
}

export function validateCatalog(raw: unknown): Map<number, ValidatedVariantRecord> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The product list is unavailable.');
  }
  const cat = raw as Partial<NativeCatalog>;
  if (!Array.isArray(cat.items)) {
    throw new Error('The product list is unavailable.');
  }

  const map = new Map<number, ValidatedVariantRecord>();
  for (const item of cat.items) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.name !== 'string' ||
      !item.name ||
      typeof item.price !== 'number' ||
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      !Array.isArray(item.variants)
    ) {
      throw new Error('The product list is unavailable.');
    }
    for (const v of item.variants) {
      if (
        !v ||
        !Number.isSafeInteger(v.id) ||
        typeof v.a !== 'boolean' ||
        !Array.isArray(v.o) ||
        !v.o.every((opt) => typeof opt === 'string')
      ) {
        throw new Error('The product list is unavailable.');
      }
      map.set(v.id, { item, variant: v });
    }
  }
  return map;
}

export function parseBagStorage(rawJson: string | null): BagEntry[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    const out: BagEntry[] = [];
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === 'object' &&
        Number.isSafeInteger(entry.id) &&
        Number.isSafeInteger(entry.quantity) &&
        entry.quantity >= 1 &&
        entry.quantity <= 20
      ) {
        out.push({ id: entry.id, quantity: entry.quantity });
        if (out.length >= 50) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function addItemsToBag(
  current: BagEntry[],
  incoming: Array<{ id: number; quantity?: number }>,
  catalogMap: Map<number, ValidatedVariantRecord>
): BagEntry[] {
  const next = current.map((e) => ({ ...e }));

  for (const req of incoming) {
    const rec = catalogMap.get(req.id);
    if (!rec || !rec.variant.a) {
      throw new Error('Please choose an available size.');
    }
    const qty = Math.min(20, Math.max(1, req.quantity ?? 1));
    const existing = next.find((e) => e.id === req.id);
    if (existing) {
      existing.quantity = Math.min(20, existing.quantity + qty);
    } else if (next.length < 50) {
      next.push({ id: req.id, quantity: qty });
    }
  }

  return next;
}

export interface BagRowViewModel {
  id: number;
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image: string;
  url: string;
}

export interface BagSummary {
  totalCount: number;
  subtotal: number;
  rows: BagRowViewModel[];
}

export function computeBagSummary(
  entries: BagEntry[],
  catalogMap: Map<number, ValidatedVariantRecord>
): BagSummary {
  let totalCount = 0;
  let subtotal = 0;
  const rows: BagRowViewModel[] = [];

  for (const entry of entries) {
    const rec = catalogMap.get(entry.id);
    if (!rec) continue;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rec.item.url);
    } catch {
      throw new Error('Invalid product URL.');
    }
    if (parsedUrl.hostname !== ALLOWED_BAG_HOST) {
      throw new Error('Invalid product URL host.');
    }

    totalCount += entry.quantity;
    const lineTotal = rec.item.price * entry.quantity;
    subtotal += lineTotal;
    rows.push({
      id: entry.id,
      name: rec.item.name,
      size: rec.variant.o.join(' / '),
      quantity: entry.quantity,
      unitPrice: rec.item.price,
      lineTotal,
      image: rec.item.image,
      url: parsedUrl.toString(),
    });
  }

  return { totalCount, subtotal, rows };
}

export function buildShortlistText(rows: BagRowViewModel[]): string {
  const parts: string[] = [
    'RUNWAY — STYLING SHORTLIST',
    'Reference prices; no order or payment has been placed.',
    '',
  ];
  for (const row of rows) {
    parts.push(`${row.name} · Size ${row.size} · Quantity ${row.quantity}\n${row.url}`);
  }
  return parts.join('\n\n');
}

export class StylingBagController {
  private entries: BagEntry[] = [];
  private catalogMap: Map<number, ValidatedVariantRecord>;
  private toastTimer: number | null = null;
  private dialog: HTMLDialogElement | null;
  private itemsEl: HTMLElement | null;
  private totalEl: HTMLElement | null;
  private shippingNoteEl: HTMLElement | null;
  private exportBtn: HTMLButtonElement | null;
  private checkoutBtn: HTMLButtonElement | null;
  private clearBtn: HTMLButtonElement | null;
  private statusEl: HTMLElement | null;

  constructor() {
    this.catalogMap = validateCatalog(NATIVE_CATALOG);
    this.dialog = document.getElementById('bag-dialog') as HTMLDialogElement | null;
    this.itemsEl = document.getElementById('bag-items');
    this.totalEl = document.getElementById('bag-total');
    this.shippingNoteEl = document.getElementById('bag-shipping-note');
    this.exportBtn = document.getElementById('export-bag') as HTMLButtonElement | null;
    this.checkoutBtn = document.getElementById('checkout-bag') as HTMLButtonElement | null;
    this.clearBtn = document.getElementById('clear-bag') as HTMLButtonElement | null;
    this.statusEl = document.getElementById('bag-status');
    this.load();
    this.bindEvents();
    this.renderCount();
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(BAG_STORAGE_KEY);
      this.entries = parseBagStorage(raw);
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(BAG_STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new CustomEvent('runway:bag-updated'));
  }

  public getSummary(): BagSummary {
    return computeBagSummary(this.entries, this.catalogMap);
  }

  public openDialog(): void {
    if (!this.dialog) return;
    this.renderDialog();
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  public closeDialog(): void {
    if (this.dialog?.open) {
      this.dialog.close();
    }
  }

  public add(items: Array<{ id: number; quantity?: number }>): void {
    this.entries = addItemsToBag(this.entries, items, this.catalogMap);
    this.save();
    this.renderCount();
    if (this.dialog?.open) {
      this.renderDialog();
    }
    this.showToast(
      items.length > 1
        ? 'Look saved to your styling bag'
        : 'Piece saved to your styling bag'
    );
  }

  public setQuantity(variantId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(variantId);
      return;
    }
    const clamped = Math.min(20, Math.max(1, Math.round(quantity)));
    const entry = this.entries.find((e) => e.id === variantId);
    if (!entry) return;
    entry.quantity = clamped;
    this.save();
    this.renderCount();
    this.renderDialog();
  }

  public remove(variantId: number): void {
    this.entries = this.entries.filter((e) => e.id !== variantId);
    this.save();
    this.renderCount();
    this.renderDialog();
  }

  public clear(): void {
    this.entries = [];
    this.save();
    this.renderCount();
    if (this.dialog?.open) {
      this.renderDialog();
    }
  }

  public notify(message: string): void {
    this.showToast(message);
  }

  private showToast(message: string): void {
    if (!this.statusEl) return;
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.statusEl.textContent = message;
    this.statusEl.classList.remove('is-on');
    void this.statusEl.offsetWidth;
    this.statusEl.classList.add('is-on');
    this.toastTimer = window.setTimeout(() => {
      this.statusEl?.classList.remove('is-on');
      this.toastTimer = null;
    }, 2500);
  }

  public renderCount(): void {
    let total = 0;
    for (const e of this.entries) {
      if (this.catalogMap.has(e.id)) {
        total += e.quantity;
      }
    }
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(total);
    });
  }

  public renderDialog(): void {
    if (!this.itemsEl || !this.totalEl || !this.exportBtn) return;
    const summary = computeBagSummary(this.entries, this.catalogMap);
    this.itemsEl.replaceChildren();

    if (summary.rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'bag-note';
      empty.textContent =
        'Your styling bag is empty. Choose a size beside a piece to save it.';
      this.itemsEl.appendChild(empty);
      this.totalEl.textContent = '';
      if (this.shippingNoteEl) this.shippingNoteEl.textContent = '';
      this.exportBtn.disabled = true;
      if (this.checkoutBtn) this.checkoutBtn.disabled = true;
      if (this.clearBtn) this.clearBtn.hidden = true;
      return;
    }

    for (const row of summary.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'bag-row';

      const img = document.createElement('img');
      img.src = row.image;
      img.alt = row.name;
      img.width = 60;
      img.height = 80;

      const details = document.createElement('div');
      const h3 = document.createElement('h3');
      h3.textContent = row.name;
      const meta = document.createElement('p');
      meta.textContent = `Size ${row.size} · Quantity ${row.quantity} · ${formatMoneyUSD(row.unitPrice)}`;

      const actionsRow = document.createElement('div');
      actionsRow.className = 'bag-row-actions';

      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'bag-qty';

      const decBtn = document.createElement('button');
      decBtn.type = 'button';
      decBtn.className = 'bag-qty-btn';
      decBtn.setAttribute('aria-label', `Decrease quantity of ${row.name}`);
      decBtn.textContent = '−';
      decBtn.addEventListener('click', () => {
        this.setQuantity(row.id, row.quantity - 1);
      });

      const qtyVal = document.createElement('span');
      qtyVal.className = 'bag-qty-val';
      qtyVal.textContent = String(row.quantity);

      const incBtn = document.createElement('button');
      incBtn.type = 'button';
      incBtn.className = 'bag-qty-btn';
      incBtn.setAttribute('aria-label', `Increase quantity of ${row.name}`);
      incBtn.textContent = '+';
      incBtn.addEventListener('click', () => {
        this.setQuantity(row.id, row.quantity + 1);
      });

      qtyWrap.append(decBtn, qtyVal, incBtn);

      actionsRow.append(qtyWrap);
      details.append(h3, meta, actionsRow);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'bag-remove';
      removeBtn.setAttribute('aria-label', `Remove ${row.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        this.remove(row.id);
      });

      rowEl.append(img, details, removeBtn);
      this.itemsEl.appendChild(rowEl);
    }

    this.totalEl.textContent = `Reference subtotal ${formatMoneyUSD(summary.subtotal)}`;
    if (this.shippingNoteEl) {
      const remaining = Math.max(0, 300 - summary.subtotal);
      this.shippingNoteEl.textContent =
        remaining === 0
          ? 'Free Standard Shipping unlocked ($300+ threshold met).'
          : `Add ${formatMoneyUSD(remaining)} more for Free Standard Shipping.`;
    }
    this.exportBtn.disabled = false;
    if (this.checkoutBtn) this.checkoutBtn.disabled = false;
    if (this.clearBtn) this.clearBtn.hidden = false;
  }

  private exportShortlist(): void {
    const summary = computeBagSummary(this.entries, this.catalogMap);
    if (summary.rows.length === 0) return;
    const text = buildShortlistText(summary.rows);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'runway-outfit-shortlist.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private bindEvents(): void {
    const openBtn = document.getElementById('open-bag');
    const closeBtn = document.getElementById('close-bag');

    openBtn?.addEventListener('click', () => {
      this.openDialog();
    });

    closeBtn?.addEventListener('click', () => {
      this.closeDialog();
    });

    this.dialog?.addEventListener('click', (e) => {
      if (!this.dialog || e.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        this.dialog.close();
      }
    });

    this.exportBtn?.addEventListener('click', () => {
      this.exportShortlist();
    });

    this.clearBtn?.addEventListener('click', () => {
      this.clear();
    });

    this.checkoutBtn?.addEventListener('click', () => {
      this.closeDialog();
      window.dispatchEvent(new CustomEvent('runway:open-checkout'));
    });
  }
}
