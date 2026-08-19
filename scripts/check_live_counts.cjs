const { createClient } = require('@libsql/client');

const TURSO_URL   = 'https://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  
  const resAll = await client.execute('SELECT COUNT(*) as total FROM clients');
  console.log('Total clients in Live DB:', resAll.rows[0].total);

  const resStatus = await client.execute('SELECT status, COUNT(*) as cnt FROM clients GROUP BY status');
  console.log('\nStatus breakdown in Live DB:');
  console.table(resStatus.rows);

  const resDates = await client.execute(`
    SELECT 
      SUM(CASE WHEN LOWER(status) NOT IN ('inactive', 'expired') AND (expiryDate IS NULL OR expiryDate >= '2026-08-19' OR expiryDate >= '19/08/2026') THEN 1 ELSE 0 END) as active_unexpired,
      SUM(CASE WHEN LOWER(status) NOT IN ('inactive', 'expired') AND (expiryDate < '2026-08-19' AND expiryDate NOT LIKE '%2026%') THEN 1 ELSE 0 END) as active_but_expired_date,
      SUM(CASE WHEN LOWER(status) IN ('inactive', 'expired') THEN 1 ELSE 0 END) as explicit_inactive
    FROM clients
  `);
  console.log('\nDetailed Breakdown:');
  console.table(resDates.rows);

  if (typeof client.close === 'function') client.close();
}

main().catch(err => console.error(err));
