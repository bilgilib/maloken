/**
 * SCPO Frontend Live Price & Conditional Visibility Engine
 */
(function($) {
	'use strict';

	$(document).ready(function() {
		var $wrapper = $('.scpo-options-wrapper');
		if (!$wrapper.length) {
			return;
		}

		var basePrice = parseFloat($wrapper.data('base-price')) || 0;

		function getFieldValue(fieldId) {
			var $row = $wrapper.find('.scpo-field-row[data-field-id="' + fieldId + '"]');
			if (!$row.length) return '';

			if ($row.hasClass('scpo-field-type-checkbox')) {
				var $cb = $row.find('input[type="checkbox"]');
				return $cb.is(':checked') ? $cb.val() : ($row.find('input[type="hidden"]').val() || 'no');
			}
			if ($row.hasClass('scpo-field-type-radio')) {
				var $checked = $row.find('input[type="radio"]:checked');
				return $checked.length ? $checked.val() : '';
			}
			if ($row.hasClass('scpo-field-type-select')) {
				return $row.find('select').val() || '';
			}
			return $row.find('input, textarea').val() || '';
		}

		function evaluateRule(actualVal, operator, expectedVal) {
			var actualTrim = $.trim(actualVal).toLowerCase();
			var expectedTrim = $.trim(expectedVal).toLowerCase();

			switch (operator) {
				case 'equals':
					return actualTrim === expectedTrim;
				case 'not_equals':
					return actualTrim !== expectedTrim;
				case 'contains':
					if (expectedTrim === '') return true;
					return actualTrim.indexOf(expectedTrim) !== -1;
				case 'does_not_contain':
					if (expectedTrim === '') return false;
					return actualTrim.indexOf(expectedTrim) === -1;
				case 'greater_than':
					var nActual = parseFloat(actualTrim);
					var nExp = parseFloat(expectedTrim);
					return (!isNaN(nActual) && !isNaN(nExp)) ? (nActual > nExp) : false;
				case 'less_than':
					var nAct = parseFloat(actualTrim);
					var nE = parseFloat(expectedTrim);
					return (!isNaN(nAct) && !isNaN(nE)) ? (nAct < nE) : false;
				case 'is_empty':
					return actualTrim === '';
				case 'is_not_empty':
					return actualTrim !== '';
				default:
					return false;
			}
		}

		function evaluateConditions() {
			$wrapper.find('.scpo-field-row').each(function() {
				var $row = $(this);
				var rawConds = $row.attr('data-conditions');
				if (!rawConds) {
					$row.show();
					return;
				}

				try {
					var conds = typeof rawConds === 'string' ? JSON.parse(rawConds) : rawConds;
					if (!conds || !conds.rules || !conds.rules.length) {
						$row.show();
						return;
					}

					var action = (conds.action && conds.action.toUpperCase() === 'HIDE') ? 'HIDE' : 'SHOW';
					var groupOp = (conds.operator && conds.operator.toUpperCase() === 'ANY') ? 'ANY' : 'ALL';
					var matches = [];

					for (var i = 0; i < conds.rules.length; i++) {
						var rule = conds.rules[i];
						if (!rule.field_id) continue;
						var currentVal = getFieldValue(rule.field_id);
						matches.push(evaluateRule(currentVal, rule.operator || 'equals', rule.value || ''));
					}

					var satisfied = false;
					if (groupOp === 'ANY') {
						satisfied = matches.indexOf(true) !== -1;
					} else { // ALL
						satisfied = matches.indexOf(false) === -1;
					}

					var isVisible = (action === 'SHOW') ? satisfied : !satisfied;

					if (isVisible) {
						$row.show();
						// Re-enable required attributes if originally required
						$row.find('input, select, textarea').prop('disabled', false);
					} else {
						$row.hide();
						// Inactive fields disabled so browser form validation doesn't block submit
						$row.find('input, select, textarea').prop('disabled', true);
					}
				} catch (e) {
					$row.show();
				}
			});
		}

		function formatCurrency(amount) {
			if (typeof scpo_frontend_params === 'undefined') {
				return '$' + amount.toFixed(2);
			}

			var decimals = scpo_frontend_params.decimals !== undefined ? parseInt(scpo_frontend_params.decimals, 10) : 2;
			var decPoint = scpo_frontend_params.decimal_sep || '.';
			var thousandsSep = scpo_frontend_params.thousand_sep || ',';
			var symbol = scpo_frontend_params.currency_symbol || '$';
			var format = scpo_frontend_params.price_format || '%1$s%2$s';

			var parts = amount.toFixed(decimals).split('.');
			parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
			var formattedNumber = parts.join(decPoint);

			return format.replace('%1$s', symbol).replace('%2$s', formattedNumber);
		}

		function recalculateLivePrice() {
			// First, evaluate visibility so inactive fields are hidden and don't calculate into totals
			evaluateConditions();

			var totalOptionDelta = 0;

			$wrapper.find('.scpo-field-row:visible').each(function() {
				var $row = $(this);
				var mode = $row.data('pricing-mode');
				var amount = parseFloat($row.data('pricing-amount')) || 0;

				// Checkbox
				if ($row.hasClass('scpo-field-type-checkbox')) {
					var $checkbox = $row.find('input[type="checkbox"]');
					if ($checkbox.is(':checked')) {
						var checkPrice = parseFloat($checkbox.data('price')) || amount;
						totalOptionDelta += checkPrice;
					}
				}
				// Select
				else if ($row.hasClass('scpo-field-type-select')) {
					var $selected = $row.find('select option:selected');
					var selectPrice = parseFloat($selected.data('price')) || 0;
					totalOptionDelta += selectPrice;
				}
				// Radio
				else if ($row.hasClass('scpo-field-type-radio')) {
					var $checkedRadio = $row.find('input[type="radio"]:checked');
					if ($checkedRadio.length) {
						var radioPrice = parseFloat($checkedRadio.data('price')) || 0;
						totalOptionDelta += radioPrice;
					}
				}
				// Text / Textarea
				else if ($row.hasClass('scpo-field-type-text') || $row.hasClass('scpo-field-type-textarea')) {
					var val = $row.find('input, textarea').val() || '';
					if (val.length > 0) {
						if (mode === 'per_character') {
							totalOptionDelta += (amount * val.length);
						} else if (mode === 'fixed') {
							totalOptionDelta += amount;
						}
					}
				}
				// Number
				else if ($row.hasClass('scpo-field-type-number')) {
					var numVal = parseFloat($row.find('input').val());
					if (!isNaN(numVal) && numVal > 0) {
						if (mode === 'multiplied_by_value') {
							totalOptionDelta += (amount * numVal);
						} else if (mode === 'fixed') {
							totalOptionDelta += amount;
						}
					}
				}
			});

			var grandTotal = basePrice + totalOptionDelta;

			$wrapper.find('.scpo-options-total-display').text(formatCurrency(totalOptionDelta));
			$wrapper.find('.scpo-grand-total-display').text(formatCurrency(grandTotal));
		}

		// Bind events to all input modifications
		$wrapper.on('change input', 'input, select, textarea', function() {
			recalculateLivePrice();
		});

		// Initial evaluation and calculation on load
		recalculateLivePrice();
	});
})(jQuery);
