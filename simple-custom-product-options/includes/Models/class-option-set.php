<?php
/**
 * Option Set Registry & Query Service
 *
 * @package SimpleCustomProductOptions\Models
 */

namespace SimpleCustomProductOptions\Models;

use SimpleCustomProductOptions\Admin\Option_Set_CPT;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Option_Set {

	/**
	 * Get all active option sets attached to a given WooCommerce product.
	 *
	 * @param int $product_id Product ID (or parent product ID for variations).
	 * @return array Array of option set objects containing ID, post_title, and _scpo_config.
	 */
	public static function get_active_for_product( $product_id ) {
		$product_id = absint( $product_id );
		if ( ! $product_id ) {
			return array();
		}

		// Query published option sets.
		$posts = get_posts( array(
			'post_type'      => Option_Set_CPT::POST_TYPE,
			'post_status'    => 'publish',
			'posts_per_page' => -1,
			'orderby'        => 'menu_order title',
			'order'          => 'ASC',
		) );

		if ( empty( $posts ) ) {
			return array();
		}

		$matched_sets = array();

		foreach ( $posts as $post ) {
			$assignment = get_post_meta( $post->ID, '_scpo_assignment', true );
			if ( ! is_array( $assignment ) ) {
				continue;
			}

			$applies = false;
			$type    = isset( $assignment['type'] ) ? $assignment['type'] : 'specific_products';

			if ( 'all_products' === $type ) {
				$applies = true;
			} elseif ( 'specific_products' === $type ) {
				if ( ! empty( $assignment['product_ids'] ) && in_array( $product_id, array_map( 'absint', (array) $assignment['product_ids'] ), true ) ) {
					$applies = true;
				}
			}

			if ( $applies ) {
				$config = get_post_meta( $post->ID, '_scpo_config', true );
				if ( is_array( $config ) ) {
					$matched_sets[] = array(
						'id'     => $post->ID,
						'set_id' => isset( $config['id'] ) ? $config['id'] : 'set_' . $post->ID,
						'title'  => $post->post_title,
						'config' => $config,
					);
				}
			}
		}

		return $matched_sets;
	}

	/**
	 * Check if an option set has any required fields.
	 *
	 * @param array $config Option set configuration.
	 * @return bool
	 */
	public static function has_required_fields( $config ) {
		if ( empty( $config['sections'] ) || ! is_array( $config['sections'] ) ) {
			return false;
		}

		foreach ( $config['sections'] as $sec ) {
			if ( ! empty( $sec['fields'] ) && is_array( $sec['fields'] ) ) {
				foreach ( $sec['fields'] as $fld ) {
					if ( ! empty( $fld['required'] ) ) {
						return true;
					}
				}
			}
		}

		return false;
	}
}
