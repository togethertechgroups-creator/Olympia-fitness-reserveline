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

export const calculatePlanExpiryDate = (startDateStr, planType, customDurationDays = null) => {
  if (!startDateStr) return '';

  let str = String(startDateStr).trim();
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes(' ')) str = str.split(' ')[0];

  let year, month, day;
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10) - 1;
    day = parseInt(ymdMatch[3], 10);
  } else {
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10) - 1;
      year = parseInt(dmyMatch[3], 10);
    } else {
      const dObj = new Date(str);
      if (isNaN(dObj.getTime())) return '';
      year = dObj.getFullYear();
      month = dObj.getMonth();
      day = dObj.getDate();
    }
  }

  const planLower = (planType || '').toLowerCase().trim();

  let monthsToAdd = 0;
  if (planLower.includes('annual') || planLower.includes('yearly') || planLower.includes('12 month')) {
    monthsToAdd = 12;
  } else if (planLower.includes('half-yearly') || planLower.includes('half yearly') || planLower.includes('semi-annual') || planLower.includes('6 month')) {
    monthsToAdd = 6;
  } else if (planLower.includes('quarterly') || planLower.includes('3 month')) {
    monthsToAdd = 3;
  } else if (planLower.includes('monthly') || planLower.includes('1 month')) {
    monthsToAdd = 1;
  } else if (planLower.includes('2 month')) {
    monthsToAdd = 2;
  }

  if (monthsToAdd > 0) {
    const targetMonth = month + monthsToAdd;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;

    const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const targetDay = Math.min(day, daysInTargetMonth);

    const targetDate = new Date(targetYear, normalizedMonth, targetDay);
    targetDate.setDate(targetDate.getDate() - 1);

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const days = customDurationDays ? parseInt(customDurationDays, 10) : 30;
  const targetDate = new Date(year, month, day);
  targetDate.setDate(targetDate.getDate() + days - 1);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const formatDate = formatDateDDMMYYYY;
