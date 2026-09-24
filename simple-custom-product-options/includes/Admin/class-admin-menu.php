<?php
/**
 * Admin Menu for Product Options
 *
 * @package SimpleCustomProductOptions\Admin
 */

namespace SimpleCustomProductOptions\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Admin_Menu {

	/**
	 * Hook in admin menu.
	 */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ), 55 );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
	}

	/**
	 * Register WooCommerce -> Product Options submenu.
	 */
	public function register_menu() {
		add_submenu_page(
			'woocommerce',
			__( 'Product Options', 'simple-custom-product-options' ),
			__( 'Product Options', 'simple-custom-product-options' ),
			'manage_woocommerce',
			'scpo-option-sets',
			array( $this, 'render_page' )
		);
	}

	/**
	 * Enqueue admin CSS and JS only on our settings screen.
	 *
	 * @param string $hook Admin hook suffix.
	 */
	public function enqueue_admin_assets( $hook ) {
		if ( strpos( $hook, 'scpo-option-sets' ) === false ) {
			return;
		}

		wp_enqueue_style(
			'scpo-admin-style',
			SCPO_PLUGIN_URL . 'assets/css/scpo-admin.css',
			array(),
			SCPO_VERSION
		);

		wp_enqueue_script(
			'scpo-admin-script',
			SCPO_PLUGIN_URL . 'assets/js/scpo-admin.js',
			array( 'jquery' ),
			SCPO_VERSION,
			true
		);

		wp_localize_script(
			'scpo-admin-script',
			'scpo_admin_params',
			array(
				'i18n' => array(
					'confirm_delete'    => __( 'Are you sure you want to delete this option set?', 'simple-custom-product-options' ),
					'confirm_duplicate' => __( 'Duplicate this option set?', 'simple-custom-product-options' ),
				),
			)
		);
	}

	/**
	 * Dispatch router for submenu page (list vs edit/add).
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'simple-custom-product-options' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_text_field( wp_unslash( $_GET['action'] ) ) : 'list';

		if ( 'add' === $action || 'edit' === $action ) {
			include SCPO_PLUGIN_DIR . 'templates/admin/editor-screen.php';
		} else {
			include SCPO_PLUGIN_DIR . 'templates/admin/list-screen.php';
		}
	}
}
