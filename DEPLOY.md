# 部署到网络（生产环境）

当前项目是 **前后端一体**：后端用 Node.js 提供 API 并同时托管前端静态文件，部署时只需部署这一份代码到一个运行 Node 的环境即可。

---

## 一、部署前需要做的修改与配置

### 1. 环境变量（必须）

在服务器或托管平台里设置：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NODE_ENV` | 生产环境标识 | `production` |
| `PORT` | 服务端口（多数平台自动注入） | `3000` 或平台指定 |
| `SESSION_SECRET` | 会话加密密钥，**务必随机且不泄露** | 用 `openssl rand -hex 32` 生成 |

### 2. 可选环境变量

| 变量名 | 说明 | 何时需要 |
|--------|------|----------|
| `ALLOWED_ORIGINS` | 允许的跨域来源，逗号分隔 | 仅当前端与后端**不同域名**时设置，如 `https://你的前端域名.com` |
| `APP_URL` | 站点完整地址 | 若希望 Cookie 走 `secure`，可设 `https://你的域名.com` |
| `SECURE_COOKIES` | 设为 `1` 时强制 Cookie 仅 HTTPS 传输 | 上线 HTTPS 后建议设为 `1` |

**同域名部署（推荐）**：前端和后端在同一域名下（例如都通过 `https://你的域名.com` 访问）时，**不用**设置 `ALLOWED_ORIGINS`，CORS 会按同源处理。

### 3. 代码上不需要改的地方

- 前端请求 API 时使用的是**相对路径**（如 `/api/me`），只要页面和接口在同一域名下，部署后无需改前端代码。
- 若你**确实**把前端和后端拆成两个域名部署，再在页面里通过 `window.INGATLAN_API_BASE = 'https://你的API域名';` 指定 API 根地址（在引入 `api.js` 之前设置）。

---

## 二、推荐部署方式

### 方式 A：Railway / Render / 类似 PaaS（适合快速上线）

1. **把项目放进 Git 仓库**（GitHub / GitLab 等）。
2. 在 Railway 或 Render 中 **从仓库创建新项目**，根目录选本仓库根目录（包含 `server` 和前端文件的那一层）。
3. **构建与启动**：
   - **Build Command**：`cd server && npm install`
   - **Start Command**：`cd server && node server.js`
   - 若无单独 Build，可在 Start 里写：`cd server && npm install && node server.js`
4. 在平台里配置 **环境变量**：至少设置 `NODE_ENV=production` 和 `SESSION_SECRET`。
5. 平台会分配一个 HTTPS 域名，也可绑定自己的域名。

注意：PaaS 的磁盘可能**不持久**，重启后 `server/data/` 和 `uploads/` 里的内容可能丢失。若需要长期保留数据，请用方式 B 或平台提供的持久化卷/外部存储。

### 方式 B：自己的 VPS（如腾讯云、阿里云、DigitalOcean）

1. 在服务器上安装 **Node.js 18+**。
2. 用 Git 拉取代码，或把项目打包上传到服务器。
3. 在项目**根目录**执行：
   ```bash
   cd server
   npm install
   NODE_ENV=production PORT=3000 SESSION_SECRET=你的随机密钥 node server.js
   ```
4. 用 **PM2** 或 **systemd** 做进程守护与开机自启（推荐 PM2）：
   ```bash
   npm install -g pm2
   cd /path/to/ingatlan-platform/server
   SESSION_SECRET=你的随机密钥 pm2 start server.js --name ingatlan -i 1
   pm2 save && pm2 startup
   ```
5. 用 **Nginx**（或 Caddy）做反向代理，把 80/443 转到本机 3000 端口，并配置 HTTPS（Let’s Encrypt）。

---

## 三、部署之后要怎么做

1. **用浏览器访问你配置的域名**（或平台给的域名），确认首页、搜索、登录、注册、发布、审批流程都正常。
2. **首次上线建议**：用管理员账号登录一次，在「审批状态」里确认已有你的账号且为「已通过」。
3. **数据备份**：若在 VPS 上，定期备份 `server/data/users.json`、`server/data/listings.json` 和 `uploads/` 目录。
4. **后续更新**：
   - PaaS：在 Git 里改完代码后推送到仓库，平台会自动重新部署（若已开启自动部署）。
   - VPS：在服务器上 `git pull`（或重新上传），在 `server` 目录执行 `npm install`（若有依赖变更），然后重启进程（如 `pm2 restart ingatlan`）。

---

## 四、常见问题

- **登录后立刻掉线**：多为 Cookie 或域名不一致。确保前后端同域名，且生产环境已设 `SESSION_SECRET`；若用 HTTPS，可设 `SECURE_COOKIES=1`。
- **跨域错误**：前端和后端不在同一域名时，在服务器上设置 `ALLOWED_ORIGINS=https://你的前端域名`（多个用逗号分隔）。
- **上传图片 404**：确认 `uploads` 目录存在且应用有写权限；若用 Nginx，不要对 `/uploads` 做特殊重写，交给 Node 处理即可。

按上述步骤做完「需要做的修改」并选一种方式部署后，就可以在网络上正常使用；之后有修改只需更新代码并重启（或触发重新部署）即可。
