const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

console.log('🚀 PERFORMANCE SEED STARTING: 6,000 CLIENTS');

// 1. Get a trainer to associate clients with
const trainer = db.prepare('SELECT id FROM trainers LIMIT 1').get();
const trainerId = trainer ? trainer.id : null;

if (!trainerId) {
  console.log('❌ No trainers found. Please run regular seed first.');
  process.exit(1);
}

// 2. Clear existing test data to avoid overlap
db.prepare("DELETE FROM clients WHERE name LIKE 'PerfTest%'").run();

const insert = db.prepare(`
  INSERT INTO clients 
  (id, clientId, name, phone, plan, fromDate, expiryDate, amount, ptCategory, ptFromDate, ptToDate, trainerId, status) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((clients) => {
  for (const client of clients) insert.run(...client);
});

const clientsToInsert = [];
const today = new Date('2026-04-04'); // Using system time from metadata

/**
 * Distribution Requested:
 * 100 Expired
 * 200 Warning (5 days)
 * 300 Active (Requested Specifically)
 * 5400 Background Active (To reach 6000)
 */

console.log('Generating 100 Expired clients...');
for (let i = 1; i <= 100; i++) {
  const expiry = new Date(today);
  expiry.setDate(today.getDate() - 10); // 10 days ago
  clientsToInsert.push([
    randomUUID(), `EXP-P${i}`, `PerfTest Expired ${i}`, `999000${i.toString().padStart(4, '0')}`,
    'Monthly', '2026-03-01', expiry.toISOString().split('T')[0], 
    1500, 'None', '2026-03-01', expiry.toISOString().split('T')[0],
    trainerId, 'active'
  ]);
}

console.log('Generating 200 Warning clients...');
for (let i = 1; i <= 200; i++) {
  const expiry = new Date(today);
  expiry.setDate(today.getDate() + 3); // 3 days from now (within 5 day warning)
  clientsToInsert.push([
    randomUUID(), `WRN-P${i}`, `PerfTest Warning ${i}`, `888000${i.toString().padStart(4, '0')}`,
    'Monthly', '2026-03-10', expiry.toISOString().split('T')[0], 
    1500, 'None', '2026-03-10', expiry.toISOString().split('T')[0],
    trainerId, 'active'
  ]);
}

console.log('Generating 5700 Active clients...');
for (let i = 1; i <= 5700; i++) {
  const expiry = new Date(today);
  expiry.setFullYear(today.getFullYear() + 1); // 1 year from now
  clientsToInsert.push([
    randomUUID(), `ACT-P${i}`, `PerfTest Active ${i}`, `777000${i.toString().padStart(4, '0')}`,
    'Annual', '2026-04-01', expiry.toISOString().split('T')[0], 
    15000, 'None', '2026-04-01', expiry.toISOString().split('T')[0],
    trainerId, 'active'
  ]);
}

console.log('Committing to database (using transaction)...');
insertMany(clientsToInsert);

console.log('✅ PERFORMANCE SEED COMPLETE!');
console.log('--- Summary ---');
console.log('Total Clients:', db.prepare('SELECT count(*) as count FROM clients').get().count);
db.close();
