import xlsx from 'xlsx';

const wb = xlsx.readFile('ACTIVE & INACTIVE(12_08_26) (1).xlsx');
console.log('Sheet Names:', wb.SheetNames);

wb.SheetNames.forEach(name => {
  const sheet = wb.Sheets[name];
  const rows = xlsx.utils.sheet_to_json(sheet, { raw: true });
  console.log(`Sheet "${name}" row 0 keys:`, Object.keys(rows[0] || {}));
  console.log(`Sheet "${name}" row 0 values:`, rows[0]);
  
  // Find all distinct gender values if any
  const genders = new Set();
  rows.forEach(r => {
    Object.keys(r).forEach(k => {
      if (/gender|sex/i.test(k)) {
        genders.add(String(r[k]));
      }
    });
  });
  console.log(`Distinct gender values in "${name}":`, Array.from(genders));
});
