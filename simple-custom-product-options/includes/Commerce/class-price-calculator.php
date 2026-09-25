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
	 * Supported Phase 2 & Phase 4 field types.
	 */
	const SUPPORTED_TYPES = array(
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

			$sec_mode  = isset( $section['selection_mode'] ) ? $section['selection_mode'] : 'multiple';
			$sec_title = ! empty( $section['title'] ) ? $section['title'] : __( 'this section', 'simple-custom-product-options' );

			if ( 'single' === $sec_mode ) {
				// Count active fields with non-empty selected values in this section
				$active_selected_fields = 0;
				foreach ( $section['fields'] as $chk_fld ) {
					if ( ! Condition_Engine::is_field_active( $chk_fld, $submitted_fields ) ) {
						continue;
					}
					$chk_id  = $chk_fld['id'];
					$chk_val = isset( $submitted_fields[ $chk_id ] ) ? $submitted_fields[ $chk_id ] : null;
					$is_field_selected = false;

					if ( is_array( $chk_val ) ) {
						$filt = array_filter( $chk_val, function( $v ) { return '' !== trim( (string) $v ); } );
						if ( ! empty( $filt ) ) {
							$is_field_selected = true;
						}
					} elseif ( ! is_null( $chk_val ) && '' !== trim( (string) $chk_val ) ) {
						$chk_type = isset( $chk_fld['type'] ) ? $chk_fld['type'] : 'text';
						if ( 'checkbox' === $chk_type ) {
							$unchecked_val = isset( $chk_fld['unchecked_value'] ) ? $chk_fld['unchecked_value'] : 'no';
							if ( (string) $chk_val !== (string) $unchecked_val ) {
								$is_field_selected = true;
							}
						} else {
							$is_field_selected = true;
						}
					}

					if ( $is_field_selected ) {
						$active_selected_fields++;
					}
				}

				if ( $active_selected_fields > 1 ) {
					return new WP_Error(
						'scpo_single_choice_violation',
						sprintf( __( 'Please select only one option in "%s".', 'simple-custom-product-options' ), $sec_title )
					);
				}
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
				if ( is_null( $raw_val ) || '' === $raw_val ) {
					$is_empty = true;
				} elseif ( is_array( $raw_val ) ) {
					$filtered_arr = array_filter( $raw_val, function( $v ) {
						return '' !== trim( (string) $v );
					} );
					if ( empty( $filtered_arr ) ) {
						$is_empty = true;
					}
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
						if ( 0.0 === $field_addon && 'fixed' === $pricing_mode && $pricing_amount > 0 ) {
							$field_addon = $pricing_amount;
						}
						break;

					case 'multiselect':
						$raw_choice_ids = array();
						if ( is_array( $raw_val ) ) {
							$raw_choice_ids = $raw_val;
						} elseif ( is_string( $raw_val ) ) {
							$trimmed = trim( $raw_val );
							if ( '' !== $trimmed ) {
								$raw_choice_ids = array_map( 'trim', explode( ',', $trimmed ) );
							}
						}

						$allowed_options = isset( $field['options'] ) && is_array( $field['options'] ) ? $field['options'] : array();
						$allowed_map     = array();
						foreach ( $allowed_options as $opt ) {
							if ( isset( $opt['id'] ) ) {
								$allowed_map[ $opt['id'] ] = $opt;
							}
						}

						$valid_choice_ids  = array();
						$display_labels    = array();
						$choice_snapshots  = array();
						$multi_sum         = 0.0;
						$seen_selected_opt = array();

						foreach ( $raw_choice_ids as $c_id ) {
							$clean_c_id = sanitize_key( $c_id );
							if ( '' === $clean_c_id ) {
								continue;
							}

							if ( ! isset( $allowed_map[ $clean_c_id ] ) ) {
								/* translators: %s: Field label */
								return new WP_Error(
									'scpo_invalid_option_choice',
									sprintf( __( 'Selected option for "%s" is invalid.', 'simple-custom-product-options' ), $label )
								);
							}

							// Prevent duplicate choice ID summation: sum each selected adjustment exactly once
							if ( isset( $seen_selected_opt[ $clean_c_id ] ) ) {
								continue;
							}
							$seen_selected_opt[ $clean_c_id ] = true;

							$opt_data     = $allowed_map[ $clean_c_id ];
							$choice_price = isset( $opt_data['price'] ) ? (float) $opt_data['price'] : 0.0;
							$choice_label = isset( $opt_data['label'] ) ? $opt_data['label'] : $clean_c_id;

							$valid_choice_ids[] = $clean_c_id;
							$display_labels[]   = $choice_label;
							$choice_snapshots[] = array(
								'id'    => $clean_c_id,
								'label' => $choice_label,
								'price' => $choice_price,
							);
							$multi_sum += $choice_price;
						}

						if ( $required && empty( $valid_choice_ids ) ) {
							/* translators: %s: Field label */
							return new WP_Error(
								'scpo_missing_required',
								sprintf( __( '"%s" is a required option.', 'simple-custom-product-options' ), $label )
							);
						}

						if ( 'single' === $sec_mode && count( $valid_choice_ids ) > 1 ) {
							return new WP_Error(
								'scpo_single_choice_violation',
								sprintf( __( 'Please select only one option in "%s".', 'simple-custom-product-options' ), $sec_title )
							);
						}

						$sanitized_value = $valid_choice_ids;
						$display_value   = implode( ', ', $display_labels );
						$field_addon     = $multi_sum;
						break;

					case 'imageselect':
						$allowed_options = isset( $field['options'] ) && is_array( $field['options'] ) ? $field['options'] : array();
						$allowed_map     = array();
						foreach ( $allowed_options as $opt ) {
							if ( isset( $opt['id'] ) ) {
								$allowed_map[ $opt['id'] ] = $opt;
							}
						}

						// Handle both array submission (multi-choice) and scalar submission
						$raw_image_choices = array();
						if ( is_array( $raw_val ) ) {
							$raw_image_choices = array_values( array_filter( array_map( 'sanitize_key', $raw_val ) ) );
						} elseif ( is_string( $raw_val ) && '' !== trim( $raw_val ) ) {
							$raw_image_choices = array( sanitize_key( $raw_val ) );
						}

						if ( 'single' === $sec_mode && count( $raw_image_choices ) > 1 ) {
							return new WP_Error(
								'scpo_single_choice_violation',
								sprintf( __( 'Please select only one option in "%s".', 'simple-custom-product-options' ), $sec_title )
							);
						}

						if ( empty( $raw_image_choices ) ) {
							if ( $required ) {
								return new WP_Error(
									'scpo_missing_required',
									sprintf( __( '"%s" is a required option.', 'simple-custom-product-options' ), $label )
								);
							}
							break;
						}

						if ( 'single' === $sec_mode || count( $raw_image_choices ) === 1 ) {
							$single_id = $raw_image_choices[0];
							if ( ! isset( $allowed_map[ $single_id ] ) ) {
								return new WP_Error(
									'scpo_invalid_option_choice',
									sprintf( __( 'Selected option for "%s" is invalid.', 'simple-custom-product-options' ), $label )
								);
							}
							$matched_option  = $allowed_map[ $single_id ];
							$sanitized_value = $single_id;
							$display_value   = isset( $matched_option['label'] ) ? $matched_option['label'] : $single_id;
							$field_addon     = isset( $matched_option['price'] ) ? (float) $matched_option['price'] : 0.0;
							if ( 0.0 === $field_addon && 'fixed' === $pricing_mode && $pricing_amount > 0 ) {
								$field_addon = $pricing_amount;
							}
						} else {
							// Multiple image choices selected
							$valid_choices     = array();
							$display_labels    = array();
							$img_choice_snaps  = array();
							$img_sum           = 0.0;
							$seen_opts         = array();

							foreach ( $raw_image_choices as $c_id ) {
								if ( ! isset( $allowed_map[ $c_id ] ) ) {
									return new WP_Error(
										'scpo_invalid_option_choice',
										sprintf( __( 'Selected option for "%s" is invalid.', 'simple-custom-product-options' ), $label )
									);
								}
								if ( isset( $seen_opts[ $c_id ] ) ) {
									continue;
								}
								$seen_opts[ $c_id ] = true;

								$opt_data     = $allowed_map[ $c_id ];
								$choice_price = isset( $opt_data['price'] ) ? (float) $opt_data['price'] : 0.0;
								$choice_label = isset( $opt_data['label'] ) ? $opt_data['label'] : $c_id;

								$valid_choices[]    = $c_id;
								$display_labels[]   = $choice_label;
								$img_choice_snaps[] = array(
									'id'        => $c_id,
									'label'     => $choice_label,
									'price'     => $choice_price,
									'image_id'  => isset( $opt_data['image_id'] ) ? absint( $opt_data['image_id'] ) : 0,
									'image_url' => isset( $opt_data['image_url'] ) ? $opt_data['image_url'] : '',
								);
								$img_sum += $choice_price;
							}

							$sanitized_value = $valid_choices;
							$display_value   = implode( ', ', $display_labels );
							$field_addon     = $img_sum;
							$matched_option  = ! empty( $valid_choices ) ? $allowed_map[ $valid_choices[0] ] : null;
						}
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

				$parsed_option_item = array(
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

				if ( 'multiselect' === $field_type ) {
					$parsed_option_item['choices'] = isset( $choice_snapshots ) ? $choice_snapshots : array();
				} elseif ( 'imageselect' === $field_type ) {
					if ( isset( $img_choice_snaps ) && ! empty( $img_choice_snaps ) ) {
						$parsed_option_item['choices'] = $img_choice_snaps;
					}
					if ( isset( $matched_option ) ) {
						$parsed_option_item['image_id']  = isset( $matched_option['image_id'] ) ? absint( $matched_option['image_id'] ) : 0;
						$parsed_option_item['image_url'] = isset( $matched_option['image_url'] ) ? esc_url_raw( $matched_option['image_url'] ) : '';
						$parsed_option_item['alt']       = isset( $matched_option['alt'] ) ? sanitize_text_field( $matched_option['alt'] ) : '';
					}
				}

				$parsed_options[] = $parsed_option_item;
			}
		}

		return array(
			'options'        => $parsed_options,
			'one_time_fees'  => $one_time_fees,
			'unit_addon_sum' => (float) $unit_addon_sum,
		);
	}
}
