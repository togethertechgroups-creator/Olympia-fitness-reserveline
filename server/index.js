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

const buildPaymentReminderMsg = (client) => {
  return `Hi ${client.name}! 👋\n\nThis is a friendly reminder from *KH3 WELLNESS* 🏋️‍♂️\n\nYou have a pending due amount of *₹${client.dueAmount}* for your *${client.plan}* membership.\n\nPlease clear the pending amount at your earliest convenience to continue enjoying our services. 💪\n\nContact us at the front desk or call to clear the dues. See you in the gym! 🔥`;
};

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Vercel serverless URL prefix normalization middleware
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  next();
});

// ─── SQLite Setup ───────────────────────────────────────────────────────────
let DB_PATH;
const fs = require('fs');

if (process.env.VERCEL) {
  const tmpDbPath = path.join('/tmp', 'beast_fitness.db');
  if (!fs.existsSync(tmpDbPath)) {
    const srcDbPath = path.join(__dirname, 'beast_fitness.db');
    if (fs.existsSync(srcDbPath)) {
      try { fs.copyFileSync(srcDbPath, tmpDbPath); } catch (e) {}
    }
  }
  DB_PATH = tmpDbPath;
} else if (process.env.DB_PATH) {
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

// Enable WAL mode for better performance (if not serverless Vercel)
if (!process.env.VERCEL) {
  try { db.pragma('journal_mode = WAL'); } catch (e) {}
}
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
    gstin       TEXT,
    dateAdded   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id        TEXT PRIMARY KEY,
    clientId  TEXT,
    billId    TEXT,
    name      TEXT,
    method    TEXT DEFAULT 'CASH',
    date      TEXT,
    amount    REAL DEFAULT 0,
    status    TEXT DEFAULT 'CAPTURED',
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    billNo TEXT UNIQUE,
    clientId TEXT,
    clientName TEXT,
    invoiceDate TEXT,
    joinDate TEXT,
    expiryDate TEXT,
    planAmount REAL DEFAULT 0,
    paidAmount REAL DEFAULT 0,
    dueAmount REAL DEFAULT 0,
    paymentStatus TEXT DEFAULT 'Due',
    dueNumber INTEGER DEFAULT 0,
    totalPlanAmount REAL DEFAULT 0,
    remainingBalance REAL DEFAULT 0,
    planName TEXT,
    client_gstin_snapshot TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value REAL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT,
    name TEXT,
    category TEXT,
    amount REAL DEFAULT 0,
    paymentMode TEXT DEFAULT 'CASH',
    notes TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS staff (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    fathersName   TEXT,
    mothersName   TEXT,
    spouseName    TEXT,
    dob           TEXT,
    gender        TEXT,
    maritalStatus TEXT,
    nationality   TEXT,
    religion      TEXT,
    community     TEXT,
    languageRead  TEXT,
    languageWrite TEXT,
    languageSpeak TEXT,
    education     TEXT,
    itKnowledge   TEXT,
    homeContact1  TEXT,
    homeContact2  TEXT,
    contactNumber TEXT,
    date          TEXT,
    place         TEXT,
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

  CREATE TABLE IF NOT EXISTS inquiries (
    id            TEXT PRIMARY KEY,
    InquiryId     TEXT UNIQUE,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    age           INTEGER,
    gender        TEXT,
    goal          TEXT,
    plan          TEXT,
    trainerRequired TEXT DEFAULT 'No',
    InquiryDate   TEXT DEFAULT (date('now')),
    status        TEXT DEFAULT 'New',
    nextFollowUp  TEXT,
    timestamp     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id            TEXT PRIMARY KEY,
    InquiryId     TEXT NOT NULL,
    date          TEXT DEFAULT (date('now')),
    notes         TEXT,
    clientResponse TEXT,
    nextDate      TEXT,
    status        TEXT,
    timestamp     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (InquiryId) REFERENCES inquiries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS client_measurements (
    id                 TEXT PRIMARY KEY,
    clientId           TEXT NOT NULL,
    date               TEXT NOT NULL,
    height             REAL,
    weight             REAL,
    bmi                TEXT,
    lbm                REAL,
    fat                REAL,
    chest_inspiration  REAL,
    chest_expiration   REAL,
    abs                REAL,
    waist              REAL,
    hip                REAL,
    thigh              REAL,
    calf               REAL,
    arm                REAL,
    forearm            REAL,
    hip_waist_ratio    REAL,
    timestamp          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS supplements (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    name                   TEXT NOT NULL,
    brand                  TEXT,
    category               TEXT,
    unit                   TEXT,
    current_stock          INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold    INTEGER NOT NULL DEFAULT 5,
    default_purchase_price REAL,
    default_sale_price     REAL,
    active                 INTEGER DEFAULT 1,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS supplement_purchases (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    supplement_id           INTEGER NOT NULL REFERENCES supplements(id),
    vendor_name             TEXT NOT NULL,
    quantity                INTEGER NOT NULL CHECK(quantity > 0),
    purchase_price_per_unit REAL NOT NULL CHECK(purchase_price_per_unit > 0),
    total_cost              REAL NOT NULL,
    purchase_date           DATE NOT NULL,
    invoice_ref             TEXT,
    notes                   TEXT,
    created_by              TEXT REFERENCES users(id),
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS supplement_sales (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    supplement_id       INTEGER NOT NULL REFERENCES supplements(id),
    client_id           TEXT REFERENCES clients(id),
    walkin_name         TEXT,
    walkin_phone        TEXT,
    quantity            INTEGER NOT NULL CHECK(quantity > 0),
    sale_price_per_unit REAL NOT NULL CHECK(sale_price_per_unit > 0),
    total_amount        REAL NOT NULL,
    cost_price_snapshot REAL NOT NULL,
    payment_mode        TEXT CHECK(payment_mode IN ('Cash','UPI','Card','Other')) NOT NULL,
    sale_date           DATE NOT NULL,
    created_by          TEXT REFERENCES users(id),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (client_id IS NOT NULL AND (walkin_name IS NULL OR walkin_name = '')) OR
      ((client_id IS NULL OR client_id = '') AND walkin_name IS NOT NULL AND walkin_name != '')
    )
  );

  CREATE TABLE IF NOT EXISTS other_service_tariffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    duration_days INTEGER NOT NULL,
    is_hidden INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS other_service_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT REFERENCES clients(id),
    service_id INTEGER REFERENCES other_service_tariffs(id),
    price_snapshot REAL NOT NULL,
    sale_date DATE NOT NULL,
    invoice_id TEXT REFERENCES bills(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gst_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    business_legal_name TEXT DEFAULT 'OLYMPIA FITNESS A/C UNISEX',
    business_gstin TEXT DEFAULT '332323402248ED',
    business_address TEXT DEFAULT 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
    gst_rate_percent REAL DEFAULT 4.8
  );
`);

try {
  db.prepare("INSERT OR IGNORE INTO gst_settings (id, business_legal_name, business_gstin, business_address, gst_rate_percent) VALUES (1, 'OLYMPIA FITNESS A/C UNISEX', '332323402248ED', 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014', 4.8)").run();
} catch (e) { }

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

// ─── Initialize Default Other Services Tariffs if empty ────────────────────
try {
  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM other_service_tariffs').get().count;
  if (serviceCount === 0) {
    const defaultOtherServices = [
      { name: 'Diet & Nutrition Plan', price: 500, duration_days: 30 },
      { name: 'Monthly Locker Rental', price: 300, duration_days: 30 },
      { name: 'Steam & Sauna Pass (1 Month)', price: 800, duration_days: 30 },
      { name: 'Body Composition Analysis (InBody)', price: 250, duration_days: 1 },
      { name: 'Guest Day Pass', price: 200, duration_days: 1 }
    ];

    const insertStmt = db.prepare('INSERT INTO other_service_tariffs (name, price, duration_days, is_hidden, active) VALUES (?, ?, ?, 0, 1)');
    defaultOtherServices.forEach(s => {
      insertStmt.run(s.name, s.price, s.duration_days);
    });
  }
} catch (e) {
  console.error("Error seeding initial other_service_tariffs:", e.message);
}

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
    { name: 'profileImage', type: 'TEXT' },
    { name: 'paidAmount', type: 'REAL DEFAULT 0' },
    { name: 'dueAmount', type: 'REAL DEFAULT 0' },
    { name: 'paymentStatus', type: 'TEXT DEFAULT "Paid"' },
    { name: 'gstin', type: 'TEXT' }
  ];

  columns.forEach(col => {
    try {
      db.prepare(`ALTER TABLE clients ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Added column ${col.name} to clients table`);
    } catch (e) {
      // Column might already exist
    }
  });

  try { db.prepare('ALTER TABLE transactions ADD COLUMN clientId TEXT').run(); } catch (e) { }
  try { db.prepare('ALTER TABLE transactions ADD COLUMN billId TEXT').run(); } catch (e) { }
  try { db.prepare('ALTER TABLE bills ADD COLUMN dueNumber INTEGER DEFAULT 0').run(); } catch (e) { }
  try { db.prepare('ALTER TABLE bills ADD COLUMN totalPlanAmount REAL DEFAULT 0').run(); } catch (e) { }
  try { db.prepare('ALTER TABLE bills ADD COLUMN remainingBalance REAL DEFAULT 0').run(); } catch (e) { }
  try { db.prepare('ALTER TABLE bills ADD COLUMN planName TEXT').run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN invoice_category TEXT DEFAULT 'GeneralPlan'").run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN taxable_value REAL").run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN cgst_amount REAL").run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN sgst_amount REAL").run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN gst_rate_snapshot REAL").run(); } catch (e) { }
  try { db.prepare("ALTER TABLE bills ADD COLUMN client_gstin_snapshot TEXT").run(); } catch (e) { }

  try {
    const InquiryCols = [
      { name: 'marriedStatus', type: 'TEXT' },
      { name: 'occupation', type: 'TEXT' },
      { name: 'company', type: 'TEXT' },
      { name: 'address', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
      { name: 'height', type: 'TEXT' },
      { name: 'weight', type: 'TEXT' },
      { name: 'bmi', type: 'TEXT' },
      { name: 'lbm', type: 'TEXT' },
      { name: 'fat', type: 'TEXT' },
      { name: 'referredBy', type: 'TEXT' },
      { name: 'lookingFor', type: 'TEXT' },
      { name: 'enquiredBy', type: 'TEXT' },
      { name: 'messaged', type: 'TEXT' },
      { name: 'tariffDiscussed', type: 'TEXT' },
      { name: 'reminderCall', type: 'TEXT' },
      { name: 'call1', type: 'TEXT' },
      { name: 'call2', type: 'TEXT' },
      { name: 'call3', type: 'TEXT' }
    ];
    InquiryCols.forEach(col => {
      try {
        db.prepare(`ALTER TABLE inquiries ADD COLUMN ${col.name} ${col.type}`).run();
      } catch (e) { }
    });
  } catch (err) { }
} catch (err) {
  console.error('Outer migration error:', err.message);
}

  // ─── PT Module Migrations & Tables ──────────────────────────────────────────
  try {
    try {
      db.prepare("ALTER TABLE trainers ADD COLUMN grade TEXT CHECK(grade IN ('A_PRO_PT','A','B'))").run();
      console.log('✅ Added grade column to trainers table');
    } catch (e) { }

    try {
      db.prepare("ALTER TABLE trainers ADD COLUMN custom_commission_percent REAL NULLABLE").run();
      console.log('✅ Added custom_commission_percent column to trainers table');
    } catch (e) { }

    // Migrate pt_packages table if category check constraint exists or restricts 'Challenge'
    try {
      const pkgSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pt_packages'").get()?.sql || '';
      if (pkgSql && (pkgSql.includes('CHECK(category IN') || pkgSql.includes('CHECK (category IN'))) {
        console.log('Migrating pt_packages table to remove category CHECK constraint...');
        const cols = db.prepare("PRAGMA table_info(pt_packages)").all().map(c => c.name);
        const colList = cols.join(', ');

        db.exec(`
          CREATE TABLE pt_packages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            total_classes INTEGER NOT NULL,
            category TEXT NOT NULL,
            duration_days INTEGER NOT NULL DEFAULT 30,
            eligible_grades TEXT NOT NULL,
            is_custom INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO pt_packages_new (${colList})
          SELECT ${colList} FROM pt_packages;
          DROP TABLE pt_packages;
          ALTER TABLE pt_packages_new RENAME TO pt_packages;
        `);
        console.log('pt_packages migration finished successfully.');
      }
    } catch (e) {
      console.error('pt_packages migration error:', e);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS pt_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        total_classes INTEGER NOT NULL,
        category TEXT NOT NULL,
        duration_days INTEGER NOT NULL DEFAULT 30,
        eligible_grades TEXT NOT NULL,
        is_custom INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      db.prepare("ALTER TABLE pt_packages ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 30").run();
    } catch (e) { }

    // Migrate pt_assignments status check constraint to include 'Expired'
    try {
      const assignSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pt_assignments'").get()?.sql || '';
      if (assignSql && !assignSql.includes('Expired')) {
        db.exec(`
          CREATE TABLE pt_assignments_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL REFERENCES clients(id),
            pt_package_id INTEGER NOT NULL REFERENCES pt_packages(id),
            trainer_id TEXT NOT NULL REFERENCES trainers(id),
            package_price_snapshot REAL NOT NULL,
            total_classes_snapshot INTEGER NOT NULL,
            classes_completed INTEGER DEFAULT 0,
            status TEXT CHECK(status IN ('Active','Completed','Cancelled','Expired')) DEFAULT 'Active',
            assigned_date DATE NOT NULL,
            expiry_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO pt_assignments_new (id, client_id, pt_package_id, trainer_id, package_price_snapshot, total_classes_snapshot, classes_completed, status, assigned_date, expiry_date, created_at)
          SELECT id, client_id, pt_package_id, trainer_id, package_price_snapshot, total_classes_snapshot, classes_completed, status, assigned_date, COALESCE(assigned_date, date('now')), created_at FROM pt_assignments;
          DROP TABLE pt_assignments;
          ALTER TABLE pt_assignments_new RENAME TO pt_assignments;
        `);
      }
    } catch (e) { }

    db.exec(`
      CREATE TABLE IF NOT EXISTS pt_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL REFERENCES clients(id),
        pt_package_id INTEGER NOT NULL REFERENCES pt_packages(id),
        trainer_id TEXT NOT NULL REFERENCES trainers(id),
        package_price_snapshot REAL NOT NULL,
        total_classes_snapshot INTEGER NOT NULL,
        classes_completed INTEGER DEFAULT 0,
        status TEXT CHECK(status IN ('Active','Completed','Cancelled','Expired')) DEFAULT 'Active',
        assigned_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      db.prepare("ALTER TABLE pt_assignments ADD COLUMN expiry_date DATE").run();
    } catch (e) { }

    try {
      db.prepare("ALTER TABLE pt_assignments ADD COLUMN invoice_id TEXT REFERENCES bills(id)").run();
      console.log('✅ Added invoice_id column to pt_assignments table');
    } catch (e) { }

    db.exec(`
      CREATE TABLE IF NOT EXISTS general_package_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL REFERENCES clients(id),
        plan_type TEXT NOT NULL,
        price REAL NOT NULL,
        booking_start_date DATE NOT NULL,
        booking_end_date DATE NOT NULL,
        status TEXT CHECK(status IN ('Scheduled','Active','Cancelled')) NOT NULL DEFAULT 'Scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pt_advance_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL REFERENCES clients(id),
        pt_package_id INTEGER NOT NULL REFERENCES pt_packages(id),
        trainer_id TEXT NOT NULL REFERENCES trainers(id),
        price_snapshot REAL NOT NULL,
        total_classes_snapshot INTEGER NOT NULL,
        booking_start_date DATE NOT NULL,
        status TEXT CHECK(status IN ('Scheduled','ReadyToActivate','Active','Cancelled')) NOT NULL DEFAULT 'Scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate pt_class_log to include session_slot with composite UNIQUE(pt_assignment_id, class_date, session_slot)
    try {
      const logSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pt_class_log'").get()?.sql || '';
      if (logSql && !logSql.includes('session_slot')) {
        db.exec(`
          CREATE TABLE pt_class_log_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pt_assignment_id INTEGER NOT NULL REFERENCES pt_assignments(id),
            trainer_id TEXT NOT NULL REFERENCES trainers(id),
            client_id TEXT NOT NULL REFERENCES clients(id),
            class_date DATE NOT NULL,
            session_slot TEXT CHECK(session_slot IN ('Morning','Evening')) NOT NULL DEFAULT 'Morning',
            per_class_rate_snapshot REAL NOT NULL,
            slab_applied TEXT CHECK(slab_applied IN ('Slab1','Slab2')) NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(pt_assignment_id, class_date, session_slot)
          );
          INSERT INTO pt_class_log_new (id, pt_assignment_id, trainer_id, client_id, class_date, session_slot, per_class_rate_snapshot, slab_applied, notes, created_at)
          SELECT id, pt_assignment_id, trainer_id, client_id, class_date, 'Morning', per_class_rate_snapshot, slab_applied, notes, created_at FROM pt_class_log;
          DROP TABLE pt_class_log;
          ALTER TABLE pt_class_log_new RENAME TO pt_class_log;
        `);
      }
    } catch (e) { }

    db.exec(`
      CREATE TABLE IF NOT EXISTS pt_class_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pt_assignment_id INTEGER NOT NULL REFERENCES pt_assignments(id),
        trainer_id TEXT NOT NULL REFERENCES trainers(id),
        client_id TEXT NOT NULL REFERENCES clients(id),
        class_date DATE NOT NULL,
        session_slot TEXT CHECK(session_slot IN ('Morning','Evening')) NOT NULL DEFAULT 'Morning',
        per_class_rate_snapshot REAL NOT NULL,
        slab_applied TEXT CHECK(slab_applied IN ('Slab1','Slab2')) NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pt_assignment_id, class_date, session_slot)
      );

      CREATE TABLE IF NOT EXISTS payroll_locks (
        month TEXT PRIMARY KEY,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        locked_by TEXT REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS trainer_payroll_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trainer_id TEXT NOT NULL REFERENCES trainers(id),
        month TEXT NOT NULL,
        basic_pay REAL NOT NULL DEFAULT 0,
        bonus REAL NOT NULL DEFAULT 0,
        bonus_note TEXT,
        incentive_amount REAL NOT NULL DEFAULT 0,
        incentive_type TEXT CHECK(incentive_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add',
        other_amount REAL NOT NULL DEFAULT 0,
        other_type TEXT CHECK(other_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add',
        other_label TEXT,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trainer_id, month)
      );

      CREATE TABLE IF NOT EXISTS trainer_daily_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trainer_id TEXT NOT NULL REFERENCES trainers(id),
        status_date TEXT NOT NULL,
        status TEXT CHECK(status IN ('Present','Absent')) NOT NULL DEFAULT 'Present',
        marked_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trainer_id, status_date)
      );
    `);

    // Add adjustments columns if table already existed
    const adjCols = [
      { name: 'incentive_amount', type: 'REAL NOT NULL DEFAULT 0' },
      { name: 'incentive_type', type: "TEXT CHECK(incentive_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add'" },
      { name: 'other_amount', type: 'REAL NOT NULL DEFAULT 0' },
      { name: 'other_type', type: "TEXT CHECK(other_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add'" },
      { name: 'other_label', type: 'TEXT' }
    ];
    adjCols.forEach(col => {
      try { db.prepare(`ALTER TABLE trainer_payroll_adjustments ADD COLUMN ${col.name} ${col.type}`).run(); } catch (e) { }
    });

    // Seed catalog pt_packages if empty
    const existingPkgCount = db.prepare('SELECT COUNT(*) as cnt FROM pt_packages WHERE is_custom = 0').get().cnt;
    if (existingPkgCount === 0) {
      const seedPackages = [
        { name: 'A Pro PT — Standard', price: 9000, total_classes: 16, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A_PRO_PT']) },
        { name: 'A Pro PT — Premium', price: 25000, total_classes: 48, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A_PRO_PT']) },
        { name: 'Standard PT — S1', price: 6000, total_classes: 16, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A', 'B']) },
        { name: 'Standard PT — S2', price: 7000, total_classes: 16, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A', 'B']) },
        { name: 'Standard PT — S3 (Extended)', price: 19000, total_classes: 48, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A', 'B']) },
        { name: 'Standard PT — S4 (Extended)', price: 20000, total_classes: 50, category: 'Adult', duration_days: 30, eligible_grades: JSON.stringify(['A', 'B']) },
        { name: 'Kid PT (Age 5–10)', price: 2000, total_classes: 16, category: 'Kid', duration_days: 30, eligible_grades: JSON.stringify(['A_PRO_PT', 'A', 'B']) }
      ];

      const stmt = db.prepare(`
        INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `);
      seedPackages.forEach(pkg => stmt.run(pkg.name, pkg.price, pkg.total_classes, pkg.category, pkg.duration_days, pkg.eligible_grades));
      console.log('✅ Seeded catalog PT packages');
    }

    // Ensure "100 Days Challenge" package exists in catalog
    const challengePkg = db.prepare("SELECT * FROM pt_packages WHERE name = '100 Days Challenge' AND is_custom = 0").get();
    if (!challengePkg) {
      db.prepare(`
        INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
        VALUES ('100 Days Challenge', 15000, 30, 'Challenge', 100, ?, 0, 1)
      `).run(JSON.stringify(['A_PRO_PT', 'A', 'B']));
      console.log('✅ Seeded 100 Days Challenge PT package');
    }

  } catch (err) {
    console.error('Migration error:', err.message);
  }

  console.log('✅ Connected to SQLite →', DB_PATH);

  // ─── PT Calculation & Auto-Expiry Helpers ────────────────────────────────────
  const autoExpireAssignments = () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = db.prepare(`
        UPDATE pt_assignments
        SET status = 'Expired'
        WHERE status = 'Active' AND expiry_date IS NOT NULL AND date(expiry_date) < date(?)
      `).run(today);
      if (result.changes > 0) {
        console.log(`⏰ Auto-expired ${result.changes} PT assignments.`);
      }
    } catch (e) {
      console.error('Error auto-expiring PT assignments:', e.message);
    }
  };

  const generatePtInvoice = (clientId, packageName, priceSnapshot, assignedDate, expiryDate) => {
    try {
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
      if (!client) return null;

      const billRow = db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
      let nextBillNo = 'INV-0001';
      if (billRow && billRow.billNo) {
        const match = billRow.billNo.match(/INV-(\d{4})/);
        if (match) {
          nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
        }
      }

      const billId = randomUUID();
      const invoiceDateStr = toDateLabel();

      db.prepare(`
        INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        billId,
        nextBillNo,
        clientId,
        client.name,
        invoiceDateStr,
        assignedDate || '',
        expiryDate || '',
        priceSnapshot,
        0,
        priceSnapshot,
        'Due',
        0,
        priceSnapshot,
        priceSnapshot
      );

      const currentDue = client.dueAmount || 0;
      const newDue = currentDue + priceSnapshot;
      const newPaymentStatus = newDue <= 0 ? 'Paid' : 'Due';
      db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(newDue, newPaymentStatus, clientId);

      return { billId, billNo: nextBillNo };
    } catch (err) {
      console.error('Error generating PT invoice:', err.message);
      return null;
    }
  };

  const autoActivateAdvanceBookings = () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. General Package Advance Bookings Auto-Activation
      const scheduledGenBookings = db.prepare(`
        SELECT b.*, c.expiryDate as currentExpiry
        FROM general_package_bookings b
        JOIN clients c ON b.client_id = c.id
        WHERE b.status = 'Scheduled' AND date(b.booking_start_date) <= date(?)
      `).all(today);

      scheduledGenBookings.forEach(b => {
        const isCurrentExpired = !b.currentExpiry || b.currentExpiry < today;
        if (isCurrentExpired) {
          db.prepare(`
            UPDATE clients 
            SET plan = ?, fromDate = ?, expiryDate = ?, amount = ?, status = 'active'
            WHERE id = ?
          `).run(b.plan_type, b.booking_start_date, b.booking_end_date, b.price, b.client_id);

          db.prepare("UPDATE general_package_bookings SET status = 'Active' WHERE id = ?").run(b.id);
          console.log(`✅ [Cron] Auto-activated General Package Booking #${b.id} for Client ${b.client_id}`);
        }
      });

      // 2. PT Advance Bookings Flagging to ReadyToActivate
      const scheduledPtBookings = db.prepare(`
        SELECT b.*
        FROM pt_advance_bookings b
        WHERE b.status = 'Scheduled' AND date(b.booking_start_date) <= date(?)
      `).all(today);

      scheduledPtBookings.forEach(b => {
        const activeAssignment = db.prepare(`
          SELECT id FROM pt_assignments
          WHERE client_id = ? AND status = 'Active' AND date(expiry_date) >= date(?)
        `).get(b.client_id, today);

        if (!activeAssignment) {
          db.prepare("UPDATE pt_advance_bookings SET status = 'ReadyToActivate' WHERE id = ?").run(b.id);
          console.log(`⏰ [Cron] PT Advance Booking #${b.id} marked as ReadyToActivate`);
        }
      });
    } catch (e) {
      console.error('Error auto-activating advance bookings:', e.message);
    }
  };

  // Run on startup
  autoExpireAssignments();
  autoActivateAdvanceBookings();

  const calculateExpiryDate = (assignedDateStr, durationDays = 30) => {
    const baseStr = assignedDateStr || new Date().toISOString().split('T')[0];
    const parts = baseStr.split('-');
    if (parts.length !== 3) return baseStr;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() + parseInt(durationDays || 30, 10));
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const COMMISSION_MATRIX = {
    'A_PRO_PT': { Slab1: 0.40, Slab2: 0.25 },
    'A':        { Slab1: 0.40, Slab2: 0.25 },
    'B':        { Slab1: 0.30, Slab2: 0.25 }
  };

  const getTrainerMonthlyPtBaseRevenue = (trainerId, yearMonthStr) => {
    const row = db.prepare(`
      SELECT SUM(a.package_price_snapshot / a.total_classes_snapshot) as baseRevenue
      FROM pt_class_log l
      JOIN pt_assignments a ON l.pt_assignment_id = a.id
      WHERE l.trainer_id = ? AND strftime('%Y-%m', l.class_date) = ?
    `).get(trainerId, yearMonthStr);
    return row && row.baseRevenue ? row.baseRevenue : 0;
  };

  const getSlabForRevenue = (baseRevenue) => {
    return baseRevenue > 300000 ? 'Slab1' : 'Slab2';
  };

  const calculatePerClassRate = (packagePrice, totalClasses, trainer, slab) => {
    let commRate = 0.25;
    if (trainer && trainer.custom_commission_percent !== null && trainer.custom_commission_percent !== undefined && trainer.custom_commission_percent !== '') {
      commRate = parseFloat(trainer.custom_commission_percent) / 100;
    } else if (trainer && trainer.grade && COMMISSION_MATRIX[trainer.grade]) {
      commRate = COMMISSION_MATRIX[trainer.grade][slab] || 0.25;
    }
    return (packagePrice * commRate) / totalClasses;
  };

  const syncTrainerMonthlyClassLogs = (trainerId, yearMonthStr) => {
    const totalRevenue = getTrainerMonthlyPtBaseRevenue(trainerId, yearMonthStr);
    const currentSlab = getSlabForRevenue(totalRevenue);
    
    const trainer = db.prepare('SELECT grade, custom_commission_percent FROM trainers WHERE id = ?').get(trainerId);
    if (!trainer) return currentSlab;

    const logs = db.prepare(`
      SELECT l.id, a.package_price_snapshot, a.total_classes_snapshot
      FROM pt_class_log l
      JOIN pt_assignments a ON l.pt_assignment_id = a.id
      WHERE l.trainer_id = ? AND strftime('%Y-%m', l.class_date) = ?
    `).all(trainerId, yearMonthStr);

    const updateStmt = db.prepare(`
      UPDATE pt_class_log
      SET per_class_rate_snapshot = ?, slab_applied = ?
      WHERE id = ?
    `);

    logs.forEach(log => {
      const rate = calculatePerClassRate(log.package_price_snapshot, log.total_classes_snapshot, trainer, currentSlab);
      updateStmt.run(rate, currentSlab, log.id);
    });

    return currentSlab;
  };

// ─── Helper ──────────────────────────────────────────────────────────────────
const toDateLabel = (d = new Date()) => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const computeGstBreakdown = (price, ratePercent = 4.8) => {
  const totalAmount = parseFloat(price) || 0;
  const rateDecimal = (parseFloat(ratePercent) || 4.8) / 100;
  const taxable_value = totalAmount / (1 + rateDecimal);
  const totalGst = totalAmount - taxable_value;
  const cgst_amount = totalGst / 2;
  const sgst_amount = totalGst / 2;
  return {
    taxable_value: parseFloat(taxable_value.toFixed(2)),
    cgst_amount: parseFloat(cgst_amount.toFixed(2)),
    sgst_amount: parseFloat(sgst_amount.toFixed(2)),
    gst_rate_snapshot: ratePercent
  };
};

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

// GET /api/attendance/monthly?clientId=xxx&year=2026&month=05
app.get('/api/attendance/monthly', (req, res) => {
  try {
    const { clientId, year, month } = req.query;
    if (!clientId || !year || !month) return res.status(400).json({ error: 'clientId, year, month required' });

    const prefix = `${year}-${month.padStart(2, '0')}`;
    const records = db.prepare(
      "SELECT * FROM attendance WHERE clientId = ? AND date LIKE ?"
    ).all(clientId, `${prefix}%`);

    const presentDays = records.filter(r => r.status === 'Present').length;
    const absentDays = records.filter(r => r.status === 'Absent').length;

    // Calculate total days in that month
    const totalDays = new Date(parseInt(year), parseInt(month), 0).getDate();

    res.json({ totalDays, presentDays, absentDays, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET bills for a specific client
app.get('/api/bills/client/:clientId', (req, res) => {
  try {
    const bills = db.prepare('SELECT * FROM bills WHERE clientId = ? ORDER BY timestamp DESC').all(req.params.clientId);
    res.json(bills);
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
      trainerId = null, admissionDate = '', profileImage = null,
      hasGst = false, gstin = null
    } = req.body;

    let gstinVal = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinVal = gstin.trim().toUpperCase();
    }

    // Check for unique clientId
    if (clientId) {
      const existing = db.prepare('SELECT id FROM clients WHERE clientId = ?').get(clientId);
      if (existing) {
        return res.status(400).json({ error: 'This Client ID is already in use.' });
      }
    }

    const id = randomUUID();
    const finalPaidAmount = req.body.paidAmount !== undefined ? req.body.paidAmount : amount;
    const dueAmount = amount - finalPaidAmount;
    const paymentStatus = dueAmount <= 0 ? 'Paid' : (finalPaidAmount > 0 ? 'Partial' : 'Due');

    db.prepare(`
      INSERT INTO clients (
        id, clientId, name, phone, plan, fromDate, expiryDate, amount, 
        personalTraining, status, gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet, trainerId, admissionDate, profileImage,
        paidAmount, dueAmount, paymentStatus, gstin
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, clientId || '', name, phone || '', plan || '', fromDate || '', expiryDate || '',
      amount, personalTraining ? 1 : 0, status,
      gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet ? 1 : 0,
      trainerId, admissionDate, profileImage,
      finalPaidAmount, dueAmount, paymentStatus, gstinVal
    );

    // Generate Bill No
    const billRow = db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }

    const gstSettings = db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const gstCalc = computeGstBreakdown(amount, gstSettings.gst_rate_percent || 4.8);

    const billId = randomUUID();
    db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, invoice_category, taxable_value, cgst_amount, sgst_amount, gst_rate_snapshot, client_gstin_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GeneralPlan', ?, ?, ?, ?, ?)
    `).run(billId, nextBillNo, id, name, toDateLabel(), fromDate || '', expiryDate || '', amount, finalPaidAmount, dueAmount, paymentStatus, 0, amount, dueAmount, gstCalc.taxable_value, gstCalc.cgst_amount, gstCalc.sgst_amount, gstCalc.gst_rate_snapshot, gstinVal);

    // Create a transaction record if some amount is paid
    if (finalPaidAmount > 0) {
      const txId = randomUUID();
      db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(txId, id, billId, name, paymentMethod, finalPaidAmount, toDateLabel());
    }

    const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.status(201).json({ ...newClient, personalTraining: !!newClient.personalTraining, billNo: nextBillNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add payment to client bill
app.post('/api/clients/:id/payment', (req, res) => {
  try {
    const clientId = req.params.id;
    const { paidAmount, paymentDate, paymentMethod } = req.body;

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const amountToPay = parseFloat(paidAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) return res.status(400).json({ error: 'Invalid paid amount' });

    const newPaidAmount = (client.paidAmount || 0) + amountToPay;
    const newDueAmount = Math.max(0, (client.amount || 0) - newPaidAmount);
    const newStatus = newDueAmount <= 0 ? 'Paid' : 'Partial';

    // Update client
    db.prepare(`
      UPDATE clients SET paidAmount = ?, dueAmount = ?, paymentStatus = ? WHERE id = ?
    `).run(newPaidAmount, newDueAmount, newStatus, clientId);

    // Generate Bill No
    const billRow = db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }
    const billId = randomUUID();

    // Count existing bills for this client to assign due sequence number
    const existingBillCount = db.prepare('SELECT COUNT(*) as cnt FROM bills WHERE clientId = ?').get(clientId).cnt;
    const dueNumber = existingBillCount; // 1st due payment = Due 1, 2nd = Due 2, etc.

    // Create a new invoice for this payment
    db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      nextBillNo,
      clientId,
      client.name,
      paymentDate || toDateLabel(),
      client.fromDate,
      client.expiryDate,
      amountToPay,   // planAmount for this bill = what was paid now
      amountToPay,   // paidAmount
      0,             // dueAmount for this specific invoice = 0
      'Paid',
      dueNumber,
      client.amount, // totalPlanAmount = the original full membership amount
      newDueAmount   // remainingBalance = what is still owed after this payment
    );

    // Add transaction
    const txId = randomUUID();
    db.prepare(`
      INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(txId, clientId, billId, client.name, paymentMethod || 'CASH', amountToPay, paymentDate || toDateLabel());

    // Return the new bill so frontend can open invoice preview immediately
    const newBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    res.json({ success: true, message: 'Payment updated successfully', bill: newBill });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all bills
app.get('/api/bills', (req, res) => {
  try {
    const bills = db.prepare('SELECT * FROM bills ORDER BY timestamp DESC').all();
    res.json(bills);
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
    const trainers = db.prepare(`SELECT * FROM trainers ORDER BY dateAdded DESC`).all();

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const trainersWithStats = trainers.map(tr => {
      const clientCountRow = db.prepare(`
        SELECT COUNT(DISTINCT client_id) as totalClients FROM (
          SELECT id as client_id FROM clients WHERE trainerId = ?
          UNION
          SELECT client_id FROM pt_assignments WHERE trainer_id = ? AND status = 'Active'
        )
      `).get(tr.id, tr.id);

      const clientCount = clientCountRow ? clientCountRow.totalClients : 0;
      const baseRevenue = getTrainerMonthlyPtBaseRevenue(tr.id, currentMonthStr);
      const activeSlab = getSlabForRevenue(baseRevenue);

      return {
        ...tr,
        clientCount: clientCount,
        monthlyPtBaseRevenue: baseRevenue,
        activeSlab: activeSlab
      };
    });

    res.json(trainersWithStats);
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
    const { trainerId, name, specialization, experience, status = 'Active', grade, custom_commission_percent } = req.body;
    if (!grade || !['A_PRO_PT', 'A', 'B'].includes(grade)) {
      return res.status(400).json({ error: 'Valid Grade (A_PRO_PT, A, B) is required.' });
    }
    const commOverride = (custom_commission_percent !== undefined && custom_commission_percent !== null && custom_commission_percent !== '')
      ? parseFloat(custom_commission_percent)
      : null;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO trainers (id, trainerId, name, specialization, experience, status, grade, custom_commission_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, trainerId, name, specialization, experience, status, grade, commOverride);

    const newTrainer = db.prepare('SELECT * FROM trainers WHERE id = ?').get(id);
    res.status(201).json(newTrainer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update trainer
app.put('/api/trainers/:id', (req, res) => {
  try {
    const { trainerId, name, specialization, experience, status, grade, custom_commission_percent } = req.body;
    if (!grade || !['A_PRO_PT', 'A', 'B'].includes(grade)) {
      return res.status(400).json({ error: 'Valid Grade (A_PRO_PT, A, B) is required.' });
    }
    const commOverride = (custom_commission_percent !== undefined && custom_commission_percent !== null && custom_commission_percent !== '')
      ? parseFloat(custom_commission_percent)
      : null;

    db.prepare(`
      UPDATE trainers SET
        trainerId = ?, name = ?, specialization = ?, experience = ?, status = ?, grade = ?, custom_commission_percent = ?
      WHERE id = ?
    `).run(trainerId, name, specialization, experience, status, grade, commOverride, req.params.id);

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

// ─── PT PACKAGES Routes ──────────────────────────────────────────────────────
app.get('/api/pt-packages', (req, res) => {
  try {
    const pkgs = db.prepare('SELECT * FROM pt_packages ORDER BY is_custom ASC, id ASC').all();
    res.json(pkgs.map(p => ({ ...p, eligible_grades: JSON.parse(p.eligible_grades || '[]'), active: !!p.active, is_custom: !!p.is_custom })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-packages', (req, res) => {
  try {
    const { name, price, total_classes, category, eligible_grades, duration_days = 30, active = 1 } = req.body;
    if (!name || price === undefined || !total_classes || !category || !eligible_grades) {
      return res.status(400).json({ error: 'Missing required fields for PT Package.' });
    }
    const gradesStr = Array.isArray(eligible_grades) ? JSON.stringify(eligible_grades) : eligible_grades;
    const durDays = parseInt(duration_days, 10) || 30;

    const result = db.prepare(`
      INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, gradesStr, active ? 1 : 0);

    const newPkg = db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...newPkg, eligible_grades: JSON.parse(newPkg.eligible_grades || '[]'), active: !!newPkg.active, is_custom: !!newPkg.is_custom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pt-packages/:id', (req, res) => {
  try {
    const { name, price, total_classes, category, eligible_grades, duration_days = 30, active } = req.body;
    const gradesStr = Array.isArray(eligible_grades) ? JSON.stringify(eligible_grades) : eligible_grades;
    const durDays = parseInt(duration_days, 10) || 30;

    db.prepare(`
      UPDATE pt_packages SET
        name = ?, price = ?, total_classes = ?, category = ?, duration_days = ?, eligible_grades = ?, active = ?
      WHERE id = ?
    `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, gradesStr, active ? 1 : 0, req.params.id);

    const updated = db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(req.params.id);
    res.json({ ...updated, eligible_grades: JSON.parse(updated.eligible_grades || '[]'), active: !!updated.active, is_custom: !!updated.is_custom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/pt-packages/:id/active', (req, res) => {
  try {
    const { active } = req.body;
    db.prepare('UPDATE pt_packages SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    res.json({ success: true, active: !!active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-packages/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM pt_packages WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'PT Package deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PT ASSIGNMENTS Routes ───────────────────────────────────────────────────
app.get('/api/pt-assignments', (req, res) => {
  try {
    autoExpireAssignments();
    const { client_id, trainer_id, status } = req.query;
    let query = `
      SELECT a.*, 
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory, p.duration_days
      FROM pt_assignments a
      JOIN clients c ON a.client_id = c.id
      JOIN trainers t ON a.trainer_id = t.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (client_id) { query += ' AND a.client_id = ?'; params.push(client_id); }
    if (trainer_id) { query += ' AND a.trainer_id = ?'; params.push(trainer_id); }
    if (status) { query += ' AND a.status = ?'; params.push(status); }

    query += ' ORDER BY a.created_at DESC';
    const assignments = db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:clientId/pt-assignments', (req, res) => {
  try {
    autoExpireAssignments();
    const assignments = db.prepare(`
      SELECT a.*, 
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory, p.duration_days
      FROM pt_assignments a
      JOIN trainers t ON a.trainer_id = t.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE a.client_id = ?
      ORDER BY a.created_at DESC
    `).all(req.params.clientId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-assignments', (req, res) => {
  try {
    const { client_id, trainer_id, pt_package_id, custom_package, assigned_date } = req.body;

    if (!client_id || !trainer_id || (!pt_package_id && !custom_package)) {
      return res.status(400).json({ error: 'Client, Trainer, and Package selection are required.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const existingActive = db.prepare(`
      SELECT * FROM pt_assignments
      WHERE client_id = ? AND status = 'Active' AND date(expiry_date) >= date(?)
      ORDER BY date(expiry_date) DESC LIMIT 1
    `).get(client_id, today);

    if (existingActive) {
      return res.status(400).json({
        error: `This client already has an active PT package until ${existingActive.expiry_date}.`,
        existingEndDate: existingActive.expiry_date
      });
    }

    const trainer = db.prepare('SELECT * FROM trainers WHERE id = ?').get(trainer_id);
    if (!trainer) return res.status(404).json({ error: 'Trainer not found.' });
    if (!trainer.grade) {
      return res.status(400).json({ error: 'Selected trainer does not have an assigned Grade. Please set trainer grade first.' });
    }

    let finalPackageId = pt_package_id;
    let priceSnapshot = 0;
    let totalClassesSnapshot = 0;
    let packageDurationDays = 30;
    let pkgName = 'PT Package';

    if (custom_package) {
      const { name = 'Custom PT Package', price, total_classes, category = 'Adult', eligible_grade, duration_days = 30 } = custom_package;
      if (!price || parseFloat(price) <= 0 || !total_classes || parseInt(total_classes, 10) <= 0) {
        return res.status(400).json({ error: 'Custom package price and total classes must be greater than 0.' });
      }
      pkgName = name;
      const gradeToStore = eligible_grade || trainer.grade;
      const durDays = parseInt(duration_days, 10) || 30;
      const result = db.prepare(`
        INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, JSON.stringify([gradeToStore]));
      finalPackageId = result.lastInsertRowid;
      priceSnapshot = parseFloat(price);
      totalClassesSnapshot = parseInt(total_classes, 10);
      packageDurationDays = durDays;
    } else {
      const pkg = db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id);
      if (!pkg) return res.status(404).json({ error: 'PT Package not found.' });
      pkgName = pkg.name;
      priceSnapshot = pkg.price;
      totalClassesSnapshot = pkg.total_classes;
      packageDurationDays = pkg.duration_days || 30;
    }

    const assignDate = assigned_date || new Date().toISOString().split('T')[0];
    const expiryDate = calculateExpiryDate(assignDate, packageDurationDays);

    // Automatic Invoice Generation
    const invoiceObj = generatePtInvoice(client_id, pkgName, priceSnapshot, assignDate, expiryDate);
    const invoiceId = invoiceObj ? invoiceObj.billId : null;

    const result = db.prepare(`
      INSERT INTO pt_assignments (
        client_id, pt_package_id, trainer_id, package_price_snapshot, total_classes_snapshot, classes_completed, status, assigned_date, expiry_date, invoice_id
      ) VALUES (?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?)
    `).run(client_id, finalPackageId, trainer_id, priceSnapshot, totalClassesSnapshot, assignDate, expiryDate, invoiceId);

    const newAssignment = db.prepare(`
      SELECT a.*, c.name as clientName, t.name as trainerName, p.name as packageName, p.duration_days
      FROM pt_assignments a
      JOIN clients c ON a.client_id = c.id
      JOIN trainers t ON a.trainer_id = t.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE a.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ ...newAssignment, billNo: invoiceObj?.billNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERAL PACKAGE ADVANCE BOOKING Routes ─────────────────────────
app.get('/api/general-bookings', (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.expiryDate as currentPlanExpiry
      FROM general_package_bookings b
      JOIN clients c ON b.client_id = c.id
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/general-bookings', (req, res) => {
  try {
    const { client_id, plan_type, price, booking_start_date, booking_end_date } = req.body;

    if (!client_id || !plan_type || price === undefined || price === null || !booking_start_date) {
      return res.status(400).json({ error: 'Client, plan type, price, and start date are required.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const today = new Date().toISOString().split('T')[0];
    if (client.expiryDate && client.expiryDate >= today) {
      if (booking_start_date <= client.expiryDate) {
        return res.status(400).json({
          error: `Booking start date (${booking_start_date}) must be strictly after the client's current plan end date (${client.expiryDate}).`
        });
      }
    }

    let endDate = booking_end_date;
    if (!endDate) {
      const settings = db.prepare('SELECT * FROM settings').all();
      const settingsObj = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
      const customDuration = settingsObj[`${plan_type}_duration`];
      let days = customDuration ? parseInt(customDuration, 10) : 30;
      if (!customDuration) {
        const lower = plan_type.toLowerCase();
        if (lower.includes('quarterly')) days = 90;
        else if (lower.includes('half-yearly') || lower.includes('half yearly')) days = 180;
        else if (lower.includes('annual') || lower.includes('yearly')) days = 365;
        else days = 30;
      }
      endDate = calculateExpiryDate(booking_start_date, days);
    }

    const result = db.prepare(`
      INSERT INTO general_package_bookings (client_id, plan_type, price, booking_start_date, booking_end_date, status)
      VALUES (?, ?, ?, ?, ?, 'Scheduled')
    `).run(client_id, plan_type, parseFloat(price), booking_start_date, endDate);

    const newBooking = db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode
      FROM general_package_bookings b
      JOIN clients c ON b.client_id = c.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newBooking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/general-bookings/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (booking.status !== 'Scheduled') {
      return res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'.` });
    }

    db.prepare("UPDATE general_package_bookings SET status = 'Cancelled' WHERE id = ?").run(id);
    res.json({ success: true, message: 'General package advance booking cancelled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PT ADVANCE BOOKING Routes ──────────────────────────────────────
app.get('/api/pt-advance-bookings', (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.*,
             c.name as clientName, c.phone as clientPhone, c.clientId as clientCode,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.duration_days
      FROM pt_advance_bookings b
      JOIN clients c ON b.client_id = c.id
      JOIN trainers t ON b.trainer_id = t.id
      JOIN pt_packages p ON b.pt_package_id = p.id
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-advance-bookings', (req, res) => {
  try {
    const { client_id, pt_package_id, trainer_id, booking_start_date } = req.body;

    if (!client_id || !pt_package_id || !trainer_id || !booking_start_date) {
      return res.status(400).json({ error: 'Client, PT Package, Trainer, and Start Date are required.' });
    }

    const pkg = db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id);
    if (!pkg) return res.status(404).json({ error: 'PT Package not found.' });

    const latestPt = db.prepare(`
      SELECT * FROM pt_assignments
      WHERE client_id = ? AND (status = 'Active' OR date(expiry_date) >= date('now'))
      ORDER BY date(expiry_date) DESC LIMIT 1
    `).get(client_id);

    if (latestPt && latestPt.expiry_date) {
      if (booking_start_date <= latestPt.expiry_date) {
        return res.status(400).json({
          error: `Booking start date (${booking_start_date}) must be strictly after client's current PT package expiry date (${latestPt.expiry_date}).`
        });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const initialStatus = (booking_start_date <= today && (!latestPt || latestPt.status !== 'Active'))
      ? 'ReadyToActivate'
      : 'Scheduled';

    const result = db.prepare(`
      INSERT INTO pt_advance_bookings (client_id, pt_package_id, trainer_id, price_snapshot, total_classes_snapshot, booking_start_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(client_id, pt_package_id, trainer_id, pkg.price, pkg.total_classes, booking_start_date, initialStatus);

    const newBooking = db.prepare(`
      SELECT b.*, c.name as clientName, t.name as trainerName, p.name as packageName
      FROM pt_advance_bookings b
      JOIN clients c ON b.client_id = c.id
      JOIN trainers t ON b.trainer_id = t.id
      JOIN pt_packages p ON b.pt_package_id = p.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newBooking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/pt-advance-bookings/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'PT Advance booking not found.' });

    if (!['Scheduled', 'ReadyToActivate'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'.` });
    }

    db.prepare("UPDATE pt_advance_bookings SET status = 'Cancelled' WHERE id = ?").run(id);
    res.json({ success: true, message: 'PT advance booking cancelled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-advance-bookings/:id/activate', (req, res) => {
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'PT Advance booking not found.' });

    if (booking.status === 'Active') {
      return res.status(400).json({ error: 'This PT advance booking is already active.' });
    }
    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot activate a cancelled booking.' });
    }

    const pkg = db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(booking.pt_package_id);
    const durationDays = pkg ? (pkg.duration_days || 30) : 30;
    const pkgName = pkg ? pkg.name : 'PT Package';

    const assignDate = booking.booking_start_date || new Date().toISOString().split('T')[0];
    const expiryDate = calculateExpiryDate(assignDate, durationDays);

    const invoiceObj = generatePtInvoice(booking.client_id, pkgName, booking.price_snapshot, assignDate, expiryDate);
    const invoiceId = invoiceObj ? invoiceObj.billId : null;

    const assignResult = db.prepare(`
      INSERT INTO pt_assignments (
        client_id, pt_package_id, trainer_id, package_price_snapshot, total_classes_snapshot, classes_completed, status, assigned_date, expiry_date, invoice_id
      ) VALUES (?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?)
    `).run(booking.client_id, booking.pt_package_id, booking.trainer_id, booking.price_snapshot, booking.total_classes_snapshot, assignDate, expiryDate, invoiceId);

    db.prepare("UPDATE pt_advance_bookings SET status = 'Active' WHERE id = ?").run(id);

    const newAssignment = db.prepare(`
      SELECT a.*, c.name as clientName, t.name as trainerName, p.name as packageName
      FROM pt_assignments a
      JOIN clients c ON a.client_id = c.id
      JOIN trainers t ON a.trainer_id = t.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE a.id = ?
    `).get(assignResult.lastInsertRowid);

    res.json({ success: true, assignment: newAssignment, billNo: invoiceObj?.billNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PT CLASS LOG Routes ─────────────────────────────────────────────────────
app.get('/api/pt-class-log/today', (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const logs = db.prepare(`
      SELECT l.*,
             c.name as clientName, c.clientId as clientCode,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, a.total_classes_snapshot, a.classes_completed,
             a.trainer_id as assigned_trainer_id,
             at.name as assignedTrainerName, at.grade as assignedTrainerGrade
      FROM pt_class_log l
      JOIN pt_assignments a ON l.pt_assignment_id = a.id
      JOIN clients c ON l.client_id = c.id
      JOIN trainers t ON l.trainer_id = t.id
      JOIN trainers at ON a.trainer_id = at.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE l.class_date = ?
      ORDER BY l.created_at DESC
    `).all(todayStr);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-class-log', (req, res) => {
  try {
    const { pt_assignment_id, class_date, session_slot = 'Morning', trainer_id, notes } = req.body;

    if (!pt_assignment_id || !class_date) {
      return res.status(400).json({ error: 'PT Assignment and Class Date are required.' });
    }
    const session = ['Morning', 'Evening'].includes(session_slot) ? session_slot : 'Morning';

    const yearMonthStr = class_date.substring(0, 7);
    const lock = db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(yearMonthStr);
    if (lock) {
      return res.status(400).json({ error: `Payroll for ${yearMonthStr} is locked and cannot be modified.` });
    }

    const assignment = db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(pt_assignment_id);
    if (!assignment) return res.status(404).json({ error: 'PT Assignment not found.' });

    if (assignment.status === 'Completed' || assignment.classes_completed >= assignment.total_classes_snapshot) {
      return res.status(400).json({ error: 'This PT Assignment has already reached its total completed classes.' });
    }
    if (assignment.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot log class for a cancelled assignment.' });
    }
    if (assignment.status === 'Expired') {
      return res.status(400).json({ error: 'Cannot log class for an expired assignment.' });
    }

    const loggingTrainerId = trainer_id || assignment.trainer_id;
    const trainer = db.prepare('SELECT * FROM trainers WHERE id = ?').get(loggingTrainerId);
    if (!trainer) return res.status(404).json({ error: 'Trainer not found.' });
    if (!trainer.grade) {
      return res.status(400).json({ error: 'Logging trainer does not have an assigned grade. Set grade first.' });
    }

    let logId;
    try {
      const result = db.prepare(`
        INSERT INTO pt_class_log (pt_assignment_id, trainer_id, client_id, class_date, session_slot, per_class_rate_snapshot, slab_applied, notes)
        VALUES (?, ?, ?, ?, ?, 0, 'Slab2', ?)
      `).run(pt_assignment_id, loggingTrainerId, assignment.client_id, class_date, session, notes || null);
      logId = result.lastInsertRowid;
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: `A ${session} class has already been logged for this assignment on ${class_date}.` });
      }
      throw e;
    }

    const activeSlab = syncTrainerMonthlyClassLogs(loggingTrainerId, yearMonthStr);

    const newCompletedCount = assignment.classes_completed + 1;
    const newStatus = newCompletedCount >= assignment.total_classes_snapshot ? 'Completed' : 'Active';
    db.prepare(`
      UPDATE pt_assignments SET classes_completed = ?, status = ? WHERE id = ?
    `).run(newCompletedCount, newStatus, pt_assignment_id);

    const createdLog = db.prepare(`
      SELECT l.*, c.name as clientName, t.name as trainerName
      FROM pt_class_log l
      JOIN clients c ON l.client_id = c.id
      JOIN trainers t ON l.trainer_id = t.id
      WHERE l.id = ?
    `).get(logId);

    res.status(201).json(createdLog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-class-log/:id', (req, res) => {
  try {
    const log = db.prepare('SELECT * FROM pt_class_log WHERE id = ?').get(req.params.id);
    if (!log) return res.status(404).json({ error: 'Class log entry not found.' });

    const yearMonthStr = log.class_date.substring(0, 7);
    const lock = db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(yearMonthStr);
    if (lock) {
      return res.status(400).json({ error: `Payroll for ${yearMonthStr} is locked and cannot be modified.` });
    }

    db.prepare('DELETE FROM pt_class_log WHERE id = ?').run(req.params.id);

    const assignment = db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(log.pt_assignment_id);
    if (assignment) {
      const newCompleted = Math.max(0, assignment.classes_completed - 1);
      const newStatus = newCompleted < assignment.total_classes_snapshot && assignment.status === 'Completed' ? 'Active' : assignment.status;
      db.prepare('UPDATE pt_assignments SET classes_completed = ?, status = ? WHERE id = ?').run(newCompleted, newStatus, assignment.id);
    }

    syncTrainerMonthlyClassLogs(log.trainer_id, yearMonthStr);

    res.json({ message: 'Class log deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pt-class-log/history — Query historical class logs for calendar & audit
app.get('/api/pt-class-log/history', (req, res) => {
  try {
    const { month, client_id, trainer_id, pt_assignment_id } = req.query;
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    let sql = `
      SELECT l.*,
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.trainerId as trainerCode, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory,
             a.package_price_snapshot, a.total_classes_snapshot, a.classes_completed,
             a.trainer_id as assigned_trainer_id,
             at.name as assignedTrainerName, at.grade as assignedTrainerGrade
      FROM pt_class_log l
      JOIN pt_assignments a ON l.pt_assignment_id = a.id
      JOIN clients c ON l.client_id = c.id
      JOIN trainers t ON l.trainer_id = t.id
      JOIN trainers at ON a.trainer_id = at.id
      JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE 1=1
    `;

    const params = [];

    if (month && month !== 'undefined') {
      sql += " AND strftime('%Y-%m', l.class_date) = ?";
      params.push(targetMonth);
    }
    if (client_id && client_id !== 'undefined') {
      sql += " AND l.client_id = ?";
      params.push(client_id);
    }
    if (trainer_id && trainer_id !== 'undefined') {
      sql += " AND l.trainer_id = ?";
      params.push(trainer_id);
    }
    if (pt_assignment_id && pt_assignment_id !== 'undefined') {
      sql += " AND l.pt_assignment_id = ?";
      params.push(pt_assignment_id);
    }

    sql += " ORDER BY l.class_date DESC, l.created_at DESC";

    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getMonthlyGymTotalRevenue(targetMonth) {
  let total = 0;
  try {
    const txns = db.prepare('SELECT amount, date FROM transactions').all();
    txns.forEach(t => {
      if (!t.date) return;
      let matches = false;
      if (t.date.startsWith(targetMonth)) {
        matches = true;
      } else {
        const parts = t.date.split('/');
        if (parts.length === 3) {
          const year = parts[2].trim();
          const month = parts[1].trim().padStart(2, '0');
          if (`${year}-${month}` === targetMonth) matches = true;
        }
      }
      if (matches) total += (parseFloat(t.amount) || 0);
    });
  } catch (e) {}

  try {
    const row = db.prepare(`
      SELECT SUM(price_snapshot) as sumVal FROM other_service_sales
      WHERE strftime('%Y-%m', sale_date) = ?
    `).get(targetMonth);
    if (row && row.sumVal) total += parseFloat(row.sumVal);
  } catch (e) {}

  try {
    const row = db.prepare(`
      SELECT SUM(total_price) as sumVal FROM supplement_sales
      WHERE strftime('%Y-%m', sale_date) = ?
    `).get(targetMonth);
    if (row && row.sumVal) total += parseFloat(row.sumVal);
  } catch (e) {}

  return total;
}

// ─── SALARY REPORT & PAYROLL LOCKS Routes ─────────────────────────────────────
app.get('/api/trainer-salary-report', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    const isLockedRow = db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(targetMonth);
    const isLocked = !!isLockedRow;

    const gymTotalRevenue = getMonthlyGymTotalRevenue(targetMonth);
    const isRevenueBelow3Lakhs = gymTotalRevenue < 300000;

    const trainers = db.prepare("SELECT * FROM trainers WHERE status = 'Active' OR id IN (SELECT DISTINCT trainer_id FROM pt_class_log WHERE strftime('%Y-%m', class_date) = ?) ORDER BY name ASC").all(targetMonth);

    const reportData = trainers.map(tr => {
      const baseRevenue = getTrainerMonthlyPtBaseRevenue(tr.id, targetMonth);
      const activeSlab = getSlabForRevenue(baseRevenue);

      const logs = db.prepare(`
        SELECT l.*,
               c.name as clientName, c.clientId as clientCode, c.expiryDate as clientExpiryDate,
               a.assigned_date, a.expiry_date,
               p.name as packageName, a.package_price_snapshot, a.total_classes_snapshot,
               a.trainer_id as assigned_trainer_id,
               at.name as assignedTrainerName, at.grade as assignedTrainerGrade,
               t.name as conductingTrainerName, t.grade as conductingTrainerGrade
        FROM pt_class_log l
        JOIN pt_assignments a ON l.pt_assignment_id = a.id
        JOIN clients c ON l.client_id = c.id
        JOIN trainers t ON l.trainer_id = t.id
        JOIN trainers at ON a.trainer_id = at.id
        JOIN pt_packages p ON a.pt_package_id = p.id
        WHERE l.trainer_id = ? AND strftime('%Y-%m', l.class_date) = ?
        ORDER BY l.class_date DESC
      `).all(tr.id, targetMonth);

      const totalSalary = logs.reduce((sum, item) => sum + (item.per_class_rate_snapshot || 0), 0);

      const hasCustomRate = tr.custom_commission_percent !== null && tr.custom_commission_percent !== undefined && tr.custom_commission_percent !== '';
      const commRatePercent = hasCustomRate
        ? parseFloat(tr.custom_commission_percent)
        : (tr.grade ? (COMMISSION_MATRIX[tr.grade]?.[activeSlab] ? COMMISSION_MATRIX[tr.grade][activeSlab] * 100 : 25) : 0);

      // Fetch payroll adjustment if exists
      const adj = db.prepare('SELECT * FROM trainer_payroll_adjustments WHERE trainer_id = ? AND month = ?').get(tr.id, targetMonth);
      const basicPay = adj ? (adj.basic_pay || 0) : 0;
      const bonus = adj ? (adj.bonus || 0) : 0;
      const bonusNote = adj ? (adj.bonus_note || '') : '';
      const incentiveAmount = adj ? (adj.incentive_amount || 0) : 0;
      const incentiveType = adj ? (adj.incentive_type || 'Add') : 'Add';
      const otherAmount = adj ? (adj.other_amount || 0) : 0;
      const otherType = adj ? (adj.other_type || 'Add') : 'Add';
      const otherLabel = adj ? (adj.other_label || '') : '';

      const signedIncentive = incentiveType === 'Subtract' ? -Math.abs(incentiveAmount) : Math.abs(incentiveAmount);
      const signedOther = otherType === 'Subtract' ? -Math.abs(otherAmount) : Math.abs(otherAmount);

      const totalPayable = totalSalary + basicPay + bonus + signedIncentive + signedOther;

      return {
        trainerId: tr.id,
        trainerCode: tr.trainerId,
        trainerName: tr.name,
        trainerPhone: tr.phone || '',
        grade: tr.grade || 'Unassigned',
        customCommissionPercent: hasCustomRate ? parseFloat(tr.custom_commission_percent) : null,
        isCustomCommission: hasCustomRate,
        classesConducted: logs.length,
        monthlyPtBaseRevenue: baseRevenue,
        slabApplied: activeSlab,
        commissionPercent: commRatePercent,
        totalSalary: totalSalary, // Locked auto-computed PT commission
        commissionSalary: totalSalary,
        basicPay: basicPay,
        bonus: bonus,
        bonusNote: bonusNote,
        incentiveAmount: incentiveAmount,
        incentiveType: incentiveType,
        otherAmount: otherAmount,
        otherType: otherType,
        otherLabel: otherLabel,
        totalPayable: totalPayable,
        classLogs: logs
      };
    });

    res.json({
      month: targetMonth,
      isLocked: isLocked,
      lockedAt: isLockedRow?.locked_at || null,
      gymTotalRevenue: gymTotalRevenue,
      isRevenueBelow3Lakhs: isRevenueBelow3Lakhs,
      trainers: reportData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TRAINER DAILY STATUS (ABSENCE/PRESENT) Routes ─────────────────────────────
app.get('/api/trainer-daily-status', (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const rows = db.prepare('SELECT * FROM trainer_daily_status WHERE status_date = ?').all(targetDate);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trainer-daily-status', (req, res) => {
  try {
    const { trainer_id, status_date, status, marked_by } = req.body;
    if (!trainer_id || !status_date || !status) {
      return res.status(400).json({ error: 'trainer_id, status_date, and status are required.' });
    }
    if (!['Present', 'Absent'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Present or Absent.' });
    }

    db.prepare(`
      INSERT INTO trainer_daily_status (trainer_id, status_date, status, marked_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(trainer_id, status_date) DO UPDATE SET
        status = excluded.status,
        marked_by = excluded.marked_by,
        created_at = CURRENT_TIMESTAMP
    `).run(trainer_id, status_date, status, marked_by || 'Admin');

    const updatedRow = db.prepare('SELECT * FROM trainer_daily_status WHERE trainer_id = ? AND status_date = ?').get(trainer_id, status_date);
    res.json(updatedRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trainer-payroll-adjustments (Superadmin only)
app.post('/api/trainer-payroll-adjustments', (req, res) => {
  try {
    const {
      trainer_id, month, basic_pay, bonus, bonus_note,
      incentive_amount, incentive_type, other_amount, other_type, other_label, user_role
    } = req.body;
    
    // Superadmin Access Control
    if (user_role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin access only.' });
    }

    if (!trainer_id || !month) {
      return res.status(400).json({ error: 'Trainer ID and Month are required.' });
    }

    // Check if month is locked
    const isLocked = db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(month);
    if (isLocked) {
      return res.status(400).json({ error: `Payroll for ${month} is closed and locked. Adjustments cannot be modified.` });
    }

    const bPay = parseFloat(basic_pay) || 0;
    const bBonus = parseFloat(bonus) || 0;
    const iAmt = Math.abs(parseFloat(incentive_amount) || 0);
    const iType = ['Add', 'Subtract'].includes(incentive_type) ? incentive_type : 'Add';
    const oAmt = Math.abs(parseFloat(other_amount) || 0);
    const oType = ['Add', 'Subtract'].includes(other_type) ? other_type : 'Add';
    const oLabel = other_label ? String(other_label).trim() : 'Other Adjustment';

    if (bPay < 0 || bBonus < 0) {
      return res.status(400).json({ error: 'Basic Pay and Bonus must be non-negative (≥ 0).' });
    }

    db.prepare(`
      INSERT INTO trainer_payroll_adjustments (
        trainer_id, month, basic_pay, bonus, bonus_note,
        incentive_amount, incentive_type, other_amount, other_type, other_label, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trainer_id, month) DO UPDATE SET
        basic_pay = excluded.basic_pay,
        bonus = excluded.bonus,
        bonus_note = excluded.bonus_note,
        incentive_amount = excluded.incentive_amount,
        incentive_type = excluded.incentive_type,
        other_amount = excluded.other_amount,
        other_type = excluded.other_type,
        other_label = excluded.other_label,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).run(trainer_id, month, bPay, bBonus, bonus_note || '', iAmt, iType, oAmt, oType, oLabel, 'Superadmin');

    res.json({ success: true, message: 'Payroll adjustments saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send-payslip (Superadmin only)
app.post('/api/whatsapp/send-payslip', async (req, res) => {
  try {
    const {
      phone, trainerName, month, basicPay, bonus, bonusNote,
      incentiveAmount, incentiveType, otherAmount, otherType, otherLabel,
      commissionSalary, totalPayable, pdfBase64, user_role
    } = req.body;

    if (user_role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin access only.' });
    }

    if (!phone) {
      return res.status(400).json({ error: 'Trainer phone number is required to send WhatsApp message.' });
    }

    const incSign = incentiveType === 'Subtract' ? '-' : '+';
    const othSign = otherType === 'Subtract' ? '-' : '+';
    const oLabelText = otherLabel || 'Other Adjustment';

    const caption =
      `Hi ${trainerName || 'Trainer'}! 👋\n\n` +
      `Here is your Payslip breakdown for *${month}*:\n` +
      `• PT Commission Salary: ₹${(commissionSalary || 0).toLocaleString('en-IN')}\n` +
      `• Basic Pay: +₹${(basicPay || 0).toLocaleString('en-IN')}\n` +
      `• Bonus: +₹${(bonus || 0).toLocaleString('en-IN')}${bonusNote ? ` (${bonusNote})` : ''}\n` +
      `• Incentives: ${incSign}₹${(incentiveAmount || 0).toLocaleString('en-IN')}\n` +
      `• ${oLabelText}: ${othSign}₹${(otherAmount || 0).toLocaleString('en-IN')}\n` +
      `---------------------------\n` +
      `*TOTAL PAYABLE: ₹${(totalPayable || 0).toLocaleString('en-IN')}*\n\n` +
      `Please find your detailed PDF payslip attached.\n\n` +
      `*KH3 WELLNESS* 🏋️‍♂️`;

    if (WA_PHONE_ID && WA_TOKEN && pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const filename = `Payslip_${(trainerName || 'Trainer').replace(/\s+/g, '_')}_${month}.pdf`;
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const headerPart = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`,
        'utf8'
      );
      const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      const multipartBody = Buffer.concat([headerPart, pdfBuffer, footerPart]);

      const uploadResp = await fetch(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/media`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WA_TOKEN}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) {
        throw new Error(uploadData?.error?.message || `Media upload failed: ${uploadResp.status}`);
      }
      const mediaId = uploadData.id;

      const toPhone = normalizePhone(phone);
      const msgResp = await fetch(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WA_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'document',
            document: { id: mediaId, filename, caption },
          }),
        }
      );
      const msgData = await msgResp.json();
      if (!msgResp.ok) {
        throw new Error(msgData?.error?.message || `Send failed: ${msgResp.status}`);
      }
    } else {
      await sendWhatsAppMessage(phone, caption);
    }

    db.prepare(
      'INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), '', trainerName || '', phone, 'payslip_pdf');

    res.json({ success: true, message: `Payslip sent successfully to ${phone} via WhatsApp!` });
  } catch (err) {
    console.error('WhatsApp payslip send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payroll-locks', (req, res) => {
  try {
    const { month, locked_by } = req.body;
    if (!month) return res.status(400).json({ error: 'Month is required.' });

    db.prepare(`
      INSERT INTO payroll_locks (month, locked_by)
      VALUES (?, ?)
      ON CONFLICT(month) DO UPDATE SET locked_at = CURRENT_TIMESTAMP, locked_by = excluded.locked_by
    `).run(month, locked_by || null);

    res.json({ success: true, message: `Payroll for ${month} is now locked.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payroll-locks', (req, res) => {
  try {
    const locks = db.prepare('SELECT * FROM payroll_locks ORDER BY month DESC').all();
    res.json(locks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/pt-summary', (req, res) => {
  try {
    const currentMonthStr = new Date().toISOString().substring(0, 7);

    const totalRow = db.prepare(`
      SELECT SUM(per_class_rate_snapshot) as totalPayable
      FROM pt_class_log
      WHERE strftime('%Y-%m', class_date) = ?
    `).get(currentMonthStr);

    const totalPtCommissionPayable = totalRow && totalRow.totalPayable ? totalRow.totalPayable : 0;

    const trainers = db.prepare("SELECT * FROM trainers WHERE status = 'Active'").all();
    const trainerRevenueList = trainers.map(tr => {
      const baseRevenue = getTrainerMonthlyPtBaseRevenue(tr.id, currentMonthStr);
      const activeSlab = getSlabForRevenue(baseRevenue);
      return {
        id: tr.id,
        name: tr.name,
        grade: tr.grade || 'N/A',
        ptRevenue: baseRevenue,
        slab: activeSlab
      };
    });

    res.json({
      currentMonth: currentMonthStr,
      totalPtCommissionPayable,
      trainerRevenueList
    });
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

// ─── EXPENSES Routes ──────────────────────────────────────────────────────────

app.get('/api/expenses', (req, res) => {
  try {
    const expenses = db.prepare('SELECT * FROM expenses ORDER BY timestamp DESC').all();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const { date, name, category, amount, paymentMode, notes } = req.body;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO expenses (id, date, name, category, amount, paymentMode, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, date || toDateLabel(), name, category, amount || 0, paymentMode || 'CASH', notes || '');

    const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPIRED CLIENT RENEWAL Route ─────────────────────────────────────────────
app.post('/api/clients/:id/renew-expired', (req, res) => {
  try {
    const clientId = req.params.id;
    const { planName, price, durationDays, hasGst, gstin, paidAmount, paymentMethod, startDate } = req.body;

    if (!planName || price === undefined || price === null) {
      return res.status(400).json({ error: 'Plan name and price are required.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(clientId, clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    let gstinSnapshot = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinSnapshot = gstin.trim().toUpperCase();
      db.prepare('UPDATE clients SET gstin = ? WHERE id = ?').run(gstinSnapshot, client.id);
    }

    const durDays = parseInt(durationDays, 10) || 30;
    const startStr = startDate || new Date().toISOString().split('T')[0];
    const expiryDateStr = calculateExpiryDate(startStr, durDays);
    const planPrice = parseFloat(price);
    const paidAmountVal = paidAmount !== undefined && paidAmount !== null && paidAmount !== '' ? parseFloat(paidAmount) : planPrice;
    const dueAmountVal = Math.max(0, planPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = paymentMethod || 'CASH';

    // 1. Generate Invoice in bills table using INV-xxxx pattern
    const billRow = db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }

    const billId = randomUUID();
    const invoiceDateStr = toDateLabel();

    const gstSettings = db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const gstCalc = computeGstBreakdown(planPrice, gstSettings.gst_rate_percent || 4.8);

    db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, taxable_value, cgst_amount, sgst_amount, gst_rate_snapshot, client_gstin_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'GeneralPlan', ?, ?, ?, ?, ?)
    `).run(
      billId,
      nextBillNo,
      client.id,
      client.name,
      invoiceDateStr,
      startStr,
      expiryDateStr,
      planPrice,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      planPrice,
      dueAmountVal,
      planName,
      gstCalc.taxable_value,
      gstCalc.cgst_amount,
      gstCalc.sgst_amount,
      gstCalc.gst_rate_snapshot,
      gstinSnapshot
    );

    // 2. Insert transaction record if paidAmountVal > 0
    if (paidAmountVal > 0) {
      const txId = randomUUID();
      db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        client.id,
        billId,
        `${client.name} - ${planName} (Renewal)`,
        payMethodVal,
        paidAmountVal,
        invoiceDateStr
      );
    }

    // 3. Update client fields: status = 'Active', plan = planName, fromDate = startStr, expiryDate = expiryDateStr
    db.prepare(`
      UPDATE clients SET
        plan = ?,
        fromDate = ?,
        expiryDate = ?,
        amount = ?,
        dueAmount = ?,
        paymentStatus = ?,
        status = 'Active'
      WHERE id = ?
    `).run(planName, startStr, expiryDateStr, planPrice, dueAmountVal, paymentStatusVal, client.id);

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id);

    const invoiceBillObj = {
      id: billId,
      billNo: nextBillNo,
      clientId: client.clientId || client.id,
      clientName: client.name,
      mobile: client.phone || '',
      invoiceDate: invoiceDateStr,
      joinDate: startStr,
      expiryDate: expiryDateStr,
      planName: planName,
      packageName: planName,
      planAmount: planPrice,
      totalPlanAmount: planPrice,
      paidAmount: paidAmountVal,
      dueAmount: dueAmountVal,
      remainingBalance: dueAmountVal,
      paymentStatus: paymentStatusVal,
      paymentMethod: payMethodVal
    };

    res.json({
      success: true,
      message: 'Client plan renewed successfully.',
      billNo: nextBillNo,
      client: updatedClient,
      bill: invoiceBillObj
    });
  } catch (err) {
    console.error('Error renewing client plan:', err);
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/other-services/sales/all', (req, res) => {
  try {
    db.prepare('DELETE FROM other_service_sales').run();
    db.prepare("DELETE FROM bills WHERE planName LIKE 'Service:%'").run();
    res.json({ success: true, message: 'All other service sales cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/other-services/sales', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT 
        s.id,
        s.client_id,
        s.service_id,
        s.price_snapshot,
        s.sale_date,
        s.invoice_id,
        s.created_at,
        COALESCE(c.name, b.clientName, 'Unknown Client') AS clientName,
        COALESCE(c.clientId, c.id, s.client_id) AS clientCode,
        COALESCE(c.phone, '') AS clientPhone,
        COALESCE(t.name, 'Other Service') AS serviceName,
        COALESCE(t.duration_days, 30) AS duration_days,
        COALESCE(b.billNo, '') AS billNo,
        COALESCE(b.paidAmount, s.price_snapshot, 0) AS paidAmount,
        COALESCE(b.dueAmount, 0) AS dueAmount,
        COALESCE(b.paymentStatus, 'Paid') AS paymentStatus,
        b.expiryDate
      FROM other_service_sales s
      LEFT JOIN clients c ON (
        CAST(s.client_id AS TEXT) = CAST(c.id AS TEXT)
        OR CAST(s.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      )
      LEFT JOIN other_service_tariffs t ON CAST(s.service_id AS INTEGER) = t.id
      LEFT JOIN bills b ON CAST(s.invoice_id AS TEXT) = CAST(b.id AS TEXT)
      ORDER BY s.id DESC
    `).all();

    res.json(sales);
  } catch (err) {
    console.error('Error fetching other service sales:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/other-services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM other_service_tariffs ORDER BY created_at DESC').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/other-services', (req, res) => {
  try {
    const { name, price, duration_days } = req.body;
    if (!name || price === undefined || price === null || !duration_days) {
      return res.status(400).json({ error: 'Name, price, and duration in days are required.' });
    }

    const result = db.prepare(`
      INSERT INTO other_service_tariffs (name, price, duration_days, is_hidden, active)
      VALUES (?, ?, ?, 0, 1)
    `).run(name.trim(), parseFloat(price), parseInt(duration_days, 10));

    const newService = db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newService);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/other-services/:id', (req, res) => {
  try {
    const { name, price, duration_days } = req.body;
    if (!name || price === undefined || price === null || !duration_days) {
      return res.status(400).json({ error: 'Name, price, and duration in days are required.' });
    }

    db.prepare(`
      UPDATE other_service_tariffs
      SET name = ?, price = ?, duration_days = ?
      WHERE id = ?
    `).run(name.trim(), parseFloat(price), parseInt(duration_days, 10), req.params.id);

    const updated = db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/other-services/:id/hide', (req, res) => {
  try {
    const { is_hidden } = req.body;
    db.prepare('UPDATE other_service_tariffs SET is_hidden = ? WHERE id = ?').run(is_hidden ? 1 : 0, req.params.id);
    res.json({ success: true, is_hidden: !!is_hidden });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/other-services/:id/active', (req, res) => {
  try {
    const { active } = req.body;
    db.prepare('UPDATE other_service_tariffs SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    res.json({ success: true, active: !!active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/other-services/sell', (req, res) => {
  try {
    const { client_id, service_id, sale_date, paid_amount, payment_method, hasGst, gstin } = req.body;
    if (!client_id || !service_id) {
      return res.status(400).json({ error: 'Client and Service tariff selections are required.' });
    }

    const client = db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(client_id, client_id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    let gstinSnapshot = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinSnapshot = gstin.trim().toUpperCase();
      db.prepare('UPDATE clients SET gstin = ? WHERE id = ?').run(gstinSnapshot, client.id || client_id);
    }

    const service = db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(service_id);
    if (!service) return res.status(404).json({ error: 'Service tariff not found.' });

    const saleDateStr = sale_date || new Date().toISOString().split('T')[0];
    const priceSnapshot = service.price;
    const paidAmountVal = paid_amount !== undefined && paid_amount !== null && paid_amount !== '' ? parseFloat(paid_amount) : priceSnapshot;
    const dueAmountVal = Math.max(0, priceSnapshot - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = payment_method || 'UPI';

    // 1. Generate Invoice in bills using INV-xxxx
    const billRow = db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }

    const billId = randomUUID();
    const invoiceDateStr = toDateLabel();
    const expiryDateStr = calculateExpiryDate(saleDateStr, service.duration_days);

    db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, client_gstin_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OtherService', ?)
    `).run(
      billId,
      nextBillNo,
      client.id || client_id,
      client.name,
      invoiceDateStr,
      saleDateStr,
      expiryDateStr,
      priceSnapshot,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      0,
      priceSnapshot,
      dueAmountVal,
      `Service: ${service.name}`,
      gstinSnapshot
    );

    // Create transaction record if paidAmountVal > 0 so Dashboard & Transactions reflect it immediately
    if (paidAmountVal > 0) {
      const txId = randomUUID();
      db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        client.id || client_id,
        billId,
        `${client.name} - ${service.name}`,
        payMethodVal,
        paidAmountVal,
        invoiceDateStr
      );
    }

    // Update client due amount if there is any due
    if (dueAmountVal > 0) {
      const currentDue = client.dueAmount || 0;
      const updatedDue = currentDue + dueAmountVal;
      db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(updatedDue, 'Due', client.id || client_id);
    }

    // 2. Insert into other_service_sales
    const result = db.prepare(`
      INSERT INTO other_service_sales (client_id, service_id, price_snapshot, sale_date, invoice_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(client.id || client_id), service.id, priceSnapshot, saleDateStr, billId);

    const saleRecord = db.prepare(`
      SELECT s.*, c.name as clientName, t.name as serviceName
      FROM other_service_sales s
      LEFT JOIN clients c ON (s.client_id = c.id OR s.client_id = c.clientId)
      LEFT JOIN other_service_tariffs t ON s.service_id = t.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    // Bill object ready for InvoicePreviewModal
    const invoiceBillObj = {
      id: billId,
      billNo: nextBillNo,
      clientId: client.clientId || client.id || client_id,
      clientName: client.name,
      mobile: client.phone || client.mobile || '',
      invoiceDate: invoiceDateStr,
      joinDate: saleDateStr,
      expiryDate: expiryDateStr,
      planName: `Service: ${service.name}`,
      packageName: `Service: ${service.name}`,
      planAmount: priceSnapshot,
      totalPlanAmount: priceSnapshot,
      paidAmount: paidAmountVal,
      dueAmount: dueAmountVal,
      remainingBalance: dueAmountVal,
      paymentStatus: paymentStatusVal
    };

    res.status(201).json({
      success: true,
      message: 'Service sold successfully.',
      sale: saleRecord,
      billNo: nextBillNo,
      bill: invoiceBillObj
    });
  } catch (err) {
    console.error("Error selling other service:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS Route ──────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toLocaleDateString('en-GB', { month: 'short' });
    const monthMapping = {
      "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
      "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
      "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
    };
    const mm = monthMapping[targetMonth] || targetMonth;
    const currentYear = new Date().getFullYear();
    const dateSearch = `/${mm}/${currentYear}`;

    const allTxns = db.prepare('SELECT * FROM transactions').all();
    const otherServiceSalesAll = db.prepare('SELECT * FROM other_service_sales').all();
    const totalOtherServiceRevenue = otherServiceSalesAll.reduce((sum, s) => sum + (s.price_snapshot || 0), 0);

    const totalRevenueVal = allTxns.reduce((sum, t) => sum + (t.amount || 0), 0) + totalOtherServiceRevenue;
    
    const monthlyOtherServiceRevenue = db.prepare(`
      SELECT SUM(price_snapshot) as total FROM other_service_sales
      WHERE strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?
    `).get(mm, String(currentYear))?.total || 0;

    const monthlyCollectionVal = allTxns
      .filter(t => t.date && t.date.includes(dateSearch))
      .reduce((sum, t) => sum + (t.amount || 0), 0) + monthlyOtherServiceRevenue;

    const allExpenses = db.prepare('SELECT * FROM expenses').all();
    const monthlyExpensesVal = allExpenses
      .filter(e => e.date && e.date.includes(dateSearch))
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const netProfitVal = monthlyCollectionVal - monthlyExpensesVal;

    const todayStr = new Date().toISOString().split('T')[0];
    const activeCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE status = 'Active' OR expiryDate >= ?"
    ).get(todayStr).cnt;

    const expiredCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE status = 'Expired' OR (expiryDate IS NOT NULL AND expiryDate < ?)"
    ).get(todayStr).cnt;

    const expiredPTCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE ptToDate < ? AND ptCategory != 'None'"
    ).get(todayStr).cnt;

    const inactivePtCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM pt_assignments WHERE status IN ('Expired', 'Cancelled')"
    ).get().cnt;

    // --- New Metrics ---
    const newClientsMonthCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE admissionDate LIKE ?"
    ).get(`%-${mm}-%`).cnt;

    const monthlySalesVal = db.prepare(
      "SELECT SUM(amount) as total FROM clients WHERE admissionDate LIKE ?"
    ).get(`%-${mm}-%`).total || 0;

    const monthlyTxnsCount = allTxns.filter(t => t.date && t.date.includes(dateSearch)).length;
    const renewalsMonthCount = Math.max(0, monthlyTxnsCount - newClientsMonthCount);

    const generalAdvanceCount = db.prepare("SELECT COUNT(*) as cnt FROM general_package_bookings WHERE status = 'Scheduled'").get().cnt;
    const ptAdvanceCount = db.prepare("SELECT COUNT(*) as cnt FROM pt_advance_bookings WHERE status IN ('Scheduled', 'ReadyToActivate')").get().cnt;
    const inactiveCount = db.prepare("SELECT COUNT(*) as cnt FROM clients WHERE status = 'inactive' OR status = 'Expired' OR (expiryDate IS NOT NULL AND expiryDate < ?)").get(todayStr).cnt;

    const monthlyOtherServiceSalesCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM other_service_sales
      WHERE strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?
    `).get(mm, String(currentYear))?.cnt || 0;

    const recentTxns = allTxns.slice(0, 5);

    res.json({
      totalRevenue: totalRevenueVal,
      monthlySales: monthlySalesVal,
      monthlyCollection: monthlyCollectionVal,
      monthlyExpenses: monthlyExpensesVal,
      netProfit: netProfitVal,
      otherServicesRevenue: monthlyOtherServiceRevenue,
      otherServicesSalesCount: monthlyOtherServiceSalesCount,
      activeClients: activeCount,
      inactiveClients: inactiveCount,
      expiredClients: expiredCount,
      inactivePt: inactivePtCount,
      expiredPlans: expiredCount,
      expiredPTPlans: expiredPTCount,
      generalAdvanceBookings: generalAdvanceCount,
      ptAdvanceBookings: ptAdvanceCount,
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
      const parts = txn.date.split('/');
      if (parts.length === 3) {
        const mm = parseInt(parts[1], 10);
        if (mm >= 1 && mm <= 12) {
          revenueByMonth[mm - 1].revenue += txn.amount || 0;
        }
      } else {
        // Fallback if older format like "03 May 2026"
        const sparts = txn.date.split(' ');
        if (sparts.length >= 2) {
          const monthName = sparts[1];
          const monthObj = revenueByMonth.find(r => r.month === monthName);
          if (monthObj) monthObj.revenue += txn.amount || 0;
        }
      }
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
    const { username, role, password } = req.body;
    const identifier = username || role;
    
    // 1. Try matching by (username or role) AND password
    let user = db.prepare('SELECT id, role FROM users WHERE (username = ? OR role = ?) AND password = ?').get(identifier, identifier, password);

    // 2. Fallback: match by password alone if identifier is generic
    if (!user && password) {
      user = db.prepare('SELECT id, role FROM users WHERE password = ?').get(password);
    }

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
    const in7DaysISO = getDateOffsetISO(7);

    // Clients expiring within 1-7 days
    const expiringSoon = db.prepare(`
      SELECT id, clientId, name, phone, plan, expiryDate
      FROM clients
      WHERE date(expiryDate) BETWEEN date(?) AND date(?)
        AND phone IS NOT NULL AND phone != ''
      ORDER BY date(expiryDate) ASC
    `).all(getDateOffsetISO(1), in7DaysISO);

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
      ? buildExpiringSoonMsg({ ...client, plan: client.plan || 'Membership', expiryDate: client.expiryDate || getDateOffsetISO(7) })
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

// POST /api/whatsapp/send-invoice — Send PDF invoice directly to client via WhatsApp Cloud API
app.post('/api/whatsapp/send-invoice', async (req, res) => {
  try {
    if (!WA_TOKEN || !WA_PHONE_ID) {
      return res.status(400).json({ error: 'WhatsApp not configured. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to server/.env' });
    }

    const { phone, name, billNo, pdfBase64 } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    if (!pdfBase64) return res.status(400).json({ error: 'PDF data is required' });

    const filename = `Invoice_${billNo || 'invoice'}.pdf`;
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // ── 1. Upload PDF to WhatsApp Media ──────────────────────────────────────
    const boundary = `WAboundary${Date.now()}`;

    // Build multipart body using Buffer concat (needed for binary PDF data)
    const headerPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="messaging_product"\r\n\r\n` +
      `whatsapp\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="type"\r\n\r\n` +
      `application/pdf\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`,
      'utf8'
    );
    const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const multipartBody = Buffer.concat([headerPart, pdfBuffer, footerPart]);

    const uploadResp = await fetch(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );
    const uploadData = await uploadResp.json();
    if (!uploadResp.ok) {
      throw new Error(uploadData?.error?.message || `Media upload failed: ${uploadResp.status}`);
    }
    const mediaId = uploadData.id;

    // ── 2. Send document message ───────────────────────────────────────────
    const toPhone = normalizePhone(phone);
    const caption =
      `Hi ${name || 'there'}! 👋\n\n` +
      `Please find your invoice *${billNo || ''}* attached.\n\n` +
      `Thank you for your payment! 💪\n\n` +
      `*KH3 WELLNESS* 🏋️‍♂️`;

    const msgResp = await fetch(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'document',
          document: {
            id: mediaId,
            filename,
            caption,
          },
        }),
      }
    );
    const msgData = await msgResp.json();
    if (!msgResp.ok) {
      throw new Error(msgData?.error?.message || `Send failed: ${msgResp.status}`);
    }

    // Log it
    db.prepare(
      'INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), '', name || '', phone, 'invoice_pdf');

    res.json({ success: true, message: `Invoice sent to ${toPhone} via WhatsApp!` });
  } catch (err) {
    console.error('WhatsApp invoice send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/whatsapp/send-payment-reminder
app.post('/api/whatsapp/send-payment-reminder', async (req, res) => {
  try {
    const { clientId } = req.body;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client || !client.phone) return res.status(400).json({ error: 'Client not found or phone missing' });

    if (client.dueAmount <= 0) return res.status(400).json({ error: 'No pending due amount' });

    const message = buildPaymentReminderMsg(client);
    await sendWhatsAppMessage(client.phone, message);

    db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), client.id, client.name, client.phone, 'payment_reminder');

    res.json({ success: true, message: 'Payment reminder sent!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send-bulk — Auto-send to all qualifying clients
app.post('/api/whatsapp/send-bulk', async (req, res) => {
  try {
    const { type } = req.body; // 'expiring_soon' | 'expired'
    const todayISO = getDateOffsetISO(0);
    const in7DaysISO = getDateOffsetISO(7);

    let clients;
    if (type === 'expiring_soon') {
      clients = db.prepare(`
        SELECT id, clientId, name, phone, plan, expiryDate FROM clients
        WHERE date(expiryDate) BETWEEN date(?) AND date(?)
          AND phone IS NOT NULL AND phone != ''
      `).all(getDateOffsetISO(1), in7DaysISO);
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

// ─── Inquiry API Routes ──────────────────────────────────────────────────────
app.get('/api/inquiries', (req, res) => {
  try {
    const inquiries = db.prepare('SELECT * FROM inquiries ORDER BY timestamp DESC').all();
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MUST be before /:id routes
app.get('/api/inquiries/next-id', (req, res) => {
  try {
    const row = db.prepare('SELECT InquiryId FROM inquiries ORDER BY timestamp DESC LIMIT 1').get();
    let nextId = 'INQ001';
    if (row && row.InquiryId) {
      const match = row.InquiryId.match(/INQ(\d+)/);
      if (match) {
        nextId = `INQ${String(parseInt(match[1], 10) + 1).padStart(3, '0')}`;
      }
    }
    res.json({ nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MUST be before /:id routes
app.get('/api/inquiries/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stats = {
      total: db.prepare('SELECT COUNT(*) as cnt FROM inquiries').get().cnt,
      today: db.prepare('SELECT COUNT(*) as cnt FROM inquiries WHERE InquiryDate = ?').get(today).cnt,
      interested: db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Interested'").get().cnt,
      joined: db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Joined'").get().cnt,
      pending: db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Follow Up Pending'").get().cnt,
      notInterested: db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Not Interested'").get().cnt,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries', (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO inquiries (
        id, InquiryId, name, phone, age, gender, goal, plan, trainerRequired, InquiryDate, status, nextFollowUp,
        marriedStatus, occupation, company, address, email, height, weight, bmi, lbm, fat,
        referredBy, lookingFor, enquiredBy, messaged, tariffDiscussed, reminderCall, call1, call2, call3
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.InquiryId, data.name, data.phone, data.age, data.gender, data.goal, data.plan, data.trainerRequired, data.InquiryDate, data.status, data.nextFollowUp,
      data.marriedStatus, data.occupation, data.company, data.address, data.email, data.height, data.weight, data.bmi, data.lbm, data.fat,
      data.referredBy, data.lookingFor, data.enquiredBy, data.messaged, data.tariffDiscussed, data.reminderCall, data.call1, data.call2, data.call3
    );
    res.status(201).json({ id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inquiries/:id', (req, res) => {
  try {
    const data = req.body;
    db.prepare(`
      UPDATE inquiries SET
        name = COALESCE(?, name), phone = COALESCE(?, phone), age = COALESCE(?, age), gender = COALESCE(?, gender), goal = COALESCE(?, goal), 
        plan = COALESCE(?, plan), trainerRequired = COALESCE(?, trainerRequired), InquiryDate = COALESCE(?, InquiryDate), 
        status = COALESCE(?, status), nextFollowUp = COALESCE(?, nextFollowUp),
        marriedStatus = COALESCE(?, marriedStatus), occupation = COALESCE(?, occupation), company = COALESCE(?, company), 
        address = COALESCE(?, address), email = COALESCE(?, email), height = COALESCE(?, height), weight = COALESCE(?, weight), 
        bmi = COALESCE(?, bmi), lbm = COALESCE(?, lbm), fat = COALESCE(?, fat), referredBy = COALESCE(?, referredBy), 
        lookingFor = COALESCE(?, lookingFor), enquiredBy = COALESCE(?, enquiredBy), messaged = COALESCE(?, messaged), 
        tariffDiscussed = COALESCE(?, tariffDiscussed), reminderCall = COALESCE(?, reminderCall), 
        call1 = COALESCE(?, call1), call2 = COALESCE(?, call2), call3 = COALESCE(?, call3)
      WHERE id = ?
    `).run(
      data.name, data.phone, data.age, data.gender, data.goal, data.plan, data.trainerRequired, data.InquiryDate, data.status, data.nextFollowUp,
      data.marriedStatus, data.occupation, data.company, data.address, data.email, data.height, data.weight, data.bmi, data.lbm, data.fat,
      data.referredBy, data.lookingFor, data.enquiredBy, data.messaged, data.tariffDiscussed, data.reminderCall, data.call1, data.call2, data.call3,
      req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inquiries/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inquiries/:id/followups', (req, res) => {
  try {
    const followups = db.prepare('SELECT * FROM follow_ups WHERE InquiryId = ? ORDER BY timestamp DESC').all(req.params.id);
    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries/:id/followups', (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO follow_ups (id, InquiryId, date, notes, clientResponse, nextDate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.date, data.notes, data.clientResponse, data.nextDate, data.status);

    // Also update the main Inquiry status and next follow-up date
    db.prepare('UPDATE inquiries SET status = ?, nextFollowUp = ? WHERE id = ?').run(data.status, data.nextDate, req.params.id);

    res.status(201).json({ id, ...data });
  } catch (err) {
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

// ─── Daily Cron: 9:00 AM — Auto-send WhatsApp reminders & Sweep Expired PT Assignments ─
cron.schedule('0 9 * * *', async () => {
  autoExpireAssignments();
  autoActivateAdvanceBookings();
  if (!WA_PHONE_ID || !WA_TOKEN) {
    console.log('⚠️ [WhatsApp Cron] Skipped — WHATSAPP_PHONE_NUMBER_ID not set in .env');
    return;
  }

  const todayISO = getDateOffsetISO(0);
  const in7DaysISO = getDateOffsetISO(7);
  const in3DaysISO = getDateOffsetISO(3);
  console.log(`📲 [WhatsApp Cron] Running at ${new Date().toLocaleString('en-IN')}`);

  // Send expiring-soon reminders (7 days and 3 days before)
  const soonClients = db.prepare(`
    SELECT id, clientId, name, phone, plan, expiryDate FROM clients
    WHERE (date(expiryDate) = date(?) OR date(expiryDate) = date(?)) AND phone IS NOT NULL AND phone != ''
  `).all(in7DaysISO, in3DaysISO);

  for (const client of soonClients) {
    try {
      await sendWhatsAppMessage(client.phone, buildExpiringSoonMsg(client));
      db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
      ).run(randomUUID(), client.id, client.name, client.phone, 'expiring_soon');
      console.log(`   ✅ Reminder sent → ${client.name} (expires in 7 or 3 days)`);
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

// ─── STAFF Routes ────────────────────────────────────────────────────────────

// GET all staff
app.get('/api/staff', (req, res) => {
  try {
    const staff = db.prepare('SELECT * FROM staff ORDER BY dateAdded DESC').all();
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create staff
app.post('/api/staff', (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO staff (
        id, name, fathersName, mothersName, spouseName, dob, gender, maritalStatus,
        nationality, religion, community, languageRead, languageWrite, languageSpeak,
        education, itKnowledge, homeContact1, homeContact2, contactNumber, date, place
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name || '', data.fathersName || '', data.mothersName || '', data.spouseName || '',
      data.dob || '', data.gender || '', data.maritalStatus || '', data.nationality || '',
      data.religion || '', data.community || '', data.languageRead || '', data.languageWrite || '',
      data.languageSpeak || '', typeof data.education === 'string' ? data.education : JSON.stringify(data.education),
      data.itKnowledge || '', data.homeContact1 || '', data.homeContact2 || '', data.contactNumber || '',
      data.date || '', data.place || ''
    );
    res.status(201).json({ id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single staff
app.get('/api/staff/:id', (req, res) => {
  try {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update staff
app.put('/api/staff/:id', (req, res) => {
  try {
    const data = req.body;
    db.prepare(`
      UPDATE staff SET
        name = ?, fathersName = ?, mothersName = ?, spouseName = ?, dob = ?, gender = ?, maritalStatus = ?,
        nationality = ?, religion = ?, community = ?, languageRead = ?, languageWrite = ?, languageSpeak = ?,
        education = ?, itKnowledge = ?, homeContact1 = ?, homeContact2 = ?, contactNumber = ?, date = ?, place = ?
      WHERE id = ?
    `).run(
      data.name || '', data.fathersName || '', data.mothersName || '', data.spouseName || '',
      data.dob || '', data.gender || '', data.maritalStatus || '', data.nationality || '',
      data.religion || '', data.community || '', data.languageRead || '', data.languageWrite || '',
      data.languageSpeak || '', typeof data.education === 'string' ? data.education : JSON.stringify(data.education),
      data.itKnowledge || '', data.homeContact1 || '', data.homeContact2 || '', data.contactNumber || '',
      data.date || '', data.place || '', req.params.id
    );
    res.json({ message: 'Staff updated successfully', ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE staff
app.delete('/api/staff/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
    res.json({ message: 'Staff deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLIENT MEASUREMENTS Routes ──────────────────────────────────────────────

// GET measurements for a specific client
app.get('/api/clients/:clientId/measurements', (req, res) => {
  try {
    const measurements = db.prepare(`
      SELECT * FROM client_measurements 
      WHERE clientId = ? 
      ORDER BY date DESC, timestamp DESC
    `).all(req.params.clientId);
    res.json(measurements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add measurement for a client
app.post('/api/clients/:clientId/measurements', (req, res) => {
  try {
    const { clientId } = req.params;
    const {
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
    } = req.body;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO client_measurements (
        id, clientId, date, height, weight, bmi, lbm, fat,
        chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, clientId, date || toDateLabel(), height || null, weight || null, bmi || '', lbm || null, fat || null,
      chest_inspiration || null, chest_expiration || null, abs || null, waist || null, hip || null, thigh || null, calf || null, arm || null, forearm || null, hip_waist_ratio || null
    );

    const newMeasurement = db.prepare('SELECT * FROM client_measurements WHERE id = ?').get(id);
    res.status(201).json(newMeasurement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update a measurement
app.put('/api/clients/:clientId/measurements/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
    } = req.body;

    db.prepare(`
      UPDATE client_measurements SET
        date = ?, height = ?, weight = ?, bmi = ?, lbm = ?, fat = ?,
        chest_inspiration = ?, chest_expiration = ?, abs = ?, waist = ?, hip = ?, thigh = ?, calf = ?, arm = ?, forearm = ?, hip_waist_ratio = ?
      WHERE id = ?
    `).run(
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio,
      id
    );

    const updated = db.prepare('SELECT * FROM client_measurements WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a measurement
app.delete('/api/clients/:clientId/measurements/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM client_measurements WHERE id = ?').run(req.params.id);
    res.json({ message: 'Measurement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DYNAMIC DASHBOARD STATS ROUTE ───────────────────────────────────────────

const parseAnyDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  const str = String(dateStr).trim();
  if (!str) return null;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day);
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return new Date(year, month, day);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

app.get('/api/dashboard/dynamic-stats', (req, res) => {
  try {
    const { topDate, financialStartDate, financialEndDate } = req.query;

    const refDateObj = parseAnyDate(topDate) || new Date();
    refDateObj.setHours(0, 0, 0, 0);

    const startDateObj = parseAnyDate(financialStartDate) || new Date(refDateObj.getFullYear(), refDateObj.getMonth(), 1);
    startDateObj.setHours(0, 0, 0, 0);

    const endDateObj = parseAnyDate(financialEndDate) || new Date();
    endDateObj.setHours(23, 59, 59, 999);

    // Fetch all clients, transactions, bills, expenses
    const clients = db.prepare('SELECT * FROM clients').all();
    const transactions = db.prepare('SELECT * FROM transactions').all();
    const bills = db.prepare('SELECT * FROM bills').all();
    const expenses = db.prepare('SELECT * FROM expenses').all();

    let genActive = 0, genExp = 0;
    let kidsActive = 0, kidsExp = 0;
    let otherActive = 0, otherExp = 0;
    let ptActive = 0, ptExp = 0;
    let pendingClientsCount = 0;
    let inactiveClientsCount = 0;

    clients.forEach(c => {
      const statusLower = (c.status || '').toLowerCase().trim();
      const planStr = (c.plan || '').toLowerCase();
      const programTypeLower = (c.programType || '').toLowerCase();
      const categoryLower = (c.category || '').toLowerCase();

      const expDate = parseAnyDate(c.expiryDate);
      if (expDate) expDate.setHours(0, 0, 0, 0);

      const isExpired = expDate ? (expDate < refDateObj) : false;
      const isExpiringSoon = expDate ? (expDate >= refDateObj && (expDate - refDateObj) / (1000 * 3600 * 24) <= 7) : false;
      
      const isExplicitInactive = statusLower === 'inactive' || statusLower === 'expired';
      const isActiveStatus = !isExplicitInactive && !isExpired;

      // Pending dues
      if ((c.dueAmount || 0) > 0) {
        pendingClientsCount++;
      }

      // Inactive clients
      if (isExplicitInactive || isExpired) {
        inactiveClientsCount++;
      }

      // Plan classification checks (non-exclusive where appropriate)
      const isKid = planStr.includes('kid') || programTypeLower === 'kid' || categoryLower === 'kid';
      const isOther = planStr.includes('diet') || planStr.includes('other');
      const isPT = Boolean(c.personalTraining) || planStr.includes('pt') || (c.ptPackage && String(c.ptPackage).trim() !== '');
      const isGeneral = !isKid && !isOther; // Regular membership plans belong to General Plan

      const isExpOrPending = isExpired || isExpiringSoon || (c.dueAmount || 0) > 0;

      if (isGeneral) {
        if (isActiveStatus) genActive++;
        if (isExpOrPending) genExp++;
      }
      if (isKid) {
        if (isActiveStatus) kidsActive++;
        if (isExpOrPending) kidsExp++;
      }
      if (isOther) {
        if (isActiveStatus) otherActive++;
        if (isExpOrPending) otherExp++;
      }
      if (isPT) {
        if (isActiveStatus) ptActive++;
        if (isExpOrPending) ptExp++;
      }
    });

    // Receipts: Sum transactions in range
    const receiptsTotal = transactions.reduce((sum, t) => {
      const tDate = parseAnyDate(t.date || t.timestamp);
      if (tDate && tDate >= startDateObj && tDate <= endDateObj) {
        return sum + (t.amount || 0);
      }
      return sum;
    }, 0);

    // Payments: Sum bills paidAmount in range
    const paymentsTotal = bills.reduce((sum, b) => {
      const bDate = parseAnyDate(b.invoiceDate || b.timestamp);
      if (bDate && bDate >= startDateObj && bDate <= endDateObj) {
        return sum + (b.paidAmount || 0);
      }
      return sum;
    }, 0);

    // Expenses: Sum expenses amount in range
    const expensesTotal = expenses.reduce((sum, e) => {
      const eDate = parseAnyDate(e.date || e.timestamp);
      if (eDate && eDate >= startDateObj && eDate <= endDateObj) {
        return sum + (e.amount || 0);
      }
      return sum;
    }, 0);

    res.json({
      generalPlan: { active: genActive, expiring: genExp },
      kidsFit: { active: kidsActive, expiring: kidsExp },
      otherServices: { active: otherActive, expiring: otherExp },
      personalTraining: { active: ptActive, expiring: ptExp },
      pendingClients: pendingClientsCount,
      inactiveClients: inactiveClientsCount,
      financials: {
        receipts: receiptsTotal,
        payments: paymentsTotal,
        expenses: expensesTotal
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Middleware: SuperAdmin ONLY Access for Supplements ───────────────────────
const requireSuperAdmin = (req, res, next) => {
  const role = req.headers['x-user-role'];
  if (role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied: Master/SuperAdmin privileges required' });
  }
  next();
};

// Apply requireSuperAdmin to all /api/supplements routes
app.use('/api/supplements', requireSuperAdmin);

// ─── CATALOG ENDPOINTS ────────────────────────────────────────────────────────

app.get('/api/supplements', (req, res) => {
  try {
    const { activeOnly } = req.query;
    let query = 'SELECT * FROM supplements';
    if (activeOnly === 'true') {
      query += ' WHERE active = 1';
    }
    query += ' ORDER BY name ASC';
    const supplements = db.prepare(query).all();
    res.json(supplements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements', (req, res) => {
  try {
    const { name, brand, category, unit, low_stock_threshold, default_sale_price } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplement name is required' });
    }

    const threshold = low_stock_threshold !== undefined && low_stock_threshold !== '' ? parseInt(low_stock_threshold, 10) : 5;
    const salePrice = default_sale_price !== undefined && default_sale_price !== '' ? parseFloat(default_sale_price) : null;

    const result = db.prepare(`
      INSERT INTO supplements (name, brand, category, unit, low_stock_threshold, default_sale_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name.trim(), brand ? brand.trim() : '', category || 'Other', unit ? unit.trim() : 'pack', threshold, salePrice);

    const newSupplement = db.prepare('SELECT * FROM supplements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newSupplement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/supplements/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, category, unit, low_stock_threshold, default_sale_price, active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplement name is required' });
    }

    const threshold = low_stock_threshold !== undefined && low_stock_threshold !== '' ? parseInt(low_stock_threshold, 10) : 5;
    const salePrice = default_sale_price !== undefined && default_sale_price !== '' ? parseFloat(default_sale_price) : null;
    const isActive = active !== undefined ? (active ? 1 : 0) : 1;

    db.prepare(`
      UPDATE supplements
      SET name = ?, brand = ?, category = ?, unit = ?, low_stock_threshold = ?, default_sale_price = ?, active = ?
      WHERE id = ?
    `).run(name.trim(), brand ? brand.trim() : '', category || 'Other', unit ? unit.trim() : 'pack', threshold, salePrice, isActive, id);

    const updated = db.prepare('SELECT * FROM supplements WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/supplements/:id/toggle-active', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT active FROM supplements WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Supplement not found' });

    const newActive = item.active === 1 ? 0 : 1;
    db.prepare('UPDATE supplements SET active = ? WHERE id = ?').run(newActive, id);
    res.json({ success: true, active: newActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PURCHASE LOG ENDPOINTS ───────────────────────────────────────────────────

app.get('/api/supplements/purchases', (req, res) => {
  try {
    const { startDate, endDate, supplementId, searchVendor } = req.query;
    let query = `
      SELECT p.*, s.name as supplement_name, s.brand as supplement_brand, s.unit as supplement_unit
      FROM supplement_purchases p
      JOIN supplements s ON p.supplement_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND p.purchase_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND p.purchase_date <= ?';
      params.push(endDate);
    }
    if (supplementId) {
      query += ' AND p.supplement_id = ?';
      params.push(supplementId);
    }
    if (searchVendor) {
      query += ' AND p.vendor_name LIKE ?';
      params.push(`%${searchVendor}%`);
    }

    query += ' ORDER BY p.purchase_date DESC, p.created_at DESC';
    const purchases = db.prepare(query).all(...params);
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements/purchases', (req, res) => {
  try {
    const { supplement_id, vendor_name, quantity, purchase_price_per_unit, purchase_date, invoice_ref, notes, created_by } = req.body;

    if (!supplement_id || !vendor_name || !vendor_name.trim() || !quantity || !purchase_price_per_unit || !purchase_date) {
      return res.status(400).json({ error: 'Missing required purchase fields (supplement, vendor, quantity, price, date)' });
    }

    const qty = parseInt(quantity, 10);
    const pricePerUnit = parseFloat(purchase_price_per_unit);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
      return res.status(400).json({ error: 'Purchase price per unit must be greater than 0' });
    }

    const totalCost = Math.round(qty * pricePerUnit * 100) / 100;

    const executePurchaseTransaction = db.transaction(() => {
      const supp = db.prepare('SELECT id FROM supplements WHERE id = ?').get(supplement_id);
      if (!supp) {
        throw new Error('Selected supplement does not exist');
      }

      const insertStmt = db.prepare(`
        INSERT INTO supplement_purchases (
          supplement_id, vendor_name, quantity, purchase_price_per_unit, total_cost, purchase_date, invoice_ref, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(
        supplement_id, vendor_name.trim(), qty, pricePerUnit, totalCost, purchase_date, invoice_ref ? invoice_ref.trim() : null, notes ? notes.trim() : null, created_by || null
      );

      db.prepare(`
        UPDATE supplements
        SET current_stock = current_stock + ?, default_purchase_price = ?
        WHERE id = ?
      `).run(qty, pricePerUnit, supplement_id);

      return result.lastInsertRowid;
    });

    const newPurchaseId = executePurchaseTransaction();
    const newPurchase = db.prepare(`
      SELECT p.*, s.name as supplement_name, s.unit as supplement_unit
      FROM supplement_purchases p
      JOIN supplements s ON p.supplement_id = s.id
      WHERE p.id = ?
    `).get(newPurchaseId);

    res.status(201).json(newPurchase);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── SALE LOG ENDPOINTS ───────────────────────────────────────────────────────

app.get('/api/supplements/sales', (req, res) => {
  try {
    const { startDate, endDate, supplementId, buyerType } = req.query;
    let query = `
      SELECT s.*, sup.name as supplement_name, sup.brand as supplement_brand, sup.unit as supplement_unit, c.name as client_name
      FROM supplement_sales s
      JOIN supplements sup ON s.supplement_id = sup.id
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND s.sale_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND s.sale_date <= ?';
      params.push(endDate);
    }
    if (supplementId) {
      query += ' AND s.supplement_id = ?';
      params.push(supplementId);
    }
    if (buyerType === 'client') {
      query += ' AND s.client_id IS NOT NULL';
    } else if (buyerType === 'walkin') {
      query += ' AND s.walkin_name IS NOT NULL';
    }

    query += ' ORDER BY s.sale_date DESC, s.created_at DESC';
    const sales = db.prepare(query).all(...params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements/sales', (req, res) => {
  try {
    const {
      supplement_id, client_id, walkin_name, walkin_phone, quantity,
      sale_price_per_unit, payment_mode, sale_date, created_by
    } = req.body;

    if (!supplement_id || !quantity || !sale_price_per_unit || !payment_mode || !sale_date) {
      return res.status(400).json({ error: 'Missing required sale fields' });
    }

    const hasClient = client_id && String(client_id).trim() !== '';
    const hasWalkin = walkin_name && String(walkin_name).trim() !== '';

    if ((hasClient && hasWalkin) || (!hasClient && !hasWalkin)) {
      return res.status(400).json({ error: 'Sale must specify either a Client or a Walk-in buyer name (not both, not neither)' });
    }

    const qty = parseInt(quantity, 10);
    const salePrice = parseFloat(sale_price_per_unit);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    if (isNaN(salePrice) || salePrice <= 0) {
      return res.status(400).json({ error: 'Sale price per unit must be greater than 0' });
    }

    const validPaymentModes = ['Cash', 'UPI', 'Card', 'Other'];
    if (!validPaymentModes.includes(payment_mode)) {
      return res.status(400).json({ error: `Invalid payment mode. Must be one of: ${validPaymentModes.join(', ')}` });
    }

    const totalAmount = Math.round(qty * salePrice * 100) / 100;

    const executeSaleTransaction = db.transaction(() => {
      const supplement = db.prepare('SELECT current_stock, default_purchase_price FROM supplements WHERE id = ?').get(supplement_id);
      if (!supplement) {
        throw new Error('Selected supplement does not exist');
      }

      if (supplement.current_stock < qty) {
        throw new Error(`Insufficient stock — only ${supplement.current_stock} units available`);
      }

      const costPriceSnapshot = supplement.default_purchase_price !== null && supplement.default_purchase_price !== undefined
        ? supplement.default_purchase_price
        : 0;

      const result = db.prepare(`
        INSERT INTO supplement_sales (
          supplement_id, client_id, walkin_name, walkin_phone, quantity,
          sale_price_per_unit, total_amount, cost_price_snapshot, payment_mode, sale_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        supplement_id,
        hasClient ? String(client_id).trim() : null,
        hasWalkin ? String(walkin_name).trim() : null,
        walkin_phone ? String(walkin_phone).trim() : null,
        qty,
        salePrice,
        totalAmount,
        costPriceSnapshot,
        payment_mode,
        sale_date,
        created_by || null
      );

      db.prepare('UPDATE supplements SET current_stock = current_stock - ? WHERE id = ?').run(qty, supplement_id);

      return result.lastInsertRowid;
    });

    const newSaleId = executeSaleTransaction();
    const newSale = db.prepare(`
      SELECT s.*, sup.name as supplement_name, sup.unit as supplement_unit, c.name as client_name
      FROM supplement_sales s
      JOIN supplements sup ON s.supplement_id = sup.id
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.id = ?
    `).get(newSaleId);

    res.status(201).json(newSale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── REVENUE & PROFIT DASHBOARD ENDPOINT ──────────────────────────────────────

app.get('/api/supplements/revenue-report', (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let purchasesWhere = 'WHERE 1=1';
    let salesWhere = 'WHERE 1=1';
    const purchasesParams = [];
    const salesParams = [];

    if (startDate) {
      purchasesWhere += ' AND purchase_date >= ?';
      purchasesParams.push(startDate);
      salesWhere += ' AND sale_date >= ?';
      salesParams.push(startDate);
    }
    if (endDate) {
      purchasesWhere += ' AND purchase_date <= ?';
      purchasesParams.push(endDate);
      salesWhere += ' AND sale_date <= ?';
      salesParams.push(endDate);
    }

    const purchaseCostRow = db.prepare(`SELECT SUM(total_cost) as total FROM supplement_purchases ${purchasesWhere}`).get(...purchasesParams);
    const totalPurchaseCost = purchaseCostRow && purchaseCostRow.total ? purchaseCostRow.total : 0;

    const salesRow = db.prepare(`
      SELECT 
        SUM(total_amount) as totalRevenue,
        SUM(quantity * cost_price_snapshot) as totalCogs
      FROM supplement_sales ${salesWhere}
    `).get(...salesParams);

    const totalSaleRevenue = salesRow && salesRow.totalRevenue ? salesRow.totalRevenue : 0;
    const totalCogs = salesRow && salesRow.totalCogs ? salesRow.totalCogs : 0;
    const grossProfit = totalSaleRevenue - totalCogs;
    const profitMarginPct = totalSaleRevenue > 0 ? (grossProfit / totalSaleRevenue) * 100 : 0;

    // Per-supplement breakdown
    const breakdown = db.prepare(`
      SELECT 
        sup.id,
        sup.name,
        sup.category,
        sup.unit,
        COALESCE(SUM(s.quantity), 0) as units_sold,
        COALESCE(SUM(s.total_amount), 0) as revenue,
        COALESCE(SUM(s.quantity * s.cost_price_snapshot), 0) as cogs,
        COALESCE(SUM(s.total_amount - (s.quantity * s.cost_price_snapshot)), 0) as gross_profit
      FROM supplements sup
      LEFT JOIN supplement_sales s ON sup.id = s.supplement_id ${startDate ? 'AND s.sale_date >= ?' : ''} ${endDate ? 'AND s.sale_date <= ?' : ''}
      GROUP BY sup.id
      HAVING units_sold > 0 OR revenue > 0
      ORDER BY revenue DESC
    `).all(...salesParams);

    const breakdownFormatted = breakdown.map(item => ({
      ...item,
      margin_pct: item.revenue > 0 ? (item.gross_profit / item.revenue) * 100 : 0
    }));

    // Daily/Monthly time series chart data
    const dailySales = db.prepare(`
      SELECT sale_date as date, SUM(total_amount) as revenue, SUM(quantity * cost_price_snapshot) as cogs
      FROM supplement_sales ${salesWhere}
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `).all(...salesParams);

    const dailyPurchases = db.prepare(`
      SELECT purchase_date as date, SUM(total_cost) as cost
      FROM supplement_purchases ${purchasesWhere}
      GROUP BY purchase_date
      ORDER BY purchase_date ASC
    `).all(...purchasesParams);

    const dateMap = {};
    dailySales.forEach(s => {
      if (!dateMap[s.date]) dateMap[s.date] = { date: s.date, revenue: 0, cost: 0, profit: 0 };
      dateMap[s.date].revenue += s.revenue || 0;
      dateMap[s.date].profit += (s.revenue - s.cogs) || 0;
    });
    dailyPurchases.forEach(p => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date, revenue: 0, cost: 0, profit: 0 };
      dateMap[p.date].cost += p.cost || 0;
    });

    const chartData = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

    const lowStockAlerts = db.prepare(`
      SELECT * FROM supplements
      WHERE active = 1 AND current_stock <= low_stock_threshold
      ORDER BY current_stock ASC
    `).all();

    res.json({
      summary: {
        totalPurchaseCost,
        totalSaleRevenue,
        grossProfit,
        profitMarginPct: Math.round(profitMarginPct * 100) / 100
      },
      breakdown: breakdownFormatted,
      chartData,
      lowStockAlerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/supplements/dashboard-summary', (req, res) => {
  try {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().substring(0, 7);

    const salesRow = db.prepare(`
      SELECT 
        SUM(total_amount) as monthRevenue,
        SUM(total_amount - (quantity * cost_price_snapshot)) as monthProfit
      FROM supplement_sales
      WHERE strftime('%Y-%m', sale_date) = ?
    `).get(currentMonthPrefix);

    res.json({
      monthRevenue: salesRow && salesRow.monthRevenue ? salesRow.monthRevenue : 0,
      monthProfit: salesRow && salesRow.monthProfit ? salesRow.monthProfit : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GST REPORT & SETTINGS ENDPOINTS ──────────────────────────────────────────

app.get('/api/gst/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || {
      id: 1,
      business_legal_name: 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin: '332323402248ED',
      business_address: 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      gst_rate_percent: 4.8
    };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gst/settings', (req, res) => {
  try {
    const { business_legal_name, business_gstin, business_address, gst_rate_percent } = req.body;
    db.prepare(`
      INSERT INTO gst_settings (id, business_legal_name, business_gstin, business_address, gst_rate_percent)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_legal_name = excluded.business_legal_name,
        business_gstin = excluded.business_gstin,
        business_address = excluded.business_address,
        gst_rate_percent = excluded.gst_rate_percent
    `).run(
      business_legal_name || 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin || '332323402248ED',
      business_address || 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      parseFloat(gst_rate_percent) || 4.8
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/gst/report', (req, res) => {
  try {
    let { month } = req.query;
    if (!month) {
      month = new Date().toISOString().substring(0, 7); // YYYY-MM
    }

    const settings = db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || {
      id: 1,
      business_legal_name: 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin: '332323402248ED',
      business_address: 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      gst_rate_percent: 4.8
    };

    const allBills = db.prepare(`
      SELECT * FROM bills 
      WHERE (invoice_category IS NULL OR invoice_category = 'GeneralPlan')
        AND (planName IS NULL OR planName NOT LIKE 'Service:%')
      ORDER BY timestamp ASC
    `).all();

    const targetMonthInvoices = allBills.filter(b => {
      let dStr = b.invoiceDate;
      if (!dStr) return false;
      let yyyymm = '';
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts.length === 3) {
          yyyymm = `${parts[2]}-${parts[1].padStart(2, '0')}`;
        }
      } else if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            yyyymm = `${parts[0]}-${parts[1].padStart(2, '0')}`;
          } else {
            yyyymm = `${parts[2]}-${parts[1].padStart(2, '0')}`;
          }
        }
      }
      return yyyymm === month;
    });

    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalGstCollected = 0;
    let grandTotalInvoiced = 0;

    const invoices = targetMonthInvoices.map(b => {
      const invTotal = parseFloat(b.totalPlanAmount || b.planAmount || 0);
      const rate = b.gst_rate_snapshot || settings.gst_rate_percent || 4.8;
      let taxable = b.taxable_value;
      let cgst = b.cgst_amount;
      let sgst = b.sgst_amount;

      if (taxable === null || taxable === undefined) {
        const calc = computeGstBreakdown(invTotal, rate);
        taxable = calc.taxable_value;
        cgst = calc.cgst_amount;
        sgst = calc.sgst_amount;
      }

      totalTaxableValue += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      grandTotalInvoiced += invTotal;

      return {
        id: b.id,
        billNo: b.billNo,
        date: b.invoiceDate,
        clientName: b.clientName,
        clientGstin: b.client_gstin_snapshot || '',
        taxableValue: taxable,
        cgst: cgst,
        sgst: sgst,
        totalInvoiceValue: invTotal
      };
    });

    totalGstCollected = totalCgst + totalSgst;
    const allReconciled = Math.abs((totalTaxableValue + totalGstCollected) - grandTotalInvoiced) < 0.10;

    res.json({
      month,
      settings,
      summary: {
        totalTaxableValue: parseFloat(totalTaxableValue.toFixed(2)),
        totalCgst: parseFloat(totalCgst.toFixed(2)),
        totalSgst: parseFloat(totalSgst.toFixed(2)),
        totalGstCollected: parseFloat(totalGstCollected.toFixed(2)),
        grandTotalInvoiced: parseFloat(grandTotalInvoiced.toFixed(2)),
        count: invoices.length,
        allReconciled
      },
      invoices
    });
  } catch (err) {
    console.error("Error generating GST report:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gst/backfill', (req, res) => {
  try {
    const gstSettings = db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const rate = gstSettings.gst_rate_percent || 4.8;

    const billsToBackfill = db.prepare(`
      SELECT * FROM bills 
      WHERE (planName IS NULL OR planName NOT LIKE 'Service:%')
    `).all();

    let count = 0;
    const updateStmt = db.prepare(`
      UPDATE bills SET
        invoice_category = 'GeneralPlan',
        taxable_value = ?,
        cgst_amount = ?,
        sgst_amount = ?,
        gst_rate_snapshot = ?
      WHERE id = ?
    `);

    billsToBackfill.forEach(b => {
      const invTotal = parseFloat(b.totalPlanAmount || b.planAmount || 0);
      const calc = computeGstBreakdown(invTotal, rate);
      updateStmt.run(calc.taxable_value, calc.cgst_amount, calc.sgst_amount, rate, b.id);
      count++;
    });

    res.json({ success: true, count, message: `Successfully backfilled ${count} historical invoices with GST breakdown.` });
  } catch (err) {
    console.error("Error running GST backfill:", err);
    res.status(500).json({ error: err.message });
  }
});


// ─── RESET ALL OPERATIONAL DATA ──────────────────────────────────────────────
app.post('/api/reset-operational-data', (req, res) => {
  try {
    db.pragma('foreign_keys = OFF');
    const tablesToKeep = ['pt_packages', 'settings', 'users', 'sqlite_sequence'];
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    let clearedCount = 0;
    
    for (const tableRow of tables) {
      const tableName = tableRow.name;
      if (!tablesToKeep.includes(tableName.toLowerCase())) {
        const result = db.prepare(`DELETE FROM "${tableName}"`).run();
        clearedCount += result.changes;
      }
    }
    
    db.pragma('foreign_keys = ON');
    db.exec('VACUUM;');
    res.json({ success: true, message: `Cleared ${clearedCount} records. Retained PT Packages, Tariff Settings, and Login Users.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React App ────────────────────────────────────────────────────────
// In packaged mode: DIST_PATH is set by main.cjs (points inside app.asar)
// In dev mode: dist is ../dist relative to server/
const distPath = process.env.DIST_PATH || path.join(__dirname, '../dist');

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${PORT} is already in use. Assuming backend is already running.`);
    } else {
      console.error('❌ Server startup error:', err);
    }
  });
}

module.exports = app;

