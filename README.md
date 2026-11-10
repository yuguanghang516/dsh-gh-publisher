# 墨格 · 随身漫画书库

装进口袋的漫画书库：纯 HTML / CSS / JavaScript 的 PWA，无构建依赖，无后端。导入自己的 CBZ 或图片，离线也能读。

全部示例漫画为项目原创 CC0 内容；不连接任何外部漫画站点，不抓取、不内置盗版源。

## 功能

- 手机底部导航、平板与桌面布局，浅色 / 深色外观。
- 搜索书名、作者和标签，收藏与书库筛选、排序。
- 图片 / CBZ 导入，文件以 Blob 保存在 IndexedDB，刷新不丢。
- 全屏阅读：左右点击区域、滑动翻页、页码滑块跳转、放大查看、跨章节阅读。
- 阅读方向可选「左 → 右」或「右 → 左」（日漫习惯），点击区域、滑动与方向键一起跟随。
- 章节离线保存与标准 PNG CBZ 导出，带下载队列、重试和删除。
- 对比已发布原创目录，手动 / 打开时 / 页面可见时定时检查更新，可开启新章节自动离线保存。
- 书目与阅读进度 JSON 导出与恢复（不含图片，需另存原始文件）。
- Web App Manifest、Service Worker 应用外壳缓存，可添加到主屏幕。

## 快速开始

网页版（正式使用建议放到任意 HTTPS 静态服务器，把 `dist/` 作为站点根目录）：

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

打开 http://127.0.0.1:8765 。

单文件版（手机直接打开，无需服务器）：

```sh
python scripts/package-moge.py
```

生成 `release/moge-pocket.html`（原创示例内嵌，可离线打开）、`release/moge-pocket.zip` 与 `release/SHA256SUMS.txt`。不需要第三方依赖。

## 下载

每次推送到 `main` 会自动构建，产物在 Actions 的 `moge-pocket-downloads` 里；也可以手动跑 `Build Moge downloadable files`。详见 [DOWNLOAD.md](DOWNLOAD.md)。

## 导入格式

| 格式 | 说明 |
|---|---|
| `.cbz` / `.zip` | 直接读取；可选 `ComicInfo.xml` 覆盖标题、作者、简介 |
| 多张图片 | JPG / PNG / WebP / GIF / AVIF，按文件名自然排序组成一本 |
| `.cbr` / `.rar`、PDF | 暂不支持 |

## 使用限制

数据保存在当前设备和浏览器，不跨设备同步；关闭网页后不运行追更任务。首次需联网加载应用，离线阅读需先导入或下载且浏览器允许 IndexedDB / Service Worker。浏览器可能回收非持久存储，请保留原始漫画文件。当前内容源只有内置原创示例，没有外部漫画源与推送服务。

## 目录结构

```
dist/                部署目录（index.html、app.js、storage.js、sw.js、catalog.json、assets/）
scripts/             原创素材生成（generate-assets.py）与单文件打包（package-moge.py）
tests/               存储、Service Worker、DOM 流程测试
.github/workflows/   自动构建可下载的 HTML / ZIP
```

## 验证

```sh
node --check dist/app.js
node --check dist/storage.js
node --check dist/sw.js
node tests/storage-test.mjs
node tests/sw-test.mjs
```

DOM / IndexedDB 流程测试（需要 `jsdom` 与 `fake-indexeddb`，装在仓库外）：

```sh
npm install --prefix /tmp/moge-checks jsdom fake-indexeddb
MOGE_TEST_MODULE_ROOT=/tmp/moge-checks/node_modules node --experimental-vm-modules tests/app-flow-test.mjs
```

## 许可

代码 MIT；`dist/assets` 下的原创示例漫画为 CC0 1.0，可自由使用与再分发。
