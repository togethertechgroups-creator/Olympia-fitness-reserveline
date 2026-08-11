const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

console.log('--- Clearing All Data ---');

try {
  db.prepare('DELETE FROM clients').run();
  console.log('✅ Cleared Clients');
  
  db.prepare('DELETE FROM trainers').run();
  console.log('✅ Cleared Trainers');
  
  db.prepare('DELETE FROM transactions').run();
  console.log('✅ Cleared Transactions');

  console.log('--- Cleanup Complete ---');
} catch (error) {
  console.error('❌ Error during cleanup:', error.message);
} finally {
  db.close();
}
