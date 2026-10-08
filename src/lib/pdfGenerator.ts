import { formatCurrency, formatDate } from './format';

interface PrintDocOptions {
  docType: 'Quotation' | 'Invoice';
  docNumber: string;
  docDate: string;
  dueDateOrValidUntil?: string | null;
  clientName: string;
  clientGstin?: string | null;
  billingAddress?: string | null;
  placeOfSupply?: string | null;
  currency?: string;
  items: Array<{
    description: string;
    hsn_sac?: string | null;
    quantity: number;
    unit?: string | null;
    rate: number;
    discount_amount?: number;
    tax_percent?: number;
    line_total: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  roundOff?: number;
  total: number;
  amountPaid?: number;
  balanceDue?: number;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  notes?: string | null;
  isInterState?: boolean;
}

export function printDocument(opts: PrintDocOptions) {
  const currency = opts.currency || 'INR';
  const isInvoice = opts.docType === 'Invoice';

  const itemsHtml = opts.items
    .map(
      (item, idx) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${idx + 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <div style="font-weight: 600; color: #1e293b;">${escapeHtml(item.description)}</div>
        ${item.hsn_sac ? `<div style="font-size: 11px; color: #64748b;">HSN/SAC: ${escapeHtml(item.hsn_sac)}</div>` : ''}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${item.quantity} ${item.unit || ''}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${formatCurrency(item.rate, currency)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${item.tax_percent ? `${item.tax_percent}%` : '0%'}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; font-size: 13px; color: #0f172a;">${formatCurrency(item.line_total, currency)}</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${opts.docType} ${escapeHtml(opts.docNumber)}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            background: #fff;
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .title { font-size: 28px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-box { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
          .info-box td { vertical-align: top; width: 50%; }
          .box-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 5px; }
          .box-content { font-size: 14px; color: #0f172a; line-height: 1.5; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
          .items-table th { background: #f8fafc; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 10px; border-bottom: 2px solid #cbd5e1; }
          .summary-table { width: 320px; margin-left: auto; border-collapse: collapse; margin-bottom: 30px; }
          .summary-table td { padding: 6px 10px; font-size: 13px; }
          .summary-table .total-row td { border-top: 2px solid #0f172a; font-size: 16px; font-weight: 700; color: #0f172a; padding-top: 10px; }
          .notes-section { border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #475569; line-height: 1.6; }
          .notes-title { font-weight: 700; color: #1e293b; margin-bottom: 4px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 15px; }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td>
              <div style="font-size: 22px; font-weight: 800; color: #0f172a;">Kanishk One CRM</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Smart Business Suite</div>
            </td>
            <td style="text-align: right;">
              <div class="title">${opts.docType}</div>
              <div style="font-size: 14px; font-weight: 700; font-family: monospace; color: #334155; margin-top: 4px;"># ${escapeHtml(opts.docNumber)}</div>
            </td>
          </tr>
        </table>

        <table class="info-box">
          <tr>
            <td>
              <div class="box-title">Billed To</div>
              <div class="box-content">
                <strong style="font-size: 15px;">${escapeHtml(opts.clientName)}</strong><br/>
                ${opts.billingAddress ? `${escapeHtml(opts.billingAddress).replace(/\n/g, '<br/>')}<br/>` : ''}
                ${opts.clientGstin ? `<span style="font-size: 12px; color: #475569;"><strong>GSTIN:</strong> ${escapeHtml(opts.clientGstin)}</span><br/>` : ''}
                ${opts.placeOfSupply ? `<span style="font-size: 12px; color: #475569;"><strong>Place of Supply:</strong> ${escapeHtml(opts.placeOfSupply)}</span>` : ''}
              </div>
            </td>
            <td style="text-align: right;">
              <div class="box-title">Details</div>
              <div class="box-content">
                <strong>Date:</strong> ${formatDate(opts.docDate)}<br/>
                ${opts.dueDateOrValidUntil ? `<strong>${isInvoice ? 'Due Date' : 'Valid Until'}:</strong> ${formatDate(opts.dueDateOrValidUntil)}<br/>` : ''}
                ${opts.paymentTerms ? `<strong>Payment Terms:</strong> ${escapeHtml(opts.paymentTerms)}<br/>` : ''}
              </div>
            </td>
          </tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 45%; text-align: left;">Item & Description</th>
              <th style="width: 12%; text-align: right;">Qty</th>
              <th style="width: 13%; text-align: right;">Rate</th>
              <th style="width: 10%; text-align: right;">Tax</th>
              <th style="width: 15%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="color: #64748b;">Subtotal</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(opts.subtotal, currency)}</td>
          </tr>
          ${opts.discountAmount ? `<tr><td style="color: #64748b;">Discount</td><td style="text-align: right; color: #dc2626;">-${formatCurrency(opts.discountAmount, currency)}</td></tr>` : ''}
          ${
            opts.isInterState && opts.igstAmount
              ? `<tr><td style="color: #64748b;">IGST</td><td style="text-align: right;">${formatCurrency(opts.igstAmount, currency)}</td></tr>`
              : `
            ${opts.cgstAmount ? `<tr><td style="color: #64748b;">CGST</td><td style="text-align: right;">${formatCurrency(opts.cgstAmount, currency)}</td></tr>` : ''}
            ${opts.sgstAmount ? `<tr><td style="color: #64748b;">SGST</td><td style="text-align: right;">${formatCurrency(opts.sgstAmount, currency)}</td></tr>` : ''}
          `
          }
          ${opts.roundOff ? `<tr><td style="color: #64748b;">Round Off</td><td style="text-align: right;">${formatCurrency(opts.roundOff, currency)}</td></tr>` : ''}
          <tr class="total-row">
            <td>Total</td>
            <td style="text-align: right;">${formatCurrency(opts.total, currency)}</td>
          </tr>
          ${
            opts.amountPaid !== undefined && opts.amountPaid > 0
              ? `<tr><td style="color: #16a34a; font-weight: 600;">Amount Paid</td><td style="text-align: right; color: #16a34a; font-weight: 600;">${formatCurrency(opts.amountPaid, currency)}</td></tr>
                 <tr><td style="color: #d97706; font-weight: 700;">Balance Due</td><td style="text-align: right; color: #d97706; font-weight: 700;">${formatCurrency(opts.balanceDue ?? 0, currency)}</td></tr>`
              : ''
          }
        </table>

        ${
          opts.termsAndConditions
            ? `
          <div class="notes-section">
            <div class="notes-title">Terms & Conditions</div>
            <div>${escapeHtml(opts.termsAndConditions).replace(/\n/g, '<br/>')}</div>
          </div>
        `
            : ''
        }

        ${
          opts.notes
            ? `
          <div class="notes-section">
            <div class="notes-title">Notes</div>
            <div>${escapeHtml(opts.notes).replace(/\n/g, '<br/>')}</div>
          </div>
        `
            : ''
        }

        <div class="footer">
          Thank you for your business! · Generated via Kanishk One CRM
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
