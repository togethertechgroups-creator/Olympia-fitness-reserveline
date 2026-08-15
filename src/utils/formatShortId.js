export const formatShortId = (id) => {
  if (!id && id !== 0) return 'N/A';
  const str = String(id).trim();
  if (!str) return 'N/A';

  // If it's a formatted ID like CLI-2789, CLI-0010, TRN-001, return as is
  if (/^(CLI|TRN|BILL|PT|SUB|ADM|GST)-/i.test(str)) {
    return str.toUpperCase();
  }

  // If length <= 10, return as is
  if (str.length <= 10) return str.toUpperCase();

  // For long raw UUIDs, return first 8 chars
  return str.slice(0, 8).toUpperCase();
};

export default formatShortId;
