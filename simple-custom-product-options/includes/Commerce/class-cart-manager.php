<?php
/**
 * Cart Lifecycle & Authoritative Pricing Manager
 *
 * @package SimpleCustomProductOptions\Commerce
 */

namespace SimpleCustomProductOptions\Commerce;

use SimpleCustomProductOptions\Models\Option_Set;
use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Cart_Manager {

	/**
	 * In-memory registry of fees for the current request lifecycle.
	 * Format: [ $fee_unique_id => [ 'cart_item_key' => ..., 'field_id' => ..., 'label' => ..., 'amount' => ... ] ]
	 *
	 * @var array
	 */
	public static $registered_fees = array();

	/**
	 * Constructor. Hooks into WooCommerce cart and checkout filters.
	 */
	public function __construct() {
		// 1. Add-to-cart validation.
		add_filter( 'woocommerce_add_to_cart_validation', array( $this, 'validate_add_to_cart' ), 10, 6 );

		// 2. Attach structured option data to session cart item.
		add_filter( 'woocommerce_add_cart_item_data', array( $this, 'attach_cart_item_data' ), 10, 4 );

		// 3. Recalculate item unit price before totals without cumulative drift.
		add_action( 'woocommerce_before_calculate_totals', array( $this, 'calculate_cart_item_prices' ), 20, 1 );

		// 4. Register one-time fees deterministically using WC()->cart->fees_api()->add_fee().
		add_action( 'woocommerce_cart_calculate_fees', array( $this, 'calculate_one_time_fees' ), 20, 1 );

		// 5. Display option details on Cart and Checkout tables.
		add_filter( 'woocommerce_get_item_data', array( $this, 'render_cart_item_display_data' ), 10, 2 );

		// 6. Persist structured options and human snapshots into Order line item meta.
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'save_order_line_item_meta' ), 10, 4 );

		// 7. Persist fee item metadata into Order fee line.
		add_action( 'woocommerce_checkout_create_order_fee_item', array( $this, 'save_order_fee_item_meta' ), 10, 4 );
	}

	/**
	 * Validate options submitted during add to cart.
	 * Signature accepts 2 to 6 arguments safely.
	 *
	 * @param bool  $passed       Validation state.
	 * @param int   $product_id   Product ID.
	 * @param int   $quantity     Quantity added.
	 * @param int   $variation_id Variation ID.
	 * @param array $variations   Variations array.
	 * @param array $cart_data    Cart item data.
	 * @return bool
	 */
	public function validate_add_to_cart( $passed, $product_id, $quantity = 1, $variation_id = 0, $variations = array(), $cart_data = array() ) {
		if ( ! $passed ) {
			return false;
		}

		$target_id = ! empty( $variation_id ) ? (int) wp_get_post_parent_id( $variation_id ) : (int) $product_id;
		if ( ! $target_id ) {
			$target_id = (int) $product_id;
		}

		$option_sets = Option_Set::get_active_for_product( $target_id );
		if ( empty( $option_sets ) ) {
			return true; // Bypass products without active custom options.
		}

		// Check if data is coming from POST form.
		$submitted_fields = array();
		if ( isset( $_POST['scpo_fields'] ) && is_array( $_POST['scpo_fields'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			// Nonce verification for form submissions.
			$nonce = isset( $_POST['scpo_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['scpo_nonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
			if ( ! wp_verify_nonce( $nonce, 'scpo_add_to_cart_' . $target_id ) ) {
				wc_add_notice( __( 'Security check failed. Please refresh the product page and try again.', 'simple-custom-product-options' ), 'error' );
				return false;
			}
			$submitted_fields = wp_unslash( $_POST['scpo_fields'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		} elseif ( ! empty( $cart_data['scpo_fields'] ) && is_array( $cart_data['scpo_fields'] ) ) {
			// Programmatic addition via WC()->cart->add_to_cart( ..., $cart_data ).
			$submitted_fields = $cart_data['scpo_fields'];
		} else {
			// No options submitted: check if any fields were required.
			foreach ( $option_sets as $set ) {
				if ( Option_Set::has_required_fields( $set['config'] ) ) {
					wc_add_notice( __( 'Please fill in all required product options before adding to cart.', 'simple-custom-product-options' ), 'error' );
					return false;
				}
			}
			return true;
		}

		// Perform server-side validation against each attached option set schema.
		foreach ( $option_sets as $set ) {
			$result = Price_Calculator::validate_and_parse_submission( $submitted_fields, $set['config'] );
			if ( is_wp_error( $result ) ) {
				wc_add_notice( $result->get_error_message(), 'error' );
				return false;
			}
		}

		return true;
	}

	/**
	 * Attach validated structured option data to the cart item array.
	 *
	 * @param array $cart_item_data Existing cart item data.
	 * @param int   $product_id     Product ID.
	 * @param int   $variation_id   Variation ID.
	 * @param int   $quantity       Quantity.
	 * @return array
	 */
	public function attach_cart_item_data( $cart_item_data, $product_id, $variation_id = 0, $quantity = 1 ) {
		$target_id = ! empty( $variation_id ) ? (int) wp_get_post_parent_id( $variation_id ) : (int) $product_id;
		if ( ! $target_id ) {
			$target_id = (int) $product_id;
		}

		$option_sets = Option_Set::get_active_for_product( $target_id );
		if ( empty( $option_sets ) ) {
			return $cart_item_data;
		}

		$submitted_fields = array();
		if ( isset( $_POST['scpo_fields'] ) && is_array( $_POST['scpo_fields'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
			$submitted_fields = wp_unslash( $_POST['scpo_fields'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		} elseif ( ! empty( $cart_item_data['scpo_fields'] ) && is_array( $cart_item_data['scpo_fields'] ) ) {
			$submitted_fields = $cart_data['scpo_fields'];
		}

		if ( empty( $submitted_fields ) ) {
			return $cart_item_data;
		}

		$all_options       = array();
		$all_one_time_fees = array();
		$total_unit_addon  = 0.0;

		foreach ( $option_sets as $set ) {
			$parsed = Price_Calculator::validate_and_parse_submission( $submitted_fields, $set['config'] );
			if ( ! is_wp_error( $parsed ) ) {
				$all_options       = array_merge( $all_options, $parsed['options'] );
				$all_one_time_fees = array_merge( $all_one_time_fees, $parsed['one_time_fees'] );
				$total_unit_addon += (float) $parsed['unit_addon_sum'];
			}
		}

		if ( ! empty( $all_options ) || ! empty( $all_one_time_fees ) ) {
			// Resolve immutable catalog base price at add-to-cart time.
			$product_obj = wc_get_product( ! empty( $variation_id ) ? $variation_id : $product_id );
			$base_price  = $product_obj ? (float) $product_obj->get_price() : 0.0;

			// Save structured payload into cart item.
			$cart_item_data['scpo_original_price'] = $base_price;
			$cart_item_data['scpo_data']           = array(
				'version'            => '1.0.0',
				'base_catalog_price' => $base_price,
				'options'            => $all_options,
				'one_time_fees'      => $all_one_time_fees,
				'unit_addon_sum'     => $total_unit_addon,
				// Hash ensures different options create distinct cart item keys.
				'unique_config_hash' => hash( 'crc32b', wp_json_encode( $all_options ) ),
			);
		}

		return $cart_item_data;
	}

	/**
	 * Recalculate cart item prices server-side on totals calculation.
	 * Protects against cumulative price mutation across multiple calls.
	 *
	 * @param \WC_Cart $cart Cart instance.
	 */
	public function calculate_cart_item_prices( $cart ) {
		if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
			return;
		}

		foreach ( $cart->cart_contents as $cart_item_key => &$cart_item ) {
			if ( empty( $cart_item['scpo_data'] ) ) {
				continue;
			}

			$product = isset( $cart_item['data'] ) ? $cart_item['data'] : null;
			if ( ! is_a( $product, 'WC_Product' ) ) {
				continue;
			}

			// Determine immutable base catalog price.
			// Priority:
			// 1. Saved immutable snapshot in scpo_data['base_catalog_price']
			// 2. Saved in $cart_item['scpo_original_price']
			// 3. Fallback to catalog regular/sale price from product object
			$base_price = 0.0;
			if ( isset( $cart_item['scpo_data']['base_catalog_price'] ) && is_numeric( $cart_item['scpo_data']['base_catalog_price'] ) ) {
				$base_price = (float) $cart_item['scpo_data']['base_catalog_price'];
			} elseif ( isset( $cart_item['scpo_original_price'] ) && is_numeric( $cart_item['scpo_original_price'] ) ) {
				$base_price = (float) $cart_item['scpo_original_price'];
			} else {
				$raw_regular = (float) $product->get_regular_price();
				$base_price  = $raw_regular > 0 ? $raw_regular : (float) $product->get_price();
			}

			// Persist by reference into actual cart contents so subsequent accesses have it.
			$cart_item['scpo_original_price'] = $base_price;
			$cart_item['scpo_data']['base_catalog_price'] = $base_price;

			$unit_addon_sum = isset( $cart_item['scpo_data']['unit_addon_sum'] ) ? (float) $cart_item['scpo_data']['unit_addon_sum'] : 0.0;

			// Authoritative idempotent calculation: immutable base price + per-unit add-on sum.
			$new_unit_price = $base_price + $unit_addon_sum;
			$product->set_price( $new_unit_price );
		}
		unset( $cart_item );
	}

	/**
	 * Calculate and register one-time fees via WC()->cart->fees_api()->add_fee().
	 * Guarantees idempotency and safe collision-resistant fee registration.
	 *
	 * @param \WC_Cart $cart Cart instance.
	 */
	public function calculate_one_time_fees( $cart ) {
		if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
			return;
		}

		// Reset in-memory lookup table for this pass.
		self::$registered_fees = array();

		foreach ( $cart->get_cart() as $cart_item_key => $cart_item ) {
			if ( empty( $cart_item['scpo_data']['one_time_fees'] ) ) {
				continue;
			}

			$product_name = $cart_item['data']->get_name();

			foreach ( $cart_item['scpo_data']['one_time_fees'] as $fee ) {
				$field_id = $fee['field_id'];
				// Collision-resistant unique deterministic ID.
				$fee_unique_id = sanitize_key( 'scpo_fee_' . hash( 'crc32b', $cart_item_key . '_' . $field_id ) );

				$fee_display_name = sprintf( '%s: %s', $product_name, $fee['label'] );

				// Register in in-memory lookup table for order fee meta saving.
				self::$registered_fees[ $fee_unique_id ] = array(
					'cart_item_key' => $cart_item_key,
					'field_id'      => $field_id,
					'product_id'    => $cart_item['product_id'],
					'product_name'  => $product_name,
					'label'         => $fee['label'],
					'amount'        => (float) $fee['amount'],
				);

				// Add fee via WooCommerce Fees API (associative array argument with explicit 'id').
				$cart->fees_api()->add_fee( array(
					'id'        => $fee_unique_id,
					'name'      => $fee_display_name,
					'amount'    => (float) $fee['amount'],
					'taxable'   => ! empty( $fee['taxable'] ),
					'tax_class' => isset( $fee['tax_class'] ) ? $fee['tax_class'] : '',
				) );
			}
		}
	}

	/**
	 * Render human-readable option snapshots in Cart and Checkout tables.
	 *
	 * @param array $item_data Existing item data rows.
	 * @param array $cart_item Cart item array.
	 * @return array
	 */
	public function render_cart_item_display_data( $item_data, $cart_item ) {
		if ( empty( $cart_item['scpo_data']['options'] ) ) {
			return $item_data;
		}

		foreach ( $cart_item['scpo_data']['options'] as $option ) {
			// Format price tag if adjustment is positive.
			$price_label = '';
			if ( ! empty( $option['price_adjustment'] ) && $option['price_adjustment'] > 0 ) {
				$price_label = ' (+' . wc_price( $option['price_adjustment'] ) . ')';
			}

			$item_data[] = array(
				'key'     => esc_html( $option['label'] ),
				'value'   => esc_html( $option['display_value'] ) . $price_label,
				'display' => '',
			);
		}

		return $item_data;
	}

	/**
	 * Persist structured data and visible snapshots to Order line item meta (HPOS & Classic).
	 *
	 * @param \WC_Order_Item_Product $item          Order item object.
	 * @param string                 $cart_item_key Cart item key.
	 * @param array                  $values        Cart item values.
	 * @param \WC_Order              $order         Order object.
	 */
	public function save_order_line_item_meta( $item, $cart_item_key, $values, $order ) {
		if ( empty( $values['scpo_data'] ) ) {
			return;
		}

		$scpo_data = $values['scpo_data'];

		// 1. Hidden structured audit meta (retains stable IDs, types, pricing modes, and unit deltas).
		$item->add_meta_data( '_scpo_options_data', $scpo_data, true );

		// 2. Visible human-readable meta snapshots for admin order view, customer My Account, and emails.
		if ( ! empty( $scpo_data['options'] ) ) {
			foreach ( $scpo_data['options'] as $option ) {
				$price_suffix = '';
				if ( ! empty( $option['price_adjustment'] ) && $option['price_adjustment'] > 0 ) {
					$price_suffix = ' (+' . wc_price( $option['price_adjustment'] ) . ')';
				}

				// Visible key: Option Label. Visible Value: Option display value + price snapshot.
				$item->add_meta_data( $option['label'], $option['display_value'] . $price_suffix, false );

				if ( ! empty( $option['image_id'] ) ) {
					$item->add_meta_data( '_scpo_image_attachment_' . $option['field_id'], absint( $option['image_id'] ), true );
				}
			}
		}
	}

	/**
	 * Persist fee item metadata to Order fee line item.
	 *
	 * @param \WC_Order_Item_Fee $item_fee Order fee item.
	 * @param string             $fee_key  Fee key.
	 * @param \stdClass          $fee      WooCommerce fee object.
	 * @param \WC_Order          $order    Order object.
	 */
	public function save_order_fee_item_meta( $item_fee, $fee_key, $fee, $order ) {
		if ( empty( $fee->id ) || ! isset( self::$registered_fees[ $fee->id ] ) ) {
			return;
		}

		$fee_meta = self::$registered_fees[ $fee->id ];

		$item_fee->add_meta_data( '_scpo_fee_id', $fee->id, true );
		$item_fee->add_meta_data( '_scpo_cart_item_key', $fee_meta['cart_item_key'], true );
		$item_fee->add_meta_data( '_scpo_field_id', $fee_meta['field_id'], true );
		$item_fee->add_meta_data( '_scpo_fee_snapshot', $fee_meta, true );
	}
}
