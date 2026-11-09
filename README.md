# dsh-gh-publisher

一个**零依赖**的 GitHub 发布命令行工具：只用 Node.js 内置 `fetch`，不装 `gh`、不装任何 npm 包，一条命令完成建仓库、写文件、推目录、发 Release、开 Issue/PR。

为手机上的 Termux / proot 环境写的——那种环境往往装不上 `gh`，但 Node 一定有。

## 为什么用它

| 场景 | `gh` CLI | 本工具 |
|---|---|---|
| 安装成本 | 需要下载二进制或 apt 源 | 复制一个 `.cjs` 文件即可 |
| 依赖 | 一堆 | 0 |
| 手机 / ARM / proot | 经常装不上 | 直接跑 |
| 用途 | 全功能 | 只做"发布"这几件事，命令更短 |

## 安装

```bash
git clone https://github.com/yuguanghang516/dsh-gh-publisher.git
cd dsh-gh-publisher
node gh.cjs whoami   # 需要先设置 GH_TOKEN
```

## 准备令牌

在 https://github.com/settings/tokens/new?scopes=repo&description=dsh 生成一个 **classic PAT**，勾 `repo` 就够。

```bash
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxx
node gh.cjs whoami
# ✓ 已认证: yourname  3 个公开仓库
#   剩余额度: 4999/5000
```

令牌别写进文件、别提交进仓库。用完在设置页删掉。

## 命令

### 建仓库

```bash
node gh.cjs repo create my-project --desc "我的项目"
node gh.cjs repo create secret-thing --private --no-init
```

### 写单个文件（存在则更新）

自动读取当前文件的 SHA，所以覆盖已有文件不用手动查：

```bash
node gh.cjs file owner/repo README.md ./README.md --msg "docs: 更新说明"
```

### 推整个目录

内部走 `git init` + HTTPS token 推送，首次也直接可用：

```bash
node gh.cjs push owner/repo ./my-dir --branch main --msg "feat: 初始提交"
```

### 发 Release 并上传附件

```bash
node gh.cjs release owner/repo v1.0.0 \
  --name "v1.0.0" \
  --notes ./CHANGELOG.md \
  ./dist/app.zip ./dist/app.apk
```

加 `--draft` 存草稿，`--pre` 标记预发布。

### 开 Issue

```bash
node gh.cjs issue owner/repo "标题" "正文内容"
```

### 开 PR

```bash
node gh.cjs pr owner/repo feature-branch main "标题" "正文"
```

## 参数速查

| 参数 | 作用 |
|---|---|
| `--desc` | 仓库描述 |
| `--private` | 建私有仓库 |
| `--no-init` | 不自动初始化 README |
| `--msg` | 提交信息 |
| `--branch` | 推送分支，默认 `main` |
| `--name` | Release 标题 |
| `--notes` | 从文件读 Release 说明 |
| `--body` | 直接给 Release 说明 |
| `--draft` / `--pre` | 草稿 / 预发布 |

## 说明

- 出错直接退出并打印状态码与响应体前 400 字符，方便排查。
- `push` 使用 `--force`，因为常见场景是"同步本地目录到远端"，不是协作分支。
- 未认证的 API 额度只有 60 次/小时；带 token 是 5000 次/小时。

## License

MIT
