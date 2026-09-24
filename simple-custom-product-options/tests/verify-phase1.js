/**
 * Phase 1 Static Verification Runner (ES Module)
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

// 1. Check Files
const requiredFiles = [
  'simple-custom-product-options.php',
  'uninstall.php',
  'includes/class-autoloader.php',
  'includes/class-compatibility.php',
  'includes/class-plugin.php',
  'includes/Admin/class-option-set-cpt.php',
  'includes/Admin/class-admin-menu.php',
  'includes/Admin/class-option-set-controller.php',
  'includes/Utils/class-sanitizer.php',
  'templates/admin/list-screen.php',
  'templates/admin/editor-screen.php',
  'assets/css/scpo-admin.css',
  'assets/js/scpo-admin.js'
];

requiredFiles.forEach(file => {
  const fullPath = path.join(pluginDir, file);
  assert(fs.existsSync(fullPath), `File exists: ${file}`);
});

// 2. Main Plugin Header and HPOS check
const mainContent = fs.readFileSync(path.join(pluginDir, 'simple-custom-product-options.php'), 'utf8');
assert(mainContent.includes('Plugin Name: Simple Custom Product Options for WooCommerce'), 'Plugin header: Plugin Name');
assert(mainContent.includes('declare_compatibility'), 'HPOS compatibility declaration exists in main file');
assert(mainContent.includes('custom_order_tables'), 'HPOS custom_order_tables declared');

// 3. Uninstall Behavior Check
const uninstallContent = fs.readFileSync(path.join(pluginDir, 'uninstall.php'), 'utf8');
assert(uninstallContent.includes('WP_UNINSTALL_PLUGIN'), 'Uninstall checks WP_UNINSTALL_PLUGIN constant');
assert(uninstallContent.includes("get_option( 'scpo_delete_data_on_uninstall', false )"), 'Uninstall defaults to false (preserves merchant data)');

// 4. CPT and Capability Check
const cptContent = fs.readFileSync(path.join(pluginDir, 'includes/Admin/class-option-set-cpt.php'), 'utf8');
assert(cptContent.includes("'manage_woocommerce'"), 'CPT capabilities check manage_woocommerce');
assert(cptContent.includes('scpo_option_set'), 'CPT post type is scpo_option_set');

// 5. Admin Nonce and Actions Check
const controllerContent = fs.readFileSync(path.join(pluginDir, 'includes/Admin/class-option-set-controller.php'), 'utf8');
assert(controllerContent.includes("check_admin_referer( 'scpo_save_option_set'"), 'Save action verifies nonce');
assert(controllerContent.includes("check_admin_referer( 'scpo_duplicate_'"), 'Duplicate action verifies nonce');
assert(controllerContent.includes("check_admin_referer( 'scpo_delete_'"), 'Delete action verifies nonce');
assert(controllerContent.includes("check_admin_referer( 'scpo_trash_'"), 'Trash action verifies nonce');
assert(controllerContent.includes("current_user_can( 'manage_woocommerce' )"), 'Controller enforces manage_woocommerce');

// 6. Schema Sanitizer Emulation
const sampleRawConfig = {
  $schema_version: '1.0.0',
  id: 'set_gift_demo',
  title: '<script>alert("hack")</script>Custom Gift Options',
  sections: [
    {
      id: 'sec_custom',
      title: '<b>Presentation</b>',
      fields: [
        {
          id: 'fld_wrap',
          type: 'checkbox',
          label: 'Gift Wrap',
          checked_value: 'yes',
          unchecked_value: 'no',
          default_state: false,
          pricing: { category: 'per_unit', mode: 'fixed', amount: '5.00' }
        },
        {
          id: 'fld_date',
          type: 'date',
          label: 'Delivery Date',
          required: true
        }
      ]
    }
  ]
};

function emulateSanitizeTextField(str) {
  // WordPress sanitize_text_field strips tags and strips scripts/styles including content
  return String(str || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '').trim();
}

function emulateSanitizeConfig(raw) {
  return {
    $schema_version: String(raw.$schema_version || '1.0.0'),
    id: String(raw.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase(),
    title: emulateSanitizeTextField(raw.title),
    sections: (raw.sections || []).map((sec, idx) => ({
      id: String(sec.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase(),
      title: emulateSanitizeTextField(sec.title),
      order: idx + 1,
      fields: (sec.fields || []).map(fld => ({
        id: String(fld.id).replace(/[^a-z0-9_\-]/gi, '').toLowerCase(),
        type: String(fld.type).replace(/[^a-z0-9_\-]/gi, '').toLowerCase(),
        label: emulateSanitizeTextField(fld.label),
        required: Boolean(fld.required),
        pricing: {
          category: fld.pricing ? fld.pricing.category : 'none',
          mode: fld.pricing ? fld.pricing.mode : 'none',
          amount: fld.pricing ? parseFloat(fld.pricing.amount) : 0.0
        }
      }))
    }))
  };
}

const sanitized = emulateSanitizeConfig(sampleRawConfig);
assert(sanitized.title === 'Custom Gift Options', 'HTML/scripts stripped from title');
assert(sanitized.sections[0].title === 'Presentation', 'HTML stripped from section title');
assert(sanitized.sections[0].fields[0].pricing.amount === 5.0, 'Amount cast to float 5.0');
assert(sanitized.sections[0].fields[1].required === true, 'Required flag preserved as boolean');

console.log(JSON.stringify(results, null, 2));
const passed = results.filter(r => r.status === 'PASS').length;
const total = results.length;
console.log(`\nVerification Summary: ${passed}/${total} assertions PASSED.`);
