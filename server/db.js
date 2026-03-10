/**
 * PostgreSQL 数据层：用户与房源
 * 需设置环境变量 DATABASE_URL（例：postgresql://user:pass@host:5432/dbname）
 */
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required for database mode');
    pool = new Pool({
      connectionString: url,
      ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** 创建表（若不存在） */
async function initSchema() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      is_admin BOOLEAN NOT NULL DEFAULT false,
      can_publish BOOLEAN NOT NULL DEFAULT false,
      can_contact_display BOOLEAN NOT NULL DEFAULT false,
      contact_name TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      contact_email TEXT DEFAULT '',
      contact_qr_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    );
  `);
  await migrateUserColumns(p);
}

/** 迁移：为已有 users 表添加新列（兼容旧库） */
async function migrateUserColumns(p) {
  const cols = [
    ['can_contact_display', 'BOOLEAN NOT NULL DEFAULT false'],
    ['contact_name', 'TEXT DEFAULT \'\''],
    ['contact_phone', 'TEXT DEFAULT \'\''],
    ['contact_email', 'TEXT DEFAULT \'\''],
    ['contact_qr_url', 'TEXT DEFAULT \'\''],
  ];
  for (const [name, def] of cols) {
    try {
      await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${name} ${def}`);
    } catch (e) {
      if (!/already exists/i.test(String(e.message))) throw e;
    }
  }
}

/** 用户 */
async function getAllUsers() {
  const res = await getPool().query(
    'SELECT id, email, name, password_hash AS "passwordHash", is_admin AS "isAdmin", can_publish AS "canPublish", can_contact_display AS "canContactDisplay", contact_name AS "contactName", contact_phone AS "contactPhone", contact_email AS "contactEmail", contact_qr_url AS "contactQrUrl", created_at AS "createdAt" FROM users ORDER BY created_at DESC'
  );
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    isAdmin: r.isAdmin,
    canPublish: r.canPublish,
    canContactDisplay: r.canContactDisplay,
    contactName: r.contactName || '',
    contactPhone: r.contactPhone || '',
    contactEmail: r.contactEmail || '',
    contactQrUrl: r.contactQrUrl || '',
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  }));
}

async function findUserById(id) {
  const res = await getPool().query('SELECT id, email, name, password_hash AS "passwordHash", is_admin AS "isAdmin", can_publish AS "canPublish", can_contact_display AS "canContactDisplay", contact_name AS "contactName", contact_phone AS "contactPhone", contact_email AS "contactEmail", contact_qr_url AS "contactQrUrl", created_at AS "createdAt" FROM users WHERE id = $1', [id]);
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    isAdmin: r.isAdmin,
    canPublish: r.canPublish,
    canContactDisplay: r.canContactDisplay,
    contactName: r.contactName || '',
    contactPhone: r.contactPhone || '',
    contactEmail: r.contactEmail || '',
    contactQrUrl: r.contactQrUrl || '',
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  };
}

async function findUserByEmail(email) {
  const res = await getPool().query('SELECT id, email, name, password_hash AS "passwordHash", is_admin AS "isAdmin", can_publish AS "canPublish", can_contact_display AS "canContactDisplay", contact_name AS "contactName", contact_phone AS "contactPhone", contact_email AS "contactEmail", contact_qr_url AS "contactQrUrl", created_at AS "createdAt" FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    isAdmin: r.isAdmin,
    canPublish: r.canPublish,
    canContactDisplay: r.canContactDisplay,
    contactName: r.contactName || '',
    contactPhone: r.contactPhone || '',
    contactEmail: r.contactEmail || '',
    contactQrUrl: r.contactQrUrl || '',
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  };
}

async function insertUser(user) {
  await getPool().query(
    'INSERT INTO users (id, email, name, password_hash, is_admin, can_publish, can_contact_display, contact_name, contact_phone, contact_email, contact_qr_url, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)',
    [
      user.id,
      user.email,
      user.name || '',
      user.passwordHash || '',
      !!user.isAdmin,
      !!user.canPublish,
      !!user.canContactDisplay,
      (user.contactName || '').trim(),
      (user.contactPhone || '').trim(),
      (user.contactEmail || '').trim(),
      (user.contactQrUrl || '').trim(),
      user.createdAt || new Date().toISOString(),
    ]
  );
}

async function updateUser(id, updates) {
  const fields = [];
  const values = [];
  let n = 1;
  if (updates.email !== undefined) { fields.push(`email = $${n++}`); values.push(updates.email); }
  if (updates.name !== undefined) { fields.push(`name = $${n++}`); values.push(updates.name); }
  if (updates.passwordHash !== undefined) { fields.push(`password_hash = $${n++}`); values.push(updates.passwordHash); }
  if (updates.isAdmin !== undefined) { fields.push(`is_admin = $${n++}`); values.push(!!updates.isAdmin); }
  if (updates.canPublish !== undefined) { fields.push(`can_publish = $${n++}`); values.push(!!updates.canPublish); }
  if (updates.canContactDisplay !== undefined) { fields.push(`can_contact_display = $${n++}`); values.push(!!updates.canContactDisplay); }
  if (updates.contactName !== undefined) { fields.push(`contact_name = $${n++}`); values.push((updates.contactName || '').trim()); }
  if (updates.contactPhone !== undefined) { fields.push(`contact_phone = $${n++}`); values.push((updates.contactPhone || '').trim()); }
  if (updates.contactEmail !== undefined) { fields.push(`contact_email = $${n++}`); values.push((updates.contactEmail || '').trim()); }
  if (updates.contactQrUrl !== undefined) { fields.push(`contact_qr_url = $${n++}`); values.push((updates.contactQrUrl || '').trim()); }
  if (fields.length === 0) return;
  values.push(id);
  await getPool().query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${n}`, values);
}

/** 房源（整条存 JSONB） */
async function getListings() {
  const res = await getPool().query('SELECT data FROM listings ORDER BY (data->>\'listedAt\') DESC NULLS LAST');
  return res.rows.map((r) => r.data);
}

async function getListingById(id) {
  const res = await getPool().query('SELECT data FROM listings WHERE id = $1', [id]);
  return res.rows[0] ? res.rows[0].data : null;
}

async function insertListing(id, data) {
  await getPool().query('INSERT INTO listings (id, data) VALUES ($1, $2::jsonb)', [id, JSON.stringify(data)]);
}

async function updateListing(id, data) {
  await getPool().query('UPDATE listings SET data = $2::jsonb WHERE id = $1', [id, JSON.stringify(data)]);
}

async function deleteListing(id) {
  await getPool().query('DELETE FROM listings WHERE id = $1', [id]);
}

module.exports = {
  getPool,
  initSchema,
  getAllUsers,
  findUserById,
  findUserByEmail,
  insertUser,
  updateUser,
  getListings,
  getListingById,
  insertListing,
  updateListing,
  deleteListing,
};
