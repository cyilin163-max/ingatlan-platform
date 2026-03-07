# Ingatlan Platform (匈牙利房产平台)

匈牙利语房产信息网站前端，包含首页、搜索结果、房源详情与用户中心。

## 功能概览

- **首页 (index.html)**  
  全局搜索（城市/区/街道/楼盘）、快捷分类（租房/买房/新房/二手房/办公楼/地块）、热门区域、实时统计、专业服务入口（贷款计算器、搬家、装修）。

- **搜索结果页 (search.html)**  
  筛选：价格、面积、房间数、建筑类型、翻新程度、楼层、电梯、供暖（Távfűtés, Gáz cirkó, Hőszivattyú 等）。房源卡片含首图、水印、图片数/3D 标识、价格与单价、面积/房间/楼层、状态标签（急售/降价/新上架）、收藏与对比。底部对比浮窗（2–3 套对比）。

- **房源详情页 (property.html)**  
  图库（缩略图切换、全屏）、房源档案表（建造年份、朝向、层高、Közös költség、设施、能效、法律状态）、描述、发布者信息与电话点击显示、联系表单。预留户型图与地图占位、区域价格走势占位。

- **用户中心 (account.html)**  
  我的发布（浏览量/咨询）、我的收藏（降价提醒）、搜索保存 Alerts、搜索偏好设置。

## 本地运行（避免出现“目录列表”页）

**推荐：用项目自带的 Node 服务器（不会出现目录列表）**

- 双击 **`打开首页.bat`**：会启动服务器并打开浏览器。
- 或手动：`cd server` → `npm install`（首次）→ `npm start`，然后访问 **http://localhost:3000**

**若用 Python：**

- 必须先进入项目目录再启动，否则访问时会看到“目录索引”而不是首页：
  - 双击 **`用Python启动-本目录.bat`**，然后访问 **http://localhost:8080**
  - 或命令行：`cd ingatlan-platform` → `python -m http.server 8080`，浏览器打开 **http://localhost:8080**（不要打开带 `/ingatlan-platform/` 的地址）

**仅看页面（不启动服务器）：** 双击 `打开首页-仅本地.bat` 或直接双击 `index.html`。

## 文件结构

```
ingatlan-platform/
├── index.html          # 首页
├── search.html         # 搜索结果
├── property.html       # 房源详情
├── account.html        # 用户中心
├── css/
│   ├── variables.css   # 设计变量
│   ├── common.css      # 公共样式与组件
│   ├── home.css
│   ├── search.css
│   ├── property.css
│   └── account.css
├── js/
│   ├── home.js
│   ├── search.js       # 对比栏、收藏
│   ├── property.js     # 图库、电话显示、表单
│   └── account.js      # 标签页切换
└── README.md
```

## 技术说明

- 纯 HTML + CSS + JavaScript，无构建步骤。
- 界面为匈牙利语 (hu)。
- 图片使用 Unsplash 占位；实际项目需替换为真实房源图与后端 API。
