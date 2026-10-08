import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/lib/workspace';
import type { CustomFieldDef } from '@/lib/types';
import {
  Button,
  Card,
  LoadingState,
  TextInput,
  ConfirmDialog,
} from '@/components/ui';
import {
  getCustomFieldDefs,
  archiveCustomFieldDef,
  FIELD_TYPE_LABELS,
} from '@/lib/customFields';
import {
  Plus,
  Search,
} from 'lucide-react';
import { CustomFieldBuilderModal } from '@/components/CustomFieldBuilderModal';

export function ClientCustomizationsSettings() {
  const { activeWorkspace } = useWorkspace();
  const [targetEntity, setTargetEntity] = useState<'client' | 'lead'>('client');
  const [loading, setLoading] = useState(true);
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [search, setSearch] = useState('');

  // Modals
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | undefined>(undefined);
  const [archivingField, setArchivingField] = useState<CustomFieldDef | undefined>(undefined);

  const loadDefs = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    // Fetch global workspace definitions for target entity type
    const loaded = await getCustomFieldDefs(activeWorkspace.id, targetEntity, true);
    setDefs(loaded);
    setLoading(false);
  };

  useEffect(() => {
    loadDefs();
  }, [activeWorkspace, targetEntity]);

  const activeDefs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return defs.filter((d) => {
      if ((d.status || 'active') !== 'active') return false;
      // STRICT ISOLATION: Client record-specific fields must NEVER appear in Settings
      if (d.scope_type === 'record' || d.scope_entity_id) return false;
      if (!query) return true;
      return (
        d.label.toLowerCase().includes(query) ||
        d.field_type.toLowerCase().includes(query)
      );
    });
  }, [defs, search]);

  const handleConfirmArchive = async () => {
    if (!activeWorkspace || !archivingField) return;
    await archiveCustomFieldDef(activeWorkspace.id, targetEntity, archivingField.id);
    setDefs(
      defs.map((d) => (d.id === archivingField.id ? { ...d, status: 'archived' as const } : d))
    );
    setArchivingField(undefined);
  };

  if (loading) return <LoadingState label="Loading global custom fields..." />;

  return (
    <div className="space-y-4">
      {/* 1. MODULE SELECTOR TABS */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-600">
        <button
          onClick={() => setTargetEntity('client')}
          className={`pb-3 transition border-b-2 ${targetEntity === 'client' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >
          Global Client Fields
        </button>
        <button
          onClick={() => setTargetEntity('lead')}
          className={`pb-3 transition border-b-2 ${targetEntity === 'lead' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >
          Global Lead Fields
        </button>
      </div>

      {/* 2. SEARCH & SINGLE CREATE BUTTON ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search global custom fields..."
            className="pl-9 text-xs"
          />
        </div>

        <Button
          onClick={() => {
            setEditingField(undefined);
            setShowBuilderModal(true);
          }}
          className="bg-blue-600 text-white text-xs gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" /> Create Global {targetEntity === 'client' ? 'Client' : 'Lead'} Field
        </Button>
      </div>

      {/* 3. CUSTOM FIELDS LIST / CLEAN EMPTY STATE */}
      <Card className="p-4 border-slate-200">
        {activeDefs.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {activeDefs.map((field) => (
              <div key={field.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>{field.label}</span>
                    {field.required && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">
                        Required
                      </span>
                    )}
                    {field.scope_type === 'record' && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-800">
                        Record Specific
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Type: <span className="font-semibold">{FIELD_TYPE_LABELS[field.field_type] || field.field_type}</span>
                    {field.options && field.options.length > 0 && (
                      <span className="ml-2">• Choices: {field.options.join(', ')}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingField(field);
                      setShowBuilderModal(true);
                    }}
                    className="text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchivingField(field)}
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-500">
            No custom fields created yet.
          </div>
        )}
      </Card>

      {/* BUILDER MODAL */}
      {showBuilderModal && (
        <CustomFieldBuilderModal
          open={showBuilderModal}
          onClose={() => {
            setShowBuilderModal(false);
            setEditingField(undefined);
          }}
          workspaceId={activeWorkspace?.id || 'default'}
          entityType={targetEntity}
          existingField={editingField}
          onSaved={() => {
            loadDefs();
          }}
        />
      )}

      {/* ARCHIVE CONFIRM DIALOG */}
      {archivingField && (
        <ConfirmDialog
          open={!!archivingField}
          onClose={() => setArchivingField(undefined)}
          onConfirm={handleConfirmArchive}
          title={`Archive Detail: ${archivingField.label}?`}
          message="Archiving this detail will stop it from appearing on new forms. Existing saved values will remain preserved."
          confirmLabel="Archive Detail"
          danger
        />
      )}
    </div>
  );
}
