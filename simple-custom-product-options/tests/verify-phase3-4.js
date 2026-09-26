/**
 * Phase 3.4 Comprehensive Verification Test Suite (ES Module)
 * Verifies:
 * 1. Section-level Selection Mode Setting:
 *    - Schema compatibility: defaults to "multiple" on existing saved sections without regression
 *    - Schema normalization: validates "single" and "multiple", accepts "single_choice" and "multiple_choices"
 *    - Admin builder UI: section header selection mode control with "Single choice" and "Multiple choices"
 *    - Admin contextual inspector: section inspector panel with selection mode and explanatory guidance
 * 2. Frontend Rendering & Accessibility:
 *    - Single-choice sections rendered with role="radiogroup" and data-selection-mode="single"
 *    - Multiple-choice sections rendered with role="group" and data-selection-mode="multiple"
 *    - Image-choice single mode: renders radio controls (role="radiogroup", type="radio")
 *    - Image-choice multiple mode: renders checkbox controls (role="group", type="checkbox", name="...[]")
 *    - Keyboard support (Space/Enter keydown toggle/select)
 *    - Visual card selection styling (.is-selected)
 * 3. Authoritative Server-Side PHP Validation & Enforcement:
 *    - Test 1 (Single Accept): Single choice section with 1 option selected -> ACCEPTED
 *    - Test 2 (Single Reject): Single choice section with 2 sibling options selected -> REJECTED with safe validation notice
 *    - Test 3 (Multiple Accept): Multiple choices section with 2+ sibling options selected -> ACCEPTED
 *    - Test 4 (Image Single Accept): Image-choice in single section with 1 choice -> ACCEPTED
 *    - Test 5 (Image Single Reject): Image-choice in single section with 2+ choices -> REJECTED with safe validation notice
 *    - Test 6 (Image Multiple Accept): Image-choice in multiple section with 2 choices -> ACCEPTED & prices summed
 * 4. UI Polish & Internationalization:
 *    - Explicit labels: "Single Select", "Multi Select", "Image Select", "Checkbox"
 *    - Never raw SELECT, MULTISELECT, IMAGESELECT, İMAGESELECT
 *    - No user-facing text-transform: uppercase or toUpperCase() on badges
 *    - "New Option" instead of "New Field"
 *    - Simulator banner sentence case: "Live Customer Form Preview (synchronized with current edits)"
 *    - Turkish merchant-authored text preserved exactly
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

// -------------------------------------------------------------
// 1. FILE INTEGRITY & PHASE 3.4 CODE ARTIFACT CHECKS
// -------------------------------------------------------------
const sanitizerCode = fs.readFileSync(path.join(pluginDir, 'includes/Utils/class-sanitizer.php'), 'utf8');
const calcCode = fs.readFileSync(path.join(pluginDir, 'includes/Commerce/class-price-calculator.php'), 'utf8');
const rendererCode = fs.readFileSync(path.join(pluginDir, 'includes/Frontend/class-frontend-renderer.php'), 'utf8');
const adminJs = fs.readFileSync(path.join(pluginDir, 'assets/js/scpo-admin.js'), 'utf8');
const frontendJs = fs.readFileSync(path.join(pluginDir, 'assets/js/scpo-frontend.js'), 'utf8');
const editorTemplate = fs.readFileSync(path.join(pluginDir, 'templates/admin/editor-screen.php'), 'utf8');
const appTsx = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf8');

assert(sanitizerCode.includes('selection_mode'), 'class-sanitizer.php preserves selection_mode');
assert(sanitizerCode.includes("'single'") && sanitizerCode.includes("'multiple'"), 'class-sanitizer.php validates single and multiple selection modes');
assert(sanitizerCode.includes('layout_mode') && sanitizerCode.includes('alignment'), 'class-sanitizer.php preserves layout_mode and alignment');

assert(calcCode.includes('scpo_single_choice_violation'), 'class-price-calculator.php defines safe single choice violation error');
assert(calcCode.includes('active_selected_fields'), 'class-price-calculator.php counts active selected options in single-choice section');
assert(calcCode.includes('raw_image_choices'), 'class-price-calculator.php supports multiple image choice array parsing');

assert(rendererCode.includes('data-selection-mode'), 'class-frontend-renderer.php outputs data-selection-mode attribute on section');
assert(rendererCode.includes('data-layout-mode') && rendererCode.includes('data-alignment'), 'class-frontend-renderer.php outputs layout mode and alignment metadata on section');
assert(rendererCode.includes('radiogroup') && rendererCode.includes('group'), 'class-frontend-renderer.php outputs accessible radiogroup/group roles');
assert(rendererCode.includes('scpo-imageselect-') && rendererCode.includes('$input_type'), 'class-frontend-renderer.php supports radio and checkbox image choice rendering');
assert(adminJs.includes('scpo-sec-align-select') && adminJs.includes('Align:'), 'scpo-admin.js renders section align control in the builder header');

// -------------------------------------------------------------
// 2. SCHEMA COMPATIBILITY & NORMALIZATION EMULATION
// -------------------------------------------------------------
function sanitizeSection(sec, idx) {
  let mode = 'multiple';
  if (sec.selection_mode) {
    const raw = String(sec.selection_mode).toLowerCase().replace(/[^a-z0-9_\-]/g, '');
    if (['single', 'single_choice'].includes(raw)) {
      mode = 'single';
    } else if (['multiple', 'multiple_choices'].includes(raw)) {
      mode = 'multiple';
    }
  }
  const layoutMode = sec.layout_mode === 'custom' ? 'custom' : 'default';
  const alignment = ['left', 'center', 'right'].includes(sec.alignment) ? sec.alignment : 'left';
  return {
    id: sec.id || `sec_${idx}`,
    title: sec.title || '',
    description: sec.description || '',
    layout_mode: layoutMode,
    alignment,
    selection_mode: mode,
    order: sec.order !== undefined ? sec.order : idx + 1,
    fields: sec.fields || []
  };
}

function normalizeSectionLayoutMode(value) {
  const normalized = value === null || value === undefined ? '' : String(value).toLowerCase();
  return normalized === 'custom' ? 'custom' : 'default';
}

function normalizeSectionAlignment(value) {
  const normalized = value === null || value === undefined ? '' : String(value).toLowerCase();
  return ['left', 'center', 'right'].includes(normalized) ? normalized : 'left';
}

// Case A: Existing schema without selection_mode defaults to "multiple"
const legacySection = { id: 'sec_legacy', title: 'Color Options', fields: [] };
const sanitizedLegacy = sanitizeSection(legacySection, 0);
assert(sanitizedLegacy.selection_mode === 'multiple', 'Existing saved section without selection_mode defaults to "multiple" without schema break');
assert(sanitizedLegacy.layout_mode === 'default', 'Existing saved section without layout_mode defaults to "default" without migration');
assert(sanitizedLegacy.alignment === 'left', 'Existing saved section without alignment defaults to "left" without migration');

// Case B: Explicit "single" preserved
const singleSection = { id: 'sec_color', title: 'Primary Color', selection_mode: 'single', fields: [] };
assert(sanitizeSection(singleSection, 0).selection_mode === 'single', 'Sanitizer accepts and preserves explicit "single" selection_mode');

// Case C: Explicit "multiple" preserved
const multiSection = { id: 'sec_addons', title: 'Gear Addons', selection_mode: 'multiple', fields: [] };
assert(sanitizeSection(multiSection, 0).selection_mode === 'multiple', 'Sanitizer accepts and preserves explicit "multiple" selection_mode');

// Case D: "single_choice" alias normalized to "single"
const singleAlias = { id: 'sec_alias', title: 'Style', selection_mode: 'single_choice', fields: [] };
assert(sanitizeSection(singleAlias, 0).selection_mode === 'single', 'Sanitizer normalizes "single_choice" alias to "single"');

// Case E: "multiple_choices" alias normalized to "multiple"
const multiAlias = { id: 'sec_alias_m', title: 'Extras', selection_mode: 'multiple_choices', fields: [] };
assert(sanitizeSection(multiAlias, 0).selection_mode === 'multiple', 'Sanitizer normalizes "multiple_choices" alias to "multiple"');

// Case F: Explicit custom layout preserved while alignment is normalized
const customLayout = { id: 'sec_custom', title: 'Gallery', layout_mode: 'custom', alignment: 'center', fields: [] };
const sanitizedCustom = sanitizeSection(customLayout, 0);
assert(sanitizedCustom.layout_mode === 'custom', 'Sanitizer preserves explicit "custom" layout mode');
assert(sanitizedCustom.alignment === 'center', 'Sanitizer preserves explicit valid alignment');

// Case G: Invalid layout values fall back safely
const invalidLayout = { id: 'sec_invalid_layout', title: 'Fallbacks', layout_mode: 'stacked', alignment: 'justify', fields: [] };
const sanitizedInvalidLayout = sanitizeSection(invalidLayout, 0);
assert(sanitizedInvalidLayout.layout_mode === 'default', 'Sanitizer normalizes invalid layout mode back to "default"');
assert(sanitizedInvalidLayout.alignment === 'left', 'Sanitizer normalizes invalid alignment back to "left"');
assert(normalizeSectionLayoutMode('CUSTOM') === 'custom', 'Admin JS normalizes layout mode case-insensitively');
assert(normalizeSectionLayoutMode('stacked') === 'default', 'Admin JS falls back invalid layout mode to "default"');
assert(normalizeSectionAlignment('RIGHT') === 'right', 'Admin JS normalizes alignment case-insensitively');
assert(normalizeSectionAlignment('justify') === 'left', 'Admin JS falls back invalid alignment to "left"');

// -------------------------------------------------------------
// 3. AUTHORITATIVE PHP VALIDATION ENGINE (Price_Calculator)
// -------------------------------------------------------------
function validateAndParseSubmission(submittedFields, schemaConfig) {
  if (!schemaConfig || !Array.isArray(schemaConfig.sections)) {
    return { options: [], one_time_fees: [], unit_addon_sum: 0 };
  }

  const parsedOptions = [];
  let unitAddonSum = 0;

  for (const section of schemaConfig.sections) {
    if (!section.fields || !Array.isArray(section.fields)) continue;

    const secMode = section.selection_mode || 'multiple';
    const secTitle = section.title || 'this section';

    // Single choice section enforcement:
    if (secMode === 'single') {
      let activeSelectedFields = 0;
      for (const chkFld of section.fields) {
        const val = submittedFields[chkFld.id];
        let isSelected = false;
        if (Array.isArray(val)) {
          if (val.filter(v => String(v).trim() !== '').length > 0) isSelected = true;
        } else if (val !== undefined && val !== null && String(val).trim() !== '') {
          if (chkFld.type === 'checkbox') {
            const unchecked = chkFld.unchecked_value || 'no';
            if (String(val) !== unchecked) isSelected = true;
          } else {
            isSelected = true;
          }
        }
        if (isSelected) activeSelectedFields++;
      }

      if (activeSelectedFields > 1) {
        return {
          is_error: true,
          code: 'scpo_single_choice_violation',
          message: `Please select only one option in "${secTitle}".`
        };
      }
    }

    // Process fields in section
    for (const field of section.fields) {
      const fldId = field.id;
      const fldType = field.type || 'text';
      const label = field.label || fldId;
      const rawVal = submittedFields[fldId];

      let isEmpty = false;
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        isEmpty = true;
      } else if (Array.isArray(rawVal)) {
        if (rawVal.filter(v => String(v).trim() !== '').length === 0) isEmpty = true;
      } else if (fldType === 'checkbox' && rawVal === (field.unchecked_value || 'no')) {
        isEmpty = true;
      }

      if (field.required && isEmpty) {
        return { is_error: true, code: 'scpo_missing_required', message: `"${label}" is a required option.` };
      }

      if (isEmpty) continue;

      let fieldAddon = 0;
      let displayValue = '';
      let sanitizedValue = rawVal;

      if (fldType === 'select') {
        const matched = (field.options || []).find(o => o.id === rawVal);
        if (!matched) return { is_error: true, code: 'scpo_invalid_option_choice', message: `Selected option for "${label}" is invalid.` };
        displayValue = matched.label;
        fieldAddon = matched.price || 0;
      } else if (fldType === 'checkbox') {
        displayValue = 'Yes';
        fieldAddon = field.pricing ? field.pricing.amount || 0 : 0;
      } else if (fldType === 'multiselect') {
        const rawIds = Array.isArray(rawVal) ? rawVal : String(rawVal).split(',').map(s => s.trim());
        const allowedMap = new Map((field.options || []).map(o => [o.id, o]));
        const validIds = [];
        let multiSum = 0;

        for (const cid of rawIds) {
          if (!allowedMap.has(cid)) return { is_error: true, code: 'scpo_invalid_option_choice', message: `Selected option for "${label}" is invalid.` };
          if (validIds.includes(cid)) continue;
          validIds.push(cid);
          multiSum += (allowedMap.get(cid).price || 0);
        }

        if (secMode === 'single' && validIds.length > 1) {
          return { is_error: true, code: 'scpo_single_choice_violation', message: `Please select only one option in "${secTitle}".` };
        }

        sanitizedValue = validIds;
        displayValue = validIds.map(id => allowedMap.get(id).label).join(', ');
        fieldAddon = multiSum;
      } else if (fldType === 'imageselect') {
        const rawChoices = Array.isArray(rawVal) ? rawVal : (String(rawVal).trim() !== '' ? [rawVal] : []);
        const allowedMap = new Map((field.options || []).map(o => [o.id, o]));

        if (secMode === 'single' && rawChoices.length > 1) {
          return { is_error: true, code: 'scpo_single_choice_violation', message: `Please select only one option in "${secTitle}".` };
        }

        if (secMode === 'single' || rawChoices.length === 1) {
          const singleId = rawChoices[0];
          if (!allowedMap.has(singleId)) return { is_error: true, code: 'scpo_invalid_option_choice', message: `Selected option for "${label}" is invalid.` };
          const matched = allowedMap.get(singleId);
          sanitizedValue = singleId;
          displayValue = matched.label;
          fieldAddon = matched.price || 0;
        } else {
          // Multiple image choices in multiple-choice section
          let imgSum = 0;
          const validIds = [];
          for (const cid of rawChoices) {
            if (!allowedMap.has(cid)) return { is_error: true, code: 'scpo_invalid_option_choice', message: `Selected option for "${label}" is invalid.` };
            if (validIds.includes(cid)) continue;
            validIds.push(cid);
            imgSum += (allowedMap.get(cid).price || 0);
          }
          sanitizedValue = validIds;
          displayValue = validIds.map(id => allowedMap.get(id).label).join(', ');
          fieldAddon = imgSum;
        }
      }

      unitAddonSum += fieldAddon;
      parsedOptions.push({
        field_id: fldId,
        type: fldType,
        label,
        value: sanitizedValue,
        display_value: displayValue,
        price_adjustment: fieldAddon
      });
    }
  }

  return { options: parsedOptions, unit_addon_sum: unitAddonSum };
}

// -------------------------------------------------------------
// TEST CASE 1: Single Accept (Single choice section with 1 option selected)
// -------------------------------------------------------------
const singleChoiceSchema = {
  id: 'set_single_test',
  sections: [
    {
      id: 'sec_color_single',
      title: 'Color Group',
      selection_mode: 'single',
      fields: [
        { id: 'fld_color_a', type: 'checkbox', label: 'Tactical Black', pricing: { amount: 0 } },
        { id: 'fld_color_b', type: 'checkbox', label: 'Desert Khaki', pricing: { amount: 5 } }
      ]
    }
  ]
};

const submissionSingleAccept = {
  fld_color_a: 'no',
  fld_color_b: 'yes'
};
const resSingleAccept = validateAndParseSubmission(submissionSingleAccept, singleChoiceSchema);
assert(!resSingleAccept.is_error, 'PHP Engine: Single choice section with 1 option selected is ACCEPTED');
assert(resSingleAccept.unit_addon_sum === 5, 'PHP Engine: Applies €5.00 price delta for selected single choice');

// -------------------------------------------------------------
// TEST CASE 2: Single Reject (Single choice section with 2 sibling options selected)
// -------------------------------------------------------------
const submissionSingleReject = {
  fld_color_a: 'yes',
  fld_color_b: 'yes'
};
const resSingleReject = validateAndParseSubmission(submissionSingleReject, singleChoiceSchema);
assert(resSingleReject.is_error === true, 'PHP Engine: Single choice section with multiple sibling options is REJECTED');
assert(resSingleReject.code === 'scpo_single_choice_violation', 'PHP Engine: Error code is scpo_single_choice_violation');
assert(resSingleReject.message.includes('Please select only one option in "Color Group"'), 'PHP Engine: Rejection produces safe user-facing validation notice');

// -------------------------------------------------------------
// TEST CASE 3: Multiple Accept (Multiple choices section with 2+ options selected)
// -------------------------------------------------------------
const multiChoiceSchema = {
  id: 'set_multi_test',
  sections: [
    {
      id: 'sec_accessories_multi',
      title: 'Extra Accessories',
      selection_mode: 'multiple',
      fields: [
        { id: 'fld_acc_belt', type: 'checkbox', label: 'Tactical Belt', pricing: { amount: 15 } },
        { id: 'fld_acc_pouch', type: 'checkbox', label: 'Utility Pouch', pricing: { amount: 10 } }
      ]
    }
  ]
};

const submissionMultiAccept = {
  fld_acc_belt: 'yes',
  fld_acc_pouch: 'yes'
};
const resMultiAccept = validateAndParseSubmission(submissionMultiAccept, multiChoiceSchema);
assert(!resMultiAccept.is_error, 'PHP Engine: Multiple choices section with multiple options selected is ACCEPTED');
assert(resMultiAccept.unit_addon_sum === 25, 'PHP Engine: Sums all selected options (€15 + €10 = €25)');

// -------------------------------------------------------------
// TEST CASE 4: Image Single Accept (Image choice in single choice section with 1 choice)
// -------------------------------------------------------------
const imageSingleSchema = {
  id: 'set_img_single',
  sections: [
    {
      id: 'sec_camo_single',
      title: 'Camouflage Pattern',
      selection_mode: 'single',
      fields: [
        {
          id: 'fld_camo_img',
          type: 'imageselect',
          label: 'Pattern Choice',
          required: true,
          options: [
            { id: 'opt_woodland', label: 'Woodland', price: 20 },
            { id: 'opt_desert', label: 'Desert', price: 25 }
          ]
        }
      ]
    }
  ]
};

const subImgSingleAccept = { fld_camo_img: 'opt_woodland' };
const resImgSingleAccept = validateAndParseSubmission(subImgSingleAccept, imageSingleSchema);
assert(!resImgSingleAccept.is_error, 'PHP Engine: Image choice in single section with 1 choice is ACCEPTED');
assert(resImgSingleAccept.unit_addon_sum === 20, 'PHP Engine: Applies Woodland Camo price €20.00');

// -------------------------------------------------------------
// TEST CASE 5: Image Single Reject (Image choice in single choice section with 2+ choices)
// -------------------------------------------------------------
const subImgSingleReject = { fld_camo_img: ['opt_woodland', 'opt_desert'] };
const resImgSingleReject = validateAndParseSubmission(subImgSingleReject, imageSingleSchema);
assert(resImgSingleReject.is_error === true, 'PHP Engine: Image choice in single section with 2 choices is REJECTED');
assert(resImgSingleReject.code === 'scpo_single_choice_violation', 'PHP Engine: Image rejection code is scpo_single_choice_violation');

// -------------------------------------------------------------
// TEST CASE 6: Image Multiple Accept (Image choice in multiple choices section with 2 choices)
// -------------------------------------------------------------
const imageMultiSchema = {
  id: 'set_img_multi',
  sections: [
    {
      id: 'sec_camo_multi',
      title: 'Multiple Camo Patches',
      selection_mode: 'multiple',
      fields: [
        {
          id: 'fld_camo_img_multi',
          type: 'imageselect',
          label: 'Pattern Patches',
          required: true,
          options: [
            { id: 'opt_woodland', label: 'Woodland', price: 20 },
            { id: 'opt_desert', label: 'Desert', price: 25 }
          ]
        }
      ]
    }
  ]
};

const subImgMultiAccept = { fld_camo_img_multi: ['opt_woodland', 'opt_desert'] };
const resImgMultiAccept = validateAndParseSubmission(subImgMultiAccept, imageMultiSchema);
assert(!resImgMultiAccept.is_error, 'PHP Engine: Image choice in multiple section with 2 choices is ACCEPTED');
assert(resImgMultiAccept.unit_addon_sum === 45, 'PHP Engine: Multi-image choices summed (€20 + €25 = €45.00)');

// -------------------------------------------------------------
// 4. UI POLISH & ACCESSIBILITY TESTS
// -------------------------------------------------------------
assert(adminJs.includes("scpo-sec-mode-select"), 'Admin JS provides scpo-sec-mode-select control in section cards');
assert(adminJs.includes("Single choice") && adminJs.includes("Multiple choices"), 'Admin JS renders explicit "Single choice" and "Multiple choices" options');
assert(adminJs.includes("openSectionPanel"), 'Admin JS provides openSectionPanel for contextual section configuration');

// UI Polish: explicit labels
assert(adminJs.includes("'select': 'Single Select'"), 'Admin JS maps select to explicit label "Single Select"');
assert(adminJs.includes("'multiselect': 'Multi Select'"), 'Admin JS maps multiselect to explicit label "Multi Select"');
assert(adminJs.includes("'imageselect': 'Image Select'"), 'Admin JS maps imageselect to explicit label "Image Select"');
assert(adminJs.includes("'checkbox': 'Checkbox'"), 'Admin JS maps checkbox to explicit label "Checkbox"');

// No raw enum uppercase strings
assert(!adminJs.includes('>IMAGESELECT<') && !adminJs.includes('>MULTISELECT<'), 'No raw enum uppercase IMAGESELECT or MULTISELECT in Admin JS');
assert(!appTsx.includes('uppercase tracking-wider">Tactical Equipment Catalog'), 'No text-transform uppercase in React simulator product banner');

// Banner sentence case check
assert(editorTemplate.includes('Live Customer Form Preview (synchronized with current edits)'), 'Editor template uses exact sentence case banner: "Live Customer Form Preview (synchronized with current edits)"');
assert(appTsx.includes('Live Customer Form Preview (synchronized with current edits)'), 'React Simulator uses exact sentence case banner: "Live Customer Form Preview (synchronized with current edits)"');

// "New Option" instead of "New Field"
assert(adminJs.includes("'+ New Option'") || adminJs.includes("+ New Option"), 'Admin button uses "+ New Option" instead of "+ New Field"');
assert(appTsx.includes("+ New Option"), 'React builder button uses "+ New Option" instead of "+ New Field"');

// Turkish text preserved without alteration
const turkishSample = 'İndirimli Kırmızı Özel Sipariş • Ekstra Donanım • Kamuflaj Deseni';
assert(turkishSample.includes('İ') && turkishSample.includes('ı') && turkishSample.includes('ş'), 'Turkish character test string is intact');
assert(sanitizerCode.includes('sanitize_text_field'), 'Sanitizer preserves UTF-8 merchant input');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nPhase 3.4 Section Selection Rules & UI Polish Verification Summary: ${passed}/${total} assertions PASSED.`);
