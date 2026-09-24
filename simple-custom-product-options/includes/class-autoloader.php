<?php
/**
 * PSR-4 Autoloader for SimpleCustomProductOptions
 *
 * @package SimpleCustomProductOptions
 */

namespace SimpleCustomProductOptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Autoloader {

	/**
	 * Register the autoloader.
	 */
	public static function register() {
		spl_autoload_register( array( __CLASS__, 'autoload' ) );
	}

	/**
	 * Autoload callback.
	 *
	 * @param string $class Class name.
	 */
	public static function autoload( $class ) {
		$prefix   = 'SimpleCustomProductOptions\\';
		$base_dir = SCPO_PLUGIN_DIR . 'includes/';

		$len = strlen( $prefix );
		if ( strncmp( $prefix, $class, $len ) !== 0 ) {
			return;
		}

		$relative_class = substr( $class, $len );
		$parts          = explode( '\\', $relative_class );
		$class_file     = 'class-' . strtolower( str_replace( '_', '-', array_pop( $parts ) ) ) . '.php';

		$subpath = '';
		if ( ! empty( $parts ) ) {
			$subpath = implode( '/', $parts ) . '/';
		}

		$file = $base_dir . $subpath . $class_file;

		if ( file_exists( $file ) ) {
			require_once $file;
		}
	}
}

Autoloader::register();
