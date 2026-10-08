import React, { useState, useEffect, useMemo } from 'react';
import type { CustomFieldDef, CustomFieldEntityType, ExtendedClientType } from '@/lib/types';
import { TextInput, Select, Button, Field, TextArea } from '@/components/ui';
import {
  getCustomFieldDefs,
  calculateAgeFromDOB,
  deleteCustomFieldDef,
  DEFAULT_UNITS,
  CLIENT_TYPE_LABELS,
} from '@/lib/customFields';
import { Plus, Sparkles, X, Sliders, Search, Upload } from 'lucide-react';
import { AddCustomFieldModal } from './AddCustomFieldModal';
import { validateWebsiteUrl, validatePhoneNumber } from '@/lib/contactValidation';

export function CustomFieldsSection({
  workspaceId,
  entityType = 'client',
  selectedClientType = 'business',
  entityId,
  valuesMap = {},
  onChangeValues,
}: {
  workspaceId: string;
  entityType?: CustomFieldEntityType;
  selectedClientType?: ExtendedClientType;
  entityId?: string;
  valuesMap: Record<string, { value: any; unit?: string }>;
  onChangeValues: (vals: Record<string, { value: any; unit?: string }>) => void;
}) {
  const [allDefs, setAllDefs] = useState<CustomFieldDef[]>([]);
  const [activeDefIds, setActiveDefIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!workspaceId) return;
    getCustomFieldDefs(workspaceId, entityType).then((defs) => {
      setAllDefs(defs);

      // Active fields = fields created specifically for this entityId OR fields with saved values for this entityId
      const initialActiveIds = defs
        .filter((d) => {
          if (d.scope_type === 'record' && d.scope_entity_id === entityId) return true;
          if (valuesMap[d.id] !== undefined && valuesMap[d.id]?.value !== undefined && valuesMap[d.id]?.value !== '' && valuesMap[d.id]?.value !== null) return true;
          return false;
        })
        .map((d) => d.id);

      setActiveDefIds(Array.from(new Set(initialActiveIds)));
    });
  }, [workspaceId, entityType, entityId]);

  const activeDefs = useMemo(() => {
    return allDefs.filter((d) => activeDefIds.includes(d.id));
  }, [allDefs, activeDefIds]);

  const handleValueChange = (defId: string, val: any, unit?: string) => {
    const currentObj = valuesMap[defId] || {};
    const updated = {
      ...valuesMap,
      [defId]: {
        value: val,
        unit: unit !== undefined ? unit : currentObj.unit,
      },
    };

    // DOB age auto-calc handler if DOB field is present
    const def = allDefs.find((d) => d.id === defId);
    if (def && (def.field_key === 'date_of_birth' || def.field_key === 'dob')) {
      const calculatedAge = calculateAgeFromDOB(val);
      if (calculatedAge !== null) {
        const ageDef = allDefs.find((d) => d.field_key === 'age');
        if (ageDef) {
          updated[ageDef.id] = { value: calculatedAge };
          if (!activeDefIds.includes(ageDef.id)) {
            setActiveDefIds([...activeDefIds, ageDef.id]);
          }
        }
      }
    }

    onChangeValues(updated);
  };

  const handleAddField = (field: CustomFieldDef) => {
    if (!allDefs.some((d) => d.id === field.id)) {
      setAllDefs([...allDefs, field]);
    }
    if (!activeDefIds.includes(field.id)) {
      setActiveDefIds([...activeDefIds, field.id]);
    }
  };

  const handleRemoveField = async (fieldId: string) => {
    const targetDef = allDefs.find((d) => d.id === fieldId);
    const confirmDelete = window.confirm(`Are you sure you want to delete "${targetDef?.label || 'this field'}"?`);
    if (!confirmDelete) return;

    await deleteCustomFieldDef(workspaceId, entityType, fieldId);
    setAllDefs(allDefs.filter((d) => d.id !== fieldId));
    setActiveDefIds(activeDefIds.filter((id) => id !== fieldId));
    const nextVals = { ...valuesMap };
    delete nextVals[fieldId];
    onChangeValues(nextVals);
  };

  const renderFieldInput = (field: CustomFieldDef) => {
    const valObj = valuesMap[field.id] || {};
    const val = valObj.value !== undefined ? valObj.value : field.default_value || '';
    const unit = valObj.unit || (field.unit_config && field.unit_config[0]) || 'Acres';

    // 1. UNIT / MEASUREMENT NUMBER (e.g. 5 Acres, 2400 Sq Ft)
    if (field.field_type === 'unit') {
      const unitsList = field.unit_config || DEFAULT_UNITS;
      return (
        <div className="flex gap-2">
          <TextInput
            type="number"
            value={val}
            onChange={(e) => handleValueChange(field.id, e.target.value, unit)}
            placeholder={field.placeholder || "e.g. 10"}
            className="flex-1"
          />
          <Select
            value={unit}
            onChange={(e) => handleValueChange(field.id, val, e.target.value)}
            className="w-36"
          >
            {unitsList.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    // 2. RADIO BUTTONS
    if (field.field_type === 'radio' && field.options && field.options.length > 0) {
      return (
        <div className="flex flex-wrap gap-4 pt-1">
          {field.options.map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="radio"
                name={`field_${field.id}`}
                value={opt}
                checked={val === opt}
                onChange={() => handleValueChange(field.id, opt)}
                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    // 3. DROPDOWN / CHOOSE ONE
    if (field.field_type === 'dropdown' && field.options && field.options.length > 0) {
      return (
        <Select value={val} onChange={(e) => handleValueChange(field.id, e.target.value)}>
          <option value="">-- Select {field.label} --</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      );
    }

    // 4. SEARCHABLE DROPDOWN
    if (field.field_type === 'searchable_dropdown' && field.options && field.options.length > 0) {
      const query = (searchQueries[field.id] || '').toLowerCase();
      const filteredOptions = field.options.filter((opt) => opt.toLowerCase().includes(query));
      return (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <TextInput
              value={searchQueries[field.id] || ''}
              onChange={(e) => setSearchQueries({ ...searchQueries, [field.id]: e.target.value })}
              placeholder={`Search ${field.label}...`}
              className="pl-8 text-xs"
            />
          </div>
          <Select value={val} onChange={(e) => handleValueChange(field.id, e.target.value)}>
            <option value="">-- Select {field.label} --</option>
            {filteredOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </div>
      );
    }

    // 5. CHECKBOX GROUP
    if (field.field_type === 'checkbox_group' && field.options && field.options.length > 0) {
      const selectedList: string[] = Array.isArray(val) ? val : [];
      return (
        <div className="flex flex-wrap gap-4 pt-1">
          {field.options.map((opt) => {
            const checked = selectedList.includes(opt);
            const toggle = () => {
              const next = checked ? selectedList.filter((i) => i !== opt) : [...selectedList, opt];
              handleValueChange(field.id, next);
            };
            return (
              <label key={opt} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={toggle}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }

    // 6. MULTI SELECT / CHOOSE MULTIPLE (Pills Toggle)
    if (field.field_type === 'multi_select' && field.options && field.options.length > 0) {
      const selectedList: string[] = Array.isArray(val) ? val : [];
      const toggleOption = (opt: string) => {
        const next = selectedList.includes(opt)
          ? selectedList.filter((item) => item !== opt)
          : [...selectedList, opt];
        handleValueChange(field.id, next);
      };

      return (
        <div className="flex flex-wrap gap-2 pt-1">
          {field.options.map((opt) => {
            const checked = selectedList.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  checked
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {checked ? '✓ ' : '+ '} {opt}
              </button>
            );
          })}
        </div>
      );
    }

    // 7. YES / NO TOGGLE
    if (field.field_type === 'yes_no') {
      return (
        <Select value={val} onChange={(e) => handleValueChange(field.id, e.target.value)}>
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </Select>
      );
    }

    // 8. SINGLE CHECKBOX
    if (field.field_type === 'checkbox') {
      return (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => handleValueChange(field.id, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{field.placeholder || `Enable ${field.label}`}</span>
        </label>
      );
    }

    // 9. DATE CALENDAR PICKER
    if (field.field_type === 'date') {
      const calculatedAge = (field.field_key === 'date_of_birth' || field.field_key === 'dob') ? calculateAgeFromDOB(val) : null;
      return (
        <div className="space-y-1">
          <input
            type="date"
            value={val}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
          />
          {calculatedAge !== null && (
            <div className="text-[11px] font-semibold text-blue-700">
              Age: {calculatedAge} yrs (Calculated)
            </div>
          )}
        </div>
      );
    }

    // 10. DATE & TIME PICKER
    if (field.field_type === 'datetime') {
      return (
        <input
          type="datetime-local"
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
        />
      );
    }

    // 11. TIME PICKER
    if (field.field_type === 'time') {
      return (
        <input
          type="time"
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
        />
      );
    }

    // 12. CURRENCY / AMOUNT
    if (field.field_type === 'currency') {
      return (
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
          <TextInput
            type="number"
            value={val}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.placeholder || "0.00"}
            className="pl-7"
          />
        </div>
      );
    }

    // 13. PERCENTAGE
    if (field.field_type === 'percentage') {
      return (
        <div className="relative">
          <TextInput
            type="number"
            value={val}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.placeholder || "0"}
            className="pr-7"
          />
          <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
        </div>
      );
    }

    // 14. NUMBER & DECIMAL
    if (field.field_type === 'number' || field.field_type === 'decimal') {
      return (
        <TextInput
          type="number"
          step={field.field_type === 'decimal' ? 'any' : '1'}
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          placeholder={field.placeholder || "Enter number..."}
        />
      );
    }

    // 15. EMAIL
    if (field.field_type === 'email') {
      return (
        <TextInput
          type="email"
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          placeholder={field.placeholder || "email@domain.com"}
        />
      );
    }

    // 16. PHONE
    if (field.field_type === 'phone') {
      return (
        <TextInput
          type="tel"
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          placeholder={field.placeholder || "+91 98765 43210"}
        />
      );
    }

    // 17. WEBSITE / URL
    if (field.field_type === 'website') {
      return (
        <TextInput
          type="url"
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          placeholder={field.placeholder || "https://example.com"}
        />
      );
    }

    // 18. LONG TEXT / TEXTAREA
    if (field.field_type === 'long_text') {
      return (
        <TextArea
          value={val}
          onChange={(e) => handleValueChange(field.id, e.target.value)}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
          rows={3}
        />
      );
    }

    // 19. FILE UPLOAD
    if (field.field_type === 'file') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="file"
            id={`file_input_${field.id}`}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleValueChange(field.id, f.name);
            }}
          />
          <label
            htmlFor={`file_input_${field.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-blue-600" />
            {val ? 'Change Attachment' : 'Upload File'}
          </label>
          {val && <span className="text-xs font-medium text-slate-800 truncate max-w-xs">{val}</span>}
        </div>
      );
    }

    // DEFAULT SHORT TEXT
    return (
      <TextInput
        value={val}
        onChange={(e) => handleValueChange(field.id, e.target.value)}
        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
      />
    );
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-blue-600" />
            CUSTOM INFORMATION
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Additional information stored specifically for this client.
          </p>
        </div>
        {activeDefs.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="text-xs text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Detail
          </Button>
        )}
      </div>

      {activeDefs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activeDefs.map((field) => {
            const currentVal = valuesMap[field.id]?.value;
            let fieldError: string | undefined;
            if (field.field_type === 'website') {
              const res = validateWebsiteUrl(currentVal, { required: field.required });
              if (!res.isValid) fieldError = res.error;
            } else if (field.field_type === 'phone') {
              const res = validatePhoneNumber(currentVal, { required: field.required, fieldLabel: field.label });
              if (!res.isValid) fieldError = res.error;
            }

            return (
              <div key={field.id} className="relative group">
                <Field label={field.label} required={field.required} hint={field.help_text} error={fieldError}>
                  {renderFieldInput(field)}
                </Field>
                <button
                  type="button"
                  onClick={() => handleRemoveField(field.id)}
                  className="absolute -top-1 right-0 text-[11px] font-semibold text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center">
          <p className="text-xs text-slate-500 mb-2">No additional information has been added for this client.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="text-xs text-blue-700 border-blue-200 bg-white hover:bg-blue-50 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Detail
          </Button>
        </div>
      )}

      {/* ADD CUSTOM FIELD MODAL */}
      {showAddModal && (
        <AddCustomFieldModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          workspaceId={workspaceId}
          entityType={entityType}
          targetEntityId={entityId}
          alreadyAddedIds={activeDefIds}
          onSelectField={handleAddField}
          onCreatedField={handleAddField}
        />
      )}
    </div>
  );
}
