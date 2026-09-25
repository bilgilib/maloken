/**
 * SCPO Phase 3 Visual Admin Builder JS
 * Provides interactive visual Section/Field/Choice CRUD, reordering, duplicate/delete,
 * live customer preview, condition builder, and bidirectional sync with canonical JSON.
 *
 * Robust lifecycle:
 * - Executes immediately if loaded after DOMContentLoaded or on DOMContentLoaded.
 * - Safely handles textarea .value / .textContent / .innerText / HTML entities.
 * - Renders visible admin error notices on failure without clobbering existing JSON schema.
 */
(function(window, document) {
	'use strict';

	var isInitialized = false;
	var $ = window.jQuery || window.$;

	function escapeHtml(text) {
		if (text === null || text === undefined) return '';
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function generateStableId(prefix) {
		return prefix + '_' + Math.random().toString(36).substr(2, 8);
	}

	function renderAdminError(message, details) {
		var canvas = document.getElementById('scpo-sections-canvas');
		var emptyState = document.getElementById('scpo-empty-state');
		if (emptyState) {
			emptyState.style.display = 'none';
		}

		var bannerHtml =
			'<div class="notice notice-error scpo-init-error-notice" style="display:block; padding:12px 16px; margin:15px 0; border-left:4px solid #d63638; background:#fff; box-shadow:0 1px 1px rgba(0,0,0,.04);">' +
			'<p style="margin:0 0 6px 0; font-size:14px; font-weight:600; color:#d63638;">' +
			'⚠️ Visual Form Builder Initialization Error' +
			'</p>' +
			'<p style="margin:0; font-size:13px; color:#1d2327;">' +
			escapeHtml(message) +
			'</p>' +
			(details ? '<pre style="margin-top:8px; padding:8px; background:#f0f0f1; border:1px solid #ccd0d4; font-size:11px; white-space:pre-wrap; max-height:120px; overflow:auto;">' + escapeHtml(details) + '</pre>' : '') +
			'<p class="description" style="margin-top:6px; font-size:12px;">Your existing configuration JSON in the "Advanced JSON" tab has been preserved safely without data loss.</p>' +
			'</div>';

		if (canvas) {
			canvas.style.display = 'block';
			canvas.innerHTML = bannerHtml;
		}

		var editorForm = document.getElementById('scpo-editor-form');
		if (editorForm && editorForm.parentNode) {
			var existingTop = document.querySelector('.scpo-init-error-banner-top');
			if (!existingTop) {
				var topBanner = document.createElement('div');
				topBanner.className = 'scpo-init-error-banner-top';
				topBanner.innerHTML = bannerHtml;
				editorForm.parentNode.insertBefore(topBanner, editorForm);
			}
		}
	}

	function extractAndParseConfig(textarea) {
		if (!textarea) {
			throw new Error('Configuration textarea #scpo_config_json not found.');
		}

		var raw = textarea.value;
		if (!raw || !raw.trim()) {
			raw = textarea.textContent || textarea.innerText || textarea.defaultValue || '';
		}
		raw = (raw || '').trim();

		if (!raw) {
			var titleInput = document.getElementById('scpo_title');
			return {
				$schema_version: '1.0.0',
				id: generateStableId('set'),
				title: (titleInput ? titleInput.value : '') || '',
				sections: []
			};
		}

		// 1. Direct JSON parse
		try {
			var parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				if (!Array.isArray(parsed.sections)) {
					parsed.sections = [];
				}
				return parsed;
			}
		} catch (e1) {
			// 2. Try HTML entity decode if saved via esc_textarea
			try {
				var decoded = raw
					.replace(/&quot;/g, '"')
					.replace(/&#039;/g, "'")
					.replace(/&apos;/g, "'")
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>');
				var parsedDecoded = JSON.parse(decoded);
				if (parsedDecoded && typeof parsedDecoded === 'object') {
					if (!Array.isArray(parsedDecoded.sections)) {
						parsedDecoded.sections = [];
					}
					return parsedDecoded;
				}
			} catch (e2) {
				// 3. Try DOM textarea decode
				try {
					var temp = document.createElement('textarea');
					temp.innerHTML = raw;
					var parsedDom = JSON.parse(temp.value);
					if (parsedDom && typeof parsedDom === 'object') {
						if (!Array.isArray(parsedDom.sections)) {
							parsedDom.sections = [];
						}
						return parsedDom;
					}
				} catch (e3) {
					throw new Error('Malformed JSON syntax in #scpo_config_json: ' + e1.message);
				}
			}
		}

		throw new Error('Invalid JSON structure: schema root must be an object.');
	}

	function initBuilder() {
		if (isInitialized) return;

		// Re-check jQuery in case it was loaded after this script
		$ = window.jQuery || window.$;

		var jsonTextarea = document.getElementById('scpo_config_json');
		var canvasEl = document.getElementById('scpo-sections-canvas');
		var formEl = document.getElementById('scpo-editor-form');

		// Only run on the editor screen where our form or textarea exists
		if (!jsonTextarea && !canvasEl && !formEl) {
			return;
		}

		isInitialized = true;

		var isDirty = false;
		var activeSelection = null; // { type: 'section' | 'field', secId: '...', fldId: '...' }
		var schema;

		try {
			schema = extractAndParseConfig(jsonTextarea);
		} catch (parseError) {
			console.error('SCPO Visual Builder initialization failed:', parseError);
			renderAdminError(parseError.message);
			// Bind tab navigation so the user can still switch to Advanced JSON to fix syntax errors!
			bindTabNavigationOnly();
			return;
		}

		function syncSchemaToJson() {
			if (!schema || !jsonTextarea) return;
			var titleEl = document.getElementById('scpo_title');
			if (titleEl && titleEl.value) {
				schema.title = titleEl.value;
			}
			jsonTextarea.value = JSON.stringify(schema, null, 2);
		}

		function syncJsonToSchema() {
			if (!jsonTextarea) return;
			try {
				var raw = jsonTextarea.value.trim();
				if (raw !== '') {
					var p = JSON.parse(raw);
					if (p && Array.isArray(p.sections)) {
						schema = p;
						renderBuilderCanvas();
					}
				}
			} catch (e) {
				// Keep current schema if raw JSON has syntax error
			}
		}

		function getFieldTypeDisplayLabel(type) {
			var map = {
				'select': 'Single Select',
				'multiselect': 'Multi Select',
				'imageselect': 'Image Select',
				'text': 'Text Input',
				'textarea': 'Textarea',
				'number': 'Number',
				'checkbox': 'Checkbox',
				'radio': 'Radio Buttons',
				'date': 'Date Picker'
			};
			return map[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Option');
		}

		function findSection(secId) {
			if (!schema || !schema.sections) return null;
			return schema.sections.find(function(s) { return s.id === secId; });
		}

		function findField(secId, fldId) {
			var sec = findSection(secId);
			if (!sec || !sec.fields) return null;
			return sec.fields.find(function(f) { return f.id === fldId; });
		}

		// 1. Tab Navigation
		function switchTab(tab) {
			var activeBtn = document.querySelector('.scpo-tab-btn.active');
			var currentTab = activeBtn ? activeBtn.getAttribute('data-tab') : 'visual';
			if (tab === currentTab) return;

			// If switching from JSON to Visual while dirty and raw JSON is invalid, warn merchant
			if (currentTab === 'json' && tab !== 'json') {
				try {
					var raw = jsonTextarea ? jsonTextarea.value.trim() : '';
					if (raw !== '') {
						JSON.parse(raw);
					}
				} catch (err) {
					if (!confirm('The JSON editor contains syntax errors: ' + err.message + '\nSwitching modes will discard invalid JSON edits. Continue?')) {
						return;
					}
				}
			}

			var tabBtns = document.querySelectorAll('.scpo-tab-btn');
			for (var i = 0; i < tabBtns.length; i++) {
				if (tabBtns[i].getAttribute('data-tab') === tab) {
					tabBtns[i].classList.add('active');
				} else {
					tabBtns[i].classList.remove('active');
				}
			}

			var tabContents = document.querySelectorAll('.scpo-tab-content');
			for (var j = 0; j < tabContents.length; j++) {
				tabContents[j].style.display = 'none';
			}

			var targetContent = document.getElementById('scpo-tab-' + tab);
			if (targetContent) {
				targetContent.style.display = 'block';
			}

			if (tab === 'preview') {
				syncSchemaToJson();
				renderLivePreview();
			} else if (tab === 'visual') {
				syncJsonToSchema();
			} else if (tab === 'json') {
				syncSchemaToJson();
			}
		}

		function bindTabNavigationOnly() {
			var tabBtns = document.querySelectorAll('.scpo-tab-btn');
			for (var i = 0; i < tabBtns.length; i++) {
				tabBtns[i].addEventListener('click', function(e) {
					e.preventDefault();
					var tab = this.getAttribute('data-tab');
					var tabContents = document.querySelectorAll('.scpo-tab-content');
					for (var j = 0; j < tabContents.length; j++) {
						tabContents[j].style.display = 'none';
					}
					var targetContent = document.getElementById('scpo-tab-' + tab);
					if (targetContent) {
						targetContent.style.display = 'block';
					}
					for (var k = 0; k < tabBtns.length; k++) {
						tabBtns[k].classList.remove('active');
					}
					this.classList.add('active');
				});
			}
		}

		document.addEventListener('click', function(e) {
			if (!e || !e.target || typeof e.target.closest !== 'function') return;
			var tabBtn = e.target.closest('.scpo-tab-btn');
			if (tabBtn) {
				e.preventDefault();
				var tab = tabBtn.getAttribute('data-tab');
				if (tab) {
					switchTab(tab);
				}
			}
		});

		// 2. Render Builder Canvas
		function renderBuilderCanvas() {
			var canvas = document.getElementById('scpo-sections-canvas');
			var emptyState = document.getElementById('scpo-empty-state');
			var contextualPanel = document.getElementById('scpo-contextual-panel');
			if (!canvas) return;

			canvas.innerHTML = '';

			if (!schema.sections || schema.sections.length === 0) {
				if (emptyState) emptyState.style.display = 'block';
				canvas.style.display = 'none';
				if (contextualPanel) contextualPanel.style.display = 'none';
				return;
			}

			if (emptyState) emptyState.style.display = 'none';
			canvas.style.display = 'block';

			schema.sections.forEach(function(section, sIdx) {
				var isSecSelected = activeSelection && activeSelection.type === 'section' && activeSelection.secId === section.id;
				var secCard = document.createElement('div');
				secCard.className = 'scpo-section-card' + (isSecSelected ? ' selected' : '');
				secCard.setAttribute('draggable', 'true'); // draggable="true"
				secCard.setAttribute('data-sec-id', section.id);
				secCard.setAttribute('data-sec-idx', String(sIdx));

				// Section Header
				var secHeader = document.createElement('div');
				secHeader.className = 'scpo-section-header';
				var secMode = section.selection_mode || 'multiple';
				secHeader.innerHTML =
					'<div class="scpo-section-title-wrap">' +
						'<span class="scpo-section-drag-handle" title="Drag to reorder section">☰</span>' +
						'<input type="text" class="scpo-sec-title-input" value="' + escapeHtml(section.title || 'Untitled Section') + '" placeholder="Section Title">' +
						'<span class="description" style="font-size: 11px;">(' + (section.fields ? section.fields.length : 0) + ' options)</span>' +
					'</div>' +
					'<div class="scpo-section-actions">' +
						'<label style="font-size: 11px; margin-right: 2px; color: #50575e;">Selection mode:</label>' +
						'<select class="scpo-sec-mode-select" title="Selection mode" style="font-size: 11px; height: 26px; padding: 0 4px; margin-right: 6px;">' +
							'<option value="multiple"' + (secMode === 'single' ? '' : ' selected') + '>Multiple choices</option>' +
							'<option value="single"' + (secMode === 'single' ? ' selected' : '') + '>Single choice</option>' +
						'</select>' +
						'<button type="button" class="button button-small scpo-btn-add-field" title="Add Option">+ New Option</button>' +
						'<button type="button" class="button button-small scpo-btn-move-sec-up" title="Move Up"' + (sIdx === 0 ? ' disabled' : '') + '>↑</button>' +
						'<button type="button" class="button button-small scpo-btn-move-sec-down" title="Move Down"' + (sIdx === schema.sections.length - 1 ? ' disabled' : '') + '>↓</button>' +
						'<button type="button" class="button button-small scpo-btn-delete-sec" title="Delete Section" style="color: #b32d2e;">✕</button>' +
					'</div>';

				// Section Body
				var secBody = document.createElement('div');
				secBody.className = 'scpo-section-body';

				var fieldsList = document.createElement('div');
				fieldsList.className = 'scpo-fields-list';
				fieldsList.setAttribute('data-sec-id', section.id);

				if (!section.fields || section.fields.length === 0) {
					fieldsList.innerHTML = '<p class="description" style="font-style: italic; margin: 4px 0 8px 0;">No fields in this section yet. Click "+ Add Field" above.</p>';
				} else {
					section.fields.forEach(function(field, fIdx) {
						var isFldSelected = activeSelection && activeSelection.type === 'field' && activeSelection.fldId === field.id;
						var priceBadge = '';
						if (field.pricing && parseFloat(field.pricing.amount) > 0) {
							priceBadge = '<span class="scpo-field-pricing-tag">+' + parseFloat(field.pricing.amount).toFixed(2) + '</span>';
						}
						var condBadge = '';
						if (field.conditions && field.conditions.rules && field.conditions.rules.length > 0) {
							condBadge = '<span class="scpo-field-cond-indicator" title="Has conditional rules">⚡ ' + field.conditions.rules.length + ' rule(s)</span>';
						}

						var fldItem = document.createElement('div');
						fldItem.className = 'scpo-field-item' + (isFldSelected ? ' selected' : '');
						fldItem.setAttribute('draggable', 'true');
						fldItem.setAttribute('data-fld-id', field.id);
						fldItem.setAttribute('data-sec-id', section.id);
						fldItem.setAttribute('data-fld-idx', String(fIdx));

						fldItem.innerHTML =
							'<div class="scpo-field-meta">' +
								'<span class="scpo-field-drag-handle" title="Drag to reorder field">⠿</span>' +
								'<span class="scpo-field-badge">' + escapeHtml(getFieldTypeDisplayLabel(field.type)) + '</span>' +
								'<span class="scpo-field-title">' + escapeHtml(field.label || 'New Option') + (field.required ? ' <span style="color:red;">*</span>' : '') + '</span>' +
								priceBadge +
								condBadge +
							'</div>' +
							'<div class="scpo-field-actions">' +
								'<button type="button" class="button button-small scpo-btn-edit-fld" title="Configure Field">Edit</button>' +
								'<button type="button" class="button button-small scpo-btn-dup-fld" title="Duplicate Field">Copy</button>' +
								'<button type="button" class="button button-small scpo-btn-move-fld-up" title="Move Up"' + (fIdx === 0 ? ' disabled' : '') + '>↑</button>' +
								'<button type="button" class="button button-small scpo-btn-move-fld-down" title="Move Down"' + (fIdx === section.fields.length - 1 ? ' disabled' : '') + '>↓</button>' +
								'<button type="button" class="button button-small scpo-btn-del-fld" title="Delete Field" style="color: #b32d2e;">✕</button>' +
							'</div>';

						fieldsList.appendChild(fldItem);
					});
				}

				secBody.appendChild(fieldsList);
				secCard.appendChild(secHeader);
				secCard.appendChild(secBody);
				canvas.appendChild(secCard);
			});

			bindDragAndDropHandlers();
			syncSchemaToJson();
		}

		// 3. Drag and Drop State and Event Handlers
		var draggedSectionId = null;
		var draggedFieldData = null; // { secId: '...', fldId: '...' }

		function bindDragAndDropHandlers() {
			var secCards = document.querySelectorAll('.scpo-section-card');
			secCards.forEach(function(card) {
				card.ondragstart = function(e) {
					if (e.target && typeof e.target.closest === 'function' && e.target.closest('.scpo-field-item')) return;
					draggedSectionId = this.getAttribute('data-sec-id');
					this.classList.add('is-dragging');
					if (e.dataTransfer) {
						e.dataTransfer.setData('text/plain', draggedSectionId);
						e.dataTransfer.effectAllowed = 'move';
					}
				};
				card.ondragover = function(e) {
					if (!draggedSectionId) return;
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
					this.classList.add('drop-target');
				};
				card.ondragleave = function() {
					this.classList.remove('drop-target');
				};
				card.ondrop = function(e) {
					if (!draggedSectionId) return;
					e.preventDefault();
					this.classList.remove('drop-target');
					var targetSecId = this.getAttribute('data-sec-id');
					if (draggedSectionId !== targetSecId) {
						var fromIdx = schema.sections.findIndex(function(s) { return s.id === draggedSectionId; });
						var toIdx = schema.sections.findIndex(function(s) { return s.id === targetSecId; });
						if (fromIdx !== -1 && toIdx !== -1) {
							var item = schema.sections.splice(fromIdx, 1)[0];
							schema.sections.splice(toIdx, 0, item);
							schema.sections.forEach(function(s, idx) { s.order = idx + 1; });
							isDirty = true;
							renderBuilderCanvas();
						}
					}
				};
				card.ondragend = function() {
					draggedSectionId = null;
					var cards = document.querySelectorAll('.scpo-section-card');
					cards.forEach(function(c) { c.classList.remove('is-dragging', 'drop-target'); });
				};
			});

			var fldItems = document.querySelectorAll('.scpo-field-item');
			fldItems.forEach(function(item) {
				item.ondragstart = function(e) {
					e.stopPropagation();
					draggedFieldData = {
						secId: this.getAttribute('data-sec-id'),
						fldId: this.getAttribute('data-fld-id')
					};
					this.classList.add('is-dragging');
					if (e.dataTransfer) {
						e.dataTransfer.setData('text/plain', draggedFieldData.fldId);
						e.dataTransfer.effectAllowed = 'move';
					}
				};
				item.ondragover = function(e) {
					if (!draggedFieldData) return;
					e.preventDefault();
					e.stopPropagation();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
					this.classList.add('drop-target');
				};
				item.ondragleave = function(e) {
					e.stopPropagation();
					this.classList.remove('drop-target');
				};
				item.ondrop = function(e) {
					if (!draggedFieldData) return;
					e.preventDefault();
					e.stopPropagation();
					this.classList.remove('drop-target');

					var targetSecId = this.getAttribute('data-sec-id');
					var targetFldId = this.getAttribute('data-fld-id');

					var srcSec = findSection(draggedFieldData.secId);
					var tgtSec = findSection(targetSecId);

					if (srcSec && tgtSec) {
						var srcIdx = srcSec.fields.findIndex(function(f) { return f.id === draggedFieldData.fldId; });
						var tgtIdx = tgtSec.fields.findIndex(function(f) { return f.id === targetFldId; });

						if (srcIdx !== -1 && tgtIdx !== -1) {
							var fld = srcSec.fields.splice(srcIdx, 1)[0];
							tgtSec.fields.splice(tgtIdx, 0, fld);
							isDirty = true;
							renderBuilderCanvas();
						}
					}
				};
				item.ondragend = function() {
					draggedFieldData = null;
					var items = document.querySelectorAll('.scpo-field-item');
					items.forEach(function(it) { it.classList.remove('is-dragging', 'drop-target'); });
				};
			});
		}

		// 4. Section Actions
		function handleAddSection() {
			var newSec = {
				id: generateStableId('sec'),
				title: 'New Section',
				description: '',
				order: schema.sections.length + 1,
				fields: []
			};
			schema.sections.push(newSec);
			isDirty = true;
			renderBuilderCanvas();
		}

		document.addEventListener('click', function(e) {
			if (!e || !e.target || typeof e.target.closest !== 'function') return;

			// Add Section buttons
			if (e.target.closest('#scpo-btn-add-section') || e.target.closest('#scpo-empty-add-section-btn')) {
				e.preventDefault();
				handleAddSection();
				return;
			}

			// Add Field button
			var addFldBtn = e.target.closest('.scpo-btn-add-field');
			if (addFldBtn) {
				e.preventDefault();
				e.stopPropagation();
				var secCard = addFldBtn.closest('.scpo-section-card');
				if (!secCard) return;
				var secId = secCard.getAttribute('data-sec-id');
				var sec = findSection(secId);
				if (!sec) return;

				var newFld = {
					id: generateStableId('fld'),
					type: 'text',
					label: 'New Option',
					description: '',
					required: false,
					css_class: '',
					width: '100',
					pricing: {
						category: 'per_unit',
						mode: 'none',
						amount: 0.00
					}
				};

				sec.fields = sec.fields || [];
				sec.fields.push(newFld);
				activeSelection = { type: 'field', secId: secId, fldId: newFld.id };
				isDirty = true;
				renderBuilderCanvas();
				openContextualPanel(secId, newFld.id);
				return;
			}

			// Delete Section
			var delSecBtn = e.target.closest('.scpo-btn-delete-sec');
			if (delSecBtn) {
				e.preventDefault();
				e.stopPropagation();
				var sCard = delSecBtn.closest('.scpo-section-card');
				if (!sCard) return;
				var sId = sCard.getAttribute('data-sec-id');
				if (confirm('Delete this section and all its fields?')) {
					schema.sections = schema.sections.filter(function(s) { return s.id !== sId; });
					if (activeSelection && activeSelection.secId === sId) {
						activeSelection = null;
						var cp = document.getElementById('scpo-contextual-panel');
						if (cp) cp.style.display = 'none';
					}
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Move Section Up
			var moveSecUp = e.target.closest('.scpo-btn-move-sec-up');
			if (moveSecUp) {
				e.preventDefault();
				e.stopPropagation();
				var cardUp = moveSecUp.closest('.scpo-section-card');
				var uSecId = cardUp.getAttribute('data-sec-id');
				var uIdx = schema.sections.findIndex(function(s) { return s.id === uSecId; });
				if (uIdx > 0) {
					var t = schema.sections[uIdx];
					schema.sections[uIdx] = schema.sections[uIdx - 1];
					schema.sections[uIdx - 1] = t;
					schema.sections.forEach(function(s, idx) { s.order = idx + 1; });
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Move Section Down
			var moveSecDown = e.target.closest('.scpo-btn-move-sec-down');
			if (moveSecDown) {
				e.preventDefault();
				e.stopPropagation();
				var cardDown = moveSecDown.closest('.scpo-section-card');
				var dSecId = cardDown.getAttribute('data-sec-id');
				var dIdx = schema.sections.findIndex(function(s) { return s.id === dSecId; });
				if (dIdx < schema.sections.length - 1) {
					var td = schema.sections[dIdx];
					schema.sections[dIdx] = schema.sections[dIdx + 1];
					schema.sections[dIdx + 1] = td;
					schema.sections.forEach(function(s, idx) { s.order = idx + 1; });
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Delete Field
			var delFldBtn = e.target.closest('.scpo-btn-del-fld');
			if (delFldBtn) {
				e.preventDefault();
				e.stopPropagation();
				var fSecCard = delFldBtn.closest('.scpo-section-card');
				var fItem = delFldBtn.closest('.scpo-field-item');
				if (!fSecCard || !fItem) return;
				var fSecId = fSecCard.getAttribute('data-sec-id');
				var fFldId = fItem.getAttribute('data-fld-id');
				var fSec = findSection(fSecId);

				if (fSec && confirm('Delete this option field?')) {
					fSec.fields = fSec.fields.filter(function(f) { return f.id !== fFldId; });
					if (activeSelection && activeSelection.fldId === fFldId) {
						activeSelection = null;
						var cpanel = document.getElementById('scpo-contextual-panel');
						if (cpanel) cpanel.style.display = 'none';
					}
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Duplicate Field
			var dupFldBtn = e.target.closest('.scpo-btn-dup-fld');
			if (dupFldBtn) {
				e.preventDefault();
				e.stopPropagation();
				var dpSecCard = dupFldBtn.closest('.scpo-section-card');
				var dpItem = dupFldBtn.closest('.scpo-field-item');
				if (!dpSecCard || !dpItem) return;
				var dpSecId = dpSecCard.getAttribute('data-sec-id');
				var dpFldId = dpItem.getAttribute('data-fld-id');
				var dpSec = findSection(dpSecId);
				if (!dpSec || !dpSec.fields) return;

				var srcIdx = dpSec.fields.findIndex(function(f) { return f.id === dpFldId; });
				if (srcIdx !== -1) {
					var srcFld = dpSec.fields[srcIdx];
					var cloned = JSON.parse(JSON.stringify(srcFld));
					cloned.id = generateStableId('fld');
					cloned.label = (srcFld.label || 'New Option') + ' (Copy)';

					if (cloned.options && Array.isArray(cloned.options)) {
						cloned.options = cloned.options.map(function(opt) {
							return {
								id: generateStableId('opt'),
								label: opt.label,
								image_id: opt.image_id !== undefined ? opt.image_id : 0,
								image_url: opt.image_url || '',
								alt: opt.alt || '',
								price: opt.price
							};
						});
					}
					dpSec.fields.splice(srcIdx + 1, 0, cloned);
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Move Field Up
			var moveFldUp = e.target.closest('.scpo-btn-move-fld-up');
			if (moveFldUp) {
				e.preventDefault();
				e.stopPropagation();
				var muSec = moveFldUp.closest('.scpo-section-card');
				var muItem = moveFldUp.closest('.scpo-field-item');
				if (!muSec || !muItem) return;
				var msSec = findSection(muSec.getAttribute('data-sec-id'));
				if (!msSec) return;
				var mFldId = muItem.getAttribute('data-fld-id');
				var mfIdx = msSec.fields.findIndex(function(f) { return f.id === mFldId; });
				if (mfIdx > 0) {
					var tmpFld = msSec.fields[mfIdx];
					msSec.fields[mfIdx] = msSec.fields[mfIdx - 1];
					msSec.fields[mfIdx - 1] = tmpFld;
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Move Field Down
			var moveFldDown = e.target.closest('.scpo-btn-move-fld-down');
			if (moveFldDown) {
				e.preventDefault();
				e.stopPropagation();
				var mdSec = moveFldDown.closest('.scpo-section-card');
				var mdItem = moveFldDown.closest('.scpo-field-item');
				if (!mdSec || !mdItem) return;
				var msSecD = findSection(mdSec.getAttribute('data-sec-id'));
				if (!msSecD) return;
				var mdFldId = mdItem.getAttribute('data-fld-id');
				var mfdIdx = msSecD.fields.findIndex(function(f) { return f.id === mdFldId; });
				if (mfdIdx < msSecD.fields.length - 1) {
					var tmpFldD = msSecD.fields[mfdIdx];
					msSecD.fields[mfdIdx] = msSecD.fields[mfdIdx + 1];
					msSecD.fields[mfdIdx + 1] = tmpFldD;
					isDirty = true;
					renderBuilderCanvas();
				}
				return;
			}

			// Select Section Title Wrap
			var secTitleWrap = e.target.closest('.scpo-section-title-wrap');
			if (secTitleWrap && e.target.tagName !== 'INPUT') {
				var secCardEl = secTitleWrap.closest('.scpo-section-card');
				if (secCardEl) {
					var sIdVal = secCardEl.getAttribute('data-sec-id');
					activeSelection = { type: 'section', secId: sIdVal };
					document.querySelectorAll('.scpo-section-card').forEach(function(sc) { sc.classList.remove('selected'); });
					document.querySelectorAll('.scpo-field-item').forEach(function(fi) { fi.classList.remove('selected'); });
					secCardEl.classList.add('selected');
					openSectionPanel(sIdVal);
					return;
				}
			}

			// Select / Edit Field
			var fldItemTarget = e.target.closest('.scpo-field-item');
			if (fldItemTarget) {
				e.preventDefault();
				var sfSecId = fldItemTarget.getAttribute('data-sec-id');
				var sfFldId = fldItemTarget.getAttribute('data-fld-id');
				activeSelection = { type: 'field', secId: sfSecId, fldId: sfFldId };

				var allFldItems = document.querySelectorAll('.scpo-field-item');
				allFldItems.forEach(function(fi) { fi.classList.remove('selected'); });
				fldItemTarget.classList.add('selected');

				openContextualPanel(sfSecId, sfFldId);
				return;
			}

			// Close Contextual Panel
			if (e.target.closest('#scpo-close-panel')) {
				e.preventDefault();
				var cpElem = document.getElementById('scpo-contextual-panel');
				if (cpElem) cpElem.style.display = 'none';
				return;
			}
		});

		// Section title and selection mode changes
		document.addEventListener('change', function(e) {
			if (!e || !e.target || typeof e.target.closest !== 'function') return;
			if (e.target.classList && e.target.classList.contains('scpo-sec-title-input')) {
				var secCard = e.target.closest('.scpo-section-card');
				if (secCard) {
					var secId = secCard.getAttribute('data-sec-id');
					var sec = findSection(secId);
					if (sec) {
						sec.title = e.target.value;
						isDirty = true;
						syncSchemaToJson();
						renderLivePreview();
					}
				}
			}
			if (e.target.classList && e.target.classList.contains('scpo-sec-mode-select')) {
				var secCardMode = e.target.closest('.scpo-section-card');
				if (secCardMode) {
					var secIdMode = secCardMode.getAttribute('data-sec-id');
					var secModeObj = findSection(secIdMode);
					if (secModeObj) {
						secModeObj.selection_mode = e.target.value;
						isDirty = true;
						syncSchemaToJson();
						renderLivePreview();
					}
				}
			}
		});

		// 4b. Contextual Section Inspector Panel
		function openSectionPanel(secId) {
			var sec = findSection(secId);
			if (!sec) return;

			var panel = document.getElementById('scpo-contextual-panel');
			var content = document.getElementById('scpo-panel-content');
			var panelTitle = document.getElementById('scpo-panel-title');
			if (!panel || !content) return;

			if (panelTitle) {
				panelTitle.textContent = 'Configure Section: ' + (sec.title || 'Untitled Section');
			}

			var currentMode = sec.selection_mode || 'multiple';

			var html =
				'<div class="scpo-panel-group">' +
					'<label>Section ID (Stable identifier):</label>' +
					'<input type="text" value="' + escapeHtml(sec.id) + '" disabled style="background:#f0f0f1; font-family:monospace; font-size:11px;">' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Section Title *:</label>' +
					'<input type="text" id="scpo-edit-sec-title" value="' + escapeHtml(sec.title || '') + '">' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Selection mode *:</label>' +
					'<select id="scpo-edit-sec-mode">' +
						'<option value="multiple"' + (currentMode === 'single' ? '' : ' selected') + '>Multiple choices</option>' +
						'<option value="single"' + (currentMode === 'single' ? ' selected' : '') + '>Single choice</option>' +
					'</select>' +
					'<p class="description" style="margin-top:4px; font-size:11px; line-height:1.4;">' +
						'<strong>Single choice:</strong> Sibling options allow only one choice to be selected (e.g. Color, Camouflage Pattern, Size/Style).<br>' +
						'<strong>Multiple choices:</strong> Sibling options allow several choices to be selected simultaneously (e.g. Extra Accessories, Add-ons).' +
					'</p>' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Helper / Description Text:</label>' +
					'<textarea id="scpo-edit-sec-desc" rows="3">' + escapeHtml(sec.description || '') + '</textarea>' +
				'</div>';

			content.innerHTML = html;
			panel.style.display = 'block';

			var titleInput = document.getElementById('scpo-edit-sec-title');
			if (titleInput) {
				titleInput.oninput = function() {
					sec.title = this.value;
					isDirty = true;
					var cardTitleInput = document.querySelector('.scpo-section-card[data-sec-id="' + sec.id + '"] .scpo-sec-title-input');
					if (cardTitleInput) cardTitleInput.value = this.value;
					syncSchemaToJson();
				};
			}

			var modeSelect = document.getElementById('scpo-edit-sec-mode');
			if (modeSelect) {
				modeSelect.onchange = function() {
					sec.selection_mode = this.value;
					isDirty = true;
					var cardModeSelect = document.querySelector('.scpo-section-card[data-sec-id="' + sec.id + '"] .scpo-sec-mode-select');
					if (cardModeSelect) cardModeSelect.value = this.value;
					syncSchemaToJson();
					renderLivePreview();
				};
			}

			var descInput = document.getElementById('scpo-edit-sec-desc');
			if (descInput) {
				descInput.oninput = function() {
					sec.description = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}
		}

		// 5. Contextual Inspector Panel
		function openContextualPanel(secId, fldId) {
			var field = findField(secId, fldId);
			if (!field) return;

			var panel = document.getElementById('scpo-contextual-panel');
			var content = document.getElementById('scpo-panel-content');
			var panelTitle = document.getElementById('scpo-panel-title');
			if (!panel || !content) return;

			if (panelTitle) {
				panelTitle.textContent = 'Configure Option: ' + getFieldTypeDisplayLabel(field.type);
			}

			var html =
				'<div class="scpo-panel-group">' +
					'<label>Field ID (Stable identifier):</label>' +
					'<input type="text" value="' + escapeHtml(field.id) + '" disabled style="background:#f0f0f1; font-family:monospace; font-size:11px;">' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Option Label *:</label>' +
					'<input type="text" id="scpo-edit-fld-label" value="' + escapeHtml(field.label) + '">' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Field Type:</label>' +
					'<select id="scpo-edit-fld-type">' +
						'<option value="text"' + (field.type === 'text' ? ' selected' : '') + '>Text Input</option>' +
						'<option value="textarea"' + (field.type === 'textarea' ? ' selected' : '') + '>Textarea (Multi-line)</option>' +
						'<option value="number"' + (field.type === 'number' ? ' selected' : '') + '>Number Input</option>' +
						'<option value="select"' + (field.type === 'select' ? ' selected' : '') + '>Single Select (Dropdown)</option>' +
						'<option value="multiselect"' + (field.type === 'multiselect' ? ' selected' : '') + '>Multi Select (Multiple Choices)</option>' +
						'<option value="imageselect"' + (field.type === 'imageselect' ? ' selected' : '') + '>Image Select (Visual Choice)</option>' +
						'<option value="radio"' + (field.type === 'radio' ? ' selected' : '') + '>Radio Buttons</option>' +
						'<option value="checkbox"' + (field.type === 'checkbox' ? ' selected' : '') + '>Checkbox (Toggle)</option>' +
						'<option value="date"' + (field.type === 'date' ? ' selected' : '') + '>Date Picker</option>' +
					'</select>' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label>Helper / Description Text:</label>' +
					'<textarea id="scpo-edit-fld-desc" rows="2">' + escapeHtml(field.description || '') + '</textarea>' +
				'</div>' +
				'<div class="scpo-panel-group">' +
					'<label><input type="checkbox" id="scpo-edit-fld-req"' + (field.required ? ' checked' : '') + '> Required field</label>' +
				'</div>';

			// Constraints accordion
			html +=
				'<div class="scpo-accordion-header" data-toggle="constraints">Constraints & Layout ▾</div>' +
				'<div class="scpo-accordion-body" id="scpo-sec-constraints">' +
					'<div class="scpo-panel-group">' +
						'<label>Field Width:</label>' +
						'<select id="scpo-edit-fld-width">' +
							'<option value="100"' + ((field.width || '100') === '100' ? ' selected' : '') + '>Full Width (100%)</option>' +
							'<option value="50"' + (field.width === '50' ? ' selected' : '') + '>Half Width (50%)</option>' +
							'<option value="33"' + (field.width === '33' ? ' selected' : '') + '>One Third (33%)</option>' +
						'</select>' +
					'</div>';

			if (field.type === 'text' || field.type === 'textarea') {
				html +=
					'<div class="scpo-panel-group">' +
						'<label>Max Character Length:</label>' +
						'<input type="number" id="scpo-edit-fld-maxlength" min="1" value="' + (field.max_length || '') + '" placeholder="e.g. 30">' +
					'</div>';
			} else if (field.type === 'number') {
				html +=
					'<div class="scpo-panel-group">' +
						'<label>Minimum Value:</label>' +
						'<input type="number" id="scpo-edit-fld-min" value="' + (field.min !== undefined ? field.min : '') + '">' +
					'</div>' +
					'<div class="scpo-panel-group">' +
						'<label>Maximum Value:</label>' +
						'<input type="number" id="scpo-edit-fld-max" value="' + (field.max !== undefined ? field.max : '') + '">' +
					'</div>';
			}

			html += '</div>';

			// Choices accordion (for select, multiselect, and radio)
			if (field.type === 'select' || field.type === 'multiselect' || field.type === 'radio') {
				field.options = field.options || [{ id: generateStableId('opt'), label: 'Choice 1', price: 0 }];
				html +=
					'<div class="scpo-accordion-header" data-toggle="choices">Choices & Option Values ▾</div>' +
					'<div class="scpo-accordion-body" id="scpo-sec-choices">' +
						'<table class="scpo-choices-table">' +
							'<thead><tr><th>Label</th><th>Price (+)</th><th></th></tr></thead>' +
							'<tbody id="scpo-choices-body">';

				field.options.forEach(function(opt) {
					html +=
						'<tr data-opt-id="' + opt.id + '">' +
							'<td><input type="text" class="scpo-choice-label" value="' + escapeHtml(opt.label) + '"></td>' +
							'<td><input type="number" step="0.01" class="scpo-choice-price" value="' + (opt.price || 0) + '"></td>' +
							'<td><button type="button" class="button-link scpo-btn-del-choice" style="color:red;"' + (field.options.length <= 1 ? ' disabled' : '') + '>✕</button></td>' +
						'</tr>';
				});

				html +=
							'</tbody>' +
						'</table>' +
						'<button type="button" class="button button-small" id="scpo-btn-add-choice" style="margin-top: 8px;">+ Add Choice</button>' +
					'</div>';
			}

			// Image Choices accordion (for imageselect)
			if (field.type === 'imageselect') {
				field.options = field.options || [{ id: generateStableId('opt'), label: 'Option 1', image_id: 0, image_url: '', alt: '', price: 0 }];
				html +=
					'<div class="scpo-accordion-header" data-toggle="image-choices">Image Choices & Media Library ▾</div>' +
					'<div class="scpo-accordion-body" id="scpo-sec-image-choices">' +
						'<p class="description" style="margin-top:0; font-size:11px;">Images selected or uploaded are organized into the dedicated "Simple Product Options" Media Library folder.</p>' +
						'<div id="scpo-image-choices-list" class="scpo-image-choices-list">';

				field.options.forEach(function(opt) {
					var thumbMarkup = opt.image_url
						? '<img src="' + escapeHtml(opt.image_url) + '" class="scpo-choice-thumb" alt="' + escapeHtml(opt.alt || opt.label) + '">'
						: '<div class="scpo-choice-thumb-empty">🖼️</div>';

					html +=
						'<div class="scpo-image-choice-row" data-opt-id="' + opt.id + '">' +
							'<div class="scpo-choice-thumb-wrap">' +
								thumbMarkup +
								'<button type="button" class="button button-small scpo-btn-choose-img" title="Select or Upload from Media Library">Choose Image</button>' +
							'</div>' +
							'<div class="scpo-choice-fields-wrap">' +
								'<div class="scpo-choice-row-item">' +
									'<label>Choice Label *:</label>' +
									'<input type="text" class="scpo-choice-label" value="' + escapeHtml(opt.label) + '" placeholder="e.g. Woodland Camo">' +
								'</div>' +
								'<div class="scpo-choice-row-item">' +
									'<label>Price Delta (+):</label>' +
									'<input type="number" step="0.01" class="scpo-choice-price" value="' + (opt.price || 0) + '">' +
								'</div>' +
								'<div class="scpo-choice-row-item">' +
									'<label>Alt Text:</label>' +
									'<input type="text" class="scpo-choice-alt" value="' + escapeHtml(opt.alt || '') + '" placeholder="Image description">' +
								'</div>' +
								'<div class="scpo-choice-footer-item">' +
									'<span class="description" style="font-family:monospace; font-size:10px;">ID: ' + escapeHtml(opt.id) + '</span>' +
									(opt.image_id ? '<span class="description" style="font-size:10px; margin-left:6px;">(Attachment #' + opt.image_id + ')</span>' : '') +
									'<button type="button" class="button-link scpo-btn-del-choice" style="color:red; margin-left:auto;"' + (field.options.length <= 1 ? ' disabled' : '') + '>Delete Choice</button>' +
								'</div>' +
							'</div>' +
						'</div>';
				});

				html +=
						'</div>' +
						'<button type="button" class="button button-small" id="scpo-btn-add-img-choice" style="margin-top: 10px;">+ Add Image Choice</button>' +
					'</div>';
			}

			// Checkbox states accordion
			if (field.type === 'checkbox') {
				field.states = field.states || {
					yes: { label: 'Yes', price_delta: (field.pricing ? field.pricing.amount : 0) },
					no: { label: 'No', price_delta: 0 }
				};
				html +=
					'<div class="scpo-accordion-header" data-toggle="checkbox-states">Checkbox Settings ▾</div>' +
					'<div class="scpo-accordion-body" id="scpo-sec-checkbox-states">' +
						'<div class="scpo-panel-group">' +
							'<label>Checked State Price Delta (+):</label>' +
							'<input type="number" step="0.01" id="scpo-edit-cb-delta" value="' + (field.states.yes ? field.states.yes.price_delta : 0) + '">' +
						'</div>' +
					'</div>';
			}

			// Pricing calculation accordion
			if (['text', 'textarea', 'number', 'date', 'checkbox'].indexOf(field.type) !== -1) {
				var pCat = field.pricing ? field.pricing.category : 'per_unit';
				var pMode = field.pricing ? field.pricing.mode : 'none';
				var pAmt = field.pricing ? field.pricing.amount : 0;

				html +=
					'<div class="scpo-accordion-header" data-toggle="pricing">Pricing & Add-ons ▾</div>' +
					'<div class="scpo-accordion-body" id="scpo-sec-pricing">' +
						'<div class="scpo-panel-group">' +
							'<label>Pricing Category:</label>' +
							'<select id="scpo-edit-pricing-cat">' +
								'<option value="per_unit"' + (pCat === 'per_unit' ? ' selected' : '') + '>Per Unit (Multiplied by Quantity)</option>' +
								'<option value="one_time_fee"' + (pCat === 'one_time_fee' ? ' selected' : '') + '>One-Time Fee (Flat line item)</option>' +
							'</select>' +
						'</div>' +
						'<div class="scpo-panel-group">' +
							'<label>Pricing Mode:</label>' +
							'<select id="scpo-edit-pricing-mode">' +
								'<option value="none"' + (pMode === 'none' ? ' selected' : '') + '>Free (No adjustment)</option>' +
								'<option value="fixed"' + (pMode === 'fixed' ? ' selected' : '') + '>Fixed Amount</option>';

				if (field.type === 'text' || field.type === 'textarea') {
					html += '<option value="per_character"' + (pMode === 'per_character' ? ' selected' : '') + '>Per Character</option>';
				} else if (field.type === 'number') {
					html += '<option value="multiplied_by_value"' + (pMode === 'multiplied_by_value' ? ' selected' : '') + '>Multiply by Value</option>';
				}

				html +=
							'</select>' +
						'</div>' +
						'<div class="scpo-panel-group">' +
							'<label>Price Adjustment Amount (+):</label>' +
							'<input type="number" step="0.01" id="scpo-edit-pricing-amount" value="' + pAmt + '">' +
						'</div>' +
					'</div>';
			}

			// Conditional Logic Accordion (Phase 3)
			field.conditions = field.conditions || { action: 'SHOW', operator: 'ALL', rules: [] };
			html +=
				'<div class="scpo-accordion-header" data-toggle="conditions">Conditional Logic (Show/Hide) ▾</div>' +
				'<div class="scpo-accordion-body" id="scpo-sec-conditions">' +
					'<div class="scpo-panel-group">' +
						'<label>Rule Action:</label>' +
						'<div style="display:flex; gap:6px;">' +
							'<select id="scpo-cond-action" style="flex:1;">' +
								'<option value="SHOW"' + ((field.conditions.action || 'SHOW') === 'SHOW' ? ' selected' : '') + '>SHOW this field if</option>' +
								'<option value="HIDE"' + (field.conditions.action === 'HIDE' ? ' selected' : '') + '>HIDE this field if</option>' +
							'</select>' +
							'<select id="scpo-cond-op" style="width:75px;">' +
								'<option value="ALL"' + ((field.conditions.operator || 'ALL') === 'ALL' ? ' selected' : '') + '>ALL</option>' +
								'<option value="ANY"' + (field.conditions.operator === 'ANY' ? ' selected' : '') + '>ANY</option>' +
							'</select>' +
						'</div>' +
						'<p class="description" style="font-size:11px;">of the following rules match:</p>' +
					'</div>' +
					'<div id="scpo-cond-rules-list">';

			// Find candidate dependency fields
			var candidateFields = [];
			schema.sections.forEach(function(s) {
				if (s.fields) {
					s.fields.forEach(function(f) {
						if (f.id !== field.id) {
							candidateFields.push({ id: f.id, label: f.label || f.id });
						}
					});
				}
			});

			if (!field.conditions.rules || field.conditions.rules.length === 0) {
				html += '<p class="description" style="font-style: italic; margin-bottom: 8px;">No rules set. Field is always visible.</p>';
			} else {
				field.conditions.rules.forEach(function(rule, rIdx) {
					html += '<div class="scpo-rule-row" data-rule-idx="' + rIdx + '">';
					html += '<select class="scpo-rule-target" style="width:110px;">';
					candidateFields.forEach(function(cf) {
						html += '<option value="' + cf.id + '"' + (rule.field_id === cf.id ? ' selected' : '') + '>' + escapeHtml(cf.label) + '</option>';
					});
					html += '</select>';

					html += '<select class="scpo-rule-comp" style="width:95px;">' +
						'<option value="equals"' + (rule.operator === 'equals' ? ' selected' : '') + '>equals</option>' +
						'<option value="not_equals"' + (rule.operator === 'not_equals' ? ' selected' : '') + '>not equals</option>' +
						'<option value="contains"' + (rule.operator === 'contains' ? ' selected' : '') + '>contains</option>' +
						'<option value="does_not_contain"' + (rule.operator === 'does_not_contain' ? ' selected' : '') + '>does not contain</option>' +
						'<option value="greater_than"' + (rule.operator === 'greater_than' ? ' selected' : '') + '>greater than</option>' +
						'<option value="less_than"' + (rule.operator === 'less_than' ? ' selected' : '') + '>less than</option>' +
						'<option value="is_empty"' + (rule.operator === 'is_empty' ? ' selected' : '') + '>is empty</option>' +
						'<option value="is_not_empty"' + (rule.operator === 'is_not_empty' ? ' selected' : '') + '>is not empty</option>' +
					'</select>';

					var hideValInput = (rule.operator === 'is_empty' || rule.operator === 'is_not_empty');
					html += '<input type="text" class="scpo-rule-val" value="' + escapeHtml(rule.value || '') + '" placeholder="Value"' + (hideValInput ? ' style="display:none;"' : '') + '>';
					html += '<button type="button" class="button-link scpo-btn-del-rule" style="color:red;">✕</button>';
					html += '</div>';
				});
			}

			html +=
					'</div>' +
					'<button type="button" class="button button-small" id="scpo-btn-add-rule"' + (candidateFields.length === 0 ? ' disabled' : '') + '>+ Add Condition Rule</button>' +
				'</div>';

			content.innerHTML = html;
			panel.style.display = 'block';

			// Bind inspector controls
			bindContextualEvents(field, secId, fldId, candidateFields);
		}

		function bindContextualEvents(field, secId, fldId, candidateFields) {
			// Accordion toggle
			var accHeaders = document.querySelectorAll('.scpo-accordion-header');
			accHeaders.forEach(function(hdr) {
				hdr.onclick = function() {
					var toggleId = this.getAttribute('data-toggle');
					var body = document.getElementById('scpo-sec-' + toggleId);
					if (body) {
						body.style.display = (body.style.display === 'none' || getComputedStyle(body).display === 'none') ? 'block' : 'none';
					}
				};
			});

			// Field Label
			var lblInput = document.getElementById('scpo-edit-fld-label');
			if (lblInput) {
				lblInput.oninput = function() {
					field.label = this.value;
					isDirty = true;
					renderBuilderCanvas();
				};
			}

			// Field Type
			var typeSelect = document.getElementById('scpo-edit-fld-type');
			if (typeSelect) {
				typeSelect.onchange = function() {
					field.type = this.value;
					isDirty = true;
					renderBuilderCanvas();
					openContextualPanel(secId, fldId);
				};
			}

			// Field Description
			var descInput = document.getElementById('scpo-edit-fld-desc');
			if (descInput) {
				descInput.oninput = function() {
					field.description = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			// Required checkbox
			var reqCb = document.getElementById('scpo-edit-fld-req');
			if (reqCb) {
				reqCb.onchange = function() {
					field.required = this.checked;
					isDirty = true;
					renderBuilderCanvas();
				};
			}

			// Width
			var widthSel = document.getElementById('scpo-edit-fld-width');
			if (widthSel) {
				widthSel.onchange = function() {
					field.width = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			// Max Length
			var maxLenInput = document.getElementById('scpo-edit-fld-maxlength');
			if (maxLenInput) {
				maxLenInput.oninput = function() {
					var val = parseInt(this.value, 10);
					if (!isNaN(val) && val > 0) {
						field.max_length = val;
					} else {
						delete field.max_length;
					}
					isDirty = true;
					syncSchemaToJson();
				};
			}

			// Min / Max number
			var minInput = document.getElementById('scpo-edit-fld-min');
			if (minInput) {
				minInput.oninput = function() {
					var val = parseFloat(this.value);
					if (!isNaN(val)) field.min = val; else delete field.min;
					isDirty = true;
					syncSchemaToJson();
				};
			}
			var maxInput = document.getElementById('scpo-edit-fld-max');
			if (maxInput) {
				maxInput.oninput = function() {
					var val = parseFloat(this.value);
					if (!isNaN(val)) field.max = val; else delete field.max;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			// Add Choice (Select, Multi Select, Radio)
			var addChoiceBtn = document.getElementById('scpo-btn-add-choice');
			if (addChoiceBtn) {
				addChoiceBtn.onclick = function() {
					field.options = field.options || [];
					var newOpt = {
						id: generateStableId('opt'),
						label: 'Choice ' + (field.options.length + 1),
						price: 0
					};
					field.options.push(newOpt);
					isDirty = true;
					openContextualPanel(secId, fldId);
					renderBuilderCanvas();
				};
			}

			// Add Image Choice (Image Select)
			var addImgChoiceBtn = document.getElementById('scpo-btn-add-img-choice');
			if (addImgChoiceBtn) {
				addImgChoiceBtn.onclick = function() {
					field.options = field.options || [];
					var newOpt = {
						id: generateStableId('opt'),
						label: 'Option ' + (field.options.length + 1),
						image_id: 0,
						image_url: '',
						alt: '',
						price: 0
					};
					field.options.push(newOpt);
					isDirty = true;
					openContextualPanel(secId, fldId);
					renderBuilderCanvas();
				};
			}

			// Choices edits (works for both table and image choice rows)
			var choiceLabels = document.querySelectorAll('.scpo-choice-label');
			choiceLabels.forEach(function(input) {
				input.oninput = function() {
					var row = this.closest('tr, .scpo-image-choice-row');
					if (!row) return;
					var optId = row.getAttribute('data-opt-id');
					var opt = field.options.find(function(o) { return o.id === optId; });
					if (opt) {
						opt.label = input.value;
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var choicePrices = document.querySelectorAll('.scpo-choice-price');
			choicePrices.forEach(function(input) {
				input.oninput = function() {
					var row = this.closest('tr, .scpo-image-choice-row');
					if (!row) return;
					var optId = row.getAttribute('data-opt-id');
					var opt = field.options.find(function(o) { return o.id === optId; });
					if (opt) {
						opt.price = parseFloat(input.value) || 0;
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var choiceAlts = document.querySelectorAll('.scpo-choice-alt');
			choiceAlts.forEach(function(input) {
				input.oninput = function() {
					var row = this.closest('tr, .scpo-image-choice-row');
					if (!row) return;
					var optId = row.getAttribute('data-opt-id');
					var opt = field.options.find(function(o) { return o.id === optId; });
					if (opt) {
						opt.alt = input.value;
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var delChoiceBtns = document.querySelectorAll('.scpo-btn-del-choice');
			delChoiceBtns.forEach(function(btn) {
				btn.onclick = function() {
					var row = this.closest('tr, .scpo-image-choice-row');
					if (!row) return;
					var optId = row.getAttribute('data-opt-id');
					field.options = field.options.filter(function(o) { return o.id !== optId; });
					isDirty = true;
					openContextualPanel(secId, fldId);
					renderBuilderCanvas();
				};
			});

			// Media Library Picker Button
			var chooseImgBtns = document.querySelectorAll('.scpo-btn-choose-img');
			chooseImgBtns.forEach(function(btn) {
				btn.onclick = function(e) {
					e.preventDefault();
					var row = this.closest('.scpo-image-choice-row');
					if (!row) return;
					var optId = row.getAttribute('data-opt-id');
					var opt = field.options.find(function(o) { return o.id === optId; });
					if (!opt) return;

					if (typeof window.wp !== 'undefined' && window.wp.media) {
						var customUploader = window.wp.media({
							title: (window.scpo_admin_params && window.scpo_admin_params.i18n && window.scpo_admin_params.i18n.choose_image) || 'Choose Option Image',
							button: {
								text: (window.scpo_admin_params && window.scpo_admin_params.i18n && window.scpo_admin_params.i18n.use_image) || 'Use This Image'
							},
							multiple: false,
							library: { type: 'image' }
						});

						customUploader.on('select', function() {
							var attachment = customUploader.state().get('selection').first().toJSON();
							opt.image_id = attachment.id;
							var bestUrl = (attachment.sizes && attachment.sizes.thumbnail) ? attachment.sizes.thumbnail.url : attachment.url;
							opt.image_url = bestUrl || '';
							opt.alt = attachment.alt || attachment.caption || '';
							if (!opt.label || opt.label.indexOf('Option ') === 0) {
								opt.label = attachment.title || opt.label;
							}

							// Automatically tag attachment to "Simple Product Options" logical folder via AJAX
							if (window.scpo_admin_params && window.scpo_admin_params.ajax_url && window.scpo_admin_params.media_nonce) {
								var formData = 'action=scpo_tag_media&nonce=' + encodeURIComponent(window.scpo_admin_params.media_nonce) + '&attachment_id=' + encodeURIComponent(attachment.id);
								var xhr = new XMLHttpRequest();
								xhr.open('POST', window.scpo_admin_params.ajax_url, true);
								xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
								xhr.send(formData);
							}

							isDirty = true;
							openContextualPanel(secId, fldId);
							renderBuilderCanvas();
						});

						customUploader.open();
					} else {
						// Fallback: prompt for image URL
						var userUrl = prompt('Enter Image URL for this choice:', opt.image_url || '');
						if (userUrl !== null) {
							opt.image_url = userUrl.trim();
							isDirty = true;
							openContextualPanel(secId, fldId);
							renderBuilderCanvas();
						}
					}
				};
			});

			// Checkbox delta
			var cbDeltaInput = document.getElementById('scpo-edit-cb-delta');
			if (cbDeltaInput) {
				cbDeltaInput.oninput = function() {
					var amt = parseFloat(this.value) || 0;
					field.states = field.states || { yes: {}, no: {} };
					field.states.yes.price_delta = amt;
					if (!field.pricing) {
						field.pricing = { category: 'per_unit', mode: 'fixed', amount: amt };
					} else {
						field.pricing.amount = amt;
						if (field.pricing.mode === 'none' && amt > 0) field.pricing.mode = 'fixed';
					}
					isDirty = true;
					renderBuilderCanvas();
				};
			}

			// Pricing controls
			var pricingCat = document.getElementById('scpo-edit-pricing-cat');
			if (pricingCat) {
				pricingCat.onchange = function() {
					field.pricing = field.pricing || { mode: 'none', amount: 0 };
					field.pricing.category = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			var pricingMode = document.getElementById('scpo-edit-pricing-mode');
			if (pricingMode) {
				pricingMode.onchange = function() {
					field.pricing = field.pricing || { category: 'per_unit', amount: 0 };
					field.pricing.mode = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			var pricingAmt = document.getElementById('scpo-edit-pricing-amount');
			if (pricingAmt) {
				pricingAmt.oninput = function() {
					field.pricing = field.pricing || { category: 'per_unit', mode: 'fixed' };
					field.pricing.amount = parseFloat(this.value) || 0;
					isDirty = true;
					renderBuilderCanvas();
				};
			}

			// Conditions controls
			var condAction = document.getElementById('scpo-cond-action');
			if (condAction) {
				condAction.onchange = function() {
					field.conditions.action = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			var condOp = document.getElementById('scpo-cond-op');
			if (condOp) {
				condOp.onchange = function() {
					field.conditions.operator = this.value;
					isDirty = true;
					syncSchemaToJson();
				};
			}

			var addRuleBtn = document.getElementById('scpo-btn-add-rule');
			if (addRuleBtn) {
				addRuleBtn.onclick = function() {
					if (candidateFields.length === 0) return;
					field.conditions.rules = field.conditions.rules || [];
					field.conditions.rules.push({
						field_id: candidateFields[0].id,
						operator: 'equals',
						value: ''
					});
					isDirty = true;
					openContextualPanel(secId, fldId);
					renderBuilderCanvas();
				};
			}

			var ruleTargets = document.querySelectorAll('.scpo-rule-target');
			ruleTargets.forEach(function(sel) {
				sel.onchange = function() {
					var rRow = this.closest('.scpo-rule-row');
					var rIdx = parseInt(rRow.getAttribute('data-rule-idx'), 10);
					if (field.conditions.rules[rIdx]) {
						field.conditions.rules[rIdx].field_id = this.value;
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var ruleComps = document.querySelectorAll('.scpo-rule-comp');
			ruleComps.forEach(function(sel) {
				sel.onchange = function() {
					var rRow = this.closest('.scpo-rule-row');
					var rIdx = parseInt(rRow.getAttribute('data-rule-idx'), 10);
					var op = this.value;
					if (field.conditions.rules[rIdx]) {
						field.conditions.rules[rIdx].operator = op;
						var valInput = rRow.querySelector('.scpo-rule-val');
						if (valInput) {
							valInput.style.display = (op === 'is_empty' || op === 'is_not_empty') ? 'none' : '';
						}
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var ruleVals = document.querySelectorAll('.scpo-rule-val');
			ruleVals.forEach(function(inp) {
				inp.oninput = function() {
					var rRow = this.closest('.scpo-rule-row');
					var rIdx = parseInt(rRow.getAttribute('data-rule-idx'), 10);
					if (field.conditions.rules[rIdx]) {
						field.conditions.rules[rIdx].value = this.value;
						isDirty = true;
						syncSchemaToJson();
					}
				};
			});

			var delRuleBtns = document.querySelectorAll('.scpo-btn-del-rule');
			delRuleBtns.forEach(function(btn) {
				btn.onclick = function() {
					var rRow = this.closest('.scpo-rule-row');
					var rIdx = parseInt(rRow.getAttribute('data-rule-idx'), 10);
					field.conditions.rules.splice(rIdx, 1);
					isDirty = true;
					openContextualPanel(secId, fldId);
					renderBuilderCanvas();
				};
			});
		}

		// 6. Live Customer Form Preview Renderer
		function renderLivePreview() {
			var preview = document.getElementById('scpo-live-preview-container');
			if (!preview) return;
			preview.innerHTML = '';

			if (!schema.sections || schema.sections.length === 0) {
				preview.innerHTML = '<p class="description" style="text-align:center; padding: 20px;">No options created to preview.</p>';
				return;
			}

			var wrapper = document.createElement('div');
			wrapper.className = 'scpo-options-wrapper';
			wrapper.setAttribute('data-base-price', '100.00');
			wrapper.setAttribute('style', 'background:#fff; border:1px solid #dcdcde;');

				schema.sections.forEach(function(sec) {
					var s = document.createElement('div');
					var secMode = sec.selection_mode || 'multiple';
					var singleGroupAttr = secMode === 'single' ? ' data-scpo-single-choice-group="' + escapeHtml(sec.id) + '"' : '';
				s.className = 'scpo-section scpo-section-mode-' + secMode;
				s.setAttribute('data-selection-mode', secMode);
				if (sec.title) {
					var st = document.createElement('h4');
					st.className = 'scpo-section-title';
					st.textContent = sec.title;
					s.appendChild(st);
				}
				if (sec.description) {
					var sd = document.createElement('p');
					sd.className = 'scpo-section-description';
					sd.textContent = sec.description;
					s.appendChild(sd);
				}

				if (sec.fields) {
					sec.fields.forEach(function(fld) {
						var row = document.createElement('div');
						row.className = 'scpo-field-row scpo-field-type-' + fld.type;
						row.setAttribute('data-field-id', fld.id);
						if (fld.conditions) {
							row.setAttribute('data-conditions', JSON.stringify(fld.conditions));
						}

						var pTag = '';
						if (fld.pricing && parseFloat(fld.pricing.amount) > 0) {
							pTag = ' (+€' + parseFloat(fld.pricing.amount).toFixed(2) + ')';
						}

						if (fld.type !== 'checkbox') {
							var lbl = document.createElement('label');
							lbl.className = 'scpo-field-label';
							lbl.innerHTML = escapeHtml(fld.label) + (fld.required ? ' <span style="color:red;">*</span>' : '') + pTag;
							row.appendChild(lbl);
						}
						if (fld.description) {
							var fd = document.createElement('p');
							fd.className = 'scpo-field-description';
							fd.textContent = fld.description;
							row.appendChild(fd);
						}

						if (fld.type === 'text') {
							row.innerHTML += '<input type="text" class="scpo-input" placeholder="Type here...">';
						} else if (fld.type === 'textarea') {
							row.innerHTML += '<textarea class="scpo-input" rows="2"></textarea>';
						} else if (fld.type === 'number') {
							row.innerHTML += '<input type="number" class="scpo-input">';
						} else if (fld.type === 'select') {
							var selHtml = '<select class="scpo-input"><option value="">— Choose —</option>';
							if (fld.options) {
								fld.options.forEach(function(opt) {
									var oPrice = opt.price > 0 ? ' (+€' + parseFloat(opt.price).toFixed(2) + ')' : '';
									selHtml += '<option value="' + opt.id + '">' + escapeHtml(opt.label) + oPrice + '</option>';
								});
							}
							selHtml += '</select>';
							row.innerHTML += selHtml;
						} else if (fld.type === 'radio') {
							if (fld.options) {
								fld.options.forEach(function(opt) {
									var oPrice = opt.price > 0 ? ' (+€' + parseFloat(opt.price).toFixed(2) + ')' : '';
									row.innerHTML += '<label><input type="radio" name="' + fld.id + '" value="' + opt.id + '"' + singleGroupAttr + '> ' + escapeHtml(opt.label) + oPrice + '</label><br>';
								});
							}
						} else if (fld.type === 'checkbox') {
							row.innerHTML += '<label><input type="checkbox" value="yes"' + singleGroupAttr + '> ' + escapeHtml(fld.label) + (fld.required ? ' *' : '') + pTag + '</label>';
						} else if (fld.type === 'date') {
							row.innerHTML += '<input type="date" class="scpo-input">';
						} else if (fld.type === 'multiselect') {
							if (fld.options) {
								var msHtml = '<div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">';
								fld.options.forEach(function(opt) {
									var oPrice = opt.price > 0 ? ' (+€' + parseFloat(opt.price).toFixed(2) + ')' : '';
									msHtml += '<label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" name="' + fld.id + '[]" value="' + opt.id + '"> ' + escapeHtml(opt.label) + oPrice + '</label>';
								});
								msHtml += '</div>';
								row.innerHTML += msHtml;
							}
						} else if (fld.type === 'imageselect') {
							if (fld.options) {
								var isMulti = (secMode === 'multiple');
								var inputType = isMulti ? 'checkbox' : 'radio';
								var inputName = isMulti ? fld.id + '[]' : fld.id;
								var imgGrid = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px; margin-top:6px;">';
								fld.options.forEach(function(opt) {
									var oPrice = opt.price > 0 ? '<span style="color:#2563eb; font-size:11px; font-weight:600;">+€' + parseFloat(opt.price).toFixed(2) + '</span>' : '';
									var imgBox = opt.image_url
										? '<img src="' + escapeHtml(opt.image_url) + '" style="width:100%; height:75px; object-fit:cover; border-radius:4px; display:block;">'
										: '<div style="height:75px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; border-radius:4px; font-size:24px;">🖼️</div>';

									imgGrid +=
										'<label style="display:flex; flex-direction:column; border:2px solid #e2e8f0; border-radius:6px; overflow:hidden; background:#fff; cursor:pointer; text-align:center; padding:6px; transition:border-color 0.2s;">' +
										'<input type="' + inputType + '" name="' + inputName + '" value="' + opt.id + '"' + singleGroupAttr + ' style="margin:0 auto 4px auto;">' +
										imgBox +
										'<span style="font-size:12px; font-weight:600; margin-top:4px; color:#1e293b;">' + escapeHtml(opt.label) + '</span>' +
										oPrice +
										'</label>';
								});
								imgGrid += '</div>';
								row.innerHTML += imgGrid;
							}
						}

						s.appendChild(row);
					});
				}
				wrapper.appendChild(s);
			});

			preview.appendChild(wrapper);
			wrapper.addEventListener('change', function(e) {
				var input = e.target;
				if (!input.matches('input[data-scpo-single-choice-group]') || !input.checked) return;
				var groupId = input.getAttribute('data-scpo-single-choice-group');
				wrapper.querySelectorAll('input[data-scpo-single-choice-group]').forEach(function(other) {
					if (other !== input && other.getAttribute('data-scpo-single-choice-group') === groupId) other.checked = false;
				});
			});
		}

		// Initial Canvas Rendering
		renderBuilderCanvas();

		// Safe unsaved changes prompt on navigation.
		window.addEventListener('beforeunload', function(e) {
			if (isDirty) {
				e.preventDefault();
				e.returnValue = '';
			}
		});

		// Submit form sync
		var editorForm = document.getElementById('scpo-editor-form');
		if (editorForm && typeof editorForm.addEventListener === 'function') {
			editorForm.addEventListener('submit', function() {
				isDirty = false;
				syncSchemaToJson();
			});
		}
	}

	// Multi-hook lifecycle setup to guarantee execution on real WordPress admin
	function setupLifecycle() {
		var hasRun = false;
		function run() {
			if (hasRun) return;
			hasRun = true;
			initBuilder();
		}

		// 1. If script is loaded after DOMContentLoaded (readyState is interactive or complete)
		if (document.readyState === 'complete' || document.readyState === 'interactive') {
			setTimeout(run, 0);
		} else {
			// 2. DOM still loading
			document.addEventListener('DOMContentLoaded', run);
		}

		// 3. Fallback: jQuery ready if available
		if (typeof window.jQuery !== 'undefined') {
			window.jQuery(function() {
				run();
			});
		}

		// 4. Fallback: window load
		window.addEventListener('load', run);
	}

	setupLifecycle();

})(window, document);
