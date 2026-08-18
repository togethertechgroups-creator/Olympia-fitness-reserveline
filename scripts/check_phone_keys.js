import xlsx from 'xlsx';

const wb = xlsx.readFile('ACTIVE & INACTIVE(12_08_26) (1).xlsx');
wb.SheetNames.forEach(sheetName => {
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true });
  console.log(`Sheet "${sheetName}": ${rows.length} rows`);
  if (rows.length > 0) {
    console.log('Keys:', Object.keys(rows[0]));
    console.log('Row 0:', rows[0]);
    console.log('Row 1:', rows[1]);
  }
});
