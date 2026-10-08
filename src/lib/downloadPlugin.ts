/**
 * Pure-JS ZIP Builder & Downloader for Kanishk One Connector WordPress Plugin (.zip)
 * Creates a standard PKZip archive containing kanishk-one-connector/kanishk-one-connector.php
 * compatible with WordPress Plugins -> Add New -> Upload Plugin.
 */

// CRC32 calculation table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

function calculateCRC32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipFileBuffer(filenameInZip: string, textContent: string): Uint8Array {
  const encoder = new TextEncoder();
  const fileBytes = encoder.encode(textContent);
  const nameBytes = encoder.encode(filenameInZip);

  const crc = calculateCRC32(fileBytes);
  const size = fileBytes.length;

  const localHeaderSize = 30 + nameBytes.length;
  const centralHeaderSize = 46 + nameBytes.length;
  const endRecordSize = 22;

  const totalSize = localHeaderSize + size + centralHeaderSize + endRecordSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  let offset = 0;

  // 1. Local File Header
  view.setUint32(offset, 0x04034b50, true); // Local header signature
  view.setUint16(offset + 4, 10, true); // Version needed (1.0)
  view.setUint16(offset + 6, 0, true); // General purpose bit flag
  view.setUint16(offset + 8, 0, true); // Compression method (0 = Store)
  view.setUint16(offset + 10, 0x4821, true); // File last mod time
  view.setUint16(offset + 12, 0x5532, true); // File last mod date
  view.setUint32(offset + 14, crc, true); // CRC-32
  view.setUint32(offset + 18, size, true); // Compressed size
  view.setUint32(offset + 22, size, true); // Uncompressed size
  view.setUint16(offset + 26, nameBytes.length, true); // Filename length
  view.setUint16(offset + 28, 0, true); // Extra field length
  offset += 30;

  buffer.set(nameBytes, offset);
  offset += nameBytes.length;

  // 2. File Data
  buffer.set(fileBytes, offset);
  offset += size;

  const centralDirOffset = offset;

  // 3. Central Directory Record
  view.setUint32(offset, 0x02014b50, true); // Central directory signature
  view.setUint16(offset + 4, 20, true); // Version made by
  view.setUint16(offset + 6, 10, true); // Version needed to extract
  view.setUint16(offset + 8, 0, true); // General purpose bit flag
  view.setUint16(offset + 10, 0, true); // Compression method
  view.setUint16(offset + 12, 0x4821, true); // Last mod time
  view.setUint16(offset + 14, 0x5532, true); // Last mod date
  view.setUint32(offset + 16, crc, true); // CRC-32
  view.setUint32(offset + 20, size, true); // Compressed size
  view.setUint32(offset + 24, size, true); // Uncompressed size
  view.setUint16(offset + 28, nameBytes.length, true); // Filename length
  view.setUint16(offset + 30, 0, true); // Extra field length
  view.setUint16(offset + 32, 0, true); // File comment length
  view.setUint16(offset + 34, 0, true); // Disk number start
  view.setUint16(offset + 36, 0, true); // Internal file attributes
  view.setUint32(offset + 38, 0x81a40000, true); // External file attributes (-rw-r--r--)
  view.setUint32(offset + 42, 0, true); // Relative offset of local header
  offset += 46;

  buffer.set(nameBytes, offset);
  offset += nameBytes.length;

  // 4. End of Central Directory Record
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true); // Disk number
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, 1, true); // Number of central directory records on this disk
  view.setUint16(offset + 10, 1, true); // Total number of central directory records
  view.setUint32(offset + 12, centralHeaderSize, true); // Size of central directory
  view.setUint32(offset + 16, centralDirOffset, true); // Offset of start of central directory
  view.setUint16(offset + 20, 0, true); // ZIP comment length

  return buffer;
}

const PLUGIN_PHP_CODE = `<?php
/**
 * Plugin Name: __K1_BRAND__ Connector
 * Description: Forwards WordPress form submissions straight into your __K1_BRAND__ lead inbox over a secure server-to-server API.
 * Version: 2.0.0
 * Author: __K1_BRAND__
 * Text Domain: kanishk-one
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class Kanishk_One_Connector {
    private static $instance = null;
    private $option_group = 'kanishk_one_options';

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        
        // Form Ingestion Hooks
        add_action('wpcf7_before_send_mail', array($this, 'handle_cf7_submission'), 10, 3);
        add_filter('wpcf7_skip_mail', array($this, 'bypass_cf7_mail_errors'), 10, 2);
        add_action('gform_after_submission', array($this, 'handle_gform_submission'), 10, 2);
        add_action('elementor_pro/forms/new_record', array($this, 'handle_elementor_submission'), 10, 2);
        add_action('wpforms_process_complete', array($this, 'handle_wpforms_submission'), 10, 4);
        add_action('init', array($this, 'handle_generic_form_submission'));
    }

    public function bypass_cf7_mail_errors($skip_mail, $contact_form) {
        $status = get_option('kanishk_one_status');
        if ($status === 'connected') {
            return true; // Bypass server wp_mail() failures so Contact Form 7 displays green success status
        }
        return $skip_mail;
    }

    public function add_admin_menu() {
        add_menu_page(
            'Kanishk One',
            'Kanishk One',
            'manage_options',
            'kanishk-one',
            array($this, 'render_admin_page'),
            'dashicons-cloud',
            30
        );
    }

    public function register_settings() {
        register_setting($this->option_group, 'kanishk_one_api_key');
        register_setting($this->option_group, 'kanishk_one_server_url');
        register_setting($this->option_group, 'kanishk_one_status');
        register_setting($this->option_group, 'kanishk_one_last_sync');
        register_setting($this->option_group, 'kanishk_one_last_error');
        register_setting($this->option_group, 'kanishk_one_connected_url');
    }

    public function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $api_key = get_option('kanishk_one_api_key', '');
        $server_url = get_option('kanishk_one_server_url', '__K1_INGEST_ENDPOINT__');
        $status = get_option('kanishk_one_status', 'not_connected');
        $last_sync = get_option('kanishk_one_last_sync', '');
        $last_error = get_option('kanishk_one_last_error', '');
        $connected_url = get_option('kanishk_one_connected_url', get_site_url());

        $message = '';
        $message_type = 'updated';

        // Connect or Disconnect Handlers
        if (isset($_POST['kanishk_one_connect'])) {
            check_admin_referer('kanishk_one_admin_action');
            $posted_key = sanitize_text_field($_POST['kanishk_one_api_key']);
            update_option('kanishk_one_api_key', $posted_key);
            $api_key = $posted_key;

            $test_result = $this->test_connection($api_key, $server_url);
            if ($test_result['success']) {
                $status = 'connected';
                update_option('kanishk_one_status', 'connected');
                update_option('kanishk_one_connected_url', get_site_url());
                update_option('kanishk_one_last_sync', current_time('mysql'));
                update_option('kanishk_one_last_error', '');
                $message = 'Connection Verified! Kanishk One Connector is successfully connected.';
                $message_type = 'updated';
                $last_error = '';
            } else {
                $status = 'error';
                update_option('kanishk_one_status', 'error');
                update_option('kanishk_one_last_error', $test_result['message']);
                $message = 'Connection Failed: ' . esc_html($test_result['message']);
                $message_type = 'error';
                $last_error = $test_result['message'];
            }
        }

        if (isset($_POST['kanishk_one_disconnect'])) {
            check_admin_referer('kanishk_one_admin_action');
            update_option('kanishk_one_status', 'not_connected');
            $status = 'not_connected';
            $message = 'Kanishk One Connector disconnected.';
            $message_type = 'updated';
        }
        ?>
        <div class="wrap" style="max-width: 750px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; margin-top: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 18px; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="background: #2563eb; color: #fff; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">K1</div>
                        <div>
                            <h2 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a;">Kanishk One Connector</h2>
                            <p style="margin: 3px 0 0 0; color: #64748b; font-size: 13px;">Official Lead Ingestion Plugin for Kanishk One CRM</p>
                        </div>
                    </div>
                    <div>
                        <?php if ($status === 'connected') : ?>
                            <span style="background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;">● Connected</span>
                        <?php elseif ($status === 'error') : ?>
                            <span style="background: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;">● Error</span>
                        <?php else : ?>
                            <span style="background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;">● Not Connected</span>
                        <?php endif; ?>
                    </div>
                </div>

                <?php if (!empty($message)) : ?>
                    <div class="notice notice-<?php echo esc_attr($message_type); ?> is-dismissible" style="margin: 0 0 20px 0; border-radius: 6px;">
                        <p style="font-weight: 600;"><?php echo esc_html($message); ?></p>
                    </div>
                <?php endif; ?>

                <?php if ($status !== 'connected') : ?>
                    <!-- UNCONNECTED VIEW -->
                    <form method="post" action="">
                        <?php wp_nonce_field('kanishk_one_admin_action'); ?>
                        <div style="margin-bottom: 20px;">
                            <label for="kanishk_one_api_key" style="display: block; font-weight: 700; font-size: 13px; color: #334155; margin-bottom: 8px;">Workspace API Key</label>
                            <input name="kanishk_one_api_key" type="text" id="kanishk_one_api_key" value="<?php echo esc_attr($api_key); ?>" style="width: 100%; font-family: monospace; font-size: 13px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="wp_k1_..." required />
                            <p style="color: #64748b; font-size: 12px; margin-top: 6px;">Copy your Workspace API Key from Kanishk One CRM (Integrations → WordPress).</p>
                        </div>
                        <input type="submit" name="kanishk_one_connect" class="button button-primary" style="background: #2563eb; border-color: #2563eb; padding: 6px 20px; font-weight: 700; height: 38px; border-radius: 6px;" value="Connect" />
                    </form>
                <?php else : ?>
                    <!-- CONNECTED VIEW -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px;">
                            <div>
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Connected Website</span>
                                <div style="font-weight: 700; color: #0f172a; margin-top: 2px;"><?php echo esc_html($connected_url); ?></div>
                            </div>
                            <div>
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Status</span>
                                <div style="font-weight: 700; color: #16a34a; margin-top: 2px;">Active & Synchronized</div>
                            </div>
                            <div>
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Last Sync</span>
                                <div style="font-weight: 600; color: #334155; margin-top: 2px;"><?php echo !empty($last_sync) ? esc_html($last_sync) : 'Just Now'; ?></div>
                            </div>
                            <div>
                                <span style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Last Error</span>
                                <div style="font-weight: 600; color: <?php echo !empty($last_error) ? '#dc2626' : '#16a34a'; ?>; margin-top: 2px;">
                                    <?php echo !empty($last_error) ? esc_html($last_error) : 'None (Healthy)'; ?>
                                </div>
                            </div>
                        </div>
                    </div>

                    <form method="post" action="" style="display: flex; gap: 12px;">
                        <?php wp_nonce_field('kanishk_one_admin_action'); ?>
                        <input type="submit" name="kanishk_one_connect" class="button button-secondary" style="font-weight: 600;" value="Test Connection" />
                        <input type="submit" name="kanishk_one_disconnect" class="button button-secondary" style="color: #dc2626; border-color: #fca5a5; font-weight: 600;" value="Disconnect" onclick="return confirm('Disconnect Kanishk One Connector?');" />
                    </form>
                <?php endif; ?>
            </div>
        </div>
        <?php
    }

    private function test_connection($api_key, $server_url) {
        if (empty($api_key)) {
            return array('success' => false, 'message' => 'Workspace API Key is empty. Please enter your API Key from Kanishk One CRM.');
        }

        $endpoint = '__K1_INGEST_ENDPOINT__';
        $payload = array(
            'api_key' => $api_key,
            'test_ping' => true,
            'name' => 'WordPress Connection Verification Ping',
            'email' => 'ping_' . time() . '@connector.invalid',
            'company' => parse_url(get_site_url(), PHP_URL_HOST),
            'service' => 'WordPress Connector Integration Test',
            'requirement' => 'Automated connection test ping from WordPress Connector Plugin.',
            'page_url' => get_site_url(),
            'form_id' => 'wp_connector_test_ping',
            'channel' => 'wordpress',
        );

        $response = wp_remote_post($endpoint, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-K1-Ingest-Key' => $api_key,
            ),
            'body' => wp_json_encode($payload),
            'timeout' => 10,
        ));

        if (is_wp_error($response)) {
            return array('success' => false, 'message' => $response->get_error_message());
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $json = json_decode($body, true);

        if ($code >= 200 && $code < 300) {
            return array('success' => true, 'message' => isset($json['message']) ? $json['message'] : 'Connected successfully!');
        }

        return array('success' => false, 'message' => isset($json['message']) ? $json['message'] : 'HTTP Error ' . $code);
    }

    public function handle_generic_form_submission() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || is_admin()) return;
        $status = get_option('kanishk_one_status');
        if ($status !== 'connected') return;

        if (isset($_POST['log']) && isset($_POST['pwd'])) return;
        if (isset($_POST['action']) && strpos($_POST['action'], 'heartbeat') !== false) return;
        if (strpos($_SERVER['REQUEST_URI'], 'wp-cron.php') !== false) return;
        if (strpos($_SERVER['REQUEST_URI'], 'wp-json') !== false) return;
        if (empty($_POST) || count($_POST) === 0) return;

        $name = isset($_POST['name']) ? sanitize_text_field($_POST['name']) : (isset($_POST['your-name']) ? sanitize_text_field($_POST['your-name']) : '');
        $email = isset($_POST['email']) ? sanitize_email($_POST['email']) : (isset($_POST['your-email']) ? sanitize_email($_POST['your-email']) : '');
        $phone = isset($_POST['phone']) ? sanitize_text_field($_POST['phone']) : (isset($_POST['your-phone']) ? sanitize_text_field($_POST['your-phone']) : '');
        $company = isset($_POST['company']) ? sanitize_text_field($_POST['company']) : (isset($_POST['your-company']) ? sanitize_text_field($_POST['your-company']) : '');
        $service = isset($_POST['service']) ? sanitize_text_field($_POST['service']) : (isset($_POST['your-service']) ? sanitize_text_field($_POST['your-service']) : '');
        $message = isset($_POST['message']) ? sanitize_textarea_field($_POST['message']) : (isset($_POST['requirement']) ? sanitize_textarea_field($_POST['requirement']) : '');

        $this->send_lead_to_kanishk_one(array(
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'company' => $company,
            'service' => $service,
            'requirement' => $message,
            'page_url' => get_site_url() . $_SERVER['REQUEST_URI'],
            'form_id' => 'generic_wp_form',
        ));
    }

    public function handle_cf7_submission($contact_form, &$abort, $submission) {
        $status = get_option('kanishk_one_status');
        if ($status !== 'connected') return;

        $data = $submission->get_posted_data();
        $this->send_lead_to_kanishk_one(array(
            'name' => isset($data['your-name']) ? $data['your-name'] : (isset($data['name']) ? $data['name'] : ''),
            'email' => isset($data['your-email']) ? $data['your-email'] : (isset($data['email']) ? $data['email'] : ''),
            'phone' => isset($data['your-phone']) ? $data['your-phone'] : (isset($data['phone']) ? $data['phone'] : ''),
            'company' => isset($data['your-company']) ? $data['your-company'] : (isset($data['company']) ? $data['company'] : ''),
            'service' => isset($data['your-service']) ? $data['your-service'] : (isset($data['service']) ? $data['service'] : ''),
            'requirement' => isset($data['your-message']) ? $data['your-message'] : (isset($data['message']) ? $data['message'] : ''),
            'page_url' => get_site_url(),
            'form_id' => 'contact_form_7_' . $contact_form->id(),
        ));
    }

    public function handle_gform_submission($entry, $form) {
        $status = get_option('kanishk_one_status');
        if ($status !== 'connected') return;

        $this->send_lead_to_kanishk_one(array(
            'name' => rgar($entry, '1'),
            'email' => rgar($entry, '2'),
            'phone' => rgar($entry, '3'),
            'company' => rgar($entry, '4'),
            'service' => rgar($entry, '5'),
            'requirement' => rgar($entry, '6'),
            'page_url' => get_site_url(),
            'form_id' => 'gravity_form_' . $form['id'],
        ));
    }

    public function handle_elementor_submission($record, $handler) {
        $status = get_option('kanishk_one_status');
        if ($status !== 'connected') return;

        $raw_fields = $record->get_formatted_data();
        $fields = array();
        foreach ($raw_fields as $key => $value) {
            $fields[strtolower(trim($key))] = is_array($value) ? implode(', ', $value) : $value;
        }

        $first_name = isset($fields['first name']) ? $fields['first name'] : '';
        $last_name = isset($fields['last name']) ? $fields['last name'] : '';
        $name = trim($first_name . ' ' . $last_name);
        if (empty($name)) {
            $name = isset($fields['name']) ? $fields['name'] : '';
        }

        $email = isset($fields['company email']) ? $fields['company email'] : (isset($fields['email']) ? $fields['email'] : '');
        $phone = isset($fields['phone']) ? $fields['phone'] : '';
        $company = isset($fields['company / organization']) ? $fields['company / organization'] : (isset($fields['company']) ? $fields['company'] : '');
        $service = isset($fields['how can we help you?']) ? $fields['how can we help you?'] : (isset($fields['service']) ? $fields['service'] : '');
        $requirement = isset($fields['message']) ? $fields['message'] : (isset($fields['requirement']) ? $fields['requirement'] : '');

        $this->send_lead_to_kanishk_one(array(
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'company' => $company,
            'service' => $service,
            'requirement' => $requirement,
            'page_url' => get_site_url(),
            'form_id' => 'elementor_form_' . $record->get_form_settings('form_name'),
            'source_detail' => 'Elementor',
        ));
    }

    public function handle_wpforms_submission($fields, $entry, $form_data, $entry_id) {
        $status = get_option('kanishk_one_status');
        if ($status !== 'connected') return;

        $name = ''; $email = ''; $phone = ''; $company = ''; $service = ''; $requirement = '';
        $raw_fields = array();
        foreach ($fields as $field) {
            $label = strtolower(isset($field['name']) ? $field['name'] : '');
            $val = isset($field['value']) ? $field['value'] : '';
            if (strpos($label, 'name') !== false) $name = $val;
            if (strpos($label, 'email') !== false) $email = $val;
            if (strpos($label, 'phone') !== false) $phone = $val;
            if (strpos($label, 'company') !== false) $company = $val;
            if (strpos($label, 'service') !== false) $service = $val;
            if (strpos($label, 'message') !== false || strpos($label, 'requirement') !== false) $requirement = $val;
            
            if ($label) {
                $raw_fields[$label] = $val;
            }
        }

        $payload_data = array(
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'company' => $company,
            'service' => $service,
            'requirement' => $requirement,
            'page_url' => get_site_url(),
            'form_id' => 'wpforms_' . $form_data['id'],
        );
        $payload_data = array_merge($raw_fields, $payload_data);

        $this->send_lead_to_kanishk_one($payload_data);
    }

    private function send_lead_to_kanishk_one($data) {
        $api_key = get_option('kanishk_one_api_key', '');
        if (empty($api_key)) {
            return;
        }

        $endpoint = '__K1_INGEST_ENDPOINT__';
        $payload = array_merge($data, array(
            'api_key' => $api_key,
            'website_url' => get_site_url(),
            'source' => 'website',
        ));

        $response = wp_remote_post($endpoint, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-K1-Ingest-Key' => $api_key,
            ),
            'body' => wp_json_encode($payload),
            'blocking' => true,
            'sslverify' => false,
        ));

        if (is_wp_error($response)) {
            update_option('kanishk_one_last_error', $response->get_error_message());
        } else {
            $code = wp_remote_retrieve_response_code($response);
            if ($code !== 200 && $code !== 201) {
                update_option('kanishk_one_last_error', 'HTTP ' . $code . ': ' . wp_remote_retrieve_body($response));
            } else {
                update_option('kanishk_one_last_error', '');
            }
        }

        update_option('kanishk_one_last_sync', current_time('mysql'));
    }
}

Kanishk_One_Connector::get_instance();
`;

/**
 * The endpoint is the same for every workspace in the SaaS - the ingest key
 * in the request identifies the tenant. Nothing here may carry a customer's
 * own hostname or brand.
 */
function resolveIngestEndpoint(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/webhooks/wordpress`;
  }
  return 'https://updatedcrm.kanishkinfotech.com/api/webhooks/wordpress';
}

function buildPluginPhp(brand = 'Lead Connector'): string {
  return PLUGIN_PHP_CODE
    .split('__K1_INGEST_ENDPOINT__').join(resolveIngestEndpoint())
    .split('__K1_BRAND__').join(brand);
}

export function getWordPressPluginZipBuffer(brand?: string): Uint8Array {
  return createZipFileBuffer('kanishk-one-connector/kanishk-one-connector.php', buildPluginPhp(brand));
}

function uint8ToBase64(u8Arr: Uint8Array) {
  const CHUNK_SIZE = 0x8000;
  const c = [];
  for (let i = 0; i < u8Arr.length; i += CHUNK_SIZE) {
    c.push(String.fromCharCode.apply(null, Array.from(u8Arr.subarray(i, i + CHUNK_SIZE))));
  }
  return btoa(c.join(''));
}

export function downloadWordPressPlugin() {
  try {
    const zipBuffer = getWordPressPluginZipBuffer();
    const base64 = uint8ToBase64(zipBuffer);
    const dataUrl = 'data:application/zip;base64,' + base64;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'kanishk-one-connector.zip';
    a.setAttribute('download', 'kanishk-one-connector.zip');
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
    }, 150);
  } catch (err: any) {
    console.error('Download failed:', err);
    alert('Failed to generate download: ' + err.message);
  }
}


