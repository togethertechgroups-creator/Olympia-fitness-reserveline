const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('====================================================');
console.log('🧹 LOCAL DUMP DATA CLEANUP UTILITY');
console.log('====================================================');

const dbs = [
  path.join(__dirname, 'beast_fitness.db'),
  path.join(__dirname, 'data', 'olympia_fitness.db')
];

// Operational / dump tables to clear
const operationalTables = [
  'clients',
  'transactions',
  'bills',
  'expenses',
  'attendance',
  'inquiries',
  'follow_ups',
  'staff',
  'client_measurements',
  'pt_assignments',
  'payroll_locks',
  'trainer_payroll_adjustments',
  'trainer_daily_status',
  'supplement_purchases',
  'supplement_sales',
  'pt_assignments_new',
  'pt_class_log',
  'general_package_bookings',
  'pt_advance_bookings',
  'other_service_sales',
  'whatsapp_log'
];

for (const dbPath of dbs) {
  if (!fs.existsSync(dbPath)) {
    console.log(`\n⚠️  DB file not found: ${dbPath}`);
    continue;
  }

  console.log(`\n📂 Cleaning operational data in: ${dbPath}`);
  const db = new Database(dbPath);

  try {
    db.pragma('foreign_keys = OFF');

    const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

    let totalDeleted = 0;
    for (const table of existingTables) {
      if (operationalTables.includes(table.toLowerCase())) {
        const res = db.prepare(`DELETE FROM "${table}"`).run();
        console.log(`  ✅ Cleared ${res.changes} records from table [${table}]`);
        totalDeleted += res.changes;
      } else {
        console.log(`  🔒 Preserved configuration/master table [${table}]`);
      }
    }

    // Reset sqlite_sequence for operational tables if sqlite_sequence exists
    if (existingTables.includes('sqlite_sequence')) {
      for (const table of operationalTables) {
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
      }
      console.log('  🔄 Reset auto-increment sequence counters for operational tables');
    }

    db.pragma('foreign_keys = ON');
    db.exec('VACUUM;');
    console.log(`🎉 Vacuum completed for ${path.basename(dbPath)}. Total records deleted: ${totalDeleted}`);
  } catch (err) {
    console.error(`❌ Error cleaning ${dbPath}:`, err.message);
  } finally {
    db.close();
  }
}

// Clean uploaded client images from server/uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (fs.existsSync(uploadsDir)) {
  console.log(`\n🖼️  Cleaning client uploads in: ${uploadsDir}`);
  const files = fs.readdirSync(uploadsDir);
  let filesRemoved = 0;
  for (const file of files) {
    if (file.startsWith('client_')) {
      const filePath = path.join(uploadsDir, file);
      fs.unlinkSync(filePath);
      console.log(`  🗑️ Removed upload file: ${file}`);
      filesRemoved++;
    }
  }
  console.log(`✅ Removed ${filesRemoved} client upload files.`);
}

console.log('\n====================================================');
console.log('✨ LOCAL DUMP DATA REMOVAL COMPLETED SUCCESSFULLY!');
console.log('====================================================');
