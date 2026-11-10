# 墨格下载

[下载已生成的 HTML、ZIP 和校验文件](https://github.com/yuguanghang516/dsh-gh-publisher/actions/runs/42830761618/artifacts/13770997188)

需要登录 GitHub。此构建产物保留至 2027-02-08。下载得到的外层 ZIP 包含 `moge-pocket.html`、`moge-pocket.zip`、`SHA256SUMS.txt`；构建对应提交 `b0f3176`（阅读器点击区域、页码滑块、缩放与右→左阅读方向）。

[查看构建检查结果](https://github.com/yuguanghang516/dsh-gh-publisher/actions/runs/42830761618)

[下载完整源码](https://github.com/yuguanghang516/dsh-gh-publisher/archive/refs/heads/main.zip)

## 以后重新打包

在仓库 Actions 中选择 Build Moge downloadable files，点击 Run workflow；任务完成后下载 moge-pocket-downloads。流程只读源码，不修改仓库和 Release。

电脑安装 Python 3 后，也可在仓库根目录运行：

```sh
python scripts/package-moge.py
```

文件生成在 release/ 下，无第三方依赖。

## 使用与限制

HTML 内嵌原创示例，支持本地图片/CBZ导入、阅读和进度管理。手机文件预览可能不执行脚本，需使用支持本地网页脚本的浏览器。浏览器存储受限时显示临时模式，关闭后不保留数据。请保留漫画原文件；JSON书目备份不包含图片。

当前没有外部漫画来源，文件版目录固定，不联网追更。网页版关闭后也不会持续追更；尚未做手机实机测试。

## 网页源码运行

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

同一设备打开 http://127.0.0.1:8765 。正式部署将 dist 内容放在 HTTPS 网站根目录。
