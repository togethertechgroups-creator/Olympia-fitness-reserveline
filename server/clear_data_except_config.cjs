const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'beast_fitness.db');

if (!fs.existsSync(dbPath)) {
  console.log('Database file not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

console.log('--- Clearing Operational Data (Keeping PT Packages, Tariff Settings & Login Users) ---');

const tablesToKeep = ['pt_packages', 'settings', 'users', 'sqlite_sequence'];

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  
  db.pragma('foreign_keys = OFF');

  for (const tableRow of tables) {
    const tableName = tableRow.name;
    if (!tablesToKeep.includes(tableName.toLowerCase())) {
      const result = db.prepare(`DELETE FROM "${tableName}"`).run();
      console.log(`✅ Cleared ${result.changes} records from table [${tableName}]`);
    } else {
      console.log(`🔒 Preserved table [${tableName}]`);
    }
  }

  db.pragma('foreign_keys = ON');
  db.exec('VACUUM;');
  console.log('🎉 Cleanup completed successfully!');
} catch (err) {
  console.error('❌ Cleanup failed:', err.message);
} finally {
  db.close();
}
