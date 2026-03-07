/**
 * Ingatlan 后端：注册、登录、会话
 * 用户数据存在 server/data/users.json，密码用 bcrypt 加密
 * 运行：cd server && npm install && npm start  默认端口 3000
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const ADMIN_BOOTSTRAP_EMAILS = ['yilin_1024@hotmail.com'];

const app = express();

// 生产环境若放在 Nginx/反向代理后，需信任代理头（用于 HTTPS 与 CORS 同源判断）
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// 确保 data 和 uploads 目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// 读取用户列表
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (!Array.isArray(raw)) return [];
    const normalized = raw.map(normalizeUserRecord);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      saveUsers(normalized);
    }
    return normalized;
  } catch (e) {
    return [];
  }
}

// 写入用户列表
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

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

function getSessionUser(req, res) {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ ok: false, error: 'not_logged_in' });
    return null;
  }
  const users = loadUsers();
  const user = users.find((u) => String(u.id) === String(userId));
  if (!user) {
    req.session = null;
    res.status(401).json({ ok: false, error: 'user_not_found' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = getSessionUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ ok: false, error: 'admin_only' });
    return null;
  }
  return user;
}

function requireApprovedPublisher(req, res) {
  const user = getSessionUser(req, res);
  if (!user) return null;
  if (!isApprovedPublisher(user)) {
    res.status(403).json({ ok: false, error: 'not_approved' });
    return null;
  }
  return user;
}

// 读取房源列表（首页、搜索、详情用）
function loadListings() {
  if (!fs.existsSync(LISTINGS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// 写入房源列表（内部上传后持久化）
function saveListings(list) {
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(list, null, 2), 'utf8');
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
app.get('/api/me', (req, res) => {
  const user = getSessionUser(req, res);
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
  const users = loadUsers();
  if (users.some((u) => u.email.toLowerCase() === emailNorm)) {
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
  users.push(user);
  saveUsers(users);
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
  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === emailNorm);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
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
app.get('/api/admin/users', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const items = loadUsers()
    .slice()
    .sort((a, b) => {
      if (!!a.isAdmin !== !!b.isAdmin) return a.isAdmin ? -1 : 1;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * -1;
    })
    .map((user) => toClientUser(user));
  res.json({ ok: true, items });
});

// 管理员：批准 / 撤销发布权限
app.post('/api/admin/users/:id/publish-approval', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const body = req.body || {};
  if (typeof body.approved !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'missing_approval_state' });
  }
  const users = loadUsers();
  const idx = users.findIndex((u) => String(u.id) === String(req.params.id));
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'user_not_found' });
  }
  if (users[idx].isAdmin && body.approved === false) {
    return res.status(400).json({ ok: false, error: 'cannot_revoke_admin' });
  }
  users[idx] = normalizeUserRecord(Object.assign({}, users[idx], {
    canPublish: body.approved === true,
  }));
  saveUsers(users);
  res.json({ ok: true, user: toClientUser(users[idx]) });
});

// ---------- 房源与统计 API ----------

// 统计：在售数量、今日新增
app.get('/api/stats', (req, res) => {
  const list = loadListings();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = list.filter((l) => (l.listedAt || '').slice(0, 10) === today).length;
  res.json({ activeListings: list.length, newToday });
});

// 区域数量（首页热门区域用）
app.get('/api/areas/counts', (req, res) => {
  const list = loadListings();
  const counts = { 'budapest-belvaros': 0, balaton: 0, 'budapest-agglomeracio': 0 };
  list.forEach((item) => {
    const loc = item.location || '';
    if (loc.indexOf('V. kerület') !== -1 || loc.indexOf('VI. kerület') !== -1) counts['budapest-belvaros']++;
    else if (loc.indexOf('Balaton') !== -1) counts.balaton++;
    else if (loc.indexOf('Budapest') !== -1) counts['budapest-agglomeracio']++;
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
  const map = {
    'gaz_cirko': 'gas',
    'gas': 'gas',
    'tavfutes': 'district',
    'district': 'district',
    'electric': 'electric',
    'villany': 'electric',
    'hoszivattyu': 'other',
    'egyeb': 'other',
    'other': 'other'
  };
  return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
}

function matchesBoolFilter(filterValue, actualValue) {
  if (filterValue === '1') return !!actualValue;
  if (filterValue === '0') return !actualValue;
  return true;
}

// 房源列表（支持分页、排序）
app.get('/api/listings', (req, res) => {
  let list = loadListings();
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
  const district = (req.query.district || '').trim();
  const sort = req.query.sort || 'newest';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));

  if (q) {
    // 去除点号，方便匹配 "XI. kerület" → ["xi", "kerület"]
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
app.get('/api/listings/:id', (req, res) => {
  const list = loadListings();
  const item = list.find((l) => String(l.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// 当前登录用户发布的房源（需登录）
app.get('/api/my-listings', (req, res) => {
  const user = getSessionUser(req, res);
  if (!user) return;
  const userId = user.id;
  const list = loadListings();
  const mine = list.filter((l) => l.publisher && String(l.publisher.id) === String(userId));
  const items = mine.map((item) => ({
    id: item.id,
    title: item.title,
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

// 图片上传（需登录）：接收 base64 dataURL，保存为文件，返回可访问的 URL
app.post('/api/upload', (req, res) => {
  const user = requireApprovedPublisher(req, res);
  if (!user) return;
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ ok: false, error: 'missing_data' });
  const match = dataUrl.match(/^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/i);
  if (!match) return res.status(400).json({ ok: false, error: 'invalid_image' });
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  const buf = Buffer.from(match[3], 'base64');
  if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'too_large' });
  const filename = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const filepath = path.join(UPLOADS_DIR, filename);
  try {
    fs.writeFileSync(filepath, buf);
    res.json({ ok: true, url: '/uploads/' + filename });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'write_failed' });
  }
});

// 内部上传房源（需登录）
app.post('/api/listings', (req, res) => {
  const user = requireApprovedPublisher(req, res);
  if (!user) return;
  const b = req.body || {};
  const title = (b.title || '').trim();
  const category = (b.category || 'buy').toLowerCase();
  if (!title) {
    return res.status(400).json({ ok: false, error: 'missing_title' });
  }
  const price = parseInt(b.price, 10) || 0;
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
    furnished: (b.furnished || '').trim(),
    heating: (b.heating || '').trim(),
    yearBuilt: parseInt(b.yearBuilt, 10) || 0,
    totalFloors: parseInt(b.totalFloors, 10) || 0,
    district: (b.district || '').trim(),
  };
  const list = loadListings();
  list.push(item);
  saveListings(list);
  res.json({ ok: true, id: item.id });
});

// 编辑本人发布的房源（需登录，且只能改自己的）
app.put('/api/listings/:id', (req, res) => {
  const user = requireApprovedPublisher(req, res);
  if (!user) return;
  const userId = user.id;
  const list = loadListings();
  const idx = list.findIndex((l) => String(l.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  if (!list[idx].publisher || String(list[idx].publisher.id) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const b = req.body || {};
  const old = list[idx];
  const price = parseInt(b.price, 10) || old.price;
  const area = parseInt(b.area, 10) || old.area;
  const location = (b.location || old.location || '').trim();
  const rooms = parseInt(b.rooms, 10) || old.rooms;
  let image = (b.image || '').trim();
  if (!image || (!image.startsWith('http') && !image.startsWith('/uploads/'))) image = old.image;
  const updated = Object.assign({}, old, {
    title: (b.title || old.title).trim(),
    category: b.category || old.category,
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
    furnished: b.furnished !== undefined ? (b.furnished || '').trim() : (old.furnished || ''),
    heating: b.heating !== undefined ? (b.heating || '').trim() : (old.heating || ''),
    yearBuilt: b.yearBuilt !== undefined ? (parseInt(b.yearBuilt, 10) || old.yearBuilt || 0) : (old.yearBuilt || 0),
    totalFloors: b.totalFloors !== undefined ? (parseInt(b.totalFloors, 10) || old.totalFloors || 0) : (old.totalFloors || 0),
    floor: b.floor !== undefined ? (b.floor || '') : (old.floor || ''),
    district: b.district !== undefined ? (b.district || '').trim() : (old.district || ''),
  });
  list[idx] = updated;
  saveListings(list);
  res.json({ ok: true, id: updated.id });
});

// 删除本人发布的房源（需登录，且只能删自己的）
app.delete('/api/listings/:id', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'not_logged_in' });
  const list = loadListings();
  const idx = list.findIndex((l) => String(l.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  if (!list[idx].publisher || String(list[idx].publisher.id) !== String(userId)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  list.splice(idx, 1);
  saveListings(list);
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

// 启动
app.listen(PORT, () => {
  console.log('Ingatlan server: http://localhost:' + PORT);
  console.log('  API: /api/me, /api/register, /api/login, /api/logout');
  console.log('       /api/stats, /api/listings, /api/listings/:id, /api/my-listings (auth), /api/areas/counts');
  console.log('       POST /api/listings (auth) = 内部上传房源');
});
