/**
 * Standard 15-character Indian GSTIN Validation Helper
 * Pattern: 2-digit state code + 10-char PAN + entity code + 'Z' + checksum char
 * Example: 33ABCDE1234F1Z5
 */
export const isValidGSTIN = (gstin) => {
  if (!gstin || typeof gstin !== 'string') return false;
  const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
  return pattern.test(gstin.trim());
};
