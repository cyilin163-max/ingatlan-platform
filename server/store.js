/**
 * 统一存储接口：有 DATABASE_URL 用 PostgreSQL，否则用本地 JSON 文件
 * 所有方法返回 Promise，便于 server 统一 await
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');

const useDb = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

let db = null;
if (useDb) {
  db = require('./db');
}

// ---------- 用户 ----------
async function getUsers() {
  if (useDb) return db.getAllUsers();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

async function saveUsers(users) {
  if (useDb) {
    // 文件模式下的 saveUsers 是整表覆盖；DB 下我们只在注册/更新时写单条，这里仅用于兼容“规范化后写回”的逻辑，可忽略
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function findUserById(id) {
  if (useDb) return db.findUserById(id);
  const users = await getUsers();
  return users.find((u) => String(u.id) === String(id)) || null;
}

async function findUserByEmail(email) {
  if (useDb) return db.findUserByEmail(email);
  const users = await getUsers();
  const norm = (email || '').trim().toLowerCase();
  return users.find((u) => (u.email || '').toLowerCase() === norm) || null;
}

async function insertUser(user) {
  if (useDb) {
    await db.insertUser(user);
    return;
  }
  const users = await getUsers();
  users.push(user);
  await saveUsers(users);
}

async function updateUser(id, updates) {
  if (useDb) {
    await db.updateUser(id, updates);
    return;
  }
  const users = await getUsers();
  const idx = users.findIndex((u) => String(u.id) === String(id));
  if (idx === -1) return;
  users[idx] = Object.assign({}, users[idx], updates);
  await saveUsers(users);
}

// ---------- 房源 ----------
async function loadListings() {
  if (useDb) return db.getListings();
  if (!fs.existsSync(LISTINGS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

async function saveListings(list) {
  if (useDb) {
    // 整表覆盖在 DB 模式下不实现；新增/编辑/删除走下面的单条接口
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function getListingById(id) {
  if (useDb) return db.getListingById(id);
  const list = await loadListings();
  return list.find((l) => String(l.id) === String(id)) || null;
}

async function addListing(item) {
  if (useDb) {
    await db.insertListing(item.id, item);
    return;
  }
  const list = await loadListings();
  list.push(item);
  await saveListings(list);
}

async function updateListingById(id, updated) {
  if (useDb) {
    await db.updateListing(id, updated);
    return;
  }
  const list = await loadListings();
  const idx = list.findIndex((l) => String(l.id) === String(id));
  if (idx === -1) return;
  list[idx] = updated;
  await saveListings(list);
}

async function deleteListingById(id) {
  if (useDb) {
    await db.deleteListing(id);
    return;
  }
  const list = await loadListings();
  const idx = list.findIndex((l) => String(l.id) === String(id));
  if (idx === -1) return;
  list.splice(idx, 1);
  await saveListings(list);
}

/** 是否使用数据库（供 server 启动时 initSchema） */
function isUsingDb() {
  return useDb;
}

/** 初始化数据库表（仅 useDb 时调用） */
async function initDbSchema() {
  if (useDb && db) await db.initSchema();
}

module.exports = {
  getUsers,
  saveUsers,
  findUserById,
  findUserByEmail,
  insertUser,
  updateUser,
  loadListings,
  saveListings,
  getListingById,
  addListing,
  updateListingById,
  deleteListingById,
  isUsingDb,
  initDbSchema,
};
