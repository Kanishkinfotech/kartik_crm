/**
 * Financial calculation helpers.
 *
 * IMPORTANT: These mirror the backend recompute logic for DISPLAY ONLY.
 * The authoritative totals for invoices (and quotations sent/approved) are
 * recomputed server-side (edge function). Frontend values are never trusted
 * for financial correctness — they are previews.
 *
 * GST split logic:
 *  - Intra-state (same state as supplier): CGST + SGST, each = tax% / 2
 *  - Inter-state: IGST = tax%
 * The caller decides intra vs inter by passing isInterState.
 */

export interface LineTaxInput {
  quantity: number;
  rate: number;
  discount_amount: number;
  discount_type?: 'amount' | 'percent';
  discount_percent?: number;
  tax_percent: number;
  isInterState: boolean;
}

export interface LineTaxResult {
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLine(input: LineTaxInput): LineTaxResult {
  const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
  const rate = Number.isFinite(input.rate) ? input.rate : 0;
  const taxPct = Number.isFinite(input.tax_percent) ? input.tax_percent : 0;
  const grossAmount = round2(qty * rate);

  let discountAmount = 0;
  if (input.discount_type === 'percent') {
    const pct = Number.isFinite(input.discount_percent) ? (input.discount_percent ?? 0) : 0;
    discountAmount = round2((grossAmount * pct) / 100);
  } else {
    discountAmount = round2(Number.isFinite(input.discount_amount) ? input.discount_amount : 0);
  }

  const taxableAmount = Math.max(0, grossAmount - discountAmount);
  const taxAmount = round2((taxableAmount * taxPct) / 100);
  const lineTotal = round2(taxableAmount + taxAmount);

  if (input.isInterState) {
    return { grossAmount, discountAmount, taxableAmount: round2(taxableAmount), taxAmount, igstAmount: taxAmount, cgstAmount: 0, sgstAmount: 0, lineTotal };
  }
  const half = round2(taxAmount / 2);
  return { grossAmount, discountAmount, taxableAmount: round2(taxableAmount), taxAmount, igstAmount: 0, cgstAmount: half, sgstAmount: half, lineTotal };
}

export interface DocTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
}

export function computeDocTotals(
  lines: LineTaxResult[],
  docDiscount = 0,
): DocTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
  const lineDiscounts = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
  const docDisc = round2(Number.isFinite(docDiscount) ? docDiscount : 0);
  const discountAmount = round2(lineDiscounts + docDisc);
  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const cgst = round2(lines.reduce((s, l) => s + l.cgstAmount, 0));
  const sgst = round2(lines.reduce((s, l) => s + l.sgstAmount, 0));
  const igst = round2(lines.reduce((s, l) => s + l.igstAmount, 0));
  const rawTotal = taxableBase + taxAmount;
  const total = round2(rawTotal);
  const roundOff = round2(total - rawTotal);
  return { subtotal, discountAmount, taxAmount, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, roundOff, total };
}

export function nextNumber(prefix: string, sequence: number, separator = '-'): string {
  const padded = String(sequence).padStart(4, '0');
  return `${prefix}${separator}${padded}`;
}
