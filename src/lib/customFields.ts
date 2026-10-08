import { supabase } from './supabase';
import type {
  CustomFieldDef,
  CustomFieldValue,
  CustomFieldEntityType,
  CustomFieldType,
  CustomFieldCategory,
  ExtendedClientType,
} from '@/lib/types';

export const DEFAULT_UNITS = [
  'Acres',
  'Square Feet',
  'Square Meters',
  'Square Yards',
  'Hectares',
  'Feet',
  'Meters',
  'Units',
  'Hours',
  'Months',
];

export const CLIENT_TYPE_LABELS: Record<ExtendedClientType, string> = {
  individual: 'Individual',
  business: 'Business / Company',
  doctor: 'Doctor / Clinic',
  real_estate: 'Real Estate',
  agency: 'Agency',
  education: 'Education / Institution',
  retail: 'Retail',
  professional: 'Professional / Consultant',
  other: 'Other',
};

// Non-Technical User Choices mapped to internal Field Types
export const BUSINESS_INPUT_TYPES: Record<string, { field_type: CustomFieldType; label: string; description: string }> = {
  short_text: { field_type: 'short_text', label: 'Short Text', description: 'Single line text (e.g. Specialization, Registration No)' },
  long_text: { field_type: 'long_text', label: 'Long Text / Textarea', description: 'Multi-line detailed text (e.g. Requirement, Notes)' },
  number: { field_type: 'number', label: 'Number', description: 'Whole number count (e.g. Age, Employee Count)' },
  decimal: { field_type: 'decimal', label: 'Decimal', description: 'Decimal number value (e.g. 3.5, 0.75)' },
  currency: { field_type: 'currency', label: 'Amount / Currency', description: 'Financial value in Currency (e.g. Consultation Fee ₹1000)' },
  percentage: { field_type: 'percentage', label: 'Percentage', description: 'Percentage rate value (e.g. 15%)' },
  date: { field_type: 'date', label: 'Date', description: 'Calendar date picker (e.g. Date of Birth)' },
  datetime: { field_type: 'datetime', label: 'Date & Time', description: 'Date and time picker' },
  time: { field_type: 'time', label: 'Time', description: 'Time picker' },
  email: { field_type: 'email', label: 'Email', description: 'Email address' },
  phone: { field_type: 'phone', label: 'Phone', description: 'Phone or mobile number' },
  website: { field_type: 'website', label: 'Website / URL', description: 'Website URL address (e.g. https://example.com)' },
  dropdown: { field_type: 'dropdown', label: 'Dropdown', description: 'Single choice dropdown list (e.g. Property Type)' },
  searchable_dropdown: { field_type: 'searchable_dropdown', label: 'Searchable Dropdown', description: 'Searchable single choice dropdown list' },
  radio: { field_type: 'radio', label: 'Radio Buttons', description: 'Radio selection buttons (e.g. Gender: Male / Female / Other)' },
  checkbox: { field_type: 'checkbox', label: 'Checkbox', description: 'Single check box toggle' },
  checkbox_group: { field_type: 'checkbox_group', label: 'Checkbox Group', description: 'Multiple check box options (e.g. Services Required)' },
  multi_select: { field_type: 'multi_select', label: 'Multi Select', description: 'Select multiple choices from a list' },
  yes_no: { field_type: 'yes_no', label: 'Yes / No', description: 'Simple Yes or No choice' },
  measurement: { field_type: 'unit', label: 'Measurement', description: 'Value with unit (e.g. Land Area: 10 Acres)' },
  file: { field_type: 'file', label: 'File Upload', description: 'File attachment or document' },
};

const memoryStorage: Record<string, string> = {};

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback to memory
  }
  return memoryStorage[key] || null;
}

function safeSetStorage(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryStorage[key] = val;
}

// Aliases for backwards compatibility
BUSINESS_INPUT_TYPES.text = BUSINESS_INPUT_TYPES.short_text;
BUSINESS_INPUT_TYPES.amount = BUSINESS_INPUT_TYPES.currency;
BUSINESS_INPUT_TYPES.choose_one = BUSINESS_INPUT_TYPES.dropdown;
BUSINESS_INPUT_TYPES.choose_multiple = BUSINESS_INPUT_TYPES.multi_select;

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text / Textarea',
  number: 'Number',
  decimal: 'Decimal',
  currency: 'Amount / Currency',
  percentage: 'Percentage (%)',
  radio: 'Radio Buttons',
  dropdown: 'Dropdown',
  searchable_dropdown: 'Searchable Dropdown',
  multi_select: 'Multi Select',
  checkbox: 'Checkbox',
  checkbox_group: 'Checkbox Group',
  yes_no: 'Yes / No',
  date: 'Date',
  datetime: 'Date & Time',
  time: 'Time',
  email: 'Email',
  phone: 'Phone',
  website: 'Website / URL',
  address: 'Address',
  file: 'File Upload',
  unit: 'Measurement',
};

/**
 * Format address objects or legacy string addresses into clean human-readable strings.
 * Example: { address_line1: '123 MG Road', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001', country: 'India' }
 * -> "123 MG Road, Bengaluru, Karnataka - 560001, India"
 */
export function formatAddressObject(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  let targetObj = val;
  if (typeof val === 'string' && val.trim().startsWith('{')) {
    try {
      targetObj = JSON.parse(val);
    } catch {
      // Keep original string if not valid JSON
    }
  }

  if (typeof targetObj === 'string') return targetObj;

  if (typeof targetObj === 'object' && targetObj !== null) {
    const line1 = (targetObj.address_line1 || targetObj.street || targetObj.line1 || targetObj.address || targetObj.street_address || '').trim();
    const line2 = (targetObj.address_line2 || targetObj.line2 || targetObj.suite || targetObj.apartment || '').trim();
    const city = (targetObj.city || targetObj.town || targetObj.district || '').trim();
    const state = (targetObj.state || targetObj.province || targetObj.region || '').trim();
    const postal = (targetObj.postal_code || targetObj.zip || targetObj.pincode || targetObj.zip_code || targetObj.postalCode || targetObj.postal || '').trim();
    const country = (targetObj.country || '').trim();

    const parts: string[] = [];
    if (line1) parts.push(line1);
    if (line2) parts.push(line2);

    let cityStateZip = '';
    if (city) cityStateZip += city;
    if (state) cityStateZip += (cityStateZip ? `, ${state}` : state);
    if (postal) cityStateZip += (cityStateZip ? ` - ${postal}` : postal);

    if (cityStateZip) parts.push(cityStateZip);
    if (country) parts.push(country);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    const nonNullValues = Object.values(targetObj).filter((v) => v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'object');
    if (nonNullValues.length > 0) {
      return nonNullValues.join(', ');
    }
  }
  return String(val);
}

/**
 * Safe value lookup matching field ID, field key, or slugified label.
 */
export function getCustomFieldValueForField(
  valuesMap: Record<string, { value: any; unit?: string }>,
  field: CustomFieldDef
): { value: any; unit?: string } | undefined {
  if (!field) return undefined;

  if (valuesMap) {
    if (valuesMap[field.id]) return valuesMap[field.id];
    if (field.field_key && valuesMap[field.field_key]) return valuesMap[field.field_key];

    const slug = slugifyKey(field.label);
    if (valuesMap[slug]) return valuesMap[slug];

    const lowerLabel = (field.label || '').toLowerCase().trim();
    for (const [k, v] of Object.entries(valuesMap)) {
      if (k.toLowerCase().trim() === lowerLabel || slugifyKey(k) === slug) {
        return v;
      }
    }
  }

  if (field.default_value !== undefined && field.default_value !== null && field.default_value !== '') {
    return { value: field.default_value };
  }

  return undefined;
}

/**
 * Reusable universal custom field value display formatter.
 */
export function formatCustomFieldValue(val: any, fieldType?: string, unit?: string | null): string {
  if (val === null || val === undefined || val === '') return '';

  // Handle object values (e.g. Address objects, nested value wrapper)
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (val.value !== undefined && val.value !== null) {
      return formatCustomFieldValue(val.value, fieldType, val.unit || unit);
    }
    return formatAddressObject(val);
  }

  if (Array.isArray(val)) {
    return val.map((v) => (typeof v === 'object' ? formatAddressObject(v) : String(v))).join(', ');
  }

  const typeStr = (fieldType || '').toLowerCase();

  if (typeStr === 'unit' || typeStr === 'measurement') {
    return `${val} ${unit || ''}`.trim();
  }

  if (typeStr === 'currency' || typeStr === 'amount') {
    const num = Number(val);
    return isNaN(num) ? String(val) : `₹${num.toLocaleString('en-IN')}`;
  }

  if (typeStr === 'percentage') {
    return `${val}%`;
  }

  if (typeStr === 'date' || typeStr === 'datetime') {
    try {
      const strVal = String(val).trim();
      const parts = strVal.split(/[-/]/);
      if (parts.length === 3) {
        let year = Number(parts[0]);
        let month = Number(parts[1]) - 1;
        let day = Number(parts[2]);
        if (parts[0].length === 2 && parts[2].length === 4) {
          day = Number(parts[0]);
          month = Number(parts[1]) - 1;
          year = Number(parts[2]);
        }
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      }

      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch {
      // fallback
    }
    return String(val);
  }

  return String(val);
}

export const CATEGORY_LABELS: Record<CustomFieldCategory, string> = {
  personal: 'Personal',
  business: 'Business',
  contact: 'Contact',
  real_estate: 'Real Estate',
  healthcare: 'Healthcare',
  marketing: 'Marketing',
  website: 'Website',
  finance: 'Finance',
  other: 'Other',
};

// ----------------------------------------------------------------------
// PRESET CLIENT DETAILS PER CLIENT TYPE
// ----------------------------------------------------------------------
export const PRESET_CLIENT_TYPE_DEFS: Record<ExtendedClientType, Omit<CustomFieldDef, 'id' | 'workspace_id'>[]> = {
  doctor: [],
  real_estate: [],
  individual: [],
  business: [],
  agency: [],
  education: [],
  retail: [],
  professional: [],
  other: [],
};

/**
 * Generate machine key from label
 */
export function slugifyKey(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `detail_${Date.now()}`;
}

/**
 * Calculate Age from Date of Birth string (YYYY-MM-DD)
 */
export function calculateAgeFromDOB(dobString: string): number | null {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// Local Storage Keys
function getDefsStorageKey(workspaceId: string, entityType: CustomFieldEntityType): string {
  return `k1_cf_defs_${workspaceId}_${entityType}`;
}

function getValsStorageKey(workspaceId: string, entityType: CustomFieldEntityType, entityId: string): string {
  return `k1_cf_vals_${workspaceId}_${entityType}_${entityId}`;
}

/**
 * Fetch Custom Field / Detail Definitions for a workspace and entity type.
 * Automatically seeds preset client type definitions if workspace has none yet.
 */
export async function getCustomFieldDefs(
  workspaceId: string,
  entityType: CustomFieldEntityType,
  includeArchived = false,
  recordEntityId?: string
): Promise<CustomFieldDef[]> {
  if (!workspaceId) return [];

  let resultDefs: CustomFieldDef[] = [];

  try {
    let query = supabase
      .from('custom_field_definitions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', entityType)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!includeArchived) {
      query = query.eq('status', 'active');
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      resultDefs = data.map((d: any) => ({
        ...d,
        options: d.options_json || d.options || [],
        unit_config: d.unit_config_json || d.unit_config || DEFAULT_UNITS,
      })) as CustomFieldDef[];
    }
  } catch {
    // Fallback
  }

  if (resultDefs.length === 0) {
    const cached = safeGetStorage(getDefsStorageKey(workspaceId, entityType));
    if (cached) {
      resultDefs = JSON.parse(cached) as CustomFieldDef[];
    }
  }

  // Sanitize field definitions to fix any incorrectly assigned field_types for standard labels
  resultDefs = resultDefs.map((def) => {
    const lbl = (def.label || '').trim().toLowerCase();
    if ((lbl === 'name' || lbl === 'client name' || lbl === 'full name' || lbl === 'contact name' || lbl === 'first name' || lbl === 'last name') && def.field_type !== 'short_text') {
      return { ...def, field_type: 'short_text' };
    }
    return def;
  });

  // Filter out any legacy preset defs (IDs starting with cf_doctor_, cf_real_estate_, etc.)
  resultDefs = resultDefs.filter((d) => !d.id.startsWith('cf_doctor_') && !d.id.startsWith('cf_real_estate_') && !d.id.startsWith('cf_individual_') && !d.id.startsWith('cf_business_') && !d.id.startsWith('cf_agency_') && !d.id.startsWith('cf_education_') && !d.id.startsWith('cf_retail_') && !d.id.startsWith('cf_professional_'));

  // Scope filtering: Record-specific fields only show on their matching recordEntityId
  resultDefs = resultDefs.filter((d) => {
    if (d.scope_type === 'record') {
      return recordEntityId ? d.scope_entity_id === recordEntityId : false;
    }
    return true;
  });

  return includeArchived ? resultDefs : resultDefs.filter((d) => (d.status || 'active') === 'active');
}

/**
 * Save or Upsert a Custom Field / Detail Definition.
 */
export async function saveCustomFieldDef(def: Omit<CustomFieldDef, 'id' | 'field_key'> & { id?: string; field_key?: string }): Promise<CustomFieldDef> {
  const isNew = !def.id;
  const id = def.id || `cf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const baseKey = slugifyKey(def.label) || 'field';
  const fieldKey = !isNew && def.field_key
    ? def.field_key
    : `${baseKey}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const payload: CustomFieldDef = {
    ...def,
    id,
    field_key: fieldKey,
    category: def.category || 'other',
    options: def.options || [],
    unit_config: def.unit_config || DEFAULT_UNITS,
    status: def.status || 'active',
    reusable: def.reusable ?? (def.scope_type !== 'record'),
    scope_type: def.scope_type || 'reusable',
  };

  const dbPayload = {
    id: payload.id,
    workspace_id: payload.workspace_id,
    entity_type: payload.entity_type,
    field_key: payload.field_key,
    label: payload.label,
    field_type: payload.field_type,
    category: payload.category,
    placeholder: payload.placeholder || null,
    help_text: payload.help_text || null,
    required: payload.required || false,
    default_value: payload.default_value || null,
    options_json: payload.options || [],
    unit_config_json: payload.unit_config || DEFAULT_UNITS,
    min_value: payload.min_value ?? null,
    max_value: payload.max_value ?? null,
    char_limit: payload.char_limit ?? null,
    display_order: payload.display_order ?? 0,
    show_by_default: payload.show_by_default || false,
    reusable: payload.reusable,
    scope_type: payload.scope_type,
    scope_entity_id: payload.scope_entity_id || null,
    status: payload.status,
    updated_at: new Date().toISOString(),
  };

  try {
    await supabase.from('custom_field_definitions').upsert(dbPayload);
  } catch {
    // Local fallback
  }

  const existing = await getCustomFieldDefs(def.workspace_id, def.entity_type, true);
  const updated = existing.filter((d) => d.id !== payload.id);
  updated.push(payload);
  safeSetStorage(getDefsStorageKey(def.workspace_id, def.entity_type), JSON.stringify(updated));

  return payload;
}

/**
 * Archive a custom detail definition safely.
 */
export async function archiveCustomFieldDef(workspaceId: string, entityType: CustomFieldEntityType, id: string): Promise<void> {
  try {
    await supabase
      .from('custom_field_definitions')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
  } catch {
    // Silently fallback
  }

  const existing = await getCustomFieldDefs(workspaceId, entityType, true);
  const updated = existing.map((d) => (d.id === id ? { ...d, status: 'archived' as const } : d));
  safeSetStorage(getDefsStorageKey(workspaceId, entityType), JSON.stringify(updated));
}

/**
 * Fetch Custom Field / Detail Values for an entity.
 */
export async function getCustomFieldValues(
  workspaceId: string,
  entityType: CustomFieldEntityType,
  entityId: string
): Promise<Record<string, { value: any; unit?: string }>> {
  if (!workspaceId || !entityId) return {};

  try {
    const { data, error } = await supabase
      .from('custom_field_values')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    if (!error && data) {
      const result: Record<string, { value: any; unit?: string }> = {};
      data.forEach((row: any) => {
        result[row.field_definition_id] = {
          value: row.value,
          unit: row.unit || undefined,
        };
      });
      safeSetStorage(getValsStorageKey(workspaceId, entityType, entityId), JSON.stringify(result));
      return result;
    }
  } catch {
    // Fallback
  }

  const cached = safeGetStorage(getValsStorageKey(workspaceId, entityType, entityId));
  return cached ? JSON.parse(cached) : {};
}

/**
 * Save Custom Detail Values for an entity record.
 */
export async function saveCustomFieldValues(
  workspaceId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  valuesMap: Record<string, { value: any; unit?: string }>
): Promise<void> {
  if (!workspaceId || !entityId) return;

  const rowsToInsert = Object.entries(valuesMap).map(([fieldDefId, valObj]) => ({
    workspace_id: workspaceId,
    entity_type: entityType,
    entity_id: entityId,
    field_definition_id: fieldDefId,
    value: valObj.value,
    unit: valObj.unit || null,
    updated_at: new Date().toISOString(),
  }));

  if (rowsToInsert.length > 0) {
    try {
      await supabase.from('custom_field_values').upsert(rowsToInsert, {
        onConflict: 'workspace_id,entity_type,entity_id,field_definition_id',
      });
    } catch {
      // Local storage fallback handled below
    }
  }

  safeSetStorage(getValsStorageKey(workspaceId, entityType, entityId), JSON.stringify(valuesMap));
}

/**
 * Delete a custom field definition and clean up its stored values.
 */
export async function deleteCustomFieldDef(
  workspaceId: string,
  entityType: CustomFieldEntityType,
  fieldId: string
): Promise<void> {
  if (!workspaceId || !fieldId) return;

  try {
    await supabase.from('custom_field_values').delete().eq('field_definition_id', fieldId);
    await supabase.from('custom_field_definitions').delete().eq('id', fieldId);
  } catch {
    // Fallback
  }

  const defsKey = getDefsStorageKey(workspaceId, entityType);
  const cachedDefs = safeGetStorage(defsKey);
  if (cachedDefs) {
    const parsed: CustomFieldDef[] = JSON.parse(cachedDefs);
    const filtered = parsed.filter((d) => d.id !== fieldId);
    safeSetStorage(defsKey, JSON.stringify(filtered));
  }
}

/**
 * Remove value for a specific field on a single record.
 */
export async function deleteCustomFieldValue(
  workspaceId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  fieldId: string
): Promise<void> {
  if (!workspaceId || !entityId || !fieldId) return;

  try {
    await supabase
      .from('custom_field_values')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('field_definition_id', fieldId);
  } catch {
    // Fallback
  }

  const valsKey = getValsStorageKey(workspaceId, entityType, entityId);
  const cachedVals = safeGetStorage(valsKey);
  if (cachedVals) {
    const parsed = JSON.parse(cachedVals);
    delete parsed[fieldId];
    safeSetStorage(valsKey, JSON.stringify(parsed));
  }
}

/**
 * Copy Lead custom fields to Client record on Conversion without data loss or duplicates.
 */
export async function convertLeadCustomValuesToClient(
  workspaceId: string,
  leadId: string,
  clientId: string
): Promise<void> {
  if (!workspaceId || !leadId || !clientId) return;

  const leadDefs = await getCustomFieldDefs(workspaceId, 'lead', true);
  const clientDefs = await getCustomFieldDefs(workspaceId, 'client', true);
  const leadValues = await getCustomFieldValues(workspaceId, 'lead', leadId);

  const clientValuesToSave: Record<string, { value: any; unit?: string }> = {};

  for (const [fieldDefId, valObj] of Object.entries(leadValues)) {
    const leadDef = leadDefs.find((d) => d.id === fieldDefId);
    if (!leadDef) continue;

    let targetClientDef = clientDefs.find(
      (c) => c.field_key === leadDef.field_key || c.label.toLowerCase() === leadDef.label.toLowerCase()
    );

    if (!targetClientDef) {
      targetClientDef = await saveCustomFieldDef({
        workspace_id: workspaceId,
        entity_type: 'client',
        field_key: leadDef.field_key,
        label: leadDef.label,
        field_type: leadDef.field_type,
        category: leadDef.category,
        placeholder: leadDef.placeholder,
        help_text: leadDef.help_text,
        required: leadDef.required,
        default_value: leadDef.default_value,
        options: leadDef.options,
        unit_config: leadDef.unit_config,
        reusable: leadDef.reusable,
        scope_type: leadDef.scope_type,
        scope_entity_id: leadDef.scope_type === 'record' ? clientId : undefined,
      });
    }

    clientValuesToSave[targetClientDef.id] = {
      value: valObj.value,
      unit: valObj.unit,
    };
  }

  await saveCustomFieldValues(workspaceId, 'client', clientId, clientValuesToSave);
}

/**
 * Validate value against Custom Detail Definition.
 */
export function validateCustomFieldValue(def: CustomFieldDef, value: any): string | null {
  if (def.required && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
    return `${def.label} is required.`;
  }

  if (!value && value !== 0 && value !== false) return null;

  if (def.field_type === 'number' || def.field_type === 'decimal' || def.field_type === 'currency' || def.field_type === 'unit') {
    const num = Number(value);
    if (isNaN(num)) return `${def.label} must be a valid number.`;
    if (def.min_value !== undefined && def.min_value !== null && num < def.min_value) {
      return `${def.label} minimum value is ${def.min_value}.`;
    }
    if (def.max_value !== undefined && def.max_value !== null && num > def.max_value) {
      return `${def.label} maximum value is ${def.max_value}.`;
    }
  }

  if (def.field_type === 'email' && typeof value === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return `${def.label} must be a valid email address.`;
  }

  if (def.field_type === 'website' && typeof value === 'string' && value.trim() !== '') {
    try {
      new URL(value.startsWith('http') ? value : `https://${value}`);
    } catch {
      return `${def.label} must be a valid web URL.`;
    }
  }

  if (def.char_limit && typeof value === 'string' && value.length > def.char_limit) {
    return `${def.label} cannot exceed ${def.char_limit} characters.`;
  }

  return null;
}
