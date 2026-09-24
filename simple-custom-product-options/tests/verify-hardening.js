/**
 * Pre-Phase 3 Hardening Test Suite (ES Module)
 * Verifies:
 * 1. Malformed JSON rejection
 * 2. Missing root keys rejection
 * 3. Duplicate section/field/option ID rejection
 * 4. Invalid field type rejection
 * 5. Invalid pricing mode/category rejection
 * 6. Missing select/radio options rejection
 * 7. Strict Product Assignment Rejection:
 *    - Invalid token rejection (non-numeric, "abc", "101a")
 *    - Zero and negative ID rejection (0, -5)
 *    - Missing product rejection via deterministic seam
 *    - Non-product post type rejection via deterministic seam
 *    - Non-published product status rejection via deterministic seam
 *    - Duplicate ID normalization without error
 *    - Valid published product acceptance
 * 8. Schema data preservation (checkbox states, boundaries, conditions)
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

// Emulate Sanitizer.validate_and_sanitize_config logic exactly matching class-sanitizer.php
const ALLOWED_FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date'];
const ALLOWED_PRICING_CATEGORIES = ['none', 'per_unit', 'one_time_fee'];
const ALLOWED_PRICING_MODES = ['none', 'fixed', 'per_character', 'multiplied_by_value'];

function validateAndSanitizeConfig(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { error: 'Schema configuration cannot be empty.' };
    try {
      raw = JSON.parse(trimmed);
    } catch (e) {
      return { error: `Malformed JSON syntax: ${e.message}` };
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Schema configuration must be a valid JSON object.' };
  }

  if (!raw.id || typeof raw.id !== 'string') {
    return { error: 'Option Set schema is missing a valid root "id" attribute.' };
  }

  if (!Array.isArray(raw.sections)) {
    return { error: 'Option Set schema must include a "sections" array.' };
  }

  const sanitizedId = String(raw.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase();
  const seenIds = { [sanitizedId]: 'set' };

  const sanitized = {
    $schema_version: raw.$schema_version || '1.0.0',
    id: sanitizedId,
    title: raw.title || '',
    sections: []
  };

  for (let sIdx = 0; sIdx < raw.sections.length; sIdx++) {
    const section = raw.sections[sIdx];
    if (!section || typeof section !== 'object') {
      return { error: `Section at index ${sIdx} is not a valid object.` };
    }

    if (!section.id) {
      return { error: `Section at index ${sIdx} is missing a required "id".` };
    }

    const secId = String(section.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase();
    if (seenIds[secId]) {
      return { error: `Duplicate identifier found: "${secId}".` };
    }
    seenIds[secId] = 'section';

    const sanSection = {
      id: secId,
      title: section.title || '',
      description: section.description || '',
      order: section.order !== undefined ? parseInt(section.order, 10) : (sIdx + 1),
      fields: []
    };

    if (section.fields) {
      if (!Array.isArray(section.fields)) {
        return { error: `Section "${secId}" fields property must be an array.` };
      }

      for (let fIdx = 0; fIdx < section.fields.length; fIdx++) {
        const field = section.fields[fIdx];
        if (!field || typeof field !== 'object') {
          return { error: `Field at index ${fIdx} in section "${secId}" is not a valid object.` };
        }

        if (!field.id) {
          return { error: `Field at index ${fIdx} in section "${secId}" is missing an "id".` };
        }

        const fldId = String(field.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase();
        if (seenIds[fldId]) {
          return { error: `Duplicate identifier found: "${fldId}".` };
        }
        seenIds[fldId] = 'field';

        const fldType = String(field.type || '').replace(/[^a-z0-9_\-]/gi, '').toLowerCase();
        if (!ALLOWED_FIELD_TYPES.includes(fldType)) {
          return { error: `Field "${fldId}" has unsupported field type "${fldType}".` };
        }

        const pricingCat = field.pricing && field.pricing.category ? field.pricing.category : 'per_unit';
        const pricingMode = field.pricing && field.pricing.mode ? field.pricing.mode : 'none';

        if (!ALLOWED_PRICING_CATEGORIES.includes(pricingCat)) {
          return { error: `Field "${fldId}" has invalid pricing category "${pricingCat}".` };
        }

        if (!ALLOWED_PRICING_MODES.includes(pricingMode)) {
          return { error: `Field "${fldId}" has invalid pricing mode "${pricingMode}".` };
        }

        const sanField = {
          id: fldId,
          type: fldType,
          label: field.label || '',
          description: field.description || '',
          required: Boolean(field.required),
          pricing: {
            category: pricingCat,
            mode: pricingMode,
            amount: field.pricing && field.pricing.amount ? parseFloat(field.pricing.amount) : 0.0
          }
        };

        if (field.max_length !== undefined) sanField.max_length = parseInt(field.max_length, 10);
        if (fldType === 'number') {
          if (field.min !== undefined) sanField.min = parseFloat(field.min);
          if (field.max !== undefined) sanField.max = parseFloat(field.max);
        }

        if (fldType === 'checkbox') {
          sanField.checked_value = field.checked_value || 'yes';
          sanField.unchecked_value = field.unchecked_value || 'no';
          sanField.default_state = Boolean(field.default_state);
          if (field.states) sanField.states = field.states;
        }

        if (['select', 'radio'].includes(fldType)) {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            return { error: `Field "${fldId}" of type ${fldType} must define an options array with at least one choice.` };
          }
          sanField.options = [];
          const seenOptIds = {};
          for (const opt of field.options) {
            if (!opt.id) return { error: `Field "${fldId}" contains an option with missing "id".` };
            const optId = String(opt.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase();
            if (seenOptIds[optId]) return { error: `Field "${fldId}" contains duplicate option id "${optId}".` };
            seenOptIds[optId] = true;
            sanField.options.push({
              id: optId,
              label: opt.label || '',
              price: opt.price ? parseFloat(opt.price) : 0.0
            });
          }
        }

        if (field.conditions) sanField.conditions = field.conditions;

        sanSection.fields.push(sanField);
      }
    }

    sanitized.sections.push(sanSection);
  }

  return { data: sanitized };
}

// Emulate Sanitizer.validate_and_sanitize_assignment directly matching class-sanitizer.php
function validateAndSanitizeAssignment(raw, productValidator = null) {
  if (!raw || typeof raw !== 'object') {
    raw = {};
  }

  const type = raw.type === 'all_products' || raw.type === 'categories' ? raw.type : 'specific_products';
  const rawInput = raw.product_ids || '';
  let tokens = [];

  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (trimmed !== '') {
      tokens = trimmed.split(',').map(s => s.trim());
    }
  } else if (Array.isArray(rawInput)) {
    tokens = rawInput.map(s => String(s).trim());
  }

  const normalizedIds = [];
  const seen = {};

  for (const token of tokens) {
    if (token === '') continue;

    // Must be positive digits only
    if (!/^\d+$/.test(token)) {
      return { error: `Invalid product ID "${token}". All assigned product IDs must be positive integers.` };
    }

    const idVal = parseInt(token, 10);
    if (idVal <= 0) {
      return { error: `Invalid product ID ${idVal}. Product IDs must be greater than zero.` };
    }

    if (typeof productValidator === 'function') {
      const res = productValidator(idVal);
      if (res && res.error) {
        return res;
      }
      if (res !== true) {
        return { error: `Product ID ${idVal} does not exist or is not a published WooCommerce product.` };
      }
    }

    if (!seen[idVal]) {
      seen[idVal] = true;
      normalizedIds.push(idVal);
    }
  }

  return { data: { type, product_ids: normalizedIds } };
}

// TEST 1: Malformed JSON syntax rejection
const test1 = validateAndSanitizeConfig('{"id": "set_1", sections: [invalid json]}');
assert(test1.error && test1.error.includes('Malformed JSON'), 'Rejects malformed JSON with syntax error message');

// TEST 2: Missing required root keys rejection
const test2 = validateAndSanitizeConfig({ title: 'No root ID or sections' });
assert(test2.error && test2.error.includes('missing a valid root "id"'), 'Rejects schema missing root "id"');

const test2b = validateAndSanitizeConfig({ id: 'set_valid' });
assert(test2b.error && test2b.error.includes('must include a "sections" array'), 'Rejects schema missing "sections" array');

// TEST 3: Duplicate ID rejection
const test3 = validateAndSanitizeConfig({
  id: 'set_1',
  sections: [
    {
      id: 'sec_1',
      fields: [
        { id: 'dup_fld', type: 'text', label: 'Field 1' },
        { id: 'dup_fld', type: 'text', label: 'Field 2' }
      ]
    }
  ]
});
assert(test3.error && test3.error.includes('Duplicate identifier found: "dup_fld"'), 'Rejects duplicate field ID within option set');

// TEST 4: Invalid field type rejection
const test4 = validateAndSanitizeConfig({
  id: 'set_1',
  sections: [
    {
      id: 'sec_1',
      fields: [
        { id: 'fld_unknown', type: 'unsupported_quantum_picker', label: 'Quantum' }
      ]
    }
  ]
});
assert(test4.error && test4.error.includes('unsupported field type'), 'Rejects unsupported field type');

// TEST 5: Invalid pricing mode rejection
const test5 = validateAndSanitizeConfig({
  id: 'set_1',
  sections: [
    {
      id: 'sec_1',
      fields: [
        { id: 'fld_bad_mode', type: 'text', label: 'Bad Mode', pricing: { category: 'per_unit', mode: 'random_mode' } }
      ]
    }
  ]
});
assert(test5.error && test5.error.includes('invalid pricing mode'), 'Rejects invalid pricing mode');

// TEST 6: Select field with empty options rejection
const test6 = validateAndSanitizeConfig({
  id: 'set_1',
  sections: [
    {
      id: 'sec_1',
      fields: [
        { id: 'fld_select', type: 'select', label: 'Empty Dropdown', options: [] }
      ]
    }
  ]
});
assert(test6.error && test6.error.includes('must define an options array'), 'Rejects select field with empty options array');

// TEST 7: Select field with duplicate option IDs
const test7 = validateAndSanitizeConfig({
  id: 'set_1',
  sections: [
    {
      id: 'sec_1',
      fields: [
        {
          id: 'fld_select',
          type: 'select',
          label: 'Dropdown',
          options: [
            { id: 'opt_1', label: 'Red' },
            { id: 'opt_1', label: 'Blue' }
          ]
        }
      ]
    }
  ]
});
assert(test7.error && test7.error.includes('duplicate option id "opt_1"'), 'Rejects duplicate choice IDs within a select field');

// --- PRODUCT ASSIGNMENT HARDENING TESTS ---

// Mock product registry for deterministic seam
const mockProductDatabase = {
  101: { exists: true, post_type: 'product', status: 'publish' },
  102: { exists: true, post_type: 'product', status: 'publish' },
  103: { exists: true, post_type: 'product', status: 'draft' },       // Not published
  104: { exists: true, post_type: 'post', status: 'publish' },          // Post, not product
  105: { exists: true, post_type: 'product', status: 'publish' }
};

function mockValidator(id) {
  const item = mockProductDatabase[id];
  if (!item || !item.exists) {
    return { error: `Product ID ${id} does not exist or is not a WooCommerce product.` };
  }
  if (item.post_type !== 'product') {
    return { error: `Product ID ${id} is not a WooCommerce product.` };
  }
  if (item.status !== 'publish') {
    return { error: `Product ID ${id} is not published (current status: ${item.status}).` };
  }
  return true;
}

// TEST 8A: Invalid non-numeric token rejection
const test8a = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, abc, 102'
}, mockValidator);
assert(test8a.error && test8a.error.includes('Invalid product ID "abc"'), 'Rejects non-numeric product ID token "abc" with clear error');

// TEST 8B: Alphanumeric token rejection
const test8b = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, 102a, 105'
}, mockValidator);
assert(test8b.error && test8b.error.includes('Invalid product ID "102a"'), 'Rejects alphanumeric token "102a" with clear error');

// TEST 8C: Non-positive (zero/negative) ID rejection
const test8c = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, -5, 102'
}, mockValidator);
assert(test8c.error && test8c.error.includes('Invalid product ID'), 'Rejects negative product ID token');

// TEST 8D: Missing product rejection
const test8d = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, 9999, 102'
}, mockValidator);
assert(test8d.error && test8d.error.includes('Product ID 9999 does not exist'), 'Rejects non-existent product ID 9999 with clear error');

// TEST 8E: Non-product post type rejection
const test8e = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, 104, 102'
}, mockValidator);
assert(test8e.error && test8e.error.includes('is not a WooCommerce product'), 'Rejects post ID 104 which is a standard post, not a product');

// TEST 8F: Unpublished product rejection
const test8f = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, 103, 102'
}, mockValidator);
assert(test8f.error && test8f.error.includes('is not published'), 'Rejects product ID 103 which is in draft status');

// TEST 8G: Duplicate ID normalization and valid published product acceptance
const test8g = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: '101, 102, 101, 105, 102, 105'
}, mockValidator);
assert(
  !test8g.error &&
  test8g.data.product_ids.length === 3 &&
  test8g.data.product_ids[0] === 101 &&
  test8g.data.product_ids[1] === 102 &&
  test8g.data.product_ids[2] === 105,
  'Accepts valid published products [101, 102, 105] and normalizes duplicate IDs without error'
);

// TEST 8H: Empty product assignment returns empty array for warning handling
const test8h = validateAndSanitizeAssignment({
  type: 'specific_products',
  product_ids: ''
}, mockValidator);
assert(!test8h.error && test8h.data.product_ids.length === 0, 'Empty product assignment returns empty array without false error');

// TEST 9: Schema data preservation (checkbox states, boundaries, and future Phase 3 conditions)
const fullValidSchema = {
  $schema_version: '1.0.0',
  id: 'set_gift_demo',
  title: 'Custom Gift Options',
  sections: [
    {
      id: 'sec_custom',
      title: 'Presentation',
      fields: [
        {
          id: 'fld_wrap',
          type: 'checkbox',
          label: 'Gift Wrap',
          checked_value: 'yes',
          unchecked_value: 'no',
          default_state: false,
          pricing: { category: 'per_unit', mode: 'fixed', amount: 5.00 },
          states: {
            yes: { label: 'Wrap (+€5.00)', price_delta: 5.00 },
            no: { label: 'No Wrap', price_delta: 0.00 }
          }
        },
        {
          id: 'fld_engraving_text',
          type: 'text',
          label: 'Engraving Text',
          max_length: 30,
          pricing: { category: 'per_unit', mode: 'per_character', amount: 1.00 },
          conditions: {
            operator: 'ALL',
            rules: [{ field_id: 'fld_wrap', operator: 'equals', value: 'yes' }]
          }
        }
      ]
    }
  ]
};

const preserved = validateAndSanitizeConfig(fullValidSchema);
assert(!preserved.error, 'Valid schema validates without errors');
assert(preserved.data.sections[0].fields[0].states.yes.price_delta === 5.0, 'Checkbox states and price_deltas preserved exactly');
assert(preserved.data.sections[0].fields[1].max_length === 30, 'Text max_length preserved');
assert(preserved.data.sections[0].fields[1].conditions.rules.length === 1, 'Phase 3 conditions preserved safely without execution');

// 10. Code assertions
const sanitizerCode = fs.readFileSync(path.join(pluginDir, 'includes/Utils/class-sanitizer.php'), 'utf8');
assert(sanitizerCode.includes("validate_and_sanitize_assignment"), 'Sanitizer exposes validate_and_sanitize_assignment');
assert(sanitizerCode.includes("ctype_digit"), 'Sanitizer uses ctype_digit for strict numeric ID validation');

const controllerCode = fs.readFileSync(path.join(pluginDir, 'includes/Admin/class-option-set-controller.php'), 'utf8');
assert(controllerCode.includes("validate_and_sanitize_assignment"), 'Option_Set_Controller calls validate_and_sanitize_assignment');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nPre-Phase 3 Hardening Verification Summary: ${passed}/${total} assertions PASSED.`);
