export const formatShortId = (id) => {
  if (!id && id !== 0) return 'N/A';
  let str = String(id).trim();
  if (!str) return 'N/A';

  // Remove "CLI-" or "cli" prefix
  if (/^CLI[-_\s]?/i.test(str)) {
    str = str.replace(/^CLI[-_\s]?/i, '');
    return str.toUpperCase() || 'N/A';
  }

  // If it's a formatted ID like TRN-001, BILL-0010, PT-001, return as is
  if (/^(TRN|BILL|PT|SUB|ADM|GST)-/i.test(str)) {
    return str.toUpperCase();
  }

  // If length <= 10, return as is
  if (str.length <= 10) return str.toUpperCase();

  // For long raw UUIDs, return first 8 chars
  return str.slice(0, 8).toUpperCase();
};

export default formatShortId;
