#!/usr/bin/env node
// gh 替身：用 PAT 直接调 GitHub REST API，无需安装 gh CLI
// 用法:
//   node gh.cjs whoami
//   node gh.cjs repo create NAME [--private] [--desc "描述"]
//   node gh.cjs file OWNER/REPO PATH LOCALFILE [--msg "commit msg"]
//   node gh.cjs push OWNER/REPO LOCALDIR [--branch main]
//   node gh.cjs release OWNER/REPO TAG [--name N] [--notes F] FILE...
//   node gh.cjs issue OWNER/REPO "标题" "正文"
//   node gh.cjs pr OWNER/REPO HEAD BASE "标题" "正文"

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const fs = require('fs');
const path = require('path');

function die(m) { console.error('✗ ' + m); process.exit(1); }
if (!TOKEN) die('缺少环境变量 GH_TOKEN');

async function api(p, opts = {}) {
  const r = await fetch(API + p, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-gh',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
  if (!r.ok) die(`${r.status} ${p} :: ${typeof j === 'string' ? j : JSON.stringify(j).slice(0, 400)}`);
  return j;
}

function argAfter(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}
const has = (n) => process.argv.includes(n);
const args = process.argv.slice(2);
const cmd = args[0];

(async () => {
  if (cmd === 'whoami') {
    const u = await api('/user');
    const rl = await api('/rate_limit');
    console.log(`✓ 已认证: ${u.login} (${u.name || '-'})  ${u.public_repos} 个公开仓库`);
    console.log(`  剩余额度: ${rl.rate.remaining}/${rl.rate.limit}`);
    return;
  }

  if (cmd === 'repo' && args[1] === 'create') {
    const name = args[2] || die('缺仓库名');
    const repo = await api('/user/repos', {
      method: 'POST',
      body: {
        name,
        private: has('--private'),
        description: argAfter('--desc', ''),
        auto_init: !has('--no-init'),
      },
    });
    console.log(`✓ 仓库已建: ${repo.html_url}`);
    return;
  }

  // 上传单个文件（存在则更新，走 contents API，自动取 sha）
  if (cmd === 'file') {
    const [slug, remote, local] = [args[1], args[2], args[3]];
    if (!slug || !remote || !local) die('用法: file OWNER/REPO PATH LOCALFILE');
    const content = fs.readFileSync(local).toString('base64');
    let sha;
    try {
      const cur = await api(`/repos/${slug}/contents/${encodeURI(remote)}`);
      sha = cur.sha;
    } catch {}
    const res = await api(`/repos/${slug}/contents/${encodeURI(remote)}`, {
      method: 'PUT',
      body: { message: argAfter('--msg', `update ${remote}`), content, ...(sha ? { sha } : {}) },
    });
    console.log(`✓ ${remote}: ${res.commit.html_url}`);
    return;
  }

  // 整个目录推到默认分支：git 走 HTTPS + token
  if (cmd === 'push') {
    const [slug, dir] = [args[1], args[2]];
    if (!slug || !dir) die('用法: push OWNER/REPO LOCALDIR [--branch main]');
    const branch = argAfter('--branch', 'main');
    const { execSync } = require('child_process');
    const url = `https://x-access-token:${TOKEN}@github.com/${slug}.git`;
    const run = (c) => execSync(c, { cwd: dir, stdio: 'pipe' }).toString();
    if (!fs.existsSync(path.join(dir, '.git'))) run('git init -q');
    run(`git checkout -q -B ${branch}`);
    run('git add -A');
    try {
      run(`git -c user.name=dsh-bot -c user.email=dsh-bot@users.noreply.github.com commit -q -m "${argAfter('--msg', 'update from dsh')}"`);
    } catch { console.log('  无可提交变更'); }
    run(`git remote remove origin || true`);
    run(`git remote add origin ${url}`);
    run(`git push -q -u origin ${branch} --force`);
    console.log(`✓ 已推送 ${dir} → https://github.com/${slug}/tree/${branch}`);
    return;
  }

  if (cmd === 'release') {
    const [slug, tag] = [args[1], args[2]];
    if (!slug || !tag) die('用法: release OWNER/REPO TAG FILE...');
    const notesPath = argAfter('--notes', null);
    const notes = notesPath ? fs.readFileSync(notesPath, 'utf8') : argAfter('--body', '');
    let rel;
    try {
      rel = await api(`/repos/${slug}/releases`, {
        method: 'POST',
        body: { tag_name: tag, name: argAfter('--name', tag), body: notes, draft: has('--draft'), prerelease: has('--pre') },
      });
    } catch (e) {
      rel = await api(`/repos/${slug}/releases/tags/${tag}`);
    }
    console.log(`✓ Release: ${rel.html_url}`);
    const files = args.slice(3).filter((a) => fs.existsSync(a));
    for (const f of files) {
      const name = path.basename(f);
      const r = await fetch(`https://uploads.github.com/repos/${slug}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream', 'User-Agent': 'dsh-gh' },
        body: fs.readFileSync(f),
      });
      console.log(r.ok ? `  ↑ ${name}` : `  ✗ ${name} ${r.status}`);
    }
    return;
  }

  if (cmd === 'issue') {
    const [slug, title, body] = [args[1], args[2], args[3] || ''];
    const r = await api(`/repos/${slug}/issues`, { method: 'POST', body: { title, body } });
    console.log(`✓ Issue #${r.number}: ${r.html_url}`);
    return;
  }

  if (cmd === 'pr') {
    const [slug, head, base, title, body] = [args[1], args[2], args[3] || 'main', args[4], args[5] || ''];
    const r = await api(`/repos/${slug}/pulls`, { method: 'POST', body: { head, base, title, body } });
    console.log(`✓ PR #${r.number}: ${r.html_url}`);
    return;
  }

  console.log(`命令: whoami | repo create | file | push | release | issue | pr`);
})();
