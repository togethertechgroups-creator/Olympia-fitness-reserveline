import { utils } from 'xlsx';

export const parseExcelDateValue = (val, forceSwap = false) => {
  if (!val) return '';

  let year, month, day;

  // 1. If val is a number (Excel Serial Date)
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      year = String(dateObj.getFullYear());
      month = String(dateObj.getMonth() + 1).padStart(2, '0');
      day = String(dateObj.getDate()).padStart(2, '0');
    }
  } else {
    const str = String(val).trim();
    if (!str) return '';

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const [y, m, d] = str.split(/[-/]/);
      year = y; month = m.padStart(2, '0'); day = d.padStart(2, '0');
    } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const [d, m, y] = str.split(/[-/]/);
      year = y; month = m.padStart(2, '0'); day = d.padStart(2, '0');
    }
  }

  if (year && month && day) {
    if (forceSwap && parseInt(day, 10) <= 12) {
      const temp = month;
      month = day.padStart(2, '0');
      day = temp.padStart(2, '0');
    }
    return `${year}-${month}-${day}`;
  }

  return String(val).trim();
};

export function parseUploadedExcel(wb, fileName = '') {
  const clientsData = [];
  const txnsData = [];
  const seenClientKeys = new Set();
  const todayISO = new Date().toISOString().split('T')[0];

  const cleanFileName = String(fileName).toUpperCase();
  const isInactiveFile = cleanFileName.includes('INACTIVE') && !cleanFileName.includes('ACTIVE & INACTIVE');
  const isActiveFile = cleanFileName.includes('ACTIVE') && !cleanFileName.includes('INACTIVE');

  // Helper to parse a row into a standardized client object
  const processClientRow = (r, sheetName = '', defaultId = 1) => {
    // Find client name key (matches Name, Client, Member, Customer, Candidate, Person)
    const nameKey = Object.keys(r).find(k => /name|client|member|customer|person|candidate/i.test(k));
    const nameVal = nameKey ? r[nameKey] : null;

    if (!nameVal || String(nameVal).toLowerCase().includes('total')) return null;

    const cleanName = String(nameVal).trim();

    const phoneKey = Object.keys(r).find(k => /phone|contact|mobile|number|cell|tel/i.test(k));
    const planKey = Object.keys(r).find(k => /plan|package|details|membership|type|scheme/i.test(k));
    const fromDateKey = Object.keys(r).find(k => /from|join|admission|start|date/i.test(k));
    const toDateKey = Object.keys(r).find(k => /to|expiry|end|valid/i.test(k));
    const idKey = Object.keys(r).find(k => /^id$|^clientid$/i.test(k));
    const remDaysKey = Object.keys(r).find(k => /rem/i.test(k));

    const rawId = idKey ? r[idKey] : defaultId;
    const formattedClientId = typeof rawId === 'number'
      ? `CLI-${String(rawId).padStart(4, '0')}`
      : String(rawId).startsWith('CLI-') ? String(rawId) : `CLI-${String(rawId).padStart(4, '0')}`;

    // Only deduplicate if an explicit ID is provided in the row
    if (idKey && r[idKey]) {
      const dedupeId = String(r[idKey]).trim();
      if (seenClientKeys.has(dedupeId)) return null;
      seenClientKeys.add(dedupeId);
    }

    const remDays = (remDaysKey && r[remDaysKey] !== undefined && r[remDaysKey] !== null) ? parseInt(r[remDaysKey], 10) : undefined;
    const isRemDaysPositive = remDays !== undefined && !isNaN(remDays) && remDays >= 0;

    let fromDate = fromDateKey ? parseExcelDateValue(r[fromDateKey], false) : (r.fromDate || '');
    let expiryDate = toDateKey ? parseExcelDateValue(r[toDateKey], false) : (r.expiryDate || '');

    const isExplicitActiveSheet = (sheetName.toUpperCase().includes('ACTIVE') && !sheetName.toUpperCase().includes('INACTIVE')) || isActiveFile;
    const isExplicitInactiveSheet = sheetName.toUpperCase().includes('INACTIVE') || isInactiveFile;

    // Smart Swap Detection for US locale Excel day/month inversion
    if (expiryDate && fromDate && (expiryDate < fromDate || (isRemDaysPositive && expiryDate < todayISO) || (isExplicitActiveSheet && expiryDate < todayISO))) {
      const swappedFrom = parseExcelDateValue(r[fromDateKey], true);
      const swappedTo = parseExcelDateValue(r[toDateKey], true);
      if (swappedTo >= swappedFrom && (isRemDaysPositive || swappedTo >= todayISO)) {
        fromDate = swappedFrom;
        expiryDate = swappedTo;
      }
    }

    let status = 'active';
    if (isExplicitInactiveSheet || (expiryDate && expiryDate < todayISO && !isRemDaysPositive)) {
      status = 'inactive';
    }
    if ((isExplicitActiveSheet || isRemDaysPositive) && expiryDate && expiryDate >= todayISO && !isExplicitInactiveSheet) {
      status = 'active';
    }

    return {
      id: r.id && String(r.id).length > 20 ? r.id : undefined,
      clientId: formattedClientId,
      name: cleanName,
      phone: phoneKey ? String(r[phoneKey]).replace(/\D/g, '') : '',
      plan: planKey ? String(r[planKey]).trim() : (r.plan || 'General Plan'),
      fromDate: fromDate,
      expiryDate: expiryDate,
      amount: parseFloat(r.amount || r.Amount || r.Price || 0) || 0,
      paidAmount: parseFloat(r.paidAmount || r.Paid || 0) || 0,
      dueAmount: parseFloat(r.dueAmount || r.Due || 0) || 0,
      status: status,
      dateAdded: r.dateAdded || new Date().toISOString()
    };
  };

  // 1. Check if backup sheet "Transactions" exists
  if (wb.Sheets["Transactions"]) {
    const rows = utils.sheet_to_json(wb.Sheets["Transactions"], { raw: true });
    txnsData.push(...rows);
  }

  // 2. Iterate through all sheets to capture 100% of rows across all tabs
  wb.SheetNames.forEach(sheetName => {
    // Skip transactions tab for client parsing
    if (sheetName.toLowerCase() === 'transactions') return;

    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;

    // Use raw: true so SheetJS reads raw numeric serials and strings directly without US locale interference
    const rows = utils.sheet_to_json(sheet, { raw: true });
    let rowNum = clientsData.length + 1;

    rows.forEach((r) => {
      const clientObj = processClientRow(r, sheetName, rowNum);
      if (clientObj) {
        clientsData.push(clientObj);
        rowNum++;
      }
    });
  });

  return { clientsData, txnsData };
}