#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.9 每日回顾：从笔记正文自动抽取「核心观点」候选，生成 highlights.json。
方案 A（自动抽取）：不通读全文，靠结构规则抓取。
  - 逐节扫描 h2 小标题，跳过导航性标题
  - 每节取第一段有实质长度的 <p> 或 <blockquote> 作为该节观点
  - 不足 3 条时，用小标题本身补位
后续人工精修时，只要在输出里对应 note 的 points 上标明 "curated": true 即可。
"""
import json, re, html, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 脚本在 scripts/ 下，数据在上级
NAV_WORDS = ['图谱导航', '目录', '时间轴', '导航', '索引', '概览', '总览', '导读', 'about', 'overview', 'contents']
MIN_LEN = 35           # 段落最小长度才算实质内容
MAX_TEXT = 150         # 卡片上展示的观点长度上限

def strip_tags(s):
    s = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', s, flags=re.S | re.I)
    s = re.sub(r'<br\s*/?>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()

def is_nav(title):
    t = title.lower()
    return any(w.lower() in t for w in NAV_WORDS)

def clip(text, limit=MAX_TEXT):
    """在句号处截断，避免卡片上出现半句话"""
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = max(head.rfind('。'), head.rfind('！'), head.rfind('？'))
    if cut >= 60:
        return head[:cut + 1]
    return head.rstrip('，、；,;') + '…'

def looks_like_legend(t):
    """过滤图表图例式的文本（如「阶段一 · 规划 阶段二 · 循环 …」），它们不是完整观点。
    只看前 150 字：有些流程图整块包在一个 <p> 里，末尾才出现句号。"""
    head = t[:150]
    return '。' not in head and head.count('·') >= 2

def section_paras(seg):
    """一节里的候选观点句：引用优先，其次段落，按文档顺序"""
    out = []
    for q in re.findall(r'<blockquote[^>]*>(.*?)</blockquote>', seg, re.S | re.I):
        t = strip_tags(q)
        if len(t) >= MIN_LEN and not looks_like_legend(t):
            out.append(t)
    for p in re.findall(r'<p[^>]*>(.*?)</p>', seg, re.S | re.I):
        t = strip_tags(p)
        if len(t) >= MIN_LEN and not looks_like_legend(t):
            out.append(t)
    return out

def extract(body):
    """按文档顺序扫描：(h2 小标题, 其后内容)。每节先取 1 条，不够再回头取第 2 条。"""
    parts = re.split(r'<(h2|h3)[^>]*>(.*?)</\1>', body, flags=re.S | re.I)
    sections = []
    preface = parts[0]
    for i in range(1, len(parts), 3):
        title = strip_tags(parts[i + 1])
        seg = parts[i + 2] if i + 2 < len(parts) else ''
        sections.append((title, seg))
    if not sections:
        sections = [('正文', body)]

    live = [(t, section_paras(s)) for t, s in sections if not (t and is_nav(t))]
    if not live:
        live = [('正文', section_paras(body))]

    points = []
    # 第一轮：每节取首条
    for title, cands in live:
        if cands:
            points.append({'text': clip(cands[0]), 'section': title or '正文'})
    # 第二轮：不够 3 条就回头取各节第 2 条
    depth = 1
    while len(points) < 3 and depth < 4:
        added = False
        for title, cands in live:
            if len(cands) > depth:
                points.append({'text': clip(cands[depth]), 'section': title or '正文'})
                added = True
                if len(points) >= 3:
                    break
        if not added:
            break
        depth += 1
    return points[:3]

def heading_fallback(body, have_sections):
    """抽不满时，用「本身就是一句话」的小标题补位。
    裸标签（如「核心问题」「图谱导航」）不算观点，要求标题足够长。"""
    out = []
    for m in re.findall(r'<h2[^>]*>(.*?)</h2>', body, re.S | re.I):
        t = strip_tags(m)
        if not t or is_nav(t) or t in have_sections:
            continue
        # 「论点三：XXX」这类带冒号的，或长度够长的，才当作观点
        if '：' in t or ':' in t or len(t) >= 8:
            out.append({'text': clip(t), 'section': '章节主旨'})
    return out

def main():
    notes_meta = json.load(open(os.path.join(ROOT, 'notes.json'), encoding='utf-8'))
    # 人工精修覆盖（方案 C 的增量通道）：id -> points，key 存在时以人工版为准
    curated_path = os.path.join(ROOT, 'scripts', 'curated.json')
    curated = {}
    if os.path.exists(curated_path):
        curated = json.load(open(curated_path, encoding='utf-8'))

    out, miss = [], []
    for n in notes_meta:
        nid, path = n['id'], n.get('file', '')
        full = os.path.join(ROOT, path)
        if not path or not os.path.exists(full):
            miss.append((nid, n['title'], 'no file'))
            continue
        if nid in curated and curated[nid]:
            out.append({'id': nid, 'curated': True, 'points': curated[nid]})
            continue
        raw = open(full, encoding='utf-8').read()
        body = raw.split('</style>', 1)[-1]
        pts = extract(body)
        if len(pts) < 3:
            have = {p['section'] for p in pts}
            for c in heading_fallback(body, have):
                pts.append(c)
                if len(pts) >= 3:
                    break
        if not pts:
            miss.append((nid, n['title'], 'no points'))
        out.append({'id': nid, 'points': pts[:3]})

    dest = os.path.join(ROOT, 'highlights.json')
    json.dump(out, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(len(o['points']) for o in out)
    thin = [o['id'] for o in out if len(o['points']) < 3]
    print(f'已生成 highlights.json：{len(out)} 本 / {total} 条观点（人工精修 {len([o for o in out if o.get("curated")])} 本）')
    print(f'不足 3 条的：{len(thin)} 本 {thin}')
    if miss:
        print('⚠️ 未抽到内容的：')
        for m in miss:
            print('   ', m)
    print('\n--- 抽检 ---')
    picks = out[:3] + out[-4:] + [o for o in out if len(o['points']) < 3][:3]
    seen = set()
    for o in picks:
        if o['id'] in seen:
            continue
        seen.add(o['id'])
        title = next((n['title'] for n in notes_meta if n['id'] == o['id']), '?')
        tag = ' [人工]' if o.get('curated') else ''
        print(f'\n{title}{tag}  (id={o["id"]}, {len(o["points"])} 条)')
        for p in o['points']:
            print(f'   [{p["section"]}] {p["text"][:78]}')

if __name__ == '__main__':
    main()

