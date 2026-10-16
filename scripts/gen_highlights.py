#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.9.1 每日回顾：从笔记正文抽取「完整观点」，生成 highlights.json。

与 v8.9 的区别（用户反馈「不能是笔记中随意切一段话，得是一个完整的观点」）：
  - 观点 = 【小节标题】+【该小节里最像论点的完整段落】两条一起给出，
    卡片上先读标题再读正文，才是一个立得住的观点；不是光秃秃一段摘录。
  - 段落必须含句号（是完整句，不是列表碎片、图例、半句话）。
  - 打分挑选：长度适中、有实质判断的优先；「这一章的任务是…」这类
    讲章节安排本身的元叙述降权。
  - 截断只截在句末，绝不出现半句话。

人工精修通道不变：scripts/curated.json 里 id -> points，存在时以人工版为准。
"""
import json, re, html, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 脚本在 scripts/ 下，数据在上级
NAV_WORDS = ['图谱导航', '目录', '时间轴', '导航', '索引', '概览', '总览', '导读',
             'about', 'overview', 'contents', '延伸阅读']
MIN_LEN = 30           # 段落最小长度
MAX_TEXT = 185         # 卡片上观点的目标长度（会在句末收口）

def strip_tags(s):
    s = re.sub(r'<(script|style|svg)[^>]*>.*?</\1>', '', s, flags=re.S | re.I)
    s = re.sub(r'<br\s*/?>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()

def is_nav(title):
    t = title.lower()
    return any(w.lower() in t for w in NAV_WORDS)

def norm_title(t):
    """「正文」「导读」这类占位标题不展示，卡片上只留观点本身"""
    t = (t or '').strip()
    return '' if t in ('正文', '导读', '节选') else t

def looks_like_legend(t):
    """图像/流程图图例式文本（如「阶段一 · 规划 阶段二 · 循环 …」）不是观点。
    只看前 150 字：有些流程图整块包在一个 <p> 里，末尾才出现句号。"""
    head = t[:150]
    return '。' not in head and head.count('·') >= 2

META_HEAD = re.compile(r'^(第[一二三四五六七八九十\d]+(章|节|部分)|这一章|本章|本节|上一章|上章|接下来|下面)')
def is_meta(t):
    """讲「这一章要讲什么」的元叙述，不是观点本身"""
    head = t[:26]
    if META_HEAD.match(head):
        return True
    return any(w in head for w in ['全书最关键', '本章的', '这一章的任务', '这是全书', '也是全书'])

def has_sentence(t):
    return ('。' in t) or t.startswith('"') or t.startswith('“')

def finish(text):
    """卡片上要读成一个完整的观点，结尾必须有句末标点"""
    t = text.strip()
    if not t:
        return t
    if t[-1] in '。！？…”』」）)':
        return t
    return t + '。'

def clip(text, limit=MAX_TEXT):
    """只在句末截断，保证卡片上不出现半句话"""
    if len(text) <= limit:
        return finish(text)
    head = text[:limit]
    cut = max(head.rfind('。'), head.rfind('！'), head.rfind('？'))
    if cut >= 45:
        return head[:cut + 1]
    head2 = text[:int(limit * 1.4)]          # 第一句特别长时放宽一次
    cut2 = max(head2.rfind('。'), head2.rfind('！'), head2.rfind('？'))
    if cut2 >= 45:
        return head2[:cut2 + 1]
    return finish(text[:limit].rstrip('，、；,;'))

def score(t, idx):
    s = 0.0
    L = len(t)
    if 60 <= L <= 240: s += 3          # 有展开、又不是一坨
    elif 40 <= L < 60: s += 2
    elif L < 40:       s += 1
    else:              s -= 1
    if t.startswith('"') or t.startswith('“'): s += 2   # 引用
    if is_meta(t):        s -= 5
    if looks_like_legend(t): s -= 6
    if not has_sentence(t):  s -= 6
    if t.count('：') >= 3:   s -= 2      # 列表拼贴
    s -= idx * 0.6                       # 同节里越靠前的段落越像主旨
    return s

def section_candidates(seg):
    """一节里的候选观点句：引用优先，其次段落/列表/表格，按文档顺序"""
    out = []
    for q in re.findall(r'<blockquote[^>]*>(.*?)</blockquote>', seg, re.S | re.I):
        t = strip_tags(q)
        if len(t) >= MIN_LEN and not looks_like_legend(t):
            out.append(t)
    for p in re.findall(r'<p[^>]*>(.*?)</p>', seg, re.S | re.I):
        t = strip_tags(p)
        if len(t) >= MIN_LEN and not looks_like_legend(t):
            out.append(t)
    for p in re.findall(r'<li[^>]*>(.*?)</li>', seg, re.S | re.I):
        t = strip_tags(p)
        if len(t) >= MIN_LEN and not looks_like_legend(t) and has_sentence(t):
            out.append(t)
    for p in re.findall(r'<td[^>]*>(.*?)</td>', seg, re.S | re.I):
        t = strip_tags(p)
        if len(t) >= MIN_LEN and not looks_like_legend(t) and has_sentence(t):
            out.append(t)
    return out

def parse_sections(body):
    """把正文切成 (标题, 内容片段) 列表；有前言就用『导读』兜住"""
    parts = re.split(r'<(h2|h3)[^>]*>(.*?)</\1>', body, flags=re.S | re.I)
    sections = []
    preface = parts[0]
    for i in range(1, len(parts), 3):
        title = strip_tags(parts[i + 1])
        seg = parts[i + 2] if i + 2 < len(parts) else ''
        sections.append((title, seg))
    return preface, sections

def extract(body):
    """每节选一条最能立住的观点，输出 {title, text}"""
    preface, sections = parse_sections(body)
    if not sections:
        sections = [('正文', body)]

    live = [(t, section_candidates(s)) for t, s in sections if not (t and is_nav(t))]
    live = [(t or '正文', c) for t, c in live if c]
    if not live:                                   # 完全没有可切的小节
        pre_c = section_candidates(preface) or section_candidates(body)
        live = [('正文', pre_c)]

    def pick(title, cands, used):
        best = None
        for idx, c in enumerate(cands[:8]):
            sc = score(c, idx)
            if best is None or sc > best[0]:
                best = (sc, c)
        if best and best[0] > 0 and best[1][:20] not in used:
            return best[1]
        return None

    points, used = [], set()
    # 第一轮：每节一条，按内容量排序取最扎实的三节
    ranked = []
    for title, cands in live:
        c = pick(title, cands, used)
        if c:
            ranked.append((score(c, 0), title, c))
    ranked.sort(key=lambda x: -x[0])
    for _, title, c in ranked[:3]:
        points.append({'title': norm_title(title), 'text': clip(c)})
        used.add(c[:20])

    # 第二轮：不满 3 条时，从还有料的小节里再补（优先用没出现过的小节名）
    depth = 1
    while len(points) < 3 and depth < 5:
        added = False
        have = {p['title'] for p in points}
        pool = [(t, cands[depth]) for t, cands in live if len(cands) > depth]
        pool.sort(key=lambda x: 0 if norm_title(x[0]) not in have else 1)
        for title, c in pool:
            if has_sentence(c) and c[:20] not in used and not is_meta(c):
                points.append({'title': norm_title(title), 'text': clip(c)})
                used.add(c[:20])
                added = True
                if len(points) >= 3:
                    break
        if not added:
            break
        depth += 1

    # 第三轮：前言里的实质段落（标题留空）
    if len(points) < 3:
        for c in section_candidates(preface):
            if has_sentence(c) and c[:20] not in used and not is_meta(c):
                points.append({'title': '', 'text': clip(c)})
                used.add(c[:20])
                if len(points) >= 3:
                    break
    return points[:3]

def main():
    notes_meta = json.load(open(os.path.join(ROOT, 'notes.json'), encoding='utf-8'))
    curated_path = os.path.join(ROOT, 'scripts', 'curated.json')
    curated = {}
    if os.path.exists(curated_path):
        curated = json.load(open(curated_path, encoding='utf-8'))

    out, miss, thin = [], [], []
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
            thin.append((nid, n['title'], len(pts)))
        if not pts:
            miss.append((nid, n['title'], 'no points'))
        out.append({'id': nid, 'points': pts})

    dest = os.path.join(ROOT, 'highlights.json')
    json.dump(out, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    total = sum(len(o['points']) for o in out)
    print(f'已生成 highlights.json：{len(out)} 本 / {total} 条观点'
          f'（人工精修 {len([o for o in out if o.get("curated")])} 本）')
    print(f'不足 3 条的：{len(thin)} 本')
    for t in thin:
        print('   ', t)
    if miss:
        print('⚠️ 未抽到内容的：')
        for m in miss:
            print('   ', m)

    print('\n--- 抽检（前 3 本 + 后 3 本 + 偏薄的）---')
    picks = out[:3] + out[-3:] + [o for o in out if len(o['points']) < 3][:3]
    seen = set()
    for o in picks:
        if o['id'] in seen:
            continue
        seen.add(o['id'])
        title = next((n['title'] for n in notes_meta if n['id'] == o['id']), '?')
        tag = ' [人工]' if o.get('curated') else ''
        print(f'\n{title}{tag}  (id={o["id"]}, {len(o["points"])} 条)')
        for p in o['points']:
            print(f'   《{p.get("title", "?")}》')
            print(f'     {p["text"]}')

if __name__ == '__main__':
    main()
