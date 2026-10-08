import {
  slugifyKey,
  calculateAgeFromDOB,
  validateCustomFieldValue,
  PRESET_CLIENT_TYPE_DEFS,
  BUSINESS_INPUT_TYPES,
  CLIENT_TYPE_LABELS,
  formatAddressObject,
  formatCustomFieldValue,
  saveCustomFieldDef,
} from './customFields';
import type { CustomFieldDef } from './types';

async function runTests() {
  console.log('=== RUNNING CUSTOM FIELDS ENGINE AUTOMATED VERIFICATION ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Slugify Key Safety
  assert(slugifyKey('Preferred Surgery Day') === 'preferred_surgery_day', 'slugifyKey transforms "Preferred Surgery Day" -> "preferred_surgery_day"');
  assert(slugifyKey('  Visiting Days #1  ') === 'visiting_days_1', 'slugifyKey cleans special characters');
  assert(slugifyKey('Consultation Fee (₹)') === 'consultation_fee', 'slugifyKey handles currency symbols');

  // 2. Age Calculation from Date of Birth
  const age1985 = calculateAgeFromDOB('1985-06-15');
  assert(typeof age1985 === 'number' && age1985 >= 40, 'calculateAgeFromDOB calculates correct age for 1985');
  assert(calculateAgeFromDOB('invalid-date') === null, 'calculateAgeFromDOB handles invalid date gracefully');

  // 3. Client Types Registration & Blank Preset Canvas
  assert(Object.keys(CLIENT_TYPE_LABELS).length === 9, 'All 9 Client Types registered with human labels');
  assert(PRESET_CLIENT_TYPE_DEFS.doctor.length === 0, 'Doctor / Clinic has no forced hardcoded defaults');
  assert(PRESET_CLIENT_TYPE_DEFS.real_estate.length === 0, 'Real Estate has no forced hardcoded defaults');
  assert(PRESET_CLIENT_TYPE_DEFS.individual.length === 0, 'Individual has no forced hardcoded defaults');
  assert(PRESET_CLIENT_TYPE_DEFS.business.length === 0, 'Business / Company has no forced hardcoded defaults');

  // 4. Non-Technical Business Choice Mapping
  assert(BUSINESS_INPUT_TYPES.measurement.field_type === 'unit', 'Business choice "Measurement" maps to unit');
  assert(BUSINESS_INPUT_TYPES.amount.field_type === 'currency', 'Business choice "Amount" maps to currency');
  assert(BUSINESS_INPUT_TYPES.choose_one.field_type === 'dropdown', 'Business choice "Choose One" maps to dropdown');

  // 5. Validation Logic across Field Types
  const requiredShortTextDef: CustomFieldDef = {
    id: 'f1',
    workspace_id: 'ws1',
    entity_type: 'client',
    field_key: 'specialization',
    label: 'Specialization',
    field_type: 'short_text',
    required: true,
  };

  assert(validateCustomFieldValue(requiredShortTextDef, '') !== null, 'Rejects empty value on required field');
  assert(validateCustomFieldValue(requiredShortTextDef, 'Cardiology') === null, 'Accepts valid specialization');

  const numberDef: CustomFieldDef = {
    id: 'f3',
    workspace_id: 'ws1',
    entity_type: 'client',
    field_key: 'land_area',
    label: 'Land Area',
    field_type: 'unit',
    min_value: 0,
    max_value: 10000,
  };

  assert(validateCustomFieldValue(numberDef, -5) !== null, 'Rejects value below minimum');
  assert(validateCustomFieldValue(numberDef, 50) === null, 'Accepts measurement within range');

  // 6. Address Object Formatting & Universal Formatter
  const addressObj = {
    address_line1: '123 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    country: 'India',
  };

  assert(
    formatAddressObject(addressObj) === '123 MG Road, Bengaluru, Karnataka - 560001, India',
    'formatAddressObject formats structured address object cleanly'
  );
  assert(
    formatAddressObject(JSON.stringify(addressObj)) === '123 MG Road, Bengaluru, Karnataka - 560001, India',
    'formatAddressObject parses JSON string address cleanly'
  );
  assert(
    formatCustomFieldValue(addressObj, 'address') === '123 MG Road, Bengaluru, Karnataka - 560001, India',
    'formatCustomFieldValue handles address object correctly'
  );
  assert(
    formatAddressObject('123 MG Road, Bengaluru') === '123 MG Road, Bengaluru',
    'formatAddressObject handles legacy string address'
  );

  assert(formatCustomFieldValue(35, 'number') === '35', 'formatCustomFieldValue formats number: 35');
  assert(formatCustomFieldValue(10, 'unit', 'Acres') === '10 Acres', 'formatCustomFieldValue formats measurement: 10 Acres');
  assert(formatCustomFieldValue(1000, 'currency') === '₹1,000', 'formatCustomFieldValue formats currency: ₹1,000');
  assert(formatCustomFieldValue(['Website', 'SEO'], 'checkbox_group') === 'Website, SEO', 'formatCustomFieldValue formats checkbox group');

  // Verify non-overwriting unique field creation
  const field1 = await saveCustomFieldDef({ workspace_id: 'ws1', entity_type: 'client', label: 'Age', field_type: 'number', default_value: '30' });
  const field2 = await saveCustomFieldDef({ workspace_id: 'ws1', entity_type: 'client', label: 'Designation', field_type: 'short_text', default_value: 'Lecturer' });
  const field3 = await saveCustomFieldDef({ workspace_id: 'ws1', entity_type: 'client', label: 'Gender', field_type: 'radio', default_value: 'Male' });

  assert(field1.id !== field2.id && field2.id !== field3.id, 'Creating multiple fields generates unique IDs for each field');
  assert(field1.field_key !== field2.field_key && field2.field_key !== field3.field_key, 'Creating multiple fields generates unique field_keys without overwriting');

  console.log(`=== TEST VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests();
