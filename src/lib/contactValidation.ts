/**
 * Contact & Entity Validation Utilities
 * 
 * Provides unified validation for:
 * 1. Website URLs (standard domain and protocol-qualified URLs)
 * 2. Phone numbers (allowed characters, length rules, and international standards)
 * 3. Duplicate Lead identification with user-friendly warnings
 */

import type { Lead } from './types';

// ============================================================================
// 1. WEBSITE URL VALIDATION
// ============================================================================

/**
 * Validates a website URL string.
 * Accepts:
 *   - Full URLs with protocol: http://example.com, https://my-site.co.in/path
 *   - Plain domains: example.com, www.example.com, portal.subdomain.org
 * Rejects:
 *   - Arbitrary text without valid domain structure: "abc", "123", "hello world"
 *   - Invalid protocols or malformed patterns
 *
 * @param url The input string to test
 * @param options.required If true, an empty string is treated as invalid
 */
export function validateWebsiteUrl(
  url: string | null | undefined,
  options?: { required?: boolean }
): { isValid: boolean; error?: string } {
  const value = (url || '').trim();

  if (!value) {
    if (options?.required) {
      return { isValid: false, error: 'Please enter a valid website URL.' };
    }
    return { isValid: true };
  }

  // Spaces are never allowed in URLs
  if (/\s/.test(value)) {
    return { isValid: false, error: 'Please enter a valid website URL.' };
  }

  // 1. If it has a scheme (http://, https://, etc.)
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { isValid: false, error: 'Please enter a valid website URL.' };
      }
      if (parsed.hostname === 'localhost') {
        return { isValid: true };
      }
      // Check that hostname has at least one dot and a valid TLD of >= 2 letters
      const validHost = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(parsed.hostname);
      if (!validHost) {
        return { isValid: false, error: 'Please enter a valid website URL.' };
      }
      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Please enter a valid website URL.' };
    }
  }

  // 2. If it's a domain without scheme (e.g. example.com, www.site.co.in/about)
  // Must have at least one dot separating labels, ending in a valid TLD (>= 2 alpha characters)
  const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
  if (!domainPattern.test(value)) {
    return { isValid: false, error: 'Please enter a valid website URL.' };
  }

  return { isValid: true };
}

// ============================================================================
// 1.1 EMAIL VALIDATION
// ============================================================================

/**
 * Validates an email address format.
 * Rejects non-email inputs (such as "0099") without proper '@' and domain.
 */
export function validateEmail(
  email: string | null | undefined,
  options?: { required?: boolean; fieldLabel?: string }
): { isValid: boolean; error?: string } {
  const label = options?.fieldLabel || 'Email address';
  const value = (email || '').trim();

  if (!value) {
    if (options?.required) {
      return { isValid: false, error: `${label} is required.` };
    }
    return { isValid: true };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(value)) {
    return { isValid: false, error: 'Please enter a valid email address.' };
  }

  return { isValid: true };
}

// ============================================================================
// 2. PHONE NUMBER VALIDATION
// ============================================================================

/**
 * Validates phone number according to supported country/format rules:
 * - Allowed characters: Digits (0-9), optional leading +, spaces, hyphens (-), parentheses (())
 * - Disallowed characters: Letters (e.g. 'y' in '1246y99'), special symbols like @, #, etc.
 * - Length: Standard 10 digits (allows optional leading +91 or 0 prefix).
 *
 * @param phone The input phone string
 * @param options.required If true, an empty string is treated as invalid
 * @param options.fieldLabel Name of the field for custom error messaging (default: 'Phone number')
 */
export function validatePhoneNumber(
  phone: string | null | undefined,
  options?: { required?: boolean; fieldLabel?: string }
): { isValid: boolean; error?: string } {
  const label = options?.fieldLabel || 'Phone number';
  const value = (phone || '').trim();

  if (!value) {
    if (options?.required) {
      return { isValid: false, error: `${label} is required.` };
    }
    return { isValid: true };
  }

  // Check allowed characters: optional leading +, digits, spaces, dashes, parentheses
  const allowedCharsPattern = /^\+?[0-9\s\-()]+$/;
  if (!allowedCharsPattern.test(value)) {
    return {
      isValid: false,
      error: `${label} contains invalid characters. Only digits, +, -, and spaces are allowed.`,
    };
  }

  // Extract core 10 digits:
  // If starts with +91 or 91 (12 digits), strip country code 91
  // If starts with 0 (11 digits), strip trunk prefix 0
  const digitsOnly = value.replace(/[^0-9]/g, '');
  let coreDigits = digitsOnly;
  if (coreDigits.length === 12 && (coreDigits.startsWith('91') || value.startsWith('+91'))) {
    coreDigits = coreDigits.slice(2);
  } else if (coreDigits.length === 11 && coreDigits.startsWith('0')) {
    coreDigits = coreDigits.slice(1);
  }

  if (coreDigits.length !== 10) {
    return {
      isValid: false,
      error: `${label} must be exactly 10 digits (currently ${coreDigits.length} digits).`,
    };
  }

  return { isValid: true };
}

// ============================================================================
// 2.1 PAN & GSTIN VALIDATION
// ============================================================================

/**
 * Validates Indian PAN (Permanent Account Number).
 * Format: 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F).
 */
export function validatePAN(
  pan: string | null | undefined,
  options?: { required?: boolean }
): { isValid: boolean; error?: string } {
  const value = (pan || '').trim().toUpperCase();
  if (!value) {
    if (options?.required) return { isValid: false, error: 'PAN is required.' };
    return { isValid: true };
  }
  const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panPattern.test(value)) {
    return { isValid: false, error: 'PAN must be a valid 10-character code (e.g. ABCDE1234F).' };
  }
  return { isValid: true };
}

/**
 * Validates Indian GSTIN (Goods and Services Tax Identification Number).
 * Format: 2 digits + 5 uppercase letters + 4 digits + 1 letter + 1 char + Z + 1 char (15 chars total).
 */
export function validateGSTIN(
  gstin: string | null | undefined,
  options?: { required?: boolean }
): { isValid: boolean; error?: string } {
  const value = (gstin || '').trim().toUpperCase();
  if (!value) {
    if (options?.required) return { isValid: false, error: 'GSTIN is required when registered.' };
    return { isValid: true };
  }
  const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinPattern.test(value)) {
    return { isValid: false, error: 'GSTIN must be a valid 15-character number (e.g. 29ABCDE1234F1Z5).' };
  }
  return { isValid: true };
}

// ============================================================================
// 3. DUPLICATE LEAD VALIDATION
// ============================================================================

export interface DuplicateCriteriaConfig {
  checkEmail?: boolean;
  checkPhone?: boolean;
}

export interface DuplicateMatchResult {
  isDuplicate: boolean;
  matchedBy: 'email' | 'phone' | 'both' | null;
  matchedLead: Lead | null;
  warningMessage: string;
}

/**
 * Normalizes email for case-insensitive duplicate matching
 */
export function normalizeContactEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

/**
 * Normalizes phone number to raw digits for matching
 */
export function normalizeContactPhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Checks whether two phone numbers refer to the same contact.
 * Compares the full digits, or the last 10 digits if numbers have country codes.
 */
export function arePhonesMatching(phoneA?: string | null, phoneB?: string | null): boolean {
  const digitsA = normalizeContactPhone(phoneA);
  const digitsB = normalizeContactPhone(phoneB);

  if (!digitsA || !digitsB || digitsA.length < 7 || digitsB.length < 7) {
    return false;
  }

  if (digitsA === digitsB) {
    return true;
  }

  // If numbers include country codes (e.g., 919876543210 and 9876543210), compare the last 10 digits
  if (digitsA.length >= 10 && digitsB.length >= 10) {
    return digitsA.slice(-10) === digitsB.slice(-10);
  }

  return false;
}

/**
 * Checks for duplicate leads in an existing array according to configured criteria:
 * - Matching email (case-insensitive)
 * - Matching phone number (normalized digits / last 10 digits)
 * 
 * Returns a user-friendly duplicate warning and reference to the existing record.
 */
export function findDuplicateLead(
  existingLeads: Lead[],
  candidate: {
    email?: string | null;
    phone?: string | null;
    idToExclude?: string;
  },
  config: DuplicateCriteriaConfig = { checkEmail: true, checkPhone: true }
): DuplicateMatchResult {
  const candidateEmail = normalizeContactEmail(candidate.email);
  const candidatePhone = candidate.phone?.trim() || '';

  if (!candidateEmail && !candidatePhone) {
    return {
      isDuplicate: false,
      matchedBy: null,
      matchedLead: null,
      warningMessage: '',
    };
  }

  for (const lead of existingLeads) {
    if (candidate.idToExclude && lead.id === candidate.idToExclude) {
      continue;
    }

    const emailMatch =
      Boolean(config.checkEmail) &&
      Boolean(candidateEmail) &&
      normalizeContactEmail(lead.email) === candidateEmail;

    const phoneMatch =
      Boolean(config.checkPhone) &&
      Boolean(candidatePhone) &&
      arePhonesMatching(lead.phone, candidatePhone);

    if (emailMatch || phoneMatch) {
      const matchedBy = emailMatch && phoneMatch ? 'both' : emailMatch ? 'email' : 'phone';
      const leadName = lead.contact_name || lead.company_name || 'Existing Lead';
      const leadNum = lead.lead_number ? ` (${lead.lead_number})` : '';
      const leadStatus = lead.status ? ` [Status: ${lead.status}]` : '';

      let warningMessage = '';
      if (matchedBy === 'both') {
        warningMessage = `A lead with this email and phone number already exists: "${leadName}"${leadNum}${leadStatus}.`;
      } else if (matchedBy === 'email') {
        warningMessage = `A lead with this email address already exists: "${leadName}"${leadNum}${leadStatus}.`;
      } else {
        warningMessage = `A lead with this phone number already exists: "${leadName}"${leadNum}${leadStatus}.`;
      }

      return {
        isDuplicate: true,
        matchedBy,
        matchedLead: lead,
        warningMessage,
      };
    }
  }

  return {
    isDuplicate: false,
    matchedBy: null,
    matchedLead: null,
    warningMessage: '',
  };
}
