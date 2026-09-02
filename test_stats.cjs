const https = require('https');

async function get(url) {
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

async function main() {
  const d = await get('https://admin.olympiafitnessmadurai.com/api/dashboard/stats?startDate=2026-09-01&endDate=2026-09-30');
  const s = await get('https://admin.olympiafitnessmadurai.com/api/stats');
  console.log('rangeRevenue:', d.rangeRevenue);
  console.log('rangeExpenses:', d.rangeExpenses);
  console.log('monthlyCollection:', s.monthlyCollection);
  console.log('monthlyExpenses:', s.monthlyExpenses);
}

main().catch(console.error);
