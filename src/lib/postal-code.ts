/**
 * Indonesian postal codes are always exactly 5 digits and, in addresses
 * typed out by hand, they almost always appear as the LAST standalone
 * 5-digit number in the string (city/province names are words, not
 * digits, and phone numbers living in the same field are typically much
 * longer than 5 digits). Not foolproof, but a solid best-effort default
 * that's always safe to double-check and correct manually.
 */
export function extractPostalCode(address: string | null | undefined): string | null {
  if (!address) return null;
  const matches = address.match(/\b\d{5}\b/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}
