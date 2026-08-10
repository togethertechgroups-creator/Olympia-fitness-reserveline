const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

console.log('--- Resetting Database ---');

try {
  // Use a transaction for atomic reset
  const reset = db.transaction(() => {
    // Delete all rows from clients
    const clientResult = db.prepare('DELETE FROM clients').run();
    console.log(`- Deleted ${clientResult.changes} clients.`);

    // Delete all rows from transactions
    const txResult = db.prepare('DELETE FROM transactions').run();
    console.log(`- Deleted ${txResult.changes} transactions.`);

    // Delete and reset settings
    db.prepare('DELETE FROM settings').run();
    const initialSettings = [
      { key: 'Monthly', value: 1000 },
      { key: 'Quarterly', value: 2500 },
      { key: 'Half-Yearly', value: 4500 },
      { key: 'Annual', value: 8000 },
      { key: 'PT_Certified', value: 1000 },
      { key: 'PT_Pro', value: 1500 },
      { key: 'Diet', value: 500 }
    ];

    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    initialSettings.forEach(s => insertSetting.run(s.key, s.value));
    console.log('- Settings reset to default values.');
  });

  reset();
  console.log('--- Database Reset Successfully ---');
} catch (err) {
  console.error('Error resetting database:', err.message);
} finally {
  db.close();
}
