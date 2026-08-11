const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

const todayStr = new Date().toISOString().split('T')[0];

console.log('--- Trimming Clients to 400 Active Records ---');

try {
  // 1. Identify the first 400 active clients (expiryDate >= today)
  // We keep the ones with the lowest clientId (usually the oldest/original ones)
  const activeClientsToKeep = db.prepare(
    "SELECT id FROM clients WHERE expiryDate >= ? ORDER BY clientId ASC LIMIT 400"
  ).all(todayStr);

  const activeIds = activeClientsToKeep.map(row => row.id);

  console.log(`Found ${activeIds.length} active clients to keep.`);

  if (activeIds.length > 0) {
    db.transaction(() => {
      // Create a temporary table to hold the IDs we want to keep
      db.prepare('CREATE TEMPORARY TABLE IF NOT EXISTS keep_ids (id TEXT PRIMARY KEY)').run();
      
      const insert = db.prepare('INSERT INTO keep_ids (id) VALUES (?)');
      for (const id of activeIds) {
        insert.run(id);
      }
      
      // Delete all clients NOT in the keep list
      const result = db.prepare('DELETE FROM clients WHERE id NOT IN (SELECT id FROM keep_ids)').run();
      console.log(`✅ Deleted ${result.changes} client records.`);
      
      db.prepare('DROP TABLE keep_ids').run();
    })();
  } else {
    console.log('⚠️ No active clients found! Database remains unchanged.');
  }

  // 2. Verify final count
  const finalCount = db.prepare("SELECT COUNT(*) as cnt FROM clients WHERE expiryDate >= ?").get(todayStr).cnt;
  console.log(`Final Active Client Count: ${finalCount}`);

  console.log('--- Cleanup Complete ---');
} catch (error) {
  console.error('❌ Error during trimming:', error.message);
} finally {
  db.close();
}
