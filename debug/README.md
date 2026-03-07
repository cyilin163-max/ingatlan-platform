# Debug 文件夹

用来做**最小复现**或**单独调试**时用的目录。

## 怎么用

1. **在 Cursor 里开始调试**
   - 按 `F5` 或点左侧「Run and Debug」（虫子图标）
   - 在顶部下拉选一个配置，例如：
     - **打开首页 (index.html)**：调试整站首页
     - **打开 Debug 测试页**：只打开本文件夹的 `index.html`
   - 选好后点绿色播放按钮，会用 Chrome 打开对应页面并挂上调试器

2. **断点**
   - 在 Cursor 里打开任意 `.js` 文件，行号左侧点击出现红点即为断点
   - Chrome 打开后，在 Sources 里也能给 JS 设断点

3. **若提示无法打开 file://**
   - 用本地静态服务器跑项目（例如 VS Code 的 Live Server、或 `npx serve .`），再用「Chrome 打开 localhost」的方式调试。
