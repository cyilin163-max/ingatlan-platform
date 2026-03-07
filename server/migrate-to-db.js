/**
 * 将 server/data/users.json 和 listings.json 导入到 PostgreSQL
 * 使用：设置好 DATABASE_URL 后执行 node migrate-to-db.js
 */
const path = require('path');
const fs = require('fs');
const db = require('./db');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const LISTINGS_FILE = path.join(__dirname, 'data', 'listings.json');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('请设置环境变量 DATABASE_URL');
    process.exit(1);
  }
  console.log('初始化表...');
  await db.initSchema();

  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (!Array.isArray(users)) users = [];
    } catch (e) {
      console.warn('读取 users.json 失败:', e.message);
    }
  }
  console.log('导入用户:', users.length, '条');
  for (const u of users) {
    try {
      await db.insertUser({
        id: u.id,
        email: (u.email || '').trim().toLowerCase(),
        name: String(u.name || '').trim(),
        passwordHash: u.passwordHash || '',
        isAdmin: !!u.isAdmin,
        canPublish: !!u.canPublish,
        createdAt: u.createdAt || new Date().toISOString(),
      });
    } catch (e) {
      if (e.code === '23505') console.log('  跳过已存在用户:', u.email);
      else throw e;
    }
  }

  let listings = [];
  if (fs.existsSync(LISTINGS_FILE)) {
    try {
      listings = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
      if (!Array.isArray(listings)) listings = [];
    } catch (e) {
      console.warn('读取 listings.json 失败:', e.message);
    }
  }
  console.log('导入房源:', listings.length, '条');
  for (const item of listings) {
    if (!item || !item.id) continue;
    try {
      await db.insertListing(item.id, item);
    } catch (e) {
      if (e.code === '23505') console.log('  跳过已存在房源:', item.id);
      else throw e;
    }
  }

  console.log('迁移完成。');
  process.exit(0);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
