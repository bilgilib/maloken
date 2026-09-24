<?php
/**
 * Admin List Screen Template
 *
 * @package SimpleCustomProductOptions\Admin
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$status_filter = isset( $_GET['post_status'] ) ? sanitize_key( $_GET['post_status'] ) : 'all';

$args = array(
	'post_type'      => 'scpo_option_set',
	'posts_per_page' => 50,
	'orderby'        => 'modified',
	'order'          => 'DESC',
);

if ( 'trash' === $status_filter ) {
	$args['post_status'] = 'trash';
} elseif ( 'draft' === $status_filter ) {
	$args['post_status'] = 'draft';
} elseif ( 'publish' === $status_filter ) {
	$args['post_status'] = 'publish';
} else {
	$args['post_status'] = array( 'publish', 'draft' );
}

$query = new WP_Query( $args );

// Counts.
$count_publish = wp_count_posts( 'scpo_option_set' )->publish;
$count_draft   = wp_count_posts( 'scpo_option_set' )->draft;
$count_trash   = wp_count_posts( 'scpo_option_set' )->trash;
$count_all     = $count_publish + $count_draft;

$messages = array(
	'saved'      => __( 'Option set saved successfully.', 'simple-custom-product-options' ),
	'duplicated' => __( 'Option set duplicated successfully.', 'simple-custom-product-options' ),
	'deleted'    => __( 'Option set deleted permanently.', 'simple-custom-product-options' ),
	'trashed'    => __( 'Option set moved to the Trash.', 'simple-custom-product-options' ),
	'restored'   => __( 'Option set restored from Trash.', 'simple-custom-product-options' ),
);
$current_message = isset( $_GET['message'] ) && isset( $messages[ $_GET['message'] ] ) ? $messages[ $_GET['message'] ] : '';
?>

<div class="wrap scpo-admin-wrap">
	<h1 class="wp-heading-inline"><?php esc_html_e( 'Product Option Sets', 'simple-custom-product-options' ); ?></h1>
	<a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'add' ), admin_url( 'admin.php' ) ) ); ?>" class="page-title-action">
		<?php esc_html_e( 'Add New Set', 'simple-custom-product-options' ); ?>
	</a>
	<hr class="wp-header-end">

	<?php if ( $current_message ) : ?>
		<div class="notice notice-success is-dismissible">
			<p><?php echo esc_html( $current_message ); ?></p>
		</div>
	<?php endif; ?>

	<ul class="subsubsub">
		<li class="all"><a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets' ), admin_url( 'admin.php' ) ) ); ?>" class="<?php echo 'all' === $status_filter ? 'current' : ''; ?>">All <span class="count">(<?php echo esc_html( $count_all ); ?>)</span></a> |</li>
		<li class="publish"><a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'post_status' => 'publish' ), admin_url( 'admin.php' ) ) ); ?>" class="<?php echo 'publish' === $status_filter ? 'current' : ''; ?>">Active <span class="count">(<?php echo esc_html( $count_publish ); ?>)</span></a> |</li>
		<li class="draft"><a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'post_status' => 'draft' ), admin_url( 'admin.php' ) ) ); ?>" class="<?php echo 'draft' === $status_filter ? 'current' : ''; ?>">Draft <span class="count">(<?php echo esc_html( $count_draft ); ?>)</span></a> |</li>
		<li class="trash"><a href="<?php echo esc_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'post_status' => 'trash' ), admin_url( 'admin.php' ) ) ); ?>" class="<?php echo 'trash' === $status_filter ? 'current' : ''; ?>">Trash <span class="count">(<?php echo esc_html( $count_trash ); ?>)</span></a></li>
	</ul>

	<table class="wp-list-table widefat fixed striped table-view-list posts">
		<thead>
			<tr>
				<th scope="col" class="manage-column column-title column-primary"><?php esc_html_e( 'Name', 'simple-custom-product-options' ); ?></th>
				<th scope="col" class="manage-column column-status" style="width: 120px;"><?php esc_html_e( 'Status', 'simple-custom-product-options' ); ?></th>
				<th scope="col" class="manage-column column-applied" style="width: 220px;"><?php esc_html_e( 'Applied Products', 'simple-custom-product-options' ); ?></th>
				<th scope="col" class="manage-column column-fields" style="width: 100px;"><?php esc_html_e( 'Fields', 'simple-custom-product-options' ); ?></th>
				<th scope="col" class="manage-column column-date" style="width: 180px;"><?php esc_html_e( 'Last Modified', 'simple-custom-product-options' ); ?></th>
			</tr>
		</thead>
		<tbody>
			<?php if ( $query->have_posts() ) : ?>
				<?php while ( $query->have_posts() ) : $query->the_post();
					$set_id     = get_the_ID();
					$post_status = get_post_status( $set_id );
					$config     = get_post_meta( $set_id, '_scpo_config', true );
					$assignment = get_post_meta( $set_id, '_scpo_assignment', true );

					// Count fields.
					$fields_count = 0;
					if ( ! empty( $config['sections'] ) && is_array( $config['sections'] ) ) {
						foreach ( $config['sections'] as $sec ) {
							if ( ! empty( $sec['fields'] ) && is_array( $sec['fields'] ) ) {
								$fields_count += count( $sec['fields'] );
							}
						}
					}

					// Products applied badge.
					$applied_count = ! empty( $assignment['product_ids'] ) ? count( $assignment['product_ids'] ) : 0;
					$applied_text  = $applied_count > 0 ? sprintf( _n( '%d Product', '%d Products', $applied_count, 'simple-custom-product-options' ), $applied_count ) : __( 'None (Placeholder)', 'simple-custom-product-options' );

					$edit_url      = add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'edit', 'set_id' => $set_id ), admin_url( 'admin.php' ) );
					$duplicate_url = wp_nonce_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'duplicate', 'set_id' => $set_id ), admin_url( 'admin.php' ) ), 'scpo_duplicate_' . $set_id );
					$trash_url     = wp_nonce_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'trash', 'set_id' => $set_id ), admin_url( 'admin.php' ) ), 'scpo_trash_' . $set_id );
					$delete_url    = wp_nonce_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'delete', 'set_id' => $set_id ), admin_url( 'admin.php' ) ), 'scpo_delete_' . $set_id );
					$restore_url   = wp_nonce_url( add_query_arg( array( 'page' => 'scpo-option-sets', 'action' => 'restore', 'set_id' => $set_id ), admin_url( 'admin.php' ) ), 'scpo_restore_' . $set_id );
				?>
					<tr>
						<td class="title column-title has-row-actions column-primary">
							<strong>
								<?php if ( 'trash' !== $post_status ) : ?>
									<a class="row-title" href="<?php echo esc_url( $edit_url ); ?>"><?php echo esc_html( get_the_title() ); ?></a>
								<?php else : ?>
									<?php echo esc_html( get_the_title() ); ?>
								<?php endif; ?>
							</strong>
							<div class="row-actions">
								<?php if ( 'trash' !== $post_status ) : ?>
									<span class="edit"><a href="<?php echo esc_url( $edit_url ); ?>"><?php esc_html_e( 'Edit', 'simple-custom-product-options' ); ?></a> | </span>
									<span class="duplicate"><a href="<?php echo esc_url( $duplicate_url ); ?>"><?php esc_html_e( 'Duplicate', 'simple-custom-product-options' ); ?></a> | </span>
									<span class="export" style="color: #888;"><?php esc_html_e( 'Export (Phase 6)', 'simple-custom-product-options' ); ?> | </span>
									<span class="trash"><a href="<?php echo esc_url( $trash_url ); ?>" class="submitdelete"><?php esc_html_e( 'Trash', 'simple-custom-product-options' ); ?></a></span>
								<?php else : ?>
									<span class="restore"><a href="<?php echo esc_url( $restore_url ); ?>"><?php esc_html_e( 'Restore', 'simple-custom-product-options' ); ?></a> | </span>
									<span class="delete"><a href="<?php echo esc_url( $delete_url ); ?>" class="submitdelete"><?php esc_html_e( 'Delete Permanently', 'simple-custom-product-options' ); ?></a></span>
								<?php endif; ?>
							</div>
						</td>
						<td class="column-status">
							<?php if ( 'publish' === $post_status ) : ?>
								<span class="scpo-badge scpo-badge-active"><?php esc_html_e( 'Active', 'simple-custom-product-options' ); ?></span>
							<?php elseif ( 'draft' === $post_status ) : ?>
								<span class="scpo-badge scpo-badge-draft"><?php esc_html_e( 'Draft', 'simple-custom-product-options' ); ?></span>
							<?php else : ?>
								<span class="scpo-badge scpo-badge-trash"><?php esc_html_e( 'Trashed', 'simple-custom-product-options' ); ?></span>
							<?php endif; ?>
						</td>
						<td class="column-applied">
							<span class="scpo-tag"><?php echo esc_html( $applied_text ); ?></span>
						</td>
						<td class="column-fields">
							<strong><?php echo esc_html( $fields_count ); ?></strong>
						</td>
						<td class="column-date">
							<?php echo esc_html( get_the_modified_date( 'Y-m-d H:i' ) ); ?>
						</td>
					</tr>
				<?php endwhile; wp_reset_postdata(); ?>
			<?php else : ?>
				<tr>
					<td colspan="5"><?php esc_html_e( 'No option sets found. Click "Add New Set" to create one.', 'simple-custom-product-options' ); ?></td>
				</tr>
			<?php endif; ?>
		</tbody>
	</table>
</div>
