<?php
/**
 * Environment & WooCommerce Compatibility Checks
 *
 * @package SimpleCustomProductOptions
 */

namespace SimpleCustomProductOptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Compatibility {

	const MIN_PHP_VERSION = '7.4.0';
	const MIN_WP_VERSION  = '6.0';
	const MIN_WC_VERSION  = '7.0';

	/**
	 * Check if all runtime dependencies are met.
	 *
	 * @return bool
	 */
	public static function check_dependencies() {
		return self::is_php_compatible() && self::is_wp_compatible() && self::is_woocommerce_active() && self::is_wc_compatible();
	}

	/**
	 * Check PHP version.
	 *
	 * @return bool
	 */
	public static function is_php_compatible() {
		return version_compare( PHP_VERSION, self::MIN_PHP_VERSION, '>=' );
	}

	/**
	 * Check WordPress version.
	 *
	 * @return bool
	 */
	public static function is_wp_compatible() {
		global $wp_version;
		return version_compare( $wp_version, self::MIN_WP_VERSION, '>=' );
	}

	/**
	 * Check if WooCommerce is installed and active.
	 *
	 * @return bool
	 */
	public static function is_woocommerce_active() {
		return class_exists( 'WooCommerce' ) || in_array( 'woocommerce/woocommerce.php', apply_filters( 'active_plugins', get_option( 'active_plugins', array() ) ), true );
	}

	/**
	 * Check WooCommerce version.
	 *
	 * @return bool
	 */
	public static function is_wc_compatible() {
		if ( ! defined( 'WC_VERSION' ) ) {
			return false;
		}
		return version_compare( WC_VERSION, self::MIN_WC_VERSION, '>=' );
	}

	/**
	 * Render admin notice when dependencies fail.
	 */
	public static function render_missing_dependency_notice() {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		$errors = array();

		if ( ! self::is_php_compatible() ) {
			/* translators: %s: Minimum PHP version */
			$errors[] = sprintf( __( 'Simple Custom Product Options requires PHP %s or higher.', 'simple-custom-product-options' ), self::MIN_PHP_VERSION );
		}

		if ( ! self::is_wp_compatible() ) {
			/* translators: %s: Minimum WordPress version */
			$errors[] = sprintf( __( 'Simple Custom Product Options requires WordPress %s or higher.', 'simple-custom-product-options' ), self::MIN_WP_VERSION );
		}

		if ( ! self::is_woocommerce_active() ) {
			$errors[] = __( 'Simple Custom Product Options requires WooCommerce to be installed and active.', 'simple-custom-product-options' );
		} elseif ( ! self::is_wc_compatible() ) {
			/* translators: %s: Minimum WooCommerce version */
			$errors[] = sprintf( __( 'Simple Custom Product Options requires WooCommerce %s or higher.', 'simple-custom-product-options' ), self::MIN_WC_VERSION );
		}

		if ( ! empty( $errors ) ) {
			echo '<div class="notice notice-error is-dismissible">';
			echo '<p><strong>' . esc_html__( 'Simple Custom Product Options could not run:', 'simple-custom-product-options' ) . '</strong></p>';
			echo '<ul style="list-style: disc; padding-left: 20px;">';
			foreach ( $errors as $error ) {
				echo '<li>' . esc_html( $error ) . '</li>';
			}
			echo '</ul>';
			echo '</div>';
		}
	}
}
