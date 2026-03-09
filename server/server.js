/**
 * Ingatlan 后端：注册、登录、会话、房源
 * 无 DATABASE_URL 时用 server/data/*.json；有 DATABASE_URL 时用 PostgreSQL（部署推荐）
 * 运行：cd server && npm install && npm start  默认端口 3000
 * 图片：UPLOAD_PATH 指向持久盘（如 /data/uploads）则部署后保留
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const nodemailer = require('nodemailer');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
// 上传目录：若设 UPLOAD_PATH（如 Render Persistent Disk 挂载路径 /data/uploads），则用该路径，部署后图片会保留
const UPLOADS_DIR = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', 'uploads');

// S3 兼容存储（AWS S3 / DigitalOcean Spaces / Backblaze B2）：有配置则上传到对象存储并返回完整 URL
let s3Client = null;
function getS3Config() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT; // 如 https://nyc3.digitaloceanspaces.com
  const publicBase = process.env.S3_PUBLIC_BASE || process.env.S3_PUBLIC_URL; // 如 https://bucket.nyc3.cdn.digitaloceanspaces.com
  if (!bucket || !accessKey || !secretKey) return null;
  return { bucket, accessKey, secretKey, region, endpoint, publicBase };
}
function getS3Client() {
  if (s3Client) return s3Client;
  const c = getS3Config();
  if (!c) return null;
  const { S3Client } = require('@aws-sdk/client-s3');
  const config = {
    region: c.region,
    credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
  };
  if (c.endpoint) {
    config.endpoint = c.endpoint;
    config.forcePathStyle = !!process.env.S3_FORCE_PATH_STYLE; // B2 等有时需要
  }
  s3Client = new S3Client(config);
  return s3Client;
}
function getS3PublicUrl(key) {
  const c = getS3Config();
  if (!c) return null;
  if (c.publicBase) return (c.publicBase.replace(/\/$/, '') + '/' + key.replace(/^\//, ''));
  if (c.endpoint) return null; // 自定义 endpoint 时建议设 S3_PUBLIC_BASE
  return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${key.replace(/^\//, '')}`;
}
async function uploadToS3(key, buffer, contentType) {
  const client = getS3Client();
  const c = getS3Config();
  if (!client || !c) return null;
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const params = {
    Bucket: c.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };
  const acl = process.env.S3_ACL || 'public-read';
  if (acl) params.ACL = acl; // 若桶启用 “Object Ownership: bucket owner enforced” 可设 S3_ACL= 禁用 ACL
  await client.send(new PutObjectCommand(params));
  return getS3PublicUrl(key);
}
const ADMIN_BOOTSTRAP_EMAILS = ['yilin_1024@hotmail.com'];

const app = express();

// 生产环境若放在 Nginx/反向代理后，需信任代理头（用于 HTTPS 与 CORS 同源判断）
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// 确保 data 和 uploads 目录存在（文件模式时用）
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function deriveCreatedAtFromId(id) {
  const ts = parseInt(String(id || '').split('-')[0], 10);
  if (isNaN(ts) || ts <= 0) return '';
  try {
    return new Date(ts).toISOString();
  } catch (e) {
    return '';
  }
}

function normalizeUserRecord(user) {
  const base = Object.assign({}, user || {});
  const email = String(base.email || '').trim().toLowerCase();
  const isBootstrapAdmin = ADMIN_BOOTSTRAP_EMAILS.includes(email);
  const isAdmin = base.isAdmin === true || isBootstrapAdmin;
  const createdAt = base.createdAt || deriveCreatedAtFromId(base.id) || new Date().toISOString();
  return Object.assign({}, base, {
    email,
    name: String(base.name || '').trim(),
    isAdmin,
    canPublish: isAdmin || base.canPublish === true,
    createdAt,
  });
}

function isApprovedPublisher(user) {
  return !!(user && (user.isAdmin || user.canPublish));
}

function toClientUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: !!user.isAdmin,
    canPublish: isApprovedPublisher(user),
    createdAt: user.createdAt || '',
  };
}

async function getSessionUser(req, res) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ ok: false, error: 'not_logged_in' });
    return null;
  }
  const user = await store.findUserById(userId);
  if (!user) {
    req.session = null;
    res.status(401).json({ ok: false, error: 'user_not_found' });
    return null;
  }
  return normalizeUserRecord(user);
}

async function requireAdmin(req, res) {
  const user = await getSessionUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ ok: false, error: 'admin_only' });
    return null;
  }
  return user;
}

async function requireApprovedPublisher(req, res) {
  const user = await getSessionUser(req, res);
  if (!user) return null;
  if (!isApprovedPublisher(user)) {
    res.status(403).json({ ok: false, error: 'not_approved' });
    return null;
  }
  return user;
}

// CORS：开发允许 localhost；生产用 ALLOWED_ORIGINS（逗号分隔），不设则同源
const allowedOriginsEnv = (process.env.ALLOWED_ORIGINS || '').trim();
const allowedOrigins = allowedOriginsEnv ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean) : [];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isDev = process.env.NODE_ENV !== 'production';
  const devOk = !origin || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000' || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  let allow = false;
  if (isDev) {
    allow = devOk;
  } else {
    if (allowedOrigins.length) allow = origin && allowedOrigins.indexOf(origin) !== -1;
    else if (origin && req.headers.host) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = (req.headers.host || '').replace(/:\d+$/, '');
      allow = origin === `${proto}://${host}` || origin === `https://${host}` || origin === `http://${host}`;
    }
  }
  if (allow) res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 中间件（图片上传允许最大 12MB）
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
const isProduction = process.env.NODE_ENV === 'production';
app.use(
  cookieSession({
    name: 'ingatlan_session',
    secret: process.env.SESSION_SECRET || 'ingatlan-dev-secret-change-in-production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax',
    secure: isProduction && (process.env.SECURE_COOKIES === '1' || (process.env.APP_URL || '').startsWith('https')),
  })
);

// 静态资源目录（不列出目录，无 index 时 404）
const staticDir = path.join(__dirname, '..');
const staticOpts = { index: false, redirect: false };
app.use(express.static(staticDir, staticOpts));
// 用户上传的图片
app.use('/uploads', express.static(UPLOADS_DIR, staticOpts));

// 根路径 -> index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// 无 .html 的路径 -> 对应 .html 页面（避免出现目录列表）
const htmlPages = [
  'login', 'register', 'account', 'publish', 'search', 'property', 'compare',
  'about', 'contact', 'faq', 'privacy', 'terms', 'for-agents', 'calculator',
  'moving', 'renovation', '404'
];
htmlPages.forEach((name) => {
  app.get('/' + name, (req, res) => {
    const file = path.join(staticDir, name + '.html');
    if (fs.existsSync(file)) return res.sendFile(file);
    res.status(404).sendFile(path.join(staticDir, '404.html'));
  });
});

// ---------- API ----------

// 当前登录用户
app.get('/api/me', async (req, res) => {
  const user = await getSessionUser(req, res);
  if (!user) return;
  res.json({
    ok: true,
    user: toClientUser(user),
  });
});

// 注册
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !password || !name) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: 'password_too_short' });
  }
  const existing = await store.findUserByEmail(emailNorm);
  if (existing) {
    return res.status(409).json({ ok: false, error: 'email_exists' });
  }
  const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = normalizeUserRecord({
    id,
    email: emailNorm,
    name: (name || '').trim(),
    passwordHash,
    isAdmin: false,
    canPublish: false,
    createdAt: new Date().toISOString(),
  });
  await store.insertUser(user);
  req.session.userId = id;
  res.json({
    ok: true,
    user: toClientUser(user),
  });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm || !password) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  let user = await store.findUserByEmail(emailNorm);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
  user = normalizeUserRecord(user);
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
  req.session.userId = user.id;
  res.json({
    ok: true,
    user: toClientUser(user),
  });
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// 管理员：查看所有注册用户及发布权限
app.get('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const users = await store.getUsers();
  const items = users
    .slice()
    .sort((a, b) => {
      if (!!a.isAdmin !== !!b.isAdmin) return a.isAdmin ? -1 : 1;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * -1;
    })
    .map((user) => toClientUser(normalizeUserRecord(user)));
  res.json({ ok: true, items });
});

// 管理员：批准 / 撤销发布权限
app.post('/api/admin/users/:id/publish-approval', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const body = req.body || {};
  if (typeof body.approved !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'missing_approval_state' });
  }
  const user = await store.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'user_not_found' });
  }
  if (user.isAdmin && body.approved === false) {
    return res.status(400).json({ ok: false, error: 'cannot_revoke_admin' });
  }
  await store.updateUser(user.id, { canPublish: body.approved === true });
  const updated = Object.assign({}, user, { canPublish: body.approved === true });
  res.json({ ok: true, user: toClientUser(updated) });
});

// ---------- 房源与统计 API ----------

// 统计：在售数量、今日新增
app.get('/api/stats', async (req, res) => {
  const list = await store.loadListings();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = list.filter((l) => (l.listedAt || '').slice(0, 10) === today).length;
  res.json({ activeListings: list.length, newToday });
});

// 从搜索词解析出区份代码：支持 "V"、"5"、"5区"、"XV"、"15"、罗马数字 I–XXIII、城市名
function parseDistrictFromQuery(q) {
  const s = (q || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const cityMap = { debrecen: 'Debrecen', szeged: 'Szeged', miskolc: 'Miskolc', 德布勒森: 'Debrecen', 塞格德: 'Szeged', 米什科尔茨: 'Miskolc' };
  if (cityMap[lower]) return cityMap[lower];
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
  const cleaned = s.replace(/[区區\s.,]+$/g, '').trim();
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num >= 1 && num <= 23) return roman[num - 1];
  for (let i = 0; i < roman.length; i++) {
    if (cleaned === roman[i] || lower === roman[i].toLowerCase()) return roman[i];
  }
  return null;
}

// 房源归属区域（与首页热门区域一致，支持匈语与中文 location；district 为布达佩斯区号时也计入）
function getListingArea(item) {
  const loc = (item.location || '').trim();
  const dist = (item.district || '').trim();
  const locDist = loc + ' ' + dist;
  const isBudapestDistrict = /^(I{1,3}|IV|V|VI{1,3}|IX|X|XI{1,3}|XIV|XV|XVI{1,3}|XX|XXI|XXII|XXIII)$/i.test(dist) || /^([1-9]|1[0-9]|2[0-3])$/.test(dist);
  const hasBelvaros = /V\.\s*kerület|VI\.\s*kerület|VII\.\s*kerület|第[五六七]区|5\s*区|6\s*区|7\s*区/i.test(loc) || /^[VVI]+$|^[567]$/.test(dist);
  const hasBudapest = /Budapest|布达佩斯/.test(loc) || isBudapestDistrict;
  const hasSurrounding = /Debrecen|Szeged|Miskolc|德布勒森|塞格德|米什科尔茨/.test(locDist);
  if (hasBelvaros) return 'budapest-belvaros';
  if (/Balaton|巴拉顿/.test(loc)) return 'balaton';
  if (hasSurrounding) return 'surrounding-cities';
  if (hasBudapest) return 'budapest-agglomeracio';
  return null;
}

// 区域数量（首页热门区域用）
app.get('/api/areas/counts', async (req, res) => {
  const list = await store.loadListings();
  const counts = { 'budapest-belvaros': 0, balaton: 0, 'budapest-agglomeracio': 0, 'surrounding-cities': 0 };
  list.forEach((item) => {
    const area = getListingArea(item);
    if (area && counts[area] !== undefined) counts[area]++;
  });
  res.json(counts);
});

// 将旧匈牙利语/随意格式的 propertyType 规范化为统一英文 key
function normalizePropertyType(raw) {
  if (!raw) return '';
  const map = {
    'lakás': 'flat', 'lak\u00e1s': 'flat',
    'flat': 'flat', 'apartment': 'flat',
    'családi ház': 'house', 'csal\u00e1di h\u00e1z': 'house',
    'house': 'house',
    'garzon': 'studio', 'studio': 'studio',
    'iroda': 'office', 'office': 'office',
    'telek': 'land', 'land': 'land'
  };
  return map[raw.toLowerCase()] || raw;
}

function normalizeCondition(raw) {
  if (!raw) return '';
  const map = {
    'uj': 'new_or_renovated',
    'new': 'new',
    'renovated': 'renovated',
    'jo': 'good',
    'good': 'good',
    'felujitando': 'needs_renovation',
    'needs_renovation': 'needs_renovation'
  };
  return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
}

function normalizeHeating(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase().replace(/\s+/g, '_');
  const map = {
    'gázkazán': 'gas_boiler', 'gazkazan': 'gas_boiler', 'gáz_cirkó': 'gas_boiler', 'gaz_cirko': 'gas_boiler', 'gas_boiler': 'gas_boiler',
    'gas': 'gas',
    'távfűtés': 'district', 'tavfutes': 'district', 'district': 'district',
    'elektromos_fűtés': 'electric', 'electric': 'electric', 'villany': 'electric',
    'hőszivattyú': 'heat_pump', 'hoszivattyu': 'heat_pump', 'heat_pump': 'heat_pump',
    'vegyes_tüzelés': 'mixed', 'vegyes_tuzeles': 'mixed', 'mixed': 'mixed',
    'újenergiás_hőszivattyú': 'renewable_heat_pump', 'renewable_heat_pump': 'renewable_heat_pump',
    'egyeb': 'other', 'other': 'other'
  };
  return map[s] || map[String(raw).toLowerCase()] || String(raw).toLowerCase();
}

function matchesBoolFilter(filterValue, actualValue) {
  if (filterValue === '1') return !!actualValue;
  if (filterValue === '0') return !actualValue;
  return true;
}

// 房源列表（支持分页、排序）
app.get('/api/listings', async (req, res) => {
  let list = await store.loadListings();
  const q = (req.query.q || '').toLowerCase().trim();
  const category = (req.query.category || '').toLowerCase();
  const buildingType = normalizePropertyType(req.query.building_type || req.query.propertyType || '');
  const condition = normalizeCondition(req.query.condition || '');
  const heating = normalizeHeating(req.query.heating || '');
  const priceMin = parseInt(req.query.price_min, 10);
  const priceMax = parseInt(req.query.price_max, 10);
  const areaMin = parseInt(req.query.area_min, 10);
  const areaMax = parseInt(req.query.area_max, 10);
  const rooms = parseInt(req.query.rooms, 10);
  const floorMin = parseInt(req.query.floor_min, 10);
  const floorMax = parseInt(req.query.floor_max, 10);
  const elevator = String(req.query.elevator || '');
  const balcony = String(req.query.balcony || '');
  const parking = String(req.query.parking || '');
  const listedSinceDays = parseInt(req.query.listed_since, 10);
  let district = (req.query.district || '').trim();
  const areaFilter = (req.query.area || '').trim().toLowerCase();
  const parsedDistrictFromQ = q && !district ? parseDistrictFromQuery(q) : null;
  if (parsedDistrictFromQ) district = parsedDistrictFromQ;
  const sort = req.query.sort || 'newest';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));

  if (areaFilter && ['budapest-belvaros', 'surrounding-cities', 'budapest-agglomeracio'].indexOf(areaFilter) !== -1) {
    list = list.filter((item) => getListingArea(item) === areaFilter);
  }

  if (q && !parsedDistrictFromQ) {
    // 非区份搜索：关键词模糊匹配 title / location / district
    const parts = q.replace(/\./g, ' ').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    list = list.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const loc = (item.location || '').toLowerCase();
      const dist = (item.district || '').toLowerCase();
      return parts.some((p) => title.includes(p) || loc.includes(p) || dist.includes(p));
    });
  }
  if (category) list = list.filter((item) => (item.category || '') === category);
  if (!isNaN(priceMin)) list = list.filter((item) => item.price >= priceMin);
  if (!isNaN(priceMax)) list = list.filter((item) => item.price <= priceMax);
  if (!isNaN(areaMin)) list = list.filter((item) => item.area >= areaMin);
  if (!isNaN(areaMax)) list = list.filter((item) => item.area <= areaMax);
  if (!isNaN(rooms)) list = list.filter((item) => item.rooms >= rooms);
  if (district) list = list.filter((item) => (item.district || '') === district);
  if (buildingType) list = list.filter((item) => normalizePropertyType(item.propertyType) === buildingType);
  if (condition) {
    list = list.filter((item) => {
      const itemCondition = normalizeCondition(item.condition || '');
      if (condition === 'new_or_renovated') return itemCondition === 'new' || itemCondition === 'renovated';
      return itemCondition === condition;
    });
  }
  if (heating) list = list.filter((item) => normalizeHeating(item.heating || '') === heating);
  if (!isNaN(floorMin)) {
    list = list.filter((item) => {
      const floorValue = parseInt(item.floor, 10);
      return !isNaN(floorValue) && floorValue >= floorMin;
    });
  }
  if (!isNaN(floorMax)) {
    list = list.filter((item) => {
      const floorValue = parseInt(item.floor, 10);
      return !isNaN(floorValue) && floorValue <= floorMax;
    });
  }
  if (elevator) list = list.filter((item) => matchesBoolFilter(elevator, item.elevator));
  if (balcony) list = list.filter((item) => matchesBoolFilter(balcony, item.balcony));
  if (parking) list = list.filter((item) => matchesBoolFilter(parking, item.parking));
  if (!isNaN(listedSinceDays) && listedSinceDays > 0) {
    const cutoff = Date.now() - listedSinceDays * 24 * 60 * 60 * 1000;
    list = list.filter((item) => {
      const listed = new Date(item.listedAt || '').getTime();
      return !isNaN(listed) && listed >= cutoff;
    });
  }

  if (sort === 'newest' && list.length) {
    list = list.slice().sort((a, b) => (b.listedAt || '').localeCompare(a.listedAt || ''));
  }
  if (sort === 'price_asc') list = list.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
  if (sort === 'price_desc') list = list.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
  if (sort === 'area_desc') list = list.slice().sort((a, b) => (b.area || 0) - (a.area || 0));

  const total = list.length;
  const start = (page - 1) * perPage;
  const items = list.slice(start, start + perPage).map((item) => ({
    id: item.id,
    title: item.title,
    propertyType: normalizePropertyType(item.propertyType) || 'flat',
    currency: item.currency || 'ft',
    price: item.price,
    pricePerSqm: item.pricePerSqm,
    area: item.area,
    rooms: item.rooms,
    floor: item.floor,
    location: item.location,
    district: item.district || '',
    image: item.image,
    photoCount: item.photoCount,
    has3D: item.has3D,
    badges: item.badges || [],
    listedAt: item.listedAt,
  }));
  res.json({ items, total, page, perPage });
});

// 单条房源详情
app.get('/api/listings/:id', async (req, res) => {
  const item = await store.getListingById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// 当前登录用户发布的房源（需登录）
app.get('/api/my-listings', async (req, res) => {
  const user = await getSessionUser(req, res);
  if (!user) return;
  const userId = user.id;
  const list = await store.loadListings();
  const mine = list.filter((l) => l.publisher && String(l.publisher.id) === String(userId));
  const items = mine.map((item) => ({
    id: item.id,
    title: item.title,
    currency: item.currency || 'ft',
    price: item.price,
    pricePerSqm: item.pricePerSqm,
    area: item.area,
    rooms: item.rooms,
    location: item.location,
    image: item.image,
    images: item.images,
    listedAt: item.listedAt,
  }));
  res.json({ items });
});

// 图片上传（需登录）：接收 base64 dataURL；若配置了 S3 则上传到对象存储并返回完整 URL，否则写入本地 uploads/
app.post('/api/upload', async (req, res) => {
  const user = await requireApprovedPublisher(req, res);
  if (!user) return;
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ ok: false, error: 'missing_data' });
  const match = dataUrl.match(/^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/i);
  if (!match) return res.status(400).json({ ok: false, error: 'invalid_image' });
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  const mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
  const buf = Buffer.from(match[3], 'base64');
  if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'too_large' });
  const filename = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const s3Key = 'uploads/' + filename;

  if (getS3Config()) {
    try {
      const url = await uploadToS3(s3Key, buf, mime);
      if (url) return res.json({ ok: true, url });
    } catch (e) {
      console.error('S3 upload failed:', e && e.message);
      return res.status(500).json({ ok: false, error: 'upload_failed' });
    }
  }

  const filepath = path.join(UPLOADS_DIR, filename);
  try {
    fs.writeFileSync(filepath, buf);
    res.json({ ok: true, url: '/uploads/' + filename });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'write_failed' });
  }
});

// 咨询表单：发送邮件到 lemonon71@gmail.com（需配置 SMTP 环境变量）
const INQUIRY_TO = 'lemonon71@gmail.com';
let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const host = process.env.INQUIRY_SMTP_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.INQUIRY_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
  const user = process.env.INQUIRY_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.INQUIRY_SMTP_PASS || process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  mailTransporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return mailTransporter;
}
app.post('/api/inquiry', async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim();
  const message = (b.message || '').trim();
  const listingId = (b.listingId || '').trim();
  const listingTitle = (b.listingTitle || '').trim();
  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const transporter = getMailTransporter();
  if (!transporter) {
    return res.status(503).json({ ok: false, error: 'mail_not_configured' });
  }
  const subject = listingTitle
    ? `[房源咨询] ${listingTitle}`
    : '[房源咨询] 新留言';
  const text = [
    `姓名：${name}`,
    `邮箱：${email}`,
    listingId ? `房源ID：${listingId}` : '',
    listingTitle ? `房源：${listingTitle}` : '',
    '',
    '留言内容：',
    message
  ].filter(Boolean).join('\n');
  try {
    await transporter.sendMail({
      from: process.env.INQUIRY_FROM || process.env.SMTP_USER || process.env.INQUIRY_SMTP_USER || 'noreply@ingatlan.local',
      to: INQUIRY_TO,
      subject,
      text
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Inquiry email error:', e.message);
    res.status(500).json({ ok: false, error: 'send_failed' });
  }
});

// 内部上传房源（需登录）
app.post('/api/listings', async (req, res) => {
  const user = await requireApprovedPublisher(req, res);
  if (!user) return;
  const b = req.body || {};
  const title = (b.title || '').trim();
  const category = (b.category || 'buy').toLowerCase();
  if (!title) {
    return res.status(400).json({ ok: false, error: 'missing_title' });
  }
  const price = parseInt(b.price, 10) || 0;
  const currency = (b.currency || 'ft').toLowerCase() === 'eur' ? 'eur' : 'ft';
  const area = parseInt(b.area, 10) || 0;
  const rooms = parseInt(b.rooms, 10) || 0;
  const location = (b.location || '').trim();
  const description = (b.description || '').trim();
  const summary = (b.summary || '').trim();
  let image = (b.image || '').trim();
  const isValidImage = image && (image.startsWith('http') || image.startsWith('/uploads/'));
  if (!isValidImage) {
    image = 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=450&fit=crop';
  }
  const images = Array.isArray(b.images) && b.images.length
    ? b.images.filter((u) => typeof u === 'string' && (u.startsWith('http') || u.startsWith('/uploads/')))
    : [image];
  const id = 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const listedAt = new Date().toISOString().slice(0, 10);
  const pricePerSqm = area > 0 ? Math.round(price / area) : 0;
  const propertyType = (b.propertyType || (category === 'rent' ? 'Lakás' : 'Lakás')).trim();
  const item = {
    id,
    title,
    subtitle: [location, area ? area + ' m²' : '', rooms ? rooms + ' szoba' : ''].filter(Boolean).join(' · '),
    category,
    propertyType,
    currency,
    price,
    pricePerSqm,
    area,
    rooms,
    floor: b.floor || '',
    location: location || title,
    image,
    images: images.length ? images : [image],
    photoCount: images.length || 1,
    has3D: false,
    badges: [],
    summary,
    description: description || title,
    publisher: { name: user.name || user.email, id: user.id, phone: '' },
    address: location,
    listedAt,
    ac: !!b.ac,
    elevator: !!b.elevator,
    alarm: !!b.alarm,
    garden: !!b.garden,
    balcony: !!b.balcony,
    parking: !!b.parking,
    cellar: !!b.cellar,
    fireplace: !!b.fireplace,
    petFriendly: !!b.petFriendly,
    moveIn: !!b.moveIn,
    condition: (b.condition || '').trim(),
    garage: !!b.garage,
    heating: (b.heating || '').trim(),
    yearBuilt: parseInt(b.yearBuilt, 10) || 0,
    totalFloors: parseInt(b.totalFloors, 10) || 0,
    district: (b.district || '').trim(),
    yardArea: parseInt(b.yardArea, 10) || 0,
  };
  await store.addListing(item);
  res.json({ ok: true, id: item.id });
});

// 编辑本人发布的房源（需登录，且只能改自己的）
app.put('/api/listings/:id', async (req, res) => {
  const user = await requireApprovedPublisher(req, res);
  if (!user) return;
  const userId = user.id;
  const old = await store.getListingById(req.params.id);
  if (!old) return res.status(404).json({ error: 'not_found' });
  if (!old.publisher || String(old.publisher.id) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const b = req.body || {};
  const price = parseInt(b.price, 10) || old.price;
  const currency = b.currency !== undefined ? ((b.currency || 'ft').toLowerCase() === 'eur' ? 'eur' : 'ft') : (old.currency || 'ft');
  const area = parseInt(b.area, 10) || old.area;
  const location = (b.location || old.location || '').trim();
  const rooms = parseInt(b.rooms, 10) || old.rooms;
  let image = (b.image || '').trim();
  if (!image || (!image.startsWith('http') && !image.startsWith('/uploads/'))) image = old.image;
  const updated = Object.assign({}, old, {
    title: (b.title || old.title).trim(),
    category: b.category || old.category,
    currency,
    price,
    area,
    rooms,
    location,
    summary: b.summary !== undefined ? (b.summary || '').trim() : (old.summary || ''),
    description: (b.description || old.description || '').trim(),
    image,
    images: (Array.isArray(b.images) && b.images.length)
      ? b.images.filter((u) => typeof u === 'string' && (u.startsWith('http') || u.startsWith('/uploads/')))
      : (old.images && old.images.length ? old.images : [image]),
    photoCount: (Array.isArray(b.images) && b.images.length) ? b.images.length : (old.photoCount || 1),
    address: location,
    pricePerSqm: area > 0 ? Math.round(price / area) : old.pricePerSqm,
    subtitle: [location, area ? area + ' m²' : '', rooms ? rooms + ' szoba' : ''].filter(Boolean).join(' · '),
    balcony: b.balcony !== undefined ? !!b.balcony : old.balcony,
    parking: b.parking !== undefined ? !!b.parking : old.parking,
    ac: b.ac !== undefined ? !!b.ac : old.ac,
    elevator: b.elevator !== undefined ? !!b.elevator : old.elevator,
    alarm: b.alarm !== undefined ? !!b.alarm : old.alarm,
    garden: b.garden !== undefined ? !!b.garden : old.garden,
    cellar: b.cellar !== undefined ? !!b.cellar : old.cellar,
    fireplace: b.fireplace !== undefined ? !!b.fireplace : old.fireplace,
    petFriendly: b.petFriendly !== undefined ? !!b.petFriendly : old.petFriendly,
    moveIn: b.moveIn !== undefined ? !!b.moveIn : old.moveIn,
    condition: b.condition !== undefined ? (b.condition || '').trim() : (old.condition || ''),
    garage: b.garage !== undefined ? !!b.garage : !!old.garage,
    yardArea: b.yardArea !== undefined ? (parseInt(b.yardArea, 10) || 0) : (old.yardArea || 0),
    heating: b.heating !== undefined ? (b.heating || '').trim() : (old.heating || ''),
    yearBuilt: b.yearBuilt !== undefined ? (parseInt(b.yearBuilt, 10) || old.yearBuilt || 0) : (old.yearBuilt || 0),
    totalFloors: b.totalFloors !== undefined ? (parseInt(b.totalFloors, 10) || old.totalFloors || 0) : (old.totalFloors || 0),
    floor: b.floor !== undefined ? (b.floor || '') : (old.floor || ''),
    district: b.district !== undefined ? (b.district || '').trim() : (old.district || ''),
  });
  await store.updateListingById(updated.id, updated);
  res.json({ ok: true, id: updated.id });
});

// 删除本人发布的房源（需登录，且只能删自己的）
app.delete('/api/listings/:id', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'not_logged_in' });
  const item = await store.getListingById(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (!item.publisher || String(item.publisher.id) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  await store.deleteListingById(req.params.id);
  res.json({ ok: true });
});

// 其余 GET 请求：若存在对应 .html 则返回，否则 404 页面（绝不返回目录列表）
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const name = req.path.replace(/^\//, '').split('/')[0] || 'index';
  const file = path.join(staticDir, name === '' ? 'index.html' : name.endsWith('.html') ? name : name + '.html');
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return res.sendFile(file);
  res.status(404).sendFile(path.join(staticDir, '404.html'));
});

// 启动：有 DATABASE_URL 时先初始化表再监听
async function start() {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('Fatal: NODE_ENV=production 时必须设置 SESSION_SECRET。请在 Render Dashboard → Environment 中添加 SESSION_SECRET（可用 openssl rand -hex 32 生成）。');
    process.exit(1);
  }
  if (store.isUsingDb()) {
    try {
      await store.initDbSchema();
      console.log('Database schema ready.');
    } catch (e) {
      console.error('Database init failed:', e.message);
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log('Ingatlan server: http://localhost:' + PORT);
    console.log('  Storage:', store.isUsingDb() ? 'PostgreSQL' : 'JSON files (server/data/)');
    console.log('  Uploads:', UPLOADS_DIR);
    console.log('  API: /api/me, /api/register, /api/login, /api/logout');
    console.log('       /api/stats, /api/listings, /api/listings/:id, /api/my-listings (auth), /api/areas/counts');
    console.log('       POST /api/listings (auth) = 内部上传房源');
  });
}
start();
