/**
 * Export all data from Turso → generates d1-data.sql for D1 import.
 * Run: node scripts/export-turso-to-d1.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TURSO_URL   = 'https://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

// Tables in FK-safe order
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
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🔌 Connecting to Turso...');

  // Dynamically require @libsql/client (it's in node_modules root)
  let createClient;
  try {
    createClient = require('@libsql/client').createClient;
  } catch (e) {
    // Try the web entry if default fails
    createClient = require('@libsql/client/web').createClient;
  }

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
      const res = await client.execute(`SELECT * FROM "${table}"`);
      const rows = res.rows;
      const cols = res.columns;

      if (rows.length === 0) {
        console.log(`  ⏭  ${table}: empty`);
        lines.push(`-- Table: ${table} (empty)`);
        lines.push('');
        continue;
      }

      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      // Use INSERT OR IGNORE to avoid conflicts with seed data already applied
      for (const row of rows) {
        const values = cols.map(col => escapeValue(row[col]));
        lines.push(
          `INSERT OR REPLACE INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`
        );
      }

      lines.push('');
      console.log(`  ✅ ${table}: ${rows.length} rows`);
      totalRows += rows.length;
    } catch (err) {
      console.warn(`  ⚠️  ${table}: ${err.message} (skipped)`);
      lines.push(`-- Table: ${table} SKIPPED: ${err.message}`);
      lines.push('');
    }
  }

  lines.push('PRAGMA foreign_keys = ON;');

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`\n✨ Exported ${totalRows} total rows → d1-data.sql`);
  console.log('\nNext: wrangler d1 execute olympia-fitness-db --remote --file=./d1-data.sql');

  if (typeof client.close === 'function') client.close();
}

main().catch(err => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
