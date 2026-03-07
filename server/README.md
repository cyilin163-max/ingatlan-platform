# Ingatlan 后端（登录 / 注册）

Node.js + Express，提供注册、登录、登出和会话（Cookie）。

## 安装与运行

```bash
cd server
npm install
npm start
```

默认端口 **3000**。浏览器打开：**http://localhost:3000**

- 整站（HTML/CSS/JS）由该服务提供，与 API 同源，Cookie 可正常使用。
- 若直接双击打开 `index.html`（file://），登录/注册请求会失败（无后端、跨域）。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/register | 注册，body: `{ email, password, name }` |
| POST | /api/login | 登录，body: `{ email, password }` |
| POST | /api/logout | 登出，清空会话 |
| GET | /api/me | 当前用户（需已登录），返回 `{ ok, user }` |

用户数据保存在 `server/data/users.json`，密码经 bcrypt 加密。生产环境请改用数据库并设置 `SESSION_SECRET` 环境变量。
