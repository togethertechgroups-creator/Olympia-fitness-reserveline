export const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return 'N/A';
  const str = String(dateString).trim();
  if (!str || str === 'null' || str === 'undefined') return 'N/A';

  // 1. Matches YYYY-MM-DD or ISO timestamp e.g. "2026-09-08" or "2026-09-08T00:00:00.000Z"
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  }

  // 2. Matches DD-MM-YYYY or DD/MM/YYYY e.g. "08-09-2026" or "08/09/2026"
  const ddmmMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmMatch) {
    const [, d, m, y] = ddmmMatch;
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  }

  // 3. Fallback for JS Date object timestamp
  const dObj = new Date(str);
  if (isNaN(dObj.getTime())) return str;
  const day = String(dObj.getDate()).padStart(2, '0');
  const month = String(dObj.getMonth() + 1).padStart(2, '0');
  const year = dObj.getFullYear();
  return `${day}-${month}-${year}`;
};

export const formatDate = formatDateDDMMYYYY;
