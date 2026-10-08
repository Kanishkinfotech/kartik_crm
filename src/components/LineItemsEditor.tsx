import { useMemo } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { Service } from '@/lib/types';
import { computeLine, computeDocTotals, type LineTaxResult } from '@/lib/finance';
import { formatCurrency, classNames } from '@/lib/format';
import { Select, TextInput } from '@/components/ui';

export interface EditableLine {
  id: string; // local temp id
  service_id: string | null;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discount_type: 'amount' | 'percent';
  discount_amount: number;
  discount_percent: number;
  tax_percent: number;
}

interface Props {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  services: Service[];
  isInterState: boolean;
  docDiscount: number;
  currency: string;
}

let _id = 0;
export function newLine(): EditableLine {
  _id += 1;
  return { id: `tmp-${_id}`, service_id: null, description: '', hsn_sac: null, quantity: 1, unit: 'Nos', rate: 0, discount_type: 'amount', discount_amount: 0, discount_percent: 0, tax_percent: 18 };
}

export function LineItemsEditor({ lines, onChange, services, isInterState, docDiscount, currency }: Props) {
  const computed: LineTaxResult[] = useMemo(
    () => lines.map((l) => computeLine({ quantity: l.quantity, rate: l.rate, discount_type: l.discount_type, discount_amount: l.discount_amount, discount_percent: l.discount_percent, tax_percent: l.tax_percent, isInterState })),
    [lines, isInterState],
  );
  const totals = useMemo(() => computeDocTotals(computed, docDiscount), [computed, docDiscount]);

  const update = (id: string, patch: Partial<EditableLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));

  const addService = (serviceId: string) => {
    if (!serviceId) return;
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    const line = newLine();
    line.service_id = svc.id;
    line.description = svc.name;
    line.hsn_sac = svc.sac_hsn_code;
    line.rate = svc.default_price ?? 0;
    line.tax_percent = svc.tax_percent;
    onChange([...lines, line]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value=""
          onChange={(e) => { addService(e.target.value); e.target.value = ''; }}
          className="max-w-xs"
        >
          <option value="">+ Add from service catalogue…</option>
          {services.filter((s) => s.is_active).map((s) => (
            <option key={s.id} value={s.id}>{s.service_code} — {s.name}</option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => onChange([...lines, newLine()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" /> Custom line
        </button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 min-w-[240px]">Description</th>
              <th className="px-3 py-2 min-w-[100px]">HSN/SAC</th>
              <th className="px-3 py-2 min-w-[80px]">Qty</th>
              <th className="px-3 py-2 min-w-[100px]">Unit</th>
              <th className="px-3 py-2 min-w-[120px]">Rate</th>
              <th className="px-3 py-2 min-w-[100px]">Discount</th>
              <th className="px-3 py-2 min-w-[80px]">Tax%</th>
              <th className="px-3 py-2 min-w-[120px]">Line total</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No line items yet. Add a service or custom line above.</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.id} className="align-top">
                <td className="px-3 py-2 text-slate-300"><GripVertical className="h-4 w-4" /><span className="sr-only">{i + 1}</span></td>
                <td className="px-3 py-2">
                  <TextInput
                    value={l.description}
                    onChange={(e) => update(l.id, { description: e.target.value })}
                    placeholder="Description of work"
                    className="min-w-[240px]"
                  />
                </td>
                <td className="px-3 py-2"><TextInput value={l.hsn_sac ?? ''} onChange={(e) => update(l.id, { hsn_sac: e.target.value || null })} className="min-w-[100px]" /></td>
                <td className="px-3 py-2"><TextInput type="number" step="0.01" value={l.quantity} onChange={(e) => update(l.id, { quantity: Number(e.target.value) || 0 })} className="min-w-[80px]" /></td>
                <td className="px-3 py-2"><TextInput value={l.unit} onChange={(e) => update(l.id, { unit: e.target.value })} className="min-w-[100px]" /></td>
                <td className="px-3 py-2"><TextInput type="number" step="0.01" value={l.rate} onChange={(e) => update(l.id, { rate: Number(e.target.value) || 0 })} className="min-w-[120px]" /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 min-w-[130px]">
                    <TextInput
                      type="number"
                      step="0.01"
                      value={l.discount_type === 'percent' ? (l.discount_percent || 0) : (l.discount_amount || 0)}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        if (l.discount_type === 'percent') {
                          update(l.id, { discount_percent: val });
                        } else {
                          update(l.id, { discount_amount: val });
                        }
                      }}
                      className="w-full"
                    />
                    <select
                      value={l.discount_type || 'amount'}
                      onChange={(e) => update(l.id, { discount_type: e.target.value as 'amount' | 'percent' })}
                      className="rounded-lg border border-slate-300 bg-white px-1.5 py-2 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50 focus:border-blue-500"
                    >
                      <option value="amount">₹</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2"><TextInput type="number" step="0.01" value={l.tax_percent} onChange={(e) => update(l.id, { tax_percent: Number(e.target.value) || 0 })} className="min-w-[80px]" /></td>
                <td className="px-3 py-2 font-medium text-slate-700 min-w-[120px]">{formatCurrency(computed[i].lineTotal, currency)}</td>
                <td className="px-3 py-2"><button type="button" onClick={() => remove(l.id)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Cards */}
      <div className="flex flex-col gap-4 md:hidden">
        {lines.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-400 rounded-xl border border-slate-200">No line items yet. Add a service or custom line above.</div>
        ) : lines.map((l, i) => (
          <div key={l.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 relative">
            <div className="absolute top-4 right-4">
              <button type="button" onClick={() => remove(l.id)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            
            <div className="pr-8 space-y-1">
              <label className="text-xs font-medium text-slate-500">Description</label>
              <TextInput
                value={l.description}
                onChange={(e) => update(l.id, { description: e.target.value })}
                placeholder="Description of work"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">HSN/SAC</label>
                <TextInput value={l.hsn_sac ?? ''} onChange={(e) => update(l.id, { hsn_sac: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Tax %</label>
                <TextInput type="number" step="0.01" value={l.tax_percent} onChange={(e) => update(l.id, { tax_percent: Number(e.target.value) || 0 })} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Qty</label>
                <TextInput type="number" step="0.01" value={l.quantity} onChange={(e) => update(l.id, { quantity: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Unit</label>
                <TextInput value={l.unit} onChange={(e) => update(l.id, { unit: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Rate</label>
                <TextInput type="number" step="0.01" value={l.rate} onChange={(e) => update(l.id, { rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Discount</label>
                <div className="flex items-center gap-1">
                  <TextInput
                    type="number"
                    step="0.01"
                    value={l.discount_type === 'percent' ? (l.discount_percent || 0) : (l.discount_amount || 0)}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (l.discount_type === 'percent') {
                        update(l.id, { discount_percent: val });
                      } else {
                        update(l.id, { discount_amount: val });
                      }
                    }}
                    className="w-full"
                  />
                  <select
                    value={l.discount_type || 'amount'}
                    onChange={(e) => update(l.id, { discount_type: e.target.value as 'amount' | 'percent' })}
                    className="rounded-lg border border-slate-300 bg-white px-1.5 py-2 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-50"
                  >
                    <option value="amount">₹</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Line Total</span>
              <span className="text-sm font-semibold text-slate-700">{formatCurrency(computed[i].lineTotal, currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <div className="w-full md:max-w-xs space-y-1.5 text-sm">
          <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal, currency)} />
          <TotalRow label="Discount" value={formatCurrency(totals.discountAmount, currency)} />
          <TotalRow label="Tax" value={formatCurrency(totals.taxAmount, currency)} />
          {isInterState
            ? <TotalRow label="IGST" value={formatCurrency(totals.igstAmount, currency)} muted />
            : <><TotalRow label="CGST" value={formatCurrency(totals.cgstAmount, currency)} muted /><TotalRow label="SGST" value={formatCurrency(totals.sgstAmount, currency)} muted /></>}
          <TotalRow label="Round-off" value={formatCurrency(totals.roundOff, currency)} muted />
          <div className={classNames('mt-1 border-t border-slate-200 pt-2 text-base font-semibold text-slate-900')}>
            <div className="flex justify-between"><span>Total</span><span>{formatCurrency(totals.total, currency)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={classNames('flex justify-between', muted ? 'text-slate-400' : 'text-slate-600')}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

export function computeEditableTotals(lines: EditableLine[], isInterState: boolean, docDiscount: number) {
  const computed = lines.map((l) => computeLine({ quantity: l.quantity, rate: l.rate, discount_type: l.discount_type, discount_amount: l.discount_amount, discount_percent: l.discount_percent, tax_percent: l.tax_percent, isInterState }));
  return { computed, totals: computeDocTotals(computed, docDiscount) };
}
