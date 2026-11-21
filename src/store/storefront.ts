import { formatMoneyUSD, type StylingBagController } from '../runway/bag';
import { NATIVE_CATALOG } from '../runway/catalog';
import type { RunwaySection } from '../runway/runway-element';
import {
  filterAndSortCatalog,
  getEnrichedCatalog,
  type CatalogFilter,
  type CatalogSort,
  type EnrichedCatalogItem,
} from './catalog-meta';
import {
  buildOrderRecord,
  calculateOrderTotals,
  ORDERS_STORAGE_KEY,
  parseOrdersStorage,
  parseWishlistStorage,
  validateCheckoutForm,
  WISHLIST_STORAGE_KEY,
  type DeliveryMethod,
  type OrderRecord,
  type PaymentMethod,
} from './checkout';

declare global {
  interface Window {
    __runwayBag?: StylingBagController;
  }
}

export class StorefrontController {
  private items: EnrichedCatalogItem[];
  private category: CatalogFilter = 'all';
  private wishlistOnly = false;
  private query = '';
  private sort: CatalogSort = 'featured';
  private selectedSizeByItem = new Map<string, string>();
  private wishlist = new Set<string>();
  private orders: OrderRecord[] = [];

  private gridEl: HTMLElement | null;
  private countEl: HTMLElement | null;
  private searchInput: HTMLInputElement | null;
  private sortSelect: HTMLSelectElement | null;
  private tabButtons: HTMLButtonElement[];
  private wishlistTabBtn: HTMLButtonElement | null;

  private pdpDialog: HTMLDialogElement | null;
  private pdpBody: HTMLElement | null;
  private pdpTitle: HTMLElement | null;

  private checkoutDialog: HTMLDialogElement | null;
  private checkoutBody: HTMLElement | null;
  private checkoutDelivery: DeliveryMethod = 'standard';
  private checkoutPayment: PaymentMethod = 'card';
  private checkoutPromo = '';

  private ordersDialog: HTMLDialogElement | null;
  private ordersBody: HTMLElement | null;

  private infoDialog: HTMLDialogElement | null;
  private infoTitle: HTMLElement | null;
  private infoBody: HTMLElement | null;

  constructor() {
    this.items = getEnrichedCatalog();
    for (const item of this.items) {
      this.selectedSizeByItem.set(item.id, item.sizes[0] ?? '');
    }
    this.loadWishlist();
    this.loadOrders();

    this.gridEl = document.getElementById('catalog-grid');
    this.countEl = document.getElementById('catalog-count');
    this.searchInput = document.getElementById('catalog-search') as HTMLInputElement | null;
    this.sortSelect = document.getElementById('catalog-sort') as HTMLSelectElement | null;
    this.tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-store-cat]'));
    this.wishlistTabBtn = document.getElementById('filter-wishlist') as HTMLButtonElement | null;

    this.pdpDialog = document.getElementById('pdp-dialog') as HTMLDialogElement | null;
    this.pdpBody = document.getElementById('pdp-body');
    this.pdpTitle = document.getElementById('pdp-dialog-title');

    this.checkoutDialog = document.getElementById('checkout-dialog') as HTMLDialogElement | null;
    this.checkoutBody = document.getElementById('checkout-body');

    this.ordersDialog = document.getElementById('orders-dialog') as HTMLDialogElement | null;
    this.ordersBody = document.getElementById('orders-body');

    this.infoDialog = document.getElementById('info-dialog') as HTMLDialogElement | null;
    this.infoTitle = document.getElementById('info-dialog-title');
    this.infoBody = document.getElementById('info-body');

    this.bindEvents();
    this.updateWishlistTabLabel();
    this.renderCatalog();
  }

  private loadWishlist(): void {
    try {
      const ids = parseWishlistStorage(window.localStorage.getItem(WISHLIST_STORAGE_KEY));
      this.wishlist = new Set(ids);
    } catch {
      this.wishlist = new Set();
    }
  }

  private saveWishlist(): void {
    try {
      window.localStorage.setItem(
        WISHLIST_STORAGE_KEY,
        JSON.stringify(Array.from(this.wishlist))
      );
    } catch {
      // ignore storage errors
    }
  }

  private loadOrders(): void {
    try {
      this.orders = parseOrdersStorage(window.localStorage.getItem(ORDERS_STORAGE_KEY));
    } catch {
      this.orders = [];
    }
  }

  private saveOrders(): void {
    try {
      window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(this.orders));
    } catch {
      // ignore storage errors
    }
  }

  private toggleWishlist(itemId: string): void {
    if (this.wishlist.has(itemId)) {
      this.wishlist.delete(itemId);
    } else {
      this.wishlist.add(itemId);
    }
    this.saveWishlist();
    this.updateWishlistTabLabel();
    this.renderCatalog();
  }

  private updateWishlistTabLabel(): void {
    if (!this.wishlistTabBtn) return;
    this.wishlistTabBtn.textContent = `Saved (${this.wishlist.size})`;
  }

  private getSelectedVariantId(item: EnrichedCatalogItem, size: string): number | null {
    const v = item.variants.find((x) => x.o[0] === size && x.a);
    return v ? v.id : null;
  }

  private jumpToRunwayLook(lookIndex: number): void {
    const section = document.querySelector<RunwaySection>('runway-section');
    const runwayWrap = document.getElementById('runway');
    runwayWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (section && typeof section.go === 'function') {
      section.go(lookIndex);
    }
  }

  private jumpToCatalogFilter(cat: CatalogFilter): void {
    this.wishlistOnly = false;
    this.category = cat;
    this.syncFilterButtons();
    this.renderCatalog();
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private syncFilterButtons(): void {
    for (const btn of this.tabButtons) {
      const cat = btn.dataset.storeCat as CatalogFilter;
      btn.setAttribute('aria-pressed', !this.wishlistOnly && cat === this.category ? 'true' : 'false');
    }
    this.wishlistTabBtn?.setAttribute('aria-pressed', this.wishlistOnly ? 'true' : 'false');
  }

  public renderCatalog(): void {
    if (!this.gridEl) return;
    let visible = filterAndSortCatalog(this.items, {
      category: this.category,
      query: this.query,
      sort: this.sort,
    });
    if (this.wishlistOnly) {
      visible = visible.filter((item) => this.wishlist.has(item.id));
    }

    if (this.countEl) {
      this.countEl.textContent = `${visible.length} ${visible.length === 1 ? 'piece' : 'pieces'}`;
    }

    this.gridEl.replaceChildren();

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'store-empty';
      const p = document.createElement('p');
      p.textContent = this.wishlistOnly
        ? 'You have no saved pieces yet. Tap the heart on any item to shortlist it.'
        : 'No pieces match your current filter or search.';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'store-btn store-btn--dark';
      resetBtn.textContent = 'Reset filters';
      resetBtn.addEventListener('click', () => {
        this.category = 'all';
        this.wishlistOnly = false;
        this.query = '';
        this.sort = 'featured';
        if (this.searchInput) this.searchInput.value = '';
        if (this.sortSelect) this.sortSelect.value = 'featured';
        this.syncFilterButtons();
        this.renderCatalog();
      });
      empty.append(p, resetBtn);
      this.gridEl.appendChild(empty);
      return;
    }

    for (const item of visible) {
      const card = document.createElement('article');
      card.className = 'store-card';
      card.dataset.productId = item.id;

      // Image & Wishlist button
      const mediaBtn = document.createElement('button');
      mediaBtn.type = 'button';
      mediaBtn.className = 'store-card__media-btn';
      mediaBtn.setAttribute('aria-label', `Inspect ${item.name}`);

      const img = document.createElement('img');
      img.src = item.image;
      img.alt = `${item.name} — ${item.colorway}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      mediaBtn.appendChild(img);
      mediaBtn.addEventListener('click', () => this.openPdp(item.id));

      const mediaWrapper = document.createElement('div');
      mediaWrapper.style.position = 'relative';
      mediaWrapper.appendChild(mediaBtn);

      const wishBtn = document.createElement('button');
      wishBtn.type = 'button';
      wishBtn.className = 'store-card__wishlist';
      const isSaved = this.wishlist.has(item.id);
      wishBtn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
      wishBtn.setAttribute(
        'aria-label',
        isSaved ? `Remove ${item.name} from saved` : `Save ${item.name}`
      );
      wishBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20.5s-7.5-4.7-9.5-9.2C.9 7.8 3.1 4.5 6.6 4.5c2 0 3.7 1.1 5.4 3 1.7-1.9 3.4-3 5.4-3 3.5 0 5.7 3.3 4.1 6.8-2 4.5-9.5 9.2-9.5 9.2z"/></svg>';
      wishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleWishlist(item.id);
      });
      mediaWrapper.appendChild(wishBtn);

      // Body
      const body = document.createElement('div');
      body.className = 'store-card__body';

      const meta = document.createElement('div');
      meta.className = 'store-card__meta';
      const vendorSpan = document.createElement('span');
      vendorSpan.textContent = item.vendor;
      meta.appendChild(vendorSpan);
      if (item.badge) {
        const sep = document.createElement('span');
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '·';
        const badgeSpan = document.createElement('span');
        badgeSpan.textContent = item.badge;
        meta.append(sep, badgeSpan);
      }

      const titleRow = document.createElement('div');
      titleRow.className = 'store-card__title-row';
      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'store-card__title';
      titleBtn.textContent = item.name;
      titleBtn.addEventListener('click', () => this.openPdp(item.id));
      const priceEl = document.createElement('span');
      priceEl.className = 'store-card__price';
      priceEl.textContent = formatMoneyUSD(item.price);
      titleRow.append(titleBtn, priceEl);

      const tagline = document.createElement('p');
      tagline.className = 'store-card__tagline';
      tagline.textContent = `${item.colorway} · ${item.tagline}`;

      // Quick size pills
      const sizesWrap = document.createElement('div');
      sizesWrap.className = 'store-card__sizes';
      sizesWrap.setAttribute('role', 'group');
      sizesWrap.setAttribute('aria-label', `Select size for ${item.name}`);

      const selectedSize = this.selectedSizeByItem.get(item.id) || item.sizes[0] || '';
      for (const size of item.sizes) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'store-size-pill';
        pill.textContent = size;
        pill.setAttribute('aria-pressed', size === selectedSize ? 'true' : 'false');
        pill.addEventListener('click', () => {
          this.selectedSizeByItem.set(item.id, size);
          sizesWrap.querySelectorAll('.store-size-pill').forEach((b) => {
            b.setAttribute('aria-pressed', b.textContent === size ? 'true' : 'false');
          });
        });
        sizesWrap.appendChild(pill);
      }

      const actions = document.createElement('div');
      actions.className = 'store-card__actions';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'store-btn store-btn--dark';
      addBtn.textContent = 'Add to bag';
      addBtn.addEventListener('click', () => {
        const chosen = this.selectedSizeByItem.get(item.id) || item.sizes[0] || '';
        const variantId = this.getSelectedVariantId(item, chosen);
        if (!variantId || !window.__runwayBag) return;
        window.__runwayBag.add([{ id: variantId, quantity: 1 }]);
      });

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'store-btn store-btn--ghost';
      detailsBtn.textContent = 'Details';
      detailsBtn.addEventListener('click', () => this.openPdp(item.id));

      actions.append(addBtn, detailsBtn);
      body.append(meta, titleRow, tagline, sizesWrap, actions);

      card.append(mediaWrapper, body);
      this.gridEl.appendChild(card);
    }
  }

  public openPdp(itemId: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (!item || !this.pdpDialog || !this.pdpBody || !this.pdpTitle) return;

    this.pdpTitle.textContent = item.name;
    let selectedSize = this.selectedSizeByItem.get(item.id) || item.sizes[0] || '';
    let qty = 1;

    const wrap = document.createElement('div');
    wrap.className = 'pdp-grid';

    // Left Gallery + Look links
    const gallery = document.createElement('div');
    gallery.className = 'pdp-gallery';
    const frame = document.createElement('div');
    frame.className = 'pdp-gallery__frame';
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = `${item.name} — ${item.colorway}`;
    frame.appendChild(img);
    gallery.appendChild(frame);

    if (item.looks.length > 0) {
      const looksBox = document.createElement('div');
      looksBox.className = 'pdp-looks';
      const lbl = document.createElement('span');
      lbl.className = 'pdp-looks__label';
      lbl.textContent = 'Featured on the 3D Runway';
      const list = document.createElement('div');
      list.className = 'pdp-looks__list';
      for (const look of item.looks) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdp-look-btn';
        btn.textContent = `Look ${String(look.index + 1).padStart(2, '0')} · ${look.name}`;
        btn.addEventListener('click', () => {
          this.pdpDialog?.close();
          this.jumpToRunwayLook(look.index);
        });
        list.appendChild(btn);
      }
      looksBox.append(lbl, list);
      gallery.appendChild(looksBox);
    }

    // Right Purchase Module
    const info = document.createElement('div');
    info.className = 'pdp-info';

    const vendor = document.createElement('span');
    vendor.className = 'pdp-vendor';
    vendor.textContent = `${item.vendor} · ${item.sku}`;

    const h3 = document.createElement('h3');
    h3.className = 'pdp-title';
    h3.textContent = item.name;

    const priceRow = document.createElement('div');
    priceRow.className = 'pdp-price-row';
    const price = document.createElement('span');
    price.className = 'pdp-price';
    price.textContent = formatMoneyUSD(item.price);
    const stock = document.createElement('span');
    stock.className = 'pdp-stock';
    stock.textContent = `In Stock · ${item.colorway}`;
    priceRow.append(price, stock);

    const desc = document.createElement('p');
    desc.className = 'pdp-desc';
    desc.textContent = item.description;

    // Size selection
    const sizeField = document.createElement('div');
    const sizeLabel = document.createElement('p');
    sizeLabel.className = 'pdp-field-label';
    sizeLabel.textContent = item.category === 'footwear' ? 'Shoe size (EU)' : 'Size';
    const sizesWrap = document.createElement('div');
    sizesWrap.className = 'pdp-sizes';
    for (const s of item.sizes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'store-size-pill';
      btn.textContent = s;
      btn.setAttribute('aria-pressed', s === selectedSize ? 'true' : 'false');
      btn.addEventListener('click', () => {
        selectedSize = s;
        this.selectedSizeByItem.set(item.id, s);
        sizesWrap.querySelectorAll('.store-size-pill').forEach((el) => {
          el.setAttribute('aria-pressed', el.textContent === s ? 'true' : 'false');
        });
      });
      sizesWrap.appendChild(btn);
    }
    sizeField.append(sizeLabel, sizesWrap);

    // Quantity selector
    const qtyField = document.createElement('div');
    const qtyLabel = document.createElement('p');
    qtyLabel.className = 'pdp-field-label';
    qtyLabel.textContent = 'Quantity';
    const qtyBox = document.createElement('div');
    qtyBox.className = 'bag-qty';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'bag-qty-btn';
    dec.setAttribute('aria-label', 'Decrease quantity');
    dec.textContent = '−';
    const val = document.createElement('span');
    val.className = 'bag-qty-val';
    val.textContent = '1';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'bag-qty-btn';
    inc.setAttribute('aria-label', 'Increase quantity');
    inc.textContent = '+';
    dec.addEventListener('click', () => {
      qty = Math.max(1, qty - 1);
      val.textContent = String(qty);
    });
    inc.addEventListener('click', () => {
      qty = Math.min(10, qty + 1);
      val.textContent = String(qty);
    });
    qtyBox.append(dec, val, inc);
    qtyField.append(qtyLabel, qtyBox);

    // CTAs
    const ctaRow = document.createElement('div');
    ctaRow.className = 'pdp-cta-row';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'store-btn store-btn--dark';
    addBtn.textContent = 'Add to bag';
    addBtn.addEventListener('click', () => {
      const variantId = this.getSelectedVariantId(item, selectedSize);
      if (!variantId || !window.__runwayBag) return;
      window.__runwayBag.add([{ id: variantId, quantity: qty }]);
      this.pdpDialog?.close();
      this.renderCatalog();
    });

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'store-btn store-btn--ghost';
    buyBtn.textContent = 'Buy now';
    buyBtn.addEventListener('click', () => {
      const variantId = this.getSelectedVariantId(item, selectedSize);
      if (!variantId || !window.__runwayBag) return;
      window.__runwayBag.add([{ id: variantId, quantity: qty }]);
      this.pdpDialog?.close();
      this.openCheckout();
    });

    ctaRow.append(addBtn, buyBtn);

    // Details
    const details = document.createElement('div');
    details.className = 'pdp-details';
    details.innerHTML = `
      <p><strong>Materials:</strong> ${item.materials}</p>
      <p><strong>Fit & Sizing:</strong> ${item.fitNote}</p>
      <p><strong>Shipping:</strong> Free Standard Ground on orders $300+. 30-day studio returns.</p>
    `;

    info.append(vendor, h3, priceRow, desc, sizeField, qtyField, ctaRow, details);
    wrap.append(gallery, info);

    this.pdpBody.replaceChildren(wrap);
    if (!this.pdpDialog.open) {
      this.pdpDialog.showModal();
    }
  }

  public openCheckout(): void {
    if (!this.checkoutDialog || !this.checkoutBody || !window.__runwayBag) return;
    this.renderCheckoutForm();
    if (!this.checkoutDialog.open) {
      this.checkoutDialog.showModal();
    }
  }

  private renderCheckoutForm(): void {
    if (!this.checkoutBody || !window.__runwayBag) return;
    const summary = window.__runwayBag.getSummary();
    if (summary.rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'store-empty';
      empty.innerHTML = '<p>Your bag is currently empty. Add pieces before checking out.</p>';
      const shopBtn = document.createElement('button');
      shopBtn.type = 'button';
      shopBtn.className = 'store-btn store-btn--dark';
      shopBtn.textContent = 'Browse collection';
      shopBtn.addEventListener('click', () => {
        this.checkoutDialog?.close();
        this.jumpToCatalogFilter('all');
      });
      empty.appendChild(shopBtn);
      this.checkoutBody.replaceChildren(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'checkout-grid';

    const form = document.createElement('form');
    form.className = 'checkout-form';
    form.noValidate = true;

    form.innerHTML = `
      <h3 class="checkout-section-title">1. Contact & Shipping Address</h3>
      <div class="checkout-fields">
        <div class="checkout-field checkout-field--full">
          <label for="co-name">Full name</label>
          <input id="co-name" name="fullName" type="text" autocomplete="name" required placeholder="Jordan Mercer" />
          <span class="checkout-error" data-err="fullName"></span>
        </div>
        <div class="checkout-field">
          <label for="co-email">Email</label>
          <input id="co-email" name="email" type="email" autocomplete="email" required placeholder="jordan@example.com" />
          <span class="checkout-error" data-err="email"></span>
        </div>
        <div class="checkout-field">
          <label for="co-phone">Phone</label>
          <input id="co-phone" name="phone" type="tel" autocomplete="tel" required placeholder="(415) 555-0192" />
          <span class="checkout-error" data-err="phone"></span>
        </div>
        <div class="checkout-field checkout-field--full">
          <label for="co-address">Street address</label>
          <input id="co-address" name="address" type="text" autocomplete="street-address" required placeholder="420 Mercer Street" />
          <span class="checkout-error" data-err="address"></span>
        </div>
        <div class="checkout-field">
          <label for="co-city">City</label>
          <input id="co-city" name="city" type="text" autocomplete="address-level2" required placeholder="New York" />
          <span class="checkout-error" data-err="city"></span>
        </div>
        <div class="checkout-field">
          <label for="co-postal">Postal code</label>
          <input id="co-postal" name="postalCode" type="text" autocomplete="postal-code" required placeholder="10013" />
          <span class="checkout-error" data-err="postalCode"></span>
        </div>
      </div>

      <h3 class="checkout-section-title">2. Delivery Method</h3>
      <div class="checkout-radios">
        <label class="checkout-radio">
          <span class="checkout-radio-left">
            <input type="radio" name="delivery" value="standard" ${this.checkoutDelivery === 'standard' ? 'checked' : ''} />
            <span>Standard Ground (3–5 business days)</span>
          </span>
          <span id="co-standard-fee"></span>
        </label>
        <label class="checkout-radio">
          <span class="checkout-radio-left">
            <input type="radio" name="delivery" value="express" ${this.checkoutDelivery === 'express' ? 'checked' : ''} />
            <span>Express 2-Day Air</span>
          </span>
          <span>$18.00</span>
        </label>
      </div>

      <h3 class="checkout-section-title">3. Payment</h3>
      <div class="checkout-radios">
        <label class="checkout-radio">
          <span class="checkout-radio-left">
            <input type="radio" name="payment" value="card" ${this.checkoutPayment === 'card' ? 'checked' : ''} />
            <span>Demo Card Verification (no real charge)</span>
          </span>
          <span>Instant</span>
        </label>
        <label class="checkout-radio">
          <span class="checkout-radio-left">
            <input type="radio" name="payment" value="cod" ${this.checkoutPayment === 'cod' ? 'checked' : ''} />
            <span>Cash on Delivery (COD)</span>
          </span>
          <span>Pay at door</span>
        </label>
      </div>

      <div class="checkout-field" id="co-card-box" ${this.checkoutPayment === 'cod' ? 'hidden' : ''}>
        <label for="co-card-last4">Last 4 card digits (test verification)</label>
        <input id="co-card-last4" name="cardLast4" type="text" inputmode="numeric" maxlength="4" placeholder="4242" />
        <span class="checkout-error" data-err="cardLast4"></span>
      </div>

      <button type="submit" class="store-btn store-btn--dark" id="co-submit">Place order</button>
    `;

    // Right Order Summary
    const aside = document.createElement('aside');
    aside.className = 'checkout-summary';

    const itemsBox = document.createElement('div');
    itemsBox.className = 'checkout-summary__items';
    for (const row of summary.rows) {
      const itemEl = document.createElement('div');
      itemEl.className = 'checkout-summary__item';
      const img = document.createElement('img');
      img.src = row.image;
      img.alt = row.name;
      const meta = document.createElement('div');
      meta.innerHTML = `<strong>${row.name}</strong><br><span style="color:var(--store-muted);font-size:12px;">Size ${row.size} · Qty ${row.quantity}</span>`;
      const lineTotal = document.createElement('span');
      lineTotal.textContent = formatMoneyUSD(row.lineTotal);
      itemEl.append(img, meta, lineTotal);
      itemsBox.appendChild(itemEl);
    }

    const promoBox = document.createElement('div');
    promoBox.className = 'checkout-promo';
    const promoInput = document.createElement('input');
    promoInput.type = 'text';
    promoInput.placeholder = 'Promo code (try NIKE10)';
    promoInput.value = this.checkoutPromo;
    promoInput.setAttribute('aria-label', 'Promo code');
    const promoBtn = document.createElement('button');
    promoBtn.type = 'button';
    promoBtn.className = 'store-btn store-btn--ghost';
    promoBtn.textContent = 'Apply';
    promoBox.append(promoInput, promoBtn);

    const promoStatus = document.createElement('p');
    promoStatus.style.margin = '0';
    promoStatus.style.fontSize = '12px';
    promoStatus.style.color = 'var(--store-muted)';

    const totalsBox = document.createElement('div');
    totalsBox.className = 'checkout-totals';

    const updateTotalsUI = () => {
      const totals = calculateOrderTotals(summary.rows, this.checkoutDelivery, this.checkoutPromo);
      const stdFeeEl = form.querySelector('#co-standard-fee');
      if (stdFeeEl) {
        stdFeeEl.textContent = totals.freeShippingUnlocked ? 'Free' : '$12.00';
      }
      if (totals.promoApplied) {
        promoStatus.textContent = `10% savings applied (${totals.promoApplied}).`;
      } else if (this.checkoutPromo.trim()) {
        promoStatus.textContent = 'Code not recognized. Try NIKE10 for 10% off.';
      } else {
        promoStatus.textContent = 'Bundle 3+ pieces or apply NIKE10 for 10% off.';
      }

      totalsBox.innerHTML = `
        <div class="checkout-totals__row"><span>Subtotal</span><span>${formatMoneyUSD(totals.subtotal)}</span></div>
        ${totals.discount > 0 ? `<div class="checkout-totals__row"><span>Savings (${totals.promoApplied})</span><span>−${formatMoneyUSD(totals.discount)}</span></div>` : ''}
        <div class="checkout-totals__row"><span>Shipping</span><span>${totals.shipping === 0 ? 'Free' : formatMoneyUSD(totals.shipping)}</span></div>
        <div class="checkout-totals__row checkout-totals__row--total"><span>Total</span><span>${formatMoneyUSD(totals.total)}</span></div>
      `;
    };

    promoBtn.addEventListener('click', () => {
      this.checkoutPromo = promoInput.value.trim();
      updateTotalsUI();
    });

    form.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.name === 'delivery') {
        this.checkoutDelivery = target.value as DeliveryMethod;
        updateTotalsUI();
      } else if (target.name === 'payment') {
        this.checkoutPayment = target.value as PaymentMethod;
        const cardBox = form.querySelector<HTMLElement>('#co-card-box');
        if (cardBox) cardBox.hidden = this.checkoutPayment === 'cod';
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const input = {
        fullName: String(fd.get('fullName') ?? ''),
        email: String(fd.get('email') ?? ''),
        phone: String(fd.get('phone') ?? ''),
        address: String(fd.get('address') ?? ''),
        city: String(fd.get('city') ?? ''),
        postalCode: String(fd.get('postalCode') ?? ''),
        delivery: this.checkoutDelivery,
        payment: this.checkoutPayment,
        cardLast4: String(fd.get('cardLast4') ?? ''),
        promoCode: this.checkoutPromo,
      };
      const res = validateCheckoutForm(input);
      form.querySelectorAll<HTMLElement>('[data-err]').forEach((el) => {
        const key = el.dataset.err || '';
        const msg = res.errors[key] || '';
        el.textContent = msg;
        const inp = form.querySelector<HTMLInputElement>(`[name="${key}"]`);
        inp?.setAttribute('aria-invalid', msg ? 'true' : 'false');
      });
      if (!res.valid) return;

      const order = buildOrderRecord(input, summary.rows, this.orders.length);
      this.orders.unshift(order);
      this.saveOrders();
      window.__runwayBag?.clear();
      this.checkoutPromo = '';
      this.renderOrderConfirmation(order);
      window.__runwayBag?.notify(`Order ${order.orderId} confirmed`);
    });

    const summaryTitle = document.createElement('h3');
    summaryTitle.className = 'checkout-section-title';
    summaryTitle.textContent = `Order Summary (${summary.totalCount} ${summary.totalCount === 1 ? 'piece' : 'pieces'})`;

    aside.append(summaryTitle, itemsBox, promoBox, promoStatus, totalsBox);
    wrap.append(form, aside);
    this.checkoutBody.replaceChildren(wrap);
    updateTotalsUI();
  }

  private renderOrderConfirmation(order: OrderRecord): void {
    if (!this.checkoutBody) return;
    const box = document.createElement('div');
    box.className = 'order-confirm';

    const banner = document.createElement('div');
    banner.className = 'order-confirm__banner';
    const title = document.createElement('h3');
    title.textContent = `Order #${order.orderId} ${order.status}`;
    const sub = document.createElement('p');
    sub.textContent = `Confirmation queued for ${order.customer.email}. Delivering to ${order.customer.address}, ${order.customer.city} ${order.customer.postalCode}.`;
    const payLine = document.createElement('p');
    payLine.textContent = `Payment: ${order.payment === 'cod' ? 'Cash on Delivery (COD)' : 'Demo Card Verified'} · Total ${formatMoneyUSD(order.totals.total)}`;
    banner.append(title, sub, payLine);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'checkout-summary__items';
    for (const item of order.items) {
      const row = document.createElement('div');
      row.className = 'checkout-summary__item';
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      const meta = document.createElement('div');
      meta.innerHTML = `<strong>${item.name}</strong><br><span style="color:var(--store-muted);font-size:12px;">Size ${item.size} · Qty ${item.quantity}</span>`;
      const price = document.createElement('span');
      price.textContent = formatMoneyUSD(item.lineTotal);
      row.append(img, meta, price);
      itemsWrap.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '12px';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'store-btn store-btn--dark';
    doneBtn.textContent = 'Continue shopping';
    doneBtn.addEventListener('click', () => {
      this.checkoutDialog?.close();
    });
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'store-btn store-btn--ghost';
    historyBtn.textContent = 'View order history';
    historyBtn.addEventListener('click', () => {
      this.checkoutDialog?.close();
      this.openOrders();
    });
    actions.append(doneBtn, historyBtn);

    box.append(banner, itemsWrap, actions);
    this.checkoutBody.replaceChildren(box);
  }

  public openOrders(): void {
    if (!this.ordersDialog || !this.ordersBody) return;
    this.loadOrders();
    this.ordersBody.replaceChildren();

    if (this.orders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'store-empty';
      empty.innerHTML = '<p>No orders placed in this browser yet.</p>';
      this.ordersBody.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '16px';
      for (const order of this.orders) {
        const card = document.createElement('div');
        card.className = 'order-confirm__banner';
        const dateStr = new Date(order.createdAt).toLocaleString();
        const itemsText = order.items.map((i) => `${i.name} (${i.size}) × ${i.quantity}`).join(', ');

        const h3 = document.createElement('h3');
        h3.textContent = `Order #${order.orderId} · ${formatMoneyUSD(order.totals.total)}`;
        const statusP = document.createElement('p');
        statusP.textContent = `${order.status} · Placed ${dateStr}`;
        const itemsP = document.createElement('p');
        itemsP.textContent = itemsText;
        const shipP = document.createElement('p');
        shipP.textContent = `Ship to: ${order.customer.fullName}, ${order.customer.address}, ${order.customer.city} ${order.customer.postalCode}`;

        card.append(h3, statusP, itemsP, shipP);
        list.appendChild(card);
      }
      this.ordersBody.appendChild(list);
    }

    if (!this.ordersDialog.open) {
      this.ordersDialog.showModal();
    }
  }

  public openInfoModal(kind: 'size-guide' | 'shipping'): void {
    if (!this.infoDialog || !this.infoTitle || !this.infoBody) return;
    if (kind === 'size-guide') {
      this.infoTitle.textContent = 'Size & Fit Guide';
      this.infoBody.innerHTML = `
        <p class="pdp-desc" style="margin-bottom:18px;">Studio apparel is cut on a relaxed boxy block. Footwear uses standard EU court sizing.</p>
        <h3 class="pdp-field-label">Apparel (Inches)</h3>
        <table class="size-table">
          <thead><tr><th>Size</th><th>Chest</th><th>Length</th><th>Shoulder</th></tr></thead>
          <tbody>
            <tr><td>S</td><td>44"</td><td>26.5"</td><td>21.0"</td></tr>
            <tr><td>M</td><td>46"</td><td>27.5"</td><td>22.0"</td></tr>
            <tr><td>L</td><td>48"</td><td>28.5"</td><td>23.0"</td></tr>
            <tr><td>XL</td><td>50"</td><td>29.5"</td><td>24.0"</td></tr>
          </tbody>
        </table>
        <h3 class="pdp-field-label">Footwear (EU to US Men’s / CM)</h3>
        <table class="size-table">
          <thead><tr><th>EU</th><th>US Men’s</th><th>Foot Length (cm)</th></tr></thead>
          <tbody>
            <tr><td>40</td><td>7</td><td>25.0</td></tr>
            <tr><td>41</td><td>8</td><td>26.0</td></tr>
            <tr><td>42</td><td>8.5</td><td>26.5</td></tr>
            <tr><td>43</td><td>9.5</td><td>27.5</td></tr>
            <tr><td>44</td><td>10</td><td>28.0</td></tr>
            <tr><td>45</td><td>11</td><td>29.0</td></tr>
            <tr><td>46</td><td>12</td><td>30.0</td></tr>
          </tbody>
        </table>
      `;
    } else {
      this.infoTitle.textContent = 'Shipping & Returns';
      this.infoBody.innerHTML = `
        <div class="pdp-info">
          <p class="pdp-desc"><strong>Standard Ground ($12, Free over $300):</strong> Arrives in 3–5 business days from our studio fulfillment center with full tracking.</p>
          <p class="pdp-desc"><strong>Express 2-Day Air ($18):</strong> Priority dispatch for orders placed before 2:00 PM local time.</p>
          <p class="pdp-desc"><strong>30-Day Returns & Exchanges:</strong> Unworn items with original tags attached qualify for complimentary size exchanges or full refunds.</p>
          <p class="pdp-desc"><strong>Runway Look Bundles:</strong> Pair any 3 or more pieces (or use code <strong>NIKE10</strong> at checkout) to unlock 10% off automatically.</p>
        </div>
      `;
    }
    if (!this.infoDialog.open) {
      this.infoDialog.showModal();
    }
  }

  private bindEvents(): void {
    // Category tabs
    for (const btn of this.tabButtons) {
      btn.addEventListener('click', () => {
        this.wishlistOnly = false;
        this.category = (btn.dataset.storeCat as CatalogFilter) || 'all';
        this.syncFilterButtons();
        this.renderCatalog();
      });
    }

    this.wishlistTabBtn?.addEventListener('click', () => {
      this.wishlistOnly = !this.wishlistOnly;
      this.syncFilterButtons();
      this.renderCatalog();
    });

    this.searchInput?.addEventListener('input', () => {
      this.query = this.searchInput?.value ?? '';
      this.renderCatalog();
    });

    this.sortSelect?.addEventListener('change', () => {
      this.sort = (this.sortSelect?.value as CatalogSort) || 'featured';
      this.renderCatalog();
    });

    // Editorial action buttons
    document.querySelectorAll<HTMLElement>('[data-jump-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = (btn.dataset.jumpCat as CatalogFilter) || 'all';
        this.jumpToCatalogFilter(cat);
      });
    });

    document.querySelectorAll<HTMLElement>('[data-jump-look]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.jumpLook || 0);
        this.jumpToRunwayLook(idx);
      });
    });

    // Footer modals & newsletter
    document.getElementById('open-orders-btn')?.addEventListener('click', () => this.openOrders());
    document
      .getElementById('open-size-guide-btn')
      ?.addEventListener('click', () => this.openInfoModal('size-guide'));
    document
      .getElementById('open-shipping-btn')
      ?.addEventListener('click', () => this.openInfoModal('shipping'));

    const newsForm = document.getElementById('newsletter-form') as HTMLFormElement | null;
    const newsInput = document.getElementById('newsletter-email') as HTMLInputElement | null;
    const newsMsg = document.getElementById('newsletter-msg');
    newsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = (newsInput?.value ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        if (newsMsg) newsMsg.textContent = 'Please enter a valid email address.';
        return;
      }
      if (newsMsg) newsMsg.textContent = `Subscribed ${val} to Runway release dispatches.`;
      if (newsInput) newsInput.value = '';
    });

    // Dialog close & backdrop dismiss
    const wireDialogDismiss = (dlg: HTMLDialogElement | null, closeId: string) => {
      document.getElementById(closeId)?.addEventListener('click', () => dlg?.close());
      dlg?.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const inside =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (!inside) dlg.close();
      });
    };
    wireDialogDismiss(this.pdpDialog, 'close-pdp');
    wireDialogDismiss(this.checkoutDialog, 'close-checkout');
    wireDialogDismiss(this.ordersDialog, 'close-orders');
    wireDialogDismiss(this.infoDialog, 'close-info');

    // Checkout trigger from Bag dialog
    window.addEventListener('runway:open-checkout', () => {
      this.openCheckout();
    });

    // Populate footer look jumpers cleanly if needed
    const lookLinksList = document.getElementById('footer-looks-list');
    if (lookLinksList && lookLinksList.children.length === 0) {
      NATIVE_CATALOG.looks.forEach((look, idx) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = `${String(idx + 1).padStart(2, '0')} ${look.name}`;
        btn.addEventListener('click', () => this.jumpToRunwayLook(idx));
        li.appendChild(btn);
        lookLinksList.appendChild(li);
      });
    }

    // Active header navigation syncing
    const navAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.site-header nav a[href^="#"]')
    );
    const setActiveNav = (hash: string) => {
      for (const a of navAnchors) {
        if (a.getAttribute('href') === hash) {
          a.setAttribute('aria-current', 'page');
        } else {
          a.removeAttribute('aria-current');
        }
      }
    };
    for (const a of navAnchors) {
      a.addEventListener('click', () => {
        const href = a.getAttribute('href');
        if (href) setActiveNav(href);
      });
    }
    if ('IntersectionObserver' in window) {
      const sectionIds = ['#home', '#catalog', '#runway'];
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveNav(`#${entry.target.id}`);
            }
          }
        },
        { rootMargin: '-35% 0px -50% 0px', threshold: 0 }
      );
      for (const id of sectionIds) {
        const el = document.querySelector(id);
        if (el) obs.observe(el);
      }
    }
  }
}
