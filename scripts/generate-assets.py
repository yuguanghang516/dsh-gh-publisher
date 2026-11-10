"""Generate the entirely original, CC0 Moge sample comics and CBZ editions."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import zipfile
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
INK = '#222821'
PAPER = '#f6f1e6'

BOOKS = [
    dict(id='moon-post', title='月球邮差', en='THE MOON POST', accent='#9eafc3', tags=['治愈','科幻'], desc='月球上最后一个邮差，收到一封寄给地球的信。', chapter='一封没有地址的信',
         lines=[('这里是月球邮局。', '今天，也有人在等一封信。', '邮戳上只有一颗小小的蓝星。'), ('地址写着：所有想家的人。', '这封信，要怎么送呢？', '邮差想了想，把邮票贴在了窗上。'), ('月光照进地球的每一扇窗。', '原来，想念也有自己的路线。', '今晚的月亮，是一封已经送达的信。')]),
    dict(id='forest-radio', title='森林电台', en='FOREST FREQUENCY', accent='#a6b69c', tags=['日常','治愈'], desc='每天黄昏，树洞里都会传出一段不一样的声音。', chapter='调频到春天',
         lines=[('滋——这里是森林电台。', '今天的听众，有谁呢？', '一只松鼠，带来了一枚松果。'), ('我想点播一场小雨。', '好呀，送给正在发芽的种子。', '电台里响起了叶子轻轻摩擦的声音。'), ('不用说话，也会有人听见。', '原来每一片树叶，都是天线。', '晚安。明天，我们还是这个频率。')]),
    dict(id='last-tram', title='末班电车', en='THE LAST TRAM', accent='#c59b80', tags=['都市','短篇'], desc='过了午夜，电车会停在地图上找不到的那一站。', chapter='下一站，明天',
         lines=[('这是今晚最后一班车。', '你要到哪一站？', '我还没有想好。'), ('没有关系，可以慢慢想。', '车窗外，熟悉的路灯一盏盏经过。', '那些来不及说的话，渐渐变得很轻。'), ('下一站：明天。', '谢谢，我就在这里下车。', '天色亮了。新的故事，也刚刚开始。')]),
    dict(id='ocean-note', title='海边手记', en='NOTES BY THE SEA', accent='#8cabb4', tags=['旅行','日常'], desc='一本被海风吹开的手账，记下那些慢下来的日子。', chapter='浪花的回信',
         lines=[('今天，我写了一封信给海。', '你每天都在忙什么呢？', '一朵浪花，轻轻把信收走了。'), ('我在把远方，送到你的脚边。', '贝壳里藏着很轻很轻的回答。', '今天的手记：有些回信，需要用耳朵读。')]),
    dict(id='cloud-garden', title='云上花园', en='A GARDEN ABOVE', accent='#b8a6b8', tags=['奇幻','治愈'], desc='在云层之上的小小温室里，收集每一种天气。', chapter='种下一场晴天',
         lines=[('一颗晴天的种子，应该种在哪里？', '园丁把它放进了一朵柔软的云。', '每天，给它浇一点点耐心。'), ('今天，云上开出了一朵太阳花。', '把这束光，送给阴天的你。', '天气预报：明天，有一些小小的希望。')]),
    dict(id='cat-weekend', title='猫的周末', en='SLOW CAT WEEKEND', accent='#c9aa7b', tags=['猫咪','日常'], desc='一只猫的周末计划：晒太阳，以及什么也不做。', chapter='今天先不忙',
         lines=[('周末计划第一项：伸个懒腰。', '第二项：找一块最好的阳光。', '第三项……先睡一会儿。'), ('下午三点，阳光悄悄挪了一个位置。', '跟着阳光，就算一次小小的旅行。', '今天很忙，忙着认真地休息。')]),
]

def shape(name, **attrs):
    return '<'+name+' '+' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())+'/>'

def text(x,y,s,size=25,fill=INK,weight=500,**attrs):
    extras=' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}" {extras}>{escape(s)}</text>'

def scene(kind, phase=0):
    """Art lives in a 600x560 viewbox, drawn with simple inked forms."""
    s=[]
    def rect(x,y,w,h,fill,rx=0,stroke=INK,sw=3):
        s.append(shape('rect',x=x,y=y,width=w,height=h,rx=rx,fill=fill,stroke=stroke,stroke_width=sw))
    def ellipse(cx,cy,rx,ry,fill,stroke=INK,sw=3):
        s.append(shape('ellipse',cx=cx,cy=cy,rx=rx,ry=ry,fill=fill,stroke=stroke,stroke_width=sw))
    def circle(cx,cy,r,fill,stroke=INK,sw=3): ellipse(cx,cy,r,r,fill,stroke,sw)
    def line(x1,y1,x2,y2,stroke=INK,sw=3):
        s.append(shape('line',x1=x1,y1=y1,x2=x2,y2=y2,stroke=stroke,stroke_width=sw,stroke_linecap='round'))
    def path(d,fill='none',stroke=INK,sw=3):
        s.append(shape('path',d=d,fill=fill,stroke=stroke,stroke_width=sw,stroke_linecap='round',stroke_linejoin='round'))
    if kind == 'moon-post':
        circle(304,265,218,'#acbbca',sw=0)
        circle(164,190,26,'#99aabe',sw=0); circle(420,264,43,'#99aabe',sw=0)
        circle(356,114,14,'#99aabe',sw=0); ellipse(250,440,258,83,'#e7e3d7')
        ellipse(410,443,38,12,'#d0ccbf',sw=0); ellipse(118,429,23,8,'#d0ccbf',sw=0)
        for x,y in [(48,95),(540,106),(506,440),(110,60),(530,204)]:
            line(x-7,y,x+7,y); line(x,y-7,x,y+7)
        # Mailbox and flag.
        line(408,334,408,441,sw=9); rect(354,256,116,86,'#b76b54',rx=26)
        rect(355,294,115,49,'#b76b54',rx=3); line(367,306,431,306)
        line(454,264,454,231); path('M454 232h37v23h-37z','#d5aa6e')
        # A compact astronaut mail carrier.
        line(246,361,228,426,sw=17); line(281,361,291,427,sw=17)
        rect(224,286,75,90,'#f6f1e6',rx=22); circle(260,245,48,'#f6f1e6')
        ellipse(264,244,31,27,'#344a5f'); path('M252 229q12-9 21-3',stroke='#d4e0e8',sw=4)
        path('M225 307q-29 18-42 35',sw=14); path('M296 306q25-5 40-22',sw=14)
        rect(198,304,36,49,'#c19a69',rx=4); line(231,285,285,361,sw=4)
        rect(320,264,44,32,'#f7f0dc',rx=2); path('M321 265l21 16 20-15')
        if phase%2: path('M488 70q21-17 38 3q-16 20-38-3z','#d8ad69')
    elif kind == 'forest-radio':
        circle(300,258,226,'#a7b79d',sw=0)
        for x,y,sz in [(93,166,1),(456,156,1.2),(495,320,.7),(79,341,.6)]:
            path(f'M{x} {y+170*sz}v{-180*sz}',sw=7)
            for dy,rx in [(0,50),(48,68),(100,84)]:
                path(f'M{x} {y+dy*sz-50*sz}l{-rx*sz} {100*sz}h{rx*2*sz}z','#708f74',sw=2)
        ellipse(295,470,242,36,'#dfe2ce',sw=0)
        rect(204,153,153,321,'#bd9b73',rx=56)
        path('M228 182q-23 114 6 238M329 198q-22 121-1 226',stroke='#8d7459',sw=3)
        ellipse(283,299,58,78,'#3e4d3c'); rect(241,284,88,62,'#d2b276',rx=8)
        circle(263,313,12,'#4f6250'); line(287,300,313,300); line(287,311,313,311); line(287,322,308,322)
        line(312,284,335,246); circle(337,244,4,'#d2b276')
        # A small bird and squirrel are the audience.
        ellipse(418,425,30,31,'#e0b96b'); circle(432,398,22,'#e0b96b')
        path('M450 398l18 8-20 5z','#d27c52'); circle(438,395,3,INK,sw=0)
        line(416,452,412,469); line(430,450,431,468)
        path('M164 446q-51-58-61-15q-11 39 32 29','#b87958',sw=4)
        ellipse(155,445,24,29,'#b87958'); circle(163,412,23,'#b87958')
        path('M149 395l-5-20 19 14M167 391l13-16 2 26','#b87958')
        circle(171,411,3,INK,sw=0); circle(184,424,8,'#d3ac70')
        if phase%2: path('M354 266q17 13 0 28M367 258q28 22 0 45',sw=3)
    elif kind == 'last-tram':
        circle(300,264,222,'#d2b397',sw=0)
        rect(60,264,75,190,'#b0b2a0',rx=2,sw=0); rect(474,218,64,238,'#b0b2a0',sw=0)
        rect(113,208,72,235,'#c2c3ae',sw=0); rect(424,292,73,155,'#c2c3ae',sw=0)
        path('M44 505L555 505M64 526L536 526',sw=4)
        path('M298 85v57M269 93h58',sw=3)
        path('M260 168l41-43 44 43',sw=4)
        rect(168,166,264,305,'#ad6551',rx=48)
        rect(192,201,216,140,'#f0e6cd',rx=20)
        rect(203,214,91,111,'#a4bac1',rx=10); rect(306,214,91,111,'#a4bac1',rx=10)
        line(212,244,237,217,stroke='#d8e4e3',sw=9); line(325,253,352,222,stroke='#d8e4e3',sw=9)
        rect(254,174,96,23,'#323c34',rx=4); s.append(text(302,191,'00:12',14,'#eee7d5',700,text_anchor='middle'))
        circle(213,385,20,'#f2d08c'); circle(385,385,20,'#f2d08c')
        rect(247,406,110,26,'#e4c7a1',rx=4); s.append(text(301,425,'末 班',16,INK,700,text_anchor='middle'))
        circle(205,475,18,'#353c35'); circle(395,475,18,'#353c35')
        for x,y in [(101,85),(423,87),(489,162),(70,209),(464,375)]:line(x,y,x-12,y+29,stroke='#7d8d89',sw=2)
        if phase%2: circle(504,91,29,'#e5cc8d',sw=0)
    elif kind == 'ocean-note':
        circle(300,263,221,'#aec7c8',sw=0); circle(407,132,47,'#dbb578',sw=0)
        path('M56 332q85-38 164 0t163 0 162 0v112H56z','#79a6b1',sw=0)
        for y in [362,408,449]:path(f'M56 {y}q55-20 108 0t108 0 108 0 108 0',stroke='#edf0dd',sw=3)
        path('M166 289h255l-45 59H207z','#bf815c'); path('M292 137v153',sw=6)
        path('M281 149v128H189z','#f7efd9'); path('M306 170v107h96z','#dac7a2')
        path('M89 475q141-39 302-7t140 25v49H66z','#dfcfac',sw=0)
        rect(206,417,112,106,'#f5efde',rx=3); path('M220 440h72M220 458h60M220 477h67',stroke='#93a8a4')
        path('M339 488q1-35 34-33q36 3 11 36z','#c38d73'); path('M349 486l21-25M361 487l16-24',sw=2)
        path('M103 183q15-16 31 0q15-16 30 0',sw=3)
    elif kind == 'cloud-garden':
        circle(300,264,222,'#bbafc4',sw=0)
        for x,y in [(121,393),(417,404),(244,430)]:
            circle(x,y,62,'#f3eee2',sw=0); circle(x+51,y-23,69,'#f3eee2',sw=0); circle(x+103,y,51,'#f3eee2',sw=0)
        path('M163 382V205l141-104 140 104v177z','#d8ddd0')
        path('M163 205h281M304 102v280M231 156v226M374 155v227M164 293h279',sw=4)
        path('M185 366h235',sw=9)
        for x,y,c in [(215,311,'#d0ac71'),(302,302,'#ba785e'),(387,309,'#d8b983')]:
            path(f'M{x} 348v-68',stroke='#687e62',sw=5)
            path(f'M{x} 326q-32-30-36-5q14 18 36 5M{x} 307q30-28 33-5q-13 19-33 5','#90a37d',sw=2)
            for dx,dy in [(-11,-10),(10,-10),(-13,10),(12,10)]:circle(x+dx,y-48+dy,13,c,sw=1)
            circle(x,y-48,10,'#785b43',sw=1)
            path(f'M{x-24} 344h48l-7 29h-34z','#c6a27c')
        circle(470,120,27,'#e3c483',sw=0)
        for x,y in [(87,147),(477,315),(129,478)]:path(f'M{x-6} {y}h12M{x} {y-6}v12',stroke='#eee8db')
    elif kind == 'cat-weekend':
        circle(300,266,222,'#d9c19a',sw=0)
        rect(151,104,300,317,'#ece6d2',rx=112)
        path('M173 391V230q0-105 126-105t128 105v161z','#a9bdc0')
        line(300,125,300,392,sw=9); line(174,264,426,264,sw=9)
        circle(376,195,29,'#edce88',sw=0)
        rect(110,393,381,29,'#8f9c87',rx=4)
        path('M123 494q41-56 168-59t193 59','#e7d5af',sw=0)
        # Curled cat on the windowsill.
        ellipse(302,364,86,41,'#bb8658')
        path('M231 354q-7-53 4-66l26 21 32-14 12 40','#bb8658')
        ellipse(262,344,43,39,'#bb8658')
        path('M238 342q8 8 15 0M271 342q8 8 15 0',sw=3)
        path('M259 353l7 0-4 5z',INK,sw=1); path('M257 361q6 6 12 0',sw=2)
        path('M370 369q65-58 56-14q-4 21-47 24','#bb8658',sw=8)
        path('M326 335l-8 15M345 340l-8 15',stroke='#7e593d',sw=4)
        s.append(text(368,285,'z',29,INK,500)); s.append(text(397,256,'z',21,INK,500))
    return ''.join(s)

def svg(content,w=600,h=840):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img"><style>text{{font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif}}</style>{content}</svg>'

def cover(b,i):
    s=shape('rect',width=600,height=840,fill=PAPER)
    s+=text(38,48,f'MOGE ORIGINAL  /  {i+1:02}',14,weight=700,letter_spacing=3)
    s+=text(38,120,b['title'],59,weight=800,letter_spacing=2)
    s+=text(41,154,b['en'],13,weight=500,letter_spacing=3)
    s+=f'<g transform="translate(0 174)">{scene(b["id"])}</g>'
    s+=shape('line',x1=40,y1=757,x2=560,y2=757,stroke=INK,stroke_width=1)
    s+=text(40,791,b['chapter'],19,weight=600)
    s+=text(40,819,'墨格创作组  ·  原创短篇',13,fill='#73786d')
    s+=text(558,812,'01',35,weight=400,text_anchor='end')
    return svg(s)

def page(b,p,lines):
    s=shape('rect',width=720,height=1080,fill=PAPER)
    s+=text(40,43,b['title'],22,weight=700)
    s+=text(680,42,f'01 / {p+1:02}',15,fill='#687065',text_anchor='end')
    # One large cinematic panel and two smaller narrative beats.
    s+=shape('rect',x=34,y=68,width=652,height=598,rx=2,fill=b['accent'],stroke=INK,stroke_width=3)
    s+=f'<g transform="translate(69 91) scale(.97)">{scene(b["id"],p)}</g>'
    # Cream caption set directly into each panel, avoiding text over art.
    s+=shape('rect',x=52,y=86,width=616,height=53,rx=2,fill=PAPER,stroke=INK,stroke_width=2)
    s+=text(72,120,lines[0],24,weight=600)
    s+=shape('rect',x=34,y=686,width=318,height=290,fill='#ebe5d7',stroke=INK,stroke_width=3)
    s+=shape('rect',x=370,y=686,width=316,height=290,fill=b['accent'],stroke=INK,stroke_width=3)
    # Details from the full scene are cropped to give the panels a new framing.
    clip_a=f'a-{b["id"]}-{p}'
    clip_b=f'b-{b["id"]}-{p}'
    s+=f'<defs><clipPath id="{clip_a}"><rect x="36" y="688" width="314" height="286"/></clipPath><clipPath id="{clip_b}"><rect x="372" y="688" width="312" height="286"/></clipPath></defs>'
    s+=f'<g clip-path="url(#{clip_a})"><g transform="translate(-45 620) scale(.72)">{scene(b["id"],p+1)}</g></g>'
    s+=f'<g clip-path="url(#{clip_b})"><g transform="translate(295 613) scale(.72)">{scene(b["id"],p+2)}</g></g>'
    # Narration under each frame remains readable on a mobile screen.
    s+=shape('rect',x=35,y=905,width=316,height=69,fill=PAPER,stroke='none')
    s+=shape('rect',x=371,y=905,width=314,height=69,fill=PAPER,stroke='none')
    def wrap(t,max_chars=13):return [t[i:i+max_chars] for i in range(0,len(t),max_chars)]
    for x,t in [(49,lines[1]),(385,lines[2])]:
        for j,line in enumerate(wrap(t)):
            s+=text(x,932+j*25,line,20,weight=500)
    s+=text(40,1027,'MOGE ORIGINAL · 原创示例',13,fill='#73786d',letter_spacing=1)
    s+=text(681,1027,f'{p+1}',17,text_anchor='end')
    return svg(s,720,1080)

catalog={'version':1,'source':{'id':'moge-original','name':'墨格原创示例','description':'用于体验阅读、下载与追更流程的原创内容；所有示例均由墨格创作组原创，采用 CC0 许可。'},'books':[]}
for i,b in enumerate(BOOKS):
    d=DIST/'assets'/b['id']; d.mkdir(parents=True,exist_ok=True)
    (d/'cover.svg').write_text(cover(b,i),encoding='utf-8')
    pages=[]
    for p,lines in enumerate(b['lines']):
        name=f'{p+1:02}.svg'; (d/name).write_text(page(b,p,lines),encoding='utf-8'); pages.append(f'/assets/{b["id"]}/{name}')
        subprocess.run(['inkscape',str(d/name),'--export-type=png',f'--export-filename={d / (Path(name).stem + ".png")}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    info=f'<?xml version="1.0" encoding="UTF-8"?><ComicInfo><Title>{escape(b["title"])}</Title><Series>{escape(b["title"])}</Series><Number>1</Number><Writer>墨格创作组</Writer><Summary>{escape(b["desc"])}</Summary><PageCount>{len(pages)}</PageCount><LanguageISO>zh</LanguageISO><Notes>Original demo comic; CC0 1.0 Universal.</Notes></ComicInfo>'
    with zipfile.ZipFile(d/'01.cbz','w',compression=zipfile.ZIP_DEFLATED) as z:
        for p in pages:
            png=(DIST/p.lstrip('/')).with_suffix('.png')
            z.write(png,png.name)
        z.writestr('ComicInfo.xml',info)
    catalog['books'].append({'id':b['id'],'title':b['title'],'author':'墨格创作组','description':b['desc'],'tags':b['tags'],'accent':b['accent'],'cover':f'/assets/{b["id"]}/cover.svg','license':'CC0-1.0','chapters':[{'id':'01','title':f'第1话 {b["chapter"]}','publishedAt':f'2026-11-{6-i:02}','pages':pages,'download':f'/assets/{b["id"]}/01.cbz'}]})
(DIST/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(DIST/'assets'/'LICENSE.txt').write_text('Moge Original Sample Comics\nAll illustrations, scripts, and comic pages in these original demo works are released under CC0 1.0 Universal.\nYou may copy, download, modify, and redistribute them.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n')
print(f'Generated {len(BOOKS)} covers, {sum(len(b["lines"]) for b in BOOKS)} pages, and {len(BOOKS)} CBZ archives.')
