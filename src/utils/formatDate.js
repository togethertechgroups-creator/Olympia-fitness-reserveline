export const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) {
    const [y, m, d] = dateString.trim().split('-');
    return `${d}-${m}-${y}`;
  }
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export const formatDate = formatDateDDMMYYYY;
