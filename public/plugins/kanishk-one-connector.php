<?php
/**
 * Plugin Name: Kanishk One Connector
 * Plugin URI: https://kanishkinfotech.com
 * Description: Forwards WordPress form submissions into your own Kanishk One CRM workspace over a secure server-to-server API. Your ingest key decides which workspace the leads land in.
 * Version: 2.0.0
 * Author: Kanishk Infotech
 * Text Domain: kanishk-one
 */

if (!defined('ABSPATH')) {
    exit;
}

define('K1_DEFAULT_ENDPOINT', 'https://updatedcrm.kanishkinfotech.com/api/webhooks/wordpress');
define('K1_VERSION', '2.0.0');

class Kanishk_One_Connector {

    private static $instance = null;
    private $option_group = 'kanishk_one_options';
    /** Guards against the same page-load sending a lead twice via two hooks. */
    private $sent_this_request = array();

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_init', array($this, 'migrate_legacy_options'));

        add_action('wpcf7_before_send_mail', array($this, 'handle_cf7_submission'), 10, 3);
        add_action('gform_after_submission', array($this, 'handle_gform_submission'), 10, 2);
        add_action('elementor_pro/forms/new_record', array($this, 'handle_elementor_submission'), 10, 2);
        add_action('wpforms_process_complete', array($this, 'handle_wpforms_submission'), 10, 4);

        // Opt-in only. It inspects every front-end POST, so it can duplicate
        // leads that a dedicated form hook already captured.
        if (get_option('kanishk_one_enable_generic') === '1') {
            add_action('init', array($this, 'handle_generic_form_submission'));
        }
    }

    /** v1 stored the credential under kanishk_one_api_key. Carry it over once. */
    public function migrate_legacy_options() {
        $legacy = get_option('kanishk_one_api_key', '');
        if (!empty($legacy) && empty(get_option('kanishk_one_ingest_key', ''))) {
            update_option('kanishk_one_ingest_key', $legacy);
        }
        if (empty(get_option('kanishk_one_endpoint', ''))) {
            update_option('kanishk_one_endpoint', K1_DEFAULT_ENDPOINT);
        }
    }

    public function add_admin_menu() {
        add_menu_page('Kanishk One', 'Kanishk One', 'manage_options', 'kanishk-one', array($this, 'render_admin_page'), 'dashicons-cloud', 30);
    }

    public function register_settings() {
        register_setting($this->option_group, 'kanishk_one_ingest_key');
        register_setting($this->option_group, 'kanishk_one_endpoint');
        register_setting($this->option_group, 'kanishk_one_enable_generic');
        register_setting($this->option_group, 'kanishk_one_status');
        register_setting($this->option_group, 'kanishk_one_last_sync');
    }

    // ------------------------------------------------------------------
    // Transport
    // ------------------------------------------------------------------

    private function endpoint() {
        $e = trim((string) get_option('kanishk_one_endpoint', K1_DEFAULT_ENDPOINT));
        return $e !== '' ? $e : K1_DEFAULT_ENDPOINT;
    }

    private function ingest_key() {
        return trim((string) get_option('kanishk_one_ingest_key', ''));
    }

    /**
     * One place that talks to Kanishk One. The ingest key is the ONLY thing
     * that decides which workspace a lead lands in - the payload never carries
     * a workspace id, so a key belonging to site A can never write into site B.
     */
    private function post_to_k1($payload, $timeout = 8) {
        $key = $this->ingest_key();
        if ($key === '') {
            return array('success' => false, 'message' => 'No ingest key saved.');
        }

        $response = wp_remote_post($this->endpoint(), array(
            'headers' => array(
                'Content-Type'     => 'application/json',
                'X-K1-Ingest-Key'  => $key,
                'X-K1-Plugin'      => 'wordpress/' . K1_VERSION,
            ),
            'body'    => wp_json_encode($payload),
            'timeout' => $timeout,
        ));

        if (is_wp_error($response)) {
            return array('success' => false, 'message' => $response->get_error_message());
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        $msg  = isset($body['message']) ? $body['message'] : ('HTTP ' . $code);

        if ($code >= 200 && $code < 300 && (!isset($body['success']) || $body['success'])) {
            return array('success' => true, 'message' => $msg, 'body' => $body);
        }
        return array('success' => false, 'message' => $msg, 'body' => $body, 'code' => $code);
    }

    private function log_send($ok, $message, $email) {
        $log = get_option('kanishk_one_log', array());
        if (!is_array($log)) { $log = array(); }
        array_unshift($log, array(
            'time'    => current_time('mysql'),
            'ok'      => $ok ? 1 : 0,
            'email'   => $email,
            'message' => substr((string) $message, 0, 200),
        ));
        update_option('kanishk_one_log', array_slice($log, 0, 10));
        if ($ok) {
            update_option('kanishk_one_last_sync', current_time('mysql'));
            update_option('kanishk_one_last_error', '');
        } else {
            update_option('kanishk_one_last_error', $message);
        }
    }

    private function test_connection() {
        $res = $this->post_to_k1(array('ping' => true), 15);
        if ($res['success']) {
            $b  = isset($res['body']) ? $res['body'] : array();
            $ws = isset($b['workspace_name']) ? $b['workspace_name'] : (isset($b['workspace_id']) ? $b['workspace_id'] : '');
            update_option('kanishk_one_status', 'connected');
            update_option('kanishk_one_workspace', $ws);
            update_option('kanishk_one_last_error', '');
        } else {
            update_option('kanishk_one_status', 'error');
            update_option('kanishk_one_last_error', $res['message']);
        }
        return $res;
    }

    // ------------------------------------------------------------------
    // Admin screen
    // ------------------------------------------------------------------

    public function render_admin_page() {
        if (!current_user_can('manage_options')) { return; }

        $message = ''; $message_type = 'updated';

        if (isset($_POST['kanishk_one_connect'])) {
            check_admin_referer('kanishk_one_admin_action');
            update_option('kanishk_one_ingest_key', sanitize_text_field($_POST['kanishk_one_ingest_key']));
            update_option('kanishk_one_endpoint', esc_url_raw($_POST['kanishk_one_endpoint']));
            update_option('kanishk_one_enable_generic', isset($_POST['kanishk_one_enable_generic']) ? '1' : '0');

            $res = $this->test_connection();
            $message = $res['success']
                ? 'Connected. Leads from this site will go to: ' . get_option('kanishk_one_workspace', '')
                : 'Connection failed: ' . $res['message'];
            $message_type = $res['success'] ? 'updated' : 'error';
        }

        $ingest_key = $this->ingest_key();
        $endpoint   = $this->endpoint();
        $generic    = get_option('kanishk_one_enable_generic') === '1';
        $status     = get_option('kanishk_one_status', 'not_connected');
        $workspace  = get_option('kanishk_one_workspace', '');
        $last_sync  = get_option('kanishk_one_last_sync', '');
        $last_error = get_option('kanishk_one_last_error', '');
        $log        = get_option('kanishk_one_log', array());
        ?>
        <div class="wrap" style="max-width:860px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div style="background:#fff;border:1px solid #ccd0d4;border-radius:8px;padding:24px;margin-top:20px;">

            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f0f0f1;padding-bottom:16px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="background:#2563eb;color:#fff;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;">K1</div>
                <div>
                  <h2 style="margin:0;font-size:18px;font-weight:700;color:#1e293b;">Kanishk One Connector</h2>
                  <p style="margin:2px 0 0;color:#64748b;font-size:13px;">Lead ingestion for WordPress &middot; v<?php echo esc_html(K1_VERSION); ?></p>
                </div>
              </div>
              <div>
                <?php if ($status === 'connected') : ?>
                  <span style="background:#dcfce7;color:#166534;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">&#9679; Connected</span>
                <?php elseif ($status === 'error') : ?>
                  <span style="background:#fee2e2;color:#991b1b;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">&#9679; Error</span>
                <?php else : ?>
                  <span style="background:#f1f5f9;color:#475569;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">&#9679; Not connected</span>
                <?php endif; ?>
              </div>
            </div>

            <?php if ($message) : ?>
              <div class="notice notice-<?php echo esc_attr($message_type); ?>" style="margin:0 0 20px;"><p><?php echo esc_html($message); ?></p></div>
            <?php endif; ?>

            <?php if ($status === 'connected' && $workspace) : ?>
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 16px;margin-bottom:20px;color:#1e40af;font-size:13px;">
                Leads from this website are delivered to the workspace <strong><?php echo esc_html($workspace); ?></strong>.
                If that is not your account, replace the ingest key below.
              </div>
            <?php endif; ?>

            <form method="post" action="">
              <?php wp_nonce_field('kanishk_one_admin_action'); ?>

              <p><label style="font-weight:600;display:block;margin-bottom:4px;">Ingest key</label>
              <input type="text" name="kanishk_one_ingest_key" value="<?php echo esc_attr($ingest_key); ?>" class="regular-text" style="width:100%;font-family:monospace;" placeholder="k1_live_..." />
              <span class="description">Kanishk One &rarr; Integrations &rarr; Lead Ingest. This key is what routes leads into your workspace. Keep it secret.</span></p>

              <p><label style="font-weight:600;display:block;margin-bottom:4px;">Endpoint</label>
              <input type="url" name="kanishk_one_endpoint" value="<?php echo esc_attr($endpoint); ?>" class="regular-text" style="width:100%;font-family:monospace;" />
              <span class="description">Leave the default unless Kanishk One gave you a different server address.</span></p>

              <p><label><input type="checkbox" name="kanishk_one_enable_generic" value="1" <?php checked($generic); ?> />
              Also capture plain HTML forms (no form plugin)</label><br/>
              <span class="description">Leave this off if you use Contact Form 7, WPForms, Gravity Forms or Elementor - those are captured already, and turning this on can create duplicates.</span></p>

              <p><button type="submit" name="kanishk_one_connect" class="button button-primary">Save &amp; test connection</button></p>
            </form>

            <?php if ($last_error) : ?>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin-top:8px;color:#991b1b;font-size:13px;">
                Last error: <?php echo esc_html($last_error); ?>
              </div>
            <?php endif; ?>

            <?php if ($last_sync) : ?><p style="color:#64748b;font-size:12px;">Last successful delivery: <?php echo esc_html($last_sync); ?></p><?php endif; ?>

            <?php if (!empty($log)) : ?>
              <h3 style="margin-top:24px;font-size:14px;">Recent deliveries</h3>
              <table class="widefat striped"><thead><tr><th>Time</th><th>Result</th><th>Lead</th><th>Detail</th></tr></thead><tbody>
              <?php foreach ($log as $row) : ?>
                <tr>
                  <td><?php echo esc_html($row['time']); ?></td>
                  <td><?php echo $row['ok'] ? '<span style="color:#166534;">Sent</span>' : '<span style="color:#991b1b;">Failed</span>'; ?></td>
                  <td><?php echo esc_html($row['email']); ?></td>
                  <td style="font-size:12px;color:#64748b;"><?php echo esc_html($row['message']); ?></td>
                </tr>
              <?php endforeach; ?>
              </tbody></table>
            <?php endif; ?>

          </div>
        </div>
        <?php
    }

    // ------------------------------------------------------------------
    // Form hooks
    // ------------------------------------------------------------------

    private function send_lead($data, $submission_id) {
        if ($this->ingest_key() === '') { return; }
        if (isset($this->sent_this_request[$submission_id])) { return; }
        $this->sent_this_request[$submission_id] = true;

        $payload = array_merge($data, array(
            'website_url'            => get_site_url(),
            'channel'                => 'wordpress',
            'provider_submission_id' => $submission_id,
        ));

        $res = $this->post_to_k1($payload);
        $this->log_send($res['success'], $res['message'], isset($data['email']) ? $data['email'] : '');
    }

    public function handle_generic_form_submission() {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || is_admin()) { return; }
        if (isset($_POST['log']) && isset($_POST['pwd'])) { return; }
        if (isset($_POST['action']) && strpos($_POST['action'], 'heartbeat') !== false) { return; }

        $get = function ($keys) {
            foreach ($keys as $k) {
                if (!empty($_POST[$k])) { return sanitize_text_field($_POST[$k]); }
            }
            return '';
        };

        $name  = $get(array('name', 'your-name', 'fullname', 'full_name'));
        $email = $get(array('email', 'your-email', 'email_address'));
        $phone = $get(array('phone', 'your-phone', 'mobile', 'contact_number'));

        if ($name === '' && $email === '' && $phone === '') { return; }

        $this->send_lead(array(
            'name'        => $name,
            'email'       => $email,
            'phone'       => $phone,
            'company'     => $get(array('company', 'your-company', 'organisation')),
            'service'     => $get(array('service', 'your-service', 'interested_in')),
            'requirement' => $get(array('message', 'requirement', 'your-message', 'comments')),
            'page_url'    => get_site_url() . (isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : ''),
            'form_id'     => 'generic_wp_form',
        ), 'wpgeneric_' . md5($email . $phone . $name . date('YmdHi')));
    }

    public function handle_cf7_submission($contact_form, &$abort, $submission) {
        $data = $submission->get_posted_data();
        $fields = array();
        foreach ($data as $key => $value) {
            if (substr($key, 0, 1) !== '_') {
                $fields[$key] = is_array($value) ? implode(', ', $value) : $value;
            }
        }
        $fields['page_url'] = get_site_url();
        $fields['form_id']  = 'contact_form_7_' . $contact_form->id();
        $this->send_lead($fields, 'cf7_' . $contact_form->id() . '_' . md5(wp_json_encode($data)));
    }

    public function handle_gform_submission($entry, $form) {
        $this->send_lead(array(
            'name'        => rgar($entry, '1'),
            'email'       => rgar($entry, '2'),
            'phone'       => rgar($entry, '3'),
            'company'     => rgar($entry, '4'),
            'service'     => rgar($entry, '5'),
            'requirement' => rgar($entry, '6'),
            'page_url'    => get_site_url(),
            'form_id'     => 'gravity_form_' . $form['id'],
        ), 'gform_' . $form['id'] . '_' . rgar($entry, 'id'));
    }

    public function handle_elementor_submission($record, $handler) {
        $raw_fields = $record->get_formatted_data();
        $fields = array();
        foreach ($raw_fields as $key => $value) {
            $fields[trim($key)] = is_array($value) ? implode(', ', $value) : $value;
        }
        $fields['page_url']      = get_site_url();
        $fields['form_id']       = 'elementor_form_' . $record->get_form_settings('form_name');
        $fields['source_detail'] = 'Elementor';
        $this->send_lead($fields, 'elementor_' . md5(wp_json_encode($raw_fields)));
    }

    public function handle_wpforms_submission($fields, $entry, $form_data, $entry_id) {
        $data = array();
        foreach ($fields as $field) {
            $label = isset($field['name']) ? $field['name'] : 'field_' . $field['id'];
            $data[$label] = isset($field['value']) ? $field['value'] : '';
        }
        $data['page_url'] = get_site_url();
        $data['form_id']  = 'wpforms_' . $form_data['id'];
        $this->send_lead($data, 'wpforms_' . $form_data['id'] . '_' . $entry_id);
    }
}

Kanishk_One_Connector::get_instance();
