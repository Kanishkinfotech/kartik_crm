import React, { useState, useEffect } from 'react';
import type { CustomFieldDef, CustomFieldEntityType, ExtendedClientType } from '@/lib/types';
import { Button, Modal, Field, TextInput, Select } from '@/components/ui';
import {
  BUSINESS_INPUT_TYPES,
  CLIENT_TYPE_LABELS,
  DEFAULT_UNITS,
  saveCustomFieldDef,
  getCustomFieldValues,
  saveCustomFieldValues,
  slugifyKey,
  formatAddressObject,
} from '@/lib/customFields';

export function detectSmartFieldType(name: string): { inputTypeKey: string; optionsText?: string; unitOptionsText?: string } | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;

  // 1. DATE & TIME / APPOINTMENT
  if (q.includes('date & time') || q.includes('date and time') || q.includes('appointment') || q.includes('meeting time')) {
    return { inputTypeKey: 'datetime' };
  }
  // 2. TIME / TIME SLOT / HOUR / CLOCK / SHIFT / TIMING
  if (q.includes('time') || q.includes('slot') || q.includes('timing') || q.includes('clock') || q.includes('hour') || q.includes('shift')) {
    return { inputTypeKey: 'time' };
  }
  // 3. DATE / DOB / BIRTHDAY / ANNIVERSARY / CALENDAR / JOINING / EXPIRY
  if (q.includes('dob') || q.includes('birth') || q.includes('anniversary') || q.includes('date') || q.includes('schedule') || q.includes('joining') || q.includes('expiry') || q.includes('calendar')) {
    return { inputTypeKey: 'date' };
  }
  // 4. FILE / ATTACHMENT / DOCUMENT / PASSPORT / RESUME / KYC / PHOTO
  if (q.includes('file') || q.includes('document') || q.includes('doc') || q.includes('attachment') || q.includes('resume') || q.includes('photo') || q.includes('image') || q.includes('passport') || q.includes('proof') || q.includes('kyc') || q.includes('upload') || q.includes('certificate')) {
    return { inputTypeKey: 'file' };
  }
  // 5. PERCENTAGE / GST / TAX / DISCOUNT / COMMISSION / RATE / MARGIN
  if (q.includes('percentage') || q.includes('percent') || q.includes('%') || q.includes('commission') || q.includes('discount') || q.includes('tax') || q.includes('gst') || q.includes('vat') || q.includes('margin') || q.includes('interest')) {
    return { inputTypeKey: 'percentage' };
  }
  // 6. DECIMAL / RATING / SCORE / GPA
  if (q.includes('decimal') || q.includes('rating') || q.includes('score') || q.includes('cgpa') || q.includes('gpa')) {
    return { inputTypeKey: 'decimal' };
  }
  // 7. YES / NO / TOGGLE
  if (q === 'yes/no' || q === 'yes / no' || q.includes('is_') || q.startsWith('is ') || q.includes('active') || q.includes('verified') || q.includes('vip') || q.includes('agree') || q.includes('consent')) {
    return { inputTypeKey: 'yes_no' };
  }
  // 8. GENDER / MARITAL / BLOOD GROUP / RADIO
  if (q.includes('gender') || q === 'sex') {
    return { inputTypeKey: 'radio', optionsText: 'Male, Female, Other' };
  }
  if (q.includes('marital')) {
    return { inputTypeKey: 'radio', optionsText: 'Single, Married, Other' };
  }
  if (q.includes('blood')) {
    return { inputTypeKey: 'radio', optionsText: 'A+, A-, B+, B-, O+, O-, AB+, AB-' };
  }
  // 9. CHECKBOX GROUP / SERVICES / AMENITIES / SKILLS / INTERESTS
  if (q.includes('service') || q.includes('amenities') || q.includes('skill') || q.includes('interest') || q.includes('technolog') || q.includes('feature')) {
    return { inputTypeKey: 'checkbox_group', optionsText: 'Website, SEO, Graphic Design, Automation' };
  }
  // 10. SEARCHABLE DROPDOWN / LOCATION / COUNTRY / STATE / CITY
  if (q.includes('country') || q.includes('state') || q.includes('city') || q.includes('location') || q.includes('branch') || q.includes('district') || q.includes('zone')) {
    return { inputTypeKey: 'searchable_dropdown', optionsText: 'India, USA, UK, Canada, Australia' };
  }
  // 11. DROPDOWN / CATEGORY / PROPERTY TYPE / PRIORITY / STAGE
  if (q.includes('property type') || q.includes('property stage') || q.includes('stage') || q.includes('category') || q.includes('occupation') || q.includes('priority') || q.includes('level') || q.includes('industry')) {
    return { inputTypeKey: 'dropdown', optionsText: 'Residential, Commercial, Industrial' };
  }
  // 12. MULTI SELECT / LANGUAGES / TAGS
  if (q.includes('multi') || q.includes('language') || q.includes('tag')) {
    return { inputTypeKey: 'multi_select', optionsText: 'English, Hindi, Spanish, French' };
  }
  // 13. MEASUREMENT / LAND AREA / SIZE / HEIGHT / WEIGHT / DISTANCE
  if (q.includes('area') || q.includes('plot size') || q.includes('land') || q.includes('sq ft') || q.includes('square') || q.includes('height') || q.includes('weight') || q.includes('length') || q.includes('width') || q.includes('measurement') || q.includes('size')) {
    return { inputTypeKey: 'measurement', unitOptionsText: 'Acres, Square Feet, Square Meters, Hectares' };
  }
  // 14. AMOUNT / CURRENCY / FEE / PRICE / BUDGET / SALARY / COST / MONEY / CHARGE / RENT
  if (q.includes('fee') || q.includes('price') || q.includes('budget') || q.includes('amount') || q.includes('cost') || q.includes('salary') || q.includes('revenue') || q.includes('income') || q.includes('charge') || q.includes('payment') || q.includes('money') || q.includes('rent') || q.includes('deposit') || q.includes('rupee') || q.includes('dollar') || q.includes('inr') || q.includes('usd') || q.includes('₹') || q.includes('$')) {
    return { inputTypeKey: 'currency' };
  }
  // 15. NUMBER / AGE / COUNT / QUANTITY / EXPERIENCE / UNITS / FLOOR / ROOM
  if (q.includes('age') || q.includes('experience') || q.includes('count') || q.includes('quantity') || q.includes('qty') || q.includes('employees') || q.includes('units') || q.includes('number') || q.includes('no of') || q.includes('no. of') || q.includes('total') || q.includes('floor') || q.includes('room') || q.includes('flat')) {
    return { inputTypeKey: 'number' };
  }
  // 16. EMAIL
  if (q.includes('email') || q.includes('mail') || q.includes('gmail')) {
    return { inputTypeKey: 'email' };
  }
  // 17. PHONE / MOBILE / WHATSAPP / CONTACT / FAX
  if (q.includes('phone') || q.includes('mobile') || q.includes('whatsapp') || q.includes('contact') || q.includes('fax') || q.includes('call') || q.includes('tel')) {
    return { inputTypeKey: 'phone' };
  }
  // 18. WEBSITE / URL / LINK / PORTFOLIO / SOCIAL / LINKEDIN
  if (q.includes('website') || q.includes('url') || q.includes('link') || q.includes('portfolio') || q.includes('domain') || q.includes('linkedin') || q.includes('instagram') || q.includes('facebook') || q.includes('twitter') || q.includes('github') || q.includes('social')) {
    return { inputTypeKey: 'website' };
  }
  // 19. LONG TEXT / REQUIREMENT / NOTES / ADDRESS / REMARKS / FEEDBACK
  if (q.includes('requirement') || q.includes('note') || q.includes('description') || q.includes('detail') || q.includes('address') || q.includes('remark') || q.includes('comment') || q.includes('feedback') || q.includes('instruction') || q.includes('history') || q.includes('summary')) {
    return { inputTypeKey: 'long_text' };
  }
  // 20. SHORT TEXT / NAME / TITLE / DESIGNATION / COMPANY / BRAND / PAN / AADHAR / CODE
  if (q.includes('name') || q.includes('person') || q.includes('title') || q.includes('designation') || q.includes('company') || q.includes('business') || q.includes('firm') || q.includes('pan') || q.includes('aadhar') || q.includes('code') || q.includes('id') || q.includes('serial') || q.includes('ref')) {
    return { inputTypeKey: 'short_text' };
  }

  return { inputTypeKey: 'short_text' };
}

export function CustomFieldBuilderModal({
  open,
  onClose,
  workspaceId,
  entityType = 'client',
  selectedClientType = 'business',
  existingField,
  targetEntityId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  entityType?: CustomFieldEntityType;
  selectedClientType?: ExtendedClientType;
  existingField?: CustomFieldDef;
  targetEntityId?: string;
  onSaved: (field: CustomFieldDef) => void;
}) {
  const [label, setLabel] = useState('');
  const [inputTypeKey, setInputTypeKey] = useState('short_text');
  const [scopeChoice, setScopeChoice] = useState<'record' | 'reusable'>('record');
  const [optionsText, setOptionsText] = useState('');
  const [unitOptionsText, setUnitOptionsText] = useState(DEFAULT_UNITS.join(', '));
  const [placeholder, setPlaceholder] = useState('');
  const [helpText, setHelpText] = useState('');
  const [required, setRequired] = useState(false);

  // Initial Value State for Target Record
  const [initialValue, setInitialValue] = useState<any>('');
  const [initialUnit, setInitialUnit] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingField && open) {
      setLabel(existingField.label);
      setRequired(!!existingField.required);
      setScopeChoice(existingField.scope_type || 'reusable');
      setOptionsText(existingField.options ? existingField.options.join(', ') : '');
      setUnitOptionsText(existingField.unit_config ? existingField.unit_config.join(', ') : DEFAULT_UNITS.join(', '));
      setPlaceholder(existingField.placeholder || '');
      setHelpText(existingField.help_text || '');

      const matchKey = Object.keys(BUSINESS_INPUT_TYPES).find(
        (k) => BUSINESS_INPUT_TYPES[k].field_type === existingField.field_type
      );
      if (matchKey) setInputTypeKey(matchKey);

      if (targetEntityId) {
        getCustomFieldValues(workspaceId, entityType, targetEntityId).then((vals) => {
          const valObj = vals[existingField.id];
          if (valObj) {
            setInitialValue(valObj.value ?? '');
            setInitialUnit(valObj.unit ?? '');
          }
        });
      }
    } else if (open) {
      setLabel('');
      setInputTypeKey('short_text');
      setScopeChoice(targetEntityId ? 'record' : 'reusable');
      setOptionsText('');
      setUnitOptionsText(DEFAULT_UNITS.join(', '));
      setPlaceholder('');
      setHelpText('');
      setRequired(false);
      setInitialValue('');
      setInitialUnit('');
      setError(null);
    }
  }, [existingField, open, targetEntityId, workspaceId, entityType]);

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    if (!existingField) {
      const smartMatch = detectSmartFieldType(newLabel);
      if (smartMatch) {
        setInputTypeKey(smartMatch.inputTypeKey);
        setOptionsText(smartMatch.optionsText || '');
        if (smartMatch.unitOptionsText) {
          setUnitOptionsText(smartMatch.unitOptionsText);
        }
      }
    }
  };

  const isChoiceType = ['dropdown', 'searchable_dropdown', 'radio', 'checkbox_group', 'multi_select'].includes(inputTypeKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setError('Please enter a field name.');
      return;
    }
    if (targetEntityId && (initialValue === undefined || initialValue === null || initialValue === '' || (Array.isArray(initialValue) && initialValue.length === 0))) {
      setError('Please enter a value.');
      return;
    }
    setBusy(true);
    setError(null);

    const inputConfig = BUSINESS_INPUT_TYPES[inputTypeKey] || BUSINESS_INPUT_TYPES['short_text'];
    const fieldKey = existingField?.field_key || slugifyKey(label);

    const parsedOptions = optionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedUnits = unitOptionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const targetScope = targetEntityId ? 'record' : scopeChoice;
    const initialValStr = initialValue !== undefined && initialValue !== null && initialValue !== '' ? (typeof initialValue === 'object' ? JSON.stringify(initialValue) : String(initialValue)) : undefined;

    try {
      const saved = await saveCustomFieldDef({
        id: existingField?.id,
        workspace_id: workspaceId,
        entity_type: entityType,
        field_key: fieldKey,
        label: label.trim(),
        field_type: inputConfig.field_type,
        category: 'other',
        placeholder: placeholder.trim() || undefined,
        help_text: helpText.trim() || undefined,
        default_value: initialValStr,
        required,
        show_by_default: false,
        reusable: targetScope === 'reusable',
        scope_type: targetScope,
        scope_entity_id: targetScope === 'record' ? targetEntityId : undefined,
        options: parsedOptions,
        unit_config: parsedUnits.length > 0 ? parsedUnits : DEFAULT_UNITS,
        status: 'active',
      });

      // Save initial value for targetEntityId if present
      if (targetEntityId && initialValue !== undefined && initialValue !== null && initialValue !== '') {
        const existingVals = await getCustomFieldValues(workspaceId, entityType, targetEntityId);
        const updatedVals = {
          ...existingVals,
          [saved.id]: {
            value: initialValue,
            unit: initialUnit || (parsedUnits[0] || undefined),
          },
          [saved.field_key]: {
            value: initialValue,
            unit: initialUnit || (parsedUnits[0] || undefined),
          },
        };
        await saveCustomFieldValues(workspaceId, entityType, targetEntityId, updatedVals);
      }

      setBusy(false);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save custom field.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existingField ? 'Edit Custom Field' : 'Add Custom Field'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* 1. Custom Field Name */}
        <Field label="Custom Field Name" required>
          <TextInput
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Age, Designation, Land Area, Date of Birth"
            required
            autoFocus
          />
        </Field>

        {/* 2. Input / Control Type */}
        <Field label="Input / Control Type" required>
          <Select value={inputTypeKey} onChange={(e) => setInputTypeKey(e.target.value)}>
            {Object.entries(BUSINESS_INPUT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* TYPE-SPECIFIC OPTIONS */}
        {isChoiceType && (
          <Field label="Options / Choices (Comma-separated)" required>
            <TextInput
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="e.g. Male, Female, Other"
              required
            />
          </Field>
        )}

        {inputTypeKey === 'measurement' && (
          <Field label="Allowed Units (Comma-separated)">
            <TextInput
              value={unitOptionsText}
              onChange={(e) => setUnitOptionsText(e.target.value)}
              placeholder="Acres, Square Feet, Square Meters, Hectares"
            />
          </Field>
        )}

        {/* 3. DYNAMIC VALUE INPUT */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 space-y-2">
          <Field label="Value" required>
            {inputTypeKey === 'radio' ? (
              <div className="flex flex-wrap gap-4 pt-1">
                {(optionsText ? optionsText.split(',') : ['Male', 'Female', 'Other'])
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="builder_radio_val"
                        value={opt}
                        checked={initialValue === opt}
                        onChange={() => setInitialValue(opt)}
                        className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
              </div>
            ) : inputTypeKey === 'checkbox_group' || inputTypeKey === 'multi_select' ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {(optionsText ? optionsText.split(',') : ['Website Development', 'SEO', 'Graphic Design'])
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((opt) => {
                    const selectedList: string[] = Array.isArray(initialValue) ? initialValue : [];
                    const checked = selectedList.includes(opt);
                    const toggle = () => {
                      setInitialValue(checked ? selectedList.filter((i) => i !== opt) : [...selectedList, opt]);
                    };
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={toggle}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '} {opt}
                      </button>
                    );
                  })}
              </div>
            ) : isChoiceType ? (
              <Select
                value={initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
              >
                <option value="">Select choice...</option>
                {optionsText
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
              </Select>
            ) : inputTypeKey === 'yes_no' || inputTypeKey === 'checkbox' ? (
              <Select
                value={String(initialValue)}
                onChange={(e) => setInitialValue(e.target.value === 'true' || e.target.value === 'Yes')}
              >
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </Select>
            ) : inputTypeKey === 'measurement' ? (
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  type="number"
                  value={initialValue}
                  onChange={(e) => setInitialValue(e.target.value)}
                  placeholder="e.g. 10"
                />
                <Select
                  value={initialUnit || (unitOptionsText.split(',')[0] ? unitOptionsText.split(',')[0].trim() : 'Acres')}
                  onChange={(e) => setInitialUnit(e.target.value)}
                >
                  {unitOptionsText
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                </Select>
              </div>
            ) : inputTypeKey === 'address' || label.toLowerCase().includes('address') ? (
              <div className="space-y-2">
                <TextInput
                  value={typeof initialValue === 'object' ? (initialValue.address_line1 || initialValue.street || '') : (initialValue || '')}
                  onChange={(e) => {
                    const line1 = e.target.value;
                    if (typeof initialValue === 'object') {
                      setInitialValue({ ...initialValue, address_line1: line1 });
                    } else {
                      setInitialValue(line1);
                    }
                  }}
                  placeholder="Street Address / Line 1 (e.g. 123 MG Road)"
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextInput
                    value={typeof initialValue === 'object' ? (initialValue.city || '') : ''}
                    onChange={(e) => {
                      const c = e.target.value;
                      const curr = typeof initialValue === 'object' ? initialValue : { address_line1: String(initialValue || '') };
                      setInitialValue({ ...curr, city: c });
                    }}
                    placeholder="City (e.g. Bengaluru)"
                  />
                  <TextInput
                    value={typeof initialValue === 'object' ? (initialValue.state || '') : ''}
                    onChange={(e) => {
                      const s = e.target.value;
                      const curr = typeof initialValue === 'object' ? initialValue : { address_line1: String(initialValue || '') };
                      setInitialValue({ ...curr, state: s });
                    }}
                    placeholder="State (e.g. Karnataka)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TextInput
                    value={typeof initialValue === 'object' ? (initialValue.postal_code || initialValue.zip || initialValue.pincode || '') : ''}
                    onChange={(e) => {
                      const p = e.target.value;
                      const curr = typeof initialValue === 'object' ? initialValue : { address_line1: String(initialValue || '') };
                      setInitialValue({ ...curr, postal_code: p });
                    }}
                    placeholder="Postal Code (e.g. 560001)"
                  />
                  <TextInput
                    value={typeof initialValue === 'object' ? (initialValue.country || '') : ''}
                    onChange={(e) => {
                      const c = e.target.value;
                      const curr = typeof initialValue === 'object' ? initialValue : { address_line1: String(initialValue || '') };
                      setInitialValue({ ...curr, country: c });
                    }}
                    placeholder="Country (e.g. India)"
                  />
                </div>
              </div>
            ) : inputTypeKey === 'long_text' ? (
              <textarea
                value={initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
                placeholder={`Enter ${label || 'value'}...`}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <TextInput
                type={inputTypeKey === 'number' || inputTypeKey === 'decimal' || inputTypeKey === 'currency' || inputTypeKey === 'percentage' ? 'number' : inputTypeKey === 'date' ? 'date' : inputTypeKey === 'datetime' ? 'datetime-local' : inputTypeKey === 'time' ? 'time' : 'text'}
                value={typeof initialValue === 'object' ? formatAddressObject(initialValue) : initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
                placeholder={`Enter ${label || 'value'}...`}
              />
            )}
          </Field>
        </div>

        {/* 4. Required Toggle */}
        <div className="pt-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Make this field required</span>
          </label>
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy} className="bg-blue-600 text-white">
            {busy ? 'Saving...' : 'Save Custom Field'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
