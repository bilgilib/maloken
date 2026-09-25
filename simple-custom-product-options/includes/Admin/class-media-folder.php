<?php
/**
 * Media Folder Logical Organization for Image Select Options
 *
 * Implements a logical Media Library folder using a dedicated attachment taxonomy
 * named exactly "Simple Product Options". Does not create a physical directory
 * or move/mix existing product files. Validates attachment ownership, mime type,
 * and derives canonical URLs safely from attachment IDs.
 *
 * @package SimpleCustomProductOptions\Admin
 */

namespace SimpleCustomProductOptions\Admin;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Media_Folder {

	/**
	 * Logical media folder taxonomy.
	 */
	const TAXONOMY = 'scpo_media_folder';

	/**
	 * Exact term name required for Simple Product Options folder.
	 */
	const FOLDER_NAME = 'Simple Product Options';

	/**
	 * Term slug.
	 */
	const FOLDER_SLUG = 'simple-product-options';

	/**
	 * Allowed image mime types.
	 */
	const ALLOWED_MIME_TYPES = array(
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'image/avif',
	);

	/**
	 * Constructor. Hook into WordPress lifecycle.
	 */
	public function __construct() {
		add_action( 'init', array( $this, 'register_taxonomy' ) );
		add_action( 'wp_ajax_scpo_tag_media', array( $this, 'ajax_tag_media' ) );
		add_filter( 'ajax_query_attachments_args', array( $this, 'filter_media_query_args' ) );
		add_action( 'restrict_manage_posts', array( $this, 'render_media_filter_dropdown' ) );
	}

	/**
	 * Register logical attachment taxonomy and bootstrap default term.
	 */
	public function register_taxonomy() {
		if ( ! taxonomy_exists( self::TAXONOMY ) ) {
			register_taxonomy(
				self::TAXONOMY,
				array( 'attachment' ),
				array(
					'hierarchical'      => true,
					'labels'            => array(
						'name'          => __( 'Media Folders', 'simple-custom-product-options' ),
						'singular_name' => __( 'Media Folder', 'simple-custom-product-options' ),
						'all_items'     => __( 'All Folders', 'simple-custom-product-options' ),
						'edit_item'     => __( 'Edit Folder', 'simple-custom-product-options' ),
						'view_item'     => __( 'View Folder', 'simple-custom-product-options' ),
						'update_item'   => __( 'Update Folder', 'simple-custom-product-options' ),
						'add_new_item'  => __( 'Add New Folder', 'simple-custom-product-options' ),
						'new_item_name' => __( 'New Folder Name', 'simple-custom-product-options' ),
						'search_items'  => __( 'Search Folders', 'simple-custom-product-options' ),
					),
					'public'            => false,
					'show_ui'           => true,
					'show_in_menu'      => false,
					'show_in_nav_menus' => false,
					'show_admin_column' => true,
					'query_var'         => true,
					'rewrite'           => false,
					'show_in_rest'      => true,
				)
			);
		}

		$this->ensure_default_folder_term();
	}

	/**
	 * Ensure the dedicated "Simple Product Options" logical folder term exists.
	 *
	 * @return int|WP_Error Term ID or WP_Error.
	 */
	public function ensure_default_folder_term() {
		if ( ! taxonomy_exists( self::TAXONOMY ) ) {
			return 0;
		}

		if ( function_exists( 'term_exists' ) ) {
			$term = term_exists( self::FOLDER_NAME, self::TAXONOMY );
			if ( $term ) {
				return is_array( $term ) ? (int) $term['term_id'] : (int) $term;
			}
		}

		if ( function_exists( 'wp_insert_term' ) ) {
			$inserted = wp_insert_term(
				self::FOLDER_NAME,
				self::TAXONOMY,
				array(
					'slug'        => self::FOLDER_SLUG,
					'description' => __( 'Logical folder for images assigned to Simple Product Options choices.', 'simple-custom-product-options' ),
				)
			);

			if ( ! is_wp_error( $inserted ) && isset( $inserted['term_id'] ) ) {
				return (int) $inserted['term_id'];
			}
		}

		return 0;
	}

	/**
	 * Validate and assign an attachment to the "Simple Product Options" logical folder.
	 *
	 * - Confirms valid post of type attachment.
	 * - Validates image mime type (rejects non-images).
	 * - Assigns taxonomy term "Simple Product Options".
	 * - Stores canonical attachment ID and returns derived URLs safely.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|WP_Error Normalized media record or WP_Error.
	 */
	public static function assign_to_folder( $attachment_id ) {
		$attachment_id = absint( $attachment_id );
		if ( ! $attachment_id ) {
			return new WP_Error( 'scpo_invalid_attachment_id', __( 'Invalid attachment ID.', 'simple-custom-product-options' ) );
		}

		// Validate post exists and is attachment
		if ( function_exists( 'get_post' ) ) {
			$post = get_post( $attachment_id );
			if ( ! $post || 'attachment' !== $post->post_type ) {
				return new WP_Error( 'scpo_not_attachment', __( 'The specified item is not a valid WordPress attachment.', 'simple-custom-product-options' ) );
			}

			// Validate mime type
			$mime = get_post_mime_type( $attachment_id );
			if ( ! self::is_allowed_image_mime( $mime ) ) {
				return new WP_Error( 'scpo_invalid_mime', sprintf( __( 'Attachment mime type "%s" is not an allowed image format.', 'simple-custom-product-options' ), sanitize_text_field( $mime ) ) );
			}
		}

		// Assign taxonomy term
		if ( function_exists( 'wp_set_object_terms' ) ) {
			wp_set_object_terms( $attachment_id, self::FOLDER_NAME, self::TAXONOMY, true );
		}

		// Assign metadata flag
		if ( function_exists( 'update_post_meta' ) ) {
			update_post_meta( $attachment_id, '_scpo_media_folder', self::FOLDER_NAME );
		}

		// Derive URLs safely
		$url       = function_exists( 'wp_get_attachment_image_url' ) ? wp_get_attachment_image_url( $attachment_id, 'full' ) : '';
		$thumbnail = function_exists( 'wp_get_attachment_image_url' ) ? wp_get_attachment_image_url( $attachment_id, 'thumbnail' ) : '';
		$alt       = function_exists( 'get_post_meta' ) ? get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) : '';

		if ( empty( $url ) && function_exists( 'wp_get_attachment_url' ) ) {
			$url = wp_get_attachment_url( $attachment_id );
		}
		if ( empty( $thumbnail ) ) {
			$thumbnail = $url;
		}

		return array(
			'id'        => $attachment_id,
			'url'       => $url ? esc_url_raw( $url ) : '',
			'thumbnail' => $thumbnail ? esc_url_raw( $thumbnail ) : '',
			'alt'       => sanitize_text_field( $alt ),
			'folder'    => self::FOLDER_NAME,
		);
	}

	/**
	 * Verify if a mime type is an allowed image format.
	 *
	 * @param string $mime Mime type string.
	 * @return bool
	 */
	public static function is_allowed_image_mime( $mime ) {
		if ( empty( $mime ) || ! is_string( $mime ) ) {
			return false;
		}
		$mime = strtolower( trim( $mime ) );
		return in_array( $mime, self::ALLOWED_MIME_TYPES, true ) || ( 0 === strpos( $mime, 'image/' ) );
	}

	/**
	 * AJAX endpoint for tagging newly selected or uploaded media in the admin builder.
	 */
	public function ajax_tag_media() {
		if ( ! function_exists( 'check_ajax_referer' ) || ! check_ajax_referer( 'scpo_media_nonce', 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => __( 'Security verification failed.', 'simple-custom-product-options' ) ), 403 );
			return;
		}

		if ( ! function_exists( 'current_user_can' ) || ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( array( 'message' => __( 'Insufficient permissions to upload or manage media.', 'simple-custom-product-options' ) ), 403 );
			return;
		}

		$attachment_id = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0;
		if ( ! $attachment_id ) {
			wp_send_json_error( array( 'message' => __( 'Missing attachment ID.', 'simple-custom-product-options' ) ), 400 );
			return;
		}

		$result = self::assign_to_folder( $attachment_id );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ), 400 );
			return;
		}

		wp_send_json_success( $result );
	}

	/**
	 * Filter media library queries when the picker requests the Simple Product Options folder only.
	 *
	 * @param array $query Media query arguments.
	 * @return array Filtered query arguments.
	 */
	public function filter_media_query_args( $query ) {
		if ( ! empty( $_REQUEST['query']['scpo_filter_folder'] ) || ! empty( $_REQUEST['scpo_filter_folder'] ) ) {
			$query['tax_query'] = array(
				array(
					'taxonomy' => self::TAXONOMY,
					'field'    => 'slug',
					'terms'    => self::FOLDER_SLUG,
				),
			);
		}
		return $query;
	}

	/**
	 * Render an admin filter dropdown on the WordPress Media Library (upload.php).
	 *
	 * @param string $post_type Post type.
	 */
	public function render_media_filter_dropdown( $post_type ) {
		if ( 'attachment' !== $post_type || ! taxonomy_exists( self::TAXONOMY ) ) {
			return;
		}

		$selected = isset( $_GET[ self::TAXONOMY ] ) ? sanitize_key( $_GET[ self::TAXONOMY ] ) : '';

		echo '<select name="' . esc_attr( self::TAXONOMY ) . '" id="filter-by-scpo-media-folder">';
		echo '<option value="">' . esc_html__( 'All Media Folders', 'simple-custom-product-options' ) . '</option>';
		echo '<option value="' . esc_attr( self::FOLDER_SLUG ) . '" ' . selected( $selected, self::FOLDER_SLUG, false ) . '>';
		echo esc_html( self::FOLDER_NAME );
		echo '</option>';
		echo '</select>';
	}
}
