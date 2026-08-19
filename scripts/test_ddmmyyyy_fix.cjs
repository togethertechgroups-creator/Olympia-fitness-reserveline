const path = require('path');
const fs = require('fs');
const { read, utils } = require('xlsx');

const excelFilePath = path.join(__dirname, '..', 'ACTIVE & INACTIVE(12_08_26) (1).xlsx');
const data = fs.readFileSync(excelFilePath);
const wb = read(data, { type: 'buffer' });

// Fixed Date Parser enforcing Indian DD-MM-YYYY convention for DD-MM-YYYY strings
function parseIndianDateVal(val) {
  if (!val) return null;
  
  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth(); // 0-indexed
      const day = dateObj.getDate();
      const d = new Date(year, month, day);
      d.setHours(0,0,0,0);
      return d;
    }
  }

  let str = String(val).trim();
  if (!str) return null;
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes(' ')) str = str.split(' ')[0];

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    d.setHours(0,0,0,0);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD-MM-YYYY or DD/MM/YYYY (Indian Standard: FIRST number is DAY, SECOND is MONTH)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    d.setHours(0,0,0,0);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  return d;
}

function formatDateISO(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const todayStr = '2026-08-19';
const todayObj = new Date(todayStr);
todayObj.setHours(0,0,0,0);

const activeSheet = wb.Sheets['ACTIVE(1808)'];
const rows = utils.sheet_to_json(activeSheet, { raw: true });

let activeCount = 0;
let expiredCount = 0;
const list = [];

rows.forEach((r, idx) => {
  const nameKey = Object.keys(r).find(k => /name|client|member|customer|person/i.test(k));
  const nameVal = nameKey ? r[nameKey] : null;
  if (!nameVal || String(nameVal).toLowerCase().includes('total')) return;

  const phoneKey = Object.keys(r).find(k => /phone|contact|mobile|number/i.test(k));
  const planKey = Object.keys(r).find(k => /plan|package|membership|details/i.test(k));
  const fromDateKey = Object.keys(r).find(k => /from|join|start|admission/i.test(k));
  const toDateKey = Object.keys(r).find(k => /to|expiry|end|valid/i.test(k));
  const idKey = Object.keys(r).find(k => /^id$|^clientid$/i.test(k));

  const clientName = String(nameVal).trim();
  const phone = phoneKey ? String(r[phoneKey]).trim() : '';
  const plan = planKey ? String(r[planKey]).trim() : '';
  const fromDateObj = fromDateKey ? parseIndianDateVal(r[fromDateKey]) : null;
  const expiryDateObj = toDateKey ? parseIndianDateVal(r[toDateKey]) : null;
  const clientId = idKey ? String(r[idKey]).trim() : `ROW-${idx + 1}`;

  const diffDays = expiryDateObj ? Math.round((expiryDateObj - todayObj) / (1000 * 60 * 60 * 24)) : null;

  const isExpired = expiryDateObj ? (expiryDateObj < todayObj) : false;

  if (isExpired) {
    expiredCount++;
  } else {
    activeCount++;
  }

  list.push({
    ID: clientId,
    Name: clientName,
    Phone: phone,
    Plan: plan,
    From: formatDateISO(fromDateObj),
    Expiry: formatDateISO(expiryDateObj),
    DiffDays: diffDays,
    IsActive: !isExpired
  });
});

console.log('====================================================');
console.log('🎉 WITH INDIAN DD-MM-YYYY DATE PARSING FIX:');
console.log('Total Clients in ACTIVE Sheet Tab:', rows.length);
console.log('TRUE ACTIVE CLIENTS (Expiry >= Today):', activeCount);
console.log('EXPIRED CLIENTS in ACTIVE Sheet Tab:', expiredCount);
console.log('====================================================\n');

const murali = list.find(c => c.Name.includes('MURALI'));
console.log('📌 MURALI Record:', murali);

console.log('\nSample Clients in ACTIVE sheet tab with DD-MM-YYYY parsing:');
console.table(list.slice(0, 15));
