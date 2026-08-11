require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');
const cron = require('node-cron');
const fetch = require('node-fetch');

// ─── WhatsApp Cloud API Config ────────────────────────────────────────────────
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const COUNTRY_CODE = process.env.COUNTRY_CODE || '91';

// Helper: normalize phone number to international format (no + or spaces)
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `${COUNTRY_CODE}${digits}`;
  if (digits.startsWith('0')) return `${COUNTRY_CODE}${digits.slice(1)}`;
  return digits;
};

// Helper: send a WhatsApp text message via Cloud API
const sendWhatsAppMessage = async (toPhone, message) => {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    throw new Error('WhatsApp Phone Number ID not configured. Add WHATSAPP_PHONE_NUMBER_ID to server/.env');
  }
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: normalizePhone(toPhone),
    type: 'text',
    text: { body: message }
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `WhatsApp API error ${resp.status}`);
  }
  return data;
};

// Message templates
const buildExpiringSoonMsg = (client) => {
  const expiry = new Date(client.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `Hi ${client.name}! 👋\n\nThis is a friendly reminder from *KH3 WELLNESS* 🏋️‍♂️\n\nYour *${client.plan}* membership is expiring on *${expiry}*.\n\nRenew now to keep crushing your goals! 💪\n\nContact us at the front desk or call to renew. See you in the gym! 🔥`;
};

const buildExpiredMsg = (client) => {
  const expiry = new Date(client.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `Hi ${client.name}! 😊\n\nYour *${client.plan}* membership at *KH3 WELLNESS* has expired on *${expiry}*.\n\nWe miss you! 💙 Come back and continue your fitness journey.\n\nRenew today — visit us at the front desk or give us a call! 🏋️‍♂️🔥`;
};

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── SQLite Setup ───────────────────────────────────────────────────────────
let DB_PATH;
const fs = require('fs');

if (process.env.DB_PATH) {
  // Set explicitly by main.cjs (packaged mode)
  DB_PATH = process.env.DB_PATH;
} else {
  try {
    // Try to get from Electron app
    const { app: electronApp } = require('electron');
    if (electronApp && electronApp.isPackaged) {
      DB_PATH = path.join(electronApp.getPath('userData'), 'beast_fitness.db');
    } else {
      DB_PATH = path.join(__dirname, 'beast_fitness.db');
    }
  } catch (e) {
    // Not running inside Electron (e.g., standalone node)
    DB_PATH = path.join(__dirname, 'beast_fitness.db');
  }
}

// Ensure the directory for the DB exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema Initialization ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id          TEXT PRIMARY KEY,
    clientId    TEXT,
    name        TEXT NOT NULL,
    phone       TEXT,
    plan        TEXT,
    fromDate    TEXT,
    expiryDate  TEXT,
    amount      REAL DEFAULT 0,
    personalTraining INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'active',
    dateAdded   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id        TEXT PRIMARY KEY,
    name      TEXT,
    method    TEXT DEFAULT 'CASH',
    date      TEXT,
    amount    REAL DEFAULT 0,
    status    TEXT DEFAULT 'CAPTURED',
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value REAL
  );

  CREATE TABLE IF NOT EXISTS trainers (
    id            TEXT PRIMARY KEY,
    trainerId     TEXT UNIQUE,
    name          TEXT NOT NULL,
    specialization TEXT,
    experience    TEXT,
    status        TEXT DEFAULT 'Active',
    dateAdded     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    username  TEXT NOT NULL,
    password  TEXT NOT NULL,
    role      TEXT NOT NULL,
    UNIQUE(username, role)
  );

  CREATE TABLE IF NOT EXISTS whatsapp_log (
    id         TEXT PRIMARY KEY,
    clientId   TEXT,
    clientName TEXT,
    phone      TEXT,
    type       TEXT,
    sentAt     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'Present',
    timestamp TEXT DEFAULT (datetime('now')),
    UNIQUE(clientId, date)
  );
`);

// ─── Initialize Settings if empty ───────────────────────────────────────────
const initialSettings = [
  { key: 'Monthly', value: 1000 },
  { key: 'Quarterly', value: 2500 },
  { key: 'Half-Yearly', value: 4500 },
  { key: 'Annual', value: 8000 },
  { key: 'PT_Certified', value: 1000 },
  { key: 'PT_Pro', value: 1500 },
  { key: 'Diet', value: 500 }
];

initialSettings.forEach(setting => {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(setting.key, setting.value);
});

// ─── Initialize Users if empty ──────────────────────────────────────────────
const initialUsers = [
  { id: randomUUID(), username: 'olympia', password: 'master123', role: 'superadmin' },
  { id: randomUUID(), username: 'olympia', password: 'admin123', role: 'admin' }
];

initialUsers.forEach(user => {
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get(user.role);
  if (!existing) {
    db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(
      user.id, user.username, user.password, user.role
    );
  }
});

// ─── Migration: Add new columns if they don't exist ─────────────────────────
try {
  const columns = [
    { name: 'gender', type: 'TEXT' },
    { name: 'ptCategory', type: 'TEXT' },
    { name: 'ptFromDate', type: 'TEXT' },
    { name: 'ptToDate', type: 'TEXT' },
    { name: 'ptPackage', type: 'TEXT' },
    { name: 'programType', type: 'TEXT' },
    { name: 'diet', type: 'INTEGER DEFAULT 0' },
    { name: 'trainerId', type: 'TEXT' },
    { name: 'admissionDate', type: 'TEXT' },
    { name: 'profileImage', type: 'TEXT' }
  ];

  columns.forEach(col => {
    try {
      db.prepare(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added column ${col.name} to clients table`);
    } catch (e) {
      // Column might already exist
    }
  });
} catch (err) {
  console.error('Migration error:', err.message);
}

console.log('✅ Connected to SQLite →', DB_PATH);

// ─── Helper ──────────────────────────────────────────────────────────────────
const toDateLabel = (d = new Date()) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── ATTENDANCE Routes ───────────────────────────────────────────────────────

app.get('/api/attendance', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    const records = db.prepare('SELECT * FROM attendance WHERE date = ?').all(date);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', (req, res) => {
  try {
    const { clientId, date, status } = req.body;
    if (!clientId || !date || !status) return res.status(400).json({ error: 'Missing parameters' });

    if (status === 'Absent') {
      db.prepare('DELETE FROM attendance WHERE clientId = ? AND date = ?').run(clientId, date);
    } else {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO attendance (id, clientId, date, status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(clientId, date) DO UPDATE SET status = excluded.status
      `).run(id, clientId, date, status);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLIENT Routes ───────────────────────────────────────────────────────────

// GET all clients
app.get('/api/clients', (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT c.*, t.name as trainerName 
      FROM clients c 
      LEFT JOIN trainers t ON c.trainerId = t.id 
      ORDER BY c.dateAdded DESC
    `).all();
    res.json(clients.map(c => ({ ...c, personalTraining: !!c.personalTraining })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET next client ID for auto-generation
app.get('/api/clients/check-id/:clientId', (req, res) => {
  try {
    const { clientId } = req.params;
    const existing = db.prepare('SELECT id FROM clients WHERE clientId = ?').get(clientId);
    res.json({ exists: !!existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/next-id', (req, res) => {
  try {
    const row = db.prepare("SELECT clientId FROM clients WHERE clientId LIKE 'GYM2026%' ORDER BY clientId DESC LIMIT 1").get();
    let nextId = 'GYM20260001';

    if (row && row.clientId) {
      const match = row.clientId.match(/GYM2026(\d{4})/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        nextId = `GYM2026${nextNum.toString().padStart(4, '0')}`;
      }
    }

    res.json({ nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single client
app.get('/api/clients/:id', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ ...client, personalTraining: !!client.personalTraining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create client
app.post('/api/clients', (req, res) => {
  try {
    const {
      clientId, name, phone, plan, fromDate, expiryDate,
      amount = 0, personalTraining = false, status = 'active', paymentMethod = 'CASH',
      gender = '', ptCategory = '', ptFromDate = '', ptToDate = '', ptPackage = '', programType = '', diet = 0,
      trainerId = null, admissionDate = '', profileImage = null
    } = req.body;

    // Check for unique clientId
    if (clientId) {
      const existing = db.prepare('SELECT id FROM clients WHERE clientId = ?').get(clientId);
      if (existing) {
        return res.status(400).json({ error: 'This Client ID is already in use.' });
      }
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO clients (
        id, clientId, name, phone, plan, fromDate, expiryDate, amount, 
        personalTraining, status, gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet, trainerId, admissionDate, profileImage
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, clientId || '', name, phone || '', plan || '', fromDate || '', expiryDate || '',
      amount, personalTraining ? 1 : 0, status,
      gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet ? 1 : 0,
      trainerId, admissionDate, profileImage
    );

    // Create a transaction record
    const txId = randomUUID();
    db.prepare(`
      INSERT INTO transactions (id, name, method, amount, date)
      VALUES (?, ?, ?, ?, ?)
    `).run(txId, name, paymentMethod, amount, toDateLabel());

    const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.status(201).json({ ...newClient, personalTraining: !!newClient.personalTraining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update client
app.put('/api/clients/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found' });

    const {
      clientId, name, phone, plan, fromDate, expiryDate,
      amount, personalTraining, status,
      gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet,
      trainerId, admissionDate, profileImage
    } = req.body;

    // Check for unique clientId
    if (clientId && clientId !== existing.clientId) {
      const conflict = db.prepare('SELECT id FROM clients WHERE clientId = ? AND id != ?').get(clientId, req.params.id);
      if (conflict) {
        return res.status(400).json({ error: 'This Client ID is already in use.' });
      }
    }

    db.prepare(`
      UPDATE clients SET
        clientId = COALESCE(?, clientId),
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        plan = COALESCE(?, plan),
        fromDate = COALESCE(?, fromDate),
        expiryDate = COALESCE(?, expiryDate),
        amount = COALESCE(?, amount),
        personalTraining = COALESCE(?, personalTraining),
        status = COALESCE(?, status),
        gender = COALESCE(?, gender),
        ptCategory = COALESCE(?, ptCategory),
        ptFromDate = COALESCE(?, ptFromDate),
        ptToDate = COALESCE(?, ptToDate),
        ptPackage = COALESCE(?, ptPackage),
        programType = COALESCE(?, programType),
        diet = COALESCE(?, diet),
        trainerId = COALESCE(?, trainerId),
        admissionDate = COALESCE(?, admissionDate),
        profileImage = COALESCE(?, profileImage)
      WHERE id = ?
    `).run(
      clientId ?? null, name ?? null, phone ?? null, plan ?? null,
      fromDate ?? null, expiryDate ?? null, amount ?? null,
      personalTraining !== undefined ? (personalTraining ? 1 : 0) : null,
      status ?? null,
      gender ?? null, ptCategory ?? null, ptFromDate ?? null, ptToDate ?? null,
      ptPackage ?? null, programType ?? null, diet !== undefined ? (diet ? 1 : 0) : null,
      trainerId ?? null, admissionDate ?? null, profileImage ?? null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json({ ...updated, personalTraining: !!updated.personalTraining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE client
app.delete('/api/clients/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TRAINER Routes ──────────────────────────────────────────────────────────

// GET all trainers
app.get('/api/trainers', (req, res) => {
  try {
    const trainers = db.prepare(`
      SELECT t.*, COUNT(c.id) as clientCount 
      FROM trainers t 
      LEFT JOIN clients c ON t.id = c.trainerId 
      GROUP BY t.id 
      ORDER BY t.dateAdded DESC
    `).all();
    res.json(trainers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET next trainer ID
app.get('/api/trainers/next-id', (req, res) => {
  try {
    const row = db.prepare("SELECT trainerId FROM trainers ORDER BY trainerId DESC LIMIT 1").get();
    let nextId = 'TRN001';

    if (row && row.trainerId) {
      const match = row.trainerId.match(/TRN(\d{3})/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        nextId = `TRN${nextNum.toString().padStart(3, '0')}`;
      }
    }

    res.json({ nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create trainer
app.post('/api/trainers', (req, res) => {
  try {
    const { trainerId, name, specialization, experience, status = 'Active' } = req.body;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO trainers (id, trainerId, name, specialization, experience, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, trainerId, name, specialization, experience, status);

    const newTrainer = db.prepare('SELECT * FROM trainers WHERE id = ?').get(id);
    res.status(201).json(newTrainer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update trainer
app.put('/api/trainers/:id', (req, res) => {
  try {
    const { trainerId, name, specialization, experience, status } = req.body;
    db.prepare(`
      UPDATE trainers SET
        trainerId = ?, name = ?, specialization = ?, experience = ?, status = ?
      WHERE id = ?
    `).run(trainerId, name, specialization, experience, status, req.params.id);

    const updated = db.prepare('SELECT * FROM trainers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE trainer
app.delete('/api/trainers/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM trainers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Trainer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST restore all data
app.post('/api/restore', (req, res) => {
  try {
    const { clients = [], transactions = [], trainers = [] } = req.body;

    // Validate inputs
    if (!Array.isArray(clients) || !Array.isArray(transactions) || !Array.isArray(trainers)) {
      return res.status(400).json({ error: 'Invalid payload format.' });
    }

    const restoreTx = db.transaction((clientsData, txnsData, trainersData) => {
      db.prepare('DELETE FROM clients').run();
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM trainers').run();

      const insertTrainer = db.prepare(`
        INSERT INTO trainers (id, trainerId, name, specialization, experience, status, dateAdded)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of trainersData) {
        insertTrainer.run(
          t.id || randomUUID(), t.trainerId || '', t.name || '',
          t.specialization || '', t.experience || '', t.status || 'Active',
          t.dateAdded || null
        );
      }

      const insertClient = db.prepare(`
        INSERT INTO clients (
          id, clientId, name, phone, plan, fromDate, expiryDate, amount, 
          personalTraining, status, gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet, dateAdded, trainerId, admissionDate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)
      `);

      const insertTxn = db.prepare(`
        INSERT INTO transactions (id, name, method, date, amount, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
      `);

      for (const c of clientsData) {
        insertClient.run(
          c.id || randomUUID(), c.clientId || '', c.name || 'Unknown', c.phone || '', c.plan || '',
          c.fromDate || '', c.expiryDate || '', c.amount || 0,
          c.personalTraining ? 1 : 0, c.status || 'active',
          c.gender || '', c.ptCategory || '', c.ptFromDate || '', c.ptToDate || '',
          c.ptPackage || '', c.programType || '', c.diet ? 1 : 0,
          c.dateAdded || null,
          c.trainerId || null,
          c.admissionDate || null
        );
      }

      for (const t of txnsData) {
        insertTxn.run(
          t.id || randomUUID(), t.name || '', t.method || 'CASH', t.date || '',
          t.amount || 0, t.status || 'CAPTURED', t.timestamp || null
        );
      }
    });

    restoreTx(clients, transactions, trainers);
    res.json({ message: 'Database restored successfully', counts: { clients: clients.length, transactions: transactions.length, trainers: trainers.length } });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TRANSACTION Routes ───────────────────────────────────────────────────────

// GET all transactions
app.get('/api/transactions', (req, res) => {
  try {
    const txns = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC').all();
    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS Route ──────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toLocaleDateString('en-GB', { month: 'short' });

    const allTxns = db.prepare('SELECT * FROM transactions').all();
    const totalRevenueVal = allTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const monthlyCollectionVal = allTxns
      .filter(t => t.date && t.date.includes(targetMonth))
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const activeCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE expiryDate >= ?"
    ).get(todayStr).cnt;

    const expiredCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE expiryDate < ?"
    ).get(todayStr).cnt;

    const expiredPTCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE ptToDate < ? AND ptCategory != 'None'"
    ).get(todayStr).cnt;

    // --- New Metrics ---
    const newClientsMonthCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE admissionDate LIKE ?"
    ).get(`%${targetMonth}%`).cnt;

    const monthlyTxnsCount = allTxns.filter(t => t.date && t.date.includes(targetMonth)).length;
    const renewalsMonthCount = Math.max(0, monthlyTxnsCount - newClientsMonthCount);

    const recentTxns = allTxns.slice(0, 5);

    res.json({
      totalRevenue: `₹${totalRevenueVal.toLocaleString()}`,
      monthlyCollection: `₹${monthlyCollectionVal.toLocaleString()}`,
      activeClients: activeCount,
      expiredPlans: expiredCount,
      expiredPTPlans: expiredPTCount,
      newClientsCount: newClientsMonthCount,
      renewalsCount: renewalsMonthCount,
      transactions: recentTxns
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REVENUE Route ────────────────────────────────────────────────────────────
app.get('/api/revenue', (req, res) => {
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const allTxns = db.prepare('SELECT * FROM transactions').all();

    const revenueByMonth = months.map(m => ({ month: m, revenue: 0 }));
    allTxns.forEach(txn => {
      if (!txn.date) return;
      const parts = txn.date.split(' ');
      const monthName = parts[1];
      const monthObj = revenueByMonth.find(r => r.month === monthName);
      if (monthObj) monthObj.revenue += txn.amount || 0;
    });

    const currentMonthShort = new Date().toLocaleDateString('en-GB', { month: 'short' });
    res.json(revenueByMonth.filter(r => r.revenue > 0 || r.month === currentMonthShort));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SETTINGS Routes ─────────────────────────────────────────────────────────

// GET all settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsObj = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    res.json(settingsObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update settings
app.put('/api/settings', (req, res) => {
  try {
    const settings = req.body; // Expecting { key: value, ... }
    const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    // Use a transaction for atomic update
    const transaction = db.transaction((data) => {
      db.prepare('DELETE FROM settings').run();
      for (const [key, value] of Object.entries(data)) {
        update.run(key, value);
      }
    });

    transaction(settings);
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTH / USER Routes ──────────────────────────────────────────────────────

// POST login check
app.post('/api/auth/login', (req, res) => {
  try {
    const { password, role } = req.body;
    // Find matching user with specific role and password
    const user = db.prepare('SELECT id, role FROM users WHERE role = ? AND password = ?').get(role, password);

    if (user) {
      res.json({ success: true, role: user.role });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all user credentials (for master management)
app.get('/api/auth/credentials', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, password, role FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update credentials
app.put('/api/auth/credentials', (req, res) => {
  try {
    const { credentials } = req.body; // Array of { role, username, password }

    const update = db.prepare('UPDATE users SET username = ?, password = ? WHERE role = ?');

    const transaction = db.transaction((data) => {
      for (const cred of data) {
        update.run(cred.username, cred.password, cred.role);
      }
    });

    transaction(credentials);
    res.json({ message: 'Credentials updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PERFORMANCE Route ────────────────────────────────────────────────────────
app.get('/api/performance', (req, res) => {
  try {
    const plans = ["Monthly", "Quarterly", "Half-Yearly", "Annual"];
    const results = plans.map(p => {
      const row = db.prepare(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as revenue FROM clients WHERE plan = ?"
      ).get(p);
      return {
        plan: p,
        clients: row.cnt,
        revenue: row.revenue,
        status: 'Active'
      };
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WHATSAPP Reminder Routes ────────────────────────────────────────────────

// Helper: get YYYY-MM-DD string offset by N days from today in local time
const getDateOffsetISO = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // local YYYY-MM-DD format
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// GET /api/whatsapp/reminders
app.get('/api/whatsapp/reminders', (req, res) => {
  try {
    const todayISO = getDateOffsetISO(0);
    const in5DaysISO = getDateOffsetISO(5);

    // Clients expiring within 1-5 days
    const expiringSoon = db.prepare(`
      SELECT id, clientId, name, phone, plan, expiryDate
      FROM clients
      WHERE date(expiryDate) BETWEEN date(?) AND date(?)
        AND phone IS NOT NULL AND phone != ''
      ORDER BY date(expiryDate) ASC
    `).all(getDateOffsetISO(1), in5DaysISO);

    // Clients already expired today or before
    const expiredAll = db.prepare(`
      SELECT id, clientId, name, phone, plan, expiryDate
      FROM clients
      WHERE date(expiryDate) <= date(?)
        AND phone IS NOT NULL AND phone != ''
      ORDER BY date(expiryDate) DESC
    `).all(todayISO);

    res.json({
      expiringSoon,
      expiredToday: expiredAll,
      counts: { expiringSoon: expiringSoon.length, expiredToday: expiredAll.length },
      configured: !!WA_PHONE_ID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send — Send a message to a single client
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { clientId, clientName, phone, type } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const client = { name: clientName, phone };
    // Fetch expiry from DB for template
    const dbClient = clientId ? db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : null;
    if (dbClient) {
      client.plan = dbClient.plan;
      client.expiryDate = dbClient.expiryDate;
    }

    const message = type === 'expiring_soon'
      ? buildExpiringSoonMsg({ ...client, plan: client.plan || 'Membership', expiryDate: client.expiryDate || getDateOffsetISO(5) })
      : buildExpiredMsg({ ...client, plan: client.plan || 'Membership', expiryDate: client.expiryDate || getDateOffsetISO(0) });

    await sendWhatsAppMessage(phone, message);

    // Log to DB
    db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), clientId || '', clientName, phone, type);

    res.json({ success: true, message: 'WhatsApp message sent!' });
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send-bulk — Auto-send to all qualifying clients
app.post('/api/whatsapp/send-bulk', async (req, res) => {
  try {
    const { type } = req.body; // 'expiring_soon' | 'expired'
    const todayISO = getDateOffsetISO(0);
    const in5DaysISO = getDateOffsetISO(5);

    let clients;
    if (type === 'expiring_soon') {
      clients = db.prepare(`
        SELECT id, clientId, name, phone, plan, expiryDate FROM clients
        WHERE date(expiryDate) BETWEEN date(?) AND date(?)
          AND phone IS NOT NULL AND phone != ''
      `).all(getDateOffsetISO(1), in5DaysISO);
    } else {
      clients = db.prepare(`
        SELECT id, clientId, name, phone, plan, expiryDate FROM clients
        WHERE date(expiryDate) <= date(?)
          AND phone IS NOT NULL AND phone != ''
      `).all(todayISO);
    }

    const results = [];
    for (const client of clients) {
      try {
        const message = type === 'expiring_soon'
          ? buildExpiringSoonMsg(client)
          : buildExpiredMsg(client);
        await sendWhatsAppMessage(client.phone, message);
        db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
        ).run(randomUUID(), client.id, client.name, client.phone, type);
        results.push({ name: client.name, phone: client.phone, status: 'sent' });
        // Small delay between messages to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        results.push({ name: client.name, phone: client.phone, status: 'failed', error: err.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    res.json({ success: true, sent, failed, results });
  } catch (err) {
    console.error('Bulk send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/log — Send history
app.get('/api/whatsapp/log', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM whatsapp_log ORDER BY sentAt DESC LIMIT 200').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Daily Cron: 9:00 AM — Auto-send WhatsApp reminders ──────────────────────
cron.schedule('0 9 * * *', async () => {
  if (!WA_PHONE_ID || !WA_TOKEN) {
    console.log('⚠️ [WhatsApp Cron] Skipped — WHATSAPP_PHONE_NUMBER_ID not set in .env');
    return;
  }

  const todayISO = getDateOffsetISO(0);
  const in5DaysISO = getDateOffsetISO(5);
  console.log(`📲 [WhatsApp Cron] Running at ${new Date().toLocaleString('en-IN')}`);

  // Send expiring-soon reminders
  const soonClients = db.prepare(`
    SELECT id, clientId, name, phone, plan, expiryDate FROM clients
    WHERE date(expiryDate) = date(?) AND phone IS NOT NULL AND phone != ''
  `).all(in5DaysISO);

  for (const client of soonClients) {
    try {
      await sendWhatsAppMessage(client.phone, buildExpiringSoonMsg(client));
      db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
      ).run(randomUUID(), client.id, client.name, client.phone, 'expiring_soon');
      console.log(`   ✅ Reminder sent → ${client.name} (expires in 5 days)`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`   ❌ Failed → ${client.name}: ${err.message}`);
    }
  }

  // Send expired-today notifications
  const expiredClients = db.prepare(`
    SELECT id, clientId, name, phone, plan, expiryDate FROM clients
    WHERE date(expiryDate) = date(?) AND phone IS NOT NULL AND phone != ''
  `).all(todayISO);

  for (const client of expiredClients) {
    try {
      await sendWhatsAppMessage(client.phone, buildExpiredMsg(client));
      db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
      ).run(randomUUID(), client.id, client.name, client.phone, 'expired');
      console.log(`   ✅ Expiry notice sent → ${client.name}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`   ❌ Failed → ${client.name}: ${err.message}`);
    }
  }

  console.log(`📲 [WhatsApp Cron] Done. Sent to ${soonClients.length + expiredClients.length} clients.`);
}, { timezone: 'Asia/Kolkata' });

// ─── Serve React App ────────────────────────────────────────────────────────
// In packaged mode: DIST_PATH is set by main.cjs (points inside app.asar)
// In dev mode: dist is ../dist relative to server/
const distPath = process.env.DIST_PATH || path.join(__dirname, '../dist');

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️ Port ${PORT} is already in use. Assuming backend is already running.`);
  } else {
    console.error('❌ Server startup error:', err);
  }
});
