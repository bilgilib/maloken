<?php
/**
 * Pure Server-Side Price Calculation & Validation Engine
 *
 * @package SimpleCustomProductOptions\Commerce
 */

namespace SimpleCustomProductOptions\Commerce;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Price_Calculator {

	/**
	 * Supported Phase 2 field types.
	 */
	const SUPPORTED_TYPES = array(
		'text',
		'textarea',
		'number',
		'select',
		'radio',
		'checkbox',
		'date',
	);

	/**
	 * Validate submitted field inputs against an option set schema configuration.
	 *
	 * @param array $submitted_fields Raw associative array of submitted field inputs [ field_id => value ].
	 * @param array $schema_config    Sanitized option set configuration document.
	 * @return array|WP_Error Array of sanitized, validated option results or WP_Error on validation failure.
	 */
	public static function validate_and_parse_submission( $submitted_fields, $schema_config ) {
		if ( ! is_array( $submitted_fields ) ) {
			$submitted_fields = array();
		}

		$parsed_options = array();
		$one_time_fees  = array();
		$unit_addon_sum = 0.0;

		if ( empty( $schema_config['sections'] ) || ! is_array( $schema_config['sections'] ) ) {
			return array(
				'options'        => array(),
				'one_time_fees'  => array(),
				'unit_addon_sum' => 0.0,
			);
		}

		foreach ( $schema_config['sections'] as $section ) {
			if ( empty( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
				continue;
			}

			foreach ( $section['fields'] as $field ) {
				// Server-side conditional evaluation: inactive fields are ignored,
				// their values do not contribute to price/fees, and inactive required fields do not block submission.
				if ( ! Condition_Engine::is_field_active( $field, $submitted_fields ) ) {
					continue;
				}

				$field_id   = $field['id'];
				$field_type = isset( $field['type'] ) ? $field['type'] : 'text';
				$label      = isset( $field['label'] ) ? $field['label'] : $field_id;
				$required   = ! empty( $field['required'] );
				$raw_val    = isset( $submitted_fields[ $field_id ] ) ? $submitted_fields[ $field_id ] : null;

				// 1. Missing required field validation.
				$is_empty = false;
				if ( is_null( $raw_val ) || '' === $raw_val || ( is_array( $raw_val ) && empty( $raw_val ) ) ) {
					$is_empty = true;
				} elseif ( 'checkbox' === $field_type ) {
					// For checkbox, missing or unchecked_value is considered empty if required.
					$unchecked_val = isset( $field['unchecked_value'] ) ? $field['unchecked_value'] : 'no';
					if ( $raw_val === $unchecked_val ) {
						$is_empty = true;
					}
				}

				if ( $required && $is_empty ) {
					/* translators: %s: Field label */
					return new WP_Error(
						'scpo_missing_required',
						sprintf( __( '"%s" is a required option.', 'simple-custom-product-options' ), $label )
					);
				}

				// If empty and not required, skip price calculations.
				if ( $is_empty ) {
					continue;
				}

				// 2. Type-specific validation and boundary checking.
				$sanitized_value = '';
				$display_value   = '';
				$field_addon     = 0.0;
				$is_one_time     = false;

				$pricing_category = isset( $field['pricing']['category'] ) ? $field['pricing']['category'] : 'per_unit';
				$pricing_mode     = isset( $field['pricing']['mode'] ) ? $field['pricing']['mode'] : 'none';
				$pricing_amount   = isset( $field['pricing']['amount'] ) ? (float) $field['pricing']['amount'] : 0.0;

				switch ( $field_type ) {
					case 'text':
					case 'textarea':
						$sanitized_value = 'textarea' === $field_type ? sanitize_textarea_field( $raw_val ) : sanitize_text_field( $raw_val );
						$display_value   = $sanitized_value;

						// Boundary checks: max length.
						if ( ! empty( $field['max_length'] ) && mb_strlen( $sanitized_value ) > absint( $field['max_length'] ) ) {
							/* translators: 1: Field label, 2: Max length */
							return new WP_Error(
								'scpo_max_length_exceeded',
								sprintf( __( '"%1$s" exceeds the maximum character limit of %2$d.', 'simple-custom-product-options' ), $label, absint( $field['max_length'] ) )
							);
						}

						// Pricing: fixed or per_character.
						if ( 'per_character' === $pricing_mode ) {
							$char_count  = mb_strlen( $sanitized_value );
							$field_addon = $pricing_amount * $char_count;
						} elseif ( 'fixed' === $pricing_mode ) {
							$field_addon = $pricing_amount;
						}
						break;

					case 'number':
						if ( ! is_numeric( $raw_val ) ) {
							/* translators: %s: Field label */
							return new WP_Error(
								'scpo_invalid_number',
								sprintf( __( '"%s" must be a valid number.', 'simple-custom-product-options' ), $label )
							);
						}
						$num_val         = (float) $raw_val;
						$sanitized_value = (string) $num_val;
						$display_value   = (string) $num_val;

						// Boundaries: min and max.
						if ( isset( $field['min'] ) && '' !== $field['min'] && $num_val < (float) $field['min'] ) {
							/* translators: 1: Field label, 2: Min value */
							return new WP_Error(
								'scpo_min_number_exceeded',
								sprintf( __( '"%1$s" cannot be less than %2$s.', 'simple-custom-product-options' ), $label, $field['min'] )
							);
						}
						if ( isset( $field['max'] ) && '' !== $field['max'] && $num_val > (float) $field['max'] ) {
							/* translators: 1: Field label, 2: Max value */
							return new WP_Error(
								'scpo_max_number_exceeded',
								sprintf( __( '"%1$s" cannot be greater than %2$s.', 'simple-custom-product-options' ), $label, $field['max'] )
							);
						}

						// Pricing: fixed or multiplied_by_value.
						if ( 'multiplied_by_value' === $pricing_mode ) {
							$field_addon = $pricing_amount * $num_val;
						} elseif ( 'fixed' === $pricing_mode ) {
							$field_addon = $pricing_amount;
						}
						break;

					case 'select':
					case 'radio':
						$sanitized_value = sanitize_text_field( $raw_val );
						$allowed_options = isset( $field['options'] ) && is_array( $field['options'] ) ? $field['options'] : array();
						$matched_option  = null;

						foreach ( $allowed_options as $opt ) {
							if ( $opt['id'] === $sanitized_value ) {
								$matched_option = $opt;
								break;
							}
						}

						if ( ! $matched_option ) {
							/* translators: %s: Field label */
							return new WP_Error(
								'scpo_invalid_option_choice',
								sprintf( __( 'Selected option for "%s" is invalid.', 'simple-custom-product-options' ), $label )
							);
						}

						$display_value = isset( $matched_option['label'] ) ? $matched_option['label'] : $sanitized_value;
						$field_addon   = isset( $matched_option['price'] ) ? (float) $matched_option['price'] : 0.0;
						break;

					case 'checkbox':
						$checked_val   = isset( $field['checked_value'] ) ? $field['checked_value'] : 'yes';
						$unchecked_val = isset( $field['unchecked_value'] ) ? $field['unchecked_value'] : 'no';

						if ( $raw_val === $checked_val ) {
							$sanitized_value = $checked_val;
							$display_value   = __( 'Yes', 'simple-custom-product-options' );
							if ( isset( $field['states'][ $checked_val ]['label'] ) ) {
								$display_value = $field['states'][ $checked_val ]['label'];
							}

							if ( isset( $field['states'][ $checked_val ]['price_delta'] ) ) {
								$field_addon = (float) $field['states'][ $checked_val ]['price_delta'];
							} elseif ( 'fixed' === $pricing_mode ) {
								$field_addon = $pricing_amount;
							}
						} else {
							$sanitized_value = $unchecked_val;
							$display_value   = __( 'No', 'simple-custom-product-options' );
							$field_addon     = 0.0;
						}
						break;

					case 'date':
						$sanitized_value = sanitize_text_field( $raw_val );
						// Verify date format YYYY-MM-DD.
						if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $sanitized_value ) ) {
							/* translators: %s: Field label */
							return new WP_Error(
								'scpo_invalid_date_format',
								sprintf( __( '"%s" must be a valid date in YYYY-MM-DD format.', 'simple-custom-product-options' ), $label )
							);
						}
						$display_value = $sanitized_value;
						if ( 'fixed' === $pricing_mode ) {
							$field_addon = $pricing_amount;
						}
						break;
				}

				// Check if this option is configured as a one-time fee.
				if ( 'one_time_fee' === $pricing_category ) {
					$is_one_time = true;
					if ( $field_addon > 0 ) {
						$one_time_fees[] = array(
							'field_id'  => $field_id,
							'label'     => $label,
							'amount'    => $field_addon,
							'taxable'   => false,
							'tax_class' => '',
						);
					}
				} else {
					$unit_addon_sum += (float) $field_addon;
				}

				$parsed_options[] = array(
					'field_id'         => $field_id,
					'type'             => $field_type,
					'label'            => $label,
					'value'            => $sanitized_value,
					'display_value'    => $display_value,
					'pricing_category' => $pricing_category,
					'pricing_mode'     => $pricing_mode,
					'price_adjustment' => (float) $field_addon,
					'is_one_time_fee'  => $is_one_time,
				);
			}
		}

		return array(
			'options'        => $parsed_options,
			'one_time_fees'  => $one_time_fees,
			'unit_addon_sum' => (float) $unit_addon_sum,
		);
	}
}
