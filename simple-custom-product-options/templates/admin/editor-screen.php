<?php
/**
 * Admin Editor Screen Template (Phase 3 Visual Drag-and-Drop Builder)
 *
 * @package SimpleCustomProductOptions\Admin
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$set_id = isset( $_GET['set_id'] ) ? absint( $_GET['set_id'] ) : 0;
$title  = '';
$status = 'publish';
$config = array(
	'$schema_version' => '1.0.0',
	'id'              => 'set_' . bin2hex( random_bytes( 4 ) ),
	'title'           => '',
	'sections'        => array(),
);
$assignment = array(
	'type'        => 'specific_products',
	'product_ids' => array(),
);

if ( $set_id > 0 ) {
	$post = get_post( $set_id );
	if ( $post && 'scpo_option_set' === $post->post_type ) {
		$title      = $post->post_title;
		$status     = $post->post_status;
		$saved_conf = get_post_meta( $set_id, '_scpo_config', true );
		if ( is_array( $saved_conf ) ) {
			$config = $saved_conf;
		}
		$saved_assign = get_post_meta( $set_id, '_scpo_assignment', true );
		if ( is_array( $saved_assign ) ) {
			$assignment = $saved_assign;
		}
	}
}

$json_pretty = wp_json_encode( $config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

$messages = array(
	'saved'              => __( 'Option set saved successfully.', 'simple-custom-product-options' ),
	'saved_no_products'  => __( 'Option set saved, but no valid WooCommerce products are currently assigned. This option set will not appear in the storefront until assigned to at least one product.', 'simple-custom-product-options' ),
);
$current_msg_key = isset( $_GET['message'] ) ? sanitize_key( $_GET['message'] ) : '';
$current_message = isset( $messages[ $current_msg_key ] ) ? $messages[ $current_msg_key ] : '';
$is_warning      = 'saved_no_products' === $current_msg_key;
?>

<div class="wrap scpo-admin-wrap">
	<h1 class="wp-heading-inline">
		<?php echo $set_id > 0 ? esc_html__( 'Edit Option Set', 'simple-custom-product-options' ) : esc_html__( 'Add New Option Set', 'simple-custom-product-options' ); ?>
	</h1>
	<a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets' ), admin_url( 'admin.php' ) ) ); ?>" class="page-title-action">
		&larr; <?php esc_html_e( 'Back to List', 'simple-custom-product-options' ); ?>
	</a>
	<hr class="wp-header-end">

	<?php if ( $current_message ) : ?>
		<div class="notice <?php echo $is_warning ? 'notice-warning' : 'notice-success'; ?> is-dismissible">
			<p><strong><?php echo esc_html( $current_message ); ?></strong></p>
		</div>
	<?php endif; ?>

	<!-- Phase 3 Mode Navigation Tabs -->
	<div class="scpo-builder-tabs">
		<button type="button" class="scpo-tab-btn active" data-tab="visual">
			<span class="dashicons dashicons-layout" style="vertical-align: text-top; font-size: 16px;"></span>
			<?php esc_html_e( 'Visual Form Builder', 'simple-custom-product-options' ); ?>
		</button>
		<button type="button" class="scpo-tab-btn" data-tab="preview">
			<span class="dashicons dashicons-visibility" style="vertical-align: text-top; font-size: 16px;"></span>
			<?php esc_html_e( 'Live Customer Preview', 'simple-custom-product-options' ); ?>
		</button>
		<button type="button" class="scpo-tab-btn" data-tab="json">
			<span class="dashicons dashicons-editor-code" style="vertical-align: text-top; font-size: 16px;"></span>
			<?php esc_html_e( 'Advanced JSON', 'simple-custom-product-options' ); ?>
		</button>
	</div>

	<form method="post" action="<?php echo esc_url( admin_url( 'admin.php?page=scpo-option-sets' ) ); ?>" id="scpo-editor-form">
		<?php wp_nonce_field( 'scpo_save_option_set', 'scpo_nonce' ); ?>
		<input type="hidden" name="scpo_action" value="save_option_set">
		<input type="hidden" name="set_id" value="<?php echo esc_attr( $set_id ); ?>">

		<div class="scpo-editor-layout">
			<!-- Main Column -->
			<div class="scpo-editor-main">
				<!-- Basic Details Card -->
				<div class="scpo-card">
					<h2><?php esc_html_e( 'Option Set Details', 'simple-custom-product-options' ); ?></h2>
					<table class="form-table">
						<tr>
							<th scope="row"><label for="scpo_title"><?php esc_html_e( 'Option Set Name', 'simple-custom-product-options' ); ?> *</label></th>
							<td>
								<input type="text" name="scpo_title" id="scpo_title" class="regular-text" value="<?php echo esc_attr( $title ); ?>" placeholder="<?php esc_attr_e( 'e.g. Custom Gift Options', 'simple-custom-product-options' ); ?>" required>
								<p class="description"><?php esc_html_e( 'Internal name for identifying this group of options in admin.', 'simple-custom-product-options' ); ?></p>
							</td>
						</tr>
					</table>
				</div>

				<!-- TAB 1: VISUAL CANVAS -->
				<div id="scpo-tab-visual" class="scpo-tab-content">
					<div class="scpo-card">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
							<div>
								<h2 style="border: none; margin: 0; padding: 0;"><?php esc_html_e( 'Option Canvas', 'simple-custom-product-options' ); ?></h2>
								<p class="description" style="margin: 2px 0 0 0;"><?php esc_html_e( 'Build sections and fields using the visual controls below.', 'simple-custom-product-options' ); ?></p>
							</div>
							<button type="button" class="button button-primary" id="scpo-btn-add-section">
								+ <?php esc_html_e( 'Add Section', 'simple-custom-product-options' ); ?>
							</button>
						</div>

						<!-- Empty State & 3-Step Guide (shown when 0 sections) -->
						<div class="scpo-empty-state" id="scpo-empty-state" style="display: none;">
							<div class="scpo-empty-state-icon">📦</div>
							<h3><?php esc_html_e( 'No option fields created yet', 'simple-custom-product-options' ); ?></h3>
							<p><?php esc_html_e( 'Create personalized options like gift wrapping, custom text engravings, date selectors, or dropdown choices.', 'simple-custom-product-options' ); ?></p>
							<div class="scpo-guide-steps">
								<div class="scpo-step-box">
									<div class="scpo-step-num">1</div>
									<div class="scpo-step-title"><?php esc_html_e( 'Add a Section', 'simple-custom-product-options' ); ?></div>
									<div class="scpo-step-desc"><?php esc_html_e( 'Group related fields together.', 'simple-custom-product-options' ); ?></div>
								</div>
								<div class="scpo-step-box">
									<div class="scpo-step-num">2</div>
									<div class="scpo-step-title"><?php esc_html_e( 'Add Options', 'simple-custom-product-options' ); ?></div>
									<div class="scpo-step-desc"><?php esc_html_e( 'Text, checkboxes, dropdowns, etc.', 'simple-custom-product-options' ); ?></div>
								</div>
								<div class="scpo-step-box">
									<div class="scpo-step-num">3</div>
									<div class="scpo-step-title"><?php esc_html_e( 'Assign Products', 'simple-custom-product-options' ); ?></div>
									<div class="scpo-step-desc"><?php esc_html_e( 'Publish to store catalog.', 'simple-custom-product-options' ); ?></div>
								</div>
							</div>
							<button type="button" class="button button-primary button-hero" id="scpo-empty-add-section-btn">
								+ <?php esc_html_e( 'Add Your First Section', 'simple-custom-product-options' ); ?>
							</button>
						</div>

						<!-- Dynamic Sections Container -->
						<div class="scpo-sections-canvas" id="scpo-sections-canvas"></div>
					</div>
				</div>

				<!-- TAB 2: LIVE CUSTOMER PREVIEW -->
				<div id="scpo-tab-preview" class="scpo-tab-content" style="display: none;">
					<div class="scpo-card scpo-preview-card">
						<div class="scpo-preview-banner">
							<span><?php esc_html_e( 'Live Customer Form Preview (synchronized with current edits)', 'simple-custom-product-options' ); ?></span>
						</div>
						<div id="scpo-live-preview-container"></div>
					</div>
				</div>

				<!-- TAB 3: ADVANCED JSON ESCAPE HATCH -->
				<div id="scpo-tab-json" class="scpo-tab-content" style="display: none;">
					<div class="scpo-card">
						<h2><?php esc_html_e( 'Advanced JSON Schema (Escape Hatch)', 'simple-custom-product-options' ); ?></h2>
						<p class="description">
							<?php esc_html_e( 'Direct JSON configuration. Edits made in the Visual Builder automatically sync here before save.', 'simple-custom-product-options' ); ?>
						</p>
						<textarea name="scpo_config_json" id="scpo_config_json" class="large-text code" rows="18"><?php echo esc_textarea( $json_pretty ); ?></textarea>
						<div id="scpo-json-validation-notice" style="margin-top: 8px;"></div>
					</div>
				</div>
			</div>

			<!-- Sidebar / Contextual Settings Panel -->
			<div class="scpo-editor-sidebar">
				<!-- Contextual Inspector (Selection Settings) -->
				<div class="scpo-card" id="scpo-contextual-panel" style="display: none;">
					<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px;">
						<h3 style="margin: 0; border: none; padding: 0;" id="scpo-panel-title"><?php esc_html_e( 'Field Settings', 'simple-custom-product-options' ); ?></h3>
						<button type="button" class="button-link" id="scpo-close-panel" title="Close Panel">&times;</button>
					</div>
					<div id="scpo-panel-content"></div>
				</div>

				<!-- Status & Actions Card -->
				<div class="scpo-card">
					<h3><?php esc_html_e( 'Publish & Save', 'simple-custom-product-options' ); ?></h3>
					<div class="scpo-sidebar-field">
						<label for="scpo_status"><strong><?php esc_html_e( 'Status:', 'simple-custom-product-options' ); ?></strong></label>
						<select name="scpo_status" id="scpo_status" style="width: 100%; margin-top: 5px;">
							<option value="publish" <?php selected( $status, 'publish' ); ?>><?php esc_html_e( 'Active (Publish)', 'simple-custom-product-options' ); ?></option>
							<option value="draft" <?php selected( $status, 'draft' ); ?>><?php esc_html_e( 'Draft (Inactive)', 'simple-custom-product-options' ); ?></option>
						</select>
					</div>

					<div style="margin-top: 15px; border-top: 1px solid #ddd; padding-top: 15px;">
						<button type="submit" class="button button-primary button-large" style="width: 100%;">
							<?php echo $set_id > 0 ? esc_html__( 'Update Option Set', 'simple-custom-product-options' ) : esc_html__( 'Create Option Set', 'simple-custom-product-options' ); ?>
						</button>
					</div>
				</div>

				<!-- Product Assignment Card -->
				<div class="scpo-card">
					<h3><?php esc_html_e( 'Product Assignment', 'simple-custom-product-options' ); ?></h3>
					<p class="description"><?php esc_html_e( 'Specify which WooCommerce products display this option set. Only valid published product IDs are accepted.', 'simple-custom-product-options' ); ?></p>
					<input type="hidden" name="scpo_assignment[type]" value="specific_products">
					<label for="scpo_product_ids"><strong><?php esc_html_e( 'Product IDs (Comma-separated):', 'simple-custom-product-options' ); ?></strong></label>
					<input type="text" name="scpo_assignment[product_ids]" id="scpo_product_ids" class="widefat" value="<?php echo esc_attr( implode( ', ', $assignment['product_ids'] ) ); ?>" placeholder="e.g. 101, 102, 105">
					<p class="description" style="margin-top: 4px; font-size: 11px;">
						<?php esc_html_e( 'Leave empty only if keeping in Draft status.', 'simple-custom-product-options' ); ?>
					</p>
				</div>
			</div>
		</div>
	</form>
</div>
