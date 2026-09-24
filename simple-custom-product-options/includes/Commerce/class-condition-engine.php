<?php
/**
 * Condition Evaluation Engine (Pure Logic)
 *
 * @package SimpleCustomProductOptions\Commerce
 */

namespace SimpleCustomProductOptions\Commerce;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Condition_Engine {

	/**
	 * Supported operators in Phase 3.
	 */
	const SUPPORTED_OPERATORS = array(
		'equals',
		'not_equals',
		'contains',
		'does_not_contain',
		'greater_than',
		'less_than',
		'is_empty',
		'is_not_empty',
	);

	/**
	 * Evaluate whether a field should be visible and active based on submitted values and its conditional rules.
	 *
	 * Rules structure:
	 * {
	 *   "action": "SHOW" | "HIDE",        // Defaults to SHOW
	 *   "operator": "ALL" | "ANY",        // Defaults to ALL
	 *   "rules": [
	 *     { "field_id": "fld_wrap", "operator": "equals", "value": "yes" }
	 *   ]
	 * }
	 *
	 * @param array $field            Field configuration.
	 * @param array $submitted_fields Current submitted/raw inputs [ field_id => value ].
	 * @return bool True if active/visible, false if inactive/hidden.
	 */
	public static function is_field_active( $field, $submitted_fields ) {
		if ( empty( $field['conditions'] ) || ! is_array( $field['conditions'] ) ) {
			return true; // No conditions => always active.
		}

		$conditions = $field['conditions'];
		if ( empty( $conditions['rules'] ) || ! is_array( $conditions['rules'] ) ) {
			return true; // Empty rule group => active.
		}

		$action    = isset( $conditions['action'] ) && 'HIDE' === strtoupper( $conditions['action'] ) ? 'HIDE' : 'SHOW';
		$group_op  = isset( $conditions['operator'] ) && 'ANY' === strtoupper( $conditions['operator'] ) ? 'ANY' : 'ALL';
		$rule_list = $conditions['rules'];

		$matches = array();

		foreach ( $rule_list as $rule ) {
			if ( empty( $rule['field_id'] ) ) {
				continue;
			}

			$target_fld_id = $rule['field_id'];
			$operator      = isset( $rule['operator'] ) ? $rule['operator'] : 'equals';
			$expected_val  = isset( $rule['value'] ) ? (string) $rule['value'] : '';

			$actual_raw = isset( $submitted_fields[ $target_fld_id ] ) ? $submitted_fields[ $target_fld_id ] : null;
			$actual_val = is_null( $actual_raw ) ? '' : ( is_array( $actual_raw ) ? implode( ',', $actual_raw ) : (string) $actual_raw );

			$matches[] = self::evaluate_rule( $actual_val, $operator, $expected_val );
		}

		if ( empty( $matches ) ) {
			return true;
		}

		$group_satisfied = false;
		if ( 'ANY' === $group_op ) {
			$group_satisfied = in_array( true, $matches, true );
		} else { // 'ALL'
			$group_satisfied = ! in_array( false, $matches, true );
		}

		if ( 'SHOW' === $action ) {
			return $group_satisfied;
		} else { // 'HIDE'
			return ! $group_satisfied;
		}
	}

	/**
	 * Evaluate a single operator comparison.
	 *
	 * @param string $actual_val   Actual value from user input.
	 * @param string $operator     Comparison operator.
	 * @param string $expected_val Expected value from rule.
	 * @return bool
	 */
	public static function evaluate_rule( $actual_val, $operator, $expected_val ) {
		$actual_val_trim   = trim( $actual_val );
		$expected_val_trim = trim( $expected_val );

		switch ( $operator ) {
			case 'equals':
				return 0 === strcasecmp( $actual_val_trim, $expected_val_trim );

			case 'not_equals':
				return 0 !== strcasecmp( $actual_val_trim, $expected_val_trim );

			case 'contains':
				if ( '' === $expected_val_trim ) {
					return true;
				}
				return false !== stripos( $actual_val, $expected_val_trim );

			case 'does_not_contain':
				if ( '' === $expected_val_trim ) {
					return false;
				}
				return false === stripos( $actual_val, $expected_val_trim );

			case 'greater_than':
				if ( ! is_numeric( $actual_val_trim ) || ! is_numeric( $expected_val_trim ) ) {
					return false;
				}
				return (float) $actual_val_trim > (float) $expected_val_trim;

			case 'less_than':
				if ( ! is_numeric( $actual_val_trim ) || ! is_numeric( $expected_val_trim ) ) {
					return false;
				}
				return (float) $actual_val_trim < (float) $expected_val_trim;

			case 'is_empty':
				return '' === $actual_val_trim;

			case 'is_not_empty':
				return '' !== $actual_val_trim;

			default:
				return false;
		}
	}
}
