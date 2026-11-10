from pathlib import Path
import base64, json, re, zipfile, hashlib

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'release'
OUT.mkdir(parents=True,exist_ok=True)
WEB=ROOT/'dist'
HOST='https://moge-pocket-library.esteemedsorrel.chatgpt.site'

def data_url(path):
    mime={'.svg':'image/svg+xml','.png':'image/png','.cbz':'application/octet-stream'}[path.suffix]
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')

catalog=json.loads((WEB/'catalog.json').read_text())
for b in catalog['books']:
    b['cover']=data_url(WEB/b['cover'].lstrip('/'))
    for c in b['chapters']:
        c['pages']=[data_url(WEB/p.lstrip('/')) for p in c['pages']]
        c['download']=data_url(WEB/c['download'].lstrip('/'))

storage=(WEB/'storage.js').read_text()
storage=re.sub(r'^export ', '', storage,flags=re.M)
storage=storage.replace("  const db = await openStore();\n  return new Promise((resolve, reject) => {\n    let tx;\n    let request;", "  if (FILE_MEMORY_MODE) return fileMemoryOperation(store,action);\n  const db = await openStore();\n  return new Promise((resolve, reject) => {\n    let tx;\n    let request;",1)
storage=storage.replace("async function clearAll() {\n  const db", "async function clearAll() {\n  if(FILE_MEMORY_MODE){for(const table of fileTables.values())table.clear();return;}\n  const db",1)
storage=storage.replace('crypto.randomUUID()', 'fileUUID()')

app=(WEB/'app.js').read_text()
app=re.sub(r'^import .*\n', '', app,count=1)
def change(old,new):
    global app
    assert old in app,old[:120]
    app=app.replace(old,new)
change("await openStore();[books,downloads]", "await fileOpenStore();[books,downloads]")
change("if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});", '')
change("!b.cover?.startsWith('/assets/')", "!b.cover?.startsWith('data:image/')")
change("p.startsWith('/assets/')", "p.startsWith('data:image/')")
change("!c.download?.startsWith('/assets/')", "!c.download?.startsWith('data:application/octet-stream;base64,')")
change("const digest=await crypto.subtle.digest('SHA-256',await pages[0].arrayBuffer());", "const bytes=await pages[0].arrayBuffer();if(!globalThis.crypto?.subtle)return 'crc32:'+pages.map(p=>p.size).join(',')+':'+crc32(new Uint8Array(bytes));const digest=await crypto.subtle.digest('SHA-256',bytes);")
change("if(!navigator.onLine){if(!silent)toast('当前离线，联网后再检查更新');return;}", '')
change("if(Number(prefs.checkMinutes)>0)timer=setInterval", "if(false)timer=setInterval")
change("checking?'正在检查':'检查更新'", "checking?'正在检查':'检查目录'")
change('打开网页时也会检查。关闭网页后不会在手机后台持续检查；演示源仅在内容发布时更新。', '文件版使用内嵌目录，不联网获取新章节。更新内容需要下载新版文件；可继续管理自己导入的漫画。')
change("${Number(prefs.checkMinutes)?`页面打开期间，每 ${prefs.checkMinutes} 分钟检查一次`:'已设为手动检查'}", '文件版 · 内嵌原创目录')
change('当前在线来源为原创演示源；尚未连接外部漫画服务。', '内容已内嵌在此文件中；未连接外部漫画服务。')
change('检查更新会读取已发布的真实目录，并与设备上记录的章节比较。示例源只有在发布新内容时才会出现新章节。', '文件版检查的是内嵌原创目录，不联网获取新章节。更新示例内容需要下载新版文件。')
change("$('#main').innerHTML=(!navigator.onLine?", "$('#main').innerHTML=(FILE_MEMORY_MODE?'<div class=\"offline-banner\">临时模式：此浏览器限制文件存储，关闭后导入内容和进度不会保留。请保留原文件，或使用网页版。</div>':'')+(!navigator.onLine?")
change('设备本地保存', '设备本地保存') if '设备本地保存' in app else None
change('已导入 ${count} 部漫画，文件已保存在当前设备', "已导入 ${count} 部漫画${FILE_MEMORY_MODE?'（临时模式，关闭后不保留）':'，文件已保存在当前设备'}")
change('${b.title} 已离线保存', "${b.title} ${FILE_MEMORY_MODE?'已存入临时书库，关闭后不保留':'已离线保存'}")
change('<h3>保存在当前设备的浏览器内</h3>', "<h3>${FILE_MEMORY_MODE?'临时保存，仅本次打开有效':'保存在当前设备的浏览器内'}</h3>")
change('checkMinutes:30,autoDownload:true', 'checkMinutes:0,autoDownload:false')
change('追更检查间隔', '网页版追更间隔')
change('仅在网页打开且可见时生效', '文件版不定时检查，需使用网页版')
change('<select id="interval-select"', '<select disabled id="interval-select"')
change('<input id="auto-download-toggle"', '<input disabled id="auto-download-toggle"')
change('网页打开期间，发现更新后自动下载', '文件版使用固定目录，此项仅适用于网页版')
app=re.sub(r'^async function install\(\).*$', "async function install(){help('文件版使用说明','<p>当前是独立 HTML 文件，已包含页面和原创示例，无需解压其他资源。</p><p>本地文件不能直接安装为 App。如需添加到主屏幕，请使用联网的网页版。</p><p><a href=\""+HOST+"\" target=\"_blank\" rel=\"noopener\">打开手机网页版 →</a></p><p>iPhone 文件预览可能无法执行脚本。如果预览不能操作，请使用网页版；浏览器限制本地存储时，文件版会明确显示临时模式。</p>');}", app,flags=re.M)
app=app.replace('<strong>添加到主屏幕</strong><p>像打开 App 一样打开书库</p>','<strong>文件版使用说明</strong><p>查看打开方式和本地存储说明</p>').replace('aria-label="添加到主屏幕"','aria-label="文件版使用说明"')
app=app.replace('src="/icon.svg"','src="'+data_url(WEB/'icon.svg')+'"')

catalog_json=json.dumps(catalog,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
prefix=r'''(() => {
'use strict';
let FILE_MEMORY_MODE=false;
const fileTables=new Map(['books','downloads','settings'].map(k=>[k,new Map()]));
function fileClone(v){if(globalThis.structuredClone)return structuredClone(v);if(v instanceof Blob)return v;if(Array.isArray(v))return v.map(fileClone);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,fileClone(val)]));return v;}
function fileMemoryOperation(store,action){const map=fileTables.get(store);return action({getAll:()=>({result:fileClone([...map.values()])}),get:key=>({result:fileClone(map.get(key))}),put:item=>{map.set(item.id,fileClone(item));return{result:item.id};},delete:key=>{map.delete(key);return{result:undefined};}}).result;}
async function fileOpenStore(){try{await openStore();await getItems('settings');}catch{FILE_MEMORY_MODE=true;const el=document.querySelector('.local-status');if(el)el.textContent='临时模式 · 关闭后不保留';}}
function fileUUID(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);}
async function fetch(resource){const address=typeof resource==='string'?resource:resource.url;if(/^\/catalog\.json(?:\?|$)/.test(address))return new Response(JSON.stringify(FILE_CATALOG),{headers:{'Content-Type':'application/json;charset=utf-8'}});if(address.startsWith('data:')){const comma=address.indexOf(',');const header=address.slice(5,comma);const raw=atob(address.slice(comma+1));const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Response(bytes,{headers:{'Content-Type':header.split(';')[0]}});}throw new Error('文件版仅使用内嵌内容，不连接外部来源。');}
'''
script=prefix+'\nconst FILE_CATALOG='+catalog_json+';\n'+storage+'\n'+app+'\n})();'
assert '</script' not in script.lower()
css=re.sub(r"^@import[^\n]*\n",'',(WEB/'style.css').read_text(),count=1)
html=(WEB/'index.html').read_text()
html=re.sub(r'^\s*<link rel="(?:manifest|apple-touch-icon)"[^>]+>\s*$', '',html,flags=re.M)
html=html.replace('<link rel="stylesheet" href="/style.css">','<style>'+css+'</style>')
html=html.replace('<script type="module" src="/app.js"></script>','<script>'+script+'</script>')
html=html.replace('href="/icon.svg"','href="'+data_url(WEB/'icon.svg')+'"')
html=html.replace('src="/icon.svg"','src="'+data_url(WEB/'icon.svg')+'"')
html=html.replace('<title>墨格 · 随身漫画书库</title>','<title>墨格 · 随身漫画书库（文件版）</title>')
html=html.replace('<p>正在整理你的书架…</p>', '<p>正在打开墨格文件版…</p><p style="max-width:280px;text-align:center">若预览无法操作，请使用支持脚本的浏览器，或打开下方网页版。</p><a href="'+HOST+'" style="text-decoration:underline">打开手机网页版</a>')
(OUT/'moge-pocket.html').write_text(html)
(OUT/'moge-pocket.runtime.js').write_text(script)

instructions='''墨格 · 手机漫画书库（文件版）

1. 快速使用
打开 moge-pocket.html。页面、脚本、6 部原创示例与可导出的 CBZ 文件已全部内嵌，不需要额外下载资源。
这是 HTML 网页文件，不是 APK 或 iOS 安装包。需要浏览器允许执行本地网页脚本。
iPhone 的“文件”预览及部分聊天软件内置预览可能不执行脚本，这时请使用已发布的网页版：
'''+HOST+'''

2. 可以做什么
搜索和收藏原创示例、阅读和保存进度、导入本地图片或标准 CBZ、保存与导出内置章节、导出和恢复书目进度。
原版完整源码与资产位于 dist/，可部署在支持 HTTPS 的静态网站上。

3. 文件版与在线版的区别
文件版使用固定的内嵌原创目录，不连接外部漫画服务，不联网获取新章节。
新版示例内容需要下载新版 HTML 文件。文件版不能直接安装为手机 App；如需添加到主屏幕，请使用网页版。
如果浏览器允许 IndexedDB，书库保存于当前浏览器。如果浏览器限制本地文件存储，程序会显示“临时模式”；临时模式关闭后不保留导入内容和进度。
请保留原始漫画文件。书目 JSON 备份不包含导入的图片文件。

4. 开发或自行部署
将 dist/ 中全部文件放在网站根目录，使用 HTTPS。
电脑可安装 Python 3 后，在本包目录运行：
python -m http.server 8765 --bind 127.0.0.1 --directory dist
然后用同一设备浏览器打开 http://127.0.0.1:8765
这只供本机使用，不会自动开放给手机或公网。

5. 许可与验证
原创漫画和图像的 CC0 许可位于 dist/assets/LICENSE.txt。
原网页的存储、解压、DOM 数据流程、Service Worker 模拟测试已通过。文件版另做静态资源及启动流程检查；未做手机实机验证。
'''
(OUT/'moge-pocket-使用说明.txt').write_text(instructions)
with zipfile.ZipFile(OUT/'moge-pocket.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.write(OUT/'moge-pocket.html','moge-pocket/moge-pocket.html')
    z.writestr('moge-pocket/使用说明.txt',instructions)
    for folder in ['dist','scripts','tests']:
        for p in sorted((ROOT/folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts:z.write(p, 'moge-pocket/'+str(p.relative_to(ROOT)))
    z.write(ROOT/'README.md','moge-pocket/README.md')
with zipfile.ZipFile(OUT/'moge-pocket.zip') as z:
    assert z.testzip() is None
    assert not any('/.git/' in n or '/.openai/' in n or n.endswith('.env') for n in z.namelist())
for name in ['moge-pocket.html','moge-pocket.zip']:
    p=OUT/name
    print(name,p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())

