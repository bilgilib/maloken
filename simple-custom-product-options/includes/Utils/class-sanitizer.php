<?php
/**
 * Strict Schema and Input Sanitizer & Validator
 *
 * @package SimpleCustomProductOptions\Utils
 */

namespace SimpleCustomProductOptions\Utils;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Sanitizer {

	/**
	 * Supported field types in current release.
	 */
	const ALLOWED_FIELD_TYPES = array(
		'text',
		'textarea',
		'number',
		'select',
		'radio',
		'checkbox',
		'date',
		'multiselect',
		'imageselect',
	);

	/**
	 * Allowed pricing categories.
	 */
	const ALLOWED_PRICING_CATEGORIES = array(
		'none',
		'per_unit',
		'one_time_fee',
	);

	/**
	 * Allowed pricing calculation modes.
	 */
	const ALLOWED_PRICING_MODES = array(
		'none',
		'fixed',
		'per_character',
		'multiplied_by_value',
	);

	/**
	 * Strictly validate and sanitize an option set schema configuration before saving.
	 * Returns WP_Error on malformed JSON, missing root keys, invalid types, duplicate IDs, or invalid pricing modes.
	 * Never silently saves an empty or partially sanitized schema.
	 * Preserves all valid Phase 2 schema data, option states, labels, limits, and conditional objects.
	 *
	 * @param array|string $raw_config Raw JSON string or PHP array.
	 * @return array|WP_Error Sanitized configuration structure or WP_Error.
	 */
	public static function validate_and_sanitize_config( $raw_config ) {
		if ( is_string( $raw_config ) ) {
			$trimmed = trim( $raw_config );
			if ( empty( $trimmed ) ) {
				return new WP_Error( 'scpo_empty_schema', __( 'Schema configuration cannot be empty.', 'simple-custom-product-options' ) );
			}

			$decoded = json_decode( $trimmed, true );
			if ( is_null( $decoded ) && JSON_ERROR_NONE !== json_last_error() ) {
				/* translators: %s: JSON error message */
				return new WP_Error( 'scpo_malformed_json', sprintf( __( 'Malformed JSON syntax: %s', 'simple-custom-product-options' ), json_last_error_msg() ) );
			}
			$raw_config = $decoded;
		}

		if ( ! is_array( $raw_config ) ) {
			return new WP_Error( 'scpo_invalid_root', __( 'Schema configuration must be a valid JSON object.', 'simple-custom-product-options' ) );
		}

		// Required Root Keys: $schema_version, id, sections.
		if ( empty( $raw_config['id'] ) || ! is_string( $raw_config['id'] ) ) {
			return new WP_Error( 'scpo_missing_id', __( 'Option Set schema is missing a valid root "id" attribute.', 'simple-custom-product-options' ) );
		}

		if ( ! isset( $raw_config['sections'] ) || ! is_array( $raw_config['sections'] ) ) {
			return new WP_Error( 'scpo_missing_sections', __( 'Option Set schema must include a "sections" array.', 'simple-custom-product-options' ) );
		}

		$sanitized_id = sanitize_key( $raw_config['id'] );
		if ( empty( $sanitized_id ) ) {
			return new WP_Error( 'scpo_invalid_id', __( 'Option Set root "id" contains invalid characters.', 'simple-custom-product-options' ) );
		}

		$seen_ids = array( $sanitized_id => 'set' );

		$sanitized = array(
			'$schema_version' => isset( $raw_config['$schema_version'] ) ? sanitize_text_field( $raw_config['$schema_version'] ) : '1.0.0',
			'id'              => $sanitized_id,
			'title'           => isset( $raw_config['title'] ) ? sanitize_text_field( $raw_config['title'] ) : '',
			'sections'        => array(),
		);

		foreach ( $raw_config['sections'] as $sec_index => $section ) {
			if ( ! is_array( $section ) ) {
				return new WP_Error( 'scpo_invalid_section', sprintf( __( 'Section at index %d is not a valid object.', 'simple-custom-product-options' ), $sec_index ) );
			}

			if ( empty( $section['id'] ) ) {
				return new WP_Error( 'scpo_missing_sec_id', sprintf( __( 'Section at index %d is missing a required "id".', 'simple-custom-product-options' ), $sec_index ) );
			}

			$sec_id = sanitize_key( $section['id'] );
			if ( isset( $seen_ids[ $sec_id ] ) ) {
				/* translators: %s: Duplicate ID */
				return new WP_Error( 'scpo_duplicate_id', sprintf( __( 'Duplicate identifier found: "%s". All set, section, and field IDs must be unique.', 'simple-custom-product-options' ), $sec_id ) );
			}
			$seen_ids[ $sec_id ] = 'section';

			$sec_mode = 'multiple';
			if ( isset( $section['selection_mode'] ) ) {
				$raw_mode = sanitize_key( $section['selection_mode'] );
				if ( in_array( $raw_mode, array( 'single', 'single_choice' ), true ) ) {
					$sec_mode = 'single';
				} elseif ( in_array( $raw_mode, array( 'multiple', 'multiple_choices' ), true ) ) {
					$sec_mode = 'multiple';
				}
			}

			$sanitized_section = array(
				'id'             => $sec_id,
				'title'          => isset( $section['title'] ) ? sanitize_text_field( $section['title'] ) : '',
				'description'    => isset( $section['description'] ) ? sanitize_textarea_field( $section['description'] ) : '',
				'selection_mode' => $sec_mode,
				'order'          => isset( $section['order'] ) ? absint( $section['order'] ) : ( $sec_index + 1 ),
				'fields'         => array(),
			);

			if ( isset( $section['fields'] ) ) {
				if ( ! is_array( $section['fields'] ) ) {
					return new WP_Error( 'scpo_invalid_fields_array', sprintf( __( 'Section "%s" fields property must be an array.', 'simple-custom-product-options' ), $sec_id ) );
				}

				foreach ( $section['fields'] as $fld_index => $field ) {
					if ( ! is_array( $field ) ) {
						return new WP_Error( 'scpo_invalid_field', sprintf( __( 'Field at index %1$d in section "%2$s" is not a valid object.', 'simple-custom-product-options' ), $fld_index, $sec_id ) );
					}

					if ( empty( $field['id'] ) ) {
						return new WP_Error( 'scpo_missing_fld_id', sprintf( __( 'Field at index %1$d in section "%2$s" is missing an "id".', 'simple-custom-product-options' ), $fld_index, $sec_id ) );
					}

					$fld_id = sanitize_key( $field['id'] );
					if ( isset( $seen_ids[ $fld_id ] ) ) {
						/* translators: %s: Duplicate ID */
						return new WP_Error( 'scpo_duplicate_id', sprintf( __( 'Duplicate identifier found: "%s". All set, section, and field IDs must be unique.', 'simple-custom-product-options' ), $fld_id ) );
					}
					$seen_ids[ $fld_id ] = 'field';

					$raw_type   = isset( $field['type'] ) ? sanitize_key( $field['type'] ) : '';
					if ( ! in_array( $raw_type, self::ALLOWED_FIELD_TYPES, true ) ) {
						/* translators: 1: Field ID, 2: Field Type */
						return new WP_Error( 'scpo_invalid_field_type', sprintf( __( 'Field "%1$s" has unsupported field type "%2$s". Supported types: text, textarea, number, select, radio, checkbox, date.', 'simple-custom-product-options' ), $fld_id, $raw_type ) );
					}

					// Validate Pricing Mode.
					$pricing_cat  = isset( $field['pricing']['category'] ) ? sanitize_key( $field['pricing']['category'] ) : 'per_unit';
					$pricing_mode = isset( $field['pricing']['mode'] ) ? sanitize_key( $field['pricing']['mode'] ) : 'none';

					if ( ! in_array( $pricing_cat, self::ALLOWED_PRICING_CATEGORIES, true ) ) {
						/* translators: 1: Field ID, 2: Category */
						return new WP_Error( 'scpo_invalid_pricing_category', sprintf( __( 'Field "%1$s" has invalid pricing category "%2$s".', 'simple-custom-product-options' ), $fld_id, $pricing_cat ) );
					}

					if ( ! in_array( $pricing_mode, self::ALLOWED_PRICING_MODES, true ) ) {
						/* translators: 1: Field ID, 2: Mode */
						return new WP_Error( 'scpo_invalid_pricing_mode', sprintf( __( 'Field "%1$s" has invalid pricing mode "%2$s".', 'simple-custom-product-options' ), $fld_id, $pricing_mode ) );
					}

					$sanitized_field = array(
						'id'          => $fld_id,
						'type'        => $raw_type,
						'label'       => isset( $field['label'] ) ? sanitize_text_field( $field['label'] ) : '',
						'description' => isset( $field['description'] ) ? sanitize_textarea_field( $field['description'] ) : '',
						'required'    => ! empty( $field['required'] ),
						'css_class'   => isset( $field['css_class'] ) ? sanitize_html_class( $field['css_class'] ) : '',
						'width'       => isset( $field['width'] ) && in_array( $field['width'], array( '100', '50', '33', '25' ), true ) ? $field['width'] : '100',
						'pricing'     => array(
							'category' => $pricing_cat,
							'mode'     => $pricing_mode,
							'amount'   => isset( $field['pricing']['amount'] ) ? (float) $field['pricing']['amount'] : 0.0,
						),
					);

					// Preserve text boundaries.
					if ( isset( $field['max_length'] ) && '' !== $field['max_length'] ) {
						$sanitized_field['max_length'] = absint( $field['max_length'] );
					}

					// Preserve number boundaries.
					if ( 'number' === $raw_type ) {
						if ( isset( $field['min'] ) && '' !== $field['min'] ) {
							$sanitized_field['min'] = (float) $field['min'];
						}
						if ( isset( $field['max'] ) && '' !== $field['max'] ) {
							$sanitized_field['max'] = (float) $field['max'];
						}
						if ( isset( $field['step'] ) && '' !== $field['step'] ) {
							$sanitized_field['step'] = (float) $field['step'];
						}
					}

					// Preserve Checkbox States & yes/no normalization.
					if ( 'checkbox' === $raw_type ) {
						$sanitized_field['checked_value']   = isset( $field['checked_value'] ) ? sanitize_text_field( $field['checked_value'] ) : 'yes';
						$sanitized_field['unchecked_value'] = isset( $field['unchecked_value'] ) ? sanitize_text_field( $field['unchecked_value'] ) : 'no';
						$sanitized_field['default_state']   = ! empty( $field['default_state'] );

						if ( isset( $field['states'] ) && is_array( $field['states'] ) ) {
							$sanitized_field['states'] = array();
							foreach ( $field['states'] as $st_key => $st_data ) {
								$clean_key = sanitize_text_field( $st_key );
								$sanitized_field['states'][ $clean_key ] = array(
									'label'       => isset( $st_data['label'] ) ? sanitize_text_field( $st_data['label'] ) : '',
									'price_delta' => isset( $st_data['price_delta'] ) ? (float) $st_data['price_delta'] : 0.0,
								);
							}
						}
					}

					// Preserve Select / Multi Select / Radio Options.
					if ( in_array( $raw_type, array( 'select', 'multiselect', 'radio' ), true ) ) {
						if ( empty( $field['options'] ) || ! is_array( $field['options'] ) ) {
							return new WP_Error( 'scpo_missing_options', sprintf( __( 'Field "%1$s" of type %2$s must define an options array with at least one choice.', 'simple-custom-product-options' ), $fld_id, $raw_type ) );
						}

						$sanitized_field['options'] = array();
						$seen_opt_ids = array();

						foreach ( $field['options'] as $option ) {
							if ( ! is_array( $option ) || empty( $option['id'] ) ) {
								return new WP_Error( 'scpo_invalid_option', sprintf( __( 'Field "%s" contains an option with missing or invalid "id".', 'simple-custom-product-options' ), $fld_id ) );
							}
							$opt_id = sanitize_key( $option['id'] );
							if ( isset( $seen_opt_ids[ $opt_id ] ) ) {
								return new WP_Error( 'scpo_duplicate_opt_id', sprintf( __( 'Field "%1$s" contains duplicate option id "%2$s".', 'simple-custom-product-options' ), $fld_id, $opt_id ) );
							}
							$seen_opt_ids[ $opt_id ] = true;

							$sanitized_field['options'][] = array(
								'id'    => $opt_id,
								'label' => isset( $option['label'] ) ? sanitize_text_field( $option['label'] ) : '',
								'price' => isset( $option['price'] ) ? (float) $option['price'] : 0.0,
							);
						}
					}

					// Preserve Image Select Options (Visual Choices).
					if ( 'imageselect' === $raw_type ) {
						if ( empty( $field['options'] ) || ! is_array( $field['options'] ) ) {
							return new WP_Error( 'scpo_missing_options', sprintf( __( 'Field "%s" of type imageselect must define an options array with at least one choice.', 'simple-custom-product-options' ), $fld_id ) );
						}

						$sanitized_field['options'] = array();
						$seen_opt_ids = array();

						foreach ( $field['options'] as $option ) {
							if ( ! is_array( $option ) || empty( $option['id'] ) ) {
								return new WP_Error( 'scpo_invalid_option', sprintf( __( 'Field "%s" contains an option with missing or invalid "id".', 'simple-custom-product-options' ), $fld_id ) );
							}
							$opt_id = sanitize_key( $option['id'] );
							if ( isset( $seen_opt_ids[ $opt_id ] ) ) {
								return new WP_Error( 'scpo_duplicate_opt_id', sprintf( __( 'Field "%1$s" contains duplicate option id "%2$s".', 'simple-custom-product-options' ), $fld_id, $opt_id ) );
							}
							$seen_opt_ids[ $opt_id ] = true;

							$img_id  = isset( $option['image_id'] ) ? absint( $option['image_id'] ) : 0;
							$img_url = isset( $option['image_url'] ) ? esc_url_raw( $option['image_url'] ) : '';

							// If valid attachment ID exists, derive URL safely
							if ( $img_id > 0 && function_exists( 'wp_get_attachment_image_url' ) ) {
								$derived_url = wp_get_attachment_image_url( $img_id, 'full' );
								if ( $derived_url ) {
									$img_url = $derived_url;
								}
							}

							$sanitized_field['options'][] = array(
								'id'        => $opt_id,
								'label'     => isset( $option['label'] ) ? sanitize_text_field( $option['label'] ) : '',
								'image_id'  => $img_id,
								'image_url' => $img_url,
								'alt'       => isset( $option['alt'] ) ? sanitize_text_field( $option['alt'] ) : '',
								'price'     => isset( $option['price'] ) ? (float) $option['price'] : 0.0,
							);
						}
					}

					// Validate and sanitize Phase 3 conditional rules.
					if ( isset( $field['conditions'] ) && is_array( $field['conditions'] ) ) {
						$raw_conds = $field['conditions'];
						$action    = isset( $raw_conds['action'] ) && 'HIDE' === strtoupper( $raw_conds['action'] ) ? 'HIDE' : 'SHOW';
						$operator  = isset( $raw_conds['operator'] ) && 'ANY' === strtoupper( $raw_conds['operator'] ) ? 'ANY' : 'ALL';
						$clean_rules = array();

						if ( ! empty( $raw_conds['rules'] ) && is_array( $raw_conds['rules'] ) ) {
							foreach ( $raw_conds['rules'] as $rule ) {
								if ( ! is_array( $rule ) || empty( $rule['field_id'] ) ) {
									continue;
								}
								$target_fld = sanitize_key( $rule['field_id'] );
								$rule_op    = isset( $rule['operator'] ) ? sanitize_key( $rule['operator'] ) : 'equals';
								$rule_val   = isset( $rule['value'] ) ? sanitize_text_field( $rule['value'] ) : '';

								$clean_rules[] = array(
									'field_id' => $target_fld,
									'operator' => $rule_op,
									'value'    => $rule_val,
								);
							}
						}

						if ( ! empty( $clean_rules ) ) {
							$sanitized_field['conditions'] = array(
								'action'   => $action,
								'operator' => $operator,
								'rules'    => $clean_rules,
							);
						}
					}

					$sanitized_section['fields'][] = $sanitized_field;
				}
			}

			$sanitized['sections'][] = $sanitized_section;
		}

		return $sanitized;
	}

	/**
	 * Strictly validate and sanitize assignment data.
	 *
	 * Rejection rules:
	 * - Any non-numeric token is rejected with WP_Error.
	 * - Any non-positive (zero or negative) ID is rejected with WP_Error.
	 * - If a product validation resolver is available, any missing, non-product, or non-published post is rejected with WP_Error.
	 * - Duplicate IDs are normalized without error.
	 * - If no product IDs are specified (empty string or empty array), returns an empty product_ids array (the controller warns if status is publish).
	 *
	 * @param array    $raw_assignment Raw assignment input.
	 * @param callable|null $product_validator Optional deterministic validator callback for test seams / WooCommerce verification.
	 * @return array|WP_Error Sanitized assignment structure or WP_Error.
	 */
	public static function validate_and_sanitize_assignment( $raw_assignment, $product_validator = null ) {
		if ( ! is_array( $raw_assignment ) ) {
			$raw_assignment = array();
		}

		$type = isset( $raw_assignment['type'] ) ? sanitize_key( $raw_assignment['type'] ) : 'specific_products';
		if ( ! in_array( $type, array( 'specific_products', 'all_products', 'categories' ), true ) ) {
			$type = 'specific_products';
		}

		$raw_ids_input = isset( $raw_assignment['product_ids'] ) ? $raw_assignment['product_ids'] : array();
		$tokens = array();

		if ( is_string( $raw_ids_input ) ) {
			$trimmed = trim( $raw_ids_input );
			if ( '' !== $trimmed ) {
				$tokens = array_map( 'trim', explode( ',', $trimmed ) );
			}
		} elseif ( is_array( $raw_ids_input ) ) {
			$tokens = $raw_ids_input;
		}

		$normalized_ids = array();
		$seen = array();

		foreach ( $tokens as $token ) {
			$token_str = trim( (string) $token );
			if ( '' === $token_str ) {
				continue; // Skip empty commas e.g. "101, , 102"
			}

			// Must be purely digits. Non-numeric tokens (e.g. "abc", "101a", "xyz") must be rejected.
			if ( ! ctype_digit( $token_str ) ) {
				/* translators: %s: Invalid token */
				return new WP_Error(
					'scpo_invalid_product_token',
					sprintf( __( 'Invalid product ID "%s". All assigned product IDs must be positive integers.', 'simple-custom-product-options' ), sanitize_text_field( $token_str ) )
				);
			}

			$id_val = (int) $token_str;
			if ( $id_val <= 0 ) {
				return new WP_Error(
					'scpo_invalid_product_id',
					sprintf( __( 'Invalid product ID %d. Product IDs must be greater than zero.', 'simple-custom-product-options' ), $id_val )
				);
			}

			// Validate existence and status.
			if ( is_callable( $product_validator ) ) {
				$validation_result = call_user_func( $product_validator, $id_val );
				if ( is_wp_error( $validation_result ) ) {
					return $validation_result;
				}
				if ( true !== $validation_result ) {
					return new WP_Error(
						'scpo_product_not_found',
						sprintf( __( 'Product ID %d does not exist or is not a published WooCommerce product.', 'simple-custom-product-options' ), $id_val )
					);
				}
			} elseif ( function_exists( 'wc_get_product' ) ) {
				$prod = wc_get_product( $id_val );
				if ( ! $prod || ! is_a( $prod, 'WC_Product' ) ) {
					return new WP_Error(
						'scpo_product_not_found',
						sprintf( __( 'Product ID %d does not exist or is not a WooCommerce product.', 'simple-custom-product-options' ), $id_val )
					);
				}
				if ( 'publish' !== $prod->get_status() ) {
					return new WP_Error(
						'scpo_product_not_published',
						sprintf( __( 'Product ID %d is not published (current status: %s).', 'simple-custom-product-options' ), $id_val, $prod->get_status() )
					);
				}
			} elseif ( function_exists( 'get_post' ) ) {
				$post = get_post( $id_val );
				if ( ! $post || 'product' !== $post->post_type ) {
					return new WP_Error(
						'scpo_product_not_found',
						sprintf( __( 'Product ID %d does not exist or is not a product.', 'simple-custom-product-options' ), $id_val )
					);
				}
				if ( 'publish' !== $post->post_status ) {
					return new WP_Error(
						'scpo_product_not_published',
						sprintf( __( 'Product ID %d is not published (current status: %s).', 'simple-custom-product-options' ), $id_val, $post->post_status() )
					);
				}
			}

			// Duplicate normalization: only append if not already seen.
			if ( ! isset( $seen[ $id_val ] ) ) {
				$seen[ $id_val ] = true;
				$normalized_ids[] = $id_val;
			}
		}

		return array(
			'type'        => $type,
			'product_ids' => $normalized_ids,
		);
	}
}
