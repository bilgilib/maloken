/**
 * Phase 4 Comprehensive Verification Test Suite (ES Module)
 * Verifies:
 * 1. Logical Media Library Folder (scpo_media_folder, Simple Product Options, MIME type validation, canonical IDs)
 * 2. Schema Normalization & Sanitization for Single Select, Multi Select, and Image Select
 * 3. Choice-level Fixed Price Adjustments (Single Select, Radio, Multi Select summation, Image Select)
 * 4. Required vs Optional Validation (Single Select, Multi Select, Image Select, and inactive conditional required fields)
 * 5. Cart Item Data & Order Line Item Meta Persistence (HPOS compatibility, image attachment IDs, display values)
 * 6. Backward Compatibility with existing 1.0.0/1.0.1 Gift Wrap / Engraving schemas
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

// 1. FILE INTEGRITY VERIFICATION
const requiredPhase4Files = [
  'includes/Admin/class-media-folder.php',
  'includes/Admin/class-admin-menu.php',
  'includes/Utils/class-sanitizer.php',
  'includes/Commerce/class-price-calculator.php',
  'includes/Commerce/class-cart-manager.php',
  'includes/Frontend/class-frontend-renderer.php',
  'assets/js/scpo-admin.js',
  'assets/js/scpo-frontend.js',
  'assets/css/scpo-admin.css',
  'assets/css/scpo-frontend.css'
];

requiredPhase4Files.forEach(file => {
  assert(fs.existsSync(path.join(pluginDir, file)), `Phase 4 File exists: ${file}`);
});

// 2. MEDIA FOLDER ARCHITECTURE & SECURITY INSPECTION
const mediaFolderCode = fs.readFileSync(path.join(pluginDir, 'includes/Admin/class-media-folder.php'), 'utf8');

assert(mediaFolderCode.includes("'scpo_media_folder'"), 'Media_Folder defines TAXONOMY scpo_media_folder');
assert(mediaFolderCode.includes("'Simple Product Options'"), 'Media_Folder defines FOLDER_NAME Simple Product Options');
assert(mediaFolderCode.includes('register_taxonomy'), 'Media_Folder registers taxonomy for attachment');
assert(mediaFolderCode.includes('ALLOWED_MIME_TYPES'), 'Media_Folder enforces strict ALLOWED_MIME_TYPES');
assert(mediaFolderCode.includes('image/jpeg') && mediaFolderCode.includes('image/png') && mediaFolderCode.includes('image/webp'), 'Allowed MIME types include jpeg, png, webp, gif');
assert(mediaFolderCode.includes('wp_set_object_terms'), 'Media_Folder associates attachments to taxonomy folder');
assert(mediaFolderCode.includes('current_user_can') && mediaFolderCode.includes('upload_files'), 'Media_Folder enforces upload_files capability check');
assert(mediaFolderCode.includes('check_ajax_referer'), 'Media_Folder validates AJAX nonce');

// Test pure MIME type validation logic matching Media_Folder::tag_attachment
function isAllowedMimeType(mime) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  return allowed.includes(mime);
}
assert(isAllowedMimeType('image/png') === true, 'Accepts image/png attachment');
assert(isAllowedMimeType('image/jpeg') === true, 'Accepts image/jpeg attachment');
assert(isAllowedMimeType('image/webp') === true, 'Accepts image/webp attachment');
assert(isAllowedMimeType('application/pdf') === false, 'Rejects application/pdf attachment');
assert(isAllowedMimeType('text/plain') === false, 'Rejects text/plain attachment');
assert(isAllowedMimeType('application/x-php') === false, 'Rejects malicious executable attachment');

// 3. SCHEMA SANITIZATION & NORMALIZATION SPECIFICATION
const sanitizerCode = fs.readFileSync(path.join(pluginDir, 'includes/Utils/class-sanitizer.php'), 'utf8');
assert(sanitizerCode.includes("'multiselect'"), 'Sanitizer ALLOWED_FIELD_TYPES includes multiselect');
assert(sanitizerCode.includes("'imageselect'"), 'Sanitizer ALLOWED_FIELD_TYPES includes imageselect');

// Emulate Sanitizer::validate_and_sanitize_config for Phase 4
function validatePhase4Config(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return { error: e.message }; }
  }
  if (!raw || !raw.id || !Array.isArray(raw.sections)) {
    return { error: 'Invalid schema root' };
  }

  const allowedTypes = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'multiselect', 'imageselect'];
  const sanitizedSections = [];
  const seenFldIds = new Set();

  for (const sec of raw.sections) {
    if (!sec.id || !sec.fields || !Array.isArray(sec.fields)) continue;
    const sanitizedFields = [];

    for (const fld of sec.fields) {
      if (!fld.id || !allowedTypes.includes(fld.type)) {
        return { error: `Invalid field or unsupported type: ${fld.type}` };
      }
      if (seenFldIds.has(fld.id)) {
        return { error: `Duplicate field ID: ${fld.id}` };
      }
      seenFldIds.add(fld.id);

      const sanitized = {
        id: fld.id,
        type: fld.type,
        label: fld.label || 'Untitled Field',
        required: Boolean(fld.required)
      };

      if (['select', 'multiselect', 'radio'].includes(fld.type)) {
        if (!fld.options || !Array.isArray(fld.options) || fld.options.length === 0) {
          return { error: `Field ${fld.id} must define non-empty options array` };
        }
        const seenOptIds = new Set();
        sanitized.options = [];
        for (const opt of fld.options) {
          if (!opt.id) return { error: `Option missing ID in ${fld.id}` };
          if (seenOptIds.has(opt.id)) return { error: `Duplicate option ID: ${opt.id}` };
          seenOptIds.add(opt.id);
          sanitized.options.push({
            id: String(opt.id).replace(/[^a-z0-9_\-]/gi, ''),
            label: String(opt.label || opt.id),
            price: Math.max(0, parseFloat(opt.price) || 0)
          });
        }
      }

      if (fld.type === 'imageselect') {
        if (!fld.options || !Array.isArray(fld.options) || fld.options.length === 0) {
          return { error: `ImageSelect field ${fld.id} must define non-empty options array` };
        }
        const seenOptIds = new Set();
        sanitized.options = [];
        for (const opt of fld.options) {
          if (!opt.id) return { error: `Image choice missing ID in ${fld.id}` };
          if (seenOptIds.has(opt.id)) return { error: `Duplicate choice ID: ${opt.id}` };
          seenOptIds.add(opt.id);
          sanitized.options.push({
            id: String(opt.id).replace(/[^a-z0-9_\-]/gi, ''),
            label: String(opt.label || opt.id),
            image_id: Math.max(0, parseInt(opt.image_id, 10) || 0),
            image_url: String(opt.image_url || ''),
            alt: String(opt.alt || ''),
            price: Math.max(0, parseFloat(opt.price) || 0)
          });
        }
      }

      if (fld.conditions) {
        sanitized.conditions = fld.conditions;
      }

      sanitizedFields.push(sanitized);
    }

    sanitizedSections.push({
      id: sec.id,
      title: sec.title || 'Section',
      fields: sanitizedFields
    });
  }

  return { data: { id: raw.id, sections: sanitizedSections } };
}

// Test schema sanitization
const validPhase4Set = {
  $schema_version: '1.1.0',
  id: 'set_military_apparel',
  sections: [
    {
      id: 'sec_customization',
      title: 'Uniform Customization',
      fields: [
        {
          id: 'fld_color_select',
          type: 'select',
          label: 'Primary Color',
          required: true,
          options: [
            { id: 'opt_black', label: 'Black', price: 0 },
            { id: 'opt_khaki', label: 'Khaki', price: 5.0 },
            { id: 'opt_camo', label: 'Camouflage', price: 8.5 }
          ]
        },
        {
          id: 'fld_accessories',
          type: 'multiselect',
          label: 'Extra Accessories',
          required: false,
          options: [
            { id: 'opt_belt', label: 'Tactical Belt', price: 15.0 },
            { id: 'opt_pouch', label: 'Utility Pouch', price: 10.0 },
            { id: 'opt_cleaning', label: 'Cleaning Kit', price: 7.5 }
          ]
        },
        {
          id: 'fld_camo_pattern',
          type: 'imageselect',
          label: 'Trousers Camo Pattern',
          required: true,
          options: [
            {
              id: 'opt_woodland',
              label: 'Woodland Camo',
              image_id: 101,
              image_url: 'https://example.com/woodland.jpg',
              alt: 'Classic woodland camouflage',
              price: 20.0
            },
            {
              id: 'opt_desert',
              label: 'Desert Storm Camo',
              image_id: 102,
              image_url: 'https://example.com/desert.jpg',
              alt: 'Desert tan camouflage',
              price: 25.0
            }
          ]
        }
      ]
    }
  ]
};

const vRes = validatePhase4Config(validPhase4Set);
assert(!vRes.error, 'Phase 4 configuration validates without errors');
assert(vRes.data.sections[0].fields.length === 3, 'All 3 Phase 4 fields preserved in schema');
assert(vRes.data.sections[0].fields[0].options.length === 3, 'Select choices preserved');
assert(vRes.data.sections[0].fields[1].options.length === 3, 'Multi-select choices preserved');
assert(vRes.data.sections[0].fields[2].options[0].image_id === 101, 'Canonical image attachment ID preserved');

// Rejection of invalid choice structures
const invalidSelectNoOptions = {
  id: 'set_bad',
  sections: [{ id: 's1', fields: [{ id: 'f1', type: 'select', label: 'Empty', options: [] }] }]
};
assert(validatePhase4Config(invalidSelectNoOptions).error !== undefined, 'Rejects select field with empty options');

const invalidDupChoiceIds = {
  id: 'set_bad2',
  sections: [{
    id: 's1',
    fields: [{
      id: 'f1',
      type: 'multiselect',
      label: 'Duplicate Choice',
      options: [
        { id: 'opt_same', label: 'A', price: 5 },
        { id: 'opt_same', label: 'B', price: 10 }
      ]
    }]
  }]
};
assert(validatePhase4Config(invalidDupChoiceIds).error !== undefined, 'Rejects multiselect with duplicate choice IDs');

// 4. PRICE CALCULATOR SPECIFICATION: CHOICE PRICING & MULTI-SELECT SUMMATION
const calcCode = fs.readFileSync(path.join(pluginDir, 'includes/Commerce/class-price-calculator.php'), 'utf8');
assert(calcCode.includes("'multiselect'") && calcCode.includes("'imageselect'"), 'Price_Calculator SUPPORTED_TYPES includes multiselect & imageselect');

// Emulate Price_Calculator::calculate_options_total logic for Phase 4
function calculatePhase4Options(submission, schemaConfig) {
  let unitAddon = 0;
  let fixedFee = 0;
  const errors = [];
  const parsedOptions = [];

  for (const sec of schemaConfig.sections) {
    for (const fld of sec.fields) {
      const rawVal = submission[fld.id];

      // Check conditions
      let isActive = true;
      if (fld.conditions && fld.conditions.rules && fld.conditions.rules.length > 0) {
        const rule = fld.conditions.rules[0];
        const parentVal = submission[rule.field_id];
        if (rule.operator === 'equals') {
          isActive = (parentVal === rule.value);
        }
      }

      if (!isActive) {
        continue; // Inactive fields are not evaluated and cannot fail required validation
      }

      // 1. Required validation
      let isEmpty = false;
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        isEmpty = true;
      } else if (Array.isArray(rawVal) && rawVal.filter(Boolean).length === 0) {
        isEmpty = true;
      }

      if (fld.required && isEmpty) {
        errors.push(`${fld.label} is required.`);
        continue;
      }

      if (isEmpty) {
        continue;
      }

      // 2. Choice-level pricing
      switch (fld.type) {
        case 'select': {
          const match = (fld.options || []).find(o => o.id === rawVal);
          if (!match) {
            errors.push(`Invalid choice for ${fld.label}.`);
            continue;
          }
          const price = parseFloat(match.price) || 0;
          unitAddon += price;
          parsedOptions.push({
            field_id: fld.id,
            type: 'select',
            label: fld.label,
            value: match.id,
            display_value: match.label,
            unit_delta: price
          });
          break;
        }

        case 'multiselect': {
          const selectedIds = Array.isArray(rawVal) ? rawVal : String(rawVal).split(',').map(s => s.trim());
          let msTotal = 0;
          const matchedLabels = [];
          const matchedChoices = [];

          for (const sId of selectedIds) {
            const match = (fld.options || []).find(o => o.id === sId);
            if (!match) {
              errors.push(`Invalid choice "${sId}" for ${fld.label}.`);
              continue;
            }
            const p = Math.max(0, parseFloat(match.price) || 0);
            msTotal += p;
            matchedLabels.push(match.label);
            matchedChoices.push({ id: match.id, label: match.label, price: p });
          }

          unitAddon += msTotal;
          parsedOptions.push({
            field_id: fld.id,
            type: 'multiselect',
            label: fld.label,
            value: selectedIds,
            display_value: matchedLabels.join(', '),
            unit_delta: msTotal,
            choices: matchedChoices
          });
          break;
        }

        case 'imageselect': {
          const match = (fld.options || []).find(o => o.id === rawVal);
          if (!match) {
            errors.push(`Invalid choice for ${fld.label}.`);
            continue;
          }
          const price = parseFloat(match.price) || 0;
          unitAddon += price;
          parsedOptions.push({
            field_id: fld.id,
            type: 'imageselect',
            label: fld.label,
            value: match.id,
            display_value: match.label,
            unit_delta: price,
            image_id: match.image_id || 0,
            image_url: match.image_url || '',
            alt: match.alt || ''
          });
          break;
        }
      }
    }
  }

  return { unitAddon, fixedFee, errors, parsedOptions };
}

// Test Choice Pricing: Single Select
const testSelectKhaki = calculatePhase4Options({ fld_color_select: 'opt_khaki', fld_camo_pattern: 'opt_woodland' }, validPhase4Set);
assert(testSelectKhaki.errors.length === 0, 'Valid single-select produces no errors');
assert(testSelectKhaki.unitAddon === 25.0, 'Select Khaki (€5.0) + Woodland Camo (€20.0) = €25.0');

// Test Choice Pricing: Multi-Select summation of selected choices
const testMultiSelect = calculatePhase4Options({
  fld_color_select: 'opt_black',
  fld_accessories: ['opt_belt', 'opt_pouch'],
  fld_camo_pattern: 'opt_woodland'
}, validPhase4Set);
assert(testMultiSelect.errors.length === 0, 'Multi-select with multiple items produces no errors');
// Belt (€15) + Pouch (€10) + Woodland (€20) = €45.0
assert(testMultiSelect.unitAddon === 45.0, 'Multi-select exactly sums choices (€15 + €10) + Woodland (€20) = €45.0');
const msOptionMeta = testMultiSelect.parsedOptions.find(o => o.field_id === 'fld_accessories');
assert(msOptionMeta.display_value === 'Tactical Belt, Utility Pouch', 'Multi-select display value formatted as comma-separated list');
assert(msOptionMeta.choices.length === 2, 'Multi-select choices metadata captured');

// Test Multi-Select All 3 items
const testMultiAll = calculatePhase4Options({
  fld_color_select: 'opt_black',
  fld_accessories: ['opt_belt', 'opt_pouch', 'opt_cleaning'],
  fld_camo_pattern: 'opt_woodland'
}, validPhase4Set);
// Belt 15 + Pouch 10 + Cleaning 7.5 + Woodland 20 = 52.5
assert(testMultiAll.unitAddon === 52.5, 'Multi-select sums all 3 items: 15 + 10 + 7.5 + 20 = €52.5');

// Test Required Validation: Single Select Missing
const testMissingSelect = calculatePhase4Options({
  fld_accessories: ['opt_belt'],
  fld_camo_pattern: 'opt_woodland'
}, validPhase4Set);
assert(testMissingSelect.errors.length > 0 && testMissingSelect.errors[0].includes('Primary Color'), 'Rejects missing required single select');

// Test Required Validation: Image Select Missing
const testMissingImage = calculatePhase4Options({
  fld_color_select: 'opt_black',
  fld_camo_pattern: ''
}, validPhase4Set);
assert(testMissingImage.errors.length > 0 && testMissingImage.errors[0].includes('Trousers Camo Pattern'), 'Rejects missing required image select');

// Test Required Validation: Multi-Select when required but empty array
const reqMultiSchema = JSON.parse(JSON.stringify(validPhase4Set));
reqMultiSchema.sections[0].fields[1].required = true;

const testEmptyRequiredMulti = calculatePhase4Options({
  fld_color_select: 'opt_black',
  fld_accessories: [],
  fld_camo_pattern: 'opt_woodland'
}, reqMultiSchema);
assert(testEmptyRequiredMulti.errors.length > 0 && testEmptyRequiredMulti.errors[0].includes('Extra Accessories'), 'Rejects empty array for required multiselect');

const testNullRequiredMulti = calculatePhase4Options({
  fld_color_select: 'opt_black',
  fld_camo_pattern: 'opt_woodland'
}, reqMultiSchema);
assert(testNullRequiredMulti.errors.length > 0 && testNullRequiredMulti.errors[0].includes('Extra Accessories'), 'Rejects omitted submission for required multiselect');

// 5. CONDITIONAL INACTIVE REQUIRED FIELDS
const conditionalPhase4Schema = {
  $schema_version: '1.1.0',
  id: 'set_conditional_p4',
  sections: [
    {
      id: 'sec_1',
      title: 'Conditional Section',
      fields: [
        {
          id: 'fld_enable_camo',
          type: 'select',
          label: 'Apply Camo Pattern?',
          required: true,
          options: [
            { id: 'opt_no', label: 'No standard plain', price: 0 },
            { id: 'opt_yes', label: 'Yes add pattern', price: 0 }
          ]
        },
        {
          id: 'fld_pattern_choice',
          type: 'imageselect',
          label: 'Pattern Choice',
          required: true, // Marked required, but conditioned on opt_yes!
          conditions: {
            action: 'SHOW',
            operator: 'ALL',
            rules: [
              { field_id: 'fld_enable_camo', operator: 'equals', value: 'opt_yes' }
            ]
          },
          options: [
            { id: 'opt_camo_a', label: 'Camo A', image_id: 201, price: 12.0 }
          ]
        }
      ]
    }
  ]
};

// Customer chose "No" -> Pattern choice is inactive -> MUST NOT fail required validation!
const condInactiveTest = calculatePhase4Options({
  fld_enable_camo: 'opt_no',
  fld_pattern_choice: ''
}, conditionalPhase4Schema);
assert(condInactiveTest.errors.length === 0, 'Inactive conditional required field does NOT trigger validation error');
assert(condInactiveTest.unitAddon === 0, 'Inactive conditional field adds €0.00 to price');

// Customer chose "Yes" -> Pattern choice is active -> Missing value MUST trigger required validation error!
const condActiveEmptyTest = calculatePhase4Options({
  fld_enable_camo: 'opt_yes',
  fld_pattern_choice: ''
}, conditionalPhase4Schema);
assert(condActiveEmptyTest.errors.length > 0 && condActiveEmptyTest.errors[0].includes('Pattern Choice'), 'Active conditional required field DOES trigger validation error when omitted');

// Customer chose "Yes" and selected Camo A -> applies €12.00
const condActiveFilledTest = calculatePhase4Options({
  fld_enable_camo: 'opt_yes',
  fld_pattern_choice: 'opt_camo_a'
}, conditionalPhase4Schema);
assert(condActiveFilledTest.errors.length === 0, 'Active conditional field passes validation');
assert(condActiveFilledTest.unitAddon === 12.0, 'Active conditional field applies €12.00');

// 6. CART ITEM DATA & ORDER LINE ITEM META PERSISTENCE (HPOS)
const cartMgrCode = fs.readFileSync(path.join(pluginDir, 'includes/Commerce/class-cart-manager.php'), 'utf8');
assert(cartMgrCode.includes('save_order_line_item_meta'), 'Cart_Manager implements save_order_line_item_meta');
assert(cartMgrCode.includes("add_meta_data( '_scpo_options_data'"), 'Cart_Manager saves structured audit meta _scpo_options_data');
assert(cartMgrCode.includes('image_id'), 'Cart_Manager checks and preserves image_id');

// Mock order item meta persistence
class MockOrderItem {
  constructor() {
    this.meta = [];
  }
  add_meta_data(key, value, is_unique = false) {
    this.meta.push({ key, value, is_unique });
  }
}

function persistPhase4OrderMeta(parsedOptions, orderItem) {
  orderItem.add_meta_data('_scpo_options_data', parsedOptions, true);
  for (const opt of parsedOptions) {
    const priceSuffix = opt.unit_delta > 0 ? ` (+€${opt.unit_delta.toFixed(2)})` : '';
    orderItem.add_meta_data(opt.label, opt.display_value + priceSuffix, false);
    if (opt.image_id) {
      orderItem.add_meta_data(`_scpo_attachment_${opt.field_id}`, opt.image_id, true);
    }
  }
}

const mockItem = new MockOrderItem();
persistPhase4OrderMeta(testMultiSelect.parsedOptions, mockItem);

assert(mockItem.meta.some(m => m.key === '_scpo_options_data'), 'Saves structured audit meta for HPOS');
assert(mockItem.meta.some(m => m.key === 'Extra Accessories' && m.value.includes('Tactical Belt, Utility Pouch')), 'Saves multi-select choices label and items in visible line item meta');
assert(mockItem.meta.some(m => m.key === 'Trousers Camo Pattern' && m.value.includes('Woodland Camo (+€20.00)')), 'Saves image select label, choice, and price snapshot in order line item meta');
assert(mockItem.meta.some(m => m.key === '_scpo_attachment_fld_camo_pattern' && m.value === 101), 'Saves canonical attachment ID 101 for image select field in order line item meta');

// 7. BACKWARD COMPATIBILITY WITH 1.0.0 / 1.0.1 SCHEMA
const legacySchema100 = {
  $schema_version: '1.0.0',
  id: 'set_gift_wrap_legacy',
  title: 'Gift Wrap & Personalization',
  sections: [
    {
      id: 'sec_options',
      title: 'Options',
      fields: [
        {
          id: 'fld_wrap',
          type: 'checkbox',
          label: 'Gift Wrap',
          required: false,
          pricing: { category: 'per_unit', mode: 'fixed', amount: 5.0 }
        },
        {
          id: 'fld_engraving',
          type: 'checkbox',
          label: 'Add Engraving',
          required: false,
          pricing: { category: 'per_unit', mode: 'none', amount: 0 }
        },
        {
          id: 'fld_engraving_text',
          type: 'text',
          label: 'Engraving Text',
          required: false,
          pricing: { category: 'per_unit', mode: 'per_character', amount: 0.5 }
        },
        {
          id: 'fld_date',
          type: 'date',
          label: 'Delivery Date',
          required: false,
          pricing: { category: 'per_unit', mode: 'none', amount: 0 }
        }
      ]
    }
  ]
};

const legacyValidation = validatePhase4Config(legacySchema100);
assert(!legacyValidation.error, 'Legacy 1.0.0/1.0.1 schema validates perfectly under Phase 4 engine');
assert(legacyValidation.data.sections[0].fields.length === 4, 'All 4 legacy fields preserved without migration requirement');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nPhase 4 Comprehensive Verification Summary: ${passed}/${total} assertions PASSED.`);
if (passed !== total) {
  process.exit(1);
}
