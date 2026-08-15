export const formatShortId = (id) => {
  if (!id) return 'N/A';
  const str = String(id).trim();
  if (!str) return 'N/A';

  // If it's a short human-assigned ID (e.g. 001, 1234, TRN01, GYM001), return as is
  if (str.length <= 6) return str;

  // For long UUIDs or IDs > 6 characters, take the first 4 characters/digits
  return str.slice(0, 4).toUpperCase();
};

export default formatShortId;
