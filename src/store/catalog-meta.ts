import { NATIVE_CATALOG, type CatalogItem } from '../runway/catalog';

export type ProductCategory = 'footwear' | 'apparel';
export type CatalogFilter = 'all' | ProductCategory;
export type CatalogSort = 'featured' | 'price-asc' | 'price-desc';

export interface ProductEditorialMeta {
  category: ProductCategory;
  vendor: string;
  sku: string;
  colorway: string;
  tagline: string;
  description: string;
  materials: string;
  fitNote: string;
  badge?: string;
}

export interface EnrichedCatalogItem extends CatalogItem {
  category: ProductCategory;
  vendor: string;
  sku: string;
  colorway: string;
  tagline: string;
  description: string;
  materials: string;
  fitNote: string;
  badge?: string;
  looks: Array<{ index: number; name: string }>;
}

const PRODUCT_META: Record<string, ProductEditorialMeta> = {
  'tatum-5-orbit-copy': {
    category: 'footwear',
    vendor: 'Nikey | Password: 1',
    sku: 'RW-FW-012',
    colorway: 'Black / Sail / Bone',
    tagline: 'Court-heritage silhouette anchored for daily rotation.',
    description:
      'Stitched leather overlays meet full-length responsive cushioning in a monochrome finish tuned for wide-leg denim and studio tailoring.',
    materials: 'Full-grain tumbled leather upper, Phylon midsole, herringbone rubber outsole.',
    fitNote: 'True to EU sizing. Take your regular court size.',
    badge: 'Runway Core',
  },
  tshirt: {
    category: 'apparel',
    vendor: 'Nike',
    sku: 'RW-AP-201',
    colorway: 'Optic White',
    tagline: '310 GSM heavyweight jersey with dropped studio shoulder.',
    description:
      'Cut with a boxy drape and structured ribbed collar so it holds its frame beneath knitwear or stands cleanly on its own.',
    materials: '100% combed heavyweight organic cotton, enzyme-washed for dry handfeel.',
    fitNote: 'Relaxed boxy fit. Size down for a closer shoulder.',
    badge: 'Featured in 6 Looks',
  },
  sweatshirt: {
    category: 'apparel',
    vendor: 'Nike',
    sku: 'RW-AP-304',
    colorway: 'Charcoal / Slate',
    tagline: 'Brushed loopback fleece with clean tonal seamwork.',
    description:
      'Substantial 460 GSM fleece engineered for architectural volume through the sleeve and a crisp hem that sits neatly at the waist.',
    materials: '84% organic cotton, 16% recycled polyester heavyweight French terry.',
    fitNote: 'Relaxed studio block with structured cuffs.',
  },
  'tatum-5-orbit': {
    category: 'footwear',
    vendor: 'Nikey | Password: 1',
    sku: 'RW-FW-005',
    colorway: 'Orbit Monochrome',
    tagline: 'Low-profile court chassis with sculpted heel lock.',
    description:
      'Lightweight containment plates paired with clean neutral paneling so the silhouette moves seamlessly from concrete gallery floors to the street.',
    materials: 'Engineered mesh and nubuck quarters, Cushlon carrier foam, translucent traction pod.',
    fitNote: 'Standard EU fit with sculpted midfoot lock.',
    badge: 'Orbit Capsule',
  },
  'hoodie-black': {
    category: 'apparel',
    vendor: 'Nike',
    sku: 'RW-AP-410',
    colorway: 'Obsidian Black',
    tagline: 'Double-lined hood with zero-drawcord minimalism.',
    description:
      'A dense matte-black fleece pullover stripped of exterior noise—built with deep kangaroo pocket welt seams and reinforced rib.',
    materials: '480 GSM garment-dyed cotton fleece, double-layer hood.',
    fitNote: 'Oversized drape. True to size for intended silhouette.',
    badge: 'Best Seller',
  },
  'sweatshirt-plus': {
    category: 'apparel',
    vendor: 'Nike',
    sku: 'RW-AP-318',
    colorway: 'Moss Olive',
    tagline: 'Pigment-dyed olive crewneck built for tonal layering.',
    description:
      'Grounded earth-olive knitwear with subtle tonal variation and reverse-weave side gussets to prevent vertical shrinkage.',
    materials: '450 GSM pigment-dyed cotton jersey fleece, gusseted side panels.',
    fitNote: 'Balanced relaxed fit across chest and shoulders.',
  },
  hoodie: {
    category: 'apparel',
    vendor: 'Nike',
    sku: 'RW-AP-402',
    colorway: 'Heather Ash',
    tagline: 'Marled studio fleece with articulated raglan sleeves.',
    description:
      'Soft brushed interior meets a crisp architectural outer face, finished in timeless heather grey for effortless pairing with washed denim.',
    materials: '80% combed cotton, 20% recycled fleece knit.',
    fitNote: 'Classic relaxed hoodie proportion.',
  },
  'air-jordan-12-retro-copy': {
    category: 'footwear',
    vendor: 'Nikey | Password: 1',
    sku: 'RW-FW-077',
    colorway: 'Wolf Grey / Chalk',
    tagline: 'Low-top agility tooling in a muted tonal palette.',
    description:
      'Built for responsive lateral support with understated matte finishes and clean midsole geometry that complements tailored outerwear.',
    materials: 'Synthetic suede mudguard, Air-Sole cushioning unit, non-marking rubber tread.',
    fitNote: 'True to EU sizing.',
  },
};

export function getEnrichedCatalog(): EnrichedCatalogItem[] {
  return NATIVE_CATALOG.items.map((item) => {
    const meta = PRODUCT_META[item.id] ?? {
      category: item.sizes.some((s) => /^\d+$/.test(s)) ? 'footwear' : 'apparel',
      vendor: 'Nike',
      sku: `RW-${item.id.toUpperCase()}`,
      colorway: 'Studio Neutral',
      tagline: 'Curated runway piece.',
      description: 'Styled in the Nike Studio Runway collection.',
      materials: 'Premium studio construction.',
      fitNote: 'True to size.',
    };

    const looks = NATIVE_CATALOG.looks
      .map((look, index) => ({ index, name: look.name, products: look.products }))
      .filter((look) => look.products.includes(item.id))
      .map(({ index, name }) => ({ index, name }));

    return {
      ...item,
      ...meta,
      looks,
    };
  });
}

export function filterAndSortCatalog(
  items: EnrichedCatalogItem[],
  options: {
    category: CatalogFilter;
    query: string;
    sort: CatalogSort;
  }
): EnrichedCatalogItem[] {
  const q = options.query.trim().toLowerCase();
  let filtered = items.filter((item) => {
    if (options.category !== 'all' && item.category !== options.category) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      item.name,
      item.vendor,
      item.colorway,
      item.tagline,
      item.category,
      ...item.looks.map((l) => l.name),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  if (options.sort === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  } else if (options.sort === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
  }

  return filtered;
}
