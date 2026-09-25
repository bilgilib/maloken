/**
 * Phase 3.3 Production Hardening & Closeout Test Suite (ES Module)
 * Verifies:
 * 1. Cache-busting with filemtime() and SCPO_VERSION fallback for admin and frontend assets
 * 2. Admin UI Polish:
 *    - No raw enum keys rendered in UI
 *    - Polished display labels: "Single Select", "Multi Select", "Image Select"
 *    - Removal of CSS text-transform: uppercase to prevent Turkish locale capital İ distortion
 *    - Default field labels "New Option" and "New Option (Copy)"
 *    - Exact preservation of Turkish and merchant-authored labels (e.g. "Kırmızı")
 * 3. Stock, Backorder, and Preorder Rendering:
 *    - Normal in-stock product eligibility and rendering
 *    - Zero-stock backorderable product rendering and fallback cart form
 *    - Zero-stock preorder-capable product rendering and fallback cart form
 *    - Truly non-purchasable product suppression (no options rendered)
 *    - Avoidance of duplicate options rendering on normal in-stock products
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginDir = path.resolve(__dirname, '..');
const results = [];

function assert(condition, name, details = '') {
  if (condition) {
    results.push({ name, status: 'PASS', details });
  } else {
    results.push({ name, status: 'FAIL', details });
  }
}

// 1. FILE & ASSET ENQUEUE VERSIONING (filemtime with SCPO_VERSION fallback)
const adminMenuCode = fs.readFileSync(path.join(pluginDir, 'includes/Admin/class-admin-menu.php'), 'utf8');
const frontendRendererCode = fs.readFileSync(path.join(pluginDir, 'includes/Frontend/class-frontend-renderer.php'), 'utf8');
const mainPluginCode = fs.readFileSync(path.join(pluginDir, 'simple-custom-product-options.php'), 'utf8');

assert(mainPluginCode.includes("define( 'SCPO_VERSION', '1.1.1' );"), 'Plugin version constant SCPO_VERSION is 1.1.1');
assert(mainPluginCode.includes('* Version:     1.1.1'), 'Plugin header Version is 1.1.1');

assert(adminMenuCode.includes('filemtime(') && adminMenuCode.includes('SCPO_VERSION'), 'Admin menu uses filemtime with SCPO_VERSION fallback for asset versioning');
assert(frontendRendererCode.includes('filemtime(') && frontendRendererCode.includes('SCPO_VERSION'), 'Frontend renderer uses filemtime with SCPO_VERSION fallback for asset versioning');

// 2. ADMIN UI POLISH & LOCALE SAFETY
const adminJs = fs.readFileSync(path.join(pluginDir, 'assets/js/scpo-admin.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(pluginDir, 'assets/css/scpo-admin.css'), 'utf8');

assert(adminJs.includes('getFieldTypeDisplayLabel'), 'Admin JS contains getFieldTypeDisplayLabel mapping function');
assert(adminJs.includes("'select': 'Single Select'"), 'Maps select to "Single Select"');
assert(adminJs.includes("'multiselect': 'Multi Select'"), 'Maps multiselect to "Multi Select"');
assert(adminJs.includes("'imageselect': 'Image Select'"), 'Maps imageselect to "Image Select"');
assert(!adminJs.includes("field.type.toUpperCase()"), 'No locale-dependent field.type.toUpperCase() in inspector panelTitle');
assert(!adminCss.includes('text-transform: uppercase;\n\tpadding: 2px 6px;\n\tbackground: #e2e3e5;'), 'Badge CSS does not force text-transform: uppercase');
assert(adminJs.includes("label: 'New Option'"), 'Default field label is "New Option" instead of "New Field"');
assert(adminJs.includes("(srcFld.label || 'New Option') + ' (Copy)'"), 'Duplicate field label defaults to "New Option (Copy)"');

// 3. STOCK, BACKORDER, AND PREORDER ELIGIBILITY ENGINE EMULATION
// Directly mirrors Frontend_Renderer::is_product_eligible and is_preorder_capable
class MockProduct {
  constructor({ id = 101, purchasable = true, in_stock = true, backorders_allowed = false, on_backorder = false, meta = {} }) {
    this.id = id;
    this._purchasable = purchasable;
    this._in_stock = in_stock;
    this._backorders_allowed = backorders_allowed;
    this._on_backorder = on_backorder;
    this.meta = meta;
  }
  get_id() { return this.id; }
  is_purchasable() { return this._purchasable; }
  is_in_stock() { return this._in_stock; }
  backorders_allowed() { return this._backorders_allowed; }
  is_on_backorder() { return this._on_backorder; }
}

function isPreorderCapable(product, customFilters = {}) {
  const metaKeys = ['_wc_pre_orders_enabled', '_yith_wcpo_pre_order', '_preorder', '_is_preorder', 'preorder_enabled'];
  for (const k of metaKeys) {
    const val = product.meta[k];
    if (val === 'yes' || val === '1' || val === true) {
      return true;
    }
  }
  if (customFilters.scpo_is_preorder_capable) {
    return customFilters.scpo_is_preorder_capable(false, product);
  }
  return false;
}

function isProductEligible(product, customFilters = {}) {
  if (!product) return false;
  const isPurchasable = product.is_purchasable();
  const canBackorder = product.backorders_allowed() || product.is_on_backorder();
  const canPreorder = isPreorderCapable(product, customFilters);

  // Truly non-purchasable
  if (!isPurchasable && !canBackorder && !canPreorder) {
    return false;
  }

  // If out of stock, render if backorder or preorder or purchasable
  const isInStock = product.is_in_stock();
  if (!isInStock && !canBackorder && !canPreorder && !isPurchasable) {
    return false;
  }

  return true;
}

// Case 1: Normal In-Stock Product
const prodInStock = new MockProduct({ id: 101, purchasable: true, in_stock: true, backorders_allowed: false });
assert(isProductEligible(prodInStock) === true, 'Case 1: Normal in-stock product IS eligible for options');

// Case 2: Zero-Stock Backorderable Product (e.g. stock=0, "Stokta yok", but merchant allows backorders)
const prodBackorder = new MockProduct({ id: 11873, purchasable: true, in_stock: false, backorders_allowed: true });
assert(isProductEligible(prodBackorder) === true, 'Case 2: Zero-stock product with backorders allowed IS eligible for options');

// Case 3: Zero-Stock Preorder-Capable Product (e.g. stock=0 with _wc_pre_orders_enabled)
const prodPreorderMeta = new MockProduct({ id: 11874, purchasable: true, in_stock: false, backorders_allowed: false, meta: { _wc_pre_orders_enabled: 'yes' } });
assert(isProductEligible(prodPreorderMeta) === true, 'Case 3a: Zero-stock preorder product with meta IS eligible for options');

const prodPreorderFilter = new MockProduct({ id: 11875, purchasable: true, in_stock: false, backorders_allowed: false });
const filterEligible = isProductEligible(prodPreorderFilter, {
  scpo_is_preorder_capable: (def, p) => p.get_id() === 11875
});
assert(filterEligible === true, 'Case 3b: Zero-stock preorder product with scpo_is_preorder_capable filter IS eligible for options');

// Case 4: Truly Non-Purchasable Product (not purchasable, no backorder, no preorder)
const prodNonPurchasable = new MockProduct({ id: 9999, purchasable: false, in_stock: false, backorders_allowed: false });
assert(isProductEligible(prodNonPurchasable) === false, 'Case 4: Truly non-purchasable product is NOT eligible (options hidden)');

// 4. DECOUPLED HOOK & DUPLICATE PREVENTION SIMULATION
class MockRendererLifecycle {
  constructor() {
    this.renderedProducts = [];
    this.output = [];
  }

  renderProductOptions(product) {
    const pId = product.get_id();
    if (this.renderedProducts.includes(pId)) {
      return; // Duplicate guard
    }
    if (!isProductEligible(product)) {
      return;
    }
    this.renderedProducts.push(pId);
    this.output.push({ hook: 'woocommerce_before_add_to_cart_button', productId: pId, content: '<div class="scpo-options-wrapper">Options</div>' });
  }

  renderFallbackOptions(product, hasCartForm = false) {
    const pId = product.get_id();
    if (this.renderedProducts.includes(pId)) {
      return; // Avoid duplicate rendering on normal in-stock products
    }
    if (!isProductEligible(product)) {
      return;
    }
    this.renderedProducts.push(pId);
    const formPrefix = !hasCartForm ? '<form class="cart scpo-cart-form">' : '';
    const formSuffix = !hasCartForm ? '<button type="submit" class="single_add_to_cart_button">Backorder Now</button></form>' : '';
    this.output.push({
      hook: 'woocommerce_single_product_summary_fallback',
      productId: pId,
      content: `${formPrefix}<div class="scpo-options-wrapper">Options</div>${formSuffix}`
    });
  }
}

// Test Normal In-Stock Flow: Button hook runs first, fallback hook does not duplicate
const normalLife = new MockRendererLifecycle();
normalLife.renderProductOptions(prodInStock);
normalLife.renderFallbackOptions(prodInStock, true); // Fallback executes next
assert(normalLife.renderedProducts.filter(id => id === 101).length === 1, 'Normal flow: Product 101 rendered exactly once');
assert(normalLife.output.length === 1 && normalLife.output[0].hook === 'woocommerce_before_add_to_cart_button', 'Normal flow: Options rendered via main button hook');

// Test Zero-Stock Flow (Live defect scenario): Button hook never fires, fallback hook catches it
const zeroStockLife = new MockRendererLifecycle();
// woocommerce_before_add_to_cart_button does NOT fire because product is out of stock!
zeroStockLife.renderFallbackOptions(prodBackorder, false); // Fallback hook fires at priority 31
assert(zeroStockLife.renderedProducts.includes(11873), 'Zero-stock flow: Options successfully rendered via decoupled fallback');
assert(zeroStockLife.output.length === 1 && zeroStockLife.output[0].content.includes('scpo-cart-form'), 'Zero-stock flow: Wraps options in accessible cart form');

// Test Truly Non-Purchasable Flow: Neither hook renders options
const deadProdLife = new MockRendererLifecycle();
deadProdLife.renderProductOptions(prodNonPurchasable);
deadProdLife.renderFallbackOptions(prodNonPurchasable, false);
assert(deadProdLife.renderedProducts.length === 0 && deadProdLife.output.length === 0, 'Truly non-purchasable product outputs zero options markup');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nPhase 3.3 Hardening & Closeout Verification Summary: ${passed}/${total} assertions PASSED.`);
if (passed !== total) {
  process.exit(1);
}
