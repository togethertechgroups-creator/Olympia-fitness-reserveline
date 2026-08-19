const path = require('path');
const fs = require('fs');

const sqlContent = fs.readFileSync(path.join(__dirname, 'fix_d1_dates.sql'), 'utf8');
const lines = sqlContent.split('\n');

const expiredLines = [];

lines.forEach((line, idx) => {
  if (idx >= 208) return; // Only look at the 208 rows from ACTIVE sheet tab
  const match = line.match(/UPDATE clients SET fromDate = '(.*?)', expiryDate = '(.*?)', status = '(.*?)' WHERE clientId = '(.*?)'.*?name = '(.*?)'/);
  if (match) {
    const [_, fromDate, expiryDate, status, clientId, name] = match;
    if (expiryDate < '2026-08-19') {
      expiredLines.push({
        Row: idx + 1,
        ID: clientId,
        Name: name,
        FromDate: fromDate,
        ExpiryDate: expiryDate
      });
    }
  }
});

console.log(`Found ${expiredLines.length} clients among the 208 ACTIVE rows whose ExpiryDate < '2026-08-19':`);
console.table(expiredLines);
