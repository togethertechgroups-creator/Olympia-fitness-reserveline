const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'olympia_fitness.db');
const db = new Database(DB_PATH);

console.log('--- Seeding 100 Active Clients ---');

// 1. Clear existing test clients (to avoid confusion with previous seed)
db.prepare("DELETE FROM clients WHERE name LIKE 'Test Client %'").run();

// 2. Get existing trainers
const trainers = db.prepare('SELECT id, name FROM trainers LIMIT 5').all();
if (trainers.length === 0) {
  console.log('No trainers found! Adding some...');
  const specializations = ['Bodybuilding', 'Yoga', 'Zumba', 'Powerlifting', 'Cardio'];
  for (let i = 1; i <= 5; i++) {
    const id = randomUUID();
    db.prepare('INSERT INTO trainers (id, trainerId, name, specialization, experience, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, `TRN2024${String(i).padStart(3, '0')}`, `Trainer ${i}`, specializations[i-1], '5 Years', 'Active');
    trainers.push({ id, name: `Trainer ${i}` });
  }
}

// 3. Add 100 ACTIVE Clients
const plans = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual'];
const ptCategories = ['PT_Certified', 'PT_Pro']; // Removed 'None'

// Use a future date for "Active" status
const futureExpiry = '2027-01-01';
const futurePTExpiry = '2027-01-01';

for (let i = 1; i <= 100; i++) {
  const id = randomUUID();
  const cId = `ACT2024${String(i).padStart(4, '0')}`;
  const name = `Active Client ${i}`;
  const phone = `9000000${String(i).padStart(3, '0')}`;
  const plan = plans[i % 4];
  
  const fromDate = '2024-03-25';
  const expiryDate = futureExpiry;
  
  const amount = 1500;
  const ptCategory = ptCategories[i % 2]; // Adjusted % 2
  const ptFromDate = '2024-03-25';
  const ptToDate = futurePTExpiry;
  const trainer = trainers[i % trainers.length];

  db.prepare(`
    INSERT INTO clients 
    (id, clientId, name, phone, plan, fromDate, expiryDate, amount, ptCategory, ptFromDate, ptToDate, trainerId, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, cId, name, phone, plan, fromDate, expiryDate, amount, ptCategory, ptFromDate, ptToDate, trainer.id, 'active');
}

console.log('✅ Added 100 Active Clients');
console.log('--- Seeding Complete ---');
db.close();
