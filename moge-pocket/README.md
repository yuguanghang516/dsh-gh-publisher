# 墨格 · 随身漫画书库

面向手机浏览器的 PWA，使用原生 HTML、CSS 和 JavaScript，无构建依赖。全部示例漫画为项目原创 CC0 内容，不连接外部漫画站点。

- 手机底部导航、平板与桌面布局，浅色/深色外观。
- 搜索书名、作者和标签，收藏与书库筛选。
- 图片/CBZ 导入，文件以 Blob 保存在 IndexedDB。
- 全屏阅读、左右点击与滑动翻页、页码滑块跳转、放大查看、阅读进度、跨章节阅读。
- 阅读方向可选「左 → 右」或「右 → 左」（日漫习惯），翻页区域、滑动和方向键一起跟随。
- 章节离线保存和标准 PNG CBZ 导出，实际下载队列、重试和删除。
- 对比已发布原创目录，手动、打开时、页面可见时定时检查更新，可开启新章节自动离线保存。
- 书目与阅读进度 JSON 导出和恢复。备份不包含本地图片，需要另存原始文件。
- Web App Manifest、Service Worker 应用外壳缓存。

## 使用限制

数据保存在当前设备和浏览器，不跨设备同步。浏览器网页关闭后不运行追更任务。当前来源为内置原创示例源；目录仅在本项目发布内容后更新。没有接入外部漫画源和推送服务。

首次需联网加载应用。离线阅读需要先导入或下载漫画，且浏览器允许 IndexedDB/Service Worker。私人托管服务的登录状态可能影响首次离线导航。请保留原始漫画文件，浏览器可能回收非持久存储。

## 文件

`dist/` 是部署目录，`catalog.json` 是原创内容目录。`scripts/generate-assets.py` 生成原创 SVG 页、PNG 页与 CBZ 文件。

## 验证

```sh
node --check dist/app.js
node --check dist/storage.js
node --check dist/sw.js
node tests/storage-test.mjs
```

浏览器集成和手机实机验证需要可用的预览浏览器。

完整的非浏览器 DOM/IndexedDB 测试需要 `jsdom` 和 `fake-indexeddb`：

```sh
npm install --prefix /tmp/moge-checks jsdom fake-indexeddb
MOGE_TEST_MODULE_ROOT=/tmp/moge-checks/node_modules node --experimental-vm-modules tests/app-flow-test.mjs
```
