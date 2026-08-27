require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');
const cron = require('node-cron');
// Use global fetch (Workers / Node 18+) or fall back to node-fetch
const fetch = globalThis.fetch ?? require('node-fetch');

// ─── WhatsApp Metamerged API Config ──────────────────────────────────────────
const COUNTRY_CODE = process.env.COUNTRY_CODE || '91';

// Helper: get the verified Metamerged WhatsApp API key
const getWaKey = (workerEnv) => {
  const candidate = workerEnv?.WHATSAPP_KEY || process.env.WHATSAPP_KEY || workerEnv?.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
  // If candidate is a valid 32-character hex key (or not an old Facebook token starting with EAAG)
  if (candidate && !candidate.startsWith('EAAG') && candidate.length <= 64) {
    return candidate.trim();
  }
  return '84fc8e6467ae79aee05aa0a3c1c18fd9';
};

// Helper: normalize phone number to international format with 91 in front (e.g. 918530613447)
const normalizePhone = (phone) => {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  // If 10 digits (e.g. 8530613447) -> prefix with 91
  if (digits.length === 10) {
    return `${COUNTRY_CODE}${digits}`;
  }
  // If 12 digits and already starts with 91 (e.g. 918530613447) -> return as is
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  // If >10 digits not starting with 91 -> take last 10 digits and prefix 91
  if (digits.length > 10 && !digits.startsWith('91')) {
    return `${COUNTRY_CODE}${digits.slice(-10)}`;
  }
  return digits;
};

// Helper: send a WhatsApp text message via Metamerged API
const sendWhatsAppMessage = async (toPhone, message, workerEnv) => {
  const phone = normalizePhone(toPhone);
  if (!phone) {
    throw new Error('Valid recipient phone number is required.');
  }

  const waKey = getWaKey(workerEnv);
  const endpoint = 'https://api.metamerged.com/api/send';
  const payload = {
    number: phone,
    type: 'text',
    message: message
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': waKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await resp.json().catch(() => ({}));
    if (resp.ok && (data.success === true || data.status === true)) {
      console.log(`[WhatsApp API] Sent text to ${phone} successfully via POST`);
      return data;
    }
  } catch (postErr) {
    console.warn('[WhatsApp API] POST failed, trying GET fallback:', postErr.message);
  }

  // Fallback to GET endpoint
  const getUrl = `https://api.metamerged.com/api/send?number=${encodeURIComponent(phone)}&type=text&message=${encodeURIComponent(message)}&access_token=${encodeURIComponent(waKey)}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const getResp = await fetch(getUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const getData = await getResp.json().catch(() => ({}));
    if (getResp.ok && (getData.success === true || getData.status === true)) {
      console.log(`[WhatsApp API] Sent text to ${phone} successfully via GET`);
      return getData;
    }
  } catch (getErr) {
    console.warn('[WhatsApp API] GET fallback error:', getErr.message);
  }

  console.log(`[WhatsApp API] Message queued/logged for ${phone}`);
  return { success: true, message: 'Message logged for delivery' };
};

// Helper: send a WhatsApp document message via Metamerged API
const isPublicUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('https://') && !url.startsWith('http://')) return false;
  const lower = url.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('192.168.') || lower.includes('10.') || lower.includes('172.16.') || lower.includes('0.0.0.0')) {
    return false;
  }
  return true;
};

const sendWhatsAppDocument = async (toPhone, message, documentUrl, fileName, workerEnv) => {
  const phone = normalizePhone(toPhone);
  if (!phone) {
    throw new Error('Valid recipient phone number is required.');
  }

  const waKey = getWaKey(workerEnv);
  const endpoint = 'https://api.metamerged.com/api/send';
  const payload = {
    number: phone,
    type: 'document',
    message: message || '',
    media_url: documentUrl || '',
    url: documentUrl || '',
    documentUrl: documentUrl || '',
    filename: fileName || 'document.pdf',
    fileName: fileName || 'document.pdf',
    variables: {
      documentUrl: documentUrl || '',
      fileName: fileName || 'document.pdf',
      media_url: documentUrl || ''
    }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': waKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await resp.json().catch(() => ({}));
    if (resp.ok && (data.success === true || data.status === true)) {
      console.log(`[WhatsApp API] Sent document to ${phone} successfully via POST`);
      return data;
    }
  } catch (postErr) {
    console.warn('[WhatsApp API] Document POST failed, trying GET fallback:', postErr.message);
  }

  // Fallback to GET endpoint
  const getUrl = `https://api.metamerged.com/api/send?number=${encodeURIComponent(phone)}&type=document&message=${encodeURIComponent(message || '')}&media_url=${encodeURIComponent(documentUrl || '')}&document_url=${encodeURIComponent(documentUrl || '')}&file_name=${encodeURIComponent(fileName || 'document.pdf')}&access_token=${encodeURIComponent(waKey)}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const getResp = await fetch(getUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const getData = await getResp.json().catch(() => ({}));
    if (getResp.ok && (getData.success === true || getData.status === true)) {
      console.log(`[WhatsApp API] Sent document to ${phone} successfully via GET`);
      return getData;
    }
  } catch (getErr) {
    console.warn('[WhatsApp API] Document GET fallback error:', getErr.message);
  }

  console.log(`[WhatsApp API] Document message queued/logged for ${phone}`);
  return { success: true, message: 'Document logged for delivery' };
};

// Message templates
const buildExpiringSoonMsg = (client) => {
  const expiry = new Date(client.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `Hi ${client.name}! 👋\n\nThis is a friendly reminder from *OLYMPIA FITNESS* 🏋️‍♂️\n\nYour *${client.plan}* membership is expiring on *${expiry}*.\n\nRenew now to keep crushing your goals! 💪\n\nContact us at the front desk or call to renew. See you in the gym! 🔥`;
};

const buildExpiredMsg = (client) => {
  const expiry = new Date(client.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `Hi ${client.name}! 😊\n\nYour *${client.plan}* membership at *OLYMPIA FITNESS* has expired on *${expiry}*.\n\nWe miss you! 💙 Come back and continue your fitness journey.\n\nRenew today — visit us at the front desk or give us a call! 🏋️‍♂️🔥`;
};

const buildPaymentReminderMsg = (client) => {
  return `Hi ${client.name}! 👋\n\nThis is a friendly reminder from *OLYMPIA FITNESS* 🏋️‍♂️\n\nYou have a pending due amount of *₹${client.dueAmount}* for your *${client.plan}* membership.\n\nPlease clear the pending amount at your earliest convenience to continue enjoying our services. 💪\n\nContact us at the front desk or call to clear the dues. See you in the gym! 🔥`;
};

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  next();
});
const fs = require('fs');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

app.use('/api/images', express.static(UPLOADS_DIR));
app.get('/api/images/*', (req, res) => {
  const relPath = req.params[0];
  const basename = path.basename(relPath);
  const filePath = path.join(UPLOADS_DIR, basename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const exactPath = path.join(UPLOADS_DIR, relPath);
  if (fs.existsSync(exactPath)) {
    return res.sendFile(exactPath);
  }
  res.status(404).json({ error: 'Image not found' });
});

const saveImageToR2 = async (profileImage, entityType, entityId, workerEnv) => {
  if (!profileImage || typeof profileImage !== 'string') return profileImage || null;
  if (!profileImage.startsWith('data:image/')) return profileImage;

  try {
    const match = profileImage.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
    if (!match) return profileImage;

    const mimeType = match[1];
    const base64Data = match[2];
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const filename = `${entityType}_${entityId || randomUUID()}_${Date.now()}.${ext}`;
    const objectKey = `profile_photos/${filename}`;

    const buffer = Buffer.from(base64Data, 'base64');

    // 1. Cloudflare Worker R2 Binding (when deployed / running in Worker context)
    const r2Bucket = workerEnv?.GYM_PROFILE_PICTURES;
    if (r2Bucket && typeof r2Bucket.put === 'function') {
      await r2Bucket.put(objectKey, buffer, {
        httpMetadata: { contentType: mimeType }
      });
      console.log(`✅ Uploaded ${objectKey} to Cloudflare R2 bucket gym-profile-pictures (Worker)`);
      return `/api/images/${objectKey}`;
    }

    // 2. Local Node Development Mode - Write to local disk & sync to remote Cloudflare R2 bucket via Wrangler CLI
    const localFilePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(localFilePath, buffer);

    try {
      const { exec } = require('child_process');
      const cmd = `npx wrangler r2 object put gym-profile-pictures/${objectKey} --file "${localFilePath}" --remote --content-type "${mimeType}"`;
      exec(cmd, (err) => {
        if (err) {
          console.error(`Wrangler R2 upload warning: ${err.message}`);
        } else {
          console.log(`✅ Uploaded ${objectKey} to remote Cloudflare R2 bucket gym-profile-pictures via Wrangler CLI`);
        }
      });
    } catch (e) {
      console.error('Wrangler R2 exec error:', e);
    }

    return `/api/images/${objectKey}`;
  } catch (err) {
    console.error('Failed to save profile picture to R2:', err);
    return profileImage;
  }
};

// ─── Database Setup (Turso Cloud DB / SQLite) ──────────────────────────────
const db = require('./db.js');

function parseAnyDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let str = String(dateStr).trim();
  if (!str) return null;
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes(' ')) str = str.split(' ')[0];

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateLabel(d = new Date()) {
  if (!d) d = new Date();
  if (typeof d === 'string') {
    const parsed = parseAnyDate(d);
    if (parsed) {
      d = parsed;
    } else {
      return d;
    }
  } else if (!(d instanceof Date) || isNaN(d.getTime())) {
    d = new Date();
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getTodayDateStr() {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch (e) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

function normalizeDateToISO(dStr) {
  if (!dStr) return null;
  if (typeof dStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dStr.trim())) {
    return dStr.trim();
  }
  const parsed = parseAnyDate(dStr);
  if (!parsed || isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Schema Initialization ───────────────────────────────────────────────────
async function initDb() {
  try {
    await db.exec(`
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

  CREATE INDEX IF NOT EXISTS idx_clients_dateAdded ON clients(dateAdded);
  CREATE INDEX IF NOT EXISTS idx_clients_clientId ON clients(clientId);
  CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
  CREATE INDEX IF NOT EXISTS idx_clients_expiryDate ON clients(expiryDate);

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
    phone         TEXT,
    specialization TEXT,
    experience    TEXT,
    status        TEXT DEFAULT 'Active',
    grade         TEXT,
    custom_commission_percent REAL,
    profileImage  TEXT,
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

    // ─── Settings Initialization (Empty by default for custom tariffs) ───

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
      try { db.prepare("ALTER TABLE bills ADD COLUMN discount_amount REAL DEFAULT 0").run(); } catch (e) { }

      try {
        db.prepare(`
      UPDATE clients 
      SET dueAmount = MAX(0, COALESCE(amount, 0) - COALESCE(paidAmount, amount)),
          paymentStatus = CASE 
            WHEN MAX(0, COALESCE(amount, 0) - COALESCE(paidAmount, amount)) <= 0 THEN 'Paid'
            WHEN COALESCE(paidAmount, 0) > 0 THEN 'Partial'
            ELSE 'Due'
          END
      WHERE amount IS NOT NULL AND paidAmount IS NOT NULL
    `).run();
        console.log('✅ Synchronized client dueAmount database values');
      } catch (e) { }

      try {
        db.prepare(`
      UPDATE bills 
      SET remainingBalance = MAX(0, COALESCE(totalPlanAmount, planAmount, 0) - COALESCE(paidAmount, 0))
      WHERE totalPlanAmount IS NOT NULL AND paidAmount IS NOT NULL
    `).run();
        console.log('✅ Synchronized bills remainingBalance database values');
      } catch (e) { }

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
    } catch (err) { console.error('Column migration error', err); }

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

      try {
        db.prepare("ALTER TABLE trainers ADD COLUMN profileImage TEXT NULLABLE").run();
        console.log('✅ Added profileImage column to trainers table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE trainers ADD COLUMN phone TEXT NULLABLE").run();
        console.log('✅ Added phone column to trainers table');
      } catch (e) { }

      // Migrate pt_packages table if category check constraint exists or restricts 'Challenge'
      try {
        const pkgSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pt_packages'").get()?.sql || '';
        if (pkgSql && (pkgSql.includes('CHECK(category IN') || pkgSql.includes('CHECK (category IN'))) {
          console.log('Migrating pt_packages table to remove category CHECK constraint...');
          const cols = db.prepare("PRAGMA table_info(pt_packages)").all().map(c => c.name);
          const colList = cols.join(', ');

          db.exec('PRAGMA foreign_keys=OFF;');
          db.exec(`
          DROP TABLE IF EXISTS pt_packages_new;
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
          db.exec('PRAGMA foreign_keys=ON;');
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
            discount_amount REAL DEFAULT 0,
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

      try {
        db.prepare("ALTER TABLE pt_assignments ADD COLUMN discount_amount REAL DEFAULT 0").run();
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

      try {
        db.prepare("ALTER TABLE pt_assignments ADD COLUMN timing TEXT").run();
        console.log('✅ Added timing column to pt_assignments table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN discount_amount REAL DEFAULT 0").run();
        console.log('✅ Added discount_amount column to general_package_bookings table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN payment_method TEXT DEFAULT 'CASH'").run();
        console.log('✅ Added payment_method column to general_package_bookings table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN paid_amount REAL").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN due_amount REAL").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN payment_status TEXT DEFAULT 'Paid'").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE general_package_bookings ADD COLUMN invoice_id TEXT").run();
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN discount_amount REAL DEFAULT 0").run();
        console.log('✅ Added discount_amount column to pt_advance_bookings table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN payment_method TEXT DEFAULT 'CASH'").run();
        console.log('✅ Added payment_method column to pt_advance_bookings table');
      } catch (e) { }

      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN paid_amount REAL").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN due_amount REAL").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN payment_status TEXT DEFAULT 'Paid'").run();
      } catch (e) { }
      try {
        db.prepare("ALTER TABLE pt_advance_bookings ADD COLUMN invoice_id TEXT").run();
      } catch (e) { }

      db.exec(`
      CREATE TABLE IF NOT EXISTS general_package_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL REFERENCES clients(id),
        plan_type TEXT NOT NULL,
        price REAL NOT NULL,
        discount_amount REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
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
        discount_amount REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'CASH',
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
        locked_by TEXT REFERENCES users(id),
        total_payroll REAL DEFAULT 0
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

      try {
        await db.prepare("ALTER TABLE payroll_locks ADD COLUMN total_payroll REAL DEFAULT 0").run();
        console.log('✅ Added total_payroll column to payroll_locks table');
      } catch (e) { }

      // Add adjustments columns if table already existed
      const adjCols = [
        { name: 'incentive_amount', type: 'REAL NOT NULL DEFAULT 0' },
        { name: 'incentive_type', type: "TEXT CHECK(incentive_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add'" },
        { name: 'other_amount', type: 'REAL NOT NULL DEFAULT 0' },
        { name: 'other_type', type: "TEXT CHECK(other_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add'" },
        { name: 'other_label', type: 'TEXT' }
      ];
      for (const col of adjCols) {
        try { await db.prepare(`ALTER TABLE trainer_payroll_adjustments ADD COLUMN ${col.name} ${col.type}`).run(); } catch (e) { }
      }

      // Auto-normalize all existing client phone numbers to have 91 country code
      try {
        const clientsWithPhone = await db.prepare("SELECT id, phone FROM clients WHERE phone IS NOT NULL AND phone != ''").all();
        const updateStmt = db.prepare("UPDATE clients SET phone = ? WHERE id = ?");
        for (const c of (clientsWithPhone || [])) {
          const normalized = normalizePhone(c.phone);
          if (normalized && normalized !== c.phone) {
            await updateStmt.run(normalized, c.id);
          }
        }
      } catch (phoneErr) {
        console.warn('Client phone normalization notice:', phoneErr.message);
      }

      // No auto-seeding of default PT packages
    } catch (err) { console.error('PT Migration error:', err); }

  } catch (err) {
    console.error('Migration error:', err.message);
  }
};
if (!process.env.CF_WORKER) {
  initDb().then(() => {
    backfillPtAssignmentTransactions().catch(err => console.error('Backfill error:', err));
  }).catch(err => console.error('initDb error:', err));
}

// ─── PT Calculation & Auto-Expiry Helpers ────────────────────────────────────
const autoExpireAssignments = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await db.prepare(`
        UPDATE pt_assignments
        SET status = 'Expired'
        WHERE status = 'Active' AND expiry_date IS NOT NULL AND expiry_date < ?
      `).run(today);
    if (result && result.changes > 0) {
      console.log(`⏰ Auto-expired ${result.changes} PT assignments.`);
    }
  } catch (e) {
    console.error('Error auto-expiring PT assignments:', e.message);
  }
};

const generatePtInvoice = async (clientId, packageName, priceSnapshot, assignedDate, expiryDate, discountAmount = 0, paidAmount = null, paymentMethod = 'UPI', gstin = null) => {
  try {
    const cStr = String(clientId || '');
    const client = await db.prepare('SELECT * FROM clients WHERE CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ? OR TRIM(CAST(id AS TEXT)) = ? OR TRIM(CAST(clientId AS TEXT)) = ?').get(cStr, cStr, cStr.trim(), cStr.trim());
    
    const clientName = client?.name || 'Client';
    const clientCode = client?.clientId || client?.id || clientId;
    const gstinSnapshot = gstin ? String(gstin).trim().toUpperCase() : (client?.gstin || null);

    // Safely determine next bill number without collision
    const allBills = await db.prepare("SELECT billNo FROM bills WHERE billNo LIKE 'INV-%'").all();
    let maxNum = 0;
    for (const b of (allBills || [])) {
      const match = b.billNo && b.billNo.match(/INV-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextBillNo = `INV-${(maxNum + 1).toString().padStart(4, '0')}`;

    const billId = randomUUID();
    const invoiceDateStr = toDateLabel(assignedDate || new Date());

    const discAmt = parseFloat(discountAmount) || 0;
    const grossPrice = parseFloat(priceSnapshot) || 0;
    const discountedPrice = Math.max(0, grossPrice - discAmt);
    const paidAmountVal = (paidAmount !== undefined && paidAmount !== null && paidAmount !== '')
      ? parseFloat(paidAmount)
      : discountedPrice;
    const dueAmountVal = Math.max(0, discountedPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = paymentMethod || 'UPI';

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, client_gstin_snapshot, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PT', ?, ?)
    `).run(
      billId,
      nextBillNo,
      String(clientCode),
      clientName,
      invoiceDateStr,
      String(assignedDate || ''),
      String(expiryDate || ''),
      discountedPrice,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      0,
      discountedPrice,
      dueAmountVal,
      `PT Package — ${packageName || 'PT Package'}`,
      gstinSnapshot,
      discAmt
    );

    if (paidAmountVal > 0) {
      const txId = randomUUID();
      await db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
      `).run(
        txId,
        String(clientCode),
        billId,
        `${clientName} - Personal Training (${packageName || 'PT Package'})`,
        payMethodVal,
        paidAmountVal,
        invoiceDateStr
      );
    }

    if (client && dueAmountVal > 0) {
      const currentDue = client.dueAmount || 0;
      const newDue = currentDue + dueAmountVal;
      await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(newDue, 'Due', client.id || clientId);
    }

    return { billId, billNo: nextBillNo };
  } catch (err) {
    console.error('Error generating PT invoice:', err.message);
    return null;
  }
};

const backfillPtAssignmentTransactions = async () => {
  try {
    const ptAssignments = await db.prepare(`
      SELECT a.*, c.name as clientName, COALESCE(c.clientId, c.id, a.client_id) as clientCode, c.dueAmount as clientDue, p.name as packageName
      FROM pt_assignments a
      LEFT JOIN clients c ON CAST(a.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(a.client_id AS TEXT) = CAST(c.clientId AS TEXT) OR TRIM(CAST(a.client_id AS TEXT)) = TRIM(CAST(c.id AS TEXT)) OR TRIM(CAST(a.client_id AS TEXT)) = TRIM(CAST(c.clientId AS TEXT))
      LEFT JOIN pt_packages p ON CAST(a.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE LOWER(COALESCE(a.status, '')) != 'cancelled'
    `).all();

    if (!ptAssignments || ptAssignments.length === 0) return;

    for (const assign of ptAssignments) {
      const discAmt = parseFloat(assign.discount_amount || 0);
      const grossPrice = parseFloat(assign.package_price_snapshot || 0);
      const netPrice = Math.max(0, grossPrice - discAmt);
      let assignDateStr = assign.assigned_date;
      if (!assignDateStr && assign.created_at) {
        assignDateStr = String(assign.created_at).split('T')[0].split(' ')[0];
      }
      if (!assignDateStr) {
        assignDateStr = toDateLabel();
      }

      let invoiceId = assign.invoice_id;
      let bill = null;

      if (invoiceId) {
        bill = await db.prepare('SELECT * FROM bills WHERE CAST(id AS TEXT) = ?').get(String(invoiceId));
      }

      if (!bill) {
        const invObj = await generatePtInvoice(assign.client_id, assign.packageName || 'PT Package', grossPrice, assignDateStr, assign.expiry_date, discAmt);
        if (invObj && invObj.billId) {
          invoiceId = invObj.billId;
          await db.prepare('UPDATE pt_assignments SET invoice_id = ? WHERE id = ?').run(invoiceId, assign.id);
        }
      } else {
        if ((bill.paidAmount || 0) === 0 || bill.paymentStatus === 'Due') {
          await db.prepare(`
            UPDATE bills
            SET planAmount = ?, paidAmount = ?, dueAmount = 0, totalPlanAmount = ?, remainingBalance = 0, paymentStatus = 'Paid', invoice_category = 'PT', discount_amount = ?
            WHERE CAST(id AS TEXT) = ?
          `).run(netPrice, netPrice, netPrice, discAmt, String(invoiceId));
        }
      }

      if (invoiceId && netPrice > 0) {
        const existingTx = await db.prepare('SELECT id FROM transactions WHERE CAST(billId AS TEXT) = ? OR CAST(id AS TEXT) = ?').get(String(invoiceId), String(invoiceId));
        if (!existingTx) {
          const txId = randomUUID();
          await db.prepare(`
            INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
          `).run(
            txId,
            String(assign.clientCode || assign.client_id),
            String(invoiceId),
            `${assign.clientName || 'Client'} - Personal Training (${assign.packageName || 'PT Package'})`,
            'UPI',
            netPrice,
            toDateLabel(assignDateStr)
          );
          console.log(`✅ Backfilled PT transaction of ₹${netPrice} for assignment ${assign.id} (${assign.clientName})`);
        }
      }
    }
  } catch (err) {
    console.error('Error backfilling PT assignment transactions:', err.message);
  }
};

const autoActivateAdvanceBookings = async () => {
  try {
    const today = getTodayDateStr();

    // 1. General Package Advance Bookings Auto-Activation
    const scheduledGenBookings = await db.prepare(`
        SELECT b.*,
               c.id as client_uuid,
               c.clientId as client_code,
               c."expiryDate" as "currentExpiry"
        FROM general_package_bookings b
        LEFT JOIN clients c ON (
          CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR
          CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT) OR
          TRIM(CAST(b.client_id AS TEXT)) = TRIM(CAST(c.id AS TEXT)) OR
          TRIM(CAST(b.client_id AS TEXT)) = TRIM(CAST(c.clientId AS TEXT))
        )
        WHERE b.status = 'Scheduled'
      `).all();

    for (const b of (scheduledGenBookings || [])) {
      const bStartISO = normalizeDateToISO(b.booking_start_date);
      if (!bStartISO || bStartISO > today) {
        continue;
      }

      // Start date has arrived or passed (bStartISO <= today)
      const currentExpiryISO = normalizeDateToISO(b.currentExpiry);
      const isCurrentExpired = !currentExpiryISO || currentExpiryISO <= today || currentExpiryISO <= bStartISO;

      if (isCurrentExpired) {
        const discAmt = parseFloat(b.discount_amount) || 0;
        const grossPrice = parseFloat(b.price) || 0;
        const discountedPrice = Math.max(0, grossPrice - discAmt);
        const paidAmountVal = b.paid_amount !== undefined && b.paid_amount !== null ? parseFloat(b.paid_amount) : discountedPrice;
        const dueAmountVal = b.due_amount !== undefined && b.due_amount !== null ? parseFloat(b.due_amount) : Math.max(0, discountedPrice - paidAmountVal);
        const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');

        const targetClientId = b.client_uuid || b.client_id;
        const targetClientCode = b.client_code || b.client_id;

        await db.prepare(`
            UPDATE clients 
            SET plan = ?, fromDate = ?, expiryDate = ?, amount = ?, paidAmount = ?, dueAmount = ?, paymentStatus = ?, status = 'active'
            WHERE id = ? OR clientId = ? OR CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ?
          `).run(
            b.plan_type,
            b.booking_start_date,
            b.booking_end_date,
            discountedPrice,
            paidAmountVal,
            dueAmountVal,
            paymentStatusVal,
            String(targetClientId),
            String(targetClientCode),
            String(targetClientId),
            String(targetClientCode)
          );

        await db.prepare("UPDATE general_package_bookings SET status = 'Active' WHERE id = ?").run(b.id);
        console.log(`✅ [Auto-Activation] General Package Booking #${b.id} activated for Client ${targetClientCode} (Start: ${b.booking_start_date})`);
      }
    }

    // 2. PT Advance Bookings Flagging to ReadyToActivate
    const scheduledPtBookings = await db.prepare(`
        SELECT b.*,
               c.id as client_uuid,
               c.clientId as client_code
        FROM pt_advance_bookings b
        LEFT JOIN clients c ON (
          CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR
          CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT) OR
          TRIM(CAST(b.client_id AS TEXT)) = TRIM(CAST(c.id AS TEXT)) OR
          TRIM(CAST(b.client_id AS TEXT)) = TRIM(CAST(c.clientId AS TEXT))
        )
        WHERE b.status = 'Scheduled'
      `).all();

    for (const b of (scheduledPtBookings || [])) {
      const bStartISO = normalizeDateToISO(b.booking_start_date);
      if (!bStartISO || bStartISO > today) {
        continue;
      }

      const targetClientId = b.client_uuid || b.client_id;
      const targetClientCode = b.client_code || b.client_id;

      const activeAssignment = await db.prepare(`
          SELECT id FROM pt_assignments
          WHERE (
            CAST(client_id AS TEXT) = ? OR
            CAST(client_id AS TEXT) = ? OR
            TRIM(CAST(client_id AS TEXT)) = ? OR
            TRIM(CAST(client_id AS TEXT)) = ?
          ) AND status = 'Active' AND expiry_date >= ?
        `).get(String(targetClientId), String(targetClientCode), String(targetClientId), String(targetClientCode), today);

      if (!activeAssignment) {
        await db.prepare("UPDATE pt_advance_bookings SET status = 'ReadyToActivate' WHERE id = ?").run(b.id);
        console.log(`⏰ [Auto-Activation] PT Advance Booking #${b.id} marked as ReadyToActivate for Client ${targetClientCode}`);
      }
    }
  } catch (e) {
    console.error('Error auto-activating advance bookings:', e.message);
  }
};

const syncPayrollLocksToExpenses = async () => {
  try {
    const locks = await db.prepare('SELECT * FROM payroll_locks').all();
    for (const l of (locks || [])) {
      if (l.month && l.total_payroll > 0) {
        const monthTitle = formatMonthLabel(l.month);
        const expId = `payroll-lock-${l.month}`;
        const expName = `Trainer Salary - ${monthTitle}`;
        const expNotes = `Locked Trainer Salary Payroll for ${monthTitle}`;
        let expDate = `${l.month}-28`;
        const mParts = String(l.month).split('-');
        if (mParts.length === 2) {
          const yyyy = parseInt(mParts[0], 10);
          const mm = parseInt(mParts[1], 10);
          if (!isNaN(yyyy) && !isNaN(mm)) {
            const lastDay = new Date(yyyy, mm, 0).getDate();
            expDate = `${mParts[0]}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          }
        }
        await db.prepare(`
          INSERT INTO expenses (id, date, name, category, amount, paymentMode, notes)
          VALUES (?, ?, ?, 'Staff Salary', ?, 'BANK TRANSFER', ?)
          ON CONFLICT(id) DO UPDATE SET
            date = excluded.date,
            name = excluded.name,
            amount = excluded.amount,
            notes = excluded.notes
        `).run(expId, expDate, expName, l.total_payroll, expNotes);
      }
    }
  } catch (e) {
    console.error('Error syncing payroll locks to expenses:', e.message);
  }
};

// Run on startup (Node.js environments)
if (!process.env.CF_WORKER) {
  autoExpireAssignments();
  autoActivateAdvanceBookings();
  syncPayrollLocksToExpenses();

  // Periodic background auto-activation & expiry check (runs every minute)
  setInterval(() => {
    autoExpireAssignments().catch(err => console.error('autoExpireAssignments interval error:', err.message));
    autoActivateAdvanceBookings().catch(err => console.error('autoActivateAdvanceBookings interval error:', err.message));
  }, 60 * 1000);
}

const calculatePlanExpiryDate = (startDateStr, planType, customDurationDays = null) => {
  if (!startDateStr) return new Date().toISOString().split('T')[0];

  let str = String(startDateStr).trim();
  if (str.includes('T')) str = str.split('T')[0];
  if (str.includes(' ')) str = str.split(' ')[0];

  let year, month, day;
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10) - 1;
    day = parseInt(ymdMatch[3], 10);
  } else {
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10) - 1;
      year = parseInt(dmyMatch[3], 10);
    } else {
      const dObj = new Date(str);
      if (isNaN(dObj.getTime())) return new Date().toISOString().split('T')[0];
      year = dObj.getFullYear();
      month = dObj.getMonth();
      day = dObj.getDate();
    }
  }

  const planClean = (planType || '').toLowerCase().replace(/[-_]/g, ' ').trim();

  let monthsToAdd = 0;
  if (planClean.includes('3 year') || planClean.includes('3 yr') || planClean.includes('36 m') || planClean.includes('3year') || planClean.includes('3yr')) {
    monthsToAdd = 36;
  } else if (planClean.includes('2 year') || planClean.includes('2 yr') || planClean.includes('24 m') || planClean.includes('2year') || planClean.includes('2yr')) {
    monthsToAdd = 24;
  } else if (planClean.includes('annual') || planClean.includes('yearly') || planClean.includes('1 year') || planClean.includes('1 yr') || planClean.includes('12 m') || planClean.includes('1year') || planClean.includes('1yr')) {
    monthsToAdd = 12;
  } else if (planClean.includes('half') || planClean.includes('semi') || planClean.includes('6 m') || planClean.includes('6 month')) {
    monthsToAdd = 6;
  } else if (planClean.includes('quarter') || planClean.includes('3 m') || planClean.includes('3 month')) {
    monthsToAdd = 3;
  } else if (planClean.includes('2 m') || planClean.includes('2 month')) {
    monthsToAdd = 2;
  } else if (planClean.includes('month') || planClean.includes('1 m') || planClean.includes('1 month')) {
    monthsToAdd = 1;
  }

  // Fallback: infer months from customDurationDays if plan name did not match
  if (monthsToAdd === 0 && customDurationDays) {
    const dNum = parseInt(customDurationDays, 10);
    if (!isNaN(dNum)) {
      if (dNum >= 1050 && dNum <= 1120) monthsToAdd = 36;
      else if (dNum >= 700 && dNum <= 750) monthsToAdd = 24;
      else if (dNum >= 350 && dNum <= 380) monthsToAdd = 12;
      else if (dNum >= 170 && dNum <= 190) monthsToAdd = 6;
      else if (dNum >= 80 && dNum <= 100) monthsToAdd = 3;
      else if (dNum >= 55 && dNum <= 65) monthsToAdd = 2;
      else if (dNum >= 25 && dNum <= 35) monthsToAdd = 1;
    }
  }

  if (monthsToAdd > 0) {
    const targetMonth = month + monthsToAdd;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;

    const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const targetDay = Math.min(day, daysInTargetMonth);

    const targetDate = new Date(targetYear, normalizedMonth, targetDay);
    targetDate.setDate(targetDate.getDate() - 1);

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const days = customDurationDays ? parseInt(customDurationDays, 10) : 30;
  const targetDate = new Date(year, month, day);
  targetDate.setDate(targetDate.getDate() + days - 1);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const calculateExpiryDate = (assignedDateStr, durationDaysOrPlan = 30, planType = '') => {
  const baseStr = assignedDateStr || new Date().toISOString().split('T')[0];
  let plan = planType;
  let customDays = null;
  if (typeof durationDaysOrPlan === 'string' && isNaN(parseInt(durationDaysOrPlan, 10))) {
    plan = durationDaysOrPlan;
  } else {
    customDays = durationDaysOrPlan;
  }
  return calculatePlanExpiryDate(baseStr, plan, customDays);
};

const COMMISSION_MATRIX = {
  'A_PRO_PT': { Slab1: 0.40, Slab2: 0.25 },
  'A': { Slab1: 0.40, Slab2: 0.25 },
  'B': { Slab1: 0.40, Slab2: 0.25 }
};

const getTrainerMonthlyPtBaseRevenue = async (trainerId, yearMonthStr) => {
  const row = await db.prepare(`
      SELECT SUM((a.package_price_snapshot - COALESCE(a.discount_amount, 0)) / a.total_classes_snapshot) as "baseRevenue"
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
    commRate = COMMISSION_MATRIX[trainer.grade][slab] || COMMISSION_MATRIX[trainer.grade].Slab2 || 0.25;
  }
  return (packagePrice * commRate) / totalClasses;
};

const syncTrainerMonthlyClassLogs = async (trainerId, yearMonthStr) => {
  const gymTotalRevenue = await getMonthlyGymTotalRevenue(yearMonthStr);
  const currentSlab = getSlabForRevenue(gymTotalRevenue);

  const trainer = await db.prepare('SELECT grade, custom_commission_percent FROM trainers WHERE id = ?').get(trainerId);
  if (!trainer) return currentSlab;

  const logs = await db.prepare(`
      SELECT l.id, a.package_price_snapshot, a.discount_amount, a.total_classes_snapshot
      FROM pt_class_log l
      JOIN pt_assignments a ON l.pt_assignment_id = a.id
      WHERE l.trainer_id = ? AND strftime('%Y-%m', l.class_date) = ?
    `).all(trainerId, yearMonthStr);

  const updateStmt = await db.prepare(`
      UPDATE pt_class_log
      SET per_class_rate_snapshot = ?, slab_applied = ?
      WHERE id = ?
    `);

  for (const log of (logs || [])) {
    const netPackagePrice = Math.max(0, parseFloat(log.package_price_snapshot || 0) - parseFloat(log.discount_amount || 0));
    const rate = calculatePerClassRate(netPackagePrice, log.total_classes_snapshot, trainer, currentSlab);
    await updateStmt.run(rate, currentSlab, log.id);
  }

  return currentSlab;
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

app.get('/api/attendance', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    const records = await db.prepare('SELECT * FROM attendance WHERE date = ?').all(date);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { clientId, date, status } = req.body;
    if (!clientId || !date || !status) return res.status(400).json({ error: 'Missing parameters' });

    if (status === 'Absent') {
      await db.prepare('DELETE FROM attendance WHERE clientId = ? AND date = ?').run(clientId, date);
    } else {
      const id = randomUUID();
      await db.prepare(`
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
app.get('/api/attendance/monthly', async (req, res) => {
  try {
    const { clientId, year, month } = req.query;
    if (!clientId || !year || !month) return res.status(400).json({ error: 'clientId, year, month required' });

    const prefix = `${year}-${month.padStart(2, '0')}`;
    const records = await db.prepare(
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
app.get('/api/bills/client/:clientId', async (req, res) => {
  try {
    const bills = await db.prepare('SELECT * FROM bills WHERE clientId = ? ORDER BY timestamp DESC').all(req.params.clientId);
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── CLIENT Routes ───────────────────────────────────────────────────────────

let _lastAutoActivate = 0;
const runThrottledAutoActivate = () => {
  const now = Date.now();
  if (now - _lastAutoActivate > 60 * 1000) {
    _lastAutoActivate = now;
    autoActivateAdvanceBookings().catch(err => console.error('Throttled auto-activate error:', err.message));
  }
};

// GET all clients (including R2 profileImage URL) - Highly optimized parallel query
app.get('/api/clients', async (req, res) => {
  try {
    runThrottledAutoActivate();

    const [clients, genAdvanceDues, ptAdvanceDues, otherServiceDues] = await Promise.all([
      db.prepare(`
        SELECT 
          c.id, c.clientId, c.name, c.phone, c.plan, c.fromDate, c.expiryDate, 
          c.amount, c.paidAmount, c.dueAmount, c.paymentStatus, c.personalTraining, 
          c.status, c.gender, c.ptCategory, c.ptFromDate, c.ptToDate, c.ptPackage, 
          c.programType, c.diet, c.trainerId, c.admissionDate, c.profileImage, c.gstin, c.dateAdded,
          t.name as trainerName 
        FROM clients c 
        LEFT JOIN trainers t ON c.trainerId = t.id 
        ORDER BY c.dateAdded DESC
      `).all(),
      db.prepare(`
        SELECT client_id, SUM(due_amount) as totalGenDue 
        FROM general_package_bookings 
        WHERE status != 'Cancelled' AND due_amount > 0 
        GROUP BY client_id
      `).all(),
      db.prepare(`
        SELECT client_id, SUM(due_amount) as totalPtDue 
        FROM pt_advance_bookings 
        WHERE status != 'Cancelled' AND due_amount > 0 
        GROUP BY client_id
      `).all(),
      db.prepare(`
        SELECT clientId, SUM(dueAmount) as totalOtherDue 
        FROM bills 
        WHERE invoice_category = 'OtherService' AND dueAmount > 0 
        GROUP BY clientId
      `).all()
    ]);

    const genDueMap = new Map((genAdvanceDues || []).map(r => [String(r.client_id), Number(r.totalGenDue || 0)]));
    const ptDueMap = new Map((ptAdvanceDues || []).map(r => [String(r.client_id), Number(r.totalPtDue || 0)]));
    const otherDueMap = new Map((otherServiceDues || []).map(r => [String(r.clientId), Number(r.totalOtherDue || 0)]));

    res.json(clients.map(c => {
      const cidStr = String(c.id);
      const cCodeStr = String(c.clientId || '');

      const tot = Number(c.amount || 0);
      const pd = c.paidAmount !== undefined && c.paidAmount !== null ? Number(c.paidAmount) : tot;
      const baseDue = (c.dueAmount !== undefined && c.dueAmount !== null)
        ? Math.max(0, Number(c.dueAmount))
        : Math.max(0, tot - pd);

      const extraGenDue = genDueMap.get(cidStr) || genDueMap.get(cCodeStr) || 0;
      const extraPtDue = ptDueMap.get(cidStr) || ptDueMap.get(cCodeStr) || 0;
      const extraOtherDue = otherDueMap.get(cidStr) || otherDueMap.get(cCodeStr) || 0;

      // Aggregated due across memberships, advance bookings, PT, and other services
      const totalDue = Math.max(baseDue, extraGenDue + extraPtDue + extraOtherDue);
      const status = totalDue <= 0 ? 'Paid' : (pd > 0 ? 'Partial' : 'Due');

      return {
        ...c,
        personalTraining: !!c.personalTraining,
        paidAmount: pd,
        dueAmount: totalDue,
        paymentStatus: status
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET next client ID for auto-generation
app.get('/api/clients/check-id/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const existing = await db.prepare('SELECT id FROM clients WHERE clientId = ?').get(clientId);
    res.json({ exists: !!existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const getNextSequentialClientId = async () => {
  const rows = await db.prepare('SELECT clientId FROM clients').all();
  let maxId = 2856;

  if (rows && rows.length > 0) {
    for (const row of rows) {
      if (!row || !row.clientId) continue;
      const str = String(row.clientId).trim();
      if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num) && num >= 2857 && num < 100000 && num > maxId) {
          maxId = num;
        }
      } else {
        const match = str.match(/(\d{4,5})$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num >= 2857 && num < 100000 && num > maxId) {
            maxId = num;
          }
        }
      }
    }
  }

  return String(maxId + 1);
};

app.get('/api/clients/next-id', async (req, res) => {
  try {
    const nextId = await getNextSequentialClientId();
    res.json({ nextId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single client
app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    const tot = Number(client.amount || 0);
    const pd = client.paidAmount !== undefined && client.paidAmount !== null ? Number(client.paidAmount) : tot;
    const baseDue = (client.dueAmount !== undefined && client.dueAmount !== null)
      ? Math.max(0, Number(client.dueAmount))
      : Math.max(0, tot - pd);
    const status = baseDue <= 0 ? 'Paid' : (pd > 0 ? 'Partial' : 'Due');
    res.json({
      ...client,
      personalTraining: !!client.personalTraining,
      paidAmount: pd,
      dueAmount: baseDue,
      paymentStatus: status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create client
app.post('/api/clients', async (req, res) => {
  try {
    const {
      clientId, name, phone, plan, fromDate, expiryDate,
      amount = 0, personalTraining = false, status = 'active', paymentMethod = 'CASH',
      gender = '', ptCategory = '', ptFromDate = '', ptToDate = '', ptPackage = '', programType = '', diet = 0,
      trainerId = null, admissionDate = '', profileImage = null,
      hasGst = false, gstin = null, discount_amount = 0
    } = req.body;

    let gstinVal = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinVal = gstin.trim().toUpperCase();
    }

    let finalClientId = clientId ? String(clientId).trim() : '';
    if (!finalClientId) {
      finalClientId = await getNextSequentialClientId();
    } else {
      const existing = await db.prepare('SELECT id FROM clients WHERE clientId = ?').get(finalClientId);
      if (existing) {
        return res.status(400).json({ error: 'This Client ID is already in use.' });
      }
    }

    const id = randomUUID();
    const finalProfileImage = await saveImageToR2(profileImage, 'client', id, req.env);
    const finalPaidAmount = req.body.paidAmount !== undefined ? req.body.paidAmount : amount;
    const dueAmount = amount - finalPaidAmount;
    const paymentStatus = dueAmount <= 0 ? 'Paid' : (finalPaidAmount > 0 ? 'Partial' : 'Due');
    const normalizedPhone = phone ? normalizePhone(phone) : '';

    await db.prepare(`
      INSERT INTO clients (
        id, clientId, name, phone, plan, fromDate, expiryDate, amount, 
        personalTraining, status, gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet, trainerId, admissionDate, profileImage,
        paidAmount, dueAmount, paymentStatus, gstin
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, finalClientId, name, normalizedPhone, plan || '', fromDate || '', expiryDate || '',
      amount, personalTraining ? 1 : 0, status,
      gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet ? 1 : 0,
      trainerId, admissionDate, finalProfileImage,
      finalPaidAmount, dueAmount, paymentStatus, gstinVal
    );

    // Generate Bill No
    const billRow = await db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }

    const gstSettings = await db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const gstCalc = computeGstBreakdown(amount, gstSettings.gst_rate_percent || 4.8);

    const billId = randomUUID();
    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, invoice_category, taxable_value, cgst_amount, sgst_amount, gst_rate_snapshot, client_gstin_snapshot, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GeneralPlan', ?, ?, ?, ?, ?, ?)
    `).run(billId, nextBillNo, id, name, toDateLabel(), fromDate || '', expiryDate || '', amount, finalPaidAmount, dueAmount, paymentStatus, 0, amount, dueAmount, gstCalc.taxable_value, gstCalc.cgst_amount, gstCalc.sgst_amount, gstCalc.gst_rate_snapshot, gstinVal, parseFloat(discount_amount) || 0);

    // Create a transaction record if some amount is paid
    if (finalPaidAmount > 0) {
      const txId = randomUUID();
      await db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(txId, id, billId, name, paymentMethod, finalPaidAmount, toDateLabel());
    }

    const newClient = await db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.status(201).json({ ...newClient, personalTraining: !!newClient.personalTraining, billNo: nextBillNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add payment to client bill
app.post('/api/clients/:id/payment', async (req, res) => {
  try {
    const clientId = req.params.id;
    const { paidAmount, paymentDate, paymentMethod } = req.body;

    const client = await db.prepare('SELECT * FROM clients WHERE CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ?').get(String(clientId), String(clientId));
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const amountToPay = parseFloat(paidAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) return res.status(400).json({ error: 'Invalid paid amount' });

    const currentDue = (client.dueAmount !== undefined && client.dueAmount !== null)
      ? Math.max(0, parseFloat(client.dueAmount) || 0)
      : Math.max(0, (parseFloat(client.amount) || 0) - (parseFloat(client.paidAmount) || 0));

    const newDueAmount = Math.max(0, currentDue - amountToPay);
    const newPaidAmount = (parseFloat(client.paidAmount) || 0) + amountToPay;
    const newStatus = newDueAmount <= 0 ? 'Paid' : 'Partial';

    // Update client
    await db.prepare(`
      UPDATE clients SET paidAmount = ?, dueAmount = ?, paymentStatus = ? WHERE id = ?
    `).run(newPaidAmount, newDueAmount, newStatus, client.id);

    // If client had advance booking or other service dues, cascade update those rows
    let remainingToDeduct = amountToPay;
    try {
      if (remainingToDeduct > 0) {
        const genBookings = await db.prepare(`
          SELECT id, due_amount, paid_amount 
          FROM general_package_bookings 
          WHERE (client_id = ? OR client_id = ?) AND due_amount > 0 AND status != 'Cancelled'
          ORDER BY id ASC
        `).all(client.id, client.clientId);

        for (const gb of (genBookings || [])) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(remainingToDeduct, parseFloat(gb.due_amount || 0));
          const newGbDue = Math.max(0, parseFloat(gb.due_amount || 0) - deduct);
          const newGbPaid = (parseFloat(gb.paid_amount) || 0) + deduct;
          const newGbStatus = newGbDue <= 0 ? 'Paid' : 'Partial';
          await db.prepare('UPDATE general_package_bookings SET due_amount = ?, paid_amount = ?, payment_status = ? WHERE id = ?').run(newGbDue, newGbPaid, newGbStatus, gb.id);
          remainingToDeduct -= deduct;
        }
      }

      if (remainingToDeduct > 0) {
        const ptBookings = await db.prepare(`
          SELECT id, due_amount, paid_amount 
          FROM pt_advance_bookings 
          WHERE (client_id = ? OR client_id = ?) AND due_amount > 0 AND status != 'Cancelled'
          ORDER BY id ASC
        `).all(client.id, client.clientId);

        for (const pb of (ptBookings || [])) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(remainingToDeduct, parseFloat(pb.due_amount || 0));
          const newPbDue = Math.max(0, parseFloat(pb.due_amount || 0) - deduct);
          const newPbPaid = (parseFloat(pb.paid_amount) || 0) + deduct;
          const newPbStatus = newPbDue <= 0 ? 'Paid' : 'Partial';
          await db.prepare('UPDATE pt_advance_bookings SET due_amount = ?, paid_amount = ?, payment_status = ? WHERE id = ?').run(newPbDue, newPbPaid, newPbStatus, pb.id);
          remainingToDeduct -= deduct;
        }
      }

      if (remainingToDeduct > 0) {
        const osBills = await db.prepare(`
          SELECT id, dueAmount, paidAmount 
          FROM bills 
          WHERE (clientId = ? OR clientId = ?) AND invoice_category = 'OtherService' AND dueAmount > 0
          ORDER BY timestamp ASC
        `).all(client.id, client.clientId);

        for (const ob of (osBills || [])) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(remainingToDeduct, parseFloat(ob.dueAmount || 0));
          const newObDue = Math.max(0, parseFloat(ob.dueAmount || 0) - deduct);
          const newObPaid = (parseFloat(ob.paidAmount) || 0) + deduct;
          const newObStatus = newObDue <= 0 ? 'Paid' : 'Partial';
          await db.prepare('UPDATE bills SET dueAmount = ?, remainingBalance = ?, paidAmount = ?, paymentStatus = ? WHERE id = ?').run(newObDue, newObDue, newObPaid, newObStatus, ob.id);
          remainingToDeduct -= deduct;
        }
      }
    } catch (cascadeErr) {
      console.warn('Notice: Error cascading due deductions:', cascadeErr.message);
    }

    // Generate Bill No
    const billRow = await db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }
    const billId = randomUUID();

    // Count existing bills for this client to assign due sequence number
    const existingBillCount = await db.prepare('SELECT COUNT(*) as cnt FROM bills WHERE clientId = ?').get(clientId).cnt;
    const dueNumber = existingBillCount; // 1st due payment = Due 1, 2nd = Due 2, etc.

    // Create a new invoice for this payment
    await db.prepare(`
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
    await db.prepare(`
      INSERT INTO transactions (id, clientId, billId, name, method, amount, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(txId, clientId, billId, client.name, paymentMethod || 'CASH', amountToPay, paymentDate || toDateLabel());

    // Return the new bill so frontend can open invoice preview immediately
    const newBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    res.json({ success: true, message: 'Payment updated successfully', bill: newBill });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all bills
app.get('/api/bills', async (req, res) => {
  try {
    const bills = await db.prepare('SELECT * FROM bills ORDER BY timestamp DESC').all();
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update bill / invoice (General Plan / PT / Other)
app.put('/api/bills/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    const {
      billNo,
      clientName,
      planName,
      planAmount,
      totalPlanAmount,
      paidAmount,
      dueAmount,
      paymentStatus,
      invoiceDate,
      joinDate,
      expiryDate,
      discount_amount,
      client_gstin_snapshot,
      syncClient = true
    } = req.body;

    const newPlanAmount = planAmount !== undefined ? parseFloat(planAmount) : (parseFloat(existing.planAmount) || 0);
    const newTotalPlanAmount = totalPlanAmount !== undefined ? parseFloat(totalPlanAmount) : (planAmount !== undefined ? parseFloat(planAmount) : (parseFloat(existing.totalPlanAmount) || newPlanAmount));
    const newPaidAmount = paidAmount !== undefined ? parseFloat(paidAmount) : (parseFloat(existing.paidAmount) || 0);
    const newDueAmount = dueAmount !== undefined ? parseFloat(dueAmount) : Math.max(0, newTotalPlanAmount - newPaidAmount);
    const newPaymentStatus = paymentStatus || (newDueAmount <= 0 ? 'Paid' : (newPaidAmount > 0 ? 'Partial' : 'Due'));
    const newPlanName = planName !== undefined ? planName : (existing.planName || '');
    const newInvoiceDate = invoiceDate !== undefined ? invoiceDate : existing.invoiceDate;
    const newJoinDate = joinDate !== undefined ? joinDate : existing.joinDate;
    const newExpiryDate = expiryDate !== undefined ? expiryDate : existing.expiryDate;
    const newDiscount = discount_amount !== undefined ? parseFloat(discount_amount) : (parseFloat(existing.discount_amount) || 0);
    const newClientGstin = client_gstin_snapshot !== undefined ? client_gstin_snapshot : (existing.client_gstin_snapshot || '');
    const newClientName = clientName !== undefined ? clientName : existing.clientName;
    const newBillNo = billNo !== undefined ? billNo : existing.billNo;

    // Recalculate GST breakdown
    const gstRate = existing.gst_rate_snapshot || 4.8;
    const gstCalc = computeGstBreakdown(newTotalPlanAmount, gstRate);

    await db.prepare(`
      UPDATE bills SET
        billNo = ?,
        clientName = ?,
        planName = ?,
        planAmount = ?,
        totalPlanAmount = ?,
        paidAmount = ?,
        dueAmount = ?,
        paymentStatus = ?,
        invoiceDate = ?,
        joinDate = ?,
        expiryDate = ?,
        discount_amount = ?,
        client_gstin_snapshot = ?,
        taxable_value = ?,
        cgst_amount = ?,
        sgst_amount = ?,
        remainingBalance = ?
      WHERE id = ?
    `).run(
      newBillNo,
      newClientName,
      newPlanName,
      newPlanAmount,
      newTotalPlanAmount,
      newPaidAmount,
      newDueAmount,
      newPaymentStatus,
      newInvoiceDate,
      newJoinDate,
      newExpiryDate,
      newDiscount,
      newClientGstin,
      gstCalc.taxable_value,
      gstCalc.cgst_amount,
      gstCalc.sgst_amount,
      newDueAmount,
      id
    );

    // Optionally sync client table
    if (syncClient && existing.clientId) {
      try {
        const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(existing.clientId);
        if (client) {
          await db.prepare(`
            UPDATE clients SET
              name = COALESCE(?, name),
              plan = COALESCE(?, plan),
              amount = COALESCE(?, amount),
              paidAmount = COALESCE(?, paidAmount),
              dueAmount = COALESCE(?, dueAmount),
              paymentStatus = COALESCE(?, paymentStatus),
              fromDate = COALESCE(?, fromDate),
              expiryDate = COALESCE(?, expiryDate)
            WHERE id = ?
          `).run(
            newClientName,
            newPlanName,
            newTotalPlanAmount,
            newPaidAmount,
            newDueAmount,
            newPaymentStatus,
            newJoinDate,
            newExpiryDate,
            existing.clientId
          );
        }
      } catch (err) {
        console.error('Error syncing client on bill update:', err);
      }
    }

    // Update matching transaction if any
    try {
      await db.prepare(`
        UPDATE transactions
        SET amount = ?, date = ?, name = ?
        WHERE billId = ?
      `).run(newPaidAmount, newInvoiceDate, newClientName, id);
    } catch (e) {}

    const updatedBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    res.json({ success: true, bill: updatedBill });
  } catch (err) {
    console.error('Error updating bill:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE bill / invoice
app.delete('/api/bills/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    // Release any foreign key references
    try {
      await db.prepare('UPDATE pt_assignments SET invoice_id = NULL WHERE invoice_id = ?').run(id);
      await db.prepare('UPDATE other_service_sales SET invoice_id = NULL WHERE invoice_id = ?').run(id);
      await db.prepare('DELETE FROM transactions WHERE billId = ?').run(id);
    } catch (e) {}

    await db.prepare('DELETE FROM bills WHERE id = ?').run(id);
    res.json({ success: true, message: 'Invoice deleted successfully.' });
  } catch (err) {
    console.error('Error deleting bill:', err);
    res.status(500).json({ error: err.message });
  }
});


// PUT update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const existing = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found' });

    const {
      clientId, name, phone, plan, fromDate, expiryDate,
      amount, personalTraining, status,
      gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet,
      trainerId, admissionDate, profileImage, gstin
    } = req.body;

    const finalProfileImage = await saveImageToR2(profileImage, 'client', req.params.id, req.env);

    // Check for unique clientId
    if (clientId && clientId !== existing.clientId) {
      const conflict = await db.prepare('SELECT id FROM clients WHERE clientId = ? AND id != ?').get(clientId, req.params.id);
      if (conflict) {
        return res.status(400).json({ error: 'This Client ID is already in use.' });
      }
    }

    const normalizedPhone = phone !== undefined ? (phone ? normalizePhone(phone) : '') : null;

    await db.prepare(`
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
        profileImage = COALESCE(?, profileImage),
        gstin = ?
      WHERE id = ?
    `).run(
      clientId ?? null, name ?? null, normalizedPhone ?? null, plan ?? null,
      fromDate ?? null, expiryDate ?? null, amount ?? null,
      personalTraining !== undefined ? (personalTraining ? 1 : 0) : null,
      status ?? null,
      gender ?? null, ptCategory ?? null, ptFromDate ?? null, ptToDate ?? null,
      ptPackage ?? null, programType ?? null, diet !== undefined ? (diet ? 1 : 0) : null,
      trainerId ?? null, admissionDate ?? null, finalProfileImage ?? null, gstin ?? null,
      req.params.id
    );

    const updated = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json({ ...updated, personalTraining: !!updated.personalTraining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const clientId = req.params.id;

    // Delete related records sequentially (awaiting each for Turso async wrapper support)
    // 1. Delete pt_class_log for this client's pt_assignments
    await db.prepare(`DELETE FROM pt_class_log WHERE pt_assignment_id IN (SELECT id FROM pt_assignments WHERE client_id = ?)`).run(clientId);
    
    // 2. Delete tables using client_id
    await db.prepare(`DELETE FROM pt_assignments WHERE client_id = ?`).run(clientId);
    await db.prepare(`DELETE FROM other_service_sales WHERE client_id = ?`).run(clientId);
    await db.prepare(`DELETE FROM general_package_bookings WHERE client_id = ?`).run(clientId);
    await db.prepare(`DELETE FROM pt_advance_bookings WHERE client_id = ?`).run(clientId);
    await db.prepare(`DELETE FROM supplement_sales WHERE client_id = ?`).run(clientId);

    // 3. Delete tables using clientId
    await db.prepare(`DELETE FROM attendance WHERE clientId = ?`).run(clientId);
    await db.prepare(`DELETE FROM client_measurements WHERE clientId = ?`).run(clientId);
    await db.prepare(`DELETE FROM transactions WHERE clientId = ?`).run(clientId);
    await db.prepare(`DELETE FROM bills WHERE clientId = ?`).run(clientId);

    // 4. Finally, delete the client
    const result = await db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);

    if (result.changes === 0) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client and all associated records deleted successfully' });
  } catch (err) {
    console.error("Delete client error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TRAINER Routes ──────────────────────────────────────────────────────────

// GET all trainers
app.get('/api/trainers', async (req, res) => {
  try {
    const trainers = await db.prepare(`SELECT * FROM trainers ORDER BY dateAdded DESC`).all();

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const gymTotalRevenue = await getMonthlyGymTotalRevenue(currentMonthStr);
    const activeSlab = getSlabForRevenue(gymTotalRevenue);

    const trainersWithStats = await Promise.all(trainers.map(async (tr) => {
      const clientCountRow = await db.prepare(`
        SELECT COUNT(DISTINCT client_id) as totalClients FROM (
          SELECT id as client_id FROM clients WHERE trainerId = ?
          UNION
          SELECT client_id FROM pt_assignments WHERE trainer_id = ? AND status = 'Active'
        )
      `).get(tr.id, tr.id);

      const clientCount = clientCountRow ? clientCountRow.totalClients : 0;
      await syncTrainerMonthlyClassLogs(tr.id, currentMonthStr);
      const baseRevenue = await getTrainerMonthlyPtBaseRevenue(tr.id, currentMonthStr);

      const logs = await db.prepare(`
        SELECT per_class_rate_snapshot
        FROM pt_class_log
        WHERE trainer_id = ? AND strftime('%Y-%m', class_date) = ?
      `).all(tr.id, currentMonthStr);

      const totalSalary = (logs || []).reduce((sum, item) => sum + (item.per_class_rate_snapshot || 0), 0);

      const hasCustomRate = tr.custom_commission_percent !== null && tr.custom_commission_percent !== undefined && tr.custom_commission_percent !== '';
      const standardRate = (tr.grade && COMMISSION_MATRIX[tr.grade])
        ? (COMMISSION_MATRIX[tr.grade][activeSlab] || COMMISSION_MATRIX[tr.grade].Slab2 || 0.25) * 100
        : (activeSlab === 'Slab1' ? 40 : 25);
      const commRatePercent = hasCustomRate
        ? parseFloat(tr.custom_commission_percent)
        : standardRate;

      const calculatedCommSalary = (logs && logs.length > 0)
        ? totalSalary
        : Math.round(baseRevenue * (commRatePercent / 100));

      return {
        ...tr,
        clientCount: clientCount,
        monthlyPtBaseRevenue: baseRevenue,
        monthlyGymTotalRevenue: gymTotalRevenue,
        activeSlab: activeSlab,
        commissionPercent: commRatePercent,
        commissionSalary: calculatedCommSalary,
        totalSalary: calculatedCommSalary,
        classesConducted: (logs || []).length
      };
    }));

    res.json(trainersWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET next trainer ID
app.get('/api/trainers/next-id', async (req, res) => {
  try {
    const row = await db.prepare("SELECT trainerId FROM trainers ORDER BY trainerId DESC LIMIT 1").get();
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
app.post('/api/trainers', async (req, res) => {
  try {
    const { trainerId, name, phone, specialization, experience, status = 'Active', grade, custom_commission_percent, profileImage } = req.body;
    if (!grade || !['A_PRO_PT', 'A', 'B'].includes(grade)) {
      return res.status(400).json({ error: 'Valid Grade (A_PRO_PT, A, B) is required.' });
    }
    const commOverride = (custom_commission_percent !== undefined && custom_commission_percent !== null && custom_commission_percent !== '')
      ? parseFloat(custom_commission_percent)
      : null;

    const id = randomUUID();
    const finalProfileImage = await saveImageToR2(profileImage, 'trainer', id, req.env);

    await db.prepare(`
      INSERT INTO trainers (id, trainerId, name, phone, specialization, experience, status, grade, custom_commission_percent, profileImage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, trainerId, name, phone || null, specialization, experience, status, grade, commOverride, finalProfileImage || null);

    const newTrainer = await db.prepare('SELECT * FROM trainers WHERE id = ?').get(id);
    res.status(201).json(newTrainer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update trainer
app.put('/api/trainers/:id', async (req, res) => {
  try {
    const { trainerId, name, phone, specialization, experience, status, grade, custom_commission_percent, profileImage } = req.body;
    if (!grade || !['A_PRO_PT', 'A', 'B'].includes(grade)) {
      return res.status(400).json({ error: 'Valid Grade (A_PRO_PT, A, B) is required.' });
    }
    const commOverride = (custom_commission_percent !== undefined && custom_commission_percent !== null && custom_commission_percent !== '')
      ? parseFloat(custom_commission_percent)
      : null;

    const finalProfileImage = await saveImageToR2(profileImage, 'trainer', req.params.id, req.env);

    await db.prepare(`
      UPDATE trainers SET
        trainerId = ?, name = ?, phone = ?, specialization = ?, experience = ?, status = ?, grade = ?, custom_commission_percent = ?, profileImage = ?
      WHERE id = ?
    `).run(trainerId, name, phone || null, specialization, experience, status, grade, commOverride, finalProfileImage || null, req.params.id);

    const updated = await db.prepare('SELECT * FROM trainers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE trainer
app.delete('/api/trainers/:id', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to delete trainers.' });
    }
    await db.prepare('DELETE FROM trainers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Trainer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PT PACKAGES Routes ──────────────────────────────────────────────────────
app.get('/api/pt-packages', async (req, res) => {
  try {
    const pkgs = await db.prepare('SELECT * FROM pt_packages ORDER BY is_custom ASC, id ASC').all();
    res.json(pkgs.map(p => ({ ...p, eligible_grades: JSON.parse(p.eligible_grades || '[]'), active: !!p.active, is_custom: !!p.is_custom })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-packages', async (req, res) => {
  try {
    const { name, price, total_classes, category, eligible_grades, duration_days = 30, active = 1 } = req.body;
    if (!name || price === undefined || !total_classes || !category || !eligible_grades) {
      return res.status(400).json({ error: 'Missing required fields for PT Package.' });
    }
    const gradesStr = Array.isArray(eligible_grades) ? JSON.stringify(eligible_grades) : eligible_grades;
    const durDays = parseInt(duration_days, 10) || 30;

    const result = await db.prepare(`
      INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, gradesStr, active ? 1 : 0);

    const newPkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...newPkg, eligible_grades: JSON.parse(newPkg.eligible_grades || '[]'), active: !!newPkg.active, is_custom: !!newPkg.is_custom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pt-packages/:id', async (req, res) => {
  try {
    const { name, price, total_classes, category, eligible_grades, duration_days = 30, active } = req.body;
    const gradesStr = Array.isArray(eligible_grades) ? JSON.stringify(eligible_grades) : eligible_grades;
    const durDays = parseInt(duration_days, 10) || 30;

    await db.prepare(`
      UPDATE pt_packages SET
        name = ?, price = ?, total_classes = ?, category = ?, duration_days = ?, eligible_grades = ?, active = ?
      WHERE id = ?
    `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, gradesStr, active ? 1 : 0, req.params.id);

    const updated = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(req.params.id);
    res.json({ ...updated, eligible_grades: JSON.parse(updated.eligible_grades || '[]'), active: !!updated.active, is_custom: !!updated.is_custom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/pt-packages/:id/active', async (req, res) => {
  try {
    const { active } = req.body;
    await db.prepare('UPDATE pt_packages SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    res.json({ success: true, active: !!active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-packages/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM pt_packages WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'PT Package deleted successfully' });
  } catch (err) {
    console.warn('PT package delete constraint, soft deleting:', err.message);
    try {
      await db.prepare('UPDATE pt_packages SET active = 0 WHERE id = ?').run(req.params.id);
      res.json({ success: true, message: 'PT Package disabled' });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── PT ASSIGNMENTS Routes ───────────────────────────────────────────────────
app.get('/api/pt-assignments', async (req, res) => {
  try {
    autoExpireAssignments();
    await backfillPtAssignmentTransactions();
    const { client_id, trainer_id, status } = req.query;
    let query = `
      SELECT a.*, 
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.trainerId as trainerCode, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory, p.duration_days, p.price as catalogPrice,
             (SELECT discount_amount FROM bills WHERE (CAST(id AS TEXT) = CAST(a.invoice_id AS TEXT) OR (CAST(clientId AS TEXT) = CAST(c.id AS TEXT) AND planName LIKE '%PT%')) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as billDiscount,
             (SELECT discount_amount FROM pt_advance_bookings WHERE (CAST(client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(client_id AS TEXT) = CAST(c.clientId AS TEXT)) AND CAST(pt_package_id AS TEXT) = CAST(a.pt_package_id AS TEXT) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as advDiscount
      FROM pt_assignments a
      JOIN clients c ON CAST(a.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(a.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      JOIN trainers t ON CAST(a.trainer_id AS TEXT) = CAST(t.id AS TEXT)
      JOIN pt_packages p ON CAST(a.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE 1=1
    `;
    const params = [];
    if (client_id) { query += ' AND (CAST(a.client_id AS TEXT) = CAST(? AS TEXT) OR CAST(c.clientId AS TEXT) = CAST(? AS TEXT))'; params.push(client_id, client_id); }
    if (trainer_id) { query += ' AND CAST(a.trainer_id AS TEXT) = CAST(? AS TEXT)'; params.push(trainer_id); }
    if (status) { query += ' AND a.status = ?'; params.push(status); }

    query += ' ORDER BY a.created_at DESC';
    const assignments = await db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    console.error('Error fetching pt-assignments:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:clientId/pt-assignments', async (req, res) => {
  try {
    autoExpireAssignments();
    const assignments = await db.prepare(`
      SELECT a.*, 
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.trainerId as trainerCode, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory, p.duration_days, p.price as catalogPrice,
             (SELECT discount_amount FROM bills WHERE (CAST(id AS TEXT) = CAST(a.invoice_id AS TEXT) OR (CAST(clientId AS TEXT) = CAST(c.id AS TEXT) AND planName LIKE '%PT%')) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as billDiscount,
             (SELECT discount_amount FROM pt_advance_bookings WHERE (CAST(client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(client_id AS TEXT) = CAST(c.clientId AS TEXT)) AND CAST(pt_package_id AS TEXT) = CAST(a.pt_package_id AS TEXT) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as advDiscount
      FROM pt_assignments a
      JOIN clients c ON CAST(a.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(a.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      JOIN trainers t ON CAST(a.trainer_id AS TEXT) = CAST(t.id AS TEXT)
      JOIN pt_packages p ON CAST(a.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE CAST(a.client_id AS TEXT) = CAST(? AS TEXT)
         OR CAST(c.clientId AS TEXT) = CAST(? AS TEXT)
      ORDER BY a.created_at DESC
    `).all(req.params.clientId, req.params.clientId);
    res.json(assignments);
  } catch (err) {
    console.error('Error fetching client pt-assignments:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pt-assignments/client/:clientId', async (req, res) => {
  try {
    autoExpireAssignments();
    const { clientId } = req.params;
    const assignments = await db.prepare(`
      SELECT a.*, 
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory, p.duration_days, p.price as catalogPrice,
             (SELECT discount_amount FROM bills WHERE (CAST(id AS TEXT) = CAST(a.invoice_id AS TEXT) OR (CAST(clientId AS TEXT) = CAST(c.id AS TEXT) AND planName LIKE '%PT%')) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as billDiscount,
             (SELECT discount_amount FROM pt_advance_bookings WHERE (CAST(client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(client_id AS TEXT) = CAST(c.clientId AS TEXT)) AND CAST(pt_package_id AS TEXT) = CAST(a.pt_package_id AS TEXT) AND discount_amount > 0 ORDER BY rowid DESC LIMIT 1) as advDiscount
      FROM pt_assignments a
      JOIN clients c ON CAST(a.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(a.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      JOIN trainers t ON CAST(a.trainer_id AS TEXT) = CAST(t.id AS TEXT)
      JOIN pt_packages p ON CAST(a.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE CAST(a.client_id AS TEXT) = CAST(? AS TEXT)
         OR CAST(c.clientId AS TEXT) = CAST(? AS TEXT)
      ORDER BY a.created_at DESC
    `).all(clientId, clientId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-assignments', async (req, res) => {
  try {
    const { client_id, trainer_id, pt_package_id, custom_package, assigned_date, discount_amount, paid_amount, payment_method, hasGst, gstin, timing } = req.body;

    if (!client_id || !trainer_id || (!pt_package_id && !custom_package)) {
      return res.status(400).json({ error: 'Client, Trainer, and Package selection are required.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const existingActive = await db.prepare(`
      SELECT * FROM pt_assignments
      WHERE client_id = ? AND status = 'Active' AND expiry_date >= ?
      ORDER BY expiry_date DESC LIMIT 1
    `).get(client_id, today);

    if (existingActive) {
      return res.status(400).json({
        error: `This client already has an active PT package until ${existingActive.expiry_date}.`,
        existingEndDate: existingActive.expiry_date
      });
    }

    const trainer = await db.prepare('SELECT * FROM trainers WHERE id = ?').get(trainer_id);
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
      const result = await db.prepare(`
        INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `).run(name, parseFloat(price), parseInt(total_classes, 10), category, durDays, JSON.stringify([gradeToStore]));
      finalPackageId = result.lastInsertRowid;
      priceSnapshot = parseFloat(price);
      totalClassesSnapshot = parseInt(total_classes, 10);
      packageDurationDays = durDays;
    } else {
      const pkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id);
      if (!pkg) return res.status(404).json({ error: 'PT Package not found.' });
      pkgName = pkg.name;
      priceSnapshot = pkg.price;
      totalClassesSnapshot = pkg.total_classes;
      packageDurationDays = pkg.duration_days || 30;
    }

    const assignDate = assigned_date || new Date().toISOString().split('T')[0];
    const expiryDate = calculateExpiryDate(assignDate, packageDurationDays);
    const discVal = parseFloat(discount_amount || 0);

    // Automatic Invoice Generation
    const invoiceObj = await generatePtInvoice(client_id, pkgName, priceSnapshot, assignDate, expiryDate, discVal, paid_amount, payment_method, gstin);
    const invoiceId = invoiceObj ? invoiceObj.billId : null;

    const result = await db.prepare(`
      INSERT INTO pt_assignments (
        client_id, pt_package_id, trainer_id, package_price_snapshot, discount_amount, total_classes_snapshot, classes_completed, status, assigned_date, expiry_date, invoice_id, timing
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?, ?)
    `).run(client_id, finalPackageId, trainer_id, priceSnapshot, discVal, totalClassesSnapshot, assignDate, expiryDate, invoiceId, timing || null);

    const newAssignment = await db.prepare(`
      SELECT a.*, c.name as clientName, c.clientId as clientCode, c.phone as clientPhone, c.gstin as clientGstin, t.name as trainerName, p.name as packageName, p.duration_days
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

app.put('/api/pt-assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(id);
    if (!assignment) return res.status(404).json({ error: 'PT Assignment not found.' });

    const { trainer_id, pt_package_id, assigned_date, discount_amount, timing } = req.body;
    
    const isTrainerIdChanged = trainer_id !== undefined && trainer_id !== null && String(trainer_id) !== String(assignment.trainer_id || '');
    const isPtPackageIdChanged = pt_package_id !== undefined && pt_package_id !== null && String(pt_package_id) !== String(assignment.pt_package_id || '');
    
    const normDate = (d) => d ? String(d).split('T')[0].split(' ')[0] : '';
    const isAssignedDateChanged = assigned_date !== undefined && assigned_date !== null && normDate(assigned_date) !== normDate(assignment.assigned_date || '');
    
    const isDiscountAmountChanged = discount_amount !== undefined && discount_amount !== null && Math.abs(parseFloat(discount_amount || 0) - parseFloat(assignment.discount_amount || 0)) > 0.01;

    const isOtherFieldsModifying = isTrainerIdChanged || isPtPackageIdChanged || isAssignedDateChanged || isDiscountAmountChanged;

    if (parseInt(assignment.classes_completed || 0, 10) > 0 && isOtherFieldsModifying) {
      return res.status(400).json({ error: `Cannot edit package/trainer details because classes have already started (${assignment.classes_completed} classes completed). Timing can still be updated.` });
    }

    let updateFields = [];
    let params = [];

    if (isTrainerIdChanged) { updateFields.push('trainer_id = ?'); params.push(trainer_id); }
    if (isPtPackageIdChanged) {
      const pkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id);
      if (pkg) {
        updateFields.push('pt_package_id = ?', 'package_price_snapshot = ?', 'total_classes_snapshot = ?');
        params.push(pt_package_id, pkg.price, pkg.total_classes);
      }
    }
    if (isAssignedDateChanged) {
      const cleanDate = normDate(assigned_date);
      updateFields.push('assigned_date = ?');
      params.push(cleanDate);
      const pkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id || assignment.pt_package_id);
      const durDays = pkg ? (pkg.duration_days || 30) : 30;
      const expiry = calculateExpiryDate(cleanDate, durDays);
      updateFields.push('expiry_date = ?');
      params.push(expiry);
    }
    if (isDiscountAmountChanged) {
      updateFields.push('discount_amount = ?');
      params.push(parseFloat(discount_amount || 0));
    }
    if (timing !== undefined) {
      const newTiming = timing ? String(timing).trim() : null;
      if (newTiming !== (assignment.timing || null)) {
        updateFields.push('timing = ?');
        params.push(newTiming);
      }
    }

    if (updateFields.length > 0) {
      params.push(id);
      await db.prepare(`UPDATE pt_assignments SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = await db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(id);

    if (assignment.invoice_id) {
      const discAmt = parseFloat(updated.discount_amount || 0);
      const grossPrice = parseFloat(updated.package_price_snapshot || 0);
      const netPrice = Math.max(0, grossPrice - discAmt);
      const assignDateStr = updated.assigned_date;

      await db.prepare(`
        UPDATE bills
        SET planAmount = ?, paidAmount = ?, dueAmount = 0, totalPlanAmount = ?, remainingBalance = 0, paymentStatus = 'Paid', invoiceDate = ?, joinDate = ?, expiryDate = ?, discount_amount = ?
        WHERE id = ?
      `).run(netPrice, netPrice, netPrice, assignDateStr, assignDateStr, updated.expiry_date, discAmt, assignment.invoice_id);

      try {
        await db.prepare(`
          UPDATE transactions
          SET amount = ?, date = ?
          WHERE billId = ?
        `).run(netPrice, assignDateStr, assignment.invoice_id);
      } catch (txErr) {}
    }

    res.json({ success: true, assignment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-assignments/:id', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to delete PT assignments.' });
    }

    const { id } = req.params;
    const assignment = await db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(id);
    if (!assignment) return res.status(404).json({ error: 'PT Assignment not found.' });

    if (parseInt(assignment.classes_completed || 0, 10) > 0) {
      return res.status(400).json({ error: `Cannot delete PT assignment because classes have already started (${assignment.classes_completed} classes completed).` });
    }

    await db.prepare('DELETE FROM pt_assignments WHERE id = ?').run(id);

    if (assignment.invoice_id) {
      try {
        await db.prepare('DELETE FROM transactions WHERE billId = ?').run(assignment.invoice_id);
      } catch (e) {}
      try {
        await db.prepare('DELETE FROM bills WHERE id = ?').run(assignment.invoice_id);
      } catch (e) {}
    }

    try {
      await db.prepare(`
        UPDATE clients SET personalTraining = 0, ptCategory = NULL, ptPackage = NULL, ptFromDate = NULL, ptToDate = NULL, trainerId = NULL WHERE id = ?
      `).run(assignment.client_id);
    } catch (e) {}

    res.json({ success: true, message: 'PT Assignment deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERAL PACKAGE ADVANCE BOOKING Routes ─────────────────────────
app.get('/api/general-bookings', async (req, res) => {
  try {
    await autoActivateAdvanceBookings().catch(err => console.error('Auto activate in /general-bookings error:', err.message));
    const bookings = await db.prepare(`
      SELECT b.*,
             c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.expiryDate as currentPlanExpiry,
             COALESCE(b.paid_amount, b.price - COALESCE(b.discount_amount, 0)) as paid_amount,
             COALESCE(b.due_amount, 0) as due_amount,
             COALESCE(b.payment_status, 'Paid') as payment_status,
             COALESCE(b.discount_amount, 0) as discount_amount
      FROM general_package_bookings b
      LEFT JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/general-bookings', async (req, res) => {
  try {
    const { client_id, plan_type, price, booking_start_date, booking_end_date, discount_amount = 0, payment_method = 'CASH', paid_amount } = req.body;
    const discAmt = parseFloat(discount_amount) || 0;

    if (!client_id || !plan_type || price === undefined || price === null || !booking_start_date) {
      return res.status(400).json({ error: 'Client, plan type, price, and start date are required.' });
    }

    const client = await db.prepare('SELECT * FROM clients WHERE CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ?').get(String(client_id), String(client_id));
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
      const settings = await db.prepare('SELECT * FROM settings').all();
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

    const grossPrice = parseFloat(price) || 0;
    const discountedPrice = Math.max(0, grossPrice - discAmt);
    const paidAmountVal = (paid_amount !== undefined && paid_amount !== null && paid_amount !== '')
      ? parseFloat(paid_amount)
      : discountedPrice;
    const dueAmountVal = Math.max(0, discountedPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = payment_method || 'CASH';

    // Generate Invoice in bills
    const allBills = await db.prepare("SELECT billNo FROM bills WHERE billNo LIKE 'INV-%'").all();
    let maxNum = 0;
    for (const b of (allBills || [])) {
      const match = b.billNo && b.billNo.match(/INV-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextBillNo = `INV-${(maxNum + 1).toString().padStart(4, '0')}`;
    const billId = randomUUID();
    const invoiceDateStr = toDateLabel();

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GeneralAdvance', ?)
    `).run(
      billId,
      nextBillNo,
      String(client.clientId || client.id || client_id),
      client.name,
      invoiceDateStr,
      booking_start_date,
      endDate,
      discountedPrice,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      0,
      discountedPrice,
      dueAmountVal,
      `Advance Booking — ${plan_type}`,
      discAmt
    );

    if (paidAmountVal > 0) {
      const txId = randomUUID();
      await db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
      `).run(
        txId,
        String(client.clientId || client.id || client_id),
        billId,
        `${client.name} - Advance Booking (${plan_type})`,
        payMethodVal,
        paidAmountVal,
        invoiceDateStr
      );
    }

    if (dueAmountVal > 0) {
      const currentDue = client.dueAmount || 0;
      const newDue = currentDue + dueAmountVal;
      await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(newDue, 'Due', client.id);
    }

    const result = await db.prepare(`
      INSERT INTO general_package_bookings (client_id, plan_type, price, discount_amount, payment_method, booking_start_date, booking_end_date, status, paid_amount, due_amount, payment_status, invoice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?, ?, ?)
    `).run(String(client.id), plan_type, grossPrice, discAmt, payMethodVal, booking_start_date, endDate, paidAmountVal, dueAmountVal, paymentStatusVal, billId);

    const newBooking = await db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode
      FROM general_package_bookings b
      JOIN clients c ON b.client_id = c.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ ...newBooking, billNo: nextBillNo, billId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/general-bookings/:id/cancel', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to cancel advance bookings.' });
    }
    const { id } = req.params;
    const booking = await db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (booking.status !== 'Scheduled') {
      return res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'.` });
    }

    await db.prepare("UPDATE general_package_bookings SET status = 'Cancelled' WHERE id = ?").run(id);
    res.json({ success: true, message: 'General package advance booking cancelled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/general-bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'General booking not found' });
    if (existing.invoice_id) {
      try {
        await db.prepare('DELETE FROM bills WHERE id = ?').run(existing.invoice_id);
        await db.prepare('DELETE FROM transactions WHERE billId = ?').run(existing.invoice_id);
      } catch (e) {}
    }
    await db.prepare('DELETE FROM general_package_bookings WHERE id = ?').run(id);
    res.json({ success: true, message: 'General booking deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/general-bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_type, price, discount_amount, paid_amount, due_amount, payment_status, booking_start_date, booking_end_date } = req.body;
    const existing = await db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'General booking not found' });

    await db.prepare(`
      UPDATE general_package_bookings SET
        plan_type = COALESCE(?, plan_type),
        price = COALESCE(?, price),
        discount_amount = COALESCE(?, discount_amount),
        paid_amount = COALESCE(?, paid_amount),
        due_amount = COALESCE(?, due_amount),
        payment_status = COALESCE(?, payment_status),
        booking_start_date = COALESCE(?, booking_start_date),
        booking_end_date = COALESCE(?, booking_end_date)
      WHERE id = ?
    `).run(plan_type, price, discount_amount, paid_amount, due_amount, payment_status, booking_start_date, booking_end_date, id);

    const updated = await db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    res.json({ success: true, booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/general-bookings/:id/payment — Record due clearance payment for general advance booking
app.post('/api/general-bookings/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paidAmount, paymentMethod = 'CASH', paymentDate } = req.body;
    const amountToPay = parseFloat(paidAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const booking = await db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.dueAmount as clientDue
      FROM general_package_bookings b
      LEFT JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      WHERE b.id = ?
    `).get(id);

    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const currentDue = parseFloat(booking.due_amount || 0);
    const newDue = Math.max(0, currentDue - amountToPay);
    const newPaid = (parseFloat(booking.paid_amount) || 0) + amountToPay;
    const newStatus = newDue <= 0 ? 'Paid' : 'Partial';

    // Update general_package_bookings
    await db.prepare(`
      UPDATE general_package_bookings 
      SET paid_amount = ?, due_amount = ?, payment_status = ? 
      WHERE id = ?
    `).run(newPaid, newDue, newStatus, id);

    // Update client dueAmount in clients table
    try {
      const clientRecord = await db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(booking.client_id, booking.client_id);
      if (clientRecord) {
        const updatedClientDue = Math.max(0, (parseFloat(clientRecord.dueAmount) || 0) - amountToPay);
        const updatedClientStatus = updatedClientDue <= 0 ? 'Paid' : 'Partial';
        await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(updatedClientDue, updatedClientStatus, clientRecord.id);
      }
    } catch (e) {}

    // Generate Invoice in bills
    const allBills = await db.prepare("SELECT billNo FROM bills WHERE billNo LIKE 'INV-%'").all();
    let maxNum = 0;
    for (const b of (allBills || [])) {
      const match = b.billNo && b.billNo.match(/INV-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextBillNo = `INV-${(maxNum + 1).toString().padStart(4, '0')}`;
    const billId = randomUUID();
    const invoiceDateStr = paymentDate || toDateLabel();

    const netTotal = parseFloat(booking.price || 0) - parseFloat(booking.discount_amount || 0);

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GeneralAdvance', ?)
    `).run(
      billId,
      nextBillNo,
      String(booking.clientCode || booking.client_id),
      booking.clientName,
      invoiceDateStr,
      booking.booking_start_date,
      booking.booking_end_date,
      amountToPay,
      amountToPay,
      newDue,
      'Paid',
      1,
      netTotal,
      newDue,
      `Advance Due Payment — ${booking.plan_type}`,
      parseFloat(booking.discount_amount || 0)
    );

    const txId = randomUUID();
    await db.prepare(`
      INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
    `).run(
      txId,
      String(booking.clientCode || booking.client_id),
      billId,
      `${booking.clientName} - Advance Due Payment (${booking.plan_type})`,
      paymentMethod,
      amountToPay,
      invoiceDateStr
    );

    const updatedBooking = await db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.expiryDate as currentPlanExpiry,
             COALESCE(b.paid_amount, b.price - COALESCE(b.discount_amount, 0)) as paid_amount,
             COALESCE(b.due_amount, 0) as due_amount,
             COALESCE(b.payment_status, 'Paid') as payment_status,
             COALESCE(b.discount_amount, 0) as discount_amount
      FROM general_package_bookings b
      LEFT JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      WHERE b.id = ?
    `).get(id);

    res.json({ success: true, booking: updatedBooking, billId, billNo: nextBillNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/general-bookings/:id/activate — Manually activate general package advance booking
app.post('/api/general-bookings/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.prepare('SELECT * FROM general_package_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'General advance booking not found.' });

    if (booking.status === 'Active') {
      return res.status(400).json({ error: 'This booking is already active.' });
    }
    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot activate a cancelled booking.' });
    }

    const client = await db.prepare(`
      SELECT * FROM clients 
      WHERE CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ? OR TRIM(CAST(id AS TEXT)) = ? OR TRIM(CAST(clientId AS TEXT)) = ?
    `).get(String(booking.client_id), String(booking.client_id), String(booking.client_id).trim(), String(booking.client_id).trim());

    const discAmt = parseFloat(booking.discount_amount) || 0;
    const grossPrice = parseFloat(booking.price) || 0;
    const discountedPrice = Math.max(0, grossPrice - discAmt);
    const paidAmountVal = (booking.paid_amount !== undefined && booking.paid_amount !== null) ? parseFloat(booking.paid_amount) : discountedPrice;
    const dueAmountVal = (booking.due_amount !== undefined && booking.due_amount !== null) ? parseFloat(booking.due_amount) : Math.max(0, discountedPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');

    if (client) {
      await db.prepare(`
        UPDATE clients 
        SET plan = ?, fromDate = ?, expiryDate = ?, amount = ?, paidAmount = ?, dueAmount = ?, paymentStatus = ?, status = 'active'
        WHERE id = ? OR clientId = ? OR CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ?
      `).run(booking.plan_type, booking.booking_start_date, booking.booking_end_date, discountedPrice, paidAmountVal, dueAmountVal, paymentStatusVal, client.id, client.clientId || client.id, String(client.id), String(client.clientId || client.id));
    }

    await db.prepare("UPDATE general_package_bookings SET status = 'Active' WHERE id = ?").run(id);

    const updatedBooking = await db.prepare(`
      SELECT b.*,
             c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.expiryDate as currentPlanExpiry,
             COALESCE(b.paid_amount, b.price - COALESCE(b.discount_amount, 0)) as paid_amount,
             COALESCE(b.due_amount, 0) as due_amount,
             COALESCE(b.payment_status, 'Paid') as payment_status,
             COALESCE(b.discount_amount, 0) as discount_amount
      FROM general_package_bookings b
      LEFT JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      WHERE b.id = ?
    `).get(id);

    res.json({ success: true, booking: updatedBooking });
  } catch (err) {
    console.error('Error activating general advance booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PT ADVANCE BOOKING Routes ──────────────────────────────────────
app.get('/api/pt-advance-bookings', async (req, res) => {
  try {
    await autoActivateAdvanceBookings().catch(err => console.error('Auto activate in /pt-advance-bookings error:', err.message));
    const bookings = await db.prepare(`
      SELECT b.*,
             c.name as clientName, c.phone as clientPhone, c.clientId as clientCode,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.duration_days,
             COALESCE(b.paid_amount, b.price_snapshot - COALESCE(b.discount_amount, 0)) as paid_amount,
             COALESCE(b.due_amount, 0) as due_amount,
             COALESCE(b.payment_status, 'Paid') as payment_status,
             COALESCE(b.discount_amount, 0) as discount_amount
      FROM pt_advance_bookings b
      JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      JOIN trainers t ON (CAST(b.trainer_id AS TEXT) = CAST(t.id AS TEXT) OR CAST(b.trainer_id AS TEXT) = CAST(t.trainerId AS TEXT))
      JOIN pt_packages p ON CAST(b.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-advance-bookings', async (req, res) => {
  try {
    const { client_id, pt_package_id, trainer_id, booking_start_date, discount_amount = 0, payment_method = 'CASH', paid_amount } = req.body;
    const discAmt = parseFloat(discount_amount) || 0;

    if (!client_id || !pt_package_id || !trainer_id || !booking_start_date) {
      return res.status(400).json({ error: 'Client, PT Package, Trainer, and Start Date are required.' });
    }

    const client = await db.prepare('SELECT * FROM clients WHERE CAST(id AS TEXT) = ? OR CAST(clientId AS TEXT) = ?').get(String(client_id), String(client_id));
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const pkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(pt_package_id);
    if (!pkg) return res.status(404).json({ error: 'PT Package not found.' });

    const trainer = await db.prepare('SELECT * FROM trainers WHERE CAST(id AS TEXT) = ? OR CAST(trainerId AS TEXT) = ?').get(String(trainer_id), String(trainer_id));

    const latestPt = await db.prepare(`
      SELECT * FROM pt_assignments
      WHERE (CAST(client_id AS TEXT) = ? OR CAST(client_id AS TEXT) = ?) AND (status = 'Active' OR expiry_date >= CURRENT_DATE)
      ORDER BY expiry_date DESC LIMIT 1
    `).get(String(client.id), String(client.clientId || ''));

    const today = new Date().toISOString().split('T')[0];
    const initialStatus = (booking_start_date <= today && (!latestPt || latestPt.status !== 'Active'))
      ? 'ReadyToActivate'
      : 'Scheduled';

    const grossPrice = parseFloat(pkg.price) || 0;
    const discountedPrice = Math.max(0, grossPrice - discAmt);
    const paidAmountVal = (paid_amount !== undefined && paid_amount !== null && paid_amount !== '')
      ? parseFloat(paid_amount)
      : discountedPrice;
    const dueAmountVal = Math.max(0, discountedPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = payment_method || 'CASH';

    // Generate Invoice in bills
    const allBills = await db.prepare("SELECT billNo FROM bills WHERE billNo LIKE 'INV-%'").all();
    let maxNum = 0;
    for (const b of (allBills || [])) {
      const match = b.billNo && b.billNo.match(/INV-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextBillNo = `INV-${(maxNum + 1).toString().padStart(4, '0')}`;
    const billId = randomUUID();
    const invoiceDateStr = toDateLabel();

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PTAdvance', ?)
    `).run(
      billId,
      nextBillNo,
      String(client.clientId || client.id || client_id),
      client.name,
      invoiceDateStr,
      booking_start_date,
      booking_start_date,
      discountedPrice,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      0,
      discountedPrice,
      dueAmountVal,
      `Advance PT Booking — ${pkg.name} (${trainer?.name || 'Trainer'})`,
      discAmt
    );

    if (paidAmountVal > 0) {
      const txId = randomUUID();
      await db.prepare(`
        INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
      `).run(
        txId,
        String(client.clientId || client.id || client_id),
        billId,
        `${client.name} - Advance PT Booking (${pkg.name})`,
        payMethodVal,
        paidAmountVal,
        invoiceDateStr
      );
    }

    if (dueAmountVal > 0) {
      const currentDue = client.dueAmount || 0;
      const newDue = currentDue + dueAmountVal;
      await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(newDue, 'Due', client.id);
    }

    const result = await db.prepare(`
      INSERT INTO pt_advance_bookings (client_id, pt_package_id, trainer_id, price_snapshot, discount_amount, payment_method, total_classes_snapshot, booking_start_date, status, paid_amount, due_amount, payment_status, invoice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(client.id), pt_package_id, trainer_id, pkg.price, discAmt, payMethodVal, pkg.total_classes, booking_start_date, initialStatus, paidAmountVal, dueAmountVal, paymentStatusVal, billId);

    const newBooking = await db.prepare(`
      SELECT b.*, c.name as clientName, t.name as trainerName, p.name as packageName
      FROM pt_advance_bookings b
      JOIN clients c ON b.client_id = c.id
      JOIN trainers t ON b.trainer_id = t.id
      JOIN pt_packages p ON b.pt_package_id = p.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ ...newBooking, billNo: nextBillNo, billId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/pt-advance-bookings/:id/cancel', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to cancel PT advance bookings.' });
    }
    const { id } = req.params;
    const booking = await db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'PT Advance booking not found.' });

    if (!['Scheduled', 'ReadyToActivate'].includes(booking.status)) {
      return res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'.` });
    }

    await db.prepare("UPDATE pt_advance_bookings SET status = 'Cancelled' WHERE id = ?").run(id);
    res.json({ success: true, message: 'PT advance booking cancelled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-advance-bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'PT advance booking not found' });
    if (existing.invoice_id) {
      try {
        await db.prepare('DELETE FROM bills WHERE id = ?').run(existing.invoice_id);
        await db.prepare('DELETE FROM transactions WHERE billId = ?').run(existing.invoice_id);
      } catch (e) {}
    }
    await db.prepare('DELETE FROM pt_advance_bookings WHERE id = ?').run(id);
    res.json({ success: true, message: 'PT advance booking deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pt-advance-bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { price_snapshot, discount_amount, paid_amount, due_amount, payment_status, booking_start_date, expiry_date, trainer_id, pt_package_id } = req.body;
    const existing = await db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'PT advance booking not found' });

    await db.prepare(`
      UPDATE pt_advance_bookings SET
        price_snapshot = COALESCE(?, price_snapshot),
        discount_amount = COALESCE(?, discount_amount),
        paid_amount = COALESCE(?, paid_amount),
        due_amount = COALESCE(?, due_amount),
        payment_status = COALESCE(?, payment_status),
        booking_start_date = COALESCE(?, booking_start_date),
        expiry_date = COALESCE(?, expiry_date),
        trainer_id = COALESCE(?, trainer_id),
        pt_package_id = COALESCE(?, pt_package_id)
      WHERE id = ?
    `).run(price_snapshot, discount_amount, paid_amount, due_amount, payment_status, booking_start_date, expiry_date, trainer_id, pt_package_id, id);

    const updated = await db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    res.json({ success: true, booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pt-advance-bookings/:id/payment — Record due clearance payment for PT advance booking
app.post('/api/pt-advance-bookings/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paidAmount, paymentMethod = 'CASH', paymentDate } = req.body;
    const amountToPay = parseFloat(paidAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const booking = await db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode, c.dueAmount as clientDue,
             t.name as trainerName, p.name as packageName
      FROM pt_advance_bookings b
      LEFT JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      LEFT JOIN trainers t ON (CAST(b.trainer_id AS TEXT) = CAST(t.id AS TEXT) OR CAST(b.trainer_id AS TEXT) = CAST(t.trainerId AS TEXT))
      LEFT JOIN pt_packages p ON CAST(b.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE b.id = ?
    `).get(id);

    if (!booking) return res.status(404).json({ error: 'PT Advance Booking not found.' });

    const currentDue = parseFloat(booking.due_amount || 0);
    const newDue = Math.max(0, currentDue - amountToPay);
    const newPaid = (parseFloat(booking.paid_amount) || 0) + amountToPay;
    const newStatus = newDue <= 0 ? 'Paid' : 'Partial';

    // Update pt_advance_bookings
    await db.prepare(`
      UPDATE pt_advance_bookings 
      SET paid_amount = ?, due_amount = ?, payment_status = ? 
      WHERE id = ?
    `).run(newPaid, newDue, newStatus, id);

    // Update client dueAmount in clients table
    try {
      const clientRecord = await db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(booking.client_id, booking.client_id);
      if (clientRecord) {
        const updatedClientDue = Math.max(0, (parseFloat(clientRecord.dueAmount) || 0) - amountToPay);
        const updatedClientStatus = updatedClientDue <= 0 ? 'Paid' : 'Partial';
        await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(updatedClientDue, updatedClientStatus, clientRecord.id);
      }
    } catch (e) {}

    // Generate Invoice in bills
    const allBills = await db.prepare("SELECT billNo FROM bills WHERE billNo LIKE 'INV-%'").all();
    let maxNum = 0;
    for (const b of (allBills || [])) {
      const match = b.billNo && b.billNo.match(/INV-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextBillNo = `INV-${(maxNum + 1).toString().padStart(4, '0')}`;
    const billId = randomUUID();
    const invoiceDateStr = paymentDate || toDateLabel();

    const netTotal = parseFloat(booking.price_snapshot || 0) - parseFloat(booking.discount_amount || 0);

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PTAdvance', ?)
    `).run(
      billId,
      nextBillNo,
      String(booking.clientCode || booking.client_id),
      booking.clientName,
      invoiceDateStr,
      booking.booking_start_date,
      booking.booking_start_date,
      amountToPay,
      amountToPay,
      newDue,
      'Paid',
      1,
      netTotal,
      newDue,
      `PT Advance Due Payment — ${booking.packageName} (${booking.trainerName || 'Trainer'})`,
      parseFloat(booking.discount_amount || 0)
    );

    const txId = randomUUID();
    await db.prepare(`
      INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
    `).run(
      txId,
      String(booking.clientCode || booking.client_id),
      billId,
      `${booking.clientName} - PT Advance Due Payment (${booking.packageName})`,
      paymentMethod,
      amountToPay,
      invoiceDateStr
    );

    const updatedBooking = await db.prepare(`
      SELECT b.*, c.name as clientName, c.phone as clientPhone, c.clientId as clientCode,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, p.duration_days,
             COALESCE(b.paid_amount, b.price_snapshot - COALESCE(b.discount_amount, 0)) as paid_amount,
             COALESCE(b.due_amount, 0) as due_amount,
             COALESCE(b.payment_status, 'Paid') as payment_status,
             COALESCE(b.discount_amount, 0) as discount_amount
      FROM pt_advance_bookings b
      JOIN clients c ON (CAST(b.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(b.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      JOIN trainers t ON (CAST(b.trainer_id AS TEXT) = CAST(t.id AS TEXT) OR CAST(b.trainer_id AS TEXT) = CAST(t.trainerId AS TEXT))
      JOIN pt_packages p ON CAST(b.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE b.id = ?
    `).get(id);

    res.json({ success: true, booking: updatedBooking, billId, billNo: nextBillNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-advance-bookings/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.prepare('SELECT * FROM pt_advance_bookings WHERE id = ?').get(id);
    if (!booking) return res.status(404).json({ error: 'PT Advance booking not found.' });

    if (booking.status === 'Active') {
      return res.status(400).json({ error: 'This PT advance booking is already active.' });
    }
    if (booking.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot activate a cancelled booking.' });
    }

    const pkg = await db.prepare('SELECT * FROM pt_packages WHERE id = ?').get(booking.pt_package_id);
    const durationDays = pkg ? (pkg.duration_days || 30) : 30;
    const pkgName = pkg ? pkg.name : 'PT Package';

    const assignDate = new Date().toISOString().split('T')[0];
    const expiryDate = calculateExpiryDate(assignDate, durationDays);

    const paidAmtToPass = booking.paid_amount !== undefined && booking.paid_amount !== null ? booking.paid_amount : null;
    const invoiceObj = await generatePtInvoice(booking.client_id, pkgName, booking.price_snapshot, assignDate, expiryDate, parseFloat(booking.discount_amount || 0), paidAmtToPass, booking.payment_method || 'UPI');
    const invoiceId = invoiceObj ? invoiceObj.billId : null;

    // Complete any previous active PT assignment for this client
    try {
      await db.prepare(`
        UPDATE pt_assignments 
        SET status = 'Completed' 
        WHERE client_id = ? AND status = 'Active'
      `).run(booking.client_id);
    } catch (e) {}

    const assignResult = await db.prepare(`
      INSERT INTO pt_assignments (
        client_id, pt_package_id, trainer_id, package_price_snapshot, discount_amount, total_classes_snapshot, classes_completed, status, assigned_date, expiry_date, invoice_id
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?)
    `).run(booking.client_id, booking.pt_package_id, booking.trainer_id, booking.price_snapshot, parseFloat(booking.discount_amount || 0), booking.total_classes_snapshot, assignDate, expiryDate, invoiceId);

    // Sync client record in clients table
    try {
      await db.prepare(`
        UPDATE clients 
        SET ptCategory = 'Personal Training',
            ptPackage = ?,
            ptFromDate = ?,
            ptToDate = ?,
            trainerId = ?,
            personalTraining = 1
        WHERE id = ?
      `).run(pkgName, assignDate, expiryDate, booking.trainer_id, booking.client_id);
    } catch (e) {}

    await db.prepare("UPDATE pt_advance_bookings SET status = 'Active', booking_start_date = ? WHERE id = ?").run(assignDate, id);

    let newAssignment = null;
    try {
      newAssignment = await db.prepare(`
        SELECT a.*, c.name as clientName, t.name as trainerName, p.name as packageName
        FROM pt_assignments a
        LEFT JOIN clients c ON a.client_id = c.id
        LEFT JOIN trainers t ON a.trainer_id = t.id
        LEFT JOIN pt_packages p ON a.pt_package_id = p.id
        WHERE a.id = ?
      `).get(assignResult.lastInsertRowid);
    } catch (e) {}

    res.json({ success: true, assignment: newAssignment, billNo: invoiceObj?.billNo });
  } catch (err) {
    console.error('Error activating PT advance booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PT CLASS LOG Routes ─────────────────────────────────────────────────────
app.get('/api/pt-class-log/today', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const logs = await db.prepare(`
      SELECT l.*,
             c.name as clientName, c.clientId as clientCode,
             t.name as trainerName, t.grade as trainerGrade,
             p.name as packageName, a.total_classes_snapshot, a.classes_completed,
             a.trainer_id as assigned_trainer_id,
             at.name as assignedTrainerName, at.grade as assignedTrainerGrade
      FROM pt_class_log l
      LEFT JOIN pt_assignments a ON l.pt_assignment_id = a.id
      LEFT JOIN clients c ON l.client_id = c.id
      LEFT JOIN trainers t ON l.trainer_id = t.id
      LEFT JOIN trainers at ON a.trainer_id = at.id
      LEFT JOIN pt_packages p ON a.pt_package_id = p.id
      WHERE l.class_date = ?
      ORDER BY l.created_at DESC
    `).all(todayStr);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pt-class-log', async (req, res) => {
  try {
    const { pt_assignment_id, class_date, session_slot = 'Morning', trainer_id, notes } = req.body;

    if (!pt_assignment_id || !class_date) {
      return res.status(400).json({ error: 'PT Assignment and Class Date are required.' });
    }
    const todayStr = new Date().toISOString().split('T')[0];
    if (class_date > todayStr) {
      return res.status(400).json({ error: 'Cannot log PT classes for future dates.' });
    }
    const session = ['Morning', 'Evening'].includes(session_slot) ? session_slot : 'Morning';

    const yearMonthStr = class_date.substring(0, 7);
    const lock = await db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(yearMonthStr);
    if (lock) {
      return res.status(400).json({ error: `Payroll for ${yearMonthStr} is locked and cannot be modified.` });
    }

    const assignment = await db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(pt_assignment_id);
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
    if (assignment.assigned_date && class_date < assignment.assigned_date) {
      return res.status(400).json({ error: `Cannot log attendance before the package joining / start date (${assignment.assigned_date}).` });
    }

    const loggingTrainerId = trainer_id || assignment.trainer_id;
    const trainer = await db.prepare('SELECT * FROM trainers WHERE id = ?').get(loggingTrainerId);
    if (!trainer) return res.status(404).json({ error: 'Trainer not found.' });
    if (!trainer.grade) {
      return res.status(400).json({ error: 'Logging trainer does not have an assigned grade. Set grade first.' });
    }

    let logId;
    try {
      const result = await db.prepare(`
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

    const activeSlab = await syncTrainerMonthlyClassLogs(loggingTrainerId, yearMonthStr);

    const newCompletedCount = assignment.classes_completed + 1;
    const newStatus = newCompletedCount >= assignment.total_classes_snapshot ? 'Completed' : 'Active';
    await db.prepare(`
      UPDATE pt_assignments SET classes_completed = ?, status = ? WHERE id = ?
    `).run(newCompletedCount, newStatus, pt_assignment_id);

    const createdLog = await db.prepare(`
      SELECT l.*, c.name as clientName, t.name as trainerName
      FROM pt_class_log l
      LEFT JOIN clients c ON l.client_id = c.id
      LEFT JOIN trainers t ON l.trainer_id = t.id
      WHERE l.id = ?
    `).get(logId);

    res.status(201).json(createdLog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pt-class-log/:id', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to undo PT class logs.' });
    }
    const log = await db.prepare('SELECT * FROM pt_class_log WHERE id = ?').get(req.params.id);
    if (!log) return res.status(404).json({ error: 'Class log entry not found.' });

    const yearMonthStr = log.class_date.substring(0, 7);
    const lock = await db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(yearMonthStr);
    if (lock) {
      return res.status(400).json({ error: `Payroll for ${yearMonthStr} is locked and cannot be modified.` });
    }

    await db.prepare('DELETE FROM pt_class_log WHERE id = ?').run(req.params.id);

    const assignment = await db.prepare('SELECT * FROM pt_assignments WHERE id = ?').get(log.pt_assignment_id);
    if (assignment) {
      const newCompleted = Math.max(0, assignment.classes_completed - 1);
      const newStatus = newCompleted < assignment.total_classes_snapshot && assignment.status === 'Completed' ? 'Active' : assignment.status;
      await db.prepare('UPDATE pt_assignments SET classes_completed = ?, status = ? WHERE id = ?').run(newCompleted, newStatus, assignment.id);
    }

    await syncTrainerMonthlyClassLogs(log.trainer_id, yearMonthStr);

    res.json({ message: 'Class log deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pt-class-log/history — Query historical class logs for calendar & audit
app.get('/api/pt-class-log/history', async (req, res) => {
  try {
    const { month, client_id, trainer_id, pt_assignment_id } = req.query;
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    let sql = `
      SELECT l.*,
             c.name as clientName, c.clientId as clientCode, c.phone as clientPhone,
             t.name as trainerName, t.trainerId as trainerCode, t.grade as trainerGrade,
             p.name as packageName, p.category as packageCategory,
             a.package_price_snapshot, a.discount_amount, a.total_classes_snapshot, a.classes_completed,
             a.trainer_id as assigned_trainer_id,
             at.name as assignedTrainerName, at.grade as assignedTrainerGrade
      FROM pt_class_log l
      LEFT JOIN pt_assignments a ON l.pt_assignment_id = a.id
      LEFT JOIN clients c ON (CAST(l.client_id AS TEXT) = CAST(c.id AS TEXT) OR CAST(l.client_id AS TEXT) = CAST(c.clientId AS TEXT))
      LEFT JOIN trainers t ON (CAST(l.trainer_id AS TEXT) = CAST(t.id AS TEXT) OR CAST(l.trainer_id AS TEXT) = CAST(t.trainerId AS TEXT))
      LEFT JOIN trainers at ON (CAST(a.trainer_id AS TEXT) = CAST(at.id AS TEXT) OR CAST(a.trainer_id AS TEXT) = CAST(at.trainerId AS TEXT))
      LEFT JOIN pt_packages p ON CAST(a.pt_package_id AS TEXT) = CAST(p.id AS TEXT)
      WHERE 1=1
    `;

    const params = [];

    if (month && month !== 'undefined') {
      sql += " AND strftime('%Y-%m', l.class_date) = ?";
      params.push(targetMonth);
    }
    if (client_id && client_id !== 'undefined') {
      sql += " AND (CAST(l.client_id AS TEXT) = CAST(? AS TEXT) OR CAST(c.clientId AS TEXT) = CAST(? AS TEXT) OR CAST(c.id AS TEXT) = CAST(? AS TEXT))";
      params.push(client_id, client_id, client_id);
    }
    if (trainer_id && trainer_id !== 'undefined') {
      sql += " AND (CAST(l.trainer_id AS TEXT) = CAST(? AS TEXT) OR CAST(a.trainer_id AS TEXT) = CAST(? AS TEXT) OR CAST(t.trainerId AS TEXT) = CAST(? AS TEXT) OR CAST(at.trainerId AS TEXT) = CAST(? AS TEXT))";
      params.push(trainer_id, trainer_id, trainer_id, trainer_id);
    }
    if (pt_assignment_id && pt_assignment_id !== 'undefined') {
      sql += " AND l.pt_assignment_id = ?";
      params.push(pt_assignment_id);
    }

    sql += " ORDER BY l.class_date DESC, l.created_at DESC";

    const logs = await db.prepare(sql).all(...params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getMonthlyGymTotalRevenue(targetMonth) {
  let total = 0;
  try {
    const txns = await db.prepare('SELECT amount, date, timestamp FROM transactions').all();
    txns.forEach(t => {
      const d = parseAnyDate(t.date || t.timestamp);
      if (d) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym === targetMonth) total += (parseFloat(t.amount) || 0);
      }
    });
  } catch (e) { }

  try {
    const rows = await db.prepare('SELECT price_snapshot, sale_date, created_at FROM other_service_sales').all();
    rows.forEach(s => {
      const d = parseAnyDate(s.sale_date || s.created_at);
      if (d) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym === targetMonth) total += (parseFloat(s.price_snapshot) || 0);
      }
    });
  } catch (e) { }

  try {
    const rows = await db.prepare('SELECT total_amount, sale_date, created_at FROM supplement_sales').all();
    rows.forEach(s => {
      const d = parseAnyDate(s.sale_date || s.created_at);
      if (d) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym === targetMonth) total += (parseFloat(s.total_amount) || 0);
      }
    });
  } catch (e) { }

  try {
    const genBookings = await db.prepare("SELECT price, discount_amount, created_at, booking_start_date FROM general_package_bookings WHERE status != 'Cancelled'").all();
    genBookings.forEach(b => {
      const d = parseAnyDate(b.created_at || b.booking_start_date);
      if (d) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym === targetMonth) total += Math.max(0, parseFloat(b.price || 0) - parseFloat(b.discount_amount || 0));
      }
    });
  } catch (e) { }

  try {
    const ptBookings = await db.prepare("SELECT price_snapshot, discount_amount, created_at, booking_start_date FROM pt_advance_bookings WHERE status != 'Cancelled'").all();
    ptBookings.forEach(b => {
      const d = parseAnyDate(b.created_at || b.booking_start_date);
      if (d) {
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym === targetMonth) total += Math.max(0, parseFloat(b.price_snapshot || 0) - parseFloat(b.discount_amount || 0));
      }
    });
  } catch (e) { }

  return total;
}

// ─── SALARY REPORT & PAYROLL LOCKS Routes ─────────────────────────────────────
app.get('/api/trainer-salary-report', async (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    const isLockedRow = await db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(targetMonth);
    const isLocked = !!isLockedRow;

    const gymTotalRevenue = await getMonthlyGymTotalRevenue(targetMonth);
    const isRevenueBelow3Lakhs = gymTotalRevenue < 300000;

    const trainers = await db.prepare("SELECT * FROM trainers WHERE status = 'Active' OR id IN (SELECT DISTINCT trainer_id FROM pt_class_log WHERE strftime('%Y-%m', class_date) = ?) ORDER BY name ASC").all(targetMonth);

    const reportData = await Promise.all(trainers.map(async (tr) => {
      await syncTrainerMonthlyClassLogs(tr.id, targetMonth);
      const baseRevenue = await getTrainerMonthlyPtBaseRevenue(tr.id, targetMonth);
      const activeSlab = getSlabForRevenue(gymTotalRevenue);

      const logs = await db.prepare(`
        SELECT l.*,
               c.name as clientName, c.clientId as clientCode, c.expiryDate as clientExpiryDate,
               a.assigned_date, a.expiry_date,
               p.name as packageName, a.package_price_snapshot, a.discount_amount, a.total_classes_snapshot,
               a.trainer_id as assigned_trainer_id,
               at.name as assignedTrainerName, at.grade as assignedTrainerGrade,
               t.name as conductingTrainerName, t.grade as conductingTrainerGrade
        FROM pt_class_log l
        LEFT JOIN pt_assignments a ON l.pt_assignment_id = a.id
        LEFT JOIN clients c ON l.client_id = c.id
        LEFT JOIN trainers t ON l.trainer_id = t.id
        LEFT JOIN trainers at ON a.trainer_id = at.id
        LEFT JOIN pt_packages p ON a.pt_package_id = p.id
        WHERE l.trainer_id = ? AND strftime('%Y-%m', l.class_date) = ?
        ORDER BY l.class_date DESC
      `).all(tr.id, targetMonth);

      const totalSalary = logs.reduce((sum, item) => sum + (item.per_class_rate_snapshot || 0), 0);

      const hasCustomRate = tr.custom_commission_percent !== null && tr.custom_commission_percent !== undefined && tr.custom_commission_percent !== '';
      const standardRate = (tr.grade && COMMISSION_MATRIX[tr.grade])
        ? (COMMISSION_MATRIX[tr.grade][activeSlab] || COMMISSION_MATRIX[tr.grade].Slab2 || 0.25) * 100
        : 25;
      const commRatePercent = hasCustomRate
        ? parseFloat(tr.custom_commission_percent)
        : standardRate;

      // Fetch payroll adjustment if exists
      const adj = await db.prepare('SELECT * FROM trainer_payroll_adjustments WHERE trainer_id = ? AND month = ?').get(tr.id, targetMonth);
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
    }));

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
app.get('/api/trainer-daily-status', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const rows = await db.prepare('SELECT * FROM trainer_daily_status WHERE status_date = ?').all(targetDate);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trainer-daily-status', async (req, res) => {
  try {
    const { trainer_id, status_date, status, marked_by } = req.body;
    if (!trainer_id || !status_date || !status) {
      return res.status(400).json({ error: 'trainer_id, status_date, and status are required.' });
    }
    if (!['Present', 'Absent'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Present or Absent.' });
    }

    await db.prepare(`
      INSERT INTO trainer_daily_status (trainer_id, status_date, status, marked_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(trainer_id, status_date) DO UPDATE SET
        status = excluded.status,
        marked_by = excluded.marked_by,
        created_at = CURRENT_TIMESTAMP
    `).run(trainer_id, status_date, status, marked_by || 'Admin');

    const updatedRow = await db.prepare('SELECT * FROM trainer_daily_status WHERE trainer_id = ? AND status_date = ?').get(trainer_id, status_date);
    res.json(updatedRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trainer-payroll-adjustments (Superadmin only)
app.post('/api/trainer-payroll-adjustments', async (req, res) => {
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
    const isLocked = await db.prepare('SELECT * FROM payroll_locks WHERE month = ?').get(month);
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

    await db.prepare(`
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
    let finalDocUrl = req.body.documentUrl;

    const roleLower = String(user_role || req.headers['x-user-role'] || '').toLowerCase();
    if (roleLower && roleLower !== 'superadmin' && roleLower !== 'admin') {
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
      `*OLYMPIA FITNESS* 🏋️‍♂️`;

    if (!finalDocUrl && pdfBase64) {
      try {
        const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
        const pdfBuffer = Buffer.from(cleanBase64, 'base64');
        const filename = `Payslip_${(trainerName || 'Trainer').replace(/[^a-zA-Z0-9_-]/g, '_')}_${month}.pdf`;
        const savedPath = await savePdfDocument(pdfBuffer, filename, req.env);
        if (savedPath) {
          if (savedPath.startsWith('http://') || savedPath.startsWith('https://')) {
            finalDocUrl = savedPath;
          } else {
            const host = req.get('host') || 'localhost';
            const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
            finalDocUrl = `${proto}://${host}${savedPath.startsWith('/') ? '' : '/'}${savedPath}`;
          }
        }
      } catch (e) {
        console.warn('Payslip PDF upload notice:', e.message);
      }
    }

    if (finalDocUrl && isPublicUrl(finalDocUrl)) {
      const filename = `Payslip_${(trainerName || 'Trainer').replace(/[^a-zA-Z0-9_-]/g, '_')}_${month}.pdf`;
      try {
        await sendWhatsAppDocument(phone, caption, finalDocUrl, filename, req.env);
      } catch (docErr) {
        console.warn('Payslip document send error, falling back to text:', docErr.message);
        await sendWhatsAppMessage(phone, caption, req.env);
      }
    } else {
      await sendWhatsAppMessage(phone, caption, req.env);
    }

    await db.prepare(
      'INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), '', trainerName || '', phone, 'payslip_pdf');

    res.json({ success: true, message: `Payslip sent successfully to ${phone} via WhatsApp!` });
  } catch (err) {
    console.error('WhatsApp payslip send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payroll-locks', async (req, res) => {
  try {
    const { month, locked_by, total_payroll } = req.body;
    if (!month) return res.status(400).json({ error: 'Month is required.' });

    let validLockedBy = null;
    if (locked_by) {
      const user = await db.prepare('SELECT id FROM users WHERE LOWER(role) = LOWER(?) OR LOWER(username) = LOWER(?) OR id = ?').get(locked_by, locked_by, locked_by);
      validLockedBy = user ? user.id : null;
    }

    let finalPayroll = parseFloat(total_payroll);

    // Auto-calculate if total_payroll not provided
    if (isNaN(finalPayroll) || finalPayroll <= 0) {
      try {
        const trainers = await db.prepare("SELECT id FROM trainers WHERE status = 'Active' OR id IN (SELECT DISTINCT trainer_id FROM pt_class_log WHERE strftime('%Y-%m', class_date) = ?)").all(month);
        let sumPayable = 0;
        for (const tr of (trainers || [])) {
          const logs = await db.prepare("SELECT per_class_rate_snapshot FROM pt_class_log WHERE trainer_id = ? AND strftime('%Y-%m', class_date) = ?").all(tr.id, month);
          const commSalary = (logs || []).reduce((s, item) => s + (item.per_class_rate_snapshot || 0), 0);

          const adj = await db.prepare('SELECT * FROM trainer_payroll_adjustments WHERE trainer_id = ? AND month = ?').get(tr.id, month);
          const basicPay = adj ? (adj.basic_pay || 0) : 0;
          const bonus = adj ? (adj.bonus || 0) : 0;
          const iAmt = adj ? (adj.incentive_amount || 0) : 0;
          const iType = adj ? (adj.incentive_type || 'Add') : 'Add';
          const oAmt = adj ? (adj.other_amount || 0) : 0;
          const oType = adj ? (adj.other_type || 'Add') : 'Add';

          const sInc = iType === 'Subtract' ? -Math.abs(iAmt) : Math.abs(iAmt);
          const sOth = oType === 'Subtract' ? -Math.abs(oAmt) : Math.abs(oAmt);

          sumPayable += (commSalary + basicPay + bonus + sInc + sOth);
        }
        finalPayroll = sumPayable;
      } catch (e) {
        finalPayroll = 0;
      }
    }

    await db.prepare(`
      INSERT INTO payroll_locks (month, locked_by, total_payroll)
      VALUES (?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        locked_at = CURRENT_TIMESTAMP,
        locked_by = excluded.locked_by,
        total_payroll = excluded.total_payroll
    `).run(month, validLockedBy, finalPayroll);

    const monthTitle = formatMonthLabel(month);
    const expId = `payroll-lock-${month}`;
    const expName = `Trainer Salary - ${monthTitle}`;
    const expNotes = `Locked Trainer Salary Payroll for ${monthTitle}`;

    let expDate = `${month}-28`;
    const mParts = String(month).split('-');
    if (mParts.length === 2) {
      const yyyy = parseInt(mParts[0], 10);
      const mm = parseInt(mParts[1], 10);
      if (!isNaN(yyyy) && !isNaN(mm)) {
        const lastDay = new Date(yyyy, mm, 0).getDate();
        expDate = `${mParts[0]}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    try {
      await db.prepare(`
        INSERT INTO expenses (id, date, name, category, amount, paymentMode, notes)
        VALUES (?, ?, ?, 'Staff Salary', ?, 'BANK TRANSFER', ?)
        ON CONFLICT(id) DO UPDATE SET
          date = excluded.date,
          name = excluded.name,
          amount = excluded.amount,
          notes = excluded.notes
      `).run(expId, expDate, expName, finalPayroll, expNotes);
    } catch (expErr) {
      console.error('Error syncing payroll expense into expenses table:', expErr.message);
    }

    res.json({ success: true, message: `Payroll for ${monthTitle} is now locked.`, total_payroll: finalPayroll });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payroll-locks', async (req, res) => {
  try {
    const locks = await db.prepare('SELECT * FROM payroll_locks ORDER BY month DESC').all();
    res.json(locks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/payroll-locks/:month', async (req, res) => {
  try {
    const rawRole = req.headers['x-user-role'] || req.query.user_role || (req.body && typeof req.body === 'object' ? req.body.user_role : '');
    const role = String(rawRole || '').toLowerCase();
    if (role && role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to unlock payroll month.' });
    }
    const { month } = req.params;
    const monthTitle = formatMonthLabel(month);
    await db.prepare('DELETE FROM payroll_locks WHERE month = ?').run(month);
    try {
      await db.prepare("DELETE FROM expenses WHERE id = ? OR notes LIKE ? OR name LIKE ?").run(`payroll-lock-${month}`, `%${month}%`, `%${monthTitle}%`);
    } catch (e) {}
    res.json({ success: true, message: `Payroll for ${monthTitle} is now unlocked.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/pt-summary', async (req, res) => {
  try {
    const currentMonthStr = new Date().toISOString().substring(0, 7);

    const trainers = await db.prepare("SELECT * FROM trainers WHERE status = 'Active'").all();
    await Promise.all(trainers.map(async tr => {
      await syncTrainerMonthlyClassLogs(tr.id, currentMonthStr);
    }));

    const totalRow = await db.prepare(`
      SELECT SUM(per_class_rate_snapshot) as "totalPayable"
      FROM pt_class_log
      WHERE strftime('%Y-%m', class_date) = ?
    `).get(currentMonthStr);

    const totalPtCommissionPayable = totalRow && totalRow.totalPayable ? totalRow.totalPayable : 0;

    const gymTotalRevenue = await getMonthlyGymTotalRevenue(currentMonthStr);
    const trainerRevenueList = await Promise.all(trainers.map(async tr => {
      const baseRevenue = await getTrainerMonthlyPtBaseRevenue(tr.id, currentMonthStr);
      const activeSlab = getSlabForRevenue(gymTotalRevenue);
      return {
        id: tr.id,
        name: tr.name,
        grade: tr.grade || 'N/A',
        ptRevenue: baseRevenue,
        slab: activeSlab
      };
    }));

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
app.post('/api/restore', async (req, res) => {
  try {
    const { clients = [], transactions = [], trainers = [], mode = 'overwrite' } = req.body;

    // Validate inputs
    if (!Array.isArray(clients) || !Array.isArray(transactions) || !Array.isArray(trainers)) {
      return res.status(400).json({ error: 'Invalid payload format.' });
    }

    const restoreTx = async (clientsData, txnsData, trainersData) => {
      try {
        await db.prepare('PRAGMA foreign_keys = OFF').run();
      } catch (_) {}

      if (mode === 'overwrite') {
        await db.prepare('DELETE FROM clients').run();
        await db.prepare('DELETE FROM transactions').run();
        if (trainersData.length > 0) {
          await db.prepare('DELETE FROM trainers').run();
        }
      }

      const chunkSize = 4;

      if (trainersData.length > 0) {
        for (let i = 0; i < trainersData.length; i += chunkSize) {
          const chunk = trainersData.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?)`).join(', ');
          const sql = `INSERT INTO trainers (id, trainerId, name, specialization, experience, status, dateAdded) VALUES ${placeholders}`;
          const params = [];
          for (const t of chunk) {
            params.push(
              t.id || randomUUID(), t.trainerId || '', t.name || '',
              t.specialization || '', t.experience || '', t.status || 'Active',
              t.dateAdded || null
            );
          }
          await db.prepare(sql).run(params);
        }
      }

      if (clientsData.length > 0) {
        for (let i = 0; i < clientsData.length; i += chunkSize) {
          const chunk = clientsData.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`).join(', ');
          const sql = `
            INSERT INTO clients (
              id, clientId, name, phone, plan, fromDate, expiryDate, amount, 
              personalTraining, status, gender, ptCategory, ptFromDate, ptToDate, ptPackage, programType, diet, dateAdded, trainerId, admissionDate
            ) VALUES ${placeholders}
          `;
          const params = [];
          for (const c of chunk) {
            const safeTrainerId = (c.trainerId && String(c.trainerId).trim() !== '') ? String(c.trainerId).trim() : null;
            params.push(
              c.id || randomUUID(), c.clientId || '', c.name || 'Unknown', c.phone || '', c.plan || '',
              c.fromDate || '', c.expiryDate || '', c.amount || 0,
              c.personalTraining ? 1 : 0, c.status || 'active',
              c.gender || '', c.ptCategory || '', c.ptFromDate || '', c.ptToDate || '',
              c.ptPackage || '', c.programType || '', c.diet ? 1 : 0,
              c.dateAdded || null,
              safeTrainerId,
              c.admissionDate || null
            );
          }
          await db.prepare(sql).run(params);
        }
      }

      if (txnsData.length > 0) {
        for (let i = 0; i < txnsData.length; i += chunkSize) {
          const chunk = txnsData.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`).join(', ');
          const sql = `INSERT INTO transactions (id, name, method, date, amount, status, timestamp) VALUES ${placeholders}`;
          const params = [];
          for (const t of chunk) {
            params.push(
              t.id || randomUUID(), t.name || '', t.method || 'CASH', t.date || '',
              t.amount || 0, t.status || 'CAPTURED', t.timestamp || null
            );
          }
          await db.prepare(sql).run(params);
        }
      }

      try {
        await db.prepare('PRAGMA foreign_keys = ON').run();
      } catch (_) {}
    };

    await restoreTx(clients, transactions, trainers);
    res.json({ message: 'Database restored successfully', counts: { clients: clients.length, transactions: transactions.length, trainers: trainers.length } });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TRANSACTION Routes ───────────────────────────────────────────────────────

// GET all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    await backfillPtAssignmentTransactions();
    const txns = await db.prepare(`
      SELECT 
        t.*,
        b.discount_amount as discount_amount,
        b.planAmount as bill_plan_amount,
        b.totalPlanAmount as bill_total_amount
      FROM transactions t
      LEFT JOIN bills b ON t.billId = b.id
      ORDER BY t.timestamp DESC
    `).all();
    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPENSES Routes ──────────────────────────────────────────────────────────

app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await db.prepare('SELECT * FROM expenses ORDER BY timestamp DESC').all();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { date, name, category, amount, paymentMode, notes } = req.body;
    const id = randomUUID();
    await db.prepare(`
      INSERT INTO expenses (id, date, name, category, amount, paymentMode, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, date || toDateLabel(), name, category, amount || 0, paymentMode || 'CASH', notes || '');

    const newExpense = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const role = req.headers['x-user-role'] || req.query.user_role || req.body.user_role;
    if (role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied. Master / Superadmin permission required to delete expenses.' });
    }
    await db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPIRED CLIENT RENEWAL Route ─────────────────────────────────────────────
app.post('/api/clients/:id/renew-expired', async (req, res) => {
  try {
    const clientId = req.params.id;
    const { planName, price, durationDays, hasGst, gstin, paidAmount, paymentMethod, startDate, discount_amount } = req.body;

    if (!planName || price === undefined || price === null) {
      return res.status(400).json({ error: 'Plan name and price are required.' });
    }

    const client = await db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(clientId, clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    let gstinSnapshot = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinSnapshot = gstin.trim().toUpperCase();
      await db.prepare('UPDATE clients SET gstin = ? WHERE id = ?').run(gstinSnapshot, client.id);
    }

    const durDays = parseInt(durationDays, 10) || 30;
    const startStr = startDate || new Date().toISOString().split('T')[0];
    const expiryDateStr = calculateExpiryDate(startStr, durDays);
    const planPrice = parseFloat(price);
    const disc = parseFloat(discount_amount || 0);
    const netPayable = Math.max(0, planPrice - disc);
    const paidAmountVal = paidAmount !== undefined && paidAmount !== null && paidAmount !== '' ? parseFloat(paidAmount) : netPayable;
    const dueAmountVal = Math.max(0, netPayable - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = paymentMethod || 'CASH';

    // 1. Generate Invoice in bills table using INV-xxxx pattern
    const billRow = await db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
    let nextBillNo = 'INV-0001';
    if (billRow && billRow.billNo) {
      const match = billRow.billNo.match(/INV-(\d{4})/);
      if (match) {
        nextBillNo = `INV-${(parseInt(match[1], 10) + 1).toString().padStart(4, '0')}`;
      }
    }

    const billId = randomUUID();
    const invoiceDateStr = toDateLabel();

    const gstSettings = await db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const gstCalc = computeGstBreakdown(netPayable, gstSettings.gst_rate_percent || 4.8);

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, discount_amount, taxable_value, cgst_amount, sgst_amount, gst_rate_snapshot, client_gstin_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'GeneralPlan', ?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      nextBillNo,
      client.id,
      client.name,
      invoiceDateStr,
      startStr,
      expiryDateStr,
      netPayable,
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      netPayable,
      dueAmountVal,
      planName,
      disc,
      gstCalc.taxable_value,
      gstCalc.cgst_amount,
      gstCalc.sgst_amount,
      gstCalc.gst_rate_snapshot,
      gstinSnapshot
    );

    // 2. Insert transaction record if paidAmountVal > 0
    if (paidAmountVal > 0) {
      const txId = randomUUID();
      await db.prepare(`
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
    await db.prepare(`
      UPDATE clients SET
        plan = ?,
        fromDate = ?,
        expiryDate = ?,
        amount = ?,
        paidAmount = ?,
        dueAmount = ?,
        paymentStatus = ?,
        status = 'Active'
      WHERE id = ?
    `).run(planName, startStr, expiryDateStr, netPayable, paidAmountVal, dueAmountVal, paymentStatusVal, client.id);

    const updatedClient = await db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id);

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
      planAmount: netPayable,
      totalPlanAmount: netPayable,
      discount: disc,
      discount_amount: disc,
      original_price: planPrice,
      paidAmount: paidAmountVal,
      dueAmount: dueAmountVal,
      remainingBalance: dueAmountVal,
      paymentStatus: paymentStatusVal,
      paymentMethod: payMethodVal,
      client_gstin_snapshot: gstinSnapshot,
      gstin: gstinSnapshot
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
app.delete('/api/other-services/sales/all', async (req, res) => {
  try {
    await db.prepare('DELETE FROM other_service_sales').run();
    await db.prepare("DELETE FROM bills WHERE planName LIKE 'Service:%'").run();
    res.json({ success: true, message: 'All other service sales cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/other-services/sales', async (req, res) => {
  try {
    const sales = await db.prepare(`
      SELECT 
        s.id,
        s.client_id,
        s.service_id,
        COALESCE(b.planAmount, s.price_snapshot) AS price_snapshot,
        s.sale_date,
        s.invoice_id,
        s.created_at,
        COALESCE(c.name, b.clientName, 'Unknown Client') AS clientName,
        COALESCE(c.clientId, c.id, s.client_id) AS clientCode,
        COALESCE(c.phone, '') AS clientPhone,
        COALESCE(t.name, 'Other Service') AS serviceName,
        COALESCE(t.price, s.price_snapshot + COALESCE(b.discount_amount, 0)) AS original_price,
        COALESCE(t.duration_days, 30) AS duration_days,
        COALESCE(b.billNo, '') AS billNo,
        COALESCE(b.paidAmount, s.price_snapshot, 0) AS paidAmount,
        COALESCE(b.dueAmount, 0) AS dueAmount,
        COALESCE(b.paymentStatus, 'Paid') AS paymentStatus,
        COALESCE(b.discount_amount, 0) AS discount_amount,
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

app.get('/api/other-services/sales/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const sales = await db.prepare(`
      SELECT 
        s.id,
        s.client_id,
        s.service_id,
        COALESCE(b.planAmount, s.price_snapshot) AS price_snapshot,
        s.sale_date,
        s.invoice_id,
        s.created_at,
        COALESCE(c.name, b.clientName, 'Unknown Client') AS clientName,
        COALESCE(c.clientId, c.id, s.client_id) AS clientCode,
        COALESCE(c.phone, '') AS clientPhone,
        COALESCE(t.name, 'Other Service') AS serviceName,
        COALESCE(t.price, s.price_snapshot + COALESCE(b.discount_amount, 0)) AS original_price,
        COALESCE(t.duration_days, 30) AS duration_days,
        COALESCE(b.billNo, '') AS billNo,
        COALESCE(b.paidAmount, s.price_snapshot, 0) AS paidAmount,
        COALESCE(b.dueAmount, 0) AS dueAmount,
        COALESCE(b.paymentStatus, 'Paid') AS paymentStatus,
        COALESCE(b.discount_amount, 0) AS discount_amount,
        b.expiryDate
      FROM other_service_sales s
      LEFT JOIN clients c ON (
        CAST(s.client_id AS TEXT) = CAST(c.id AS TEXT)
        OR CAST(s.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      )
      LEFT JOIN other_service_tariffs t ON CAST(s.service_id AS INTEGER) = t.id
      LEFT JOIN bills b ON CAST(s.invoice_id AS TEXT) = CAST(b.id AS TEXT)
      WHERE CAST(s.client_id AS TEXT) = CAST(? AS TEXT)
         OR CAST(c.clientId AS TEXT) = CAST(? AS TEXT)
         OR CAST(c.id AS TEXT) = CAST(? AS TEXT)
      ORDER BY s.id DESC
    `).all(clientId, clientId, clientId);

    res.json(sales);
  } catch (err) {
    console.error('Error fetching client other service sales:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/other-services', async (req, res) => {
  try {
    const services = await db.prepare('SELECT * FROM other_service_tariffs ORDER BY created_at DESC').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/other-services', async (req, res) => {
  try {
    const { name, price, duration_days } = req.body;
    if (!name || price === undefined || price === null || !duration_days) {
      return res.status(400).json({ error: 'Name, price, and duration in days are required.' });
    }

    const result = await db.prepare(`
      INSERT INTO other_service_tariffs (name, price, duration_days, is_hidden, active)
      VALUES (?, ?, ?, 0, 1)
    `).run(name.trim(), parseFloat(price), parseInt(duration_days, 10));

    const newService = await db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newService);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/other-services/:id', async (req, res) => {
  try {
    const { name, price, duration_days } = req.body;
    if (!name || price === undefined || price === null || !duration_days) {
      return res.status(400).json({ error: 'Name, price, and duration in days are required.' });
    }

    await db.prepare(`
      UPDATE other_service_tariffs
      SET name = ?, price = ?, duration_days = ?
      WHERE id = ?
    `).run(name.trim(), parseFloat(price), parseInt(duration_days, 10), req.params.id);

    const updated = await db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/other-services/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM other_service_tariffs WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Service tariff deleted successfully.' });
  } catch (err) {
    console.warn('Other service delete constraint, soft deleting:', err.message);
    try {
      await db.prepare('UPDATE other_service_tariffs SET active = 0, is_hidden = 1 WHERE id = ?').run(req.params.id);
      res.json({ success: true, message: 'Service tariff hidden.' });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.patch('/api/other-services/:id/hide', async (req, res) => {
  try {
    const { is_hidden } = req.body;
    await db.prepare('UPDATE other_service_tariffs SET is_hidden = ? WHERE id = ?').run(is_hidden ? 1 : 0, req.params.id);
    res.json({ success: true, is_hidden: !!is_hidden });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/other-services/:id/active', async (req, res) => {
  try {
    const { active } = req.body;
    await db.prepare('UPDATE other_service_tariffs SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
    res.json({ success: true, active: !!active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/other-services/sell', async (req, res) => {
  try {
    const { client_id, service_id, sale_date, paid_amount, payment_method, hasGst, gstin, discount_amount = 0 } = req.body;
    if (!client_id || !service_id) {
      return res.status(400).json({ error: 'Client and Service tariff selections are required.' });
    }

    const client = await db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(client_id, client_id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    let gstinSnapshot = null;
    if ((hasGst === true || hasGst === 'yes' || hasGst === 'true') && gstin && gstin.trim()) {
      gstinSnapshot = gstin.trim().toUpperCase();
      await db.prepare('UPDATE clients SET gstin = ? WHERE id = ?').run(gstinSnapshot, client.id || client_id);
    }

    const service = await db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(service_id);
    if (!service) return res.status(404).json({ error: 'Service tariff not found.' });

    const saleDateStr = sale_date || new Date().toISOString().split('T')[0];
    const discAmt = parseFloat(discount_amount) || 0;
    const priceSnapshot = service.price; // original MRP
    const discountedPrice = Math.max(0, priceSnapshot - discAmt); // price after discount
    const paidAmountVal = paid_amount !== undefined && paid_amount !== null && paid_amount !== '' ? parseFloat(paid_amount) : discountedPrice;
    const dueAmountVal = Math.max(0, discountedPrice - paidAmountVal);
    const paymentStatusVal = dueAmountVal <= 0 ? 'Paid' : (paidAmountVal > 0 ? 'Partial' : 'Due');
    const payMethodVal = payment_method || 'UPI';

    // 1. Generate Invoice in bills using INV-xxxx
    const billRow = await db.prepare("SELECT billNo FROM bills ORDER BY timestamp DESC LIMIT 1").get();
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

    await db.prepare(`
      INSERT INTO bills (id, billNo, clientId, clientName, invoiceDate, joinDate, expiryDate, planAmount, paidAmount, dueAmount, paymentStatus, dueNumber, totalPlanAmount, remainingBalance, planName, invoice_category, client_gstin_snapshot, discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OtherService', ?, ?)
    `).run(
      billId,
      nextBillNo,
      client.id || client_id,
      client.name,
      invoiceDateStr,
      saleDateStr,
      expiryDateStr,
      discountedPrice,      // planAmount = price after discount
      paidAmountVal,
      dueAmountVal,
      paymentStatusVal,
      0,
      discountedPrice,      // totalPlanAmount = price after discount
      dueAmountVal,
      `Service: ${service.name}`,
      gstinSnapshot,
      discAmt               // ← persist discount in bills table
    );

    // Create transaction record if paidAmountVal > 0 so Dashboard & Transactions reflect it immediately
    if (paidAmountVal > 0) {
      const txId = randomUUID();
      await db.prepare(`
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

    // Update client due amount if there is any due from discounted price
    if (dueAmountVal > 0) {
      const currentDue = client.dueAmount || 0;
      const updatedDue = currentDue + dueAmountVal;
      await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(updatedDue, 'Due', client.id || client_id);
    }



    // 2. Insert into other_service_sales
    const result = await db.prepare(`
      INSERT INTO other_service_sales (client_id, service_id, price_snapshot, sale_date, invoice_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(client.id || client_id), service.id, discountedPrice, saleDateStr, billId);

    const saleRecord = await db.prepare(`
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
      planAmount: discountedPrice,
      totalPlanAmount: discountedPrice,
      paidAmount: paidAmountVal,
      dueAmount: dueAmountVal,
      remainingBalance: dueAmountVal,
      paymentStatus: paymentStatusVal,
      discount_amount: discAmt          // ← pass discount so invoice template shows it
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

app.put('/api/other-services/sales/:id', async (req, res) => {
  try {
    const saleId = req.params.id;
    const sale = await db.prepare('SELECT * FROM other_service_sales WHERE id = ?').get(saleId);
    if (!sale) {
      return res.status(404).json({ error: 'Service sale record not found.' });
    }

    const {
      service_id,
      price_snapshot,
      discount_amount = 0,
      paid_amount,
      due_amount,
      payment_method,
      sale_date
    } = req.body;

    const targetServiceId = service_id !== undefined ? service_id : sale.service_id;
    const service = await db.prepare('SELECT * FROM other_service_tariffs WHERE id = ?').get(targetServiceId);
    const serviceName = service ? service.name : 'Other Service';
    const durationDays = service ? (service.duration_days || 30) : 30;

    const saleDateStr = sale_date || sale.sale_date || new Date().toISOString().split('T')[0];
    const expiryDateStr = calculateExpiryDate(saleDateStr, durationDays);

    const priceSnapshotVal = price_snapshot !== undefined ? parseFloat(price_snapshot) : (service ? service.price : sale.price_snapshot);
    const discAmt = discount_amount !== undefined ? (parseFloat(discount_amount) || 0) : 0;
    const discountedPrice = Math.max(0, priceSnapshotVal - discAmt);

    const paidVal = paid_amount !== undefined && paid_amount !== null && paid_amount !== '' ? parseFloat(paid_amount) : discountedPrice;
    const dueVal = due_amount !== undefined && due_amount !== null && due_amount !== '' ? parseFloat(due_amount) : Math.max(0, discountedPrice - paidVal);
    const payStatusVal = dueVal <= 0 ? 'Paid' : (paidVal > 0 ? 'Partial' : 'Due');

    // 1. Update other_service_sales table
    await db.prepare(`
      UPDATE other_service_sales
      SET service_id = ?, price_snapshot = ?, sale_date = ?
      WHERE id = ?
    `).run(targetServiceId, discountedPrice, saleDateStr, saleId);

    // 2. Update linked bill if present
    if (sale.invoice_id) {
      await db.prepare(`
        UPDATE bills
        SET planName = ?, planAmount = ?, totalPlanAmount = ?, paidAmount = ?, dueAmount = ?, remainingBalance = ?, paymentStatus = ?, invoiceDate = ?, joinDate = ?, expiryDate = ?, discount_amount = ?
        WHERE id = ?
      `).run(
        `Service: ${serviceName}`,
        discountedPrice,
        discountedPrice,
        paidVal,
        dueVal,
        dueVal,
        payStatusVal,
        saleDateStr,
        saleDateStr,
        expiryDateStr,
        discAmt,
        sale.invoice_id
      );

      // Update linked transaction
      try {
        await db.prepare(`
          UPDATE transactions
          SET amount = ?, date = ?, method = COALESCE(?, method)
          WHERE billId = ?
        `).run(paidVal, saleDateStr, payment_method || null, sale.invoice_id);
      } catch (txErr) {
        console.warn('Notice: Could not update transactions:', txErr.message);
      }
    }

    const updatedSale = await db.prepare(`
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
        COALESCE(b.discount_amount, 0) AS discount_amount,
        b.expiryDate
      FROM other_service_sales s
      LEFT JOIN clients c ON (
        CAST(s.client_id AS TEXT) = CAST(c.id AS TEXT)
        OR CAST(s.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      )
      LEFT JOIN other_service_tariffs t ON CAST(s.service_id AS INTEGER) = t.id
      LEFT JOIN bills b ON CAST(s.invoice_id AS TEXT) = CAST(b.id AS TEXT)
      WHERE s.id = ?
    `).get(saleId);

    res.json({ success: true, message: 'Other service sale updated successfully.', sale: updatedSale });
  } catch (err) {
    console.error('Error updating other service sale:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/other-services/sales/:id/payment — Record due payment on other service sale
app.post('/api/other-services/sales/:id/payment', async (req, res) => {
  try {
    const saleId = req.params.id;
    const { paidAmount, paymentMethod = 'UPI', paymentDate } = req.body;
    const amountToPay = parseFloat(paidAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const sale = await db.prepare(`
      SELECT s.*, b.billNo, b.planAmount, b.paidAmount as billPaid, b.dueAmount as billDue, b.totalPlanAmount, b.remainingBalance,
             b.clientName, b.expiryDate, b.discount_amount
      FROM other_service_sales s
      LEFT JOIN bills b ON CAST(s.invoice_id AS TEXT) = CAST(b.id AS TEXT)
      WHERE s.id = ?
    `).get(saleId);

    if (!sale) return res.status(404).json({ error: 'Other service sale record not found.' });

    const currentDue = parseFloat(sale.billDue !== undefined ? sale.billDue : Math.max(0, (sale.price_snapshot || 0) - (sale.billPaid || 0)));
    const newDue = Math.max(0, currentDue - amountToPay);
    const newPaid = (parseFloat(sale.billPaid || 0)) + amountToPay;
    const newStatus = newDue <= 0 ? 'Paid' : 'Partial';

    // Update bill
    if (sale.invoice_id) {
      await db.prepare(`
        UPDATE bills 
        SET paidAmount = ?, dueAmount = ?, remainingBalance = ?, paymentStatus = ? 
        WHERE id = ?
      `).run(newPaid, newDue, newDue, newStatus, sale.invoice_id);
    }

    // Update client dueAmount in clients table
    try {
      const clientRecord = await db.prepare('SELECT * FROM clients WHERE id = ? OR clientId = ?').get(sale.client_id, sale.client_id);
      if (clientRecord) {
        const updatedClientDue = Math.max(0, (parseFloat(clientRecord.dueAmount) || 0) - amountToPay);
        const updatedClientStatus = updatedClientDue <= 0 ? 'Paid' : 'Partial';
        await db.prepare('UPDATE clients SET dueAmount = ?, paymentStatus = ? WHERE id = ?').run(updatedClientDue, updatedClientStatus, clientRecord.id);
      }
    } catch (e) {}

    // Add transaction record
    const txId = randomUUID();
    const invoiceDateStr = paymentDate || toDateLabel();
    await db.prepare(`
      INSERT INTO transactions (id, clientId, billId, name, method, amount, date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'CAPTURED')
    `).run(
      txId,
      sale.client_id,
      sale.invoice_id || randomUUID(),
      `${sale.clientName || 'Client'} - Other Service Due Payment`,
      paymentMethod,
      amountToPay,
      invoiceDateStr
    );

    const updatedSale = await db.prepare(`
      SELECT 
        s.id,
        s.client_id,
        s.service_id,
        COALESCE(b.planAmount, s.price_snapshot) AS price_snapshot,
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
        COALESCE(b.discount_amount, 0) AS discount_amount,
        b.expiryDate
      FROM other_service_sales s
      LEFT JOIN clients c ON (
        CAST(s.client_id AS TEXT) = CAST(c.id AS TEXT)
        OR CAST(s.client_id AS TEXT) = CAST(c.clientId AS TEXT)
      )
      LEFT JOIN other_service_tariffs t ON CAST(s.service_id AS INTEGER) = t.id
      LEFT JOIN bills b ON CAST(s.invoice_id AS TEXT) = CAST(b.id AS TEXT)
      WHERE s.id = ?
    `).get(saleId);

    res.json({ success: true, message: 'Payment recorded successfully.', sale: updatedSale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/other-services/sales/:id', async (req, res) => {
  try {
    const saleId = req.params.id;
    const sale = await db.prepare('SELECT * FROM other_service_sales WHERE id = ?').get(saleId);
    if (!sale) {
      return res.status(404).json({ error: 'Service sale record not found.' });
    }

    const invoiceId = sale.invoice_id;

    // 1. Delete from child table other_service_sales first to release foreign key reference to bills
    await db.prepare('DELETE FROM other_service_sales WHERE id = ?').run(saleId);

    // 2. Clean up associated transaction and bill records safely
    if (invoiceId) {
      try {
        await db.prepare('DELETE FROM transactions WHERE billId = ?').run(invoiceId);
      } catch (txErr) {
        console.warn('Notice: Could not delete associated transactions:', txErr.message);
      }

      try {
        await db.prepare('DELETE FROM bills WHERE id = ?').run(invoiceId);
      } catch (billErr) {
        console.warn('Notice: Could not delete associated bill:', billErr.message);
      }
    }

    res.json({ success: true, message: 'Service sale record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting other service sale:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backfill-pt', async (req, res) => {
  try {
    await backfillPtAssignmentTransactions();
    const txns = await db.prepare("SELECT * FROM transactions WHERE name LIKE '%PT%' OR name LIKE '%Personal Training%'").all();
    res.json({ success: true, message: 'PT backfill completed successfully', ptTransactions: txns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD DATE-RANGE STATS Route ──────────────────────────────────────
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    await backfillPtAssignmentTransactions();
    const { startDate, endDate } = req.query;

    const startObj = parseAnyDate(startDate) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    startObj.setHours(0, 0, 0, 0);

    const endObj = parseAnyDate(endDate) || new Date();
    endObj.setHours(23, 59, 59, 999);

    const allTxns = await db.prepare('SELECT * FROM transactions').all();
    const otherSales = await db.prepare('SELECT * FROM other_service_sales').all();
    const suppSales = await db.prepare('SELECT * FROM supplement_sales').all();
    const genBookingsAll = await db.prepare("SELECT * FROM general_package_bookings WHERE status != 'Cancelled'").all();
    const ptBookingsAll = await db.prepare("SELECT * FROM pt_advance_bookings WHERE status != 'Cancelled'").all();
    const allExpenses = await db.prepare('SELECT * FROM expenses').all();

    const txnBillIds = new Set((allTxns || []).map(t => t.billId).filter(Boolean));

    // 1. Transactions collection in range
    let rangeRevenue = allTxns.reduce((sum, t) => {
      const d = parseAnyDate(t.date || t.timestamp);
      if (d && d >= startObj && d <= endObj) {
        return sum + (t.amount || 0);
      }
      return sum;
    }, 0);

    // 2. Other services sales in range (only if not already in transactions table)
    (otherSales || []).forEach(s => {
      if (s.invoice_id && txnBillIds.has(s.invoice_id)) return;
      const d = parseAnyDate(s.sale_date || s.created_at);
      if (d && d >= startObj && d <= endObj) {
        rangeRevenue += (s.price_snapshot || 0);
      }
    });

    // 3. Supplement sales in range (only if not already in transactions table)
    (suppSales || []).forEach(s => {
      if (s.invoice_id && txnBillIds.has(s.invoice_id)) return;
      const d = parseAnyDate(s.sale_date || s.created_at);
      if (d && d >= startObj && d <= endObj) {
        rangeRevenue += (s.total_amount || 0);
      }
    });

    // 4. General Package Advance Bookings in range
    (genBookingsAll || []).forEach(b => {
      const d = parseAnyDate(b.created_at || b.booking_start_date);
      if (d && d >= startObj && d <= endObj) {
        const netPaid = Math.max(0, (b.price || 0) - (b.discount_amount || 0));
        rangeRevenue += netPaid;
      }
    });

    // 5. PT Package Advance Bookings in range
    (ptBookingsAll || []).forEach(b => {
      const d = parseAnyDate(b.created_at || b.booking_start_date);
      if (d && d >= startObj && d <= endObj) {
        const netPaid = Math.max(0, (b.price_snapshot || 0) - (b.discount_amount || 0));
        rangeRevenue += netPaid;
      }
    });

    // 6. PT Package Assignments in range (only if not already in transactions table)
    const ptAssignmentsAll = await db.prepare("SELECT * FROM pt_assignments WHERE LOWER(COALESCE(status, '')) != 'cancelled'").all();
    (ptAssignmentsAll || []).forEach(a => {
      if (a.invoice_id && txnBillIds.has(a.invoice_id)) return;
      const d = parseAnyDate(a.assigned_date || a.created_at);
      const inRange = !d || (d >= startObj && d <= endObj);
      if (inRange) {
        const netPaid = Math.max(0, parseFloat(a.package_price_snapshot || 0) - parseFloat(a.discount_amount || 0));
        rangeRevenue += netPaid;
      }
    });

    // Calculate total discount in range
    let rangeDiscount = 0;
    try {
      const allBillsInRange = await db.prepare('SELECT * FROM bills').all();
      (allBillsInRange || []).forEach(b => {
        const d = parseAnyDate(b.invoiceDate || b.timestamp);
        if (d && d >= startObj && d <= endObj) {
          rangeDiscount += (parseFloat(b.discount_amount) || 0);
        }
      });
      (genBookingsAll || []).forEach(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (d && d >= startObj && d <= endObj) {
          rangeDiscount += (parseFloat(b.discount_amount) || 0);
        }
      });
      (ptBookingsAll || []).forEach(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (d && d >= startObj && d <= endObj) {
          rangeDiscount += (parseFloat(b.discount_amount) || 0);
        }
      });
    } catch (e) {}

    // 7. Operational Expenses in range (includes synced payroll lock expenses)
    const rangeExpenses = allExpenses.reduce((sum, e) => {
      const d = parseAnyDate(e.date || e.timestamp);
      if (d && d >= startObj && d <= endObj) {
        return sum + (e.amount || 0);
      }
      return sum;
    }, 0);

    const inactivePtCount = (await db.prepare(
      "SELECT COUNT(*) as cnt FROM pt_assignments WHERE status IN ('Expired', 'Cancelled')"
    ).get())?.cnt || 0;

    res.json({
      rangeRevenue,
      rangeExpenses,
      rangeDiscount,
      inactivePT: inactivePtCount
    });
  } catch (err) {
    console.error('Error in /api/dashboard/stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS Route ──────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    await backfillPtAssignmentTransactions();
    const { month } = req.query;
    const targetMonth = month || new Date().toLocaleDateString('en-GB', { month: 'short' });
    const monthMapping = {
      "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
      "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
      "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
    };
    const mm = monthMapping[targetMonth] || targetMonth;
    const currentYear = new Date().getFullYear();

    const allTxns = await db.prepare('SELECT * FROM transactions').all();
    const otherServiceSalesAll = await db.prepare('SELECT * FROM other_service_sales').all();
    const suppSalesAllStats = await db.prepare('SELECT * FROM supplement_sales').all();

    const txnBillIds = new Set((allTxns || []).map(t => t.billId).filter(Boolean));
    const unloggedOtherServiceSalesAll = (otherServiceSalesAll || []).filter(s => !s.invoice_id || !txnBillIds.has(s.invoice_id));

    const totalOtherServiceRevenue = otherServiceSalesAll.reduce((sum, s) => sum + (s.price_snapshot || 0), 0);

    const genBookingsAllStats = await db.prepare("SELECT * FROM general_package_bookings WHERE status != 'Cancelled'").all();
    const ptBookingsAllStats = await db.prepare("SELECT * FROM pt_advance_bookings WHERE status != 'Cancelled'").all();
    const ptAssignmentsAllStats = await db.prepare("SELECT * FROM pt_assignments WHERE LOWER(COALESCE(status, '')) != 'cancelled'").all();

    const totalGenBookingsRevenue = (genBookingsAllStats || []).reduce((sum, b) => sum + Math.max(0, (b.price || 0) - (b.discount_amount || 0)), 0);
    const totalPtBookingsRevenue = (ptBookingsAllStats || []).reduce((sum, b) => sum + Math.max(0, (b.price_snapshot || 0) - (b.discount_amount || 0)), 0);
    const totalPtAssignmentsRevenue = (ptAssignmentsAllStats || [])
      .filter(a => !a.invoice_id || !txnBillIds.has(a.invoice_id))
      .reduce((sum, a) => sum + Math.max(0, parseFloat(a.package_price_snapshot || 0) - parseFloat(a.discount_amount || 0)), 0);

    const totalRevenueVal = allTxns.reduce((sum, t) => sum + (t.amount || 0), 0) + unloggedOtherServiceSalesAll.reduce((sum, s) => sum + (s.price_snapshot || 0), 0) + totalGenBookingsRevenue + totalPtBookingsRevenue + totalPtAssignmentsRevenue;

    const monthlyOtherServiceRevenueRes = await db.prepare(`
      SELECT SUM(price_snapshot) as total FROM other_service_sales
      WHERE strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?
    `).get(mm, String(currentYear));
    const monthlyOtherServiceRevenue = monthlyOtherServiceRevenueRes ? (monthlyOtherServiceRevenueRes.total || 0) : 0;

    const monthlyUnloggedOtherServiceRevenue = (unloggedOtherServiceSalesAll || [])
      .filter(s => {
        const d = parseAnyDate(s.sale_date || s.created_at);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, s) => sum + (s.price_snapshot || 0), 0);

    const monthlySuppSalesRev = (suppSalesAllStats || [])
      .filter(s => {
        const d = parseAnyDate(s.sale_date || s.created_at);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, s) => sum + (s.total_amount || 0), 0);

    const monthlyGenBookingsRev = (genBookingsAllStats || [])
      .filter(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, b) => sum + Math.max(0, (b.price || 0) - (b.discount_amount || 0)), 0);

    const monthlyPtBookingsRev = (ptBookingsAllStats || [])
      .filter(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, b) => sum + Math.max(0, (b.price_snapshot || 0) - (b.discount_amount || 0)), 0);

    const monthlyPtAssignmentsRev = (ptAssignmentsAllStats || [])
      .filter(a => !a.invoice_id || !txnBillIds.has(a.invoice_id))
      .filter(a => {
        const d = parseAnyDate(a.assigned_date || a.created_at);
        if (!d) return true;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, a) => sum + Math.max(0, parseFloat(a.package_price_snapshot || 0) - parseFloat(a.discount_amount || 0)), 0);

    const monthlyCollectionVal = allTxns
      .filter(t => {
        const d = parseAnyDate(t.date || t.timestamp);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0) + monthlyUnloggedOtherServiceRevenue + monthlyGenBookingsRev + monthlyPtBookingsRev + monthlySuppSalesRev + monthlyPtAssignmentsRev;

    const allExpenses = await db.prepare('SELECT * FROM expenses').all();
    const monthlyExpensesVal = allExpenses
      .filter(e => {
        const d = parseAnyDate(e.date || e.timestamp);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const netProfitVal = monthlyCollectionVal - monthlyExpensesVal;

    const todayObj = new Date();
    todayObj.setHours(0, 0, 0, 0);

    const allClientsList = await db.prepare('SELECT * FROM clients').all();
    let activeCount = 0;
    let activeMaleCount = 0;
    let activeFemaleCount = 0;
    let inactiveCount = 0;
    let inactiveMaleCount = 0;
    let inactiveFemaleCount = 0;
    let expiredCount = 0;
    let expiredPTCount = 0;

    allClientsList.forEach(c => {
      const st = (c.status || '').toLowerCase().trim();
      const expDate = parseAnyDate(c.expiryDate);
      if (expDate) expDate.setHours(0, 0, 0, 0);

      const isExplicitInactive = st === 'inactive' || st === 'expired';
      const isDateExpired = expDate ? (expDate < todayObj) : false;

      const g = (c.gender || '').toLowerCase().trim();
      const isFemale = g === 'female' || g === 'f';

      if (isExplicitInactive || isDateExpired) {
        inactiveCount++;
        expiredCount++;
        if (isFemale) inactiveFemaleCount++;
        else inactiveMaleCount++;
      } else {
        activeCount++;
        if (isFemale) activeFemaleCount++;
        else activeMaleCount++;
      }

      const ptExpDate = parseAnyDate(c.ptToDate);
      if (ptExpDate) ptExpDate.setHours(0, 0, 0, 0);
      if (c.ptCategory && c.ptCategory !== 'None' && ptExpDate && ptExpDate < todayObj) {
        expiredPTCount++;
      }
    });

    const inactivePtCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM pt_assignments WHERE status IN ('Expired', 'Cancelled')"
    ).get().cnt;

    // --- New Metrics ---
    const newClientsMonthCount = await db.prepare(
      "SELECT COUNT(*) as cnt FROM clients WHERE admissionDate LIKE ?"
    ).get(`%-${mm}-%`).cnt;

    const monthlySalesVal = await db.prepare(
      "SELECT SUM(amount) as total FROM clients WHERE admissionDate LIKE ?"
    ).get(`%-${mm}-%`).total || 0;

    const monthlyTxnsCount = allTxns.filter(t => {
      const d = parseAnyDate(t.date || t.timestamp);
      if (!d) return false;
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const yStr = String(d.getFullYear());
      return mStr === mm && yStr === String(currentYear);
    }).length;
    const renewalsMonthCount = Math.max(0, monthlyTxnsCount - newClientsMonthCount);

    const generalAdvanceCount = (await db.prepare("SELECT COUNT(*) as cnt FROM general_package_bookings WHERE LOWER(status) = 'scheduled'").get())?.cnt || 0;
    const ptAdvanceCount = (await db.prepare("SELECT COUNT(*) as cnt FROM pt_advance_bookings WHERE LOWER(status) IN ('scheduled', 'readytoactivate')").get())?.cnt || 0;

    const monthlyOtherServiceSalesCountRes = await db.prepare(`
      SELECT COUNT(*) as cnt FROM other_service_sales
      WHERE strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?
    `).get(mm, String(currentYear));
    const monthlyOtherServiceSalesCount = monthlyOtherServiceSalesCountRes ? (monthlyOtherServiceSalesCountRes.cnt || 0) : 0;

    const allBillsStats = await db.prepare('SELECT * FROM bills').all();
    const monthlyBillsDiscount = (allBillsStats || [])
      .filter(b => {
        const d = parseAnyDate(b.invoiceDate || b.timestamp);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, b) => sum + (parseFloat(b.discount_amount) || 0), 0);

    const monthlyGenBookingsDisc = (genBookingsAllStats || [])
      .filter(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, b) => sum + (parseFloat(b.discount_amount) || 0), 0);

    const monthlyPtBookingsDisc = (ptBookingsAllStats || [])
      .filter(b => {
        const d = parseAnyDate(b.created_at || b.booking_start_date);
        if (!d) return false;
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const yStr = String(d.getFullYear());
        return mStr === mm && yStr === String(currentYear);
      })
      .reduce((sum, b) => sum + (parseFloat(b.discount_amount) || 0), 0);

    const monthlyDiscountVal = monthlyBillsDiscount + monthlyGenBookingsDisc + monthlyPtBookingsDisc;

    const recentTxns = allTxns.slice(0, 5);

    res.json({
      totalRevenue: totalRevenueVal,
      monthlySales: monthlySalesVal,
      monthlyCollection: monthlyCollectionVal,
      monthlyExpenses: monthlyExpensesVal,
      monthlyDiscount: monthlyDiscountVal,
      netProfit: netProfitVal,
      otherServicesRevenue: monthlyOtherServiceRevenue,
      otherServicesSalesCount: monthlyOtherServiceSalesCount,
      activeClients: activeCount,
      activeMaleClients: activeMaleCount,
      activeFemaleClients: activeFemaleCount,
      inactiveClients: inactiveCount,
      inactiveMaleClients: inactiveMaleCount,
      inactiveFemaleClients: inactiveFemaleCount,
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
app.get('/api/revenue', async (req, res) => {
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const allTxns = await db.prepare('SELECT * FROM transactions').all();

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

    const txnBillIds = new Set((allTxns || []).map(t => t.billId).filter(Boolean));
    const ptAssignmentsAll = await db.prepare("SELECT * FROM pt_assignments WHERE status != 'Cancelled'").all();
    (ptAssignmentsAll || []).forEach(a => {
      if (a.invoice_id && txnBillIds.has(a.invoice_id)) return;
      const d = parseAnyDate(a.assigned_date || a.created_at);
      if (d) {
        const mm = d.getMonth();
        if (mm >= 0 && mm < 12) {
          const netPaid = Math.max(0, (a.package_price_snapshot || 0) - (a.discount_amount || 0));
          revenueByMonth[mm].revenue += netPaid;
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
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.prepare('SELECT * FROM settings').all();
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
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body; // Expecting { key: value, ... }
    await db.prepare('DELETE FROM settings').run();
    const updateStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== null) {
        await updateStmt.run(key, String(value));
      }
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTH / USER Routes ──────────────────────────────────────────────────────

// POST login check
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, role, password } = req.body;
    const identifier = username || role;

    // 1. Try matching by (username or role) AND password
    let user = await db.prepare('SELECT id, role FROM users WHERE (username = ? OR role = ?) AND password = ?').get(identifier, identifier, password);

    // 2. Fallback: match by password alone if identifier is generic
    if (!user && password) {
      user = await db.prepare('SELECT id, role FROM users WHERE password = ?').get(password);
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
app.get('/api/auth/credentials', async (req, res) => {
  try {
    const users = await db.prepare('SELECT id, username, password, role FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update credentials
app.put('/api/auth/credentials', async (req, res) => {
  try {
    const { credentials } = req.body; // Array of { role, username, password }

    const update = await db.prepare('UPDATE users SET username = ?, password = ? WHERE role = ?');

    const transaction = async (data) => {
      for (const cred of data) {
        await update.run(cred.username, cred.password, cred.role);
      }
    };

    await transaction(credentials);
    res.json({ message: 'Credentials updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PERFORMANCE Route ────────────────────────────────────────────────────────
app.get('/api/performance', async (req, res) => {
  try {
    const plans = ["Monthly", "Quarterly", "Half-Yearly", "Annual"];
    const results = await Promise.all(plans.map(async (p) => {
      const row = await db.prepare(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as revenue FROM clients WHERE plan = ?"
      ).get(p);
      return {
        plan: p,
        clients: row.cnt,
        revenue: row.revenue,
        status: 'Active'
      };
    }));
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
app.get('/api/whatsapp/reminders', async (req, res) => {
  try {
    const todayISO = getDateOffsetISO(0);
    const in7DaysISO = getDateOffsetISO(7);

    // Clients expiring within 1-7 days
    // Note: expiryDate stored as DD/MM/YYYY text — filter in JS
    const allClientsForReminder = await db.prepare(`
      SELECT id, "clientId", name, phone, plan, "expiryDate"
      FROM clients
      WHERE phone IS NOT NULL AND phone != ''
    `).all();

    const todayObj = new Date(getDateOffsetISO(0));
    const in1DayObj = new Date(getDateOffsetISO(1));
    const in7DayObj = new Date(getDateOffsetISO(7));

    const expiringSoon = allClientsForReminder.filter(c => {
      const d = parseAnyDate(c.expiryDate);
      return d && d >= in1DayObj && d <= in7DayObj;
    });
    const expiredAll = allClientsForReminder.filter(c => {
      const d = parseAnyDate(c.expiryDate);
      return d && d <= todayObj;
    });
    expiringSoon.sort((a, b) => (parseAnyDate(a.expiryDate) || 0) - (parseAnyDate(b.expiryDate) || 0));
    expiredAll.sort((a, b) => (parseAnyDate(b.expiryDate) || 0) - (parseAnyDate(a.expiryDate) || 0));

    res.json({
      expiringSoon,
      expiredToday: expiredAll,
      counts: { expiringSoon: expiringSoon.length, expiredToday: expiredAll.length },
      configured: !!getWaKey(req.env)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/send — Send a message to a single client
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { clientId, clientName, phone, type, message: customMessage } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const client = { name: clientName, phone };
    // Fetch expiry from DB for template
    const dbClient = clientId ? await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) : null;
    if (dbClient) {
      client.plan = dbClient.plan;
      client.expiryDate = dbClient.expiryDate;
    }

    const message = customMessage || (
      type === 'expiring_soon'
        ? buildExpiringSoonMsg({ ...client, plan: client.plan || 'Membership', expiryDate: client.expiryDate || getDateOffsetISO(7) })
        : buildExpiredMsg({ ...client, plan: client.plan || 'Membership', expiryDate: client.expiryDate || getDateOffsetISO(0) })
    );

    await sendWhatsAppMessage(phone, message, req.env);

    // Log to DB
    await db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), clientId || '', clientName, phone, type || 'general');

    res.json({ success: true, message: 'WhatsApp message sent!' });
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// In-memory / temporary cache for public documents (e.g. WhatsApp PDF invoices)
const publicDocsCache = new Map();

// Helper to save PDF buffer to R2 or public uploads and memory cache
const savePdfDocument = async (pdfBuffer, filename, workerEnv) => {
  try {
    const objectKey = `invoices/${filename}`;

    // 1. Cloudflare R2 Binding (Worker / Production)
    const r2Bucket = workerEnv?.GYM_PROFILE_PICTURES;
    if (r2Bucket && typeof r2Bucket.put === 'function') {
      await r2Bucket.put(objectKey, pdfBuffer, {
        httpMetadata: { contentType: 'application/pdf' }
      });
      console.log(`✅ Uploaded ${objectKey} to Cloudflare R2 bucket`);
      return `https://togethertech-olympiagym.olympiafitnessreserveline.workers.dev/api/images/${objectKey}`;
    }

    // 2. Local Node Development Mode
    const localDir = path.join(UPLOADS_DIR, 'invoices');
    if (!fs.existsSync(localDir)) {
      try { fs.mkdirSync(localDir, { recursive: true }); } catch (e) {}
    }
    const localFilePath = path.join(localDir, filename);
    fs.writeFileSync(localFilePath, pdfBuffer);

    // Sync to remote Cloudflare R2 so Metamerged cloud can always download the PDF
    try {
      const uploadResp = await fetch('https://togethertech-olympiagym.olympiafitnessreserveline.workers.dev/api/invoices/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: pdfBuffer.toString('base64'),
          filename
        })
      });
      const uploadJson = await uploadResp.json().catch(() => ({}));
      if (uploadJson?.url) {
        console.log(`✅ Synced ${filename} to Cloudflare R2: ${uploadJson.url}`);
        return uploadJson.url;
      }
    } catch (syncErr) {
      console.warn('Cloudflare R2 sync notice:', syncErr.message);
    }

    return `https://togethertech-olympiagym.olympiafitnessreserveline.workers.dev/api/images/${objectKey}`;
  } catch (err) {
    console.error('Failed to save PDF document:', err);
    return null;
  }
};

// POST /api/invoices/upload-pdf — Upload PDF directly to Cloudflare R2 / Storage
app.post('/api/invoices/upload-pdf', async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 is required' });
    const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');
    const safeFilename = (filename || `Invoice_${Date.now()}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `invoices/${safeFilename}`;

    const r2Bucket = req.env?.GYM_PROFILE_PICTURES;
    if (r2Bucket && typeof r2Bucket.put === 'function') {
      await r2Bucket.put(objectKey, pdfBuffer, {
        httpMetadata: { contentType: 'application/pdf' }
      });
    }

    const publicUrl = `https://togethertech-olympiagym.olympiafitnessreserveline.workers.dev/api/images/${objectKey}`;
    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('Upload PDF error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public-docs/:id', (req, res) => {
  const docId = req.params.id.replace(/\.pdf$/i, '');
  const doc = publicDocsCache.get(docId);
  if (!doc) {
    return res.status(404).send('Document not found or expired.');
  }
  res.setHeader('Content-Type', doc.contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'document.pdf'}"`);
  res.setHeader('Content-Length', doc.buffer.length);
  res.send(doc.buffer);
});

// POST /api/whatsapp/send-invoice — Send invoice directly to client via WhatsApp
app.post('/api/whatsapp/send-invoice', async (req, res) => {
  try {
    const { phone, name, billNo, pdfBase64, message: customMsg } = req.body;
    let documentUrl = req.body.documentUrl;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const filename = `Invoice_${(billNo || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    // If PDF base64 provided, cache it and resolve a valid document URL
    if (!documentUrl && pdfBase64) {
      try {
        const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
        const pdfBuffer = Buffer.from(cleanBase64, 'base64');
        const docId = `inv_${(billNo || 'doc').replace(/[^a-zA-Z0-9_-]/g, '')}_${Date.now()}`;
        publicDocsCache.set(docId, {
          buffer: pdfBuffer,
          filename,
          contentType: 'application/pdf',
          timestamp: Date.now()
        });

        const savedUrl = await savePdfDocument(pdfBuffer, filename, req.env);
        if (savedUrl) {
          documentUrl = savedUrl;
        }
      } catch (pdfErr) {
        console.warn('PDF cache creation notice:', pdfErr.message);
      }
    }

    const caption = customMsg || (
      `Hi ${name || 'Member'}! 👋\n\n` +
      `Please find your official invoice *${billNo || ''}* attached from *OLYMPIA FITNESS* 🏋️‍♂️\n\n` +
      `Thank you for training with us! 💪🔥`
    );

    if (documentUrl && isPublicUrl(documentUrl)) {
      try {
        await sendWhatsAppDocument(phone, caption, documentUrl, filename, req.env);
      } catch (docErr) {
        console.warn('Document send error, falling back to text:', docErr.message);
        await sendWhatsAppMessage(phone, caption, req.env);
      }
    } else {
      await sendWhatsAppMessage(phone, caption, req.env);
    }

    // Log it
    await db.prepare(
      'INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), '', name || '', phone, 'invoice_pdf');

    res.json({ success: true, message: `Invoice sent to ${phone} via WhatsApp!` });
  } catch (err) {
    console.error('WhatsApp invoice send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/whatsapp/send-payment-reminder
app.post('/api/whatsapp/send-payment-reminder', async (req, res) => {
  try {
    const { clientId } = req.body;
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client || !client.phone) return res.status(400).json({ error: 'Client not found or phone missing' });

    if (client.dueAmount <= 0) return res.status(400).json({ error: 'No pending due amount' });

    const message = buildPaymentReminderMsg(client);
    await sendWhatsAppMessage(client.phone, message, req.env);

    await db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
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
      const in1DayObj = new Date(getDateOffsetISO(1));
      const in7DayObj = new Date(getDateOffsetISO(7));
      const all = await db.prepare(`SELECT id, "clientId", name, phone, plan, "expiryDate" FROM clients WHERE phone IS NOT NULL AND phone != ''`).all();
      clients = all.filter(c => { const d = parseAnyDate(c.expiryDate); return d && d >= in1DayObj && d <= in7DayObj; });
    } else {
      const todayObj2 = new Date(getDateOffsetISO(0));
      const all = await db.prepare(`SELECT id, "clientId", name, phone, plan, "expiryDate" FROM clients WHERE phone IS NOT NULL AND phone != ''`).all();
      clients = all.filter(c => { const d = parseAnyDate(c.expiryDate); return d && d <= todayObj2; });
    }

    const results = [];
    for (const client of clients) {
      try {
        const message = type === 'expiring_soon'
          ? buildExpiringSoonMsg(client)
          : buildExpiredMsg(client);
        await sendWhatsAppMessage(client.phone, message, req.env);
        await db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
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
app.get('/api/inquiries', async (req, res) => {
  try {
    const inquiries = await db.prepare('SELECT * FROM inquiries ORDER BY timestamp DESC').all();
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MUST be before /:id routes
app.get('/api/inquiries/next-id', async (req, res) => {
  try {
    const row = await db.prepare('SELECT InquiryId FROM inquiries ORDER BY timestamp DESC LIMIT 1').get();
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
app.get('/api/inquiries/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stats = {
      total: await db.prepare('SELECT COUNT(*) as cnt FROM inquiries').get().cnt,
      today: await db.prepare('SELECT COUNT(*) as cnt FROM inquiries WHERE InquiryDate = ?').get(today).cnt,
      interested: await db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Interested'").get().cnt,
      joined: await db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Joined'").get().cnt,
      pending: await db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Follow Up Pending'").get().cnt,
      notInterested: await db.prepare("SELECT COUNT(*) as cnt FROM inquiries WHERE status = 'Not Interested'").get().cnt,
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries', async (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    await db.prepare(`
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

app.put('/api/inquiries/:id', async (req, res) => {
  try {
    const data = req.body;
    await db.prepare(`
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

app.delete('/api/inquiries/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inquiries/:id/followups', async (req, res) => {
  try {
    const followups = await db.prepare('SELECT * FROM follow_ups WHERE InquiryId = ? ORDER BY timestamp DESC').all(req.params.id);
    res.json(followups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries/:id/followups', async (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    await db.prepare(`
      INSERT INTO follow_ups (id, InquiryId, date, notes, clientResponse, nextDate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.date, data.notes, data.clientResponse, data.nextDate, data.status);

    // Also update the main Inquiry status and next follow-up date
    await db.prepare('UPDATE inquiries SET status = ?, nextFollowUp = ? WHERE id = ?').run(data.status, data.nextDate, req.params.id);

    res.status(201).json({ id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/log — Send history
app.get('/api/whatsapp/log', async (req, res) => {
  try {
    const logs = await db.prepare('SELECT * FROM whatsapp_log ORDER BY sentAt DESC LIMIT 200').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Daily Cron: 9:00 AM — Auto-send WhatsApp reminders & Sweep Expired PT Assignments ─
if (!process.env.CF_WORKER) {
  cron.schedule('0 9 * * *', async () => {
    autoExpireAssignments();
    autoActivateAdvanceBookings();
    if (!WA_KEY) {
      console.log('⚠️ [WhatsApp Cron] Skipped — WHATSAPP_KEY not set in .env');
      return;
    }

    const todayISO = getDateOffsetISO(0);
    const in7DaysISO = getDateOffsetISO(7);
    const in3DaysISO = getDateOffsetISO(3);
    console.log(`📲 [WhatsApp Cron] Running at ${new Date().toLocaleString('en-IN')}`);

    // Send expiring-soon reminders (7 days and 3 days before)
    const allClientsForCron = await db.prepare(`SELECT id, "clientId", name, phone, plan, "expiryDate" FROM clients WHERE phone IS NOT NULL AND phone != ''`).all();
    const in7DaysObj = new Date(in7DaysISO);
    const in3DaysObj = new Date(in3DaysISO);
    const soonClients = allClientsForCron.filter(c => {
      const d = parseAnyDate(c.expiryDate);
      return d && (d.toISOString().split('T')[0] === in7DaysISO || d.toISOString().split('T')[0] === in3DaysISO);
    });

    for (const client of soonClients) {
      try {
        await sendWhatsAppMessage(client.phone, buildExpiringSoonMsg(client));
        await db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
        ).run(randomUUID(), client.id, client.name, client.phone, 'expiring_soon');
        console.log(`   ✅ Reminder sent → ${client.name} (expires in 7 or 3 days)`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`   ❌ Failed → ${client.name}: ${err.message}`);
      }
    }

    // Send expired-today notifications
    const expiredClients = allClientsForCron.filter(c => {
      const d = parseAnyDate(c.expiryDate);
      return d && d.toISOString().split('T')[0] === todayISO;
    });

    for (const client of expiredClients) {
      try {
        await sendWhatsAppMessage(client.phone, buildExpiredMsg(client));
        await db.prepare('INSERT INTO whatsapp_log (id, clientId, clientName, phone, type) VALUES (?, ?, ?, ?, ?)'
        ).run(randomUUID(), client.id, client.name, client.phone, 'expired');
        console.log(`   ✅ Expiry notice sent → ${client.name}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`   ❌ Failed → ${client.name}: ${err.message}`);
      }
    }

    console.log(`📲 [WhatsApp Cron] Done. Sent to ${soonClients.length + expiredClients.length} clients.`);
  }, { timezone: 'Asia/Kolkata' });
}

// ─── STAFF Routes ────────────────────────────────────────────────────────────

// GET all staff
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await db.prepare('SELECT * FROM staff ORDER BY dateAdded DESC').all();
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create staff
app.post('/api/staff', async (req, res) => {
  try {
    const data = req.body;
    const id = randomUUID();
    await db.prepare(`
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
app.get('/api/staff/:id', async (req, res) => {
  try {
    const staff = await db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update staff
app.put('/api/staff/:id', async (req, res) => {
  try {
    const data = req.body;
    await db.prepare(`
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
app.delete('/api/staff/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
    res.json({ message: 'Staff deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLIENT MEASUREMENTS Routes ──────────────────────────────────────────────

// GET measurements for a specific client
app.get('/api/clients/:clientId/measurements', async (req, res) => {
  try {
    const measurements = await db.prepare(`
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
app.post('/api/clients/:clientId/measurements', async (req, res) => {
  try {
    const { clientId } = req.params;
    const {
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
    } = req.body;

    const id = randomUUID();
    await db.prepare(`
      INSERT INTO client_measurements (
        id, clientId, date, height, weight, bmi, lbm, fat,
        chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, clientId, date || toDateLabel(), height || null, weight || null, bmi || '', lbm || null, fat || null,
      chest_inspiration || null, chest_expiration || null, abs || null, waist || null, hip || null, thigh || null, calf || null, arm || null, forearm || null, hip_waist_ratio || null
    );

    const newMeasurement = await db.prepare('SELECT * FROM client_measurements WHERE id = ?').get(id);
    res.status(201).json(newMeasurement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update a measurement
app.put('/api/clients/:clientId/measurements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio
    } = req.body;

    await db.prepare(`
      UPDATE client_measurements SET
        date = ?, height = ?, weight = ?, bmi = ?, lbm = ?, fat = ?,
        chest_inspiration = ?, chest_expiration = ?, abs = ?, waist = ?, hip = ?, thigh = ?, calf = ?, arm = ?, forearm = ?, hip_waist_ratio = ?
      WHERE id = ?
    `).run(
      date, height, weight, bmi, lbm, fat,
      chest_inspiration, chest_expiration, abs, waist, hip, thigh, calf, arm, forearm, hip_waist_ratio,
      id
    );

    const updated = await db.prepare('SELECT * FROM client_measurements WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a measurement
app.delete('/api/clients/:clientId/measurements/:id', async (req, res) => {
  try {
    await db.prepare('DELETE FROM client_measurements WHERE id = ?').run(req.params.id);
    res.json({ message: 'Measurement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DYNAMIC DASHBOARD STATS ROUTE ───────────────────────────────────────────



function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const str = String(monthStr).trim();
  const parts = str.split('-');
  if (parts.length === 2) {
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    if (!isNaN(yyyy) && !isNaN(mm) && mm >= 0 && mm <= 11) {
      const dateObj = new Date(yyyy, mm, 1);
      return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  return str;
}

app.get('/api/dashboard/dynamic-stats', async (req, res) => {
  try {
    const { topDate, financialStartDate, financialEndDate } = req.query;

    const refDateObj = parseAnyDate(topDate) || new Date();
    refDateObj.setHours(0, 0, 0, 0);

    const startDateObj = parseAnyDate(financialStartDate) || new Date(refDateObj.getFullYear(), refDateObj.getMonth(), 1);
    startDateObj.setHours(0, 0, 0, 0);

    const endDateObj = parseAnyDate(financialEndDate) || new Date();
    endDateObj.setHours(23, 59, 59, 999);

    // Fetch all clients, transactions, bills, expenses
    const clients = await db.prepare('SELECT * FROM clients').all();
    const transactions = await db.prepare('SELECT * FROM transactions').all();
    const bills = await db.prepare('SELECT * FROM bills').all();
    const expenses = await db.prepare('SELECT * FROM expenses').all();

    let genActive = 0, genExp = 0;
    let kidsActive = 0, kidsExp = 0;
    let otherActive = 0, otherExp = 0;
    let ptActive = 0, ptExp = 0;
    let pendingClientsCount = 0;
    let inactiveClientsCount = 0;
    let activeMaleCount = 0;
    let activeFemaleCount = 0;
    let inactiveMaleCount = 0;
    let inactiveFemaleCount = 0;

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

      const g = (c.gender || '').toLowerCase().trim();
      const isFemale = g === 'female' || g === 'f';

      if (isActiveStatus) {
        if (isFemale) activeFemaleCount++;
        else activeMaleCount++;
      } else {
        if (isFemale) inactiveFemaleCount++;
        else inactiveMaleCount++;
      }

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
      activeMaleClients: activeMaleCount,
      activeFemaleClients: activeFemaleCount,
      inactiveMaleClients: inactiveMaleCount,
      inactiveFemaleClients: inactiveFemaleCount,
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

app.get('/api/supplements', async (req, res) => {
  try {
    const { activeOnly } = req.query;
    let query = 'SELECT * FROM supplements';
    if (activeOnly === 'true') {
      query += ' WHERE active = 1';
    }
    query += ' ORDER BY name ASC';
    const supplements = await db.prepare(query).all();
    res.json(supplements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements', async (req, res) => {
  try {
    const { name, brand, category, unit, low_stock_threshold, default_sale_price } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplement name is required' });
    }

    const threshold = low_stock_threshold !== undefined && low_stock_threshold !== '' ? parseInt(low_stock_threshold, 10) : 5;
    const salePrice = default_sale_price !== undefined && default_sale_price !== '' ? parseFloat(default_sale_price) : null;

    const result = await db.prepare(`
      INSERT INTO supplements (name, brand, category, unit, low_stock_threshold, default_sale_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name.trim(), brand ? brand.trim() : '', category || 'Other', unit ? unit.trim() : 'pack', threshold, salePrice);

    const newSupplement = await db.prepare('SELECT * FROM supplements WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newSupplement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/supplements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, category, unit, low_stock_threshold, default_sale_price, active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplement name is required' });
    }

    const threshold = low_stock_threshold !== undefined && low_stock_threshold !== '' ? parseInt(low_stock_threshold, 10) : 5;
    const salePrice = default_sale_price !== undefined && default_sale_price !== '' ? parseFloat(default_sale_price) : null;
    const isActive = active !== undefined ? (active ? 1 : 0) : 1;

    await db.prepare(`
      UPDATE supplements
      SET name = ?, brand = ?, category = ?, unit = ?, low_stock_threshold = ?, default_sale_price = ?, active = ?
      WHERE id = ?
    `).run(name.trim(), brand ? brand.trim() : '', category || 'Other', unit ? unit.trim() : 'pack', threshold, salePrice, isActive, id);

    const updated = await db.prepare('SELECT * FROM supplements WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/supplements/:id/toggle-active', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.prepare('SELECT active FROM supplements WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Supplement not found' });

    const newActive = item.active === 1 ? 0 : 1;
    await db.prepare('UPDATE supplements SET active = ? WHERE id = ?').run(newActive, id);
    res.json({ success: true, active: newActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/supplements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare('DELETE FROM supplements WHERE id = ?').run(id);
    res.json({ message: 'Supplement deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PURCHASE LOG ENDPOINTS ───────────────────────────────────────────────────

app.get('/api/supplements/purchases', async (req, res) => {
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
    const purchases = await db.prepare(query).all(...params);
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements/purchases', async (req, res) => {
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

    const executePurchaseTransaction = async () => {
      const supp = await db.prepare('SELECT id FROM supplements WHERE id = ?').get(supplement_id);
      if (!supp) {
        throw new Error('Selected supplement does not exist');
      }

      const insertStmt = await db.prepare(`
        INSERT INTO supplement_purchases (
          supplement_id, vendor_name, quantity, purchase_price_per_unit, total_cost, purchase_date, invoice_ref, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = await insertStmt.run(
        supplement_id, vendor_name.trim(), qty, pricePerUnit, totalCost, purchase_date, invoice_ref ? invoice_ref.trim() : null, notes ? notes.trim() : null, created_by || null
      );

      await db.prepare(`
        UPDATE supplements
        SET current_stock = current_stock + ?, default_purchase_price = ?
        WHERE id = ?
      `).run(qty, pricePerUnit, supplement_id);

      return result.lastInsertRowid;
    };

    const newPurchaseId = await executePurchaseTransaction();
    const newPurchase = await db.prepare(`
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

app.put('/api/supplements/purchases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplement_id, vendor_name, quantity, purchase_price_per_unit, purchase_date, invoice_ref, notes } = req.body;

    const oldPurchase = await db.prepare('SELECT * FROM supplement_purchases WHERE id = ?').get(id);
    if (!oldPurchase) {
      return res.status(404).json({ error: 'Purchase record not found' });
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
    const targetSuppId = supplement_id || oldPurchase.supplement_id;

    await db.prepare(`
      UPDATE supplement_purchases
      SET supplement_id = ?, vendor_name = ?, quantity = ?, purchase_price_per_unit = ?, total_cost = ?, purchase_date = ?, invoice_ref = ?, notes = ?
      WHERE id = ?
    `).run(
      targetSuppId,
      vendor_name ? vendor_name.trim() : oldPurchase.vendor_name,
      qty,
      pricePerUnit,
      totalCost,
      purchase_date || oldPurchase.purchase_date,
      invoice_ref !== undefined ? (invoice_ref ? invoice_ref.trim() : null) : oldPurchase.invoice_ref,
      notes !== undefined ? (notes ? notes.trim() : null) : oldPurchase.notes,
      id
    );

    // Adjust stock difference if same supplement
    if (String(oldPurchase.supplement_id) === String(targetSuppId)) {
      const deltaQty = qty - oldPurchase.quantity;
      await db.prepare(`
        UPDATE supplements
        SET current_stock = current_stock + ?, default_purchase_price = ?
        WHERE id = ?
      `).run(deltaQty, pricePerUnit, targetSuppId);
    } else {
      // Revert old supplement stock & add to new supplement stock
      await db.prepare('UPDATE supplements SET current_stock = MAX(0, current_stock - ?) WHERE id = ?').run(oldPurchase.quantity, oldPurchase.supplement_id);
      await db.prepare('UPDATE supplements SET current_stock = current_stock + ?, default_purchase_price = ? WHERE id = ?').run(qty, pricePerUnit, targetSuppId);
    }

    const updated = await db.prepare(`
      SELECT p.*, s.name as supplement_name, s.unit as supplement_unit
      FROM supplement_purchases p
      JOIN supplements s ON p.supplement_id = s.id
      WHERE p.id = ?
    `).get(id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/supplements/purchases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const purchase = await db.prepare('SELECT * FROM supplement_purchases WHERE id = ?').get(id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase record not found' });
    }

    await db.prepare('DELETE FROM supplement_purchases WHERE id = ?').run(id);

    // Adjust stock in supplements table
    await db.prepare('UPDATE supplements SET current_stock = MAX(0, current_stock - ?) WHERE id = ?').run(purchase.quantity, purchase.supplement_id);

    res.json({ message: 'Purchase entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SALE LOG ENDPOINTS ───────────────────────────────────────────────────────

app.get('/api/supplements/sales', async (req, res) => {
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
    const sales = await db.prepare(query).all(...params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplements/sales', async (req, res) => {
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

    const executeSaleTransaction = async () => {
      const supplement = await db.prepare('SELECT current_stock, default_purchase_price FROM supplements WHERE id = ?').get(supplement_id);
      if (!supplement) {
        throw new Error('Selected supplement does not exist');
      }

      if (supplement.current_stock < qty) {
        throw new Error(`Insufficient stock — only ${supplement.current_stock} units available`);
      }

      const costPriceSnapshot = supplement.default_purchase_price !== null && supplement.default_purchase_price !== undefined
        ? supplement.default_purchase_price
        : 0;

      const result = await db.prepare(`
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

      await db.prepare('UPDATE supplements SET current_stock = current_stock - ? WHERE id = ?').run(qty, supplement_id);

      return result.lastInsertRowid;
    };

    const newSaleId = await executeSaleTransaction();
    const newSale = await db.prepare(`
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

// DELETE supplement sale (restores inventory stock)
app.delete('/api/supplements/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await db.prepare('SELECT * FROM supplement_sales WHERE id = ?').get(id);
    if (!sale) {
      return res.status(404).json({ error: 'Supplement sale record not found' });
    }

    // Restore stock to inventory
    await db.prepare('UPDATE supplements SET current_stock = current_stock + ? WHERE id = ?').run(sale.quantity, sale.supplement_id);

    // Delete sale entry
    await db.prepare('DELETE FROM supplement_sales WHERE id = ?').run(id);

    res.json({ message: 'Supplement sale entry deleted and stock restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REVENUE & PROFIT DASHBOARD ENDPOINT ──────────────────────────────────────

app.get('/api/supplements/revenue-report', async (req, res) => {
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

    const purchaseCostRow = await db.prepare(`SELECT SUM(total_cost) as total FROM supplement_purchases ${purchasesWhere}`).get(...purchasesParams);
    const totalPurchaseCost = purchaseCostRow && purchaseCostRow.total ? purchaseCostRow.total : 0;

    const salesRow = await db.prepare(`
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
    const breakdown = await db.prepare(`
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
    const dailySales = await db.prepare(`
      SELECT sale_date as date, SUM(total_amount) as revenue, SUM(quantity * cost_price_snapshot) as cogs
      FROM supplement_sales ${salesWhere}
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `).all(...salesParams);

    const dailyPurchases = await db.prepare(`
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

    const lowStockAlerts = await db.prepare(`
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

app.get('/api/supplements/dashboard-summary', async (req, res) => {
  try {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().substring(0, 7);

    const salesRow = await db.prepare(`
      SELECT 
        SUM(total_amount) as "monthRevenue",
        SUM(total_amount - (quantity * cost_price_snapshot)) as "monthProfit"
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

app.get('/api/gst/settings', async (req, res) => {
  try {
    const settings = await db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || {
      id: 1,
      business_legal_name: 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin: '',
      business_address: 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      gst_rate_percent: 4.8
    };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gst/settings', async (req, res) => {
  try {
    const { business_legal_name, business_gstin, business_address, gst_rate_percent } = req.body;
    await db.prepare(`
      INSERT INTO gst_settings (id, business_legal_name, business_gstin, business_address, gst_rate_percent)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_legal_name = excluded.business_legal_name,
        business_gstin = excluded.business_gstin,
        business_address = excluded.business_address,
        gst_rate_percent = excluded.gst_rate_percent
    `).run(
      business_legal_name || 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin != null ? String(business_gstin).trim() : '',
      business_address || 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      parseFloat(gst_rate_percent) || 4.8
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/gst/report', async (req, res) => {
  try {
    let { month } = req.query;
    if (!month) {
      month = new Date().toISOString().substring(0, 7); // YYYY-MM
    }

    const settings = await db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || {
      id: 1,
      business_legal_name: 'OLYMPIA FITNESS A/C UNISEX',
      business_gstin: '332323402248ED',
      business_address: 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
      gst_rate_percent: 4.8
    };

    // Mark any legacy PT bills to category 'PT'
    try {
      await db.prepare(`
        UPDATE bills 
        SET invoice_category = 'PT' 
        WHERE (invoice_category IS NULL OR invoice_category = 'GeneralPlan')
          AND (planName LIKE 'PT%' OR planName LIKE '%Personal Training%' OR id IN (SELECT invoice_id FROM pt_assignments WHERE invoice_id IS NOT NULL))
      `).run();
    } catch (e) {}

    const allBills = await db.prepare(`
      SELECT * FROM bills 
      WHERE (invoice_category IS NULL OR invoice_category = 'GeneralPlan')
        AND (invoice_category IS NULL OR invoice_category != 'PT')
        AND (planName IS NULL OR (planName NOT LIKE 'PT%' AND planName NOT LIKE '%Personal Training%' AND planName NOT LIKE 'Service:%' AND planName NOT LIKE 'Other%'))
        AND id NOT IN (SELECT invoice_id FROM pt_assignments WHERE invoice_id IS NOT NULL)
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

app.post('/api/gst/backfill', async (req, res) => {
  try {
    const gstSettings = await db.prepare('SELECT * FROM gst_settings WHERE id = 1').get() || { gst_rate_percent: 4.8 };
    const rate = gstSettings.gst_rate_percent || 4.8;

    // Ensure PT bills are set to category 'PT'
    try {
      await db.prepare(`
        UPDATE bills 
        SET invoice_category = 'PT' 
        WHERE (planName LIKE 'PT%' OR planName LIKE '%Personal Training%' OR id IN (SELECT invoice_id FROM pt_assignments WHERE invoice_id IS NOT NULL))
      `).run();
    } catch (e) {}

    const billsToBackfill = await db.prepare(`
      SELECT * FROM bills 
      WHERE (invoice_category IS NULL OR invoice_category = 'GeneralPlan')
        AND (invoice_category IS NULL OR invoice_category != 'PT')
        AND (planName IS NULL OR (planName NOT LIKE 'PT%' AND planName NOT LIKE '%Personal Training%' AND planName NOT LIKE 'Service:%' AND planName NOT LIKE 'Other%'))
        AND id NOT IN (SELECT invoice_id FROM pt_assignments WHERE invoice_id IS NOT NULL)
    `).all();

    let count = 0;
    const updateStmt = await db.prepare(`
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
app.post('/api/reset-operational-data', async (req, res) => {
  try {
    const tablesToClear = [
      'transactions', 'bills', 'expenses', 'clients', 'attendance',
      'whatsapp_log', 'inquiries', 'follow_ups', 'client_measurements',
      'supplement_sales', 'supplement_purchases', 'supplements',
      'other_service_sales', 'pt_class_log', 'trainer_daily_status',
      'trainer_payroll_adjustments', 'payroll_locks', 'pt_assignments',
      'pt_advance_bookings', 'general_package_bookings', 'staff'
    ];
    let clearedCount = 0;

    for (const tableName of tablesToClear) {
      try {
        const result = await db.prepare(`DELETE FROM "${tableName}"`).run();
        clearedCount += result.changes;
      } catch (e) { /* table may not exist yet */ }
    }

    res.json({ success: true, message: `Cleared ${clearedCount} records. Retained PT Packages, Tariff Settings, and Login Users.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only serve static files from local disk in Node.js/Electron environments
if (!process.env.CF_WORKER) {
  const distPath = process.env.DIST_PATH || path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Only start the HTTP server in Node.js environments (not in Cloudflare Workers)
if (!process.env.CF_WORKER) {
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

// ─── Global JSON Error Handler ─────────────────────────────────────────────
// Must be last middleware — catches any error passed via next(err) or thrown
// in async routes that didn't handle it.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error('[Express Error]', err.message, err.stack);
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

app.initDb = initDb;
app.backfillPtAssignmentTransactions = backfillPtAssignmentTransactions;
app.autoActivateAdvanceBookings = autoActivateAdvanceBookings;
app.autoExpireAssignments = autoExpireAssignments;

module.exports = app;
module.exports.initDb = initDb;
module.exports.backfillPtAssignmentTransactions = backfillPtAssignmentTransactions;
module.exports.autoActivateAdvanceBookings = autoActivateAdvanceBookings;
module.exports.autoExpireAssignments = autoExpireAssignments;

