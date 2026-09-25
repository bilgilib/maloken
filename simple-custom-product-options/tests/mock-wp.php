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

// Taxonomy and Media mocks
$GLOBALS['wp_taxonomies'] = array();
$GLOBALS['wp_terms'] = array();
$GLOBALS['wp_post_terms'] = array();

function register_taxonomy( $taxonomy, $object_type, $args = array() ) {
	$GLOBALS['wp_taxonomies'][ $taxonomy ] = array(
		'object_type' => $object_type,
		'args'        => $args,
	);
	return true;
}

function taxonomy_exists( $taxonomy ) {
	return isset( $GLOBALS['wp_taxonomies'][ $taxonomy ] );
}

function term_exists( $term, $taxonomy = '', $parent = null ) {
	if ( isset( $GLOBALS['wp_terms'][ $taxonomy ][ $term ] ) ) {
		return array( 'term_id' => $GLOBALS['wp_terms'][ $taxonomy ][ $term ] );
	}
	return null;
}

function wp_insert_term( $term, $taxonomy, $args = array() ) {
	if ( ! isset( $GLOBALS['wp_terms'][ $taxonomy ] ) ) {
		$GLOBALS['wp_terms'][ $taxonomy ] = array();
	}
	$term_id = count( $GLOBALS['wp_terms'][ $taxonomy ] ) + 100;
	$GLOBALS['wp_terms'][ $taxonomy ][ $term ] = $term_id;
	return array( 'term_id' => $term_id, 'term_taxonomy_id' => $term_id );
}

function wp_set_object_terms( $object_id, $terms, $taxonomy, $append = false ) {
	$GLOBALS['wp_post_terms'][ $object_id ][ $taxonomy ] = (array) $terms;
	return (array) $terms;
}

function get_post( $post = null ) {
	if ( is_object( $post ) ) {
		return $post;
	}
	$id = absint( $post );
	if ( isset( $GLOBALS['wp_posts'][ $id ] ) ) {
		return (object) $GLOBALS['wp_posts'][ $id ];
	}
	return null;
}

function get_post_mime_type( $post_id ) {
	$p = get_post( $post_id );
	return $p && isset( $p->post_mime_type ) ? $p->post_mime_type : '';
}

function wp_get_attachment_image_url( $attachment_id, $size = 'thumbnail' ) {
	$p = get_post( $attachment_id );
	if ( $p && isset( $p->guid ) ) {
		return $p->guid;
	}
	return 'https://example.com/wp-content/uploads/sample-' . $attachment_id . '.png';
}

function wp_send_json_success( $data = null ) {
	echo json_encode( array( 'success' => true, 'data' => $data ) );
}

function wp_send_json_error( $data = null ) {
	echo json_encode( array( 'success' => false, 'data' => $data ) );
}

function check_ajax_referer( $action = -1, $query_arg = false, $die = true ) {
	return 1;
}

function is_wp_error( $thing ) {
	return is_a( $thing, 'WP_Error' );
}

function wp_json_encode( $data ) {
	return json_encode( $data );
}

$GLOBALS['wp_did_actions'] = array();
function do_action( $hook, ...$args ) {
	$GLOBALS['wp_did_actions'][ $hook ] = isset( $GLOBALS['wp_did_actions'][ $hook ] ) ? $GLOBALS['wp_did_actions'][ $hook ] + 1 : 1;
}

function did_action( $hook ) {
	return isset( $GLOBALS['wp_did_actions'][ $hook ] ) ? $GLOBALS['wp_did_actions'][ $hook ] : 0;
}
