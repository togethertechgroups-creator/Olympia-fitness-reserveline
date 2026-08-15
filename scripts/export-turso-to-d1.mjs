/**
 * Export all data from Turso → generates d1-data.sql for D1 import.
 * Run: node scripts/export-turso-to-d1.mjs
 */

import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TURSO_URL  = 'https://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

// Tables to migrate in dependency order (FK children after parents)
const TABLES = [
  'settings', 'gst_settings',
  'users',
  'trainers', 'staff',
  'clients',
  'bills', 'transactions',
  'attendance', 'client_measurements',
  'expenses',
  'whatsapp_log',
  'inquiries', 'follow_ups',
  'supplements', 'supplement_purchases', 'supplement_sales',
  'other_service_tariffs', 'other_service_sales',
  'pt_packages',
  'pt_assignments', 'pt_advance_bookings',
  'general_package_bookings',
  'pt_class_log',
  'payroll_locks', 'trainer_payroll_adjustments', 'trainer_daily_status'
];

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  // Escape single quotes in strings
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🔌 Connecting to Turso...');
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const outputPath = path.join(__dirname, '..', 'd1-data.sql');
  const lines = [
    '-- D1 Data Migration from Turso',
    `-- Generated: ${new Date().toISOString()}`,
    'PRAGMA foreign_keys = OFF;',
    ''
  ];

  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const res = await client.execute(`SELECT * FROM ${table}`);
      const rows = res.rows;

      if (rows.length === 0) {
        console.log(`  ⏭  ${table}: empty`);
        lines.push(`-- Table: ${table} (empty)`);
        continue;
      }

      const cols = res.columns;
      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      lines.push(`DELETE FROM ${table};`);

      for (const row of rows) {
        const values = cols.map(col => escapeValue(row[col]));
        lines.push(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${values.join(', ')});`
        );
      }

      lines.push('');
      console.log(`  ✅ ${table}: ${rows.length} rows`);
      totalRows += rows.length;
    } catch (err) {
      console.warn(`  ⚠️  ${table}: ${err.message} (skipped)`);
      lines.push(`-- Table: ${table} SKIPPED: ${err.message}`);
    }
  }

  lines.push('PRAGMA foreign_keys = ON;');

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`\n✨ Exported ${totalRows} total rows → d1-data.sql`);
  console.log('\nNext step:');
  console.log('  $env:CLOUDFLARE_API_TOKEN="..."; wrangler d1 execute olympia-fitness-db --file=./d1-data.sql');
  
  client.close?.();
}

main().catch(err => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
