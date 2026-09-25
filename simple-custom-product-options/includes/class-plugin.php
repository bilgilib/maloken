<?php
/**
 * Main Plugin Coordinator
 *
 * @package SimpleCustomProductOptions
 */

namespace SimpleCustomProductOptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Plugin {

	/**
	 * Single instance of the plugin.
	 *
	 * @var Plugin|null
	 */
	protected static $instance = null;

	/**
	 * Option set registry/manager.
	 *
	 * @var Admin\Option_Set_Controller
	 */
	public $option_set_controller;

	/**
	 * Get the singleton instance.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	protected function __construct() {
		$this->init();
	}

	/**
	 * Initialize plugin components.
	 */
	public function init() {
		// Verify environment dependencies.
		if ( ! Compatibility::check_dependencies() ) {
			add_action( 'admin_notices', array( 'SimpleCustomProductOptions\\Compatibility', 'render_missing_dependency_notice' ) );
			return;
		}

		// Register Custom Post Type.
		add_action( 'init', array( 'SimpleCustomProductOptions\\Admin\\Option_Set_CPT', 'register' ) );

		// Initialize Media Folder logical taxonomy and management.
		new Admin\Media_Folder();

		// Initialize Commerce (Cart, Checkout & Pricing) lifecycle.
		new Commerce\Cart_Manager();

		// Initialize Frontend rendering.
		if ( ! is_admin() || wp_doing_ajax() ) {
			new Frontend\Frontend_Renderer();
		}

		// Initialize Admin components.
		if ( is_admin() ) {
			$this->init_admin();
		}
	}

	/**
	 * Initialize admin hooks and screens.
	 */
	protected function init_admin() {
		new Admin\Admin_Menu();
		$this->option_set_controller = new Admin\Option_Set_Controller();
	}
}
