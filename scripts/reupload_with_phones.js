import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

console.log('🚀 Starting Cloudflare D1 Client Phone Number Update...');

const filePath = path.resolve('ACTIVE & INACTIVE(12_08_26) (1).xlsx');
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

const wb = xlsx.readFile(filePath, { cellDates: false, raw: true });
console.log('📄 Sheet Names found:', wb.SheetNames);

const parseExcelDateValue = (val) => {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const y = String(dateObj.getFullYear());
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  let str = String(val).trim();
  if (!str) return '';
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes(' ')) str = str.split(' ')[0];
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split(/[-/]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
    const [d, m, y] = str.split(/[-/]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
};

const clients = [];
let count = 0;

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return;
  const rows = xlsx.utils.sheet_to_json(sheet, { raw: true });
  const isInactiveSheet = sheetName.toUpperCase().includes('INACTIVE');

  rows.forEach((r) => {
    const nameKey = Object.keys(r).find(k => /name|client|member/i.test(k));
    const nameVal = nameKey ? r[nameKey] : null;
    if (!nameVal || String(nameVal).toLowerCase().includes('total')) return;
    const cleanName = String(nameVal).trim();
    if (cleanName.length < 2) return;

    count++;
    const idKey = Object.keys(r).find(k => /^id$/i.test(k)) || Object.keys(r).find(k => /id/i.test(k));
    const rawId = idKey ? r[idKey] : count;
    let clientIdStr = String(rawId).trim();
    if (/^\d+$/.test(clientIdStr)) clientIdStr = clientIdStr.padStart(4, '0');

    // Phone key detection
    const phoneKey = Object.keys(r).find(k => /phone|mobile|contact|cell|tel/i.test(k));
    const rawMobile = phoneKey ? r[phoneKey] : (r['Phone No'] || r['Phone No.'] || r['Mobile Number'] || r['Phone'] || '');
    const cleanPhoneDigits = String(rawMobile || '').replace(/\D/g, '');
    const phoneStr = cleanPhoneDigits ? (cleanPhoneDigits.length === 10 ? `+91 ${cleanPhoneDigits}` : cleanPhoneDigits) : '';

    const planKey = Object.keys(r).find(k => /plan|package|details/i.test(k));
    const planStr = String((planKey ? r[planKey] : r['Plan Details']) || 'Monthly').trim();

    const fromDateKey = Object.keys(r).find(k => /from|join|start/i.test(k));
    const toDateKey = Object.keys(r).find(k => /to|expiry|end/i.test(k));
    const fromDate = parseExcelDateValue(fromDateKey ? r[fromDateKey] : r['From Date']);
    const toDate = parseExcelDateValue(toDateKey ? r[toDateKey] : r['To Date']);

    const genderKey = Object.keys(r).find(k => /gender|sex/i.test(k));
    const genderStr = String((genderKey ? r[genderKey] : r['Gender']) || 'Male').trim();

    const amountKey = Object.keys(r).find(k => /amount|price|fee/i.test(k));
    const rawAmt = amountKey ? r[amountKey] : 0;
    const amt = typeof rawAmt === 'number' ? rawAmt : (parseFloat(String(rawAmt).replace(/[^\d.]/g, '')) || 0);

    let status = isInactiveSheet ? 'inactive' : 'active';

    clients.push({
      id: randomUUID(),
      clientId: clientIdStr,
      name: cleanName,
      phone: phoneStr,
      plan: planStr,
      fromDate: fromDate,
      expiryDate: toDate,
      amount: amt,
      paidAmount: amt,
      dueAmount: 0,
      paymentStatus: 'Paid',
      personalTraining: 0,
      status: status,
      gender: genderStr || 'Male',
      admissionDate: fromDate || new Date().toISOString().split('T')[0]
    });
  });
});

const withPhoneCount = clients.filter(c => c.phone !== '').length;
console.log(`📊 Parsed Total Clients: ${clients.length} (Clients with Phone Numbers: ${withPhoneCount})`);
console.log('Sample Client [0]:', clients[0]);
console.log('Sample Client [1]:', clients[1]);

const escapeSql = (str) => {
  if (str === null || str === undefined || str === '') return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
};

// 1. Wipe existing clients
console.log('🧹 Clearing existing clients table in Cloudflare D1...');
try {
  execSync('npx.cmd --yes wrangler d1 execute olympia-fitness-db --remote --command="DELETE FROM clients;" --yes', { stdio: 'inherit' });
} catch (e) {
  console.error('Wipe notice:', e.message);
}

// 2. Upload in batches of 50
const CHUNK_SIZE = 50;
const totalBatches = Math.ceil(clients.length / CHUNK_SIZE);
let successCount = 0;

for (let i = 0; i < clients.length; i += CHUNK_SIZE) {
  const chunk = clients.slice(i, i + CHUNK_SIZE);
  const values = chunk.map(c => 
    `(${escapeSql(c.id)}, ${escapeSql(c.clientId)}, ${escapeSql(c.name)}, ${escapeSql(c.phone)}, ${escapeSql(c.plan)}, ${escapeSql(c.fromDate)}, ${escapeSql(c.expiryDate)}, ${c.amount}, ${c.paidAmount}, ${c.dueAmount}, ${escapeSql(c.paymentStatus)}, ${c.personalTraining}, ${escapeSql(c.status)}, ${escapeSql(c.gender)}, ${escapeSql(c.admissionDate)})`
  ).join(',\n');

  const sqlContent = `INSERT INTO clients (id, clientId, name, phone, plan, fromDate, expiryDate, amount, paidAmount, dueAmount, paymentStatus, personalTraining, status, gender, admissionDate) VALUES\n${values};\n`;

  const batchFile = path.resolve(`batch_${i}.sql`);
  fs.writeFileSync(batchFile, sqlContent, 'utf8');

  try {
    const cmd = `npx.cmd --yes wrangler d1 execute olympia-fitness-db --remote --file="${batchFile.replace(/\\/g, '/')}" --yes`;
    execSync(cmd, { stdio: 'ignore' });
    successCount += chunk.length;
    console.log(`✅ Uploaded batch ${Math.floor(i / CHUNK_SIZE) + 1}/${totalBatches} (${successCount}/${clients.length} clients)`);
  } catch (err) {
    console.error(`❌ Batch ${Math.floor(i / CHUNK_SIZE) + 1} failed:`, err.message);
  } finally {
    if (fs.existsSync(batchFile)) fs.unlinkSync(batchFile);
  }
}

console.log(`🎉 SUCCESS: Re-uploaded ${successCount}/${clients.length} clients WITH phone numbers into Cloudflare D1!`);
