import { StylingBagController } from './runway/bag';
import './runway/runway-element';
import { initGradientBars } from './store/gradient-bars';
import { StorefrontController } from './store/storefront';

const bag = new StylingBagController();
window.__runwayBag = bag;
new StorefrontController();
initGradientBars();

document.getElementById('banner-open-bag')?.addEventListener('click', () => {
  bag.openDialog();
});

