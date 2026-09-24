/**
 * SCPO Admin Runtime Compatibility & Hydration Smoke-Test Suite
 *
 * Deterministically tests:
 * 1. Populated #scpo_config_json hydrates 1 section and 4 fields (Gift Wrap, Engraving, Engraving Text, Delivery Date).
 * 2. Empty schema displays welcoming empty state (#scpo-empty-state visible, #scpo-sections-canvas hidden).
 * 3. Clicking "+ Add Section" updates canonical state, appends DOM card, and synchronizes JSON.
 * 4. Tab switching exposes the JSON textarea (#scpo-tab-json display block) and keeps state synchronized.
 * 5. Save serialization preserves existing stable field IDs without data loss.
 * 6. Malformed JSON renders a visible admin error notice with exact reason without overwriting the textarea.
 * 7. Initialization executes correctly both on DOMContentLoaded and after DOMContentLoaded (readyState === 'complete').
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
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

// Lightweight deterministic DOM implementation
class MockClassList {
  constructor(el) {
    this.el = el;
    this._classes = new Set();
  }
  add(...classes) {
    classes.forEach(c => this._classes.add(c));
    this.el.className = Array.from(this._classes).join(' ');
  }
  remove(...classes) {
    classes.forEach(c => this._classes.delete(c));
    this.el.className = Array.from(this._classes).join(' ');
  }
  contains(c) {
    return this._classes.has(c);
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.classList = new MockClassList(this);
    this.listeners = {};
    this._value = '';
    this.textContent = '';
    this.innerText = '';
    this.innerHTML_val = '';
  }

  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }

  dispatchEvent(evt) {
    const list = this.listeners[evt.type] || [];
    list.forEach(cb => cb(evt));
  }

  get className() {
    return Array.from(this.classList._classes).join(' ');
  }

  set className(val) {
    this.classList._classes.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
    }
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = String(v);
  }

  get innerHTML() {
    return this.innerHTML_val;
  }

  set innerHTML(html) {
    this.innerHTML_val = html;
    this.children = [];
    // Basic extraction of children for testing purposes
    if (html.includes('scpo-section-card')) {
      const card = new MockElement('div');
      card.className = 'scpo-section-card';
      const secIdMatch = html.match(/data-sec-id="([^"]+)"/);
      if (secIdMatch) card.setAttribute('data-sec-id', secIdMatch[1]);
      this.appendChild(card);
    }
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    newChild.parentNode = this;
    const idx = this.children.indexOf(refChild);
    if (idx === -1) {
      this.children.push(newChild);
    } else {
      this.children.splice(idx, 0, newChild);
    }
    return newChild;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const matched = [];
    function traverse(node) {
      if (node.matches(sel)) matched.push(node);
      for (const ch of node.children) traverse(ch);
    }
    for (const ch of this.children) traverse(ch);
    return matched;
  }

  matches(sel) {
    if (sel.includes('[')) {
      const parts = sel.split('[');
      const prefix = parts[0];
      const attrPart = '[' + parts[1];
      if (prefix && !this.matches(prefix)) return false;
      const m = attrPart.match(/\[([a-zA-Z0-9_-]+)="?([^"\]]*)"?\]/);
      if (m) return this.getAttribute(m[1]) === m[2];
      return true;
    }
    if (sel.startsWith('#')) return this.getAttribute('id') === sel.slice(1);
    if (sel.startsWith('.')) {
      const classes = sel.slice(1).split('.');
      return classes.every(c => this.classList.contains(c));
    }
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(sel)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  focus() {}
}

class MockDocument {
  constructor(htmlContent = '') {
    this.readyState = 'complete';
    this.listeners = {};
    this.root = new MockElement('html');
    this.body = new MockElement('body');
    this.root.appendChild(this.body);
  }

  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }

  dispatchEvent(evt) {
    const list = this.listeners[evt.type] || [];
    list.forEach(cb => cb(evt));
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this.querySelector('#' + id);
  }

  querySelector(sel) {
    return this.root.querySelector(sel);
  }

  querySelectorAll(sel) {
    return this.root.querySelectorAll(sel);
  }
}

function buildMockEditorDOM(initialConfigJson = '', readyState = 'complete') {
  const doc = new MockDocument();
  doc.readyState = readyState;

  // Wrap container
  const wrap = doc.createElement('div');
  wrap.className = 'wrap scpo-admin-wrap';
  doc.body.appendChild(wrap);

  // Tab buttons
  const tabContainer = doc.createElement('div');
  tabContainer.className = 'scpo-builder-tabs';
  ['visual', 'preview', 'json'].forEach((t, i) => {
    const btn = doc.createElement('button');
    btn.className = 'scpo-tab-btn' + (i === 0 ? ' active' : '');
    btn.setAttribute('data-tab', t);
    tabContainer.appendChild(btn);
  });
  wrap.appendChild(tabContainer);

  // Form
  const form = doc.createElement('form');
  form.setAttribute('id', 'scpo-editor-form');
  wrap.appendChild(form);

  // Title input
  const titleInput = doc.createElement('input');
  titleInput.setAttribute('id', 'scpo_title');
  titleInput.value = 'Store Option Set 13152';
  form.appendChild(titleInput);

  // TAB 1: Visual
  const tabVisual = doc.createElement('div');
  tabVisual.setAttribute('id', 'scpo-tab-visual');
  tabVisual.className = 'scpo-tab-content';
  tabVisual.style.display = 'block';

  const addSecBtn = doc.createElement('button');
  addSecBtn.setAttribute('id', 'scpo-btn-add-section');
  tabVisual.appendChild(addSecBtn);

  const emptyState = doc.createElement('div');
  emptyState.setAttribute('id', 'scpo-empty-state');
  emptyState.style.display = 'none';

  const emptyAddBtn = doc.createElement('button');
  emptyAddBtn.setAttribute('id', 'scpo-empty-add-section-btn');
  emptyState.appendChild(emptyAddBtn);
  tabVisual.appendChild(emptyState);

  const canvas = doc.createElement('div');
  canvas.setAttribute('id', 'scpo-sections-canvas');
  tabVisual.appendChild(canvas);

  form.appendChild(tabVisual);

  // TAB 2: Preview
  const tabPreview = doc.createElement('div');
  tabPreview.setAttribute('id', 'scpo-tab-preview');
  tabPreview.className = 'scpo-tab-content';
  tabPreview.style.display = 'none';
  const previewContainer = doc.createElement('div');
  previewContainer.setAttribute('id', 'scpo-live-preview-container');
  tabPreview.appendChild(previewContainer);
  form.appendChild(tabPreview);

  // TAB 3: JSON
  const tabJson = doc.createElement('div');
  tabJson.setAttribute('id', 'scpo-tab-json');
  tabJson.className = 'scpo-tab-content';
  tabJson.style.display = 'none';
  const textarea = doc.createElement('textarea');
  textarea.setAttribute('id', 'scpo_config_json');
  textarea.value = initialConfigJson;
  tabJson.appendChild(textarea);
  form.appendChild(tabJson);

  // Contextual panel
  const panel = doc.createElement('div');
  panel.setAttribute('id', 'scpo-contextual-panel');
  panel.style.display = 'none';
  const panelTitle = doc.createElement('h3');
  panelTitle.setAttribute('id', 'scpo-panel-title');
  panel.appendChild(panelTitle);
  const panelContent = doc.createElement('div');
  panelContent.setAttribute('id', 'scpo-panel-content');
  panel.appendChild(panelContent);
  form.appendChild(panel);

  const win = {
    document: doc,
    addEventListener: (type, cb) => doc.addEventListener(type, cb),
    confirm: () => true
  };

  return { doc, win, textarea, canvas, emptyState, tabVisual, tabJson, tabPreview };
}

function runAdminScript(win, doc) {
  const code = fs.readFileSync(path.join(pluginDir, 'assets/js/scpo-admin.js'), 'utf8');
  const context = vm.createContext({
    window: win,
    document: doc,
    setTimeout: (fn) => fn(),
    console,
    parseFloat,
    parseInt,
    isNaN,
    JSON,
    String,
    Array,
    Math
  });
  vm.runInContext(code, context);
}

// ==========================================
// TEST 1: Hydrate Populated 1 Section, 4 Fields
// ==========================================
const samplePopulatedSchema = {
  $schema_version: '1.0.0',
  id: 'set_13152',
  title: 'Luxury Options',
  sections: [
    {
      id: 'sec_options',
      title: 'Personalization & Packaging',
      fields: [
        { id: 'fld_wrap', type: 'checkbox', label: 'Gift Wrap', required: false, pricing: { category: 'per_unit', mode: 'fixed', amount: 5 } },
        { id: 'fld_engraving', type: 'radio', label: 'Engraving', required: true, options: [{ id: 'opt_yes', label: 'Yes', price: 10 }, { id: 'opt_no', label: 'No', price: 0 }] },
        { id: 'fld_engraving_text', type: 'text', label: 'Engraving Text', required: false, max_length: 25 },
        { id: 'fld_date', type: 'date', label: 'Delivery Date', required: true }
      ]
    }
  ]
};

const t1 = buildMockEditorDOM(JSON.stringify(samplePopulatedSchema, null, 2), 'complete');
runAdminScript(t1.win, t1.doc);

assert(t1.emptyState.style.display === 'none', 'Populated config: Empty state is hidden');
assert(t1.canvas.style.display === 'block', 'Populated config: Canvas is displayed (block)');
assert(t1.canvas.children.length === 1, 'Populated config: Exactly 1 section card rendered in canvas');

const renderedCard = t1.canvas.children[0];
assert(renderedCard && renderedCard.getAttribute('data-sec-id') === 'sec_options', 'Populated config: Section ID preserved (sec_options)');
const renderedFields = renderedCard.querySelectorAll('.scpo-field-item');
assert(renderedFields.length === 4, 'Populated config: All 4 fields rendered (Gift Wrap, Engraving, Engraving Text, Delivery Date)');

const fieldLabels = renderedFields.map(f => f.innerHTML);
assert(fieldLabels.some(l => l.includes('Gift Wrap')), 'Populated config: Gift Wrap field rendered');
assert(fieldLabels.some(l => l.includes('Engraving')), 'Populated config: Engraving field rendered');
assert(fieldLabels.some(l => l.includes('Engraving Text')), 'Populated config: Engraving Text field rendered');
assert(fieldLabels.some(l => l.includes('Delivery Date')), 'Populated config: Delivery Date field rendered');

// ==========================================
// TEST 2: Empty Schema Shows Welcoming Empty State
// ==========================================
const t2 = buildMockEditorDOM('', 'complete');
runAdminScript(t2.win, t2.doc);

assert(t2.emptyState.style.display === 'block', 'Empty config: Welcoming empty state is visible (display: block)');
assert(t2.canvas.style.display === 'none', 'Empty config: Canvas is hidden (display: none)');
assert(t2.canvas.children.length === 0, 'Empty config: Canvas has 0 section cards');

// ==========================================
// TEST 3: Clicking "+ Add Section" from Empty State
// ==========================================
const emptyAddBtn = t2.doc.getElementById('scpo-empty-add-section-btn');
t2.doc.dispatchEvent({
  type: 'click',
  target: emptyAddBtn,
  preventDefault: () => {}
});

assert(t2.emptyState.style.display === 'none', 'Click "+ Add First Section": Empty state hidden');
assert(t2.canvas.style.display === 'block', 'Click "+ Add First Section": Canvas shown');
assert(t2.canvas.children.length === 1, 'Click "+ Add First Section": 1 section card appended');
const newJson = JSON.parse(t2.textarea.value);
assert(newJson.sections && newJson.sections.length === 1, 'Click "+ Add First Section": Canonical JSON synchronized with 1 section');

// ==========================================
// TEST 4: Tab Switching Exposes Advanced JSON Textarea
// ==========================================
const jsonTabBtn = t1.doc.querySelector('.scpo-tab-btn[data-tab="json"]');
t1.doc.dispatchEvent({
  type: 'click',
  target: jsonTabBtn,
  preventDefault: () => {}
});

assert(t1.tabJson.style.display === 'block', 'Tab Switch: #scpo-tab-json is visible (display: block)');
assert(t1.tabVisual.style.display === 'none', 'Tab Switch: #scpo-tab-visual is hidden (display: none)');
assert(t1.tabPreview.style.display === 'none', 'Tab Switch: #scpo-tab-preview is hidden (display: none)');
assert(jsonTabBtn.classList.contains('active'), 'Tab Switch: Advanced JSON button has .active class');
assert(t1.textarea.value.includes('fld_engraving_text'), 'Tab Switch: Textarea contains synchronized schema');

// Switch back to Visual
const visualTabBtn = t1.doc.querySelector('.scpo-tab-btn[data-tab="visual"]');
t1.doc.dispatchEvent({
  type: 'click',
  target: visualTabBtn,
  preventDefault: () => {}
});

assert(t1.tabVisual.style.display === 'block', 'Tab Switch back: #scpo-tab-visual is visible');
assert(t1.tabJson.style.display === 'none', 'Tab Switch back: #scpo-tab-json is hidden');

// ==========================================
// TEST 5: Save Serialization Preserves Field IDs
// ==========================================
const form = t1.doc.getElementById('scpo-editor-form');
t1.doc.dispatchEvent({
  type: 'submit',
  target: form,
  preventDefault: () => {}
});

const savedSchema = JSON.parse(t1.textarea.value);
const savedFieldIds = savedSchema.sections[0].fields.map(f => f.id);
assert(savedFieldIds.includes('fld_wrap'), 'Save serialization: Preserves fld_wrap ID');
assert(savedFieldIds.includes('fld_engraving'), 'Save serialization: Preserves fld_engraving ID');
assert(savedFieldIds.includes('fld_engraving_text'), 'Save serialization: Preserves fld_engraving_text ID');
assert(savedFieldIds.includes('fld_date'), 'Save serialization: Preserves fld_date ID');

// ==========================================
// TEST 6: Malformed JSON Shows Visible Admin Error Notice Without Clobbering
// ==========================================
const malformedRaw = '{ "id": "broken", sections: [unquoted] ';
const t6 = buildMockEditorDOM(malformedRaw, 'complete');
runAdminScript(t6.win, t6.doc);

assert(t6.textarea.value === malformedRaw, 'Malformed JSON: Textarea content preserved strictly without data loss');
assert(t6.canvas.style.display === 'block', 'Malformed JSON: Canvas is visible for error banner');
assert(t6.canvas.innerHTML.includes('notice-error'), 'Malformed JSON: Admin error notice rendered in canvas');
assert(t6.canvas.innerHTML.includes('Malformed JSON syntax in #scpo_config_json'), 'Malformed JSON: Exact error description rendered in canvas notice');

// ==========================================
// TEST 7: Lifecycle Resilience (DOMContentLoaded vs complete)
// ==========================================
const t7 = buildMockEditorDOM(JSON.stringify(samplePopulatedSchema), 'loading');
runAdminScript(t7.win, t7.doc);
// Initially still loading, run should happen on DOMContentLoaded
assert(t7.canvas.children.length === 0, 'Lifecycle loading: Not initialized before DOM ready');

// Fire DOMContentLoaded
t7.doc.dispatchEvent({ type: 'DOMContentLoaded' });
assert(t7.canvas.children.length === 1, 'Lifecycle loading: Initialized immediately upon DOMContentLoaded');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nAdmin DOM Runtime Smoke-Test Summary: ${passed}/${total} assertions PASSED.`);
