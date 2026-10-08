/**
 * Quotation Date Range Validation Rules
 * Rule: valid_until >= quotation_date
 */

export interface DateValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Calculates a default valid_until date (defaults to +30 days from quotation date)
 */
export function getDefaultValidUntil(quotationDateStr: string, days = 30): string {
  if (!quotationDateStr) return '';
  const date = new Date(quotationDateStr);
  if (isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Validates that valid_until is on or after quotation_date.
 * Allows valid_until to be null/undefined/empty string if not specified.
 */
export function validateQuotationDates(
  quotationDate: string | null | undefined,
  validUntil: string | null | undefined
): DateValidationResult {
  if (!quotationDate || !quotationDate.trim()) {
    return {
      valid: false,
      error: 'Quotation date is required.',
    };
  }

  // Normalise formats to YYYY-MM-DD
  const qDate = quotationDate.trim().slice(0, 10);
  const vDate = validUntil ? validUntil.trim().slice(0, 10) : null;

  if (vDate) {
    if (vDate < qDate) {
      return {
        valid: false,
        error: 'Valid until date must be on or after the quotation date.',
      };
    }
  }

  return { valid: true };
}
