const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

console.log('🗑️ CLEARING PERFORMANCE DATA...');

const result = db.prepare("DELETE FROM clients WHERE name LIKE 'PerfTest%'").run();

console.log(`✅ Cleared ${result.changes} performance test clients.`);
db.close();
