import {
  validateWebsiteUrl,
  validateEmail,
  validatePhoneNumber,
  findDuplicateLead,
  arePhonesMatching,
} from './contactValidation';
import type { Lead } from './types';

function assert(condition: boolean | undefined, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('--- Testing Website URL Validation ---');
// 1. Invalid URLs
assert(!validateWebsiteUrl('abc').isValid, '"abc" should be invalid');
assert(validateWebsiteUrl('abc').error === 'Please enter a valid website URL.', 'Should return exact message');
assert(!validateWebsiteUrl('not_a_website').isValid, '"not_a_website" should be invalid');
assert(!validateWebsiteUrl('http://').isValid, '"http://" should be invalid');
assert(!validateWebsiteUrl('https://').isValid, '"https://" should be invalid');
assert(!validateWebsiteUrl('site .com').isValid, 'spaces in URL should be invalid');
assert(!validateWebsiteUrl('http://abc').isValid, '"http://abc" should be invalid');

// 2. Valid URLs
assert(validateWebsiteUrl('').isValid, 'Empty string is valid when not required');
assert(validateWebsiteUrl(null).isValid, 'Null is valid when not required');
assert(validateWebsiteUrl('example.com').isValid, 'example.com is valid');
assert(validateWebsiteUrl('https://example.com').isValid, 'https://example.com is valid');
assert(validateWebsiteUrl('http://kanishkinfotech.com').isValid, 'http://kanishkinfotech.com is valid');
assert(validateWebsiteUrl('www.google.co.in').isValid, 'www.google.co.in is valid');
assert(validateWebsiteUrl('https://app.subdomain.org/path?q=1#hero').isValid, 'URL with path/query is valid');

console.log('--- Testing Email Validation ---');
assert(!validateEmail('0099').isValid, '"0099" is not an email');
assert(validateEmail('0099').error === 'Please enter a valid email address.', 'Email error message');
assert(!validateEmail('vikram@').isValid, '"vikram@" is incomplete');
assert(!validateEmail('@domain.com').isValid, 'missing user');
assert(validateEmail('vikram@orbitretail.in').isValid, 'Valid email passes');
assert(validateEmail('').isValid, 'Empty string passes when optional');
assert(!validateEmail('', { required: true }).isValid, 'Empty string fails when required');

console.log('--- Testing Phone Number Validation ---');
// 1. Invalid phone numbers
const invalidChars = validatePhoneNumber('1246y99');
assert(!invalidChars.isValid, '"1246y99" has letter y, must be invalid');
assert(invalidChars.error?.includes('invalid characters'), 'Should report invalid characters');

const tooShort = validatePhoneNumber('12345');
assert(!tooShort.isValid, '"12345" has only 5 digits, must be invalid');
assert(tooShort.error?.includes('exactly 10 digits'), 'Should report must be exactly 10 digits');

// User screenshot example: 11 digits (98765432210)
const elevenDigits = validatePhoneNumber('98765432210');
assert(!elevenDigits.isValid, '"98765432210" has 11 digits, must be invalid');
assert(elevenDigits.error?.includes('must be exactly 10 digits (currently 11 digits)'), 'Should report exactly 10 digits');

const tooLong = validatePhoneNumber('+1 12345678901234567890');
assert(!tooLong.isValid, 'More than 10 digits must be invalid');
assert(tooLong.error?.includes('exactly 10 digits'), 'Should report exactly 10 digits');

// 2. Valid phone numbers (strictly 10 core digits)
assert(validatePhoneNumber('').isValid, 'Empty phone is valid when not required');
assert(!validatePhoneNumber('', { required: true }).isValid, 'Empty phone is invalid when required');
assert(validatePhoneNumber('+91 98765 43210').isValid, '+91 98765 43210 has 10 core digits and is valid');
assert(validatePhoneNumber('9876543210').isValid, '10-digit number is valid');
assert(validatePhoneNumber('09876543210').isValid, '10-digit number with leading 0 is valid');
assert(validatePhoneNumber('98765-43210').isValid, '10-digit formatted with dash is valid');

console.log('--- Testing Phone Matching ---');
assert(arePhonesMatching('+91 98765 43210', '9876543210'), 'Phone matching ignores country prefix on 10 digits');
assert(arePhonesMatching('98765-43210', '9876543210'), 'Phone matching ignores dashes');
assert(!arePhonesMatching('9876543210', '9876543211'), 'Different numbers must not match');

console.log('--- Testing Duplicate Lead Identification ---');
const mockLeads: Lead[] = [
  {
    id: 'lead-1',
    workspace_id: 'ws-1',
    lead_number: 'LEAD-1001',
    contact_name: 'Chandrika K',
    company_name: 'Kanishk Infotech',
    email: 'chandrika@kanishk.com',
    phone: '+91 98765 43210',
    status: 'new',
    source: 'website',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'lead-2',
    workspace_id: 'ws-1',
    lead_number: 'LEAD-1002',
    contact_name: 'Rahul Sharma',
    company_name: 'Tech Corp',
    email: 'rahul@techcorp.com',
    phone: '+91 98111 22233',
    status: 'qualified',
    source: 'manual',
    priority: 'medium',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Match by email
const dupEmail = findDuplicateLead(mockLeads, { email: 'CHANDRIKA@kanishk.com' });
assert(dupEmail.isDuplicate, 'Should detect duplicate by email');
assert(dupEmail.matchedBy === 'email', 'Matched by email');
assert(dupEmail.matchedLead?.id === 'lead-1', 'Should match lead-1');
assert(dupEmail.warningMessage.includes('Chandrika K'), 'Warning message should mention contact name');

// Match by phone
const dupPhone = findDuplicateLead(mockLeads, { email: 'different@mail.com', phone: '9876543210' });
assert(dupPhone.isDuplicate, 'Should detect duplicate by phone');
assert(dupPhone.matchedBy === 'phone', 'Matched by phone');

// Match both
const dupBoth = findDuplicateLead(mockLeads, { email: 'rahul@techcorp.com', phone: '+91 98111 22233' });
assert(dupBoth.isDuplicate, 'Should detect duplicate by both');
assert(dupBoth.matchedBy === 'both', 'Matched by both');

// No match
const noDup = findDuplicateLead(mockLeads, { email: 'unique@person.com', phone: '9999988888' });
assert(!noDup.isDuplicate, 'Should not detect duplicate for unique person');
assert(noDup.matchedLead === null, 'No matched lead');

// Exclude self (for editing existing lead)
const dupSelf = findDuplicateLead(mockLeads, { email: 'chandrika@kanishk.com', idToExclude: 'lead-1' });
assert(!dupSelf.isDuplicate, 'Should exclude self when editing lead');

console.log('✅ ALL CONTACT & DUPLICATE VALIDATION TESTS PASSED!');
