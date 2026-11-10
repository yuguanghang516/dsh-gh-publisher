# 下载与打包

[下载完整仓库 ZIP](https://github.com/yuguanghang516/dsh-gh-publisher/archive/refs/heads/main.zip)，解压后进入 `moge-pocket` 目录。

本目录包含完整源码、6部原创示例和测试。原有仓库根目录的发布工具保持独立。

## 生成单文件 HTML 和应用 ZIP

电脑安装 Python 3 后运行：

```sh
python scripts/package-moge.py
```

无需第三方依赖。生成 `release/moge-pocket.html`、`release/moge-pocket.zip` 和中文使用说明。HTML包含全部示例资源，使用支持本地脚本的浏览器打开；部分手机文件预览不能运行。存储受限会进入临时模式。

## 启动网页版

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

同一设备打开 http://127.0.0.1:8765 。正式部署将 dist 内容放置在 HTTPS 站点根目录。

## 验证与限制

存储/CBZ、DOM/IndexedDB功能流程、Service Worker模拟检查已通过。尚未完成手机实机测试。

内容源为原创示例，未接外部漫画站点。文件版目录固定；网页版只在页面打开时检查目录，关闭后不持续追更。浏览器书库不会跨设备同步，JSON进度备份不含图片，请保留原文件。

较大的预打包 HTML/ZIP 尚未上传到 GitHub，以上脚本可从本仓库重新生成。
