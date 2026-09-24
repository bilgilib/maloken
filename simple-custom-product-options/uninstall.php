<?php
/**
 * Uninstall Simple Custom Product Options
 *
 * Preserves merchant data by default. Only deletes option sets and metadata
 * if the merchant explicitly sets the option 'scpo_delete_data_on_uninstall' to true.
 *
 * @package SimpleCustomProductOptions
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Check merchant preference. Default: FALSE (preserve all option sets and settings).
$delete_data = get_option( 'scpo_delete_data_on_uninstall', false );

if ( ! empty( $delete_data ) && true === (bool) $delete_data ) {
	global $wpdb;

	// Query all option set posts.
	$option_set_ids = get_posts( array(
		'post_type'      => 'scpo_option_set',
		'post_status'    => 'any',
		'numberposts'    => -1,
		'fields'         => 'ids',
	) );

	// Delete posts and postmeta.
	foreach ( $option_set_ids as $post_id ) {
		wp_delete_post( $post_id, true );
	}

	// Delete options.
	delete_option( 'scpo_delete_data_on_uninstall' );
	delete_option( 'scpo_schema_version' );
}
