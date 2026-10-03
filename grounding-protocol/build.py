#!/usr/bin/env python3
"""Build The Grounding Protocol as a paged HTML book (US Letter) from the drafts, then PDF via headless Chrome.
Design: Option B "Field Manual" — paper interior, dark cover/dividers/back, site palette, Cormorant/EB Garamond/JetBrains Mono."""
import re, html, math, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).parent
DRAFTS = ["00-intro-part1.md", "01-parts-2-3.md", "02-parts-4-6.md", "03-appendix.md"]
SHIELD = "../images/vincere-shield.png"
PORTRAIT = "../images/mvw-portrait.jpeg"

# ── inline markdown ────────────────────────────────────────────────────
def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', t)
    t = t.replace('--', '&mdash;').replace(' — ', ' &mdash; ')
    t = re.sub(r"(\w)'(\w)", r'\1&rsquo;\2', t)          # apostrophes
    t = re.sub(r"'(\w)", r'&lsquo;\1', t); t = t.replace("'", '&rsquo;')
    t = re.sub(r'"(.+?)"', r'&ldquo;\1&rdquo;', t)
    t = re.sub(r'_{4,}', lambda m: '<span class="blank" style="width:%dpx"></span>' % min(260, 14*len(m.group(0))), t)
    return t

# ── parse drafts into a stream of blocks ───────────────────────────────
def parse(md):
    lines = md.split('\n'); i = 0; blocks = []; in_cites = False
    while i < len(lines):
        L = lines[i]
        if not L.strip() or L.strip() == '---': i += 1; continue
        if L.startswith('# '):
            i += 1
            if i < len(lines) and lines[i].startswith('## '): i += 1     # book subtitle (cover handles it)
            continue
        if L.startswith('## '):
            title = L[3:].strip(); sub = ''
            if i+1 < len(lines) and lines[i+1].startswith('### '): sub = lines[i+1][4:].strip(); i += 1
            m = re.match(r'(Part [IVX]+|Appendix [AB])\s*—\s*(.+)', title)
            if m: blocks.append(('divider', m.group(1), m.group(2), sub))
            else: blocks.append(('section', title, sub))
            i += 1; continue
        if L.startswith('### '):
            in_cites = L[4:].strip().lower() == 'works cited'
            blocks.append(('h3', L[4:].strip())); i += 1; continue
        if L.startswith('> '):
            q = []
            while i < len(lines) and lines[i].startswith('> '): q.append(lines[i][2:].strip()); i += 1
            blocks.append(('quote', q)); continue
        if L.startswith('- ') or L.startswith('☐'):
            items = []
            while i < len(lines) and (lines[i].startswith('- ') or lines[i].startswith('☐')):
                items.append(lines[i].lstrip('- ').lstrip('☐').strip()); i += 1
            kind = 'checks' if L.startswith('☐') else 'ul'
            blocks.append((kind, items)); continue
        if re.match(r'^\d+\. ', L):
            items = []
            while i < len(lines) and re.match(r'^\d+\. ', lines[i]): items.append(re.sub(r'^\d+\. ', '', lines[i]).strip()); i += 1
            blocks.append(('ol', items)); continue
        if L.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip('|').split('|')]
                if not all(set(c) <= set('-: ') for c in cells) and any(cells): rows.append(cells)
                i += 1
            blocks.append(('table', rows)); continue
        if re.match(r'^(Date / time|What |Ground:)', L):
            grp = []
            while i < len(lines) and re.match(r'^(Date / time|What |Ground:)', lines[i]): grp.append(lines[i].strip()); i += 1
            blocks.append(('formgroup', grp)); continue
        if re.match(r'^(Section total|\w.*___ / 25)', L) or (L.count('_') >= 8 and len(L) < 120):
            blocks.append(('form', L.strip())); i += 1; continue
        if in_cites or (re.match(r'^[A-Z][\w\-]+, [A-Z]\.', L) and '(' in L[:60]):
            blocks.append(('cite', L.strip())); i += 1; continue
        # paragraph
        para = [L.strip()]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#|>|- |\d+\. |\||☐|---)', lines[i]): para.append(lines[i].strip()); i += 1
        txt = ' '.join(para)
        blocks.append(('cite', txt) if re.match(r'^[A-Z][\w\-]+, [A-Z]\.', txt) and '(' in txt[:60] else ('p', txt))
    return blocks

# ── height estimates (px) for greedy pagination ─────────────────────────
CAP = 830          # usable body column height on a paper page
def est(b):
    k = b[0]
    if k == 'h3': return 78
    if k == 'p':
        w = len(b[1].split()); return math.ceil(w / 10.5) * 26 + 16
    if k == 'quote': return sum(math.ceil(len(l.split())/8) for l in b[1]) * 34 + 70
    if k in ('ul', 'ol'): return sum(math.ceil(len(x.split())/10) * 24 + 10 for x in b[1]) + 12
    if k == 'checks': return len(b[1]) * 30 + 10
    if k == 'table': return len(b[1]) * 46 + 20
    if k == 'form': return 36
    if k == 'cite': return math.ceil(len(b[1].split())/11) * 20 + 6
    return 0

def measure(blocks):
    """Render every block once at the real column width, read back its height (px incl. margins)."""
    items = ''.join(f'<div class="mb" data-i="{i}">{r_block(b)}</div>' for i, b in enumerate(blocks) if b[0] not in ('divider','section'))
    html_doc = f'''<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>{CSS}.page{{height:auto;overflow:visible}}.inner.grid{{height:auto}}</style></head><body><div class="book">
<div class="page" id="probe" style="height:11in;overflow:hidden"><div class="inner grid" style="height:11in"><aside class="margin"></aside><div class="col" id="probecol"><div class="foot" id="probefoot"><span>x</span><span>00</span></div></div></div></div>
<div class="page"><div class="inner grid"><aside class="margin"></aside><div class="col">{items}</div></div></div></div>
<script>window.addEventListener('load',function(){{setTimeout(function(){{var out={{}};document.querySelectorAll('.mb').forEach(function(el){{var cs=getComputedStyle(el.firstElementChild||el);var r=el.getBoundingClientRect();out[el.dataset.i]=Math.ceil(r.height+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0));}});
var probe=document.getElementById('probe');probe.style.height='11in';probe.style.overflow='hidden';var col=document.getElementById('probecol');var foot=document.getElementById('probefoot');out['__cap']=Math.floor(col.clientHeight-foot.getBoundingClientRect().height-6);
var pre=document.createElement('pre');pre.id='report';pre.textContent=JSON.stringify(out);document.body.appendChild(pre);}},1800);}});</script></body></html>'''
    mpath = ROOT / 'zz-measure.html'; mpath.write_text(html_doc)
    dom = subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless','--disable-gpu','--dump-dom','--virtual-time-budget=9000', f'file://{mpath}'], capture_output=True, text=True).stdout
    mpath.unlink(missing_ok=True)
    m = re.search(r'<pre id="report">(.*?)</pre>', dom, re.S)
    data = json.loads(html.unescape(m.group(1)))
    cap = data.pop('__cap'); heights = {int(k): v for k, v in data.items()}
    return heights, cap

def paginate(blocks):
    heights, cap = measure(blocks)
    print(f"measured {len(heights)} blocks; page capacity {cap}px")
    pages = []; cur = None; part = None; chapter = None
    def new_page(first=False):
        nonlocal cur
        cur = {'kind': 'paper', 'part': part, 'chapter': chapter, 'blocks': [], 'h': 0, 'first': first}; pages.append(cur)
    for idx, b in enumerate(blocks):
        if b[0] == 'divider':
            part = (b[1], b[2], b[3]); chapter = b[2]
            pages.append({'kind': 'dark', 'part': part}); new_page(first=True); continue
        if b[0] == 'section':
            part = ('', b[1], b[2]); chapter = b[1]; new_page(first=True); cur['blocks'].append(('h2', b[1], b[2])); cur['h'] = 0; continue
        if cur is None: new_page(True)
        if b[0] == 'p' and cur['first'] and not any(x[0] in ('p','lead') for x in cur['blocks']): b = ('lead', b[1])
        h = heights.get(idx, est(b)) if b[0] != 'lead' else int(heights.get(idx, est(b)) * 1.35)
        page_cap = cap - (150 if any(x[0]=='h2' for x in cur['blocks']) else 0)
        if cur['h'] + h > page_cap and cur['blocks']:
            # keep a heading (and the one intro line after it) with what follows
            carry = []
            tail = cur['blocks']
            if tail and tail[-1][0] == 'h3': carry = [tail.pop()]
            elif len(tail) >= 2 and tail[-2][0] == 'h3' and tail[-1][0] in ('p','lead') and b[0] in ('formgroup','table','checks','ul','ol'):
                carry = [tail.pop(-2), tail.pop()]
            new_page()
            for c in carry: cur['blocks'].append(c)
            cur['h'] = sum(heights.get(idx - len(carry) + j, 60) for j in range(len(carry)))
        cur['blocks'].append(b); cur['h'] += h
    return pages

# ── renderers ──────────────────────────────────────────────────────────
def r_block(b):
    k = b[0]
    if k == 'h2': return f'<div class="kicker">{inline(b[1])}</div><h2 class="section">{inline(b[2])}</h2><hr class="rule">' if b[2] else f'<h2 class="section">{inline(b[1])}</h2><hr class="rule">'
    if k == 'h3': return f'<h3>{inline(b[1])}</h3>'
    if k == 'p': return f'<p>{inline(b[1])}</p>'
    if k == 'quote': return '<div class="pull"><blockquote>' + '<br>'.join(inline(l) for l in b[1]) + '</blockquote></div>'
    if k == 'ul': return '<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in b[1]) + '</ul>'
    if k == 'ol': return '<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in b[1]) + '</ol>'
    if k == 'checks': return '<div class="checks">' + ''.join(f'<label><span class="box"></span>{inline(x)}</label>' for x in b[1]) + '</div>'
    if k == 'table':
        rows = b[1]
        out = '<table class="score"><thead><tr><th></th>' + ''.join(f'<th>{c}</th>' for c in rows[0][1:]) + '</tr></thead><tbody>'
        for r in rows[1:]: out += f'<tr><td>{inline(r[0])}</td>' + ''.join('<td><span class="box"></span></td>' for _ in r[1:]) + '</tr>'
        return out + '</tbody></table>'
    if k == 'form': return f'<div class="form">{inline(b[1])}</div>'
    if k == 'formgroup': return '<div class="formgroup">' + ''.join(f'<div class="form">{inline(x)}</div>' for x in b[1]) + '</div>'
    if k == 'lead': return f'<p class="lead">{inline(b[1])}</p>'
    if k == 'cite': return f'<p class="cite">{inline(b[1])}</p>'
    return ''

def r_dark(part, folio):
    label, title, sub = part
    return f'''<div class="page dark divider">
  <div class="inner">
    <div class="d-label">{inline(label)}</div>
    <h2 class="d-title">{inline(title)}</h2>
    <hr class="d-rule">
    <p class="d-sub">{inline(sub)}</p>
  </div></div>'''

def r_paper(pg, folio):
    label, title, sub = pg['part'] if pg['part'] else ('', '', '')
    margin = f'<div class="m-part">{inline(label)}<br>{inline(title)}</div>' if label else f'<div class="m-part">{inline(title)}</div>'
    note = f'<div class="m-note">{inline(sub)}</div>' if sub else ''
    body = ''.join(r_block(b) for b in pg['blocks'])
    return f'''<div class="page">
  <div class="inner grid">
    <aside class="margin">{margin}<div class="m-grow"></div>{note}</aside>
    <div class="col">{body}<div class="grow"></div>
      <div class="foot"><span>The Grounding Protocol</span><span>{folio:02d}</span></div>
    </div>
  </div></div>'''

def r_cover():
    return f'''<div class="page dark cover">
  <div class="inner">
    <img class="shield" src="{SHIELD}" alt="Vincere">
    <div class="c-os">Vincere OS</div>
    <div class="c-grow"></div>
    <div class="c-the">The</div>
    <h1 class="c-title">Grounding<br>Protocol</h1>
    <hr class="d-rule">
    <p class="c-sub">What you&rsquo;re standing on &mdash; and what to do when it won&rsquo;t hold.</p>
    <div class="c-grow2"></div>
    <div class="c-author">Matt Vincent Walker</div>
  </div></div>'''

def r_belongs():
    return '''<div class="page belongs">
  <div class="inner center">
    <div class="kicker">This protocol belongs to</div>
    <div class="name-line"></div>
    <p class="b-note">Write your name in your own hand. It&rsquo;s the first of several things in these pages you&rsquo;ll have to write down to make real.</p>
  </div></div>'''

def r_toc(entries):
    rows = ''.join(f'<div class="toc-row"><span class="toc-label">{inline(l)}</span><span class="toc-title">{inline(t)}</span><span class="toc-dots"></span><span class="toc-pg">{p:02d}</span></div>' for l, t, p in entries)
    return f'''<div class="page toc">
  <div class="inner">
    <div class="kicker">Contents</div>
    <h2 class="section">What&rsquo;s in here.</h2>
    <hr class="rule">
    <div class="toc-rows">{rows}</div>
    <div class="grow"></div>
    <p class="b-note left">Read it with a pen. Part I takes an hour. Part VI takes four minutes a day for the rest of your life.</p>
  </div></div>'''

def r_back():
    return f'''<div class="page dark back">
  <div class="inner">
    <p class="bk-line">You will never outgrow the ground you&rsquo;re standing on.</p>
    <p class="bk-sub">If your life feels fragile, it&rsquo;s not because you&rsquo;re weak. It&rsquo;s because something that cannot hold weight has been pretending to.</p>
    <div class="c-grow"></div>
    <div class="bk-author">
      <img src="{PORTRAIT}" alt="Matt Vincent Walker">
      <div><div class="c-os">Matt Vincent Walker</div><p>Husband, dad of two, coach. Nearly twenty years in pastoral ministry, then Fortune 500 sales, then systems and AI. Then the years everything broke &mdash; and the structure that rebuilt him, one brick at a time.</p></div>
    </div>
    <hr class="bk-rule">
    <div class="bk-foot"><div>One letter a week<br><span class="amber">mattvincentwalker.com</span></div><img class="shield-sm" src="{SHIELD}" alt=""></div>
    <div class="bk-vin">Vincere &middot; Latin, &ldquo;to overcome&rdquo;</div>
  </div></div>'''

CSS = '''
:root{--paper:#F5F0EA;--warm:#ECE5D9;--ink:#1C1A17;--char:#2C2C2C;--gray:#5f5950;--gray2:#8f877b;--line:#CFC7BA;--amber:#c8935a;--amber-dim:#8a6a3e;--dark:#0c0a09;
 --disp:"Cormorant Garamond",Georgia,serif;--body:"EB Garamond",Garamond,Georgia,serif;--mono:"JetBrains Mono",Menlo,monospace}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{background:#14110E;font-family:var(--body);color:var(--ink)}
@page{size:letter;margin:0}
.book{display:flex;flex-direction:column;align-items:center;gap:24px;padding:40px 0}
@media print{.book{display:block;padding:0;gap:0}}
.page{width:8.5in;height:11in;background:var(--paper);position:relative;overflow:hidden;flex:none;break-after:page;page-break-after:always;box-shadow:0 2px 24px rgba(0,0,0,.55)}
@media print{.page{box-shadow:none}}
.page.dark{background-color:var(--dark);color:#eae4d8;background-image:radial-gradient(ellipse 120% 90% at 50% 38%,rgba(64,56,46,.32) 0%,rgba(12,10,9,0) 62%),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.16'/%3E%3C/svg%3E")}
.inner{position:relative;height:100%;padding:0.75in;display:flex;flex-direction:column}
.inner.center{align-items:center;justify-content:center;text-align:center}
.inner.grid{display:grid;grid-template-columns:150px minmax(0,1fr);column-gap:36px;padding:0.75in 0.75in 0.62in}
.margin{display:flex;flex-direction:column;border-right:1px solid var(--line);padding-right:22px;font-family:var(--mono)}
.m-part{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--amber-dim);line-height:1.8}
.m-grow,.grow{flex:1}
.m-note{font-family:var(--disp);font-style:italic;font-size:16px;line-height:1.45;color:var(--gray);text-wrap:pretty}
.col{display:flex;flex-direction:column;min-width:0}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--amber-dim);margin-bottom:12px}
h2.section{font-family:var(--disp);font-weight:500;font-size:40px;line-height:1.08;color:var(--ink);text-wrap:balance}
hr.rule{width:52px;height:1px;background:var(--amber);border:0;margin:22px 0 22px}
h3{font-family:var(--disp);font-weight:600;font-size:23px;line-height:1.2;color:var(--ink);margin:22px 0 10px;text-wrap:balance}
h3:first-child{margin-top:0}
p{font-size:16px;line-height:1.62;color:var(--char);margin-bottom:14px;text-wrap:pretty}
p.lead{font-family:var(--disp);font-size:21px;line-height:1.45;color:var(--ink)}
.formgroup .form{display:flex;gap:10px;align-items:baseline}.formgroup .form .blank{flex:1;width:auto !important}
.mb{display:block}
strong{color:var(--ink);font-weight:600}
.pull{border-top:1px solid var(--amber);border-bottom:1px solid var(--amber);padding:20px 8px;margin:18px 0 22px}
.pull blockquote{font-family:var(--disp);font-style:italic;font-weight:500;font-size:22px;line-height:1.4;color:var(--ink);text-wrap:pretty}
ul,ol{margin:4px 0 16px 22px}
li{font-size:16px;line-height:1.55;color:var(--char);margin-bottom:7px;text-wrap:pretty}
.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin:6px 0 18px}
.checks label{display:flex;align-items:center;gap:12px;font-size:17px;color:var(--char)}
.box{display:inline-block;width:16px;height:16px;border:1px solid var(--ink);flex:none}
.blank{display:inline-block;border-bottom:1px solid var(--ink);height:14px;vertical-align:baseline;margin:0 2px}
table.score{width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:14.5px}
table.score th{font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--gray2);font-weight:400;padding:6px 4px;text-align:center}
table.score td{padding:9px 6px 9px 0;border-top:1px solid var(--line);color:var(--char);line-height:1.4;vertical-align:middle}
table.score td:not(:first-child){text-align:center;width:38px}
.form{font-size:15px;line-height:2.2;color:var(--char);border-bottom:1px solid var(--line);margin-bottom:8px}
p.cite{font-size:13.5px;line-height:1.45;color:var(--char);margin-bottom:6px;padding-left:18px;text-indent:-18px}
.foot{display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--gray2);padding-top:14px}
/* dark pages */
.divider .inner{align-items:center;justify-content:center;text-align:center}
.d-label{font-family:var(--mono);font-size:13px;letter-spacing:6px;text-transform:uppercase;color:var(--amber-dim)}
.d-title{font-family:var(--disp);font-weight:500;font-size:72px;line-height:1;color:#f5f1e9;margin-top:34px;text-wrap:balance}
hr.d-rule{width:56px;height:1px;background:var(--amber);border:0;margin:38px 0 28px}
.d-sub{font-family:var(--disp);font-style:italic;font-size:26px;line-height:1.4;color:#a09a90;max-width:440px;text-wrap:balance}
.cover .inner{align-items:center;text-align:center;padding:1in .75in .75in}
.shield{width:92px;height:92px;object-fit:contain;opacity:.95}
.shield-sm{width:56px;height:56px;object-fit:contain;opacity:.9}
.c-os{font-family:var(--mono);font-size:12px;letter-spacing:5px;text-transform:uppercase;color:var(--amber-dim);margin-top:22px}
.c-grow{flex:1}.c-grow2{flex:1.4}
.c-the{font-family:var(--mono);font-size:12px;letter-spacing:5px;text-transform:uppercase;color:#a09a90;margin-bottom:26px}
.c-title{font-family:var(--disp);font-weight:600;font-size:92px;line-height:.98;letter-spacing:.02em;color:#f5f1e9;text-wrap:balance}
.c-sub{font-family:var(--disp);font-style:italic;font-size:24px;line-height:1.4;color:var(--amber);max-width:480px;text-wrap:balance}
.c-author{font-family:var(--mono);font-size:12px;letter-spacing:5px;text-transform:uppercase;color:#a09a90}
.belongs .name-line{width:300px;border-bottom:1px solid var(--amber-dim);margin:70px 0 26px}
.b-note{font-family:var(--disp);font-style:italic;font-size:17px;line-height:1.5;color:var(--gray);max-width:360px;text-wrap:pretty}
.b-note.left{max-width:480px;text-align:left}
.toc-rows{margin-top:10px}
.toc-row{display:flex;align-items:baseline;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.toc-label{font-family:var(--mono);font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--amber-dim);width:120px;flex:none}
.toc-title{font-family:var(--disp);font-size:21px;color:var(--ink)}
.toc-dots{flex:1}
.toc-pg{font-family:var(--mono);font-size:12px;letter-spacing:2px;color:var(--gray2)}
.back .inner{padding:1in .75in .75in}
.bk-line{font-family:var(--disp);font-size:34px;line-height:1.3;color:#f5f1e9;max-width:560px;margin-bottom:26px;text-wrap:pretty}
.bk-sub{font-family:var(--disp);font-style:italic;font-size:22px;line-height:1.45;color:#a09a90;max-width:520px;text-wrap:pretty}
.bk-author{display:flex;gap:28px;align-items:center}
.bk-author img{width:112px;height:136px;object-fit:cover;object-position:center 15%;filter:grayscale(1) contrast(1.05)}
.bk-author p{font-size:16px;line-height:1.6;color:#d4cec4;max-width:420px;margin:8px 0 0;text-wrap:pretty}
.bk-author .c-os{margin-top:0}
hr.bk-rule{width:100%;height:1px;background:#2e2a22;border:0;margin:44px 0 28px}
.bk-foot{display:flex;justify-content:space-between;align-items:flex-end;font-family:var(--mono);font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#a09a90;line-height:1.9}
.amber{color:var(--amber)}
.bk-vin{margin-top:26px;font-family:var(--mono);font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#5a5347}
'''

def build():
    blocks = []
    for f in DRAFTS: blocks += parse((ROOT / 'draft' / f).read_text())
    pages = paginate(blocks)
    # front matter: cover, belongs, toc (toc needs folios → two passes)
    front = 3
    folio = front
    toc = []; out = []
    for pg in pages:
        folio += 1
        if pg['kind'] == 'dark':
            toc.append((pg['part'][0], pg['part'][1], folio)); out.append(r_dark(pg['part'], folio))
        else:
            if pg.get('first') and pg['part'] and not pg['part'][0]: toc.append(('', pg['part'][1], folio))
            out.append(r_paper(pg, folio))
    doc = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Grounding Protocol — Matt Vincent Walker</title>',
           '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
           '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">',
           f'<style>{CSS}</style></head><body><div class="book">', r_cover(), r_belongs(), r_toc(toc), *out, r_back(), '</div></body></html>']
    (ROOT / 'book.html').write_text('\n'.join(doc))
    print(f"pages: {len(out) + 4}  (body {sum(1 for p in pages if p['kind']=='paper')}, dark {sum(1 for p in pages if p['kind']=='dark')} + cover/belongs/toc/back)")

if __name__ == '__main__': build()
