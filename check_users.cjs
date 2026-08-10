const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'beast_fitness.db');
const db = new Database(dbPath);

const users = db.prepare('SELECT id, username, password, role FROM users').all();
console.log('Users in database:');
console.table(users);
db.close();
