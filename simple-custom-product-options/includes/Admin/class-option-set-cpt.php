<?php
/**
 * Register Custom Post Type for Option Sets
 *
 * @package SimpleCustomProductOptions\Admin
 */

namespace SimpleCustomProductOptions\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Option_Set_CPT {

	const POST_TYPE = 'scpo_option_set';

	/**
	 * Register the CPT.
	 */
	public static function register() {
		$labels = array(
			'name'               => _x( 'Product Option Sets', 'post type general name', 'simple-custom-product-options' ),
			'singular_name'      => _x( 'Product Option Set', 'post type singular name', 'simple-custom-product-options' ),
			'menu_name'          => _x( 'Product Options', 'admin menu', 'simple-custom-product-options' ),
			'name_admin_bar'     => _x( 'Product Option Set', 'add new on admin bar', 'simple-custom-product-options' ),
			'add_new'            => _x( 'Add New Set', 'option set', 'simple-custom-product-options' ),
			'add_new_item'       => __( 'Add New Option Set', 'simple-custom-product-options' ),
			'new_item'           => __( 'New Option Set', 'simple-custom-product-options' ),
			'edit_item'          => __( 'Edit Option Set', 'simple-custom-product-options' ),
			'view_item'          => __( 'View Option Set', 'simple-custom-product-options' ),
			'all_items'          => __( 'All Option Sets', 'simple-custom-product-options' ),
			'search_items'       => __( 'Search Option Sets', 'simple-custom-product-options' ),
			'not_found'          => __( 'No option sets found.', 'simple-custom-product-options' ),
			'not_found_in_trash' => __( 'No option sets found in Trash.', 'simple-custom-product-options' ),
		);

		$args = array(
			'labels'             => $labels,
			'description'        => __( 'Reusable product option sets for WooCommerce products.', 'simple-custom-product-options' ),
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => false, // Controlled via custom submenu page under WooCommerce
			'show_in_menu'       => false,
			'query_var'          => false,
			'rewrite'            => false,
			'capability_type'    => 'post',
			'capabilities'       => array(
				'edit_post'          => 'manage_woocommerce',
				'read_post'          => 'manage_woocommerce',
				'delete_post'        => 'manage_woocommerce',
				'edit_posts'         => 'manage_woocommerce',
				'edit_others_posts'  => 'manage_woocommerce',
				'publish_posts'      => 'manage_woocommerce',
				'read_private_posts' => 'manage_woocommerce',
			),
			'has_archive'        => false,
			'hierarchical'       => false,
			'menu_position'      => null,
			'supports'           => array( 'title' ),
		);

		register_post_type( self::POST_TYPE, $args );
	}
}
