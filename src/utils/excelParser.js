import { utils } from 'xlsx';

export const parseExcelDateValue = (val) => {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial number date conversion (days since 1899-12-30)
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return str;
};

export function parseUploadedExcel(wb) {
  const clientsData = [];
  const txnsData = [];

  // 1. If standard backup sheets exist ("Clients" / "Transactions")
  if (wb.Sheets["Clients"]) {
    const rows = utils.sheet_to_json(wb.Sheets["Clients"]);
    clientsData.push(...rows);
  }
  if (wb.Sheets["Transactions"]) {
    const rows = utils.sheet_to_json(wb.Sheets["Transactions"]);
    txnsData.push(...rows);
  }

  // 2. If standard sheets not found or empty, iterate through all sheets dynamically
  if (clientsData.length === 0) {
    wb.SheetNames.forEach(sheetName => {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) return;
      const rows = utils.sheet_to_json(sheet);

      rows.forEach((r, idx) => {
        // Look for client name key
        const nameKey = Object.keys(r).find(k => /name/i.test(k));
        const nameVal = nameKey ? r[nameKey] : null;

        if (!nameVal || String(nameVal).toLowerCase().includes('total')) return;

        const phoneKey = Object.keys(r).find(k => /phone|contact|mobile/i.test(k));
        const planKey = Object.keys(r).find(k => /plan|package|details/i.test(k));
        const fromDateKey = Object.keys(r).find(k => /from|join|admission|start/i.test(k));
        const toDateKey = Object.keys(r).find(k => /to|expiry|end/i.test(k));
        const idKey = Object.keys(r).find(k => /^id$|^clientid$/i.test(k));
        const remDaysKey = Object.keys(r).find(k => /rem/i.test(k));

        const rawId = idKey ? r[idKey] : (clientsData.length + 1);
        const formattedClientId = typeof rawId === 'number'
          ? `CLI-${String(rawId).padStart(4, '0')}`
          : String(rawId).startsWith('CLI-') ? String(rawId) : `CLI-${String(rawId).padStart(4, '0')}`;

        const isInactiveSheet = sheetName.toUpperCase().includes('INACTIVE');
        const remDays = remDaysKey ? parseInt(r[remDaysKey] || 0, 10) : 0;

        let status = (r.status || '').toLowerCase() || 'active';
        if (isInactiveSheet || remDays < 0) {
          status = remDays < -30 ? 'inactive' : 'expired';
        }

        clientsData.push({
          id: formattedClientId,
          clientId: formattedClientId,
          name: String(nameVal).trim(),
          phone: phoneKey ? String(r[phoneKey]).replace(/\D/g, '') : '',
          plan: planKey ? String(r[planKey]).trim() : 'General Plan',
          fromDate: fromDateKey ? parseExcelDateValue(r[fromDateKey]) : '',
          expiryDate: toDateKey ? parseExcelDateValue(r[toDateKey]) : '',
          amount: parseFloat(r.amount || r.Amount || r.Price || 0) || 0,
          paidAmount: parseFloat(r.paidAmount || r.Paid || 0) || 0,
          dueAmount: parseFloat(r.dueAmount || r.Due || 0) || 0,
          status: status,
          dateAdded: new Date().toISOString()
        });
      });
    });
  }

  return { clientsData, txnsData };
}
