<?php
/**
 * Minimal in-memory WordPress environment mock for CLI verification
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	define( 'WP_UNINSTALL_PLUGIN', true );
}

// Global state mocks
$GLOBALS['wp_version'] = '6.6.2';
$GLOBALS['wp_actions'] = array();
$GLOBALS['wp_filters'] = array();
$GLOBALS['wp_posts'] = array();
$GLOBALS['wp_postmeta'] = array();
$GLOBALS['wp_options'] = array(
	'active_plugins' => array( 'woocommerce/woocommerce.php' )
);

// Mocks
function plugin_dir_path( $file ) { return dirname( $file ) . '/'; }
function plugin_dir_url( $file ) { return 'https://example.com/wp-content/plugins/simple-custom-product-options/'; }
function plugin_basename( $file ) { return basename( dirname( $file ) ) . '/' . basename( $file ); }

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	$GLOBALS['wp_actions'][$hook][] = $callback;
}
function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
	$GLOBALS['wp_filters'][$hook][] = $callback;
}
function apply_filters( $hook, $value ) {
	return $value;
}
function get_option( $name, $default = false ) {
	return isset( $GLOBALS['wp_options'][$name] ) ? $GLOBALS['wp_options'][$name] : $default;
}
function update_option( $name, $value ) {
	$GLOBALS['wp_options'][$name] = $value;
	return true;
}
function delete_option( $name ) {
	unset( $GLOBALS['wp_options'][$name] );
	return true;
}
function register_post_type( $post_type, $args ) {
	$GLOBALS['wp_post_types'][$post_type] = $args;
	return true;
}
function get_posts( $args ) {
	return array_keys( $GLOBALS['wp_posts'] );
}
function wp_delete_post( $id, $force = false ) {
	unset( $GLOBALS['wp_posts'][$id] );
	unset( $GLOBALS['wp_postmeta'][$id] );
	return true;
}
function sanitize_text_field( $str ) { return trim( strip_tags( (string) $str ) ); }
function sanitize_textarea_field( $str ) { return trim( strip_tags( (string) $str ) ); }
function sanitize_key( $key ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) ); }
function absint( $val ) { return abs( intval( $val ) ); }
function __( $text, $domain = 'default' ) { return $text; }
function _x( $text, $context, $domain = 'default' ) { return $text; }
function esc_html__( $text, $domain = 'default' ) { return $text; }
function esc_attr_e( $text, $domain = 'default' ) { echo $text; }
function esc_html_e( $text, $domain = 'default' ) { echo $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text ); }
function current_user_can( $cap ) { return true; }
