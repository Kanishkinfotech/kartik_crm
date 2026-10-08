import React, { useState, useEffect, useMemo } from 'react';
import type { CustomFieldDef, CustomFieldEntityType } from '@/lib/types';
import { Modal, TextInput, Button } from '@/components/ui';
import {
  getCustomFieldDefs,
  FIELD_TYPE_LABELS,
} from '@/lib/customFields';
import { Search, Plus, Sparkles } from 'lucide-react';
import { CustomFieldBuilderModal } from './CustomFieldBuilderModal';

export function AddCustomFieldModal({
  open,
  onClose,
  workspaceId,
  entityType = 'client',
  targetEntityId,
  alreadyAddedIds = [],
  onSelectField,
  onCreatedField,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  entityType?: CustomFieldEntityType;
  targetEntityId?: string;
  alreadyAddedIds?: string[];
  onSelectField: (field: CustomFieldDef) => void;
  onCreatedField: (field: CustomFieldDef) => void;
}) {
  const [search, setSearch] = useState('');
  const [availableDefs, setAvailableDefs] = useState<CustomFieldDef[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    if (open && workspaceId) {
      getCustomFieldDefs(workspaceId, entityType).then((defs) => {
        setAvailableDefs(defs);
      });
    }
  }, [open, workspaceId, entityType]);

  const filteredDefs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return availableDefs.filter((d) => {
      if (alreadyAddedIds.includes(d.id)) return false;
      if (!query) return true;
      return (
        d.label.toLowerCase().includes(query) ||
        d.field_type.toLowerCase().includes(query)
      );
    });
  }, [availableDefs, search, alreadyAddedIds]);

  return (
    <>
      <Modal open={open} onClose={onClose} title="Add Customized Field for This Client" size="lg">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search custom fields..."
                className="pl-9 text-xs"
              />
            </div>
            <Button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="bg-blue-600 text-white gap-1.5 text-xs whitespace-nowrap shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Create New Custom Field
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
            {filteredDefs.length > 0 ? (
              <div className="divide-y divide-slate-100 border rounded-xl border-slate-200">
                {filteredDefs.map((def) => (
                  <div key={def.id} className="flex items-center justify-between p-3 hover:bg-slate-50">
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>{def.label}</span>
                        {def.required && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">
                            Required
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Type: <span className="font-semibold">{FIELD_TYPE_LABELS[def.field_type] || def.field_type}</span>
                        {def.options && def.options.length > 0 && (
                          <span className="ml-2">• Choices: {def.options.join(', ')}</span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onSelectField(def);
                        onClose();
                      }}
                      className="bg-slate-900 text-white text-xs gap-1 hover:bg-slate-800"
                    >
                      <Plus className="h-3.5 w-3.5" /> Select Field
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <p className="text-xs text-slate-600 font-medium mb-1">
                  {search ? 'No existing custom fields match your search.' : 'No existing custom fields found.'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Use the "Create New Custom Field" button above to add a new custom field.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {showBuilder && (
        <CustomFieldBuilderModal
          open={showBuilder}
          onClose={() => setShowBuilder(false)}
          workspaceId={workspaceId}
          entityType={entityType}
          targetEntityId={targetEntityId}
          onSaved={(newField) => {
            onCreatedField(newField);
            setShowBuilder(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
