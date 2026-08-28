/**
 * migrate-pg.js — Neon PostgreSQL Schema + Seed Script
 * 
 * Run once: node server/migrate-pg.js
 * Creates all tables and seeds default data on Neon PostgreSQL.
 */

require('dotenv').config();
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  console.log('✅ Connected to Neon PostgreSQL');

  try {
    await client.query('BEGIN');

    // ─── SCHEMA ──────────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id            TEXT PRIMARY KEY,
        "clientId"    TEXT,
        name          TEXT NOT NULL,
        phone         TEXT,
        plan          TEXT,
        "fromDate"    TEXT,
        "expiryDate"  TEXT,
        amount        REAL DEFAULT 0,
        "personalTraining" INTEGER DEFAULT 0,
        status        TEXT DEFAULT 'active',
        gstin         TEXT,
        "dateAdded"   TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY'),
        gender        TEXT,
        "ptCategory"  TEXT,
        "ptFromDate"  TEXT,
        "ptToDate"    TEXT,
        "ptPackage"   TEXT,
        "programType" TEXT,
        diet          INTEGER DEFAULT 0,
        "trainerId"   TEXT,
        "admissionDate" TEXT,
        "profileImage"  TEXT,
        "paidAmount"  REAL DEFAULT 0,
        "dueAmount"   REAL DEFAULT 0,
        "paymentStatus" TEXT DEFAULT 'Paid'
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id        TEXT PRIMARY KEY,
        "clientId"  TEXT,
        "billId"    TEXT,
        name      TEXT,
        method    TEXT DEFAULT 'CASH',
        date      TEXT,
        amount    REAL DEFAULT 0,
        status    TEXT DEFAULT 'CAPTURED',
        timestamp TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id                    TEXT PRIMARY KEY,
        "billNo"              TEXT UNIQUE,
        "clientId"            TEXT,
        "clientName"          TEXT,
        "invoiceDate"         TEXT,
        "joinDate"            TEXT,
        "expiryDate"          TEXT,
        "planAmount"          REAL DEFAULT 0,
        "paidAmount"          REAL DEFAULT 0,
        "dueAmount"           REAL DEFAULT 0,
        "paymentStatus"       TEXT DEFAULT 'Due',
        "dueNumber"           INTEGER DEFAULT 0,
        "totalPlanAmount"     REAL DEFAULT 0,
        "remainingBalance"    REAL DEFAULT 0,
        "planName"            TEXT,
        client_gstin_snapshot TEXT,
        timestamp             TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS'),
        invoice_category      TEXT DEFAULT 'GeneralPlan',
        taxable_value         REAL,
        cgst_amount           REAL,
        sgst_amount           REAL,
        gst_rate_snapshot     REAL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value REAL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id          TEXT PRIMARY KEY,
        date        TEXT,
        name        TEXT,
        category    TEXT,
        amount      REAL DEFAULT 0,
        "paymentMode" TEXT DEFAULT 'CASH',
        notes       TEXT,
        timestamp   TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trainers (
        id                        TEXT PRIMARY KEY,
        "trainerId"               TEXT UNIQUE,
        name                      TEXT NOT NULL,
        specialization            TEXT,
        experience                TEXT,
        status                    TEXT DEFAULT 'Active',
        "dateAdded"               TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY'),
        grade                     TEXT,
        custom_commission_percent REAL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        "fathersName"   TEXT,
        "mothersName"   TEXT,
        "spouseName"    TEXT,
        dob             TEXT,
        gender          TEXT,
        "maritalStatus" TEXT,
        nationality     TEXT,
        religion        TEXT,
        community       TEXT,
        "languageRead"  TEXT,
        "languageWrite" TEXT,
        "languageSpeak" TEXT,
        education       TEXT,
        "itKnowledge"   TEXT,
        "homeContact1"  TEXT,
        "homeContact2"  TEXT,
        "contactNumber" TEXT,
        date            TEXT,
        place           TEXT,
        "dateAdded"     TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id       TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        role     TEXT NOT NULL,
        UNIQUE(username, role)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_log (
        id          TEXT PRIMARY KEY,
        "clientId"  TEXT,
        "clientName" TEXT,
        phone       TEXT,
        type        TEXT,
        "sentAt"    TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id        TEXT PRIMARY KEY,
        "clientId" TEXT NOT NULL,
        date      TEXT NOT NULL,
        status    TEXT DEFAULT 'Present',
        timestamp TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS'),
        UNIQUE("clientId", date)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id              TEXT PRIMARY KEY,
        "InquiryId"     TEXT UNIQUE,
        name            TEXT NOT NULL,
        phone           TEXT NOT NULL,
        age             INTEGER,
        gender          TEXT,
        goal            TEXT,
        plan            TEXT,
        "trainerRequired" TEXT DEFAULT 'No',
        "InquiryDate"   TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY'),
        status          TEXT DEFAULT 'New',
        "nextFollowUp"  TEXT,
        timestamp       TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS'),
        "marriedStatus" TEXT,
        occupation      TEXT,
        company         TEXT,
        address         TEXT,
        email           TEXT,
        height          TEXT,
        weight          TEXT,
        bmi             TEXT,
        lbm             TEXT,
        fat             TEXT,
        "referredBy"    TEXT,
        "lookingFor"    TEXT,
        "enquiredBy"    TEXT,
        messaged        TEXT,
        "tariffDiscussed" TEXT,
        "reminderCall"  TEXT,
        call1           TEXT,
        call2           TEXT,
        call3           TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id              TEXT PRIMARY KEY,
        "InquiryId"     TEXT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
        date            TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY'),
        notes           TEXT,
        "clientResponse" TEXT,
        "nextDate"      TEXT,
        status          TEXT,
        timestamp       TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS client_measurements (
        id                 TEXT PRIMARY KEY,
        "clientId"         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
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
        timestamp          TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI:SS')
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplements (
        id                     SERIAL PRIMARY KEY,
        name                   TEXT NOT NULL,
        brand                  TEXT,
        category               TEXT,
        unit                   TEXT,
        current_stock          INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold    INTEGER NOT NULL DEFAULT 5,
        default_purchase_price REAL,
        default_sale_price     REAL,
        active                 INTEGER DEFAULT 1,
        created_at             TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplement_purchases (
        id                      SERIAL PRIMARY KEY,
        supplement_id           INTEGER NOT NULL REFERENCES supplements(id),
        vendor_name             TEXT NOT NULL,
        quantity                INTEGER NOT NULL CHECK(quantity > 0),
        purchase_price_per_unit REAL NOT NULL CHECK(purchase_price_per_unit > 0),
        total_cost              REAL NOT NULL,
        purchase_date           DATE NOT NULL,
        invoice_ref             TEXT,
        notes                   TEXT,
        created_by              TEXT,
        created_at              TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS supplement_sales (
        id                  SERIAL PRIMARY KEY,
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
        created_by          TEXT,
        created_at          TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS other_service_tariffs (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        price         REAL NOT NULL,
        duration_days INTEGER NOT NULL,
        is_hidden     INTEGER DEFAULT 0,
        active        INTEGER DEFAULT 1,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS other_service_sales (
        id             SERIAL PRIMARY KEY,
        client_id      TEXT REFERENCES clients(id),
        walkin_name    TEXT,
        walkin_phone   TEXT,
        service_id     INTEGER REFERENCES other_service_tariffs(id),
        price_snapshot REAL NOT NULL,
        sale_date      DATE NOT NULL,
        invoice_id     TEXT REFERENCES bills(id),
        created_at     TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS gst_settings (
        id                  INTEGER PRIMARY KEY DEFAULT 1,
        business_legal_name TEXT DEFAULT 'OLYMPIA FITNESS A/C UNISEX',
        business_gstin      TEXT DEFAULT '332323402248ED',
        business_address    TEXT DEFAULT 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014',
        gst_rate_percent    REAL DEFAULT 4.8
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pt_packages (
        id             SERIAL PRIMARY KEY,
        name           TEXT NOT NULL,
        price          REAL NOT NULL,
        total_classes  INTEGER NOT NULL,
        category       TEXT NOT NULL,
        duration_days  INTEGER NOT NULL DEFAULT 30,
        eligible_grades TEXT NOT NULL,
        is_custom      INTEGER DEFAULT 0,
        active         INTEGER DEFAULT 1,
        created_at     TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pt_assignments (
        id                      SERIAL PRIMARY KEY,
        client_id               TEXT NOT NULL REFERENCES clients(id),
        pt_package_id           INTEGER NOT NULL REFERENCES pt_packages(id),
        trainer_id              TEXT NOT NULL REFERENCES trainers(id),
        package_price_snapshot  REAL NOT NULL,
        total_classes_snapshot  INTEGER NOT NULL,
        classes_completed       INTEGER DEFAULT 0,
        status                  TEXT CHECK(status IN ('Active','Completed','Cancelled','Expired')) DEFAULT 'Active',
        assigned_date           DATE NOT NULL,
        expiry_date             DATE NOT NULL,
        invoice_id              TEXT REFERENCES bills(id),
        timing                  TEXT,
        created_at              TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS general_package_bookings (
        id                  SERIAL PRIMARY KEY,
        client_id           TEXT NOT NULL REFERENCES clients(id),
        plan_type           TEXT NOT NULL,
        price               REAL NOT NULL,
        booking_start_date  DATE NOT NULL,
        booking_end_date    DATE NOT NULL,
        status              TEXT CHECK(status IN ('Scheduled','Active','Cancelled')) NOT NULL DEFAULT 'Scheduled',
        created_at          TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pt_advance_bookings (
        id                      SERIAL PRIMARY KEY,
        client_id               TEXT NOT NULL REFERENCES clients(id),
        pt_package_id           INTEGER NOT NULL REFERENCES pt_packages(id),
        trainer_id              TEXT NOT NULL REFERENCES trainers(id),
        price_snapshot          REAL NOT NULL,
        total_classes_snapshot  INTEGER NOT NULL,
        booking_start_date      DATE NOT NULL,
        status                  TEXT CHECK(status IN ('Scheduled','ReadyToActivate','Active','Cancelled')) NOT NULL DEFAULT 'Scheduled',
        created_at              TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pt_class_log (
        id                      SERIAL PRIMARY KEY,
        pt_assignment_id        INTEGER NOT NULL REFERENCES pt_assignments(id),
        trainer_id              TEXT NOT NULL REFERENCES trainers(id),
        client_id               TEXT NOT NULL REFERENCES clients(id),
        class_date              DATE NOT NULL,
        session_slot            TEXT CHECK(session_slot IN ('Morning','Evening')) NOT NULL DEFAULT 'Morning',
        per_class_rate_snapshot REAL NOT NULL,
        slab_applied            TEXT CHECK(slab_applied IN ('Slab1','Slab2')) NOT NULL,
        notes                   TEXT,
        created_at              TIMESTAMP DEFAULT NOW(),
        UNIQUE(pt_assignment_id, class_date, session_slot)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_locks (
        month       TEXT PRIMARY KEY,
        locked_at   TIMESTAMP DEFAULT NOW(),
        locked_by   TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trainer_payroll_adjustments (
        id               SERIAL PRIMARY KEY,
        trainer_id       TEXT NOT NULL REFERENCES trainers(id),
        month            TEXT NOT NULL,
        basic_pay        REAL NOT NULL DEFAULT 0,
        bonus            REAL NOT NULL DEFAULT 0,
        bonus_note       TEXT,
        incentive_amount REAL NOT NULL DEFAULT 0,
        incentive_type   TEXT CHECK(incentive_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add',
        other_amount     REAL NOT NULL DEFAULT 0,
        other_type       TEXT CHECK(other_type IN ('Add','Subtract')) NOT NULL DEFAULT 'Add',
        other_label      TEXT,
        updated_by       TEXT,
        updated_at       TIMESTAMP DEFAULT NOW(),
        UNIQUE(trainer_id, month)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trainer_daily_status (
        id          SERIAL PRIMARY KEY,
        trainer_id  TEXT NOT NULL REFERENCES trainers(id),
        status_date TEXT NOT NULL,
        status      TEXT CHECK(status IN ('Present','Absent')) NOT NULL DEFAULT 'Present',
        marked_by   TEXT,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(trainer_id, status_date)
      );
    `);

    console.log('✅ All tables created');

    // ─── SEEDS ────────────────────────────────────────────────────────────────

    // GST Settings
    await client.query(`
      INSERT INTO gst_settings (id, business_legal_name, business_gstin, business_address, gst_rate_percent)
      VALUES (1, 'OLYMPIA FITNESS A/C UNISEX', '332323402248ED', 'Meenakshi Garden, (Kalankarai) Reserve Line, Vishalakshipuram Main Road, Madurai, 625014', 4.8)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Settings (tariffs)
    const settingsData = [
      ['Monthly', 1000], ['Quarterly', 2500], ['Half-Yearly', 4500],
      ['Annual', 8000], ['PT_Certified', 1000], ['PT_Pro', 1500], ['Diet', 500]
    ];
    for (const [key, value] of settingsData) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    // Default Users
    const usersResult = await client.query(`SELECT COUNT(*) as cnt FROM users`);
    if (parseInt(usersResult.rows[0].cnt) === 0) {
      await client.query(
        `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [randomUUID(), 'olympia', 'master123', 'superadmin']
      );
      await client.query(
        `INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [randomUUID(), 'olympia', 'admin123', 'admin']
      );
    }

    // Default Other Services Tariffs
    const tariffCount = await client.query(`SELECT COUNT(*) as cnt FROM other_service_tariffs`);
    if (parseInt(tariffCount.rows[0].cnt) === 0) {
      const services = [
        ['Diet & Nutrition Plan', 500, 30],
        ['Monthly Locker Rental', 300, 30],
        ['Steam & Sauna Pass (1 Month)', 800, 30],
        ['Body Composition Analysis (InBody)', 250, 1],
        ['Guest Day Pass', 200, 1],
        ['Sponsor Payment', 50000, 365]
      ];
      for (const [name, price, days] of services) {
        await client.query(
          `INSERT INTO other_service_tariffs (name, price, duration_days, is_hidden, active) VALUES ($1, $2, $3, 0, 1)`,
          [name, price, days]
        );
      }
    }

    // PT Packages Catalog
    const pkgCount = await client.query(`SELECT COUNT(*) as cnt FROM pt_packages WHERE is_custom = 0`);
    if (parseInt(pkgCount.rows[0].cnt) === 0) {
      const pkgs = [
        ['A Pro PT — Standard', 9000, 16, 'Adult', 30, JSON.stringify(['A_PRO_PT'])],
        ['A Pro PT — Premium', 25000, 48, 'Adult', 30, JSON.stringify(['A_PRO_PT'])],
        ['Standard PT — S1', 6000, 16, 'Adult', 30, JSON.stringify(['A', 'B'])],
        ['Standard PT — S2', 7000, 16, 'Adult', 30, JSON.stringify(['A', 'B'])],
        ['Standard PT — S3 (Extended)', 19000, 48, 'Adult', 30, JSON.stringify(['A', 'B'])],
        ['Standard PT — S4 (Extended)', 20000, 50, 'Adult', 30, JSON.stringify(['A', 'B'])],
        ['Kid PT (Age 5–10)', 2000, 16, 'Kid', 30, JSON.stringify(['A_PRO_PT', 'A', 'B'])],
        ['100 Days Challenge', 15000, 30, 'Challenge', 100, JSON.stringify(['A_PRO_PT', 'A', 'B'])]
      ];
      for (const [name, price, classes, cat, days, grades] of pkgs) {
        await client.query(
          `INSERT INTO pt_packages (name, price, total_classes, category, duration_days, eligible_grades, is_custom, active) VALUES ($1, $2, $3, $4, $5, $6, 0, 1)`,
          [name, price, classes, cat, days, grades]
        );
      }
      console.log('✅ Seeded PT packages catalog');
    }

    await client.query('COMMIT');
    console.log('✅ Migration complete — Neon PostgreSQL is ready!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
