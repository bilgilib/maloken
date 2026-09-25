<?php
/**
 * Plugin Name: Simple Custom Product Options for WooCommerce
 * Plugin URI:  https://github.com/example/simple-custom-product-options
 * Description: Modular, independent, lightweight custom product add-ons and options for WooCommerce.
 * Version:     1.1.1
 * Author:      Local MVP Builder
 * Author URI:  https://example.com
 * Text Domain: simple-custom-product-options
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 7.0
 * WC tested up to:      9.3
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

// Plugin constants.
define( 'SCPO_VERSION', '1.1.1' );
define( 'SCPO_PLUGIN_FILE', __FILE__ );
define( 'SCPO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SCPO_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'SCPO_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// Autoloader.
require_once SCPO_PLUGIN_DIR . 'includes/class-autoloader.php';

// Bootstrap plugin lifecycle.
add_action( 'plugins_loaded', array( 'SimpleCustomProductOptions\\Plugin', 'instance' ) );

// Declare HPOS (High-Performance Order Storage) Compatibility.
add_action( 'before_woocommerce_init', function() {
	if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
			'custom_order_tables',
			__FILE__,
			true
		);
	}
} );
