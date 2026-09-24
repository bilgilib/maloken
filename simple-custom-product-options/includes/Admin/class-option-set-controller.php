<?php
/**
 * Option Set Controller (CRUD, Nonce, Actions)
 *
 * @package SimpleCustomProductOptions\Admin
 */

namespace SimpleCustomProductOptions\Admin;

use SimpleCustomProductOptions\Utils\Sanitizer;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Option_Set_Controller {

	/**
	 * Constructor.
	 */
	public function __construct() {
		add_action( 'admin_init', array( $this, 'handle_actions' ) );
	}

	/**
	 * Handle admin actions: save, duplicate, delete, trash, untrash.
	 */
	public function handle_actions() {
		if ( ! is_admin() || ! isset( $_REQUEST['page'] ) || 'scpo-option-sets' !== $_REQUEST['page'] ) {
			return;
		}

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		// Action: Save or Update.
		if ( isset( $_POST['scpo_action'] ) && 'save_option_set' === $_POST['scpo_action'] ) {
			$this->save_option_set();
			return;
		}

		// Action: Duplicate.
		if ( isset( $_GET['action'] ) && 'duplicate' === $_GET['action'] && isset( $_GET['set_id'] ) ) {
			$this->duplicate_option_set( absint( $_GET['set_id'] ) );
			return;
		}

		// Action: Delete permanently.
		if ( isset( $_GET['action'] ) && 'delete' === $_GET['action'] && isset( $_GET['set_id'] ) ) {
			$this->delete_option_set( absint( $_GET['set_id'] ) );
			return;
		}

		// Action: Trash.
		if ( isset( $_GET['action'] ) && 'trash' === $_GET['action'] && isset( $_GET['set_id'] ) ) {
			$this->trash_option_set( absint( $_GET['set_id'] ) );
			return;
		}

		// Action: Restore.
		if ( isset( $_GET['action'] ) && 'restore' === $_GET['action'] && isset( $_GET['set_id'] ) ) {
			$this->restore_option_set( absint( $_GET['set_id'] ) );
			return;
		}
	}

	/**
	 * Save or update option set.
	 */
	protected function save_option_set() {
		check_admin_referer( 'scpo_save_option_set', 'scpo_nonce' );

		$post_id     = isset( $_POST['set_id'] ) ? absint( $_POST['set_id'] ) : 0;
		$title       = isset( $_POST['scpo_title'] ) ? sanitize_text_field( wp_unslash( $_POST['scpo_title'] ) ) : __( 'Untitled Option Set', 'simple-custom-product-options' );
		$status      = isset( $_POST['scpo_status'] ) && in_array( $_POST['scpo_status'], array( 'publish', 'draft' ), true ) ? sanitize_key( $_POST['scpo_status'] ) : 'publish';
		$raw_config  = isset( $_POST['scpo_config_json'] ) ? wp_unslash( $_POST['scpo_config_json'] ) : '';
		$assignment  = isset( $_POST['scpo_assignment'] ) ? wp_unslash( $_POST['scpo_assignment'] ) : array();

		// Strictly validate schema configuration. Never silently save invalid or partially sanitized schemas.
		$sanitized_config = Sanitizer::validate_and_sanitize_config( $raw_config );
		if ( is_wp_error( $sanitized_config ) ) {
			wp_die(
				'<h1>' . esc_html__( 'Option Set Schema Error', 'simple-custom-product-options' ) . '</h1>' .
				'<p><strong>' . esc_html( $sanitized_config->get_error_message() ) . '</strong></p>' .
				'<p><a href="javascript:history.back()">&larr; ' . esc_html__( 'Go back and edit configuration', 'simple-custom-product-options' ) . '</a></p>',
				esc_html__( 'Validation Failed', 'simple-custom-product-options' ),
				array( 'back_link' => true )
			);
		}
		$sanitized_config['title'] = $title;

		// Strictly validate assignment input. Rejects non-numeric, missing, non-product, and non-published IDs.
		$sanitized_assignment = Sanitizer::validate_and_sanitize_assignment( $assignment );
		if ( is_wp_error( $sanitized_assignment ) ) {
			wp_die(
				'<h1>' . esc_html__( 'Product Assignment Error', 'simple-custom-product-options' ) . '</h1>' .
				'<p><strong>' . esc_html( $sanitized_assignment->get_error_message() ) . '</strong></p>' .
				'<p><a href="javascript:history.back()">&larr; ' . esc_html__( 'Go back and edit product IDs', 'simple-custom-product-options' ) . '</a></p>',
				esc_html__( 'Invalid Product Assignment', 'simple-custom-product-options' ),
				array( 'back_link' => true )
			);
		}

		$post_data = array(
			'post_title'  => $title,
			'post_status' => $status,
			'post_type'   => Option_Set_CPT::POST_TYPE,
		);

		if ( $post_id > 0 ) {
			$post_data['ID'] = $post_id;
			$updated_id = wp_update_post( $post_data );
		} else {
			$updated_id = wp_insert_post( $post_data );
		}

		if ( is_wp_error( $updated_id ) || ! $updated_id ) {
			wp_die( esc_html__( 'Failed to save option set.', 'simple-custom-product-options' ) );
		}

		// Save post meta.
		update_post_meta( $updated_id, '_scpo_schema_version', '1.0.0' );
		update_post_meta( $updated_id, '_scpo_config', $sanitized_config );
		update_post_meta( $updated_id, '_scpo_assignment', $sanitized_assignment );

		$msg = 'saved';
		if ( 'publish' === $status && 'specific_products' === $sanitized_assignment['type'] && empty( $sanitized_assignment['product_ids'] ) ) {
			$msg = 'saved_no_products';
		}

		// Redirect to edit screen with success notice.
		$redirect_url = add_query_arg(
			array(
				'page'    => 'scpo-option-sets',
				'action'  => 'edit',
				'set_id'  => $updated_id,
				'message' => $msg,
			),
			admin_url( 'admin.php' )
		);

		wp_safe_redirect( $redirect_url );
		exit;
	}

	/**
	 * Duplicate an option set with fresh stable IDs.
	 *
	 * @param int $post_id Source post ID.
	 */
	protected function duplicate_option_set( $post_id ) {
		check_admin_referer( 'scpo_duplicate_' . $post_id );

		$source_post = get_post( $post_id );
		if ( ! $source_post || Option_Set_CPT::POST_TYPE !== $source_post->post_type ) {
			wp_die( esc_html__( 'Invalid option set.', 'simple-custom-product-options' ) );
		}

		$config     = get_post_meta( $post_id, '_scpo_config', true );
		$assignment = get_post_meta( $post_id, '_scpo_assignment', true );

		if ( ! is_array( $config ) ) {
			$config = array();
		}

		// Regenerate set ID and section/field IDs to ensure uniqueness while preserving structure.
		$config['id']    = 'set_' . bin2hex( random_bytes( 4 ) );
		$config['title'] = sprintf( __( '%s (Copy)', 'simple-custom-product-options' ), $source_post->post_title );

		if ( ! empty( $config['sections'] ) && is_array( $config['sections'] ) ) {
			foreach ( $config['sections'] as &$section ) {
				$section['id'] = 'sec_' . bin2hex( random_bytes( 4 ) );
				if ( ! empty( $section['fields'] ) && is_array( $section['fields'] ) ) {
					foreach ( $section['fields'] as &$field ) {
						$field['id'] = 'fld_' . bin2hex( random_bytes( 4 ) );
					}
				}
			}
		}

		$new_post_id = wp_insert_post( array(
			'post_title'  => $config['title'],
			'post_status' => 'draft', // Duplicates start as draft for safety
			'post_type'   => Option_Set_CPT::POST_TYPE,
		) );

		if ( $new_post_id ) {
			update_post_meta( $new_post_id, '_scpo_schema_version', '1.0.0' );
			update_post_meta( $new_post_id, '_scpo_config', $config );
			update_post_meta( $new_post_id, '_scpo_assignment', $assignment );
		}

		wp_safe_redirect( add_query_arg( array( 'page' => 'scpo-option-sets', 'message' => 'duplicated' ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * Permanently delete option set.
	 *
	 * @param int $post_id Target post ID.
	 */
	protected function delete_option_set( $post_id ) {
		check_admin_referer( 'scpo_delete_' . $post_id );

		$post = get_post( $post_id );
		if ( $post && Option_Set_CPT::POST_TYPE === $post->post_type ) {
			wp_delete_post( $post_id, true );
		}

		wp_safe_redirect( add_query_arg( array( 'page' => 'scpo-option-sets', 'message' => 'deleted' ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * Trash option set.
	 *
	 * @param int $post_id Target post ID.
	 */
	protected function trash_option_set( $post_id ) {
		check_admin_referer( 'scpo_trash_' . $post_id );

		$post = get_post( $post_id );
		if ( $post && Option_Set_CPT::POST_TYPE === $post->post_type ) {
			wp_trash_post( $post_id );
		}

		wp_safe_redirect( add_query_arg( array( 'page' => 'scpo-option-sets', 'message' => 'trashed' ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * Restore option set.
	 *
	 * @param int $post_id Target post ID.
	 */
	protected function restore_option_set( $post_id ) {
		check_admin_referer( 'scpo_restore_' . $post_id );

		$post = get_post( $post_id );
		if ( $post && Option_Set_CPT::POST_TYPE === $post->post_type ) {
			wp_untrash_post( $post_id );
		}

		wp_safe_redirect( add_query_arg( array( 'page' => 'scpo-option-sets', 'message' => 'restored' ), admin_url( 'admin.php' ) ) );
		exit;
	}
}
