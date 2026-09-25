<?php
/**
 * Frontend Option Fields Renderer
 *
 * @package SimpleCustomProductOptions\Frontend
 */

namespace SimpleCustomProductOptions\Frontend;

use SimpleCustomProductOptions\Models\Option_Set;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Frontend_Renderer {

	/**
	 * Track rendered product IDs to prevent duplicate output.
	 *
	 * @var int[]
	 */
	protected static $rendered_products = array();

	/**
	 * Constructor. Hooks into single product display.
	 */
	public function __construct() {
		// Output options before the Add to Cart button on single product page.
		add_action( 'woocommerce_before_add_to_cart_button', array( $this, 'render_product_options' ), 25 );
		// Decoupled fallback rendering when add-to-cart-button hook does not fire (e.g. stock=0 backorder/preorder).
		add_action( 'woocommerce_single_product_summary', array( $this, 'render_product_options_fallback' ), 31 );
		// Enqueue scripts/styles only when needed.
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_assets' ) );
		// Change Add to Cart button link on shop archive loops if product has required options.
		add_filter( 'woocommerce_loop_add_to_cart_link', array( $this, 'filter_loop_add_to_cart_button' ), 10, 3 );
	}

	/**
	 * Enqueue scoped frontend scripts and styles.
	 */
	public function enqueue_frontend_assets() {
		if ( ! is_product() ) {
			return;
		}

		global $product;
		if ( ! is_a( $product, 'WC_Product' ) ) {
			return;
		}

		if ( ! $this->is_product_eligible( $product ) ) {
			return;
		}

		$option_sets = Option_Set::get_active_for_product( $product->get_id() );
		if ( empty( $option_sets ) ) {
			return;
		}

		$css_file = SCPO_PLUGIN_DIR . 'assets/css/scpo-frontend.css';
		$js_file  = SCPO_PLUGIN_DIR . 'assets/js/scpo-frontend.js';
		$css_ver  = file_exists( $css_file ) ? (string) filemtime( $css_file ) : SCPO_VERSION;
		$js_ver   = file_exists( $js_file ) ? (string) filemtime( $js_file ) : SCPO_VERSION;

		wp_enqueue_style(
			'scpo-frontend-style',
			SCPO_PLUGIN_URL . 'assets/css/scpo-frontend.css',
			array(),
			$css_ver
		);

		wp_enqueue_script(
			'scpo-frontend-script',
			SCPO_PLUGIN_URL . 'assets/js/scpo-frontend.js',
			array( 'jquery' ),
			$js_ver,
			true
		);

		// Localize base product price and currency formatting.
		wp_localize_script(
			'scpo-frontend-script',
			'scpo_frontend_params',
			array(
				'currency_symbol' => get_woocommerce_currency_symbol(),
				'price_format'    => get_woocommerce_price_format(),
				'decimal_sep'     => wc_get_price_decimal_separator(),
				'thousand_sep'    => wc_get_price_thousand_separator(),
				'decimals'        => wc_get_price_decimals(),
			)
		);
	}

	/**
	 * Determine if a product is eligible to display custom options.
	 *
	 * Options must render when a product is purchasable, on backorder,
	 * or preorder-capable, even when current stock quantity is zero.
	 * Only hide options when the product truly cannot be purchased
	 * and has no valid preorder/backorder path.
	 *
	 * @param \WC_Product|mixed $product Product instance.
	 * @return bool
	 */
	public function is_product_eligible( $product ) {
		if ( ! is_a( $product, 'WC_Product' ) ) {
			return false;
		}

		$is_purchasable = $product->is_purchasable();
		$can_backorder  = $product->backorders_allowed() || ( method_exists( $product, 'is_on_backorder' ) && $product->is_on_backorder() );
		$can_preorder   = $this->is_preorder_capable( $product );

		// Truly non-purchasable: if not purchasable AND no backorder or preorder capability, hide options.
		if ( ! $is_purchasable && ! $can_backorder && ! $can_preorder ) {
			return false;
		}

		// If out of stock, render if backorder or preorder or purchasable is allowed.
		$is_in_stock = $product->is_in_stock();
		if ( ! $is_in_stock && ! $can_backorder && ! $can_preorder && ! $is_purchasable ) {
			return false;
		}

		return true;
	}

	/**
	 * Check if product has preorder capabilities via standard meta or filter.
	 *
	 * @param \WC_Product $product Product instance.
	 * @return bool
	 */
	public function is_preorder_capable( $product ) {
		$product_id = $product->get_id();

		// Check common WooCommerce preorder plugin flags.
		$preorder_meta = array(
			'_wc_pre_orders_enabled',
			'_yith_wcpo_pre_order',
			'_preorder',
			'_is_preorder',
			'preorder_enabled',
		);

		foreach ( $preorder_meta as $meta_key ) {
			$val = get_post_meta( $product_id, $meta_key, true );
			if ( 'yes' === $val || '1' === $val || true === $val ) {
				return true;
			}
		}

		return (bool) apply_filters( 'scpo_is_preorder_capable', false, $product );
	}

	/**
	 * Intercept loop add-to-cart buttons for products with required options.
	 * Redirects them to the single product page instead of direct AJAX add-to-cart.
	 *
	 * @param string      $html    Button HTML.
	 * @param \WC_Product $product Product object.
	 * @param array       $args    Arguments.
	 * @return string
	 */
	public function filter_loop_add_to_cart_button( $html, $product, $args = array() ) {
		if ( ! is_a( $product, 'WC_Product' ) ) {
			return $html;
		}

		$option_sets = Option_Set::get_active_for_product( $product->get_id() );
		if ( empty( $option_sets ) ) {
			return $html;
		}

		$has_required = false;
		foreach ( $option_sets as $set ) {
			if ( Option_Set::has_required_fields( $set['config'] ) ) {
				$has_required = true;
				break;
			}
		}

		if ( $has_required ) {
			return sprintf(
				'<a href="%s" class="%s">%s</a>',
				esc_url( $product->get_permalink() ),
				esc_attr( isset( $args['class'] ) ? $args['class'] : 'button' ),
				esc_html__( 'Select options', 'woocommerce' )
			);
		}

		return $html;
	}

	/**
	 * Render option sets container on single product page.
	 */
	public function render_product_options() {
		global $product;
		if ( ! is_a( $product, 'WC_Product' ) ) {
			return;
		}

		$product_id = $product->get_id();

		// Avoid duplicate rendering on normal in-stock products.
		if ( in_array( $product_id, self::$rendered_products, true ) ) {
			return;
		}

		if ( ! $this->is_product_eligible( $product ) ) {
			return;
		}

		$option_sets = Option_Set::get_active_for_product( $product_id );
		if ( empty( $option_sets ) ) {
			return;
		}

		// Mark this product as rendered.
		self::$rendered_products[] = $product_id;

		$base_price = (float) $product->get_price();

		echo '<div class="scpo-options-wrapper" data-base-price="' . esc_attr( $base_price ) . '" data-product-id="' . esc_attr( $product_id ) . '">';
		wp_nonce_field( 'scpo_add_to_cart_' . $product_id, 'scpo_nonce' );

		foreach ( $option_sets as $set ) {
			$this->render_single_option_set( $set );
		}

		// Live price totals advisory summary.
		echo '<div class="scpo-price-summary-box">';
		echo '<div class="scpo-summary-row"><span class="scpo-summary-label">' . esc_html__( 'Base Price:', 'simple-custom-product-options' ) . '</span> <span class="scpo-summary-value scpo-base-price-display">' . wc_price( $base_price ) . '</span></div>';
		echo '<div class="scpo-summary-row"><span class="scpo-summary-label">' . esc_html__( 'Options Total:', 'simple-custom-product-options' ) . '</span> <span class="scpo-summary-value scpo-options-total-display">' . wc_price( 0 ) . '</span></div>';
		echo '<div class="scpo-summary-row scpo-total-row"><strong>' . esc_html__( 'Grand Total:', 'simple-custom-product-options' ) . '</strong> <strong class="scpo-summary-value scpo-grand-total-display">' . wc_price( $base_price ) . '</strong></div>';
		echo '</div>';

		echo '</div>'; // End wrapper.
	}

	/**
	 * Fallback render for products where woocommerce_before_add_to_cart_button
	 * does not fire (e.g. stock quantity is 0 or out of stock, but backorderable or preorder-capable).
	 */
	public function render_product_options_fallback() {
		global $product;
		if ( ! is_a( $product, 'WC_Product' ) ) {
			return;
		}

		$product_id = $product->get_id();

		// If options were already rendered by the main button hook, do nothing.
		if ( in_array( $product_id, self::$rendered_products, true ) ) {
			return;
		}

		if ( ! $this->is_product_eligible( $product ) ) {
			return;
		}

		$option_sets = Option_Set::get_active_for_product( $product_id );
		if ( empty( $option_sets ) ) {
			return;
		}

		$has_cart_form = did_action( 'woocommerce_before_add_to_cart_form' );
		if ( ! $has_cart_form ) {
			echo '<form class="cart scpo-cart-form" method="post" enctype="multipart/form-data">';
		}

		$this->render_product_options();

		if ( ! $has_cart_form ) {
			$button_text = apply_filters(
				'scpo_backorder_button_text',
				$product->backorders_allowed() ? __( 'Backorder Now', 'simple-custom-product-options' ) : __( 'Pre-Order Now', 'simple-custom-product-options' ),
				$product
			);

			echo '<div class="scpo-fallback-action-wrap" style="margin-top: 15px;">';
			echo '<input type="hidden" name="add-to-cart" value="' . esc_attr( $product_id ) . '" />';
			echo '<button type="submit" name="add-to-cart" value="' . esc_attr( $product_id ) . '" class="single_add_to_cart_button button alt scpo-backorder-submit">';
			echo esc_html( $button_text );
			echo '</button>';
			echo '</div>';
			echo '</form>';
		}
	}

	/**
	 * Render an individual option set.
	 *
	 * @param array $set Option set data.
	 */
	protected function render_single_option_set( $set ) {
		$config = $set['config'];
		if ( empty( $config['sections'] ) || ! is_array( $config['sections'] ) ) {
			return;
		}

		echo '<div class="scpo-option-set" id="scpo-set-' . esc_attr( $config['id'] ) . '">';
		if ( ! empty( $set['title'] ) ) {
			echo '<h3 class="scpo-set-title">' . esc_html( $set['title'] ) . '</h3>';
		}

		foreach ( $config['sections'] as $section ) {
			$this->render_section( $section );
		}

		echo '</div>';
	}

	/**
	 * Render a section of fields.
	 *
	 * @param array $section Section data.
	 */
	protected function render_section( $section ) {
		if ( empty( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
			return;
		}

		$sec_mode  = isset( $section['selection_mode'] ) ? $section['selection_mode'] : 'multiple';
		$sec_id    = $section['id'];
		$role_attr = ( 'single' === $sec_mode ) ? 'radiogroup' : 'group';
		$aria_lbl  = ! empty( $section['title'] ) ? ' aria-label="' . esc_attr( $section['title'] ) . '"' : '';

		echo '<div class="scpo-section scpo-section-mode-' . esc_attr( $sec_mode ) . '" id="scpo-sec-' . esc_attr( $sec_id ) . '" data-section-id="' . esc_attr( $sec_id ) . '" data-selection-mode="' . esc_attr( $sec_mode ) . '" role="' . esc_attr( $role_attr ) . '"' . $aria_lbl . '>';
		if ( ! empty( $section['title'] ) ) {
			echo '<h4 class="scpo-section-title">' . esc_html( $section['title'] ) . '</h4>';
		}
		if ( ! empty( $section['description'] ) ) {
			echo '<p class="scpo-section-description">' . esc_html( $section['description'] ) . '</p>';
		}

		foreach ( $section['fields'] as $field ) {
			$this->render_field( $field, $section );
		}

		echo '</div>';
	}

	/**
	 * Render a single form field (Phase 2 types).
	 *
	 * @param array $field Field configuration.
	 * @param array $section Parent section configuration.
	 */
	protected function render_field( $field, $section = array() ) {
		$type       = isset( $field['type'] ) ? $field['type'] : 'text';
		$field_id   = $field['id'];
		$input_name = 'scpo_fields[' . esc_attr( $field_id ) . ']';
		$required   = ! empty( $field['required'] );
		$label      = isset( $field['label'] ) ? $field['label'] : '';
		$pricing    = isset( $field['pricing'] ) ? $field['pricing'] : array();
		$mode       = isset( $pricing['mode'] ) ? $pricing['mode'] : 'none';
		$amount     = isset( $pricing['amount'] ) ? (float) $pricing['amount'] : 0.0;

		$price_tag = '';
		if ( $amount > 0 ) {
			if ( 'per_character' === $mode ) {
				$price_tag = ' (+' . wc_price( $amount ) . ' ' . esc_html__( 'per character', 'simple-custom-product-options' ) . ')';
			} elseif ( 'multiplied_by_value' === $mode ) {
				$price_tag = ' (+' . wc_price( $amount ) . ' ' . esc_html__( 'each', 'simple-custom-product-options' ) . ')';
			} elseif ( 'fixed' === $mode ) {
				$price_tag = ' (+' . wc_price( $amount ) . ')';
			}
		}

		$conditions_attr = '';
		if ( ! empty( $field['conditions'] ) && is_array( $field['conditions'] ) ) {
			$conditions_attr = ' data-conditions="' . esc_attr( wp_json_encode( $field['conditions'] ) ) . '"';
		}

		echo '<div class="scpo-field-row scpo-field-type-' . esc_attr( $type ) . '" data-field-id="' . esc_attr( $field_id ) . '" data-pricing-mode="' . esc_attr( $mode ) . '" data-pricing-amount="' . esc_attr( $amount ) . '"' . $conditions_attr . '>';

		if ( 'checkbox' !== $type ) {
			echo '<label for="scpo_input_' . esc_attr( $field_id ) . '" class="scpo-field-label">';
			echo esc_html( $label );
			if ( $required ) {
				echo ' <span class="required" style="color: red;">*</span>';
			}
			echo $price_tag; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo '</label>';
		}

		if ( ! empty( $field['description'] ) ) {
			echo '<p class="scpo-field-description">' . esc_html( $field['description'] ) . '</p>';
		}

		switch ( $type ) {
			case 'text':
				$max = ! empty( $field['max_length'] ) ? ' maxlength="' . absint( $field['max_length'] ) . '"' : '';
				echo '<input type="text" id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" class="scpo-input scpo-input-text"' . $max . ( $required ? ' required' : '' ) . '>';
				break;

			case 'textarea':
				$max = ! empty( $field['max_length'] ) ? ' maxlength="' . absint( $field['max_length'] ) . '"' : '';
				echo '<textarea id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" class="scpo-input scpo-input-textarea" rows="3"' . $max . ( $required ? ' required' : '' ) . '></textarea>';
				break;

			case 'number':
				$min  = isset( $field['min'] ) ? ' min="' . esc_attr( $field['min'] ) . '"' : '';
				$max  = isset( $field['max'] ) ? ' max="' . esc_attr( $field['max'] ) . '"' : '';
				$step = isset( $field['step'] ) ? ' step="' . esc_attr( $field['step'] ) . '"' : ' step="any"';
				echo '<input type="number" id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" class="scpo-input scpo-input-number"' . $min . $max . $step . ( $required ? ' required' : '' ) . '>';
				break;

			case 'select':
				echo '<select id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" class="scpo-input scpo-input-select"' . ( $required ? ' required' : '' ) . '>';
				echo '<option value="">' . esc_html__( '— Choose an option —', 'simple-custom-product-options' ) . '</option>';
				if ( ! empty( $field['options'] ) && is_array( $field['options'] ) ) {
					foreach ( $field['options'] as $opt ) {
						$opt_price = isset( $opt['price'] ) ? (float) $opt['price'] : 0.0;
						$opt_tag   = $opt_price > 0 ? ' (+' . wc_price( $opt_price ) . ')' : '';
						echo '<option value="' . esc_attr( $opt['id'] ) . '" data-price="' . esc_attr( $opt_price ) . '">' . esc_html( $opt['label'] ) . $opt_tag . '</option>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					}
				}
				echo '</select>';
				break;

			case 'radio':
				if ( ! empty( $field['options'] ) && is_array( $field['options'] ) ) {
					$single_choice_group_attr = ( 'single' === ( isset( $section['selection_mode'] ) ? $section['selection_mode'] : 'multiple' ) )
						? ' data-scpo-single-choice-group="' . esc_attr( $section['id'] ) . '"'
						: '';
					echo '<div class="scpo-radio-group">';
					foreach ( $field['options'] as $opt ) {
						$opt_price = isset( $opt['price'] ) ? (float) $opt['price'] : 0.0;
						$opt_tag   = $opt_price > 0 ? ' (+' . wc_price( $opt_price ) . ')' : '';
						$radio_id  = 'scpo_radio_' . esc_attr( $field_id ) . '_' . esc_attr( $opt['id'] );
						echo '<label for="' . esc_attr( $radio_id ) . '" class="scpo-radio-label">';
						echo '<input type="radio" id="' . esc_attr( $radio_id ) . '" name="' . esc_attr( $input_name ) . '" value="' . esc_attr( $opt['id'] ) . '" data-price="' . esc_attr( $opt_price ) . '"' . $single_choice_group_attr . ( $required ? ' required' : '' ) . '> ';
						echo esc_html( $opt['label'] ) . $opt_tag; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						echo '</label><br>';
					}
					echo '</div>';
				}
				break;

			case 'checkbox':
				$checked_val   = isset( $field['checked_value'] ) ? $field['checked_value'] : 'yes';
				$unchecked_val = isset( $field['unchecked_value'] ) ? $field['unchecked_value'] : 'no';
				$check_price   = isset( $field['states'][ $checked_val ]['price_delta'] ) ? (float) $field['states'][ $checked_val ]['price_delta'] : $amount;
				$check_tag     = $check_price > 0 ? ' (+' . wc_price( $check_price ) . ')' : '';
				$legacy_single_group_attr = ( 'single' === ( isset( $section['selection_mode'] ) ? $section['selection_mode'] : 'multiple' ) )
					? ' data-scpo-single-choice-group="' . esc_attr( $section['id'] ) . '"'
					: '';

				echo '<label for="scpo_input_' . esc_attr( $field_id ) . '" class="scpo-checkbox-label">';
				echo '<input type="hidden" name="' . esc_attr( $input_name ) . '" value="' . esc_attr( $unchecked_val ) . '">';
				echo '<input type="checkbox" id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" value="' . esc_attr( $checked_val ) . '" data-price="' . esc_attr( $check_price ) . '"' . $legacy_single_group_attr . ( $required ? ' required' : '' ) . '> ';
				echo esc_html( $label ) . $check_tag; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				if ( $required ) {
					echo ' <span class="required" style="color: red;">*</span>';
				}
				echo '</label>';
				break;

			case 'date':
				echo '<input type="date" id="scpo_input_' . esc_attr( $field_id ) . '" name="' . esc_attr( $input_name ) . '" class="scpo-input scpo-input-date"' . ( $required ? ' required' : '' ) . '>';
				break;

			case 'multiselect':
				if ( ! empty( $field['options'] ) && is_array( $field['options'] ) ) {
					echo '<div class="scpo-multiselect-group" role="group" aria-label="' . esc_attr( $label ) . '">';
					foreach ( $field['options'] as $opt ) {
						$opt_id    = esc_attr( $opt['id'] );
						$opt_price = isset( $opt['price'] ) ? (float) $opt['price'] : 0.0;
						$opt_tag   = $opt_price > 0 ? ' (+' . wc_price( $opt_price ) . ')' : '';
						$ms_id     = 'scpo_ms_' . esc_attr( $field_id ) . '_' . $opt_id;

						echo '<label for="' . esc_attr( $ms_id ) . '" class="scpo-multiselect-label">';
						echo '<input type="checkbox" id="' . esc_attr( $ms_id ) . '" name="scpo_fields[' . esc_attr( $field_id ) . '][]" value="' . $opt_id . '" data-price="' . esc_attr( $opt_price ) . '" class="scpo-multiselect-input"> ';
						echo esc_html( $opt['label'] ) . $opt_tag; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						echo '</label><br>';
					}
					echo '</div>';
				}
				break;

			case 'imageselect':
				if ( ! empty( $field['options'] ) && is_array( $field['options'] ) ) {
					$sec_mode        = isset( $section['selection_mode'] ) ? $section['selection_mode'] : 'single';
					$is_multi        = ( 'multiple' === $sec_mode );
					$role_attr       = $is_multi ? 'group' : 'radiogroup';
					$input_type      = $is_multi ? 'checkbox' : 'radio';
					$input_name_attr = $is_multi ? 'scpo_fields[' . esc_attr( $field_id ) . '][]' : esc_attr( $input_name );
					$single_choice_group_attr = ( ! $is_multi )
						? ' data-scpo-single-choice-group="' . esc_attr( $section['id'] ) . '"'
						: '';

					echo '<div class="scpo-imageselect-grid" role="' . esc_attr( $role_attr ) . '" aria-label="' . esc_attr( $label ) . '">';
					foreach ( $field['options'] as $opt ) {
						$opt_id    = esc_attr( $opt['id'] );
						$opt_price = isset( $opt['price'] ) ? (float) $opt['price'] : 0.0;
						$opt_tag   = $opt_price > 0 ? ' (+' . wc_price( $opt_price ) . ')' : '';
						$card_id   = 'scpo_img_' . esc_attr( $field_id ) . '_' . $opt_id;

						$img_id  = isset( $opt['image_id'] ) ? absint( $opt['image_id'] ) : 0;
						$img_url = '';
						if ( $img_id > 0 && function_exists( 'wp_get_attachment_image_url' ) ) {
							$img_url = wp_get_attachment_image_url( $img_id, 'medium' );
						}
						if ( empty( $img_url ) && ! empty( $opt['image_url'] ) ) {
							$img_url = $opt['image_url'];
						}

						$alt_text = ! empty( $opt['alt'] ) ? $opt['alt'] : ( ! empty( $opt['label'] ) ? $opt['label'] : '' );

						echo '<label for="' . esc_attr( $card_id ) . '" class="scpo-image-choice-card" tabindex="0">';
						echo '<input type="' . esc_attr( $input_type ) . '" id="' . esc_attr( $card_id ) . '" name="' . esc_attr( $input_name_attr ) . '" value="' . $opt_id . '" data-price="' . esc_attr( $opt_price ) . '" class="scpo-imageselect-' . esc_attr( $input_type ) . '"' . $single_choice_group_attr . ( ( ! $is_multi && $required ) ? ' required' : '' ) . '>';
						echo '<div class="scpo-image-choice-preview">';
						if ( ! empty( $img_url ) ) {
							echo '<img src="' . esc_url( $img_url ) . '" alt="' . esc_attr( $alt_text ) . '" class="scpo-image-thumb">';
						} else {
							echo '<div class="scpo-image-placeholder">🖼️</div>';
						}
						echo '</div>';
						echo '<div class="scpo-image-choice-info">';
						echo '<span class="scpo-image-choice-label">' . esc_html( $opt['label'] ) . '</span>';
						if ( $opt_price > 0 ) {
							echo '<span class="scpo-image-choice-price">+' . wc_price( $opt_price ) . '</span>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
						}
						echo '</div>';
						echo '</label>';
					}
					echo '</div>';
				}
				break;
		}

		echo '</div>';
	}
}
