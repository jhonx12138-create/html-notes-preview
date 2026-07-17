#!/usr/bin/env python3
"""批量导入桌面 HTML 笔记到 APP"""

import os, shutil, json, re
from pathlib import Path
from datetime import datetime

BASE = Path("/Users/xuezhiyong/WorkBuddy/2026-07-14-22-17-09/html-preview-app")
NOTES_DIR = BASE / "notes"
DESKTOP_AI = Path("/Users/xuezhiyong/Desktop/AI相关")

# 清空并重建 notes 目录
if NOTES_DIR.exists():
    shutil.rmtree(NOTES_DIR)
NOTES_DIR.mkdir()

notes_list = []
note_id = 0

def clean_name(name):
    """清理文件名作为标题"""
    name = name.replace(".html", "").replace(".htm", "")
    # 去掉路径前缀
    name = name.replace("_", " ").replace("--", " — ")
    name = re.sub(r'\s+', ' ', name).strip()
    return name if name else "未命名笔记"

def cat_by_name(name):
    """根据文件名和路径判断分类"""
    n = name.lower()
    if any(k in n for k in ["哲学", "心智", "贝叶斯", "科学革命", "因果关系", "心智理论"]):
        return "哲学"
    if any(k in n for k in ["历史", "以日为鉴", "文明", "历代经济", "国家治理", "资产负债表"]):
        return "历史"
    if any(k in n for k in ["文学", "读书"]):
        return "文学"
    if any(k in n for k in ["芯片", "具身", "数学", "进化", "量子", "ai", "agent", "transformer", "模型", "世界模型", "html", "css", "js", "代码", "前端", "编辑器", "ppt", "架构", "组织行为", "管理幅度"]):
        return "科技"
    return "其他"

def tags_by_name(name, filepath):
    """根据内容和路径判断标签"""
    tags = []
    n, fp = name.lower(), str(filepath).lower()
    
    if any(k in n for k in ["ai", "agent", "transformer", "模型", "世界模型", "人工智能", "通用人工智能"]):
        tags.append("AI")
    if "agent" in n:
        tags.append("Agent")
    if "transformer" in n:
        tags.append("Transformer")
    if "世界模型" in n:
        tags.append("世界模型")
    if any(k in n for k in ["html", "css", "js", "代码", "前端"]):
        tags.append("前端")
    if "css" in n:
        tags.append("CSS")
    if "js" in n or "javascript" in n:
        tags.append("JavaScript")
    if "html" in n:
        tags.append("HTML")
    if "经济学" in n or "金融" in n:
        tags.append("经济学")
    if "组织行为" in fp:
        tags.append("组织管理")
    if "社会学" in n:
        tags.append("社会学")
    if "进化" in n:
        tags.append("生物学")
    if "数学" in n:
        tags.append("数学")
    if "芯片" in n:
        tags.append("半导体")
    if "知识图谱" in n:
        tags.append("知识图谱")
    if "费曼" in n:
        tags.append("学习方法")
    if "架构" in n:
        tags.append("架构")
    
    return tags[:4]  # 最多4个标签

def get_date(filepath):
    """从文件修改时间获取日期"""
    ts = os.path.getmtime(filepath)
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")

# 处理三个来源
sources = [
    (DESKTOP_AI / "读书笔记类", "读书笔记"),
    (DESKTOP_AI / "知识体系梳理类", "知识体系"),
    (DESKTOP_AI / "AI内容相关类——HTML", "AI内容"),
]

for src_dir, source_name in sources:
    if not src_dir.exists():
        print(f"  ⚠️ 目录不存在: {src_dir}")
        continue
    
    for html_file in sorted(src_dir.rglob("*.html")):
        # 跳过_开头的隐藏文件
        if html_file.name.startswith("._"):
            continue
        
        note_id += 1
        nid = str(note_id)
        
        # 提取标题
        rel_path = html_file.relative_to(src_dir)
        title = clean_name(str(rel_path.with_suffix("")))
        if "/" in title:
            parts = title.rsplit("/", 1)
            title = parts[-1] if len(parts) > 1 else title
        
        # 分类和标签
        cat = cat_by_name(title)
        tags = tags_by_name(title, rel_path)
        # 如果没匹配到标签，给个默认
        if not tags:
            if cat == "科技": tags = ["AI"] if source_name == "AI内容" else ["知识"]
            elif cat == "历史": tags = ["历史"]
            elif cat == "哲学": tags = ["哲学"]
            else: tags = ["笔记"]
        
        date = get_date(html_file)
        
        # 复制文件
        safe_name = f"note{nid}.html"
        dest = NOTES_DIR / safe_name
        shutil.copy2(html_file, dest)
        
        # 添加条目
        entry = {
            "id": nid,
            "title": title,
            "file": f"notes/{safe_name}",
            "date": date,
            "category": cat,
            "tags": tags
        }
        notes_list.append(entry)
        print(f"  ✅ [{cat}] {title}  |  {', '.join(tags)}")

# 写入 notes.json
notes_json = BASE / "notes.json"
with open(notes_json, "w", encoding="utf-8") as f:
    json.dump(notes_list, f, ensure_ascii=False, indent=2)

print(f"\n📊 总计导入 {len(notes_list)} 篇笔记")
print(f"📂 notes.json 已更新")

# 统计分类
cats = {}
for n in notes_list:
    c = n["category"]
    cats[c] = cats.get(c, 0) + 1
for c, cnt in sorted(cats.items(), key=lambda x: -x[1]):
    print(f"  {c}: {cnt} 篇")
