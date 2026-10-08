import { validateQuotationDates, getDefaultValidUntil } from './quotationValidation';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('Running Quotation Date Range Validation Tests...');

// 1. Same date is valid
const sameDate = validateQuotationDates('2026-09-28', '2026-09-28');
assert(sameDate.valid === true, 'Same date should be valid');

// 2. Future valid_until is valid
const futureDate = validateQuotationDates('2026-09-28', '2026-10-28');
assert(futureDate.valid === true, 'Future valid_until should be valid');

// 3. Past valid_until is INVALID
const pastDate = validateQuotationDates('2026-09-28', '2026-07-10');
assert(pastDate.valid === false, 'Past valid_until must be invalid');
assert(
  pastDate.error === 'Valid until date must be on or after the quotation date.',
  `Unexpected error message: ${pastDate.error}`
);

// 4. Missing valid_until is allowed (optional field)
const nullValid = validateQuotationDates('2026-09-28', null);
assert(nullValid.valid === true, 'Null valid_until should be valid');

const emptyValid = validateQuotationDates('2026-09-28', '');
assert(emptyValid.valid === true, 'Empty valid_until should be valid');

// 5. Missing quotation date is INVALID
const missingQDate = validateQuotationDates('', '2026-10-28');
assert(missingQDate.valid === false, 'Missing quotation_date must be invalid');

// 6. getDefaultValidUntil generates date +30 days
const def = getDefaultValidUntil('2026-09-28', 30);
assert(def === '2026-10-28', `Expected 2026-10-28, got ${def}`);

console.log('All Quotation Date Range Validation Tests PASSED!');
