/**
 * Israeli phone normalization for WhatsApp import.
 *
 * Handles formats from Excel:
 *   "053-2594826"     → "+972532594826"
 *   502171103         → "+972502171103"  (float from Excel)
 *   "0543200050"      → "+972543200050"
 *   "=+1 3477704511"  → "+13477704511"  (Excel formula)
 *   "13107790495"     → "+13107790495"  (US number)
 *   "+972502171103"   → "+972502171103"
 */

export function normalizeIsraeliPhone(raw: unknown): string {
  if (raw == null) return "";

  let phone = String(raw).trim();

  // Handle Excel formula format: "=+1 3477704511"
  if (phone.startsWith("=")) {
    phone = phone.slice(1);
  }

  // Remove all non-digit characters except leading +
  const hasPlus = phone.startsWith("+");
  phone = phone.replace(/\D/g, "");

  // Handle float format from Excel (no leading zero): 502171103 → 0502171103
  // Israeli mobile: 5x (9 digits without 0 prefix)
  if (phone.length === 9 && /^5/.test(phone)) {
    phone = "0" + phone;
  }

  // Convert Israeli format: 05x → +9725x
  if (phone.startsWith("05") && phone.length === 10) {
    return "+972" + phone.slice(1);
  }

  // Already has Israeli country code
  if (phone.startsWith("9725") && phone.length === 12) {
    return "+" + phone;
  }

  // Already normalized with +
  if (hasPlus && phone.length >= 10) {
    return "+" + phone;
  }

  // US/international number (starts with 1, 10+ digits)
  if (phone.startsWith("1") && phone.length >= 11) {
    return "+" + phone;
  }

  // Return with + if it looks valid (10+ digits)
  if (phone.length >= 10) {
    return "+" + phone;
  }

  // Return as-is for short/invalid numbers
  return phone;
}

/**
 * Compare two phone numbers after normalization.
 */
export function phonesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeIsraeliPhone(a);
  const nb = normalizeIsraeliPhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Check if a WhatsApp contact name is "real" (not auto-generated).
 * Skip patterns: null, empty, "w 05xxxxxxxx", phone-as-name, single letter names.
 */
export function isRealName(name: unknown): boolean {
  if (name == null) return false;
  const s = String(name).trim();
  if (!s) return false;
  if (s.length <= 1) return false;
  // WhatsApp auto-name: "w 05..." or "w 1347..."
  if (/^w\s+\d/i.test(s)) return false;
  // Pure phone number as name
  if (/^\+?\d[\d\s\-()]+$/.test(s)) return false;
  return true;
}
