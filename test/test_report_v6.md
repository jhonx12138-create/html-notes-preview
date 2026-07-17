# Test Report — 笔记预览 APP v6.0 (Round 1)

## Summary
- Total Tests: 106 | Passed: 106 | Failed: 0
- Pass Rate: 100.0%

## Routing Decision
→ **Send To: NoOne** — All tests pass — v6 features and regression tests are clean.

## Test Coverage

### ① 移除笔记子Tab — 首页书架 (15 tests)
- 确认无 home-subtab-btn / shelfToggleBtn
- 书架始终可见，笔记列表隐藏
- 搜索按钮在 header
- Desktop Tab Bar: 首页/上传/我的
- Bottom Nav: 首页/上传/我的
- 默认选中首页，书架有卡片
- 分类排列 (shelf-section + shelf-cat-label)
- localStorage 清理 (no notes-home-view/shelf-view)
- Tab 切换正常

### ② 标签管理 (34 tests)
- DOM 结构: tag-manager-item, tagManagerList, addTagBtn
- 标签列表渲染: tag-manager-row (dot, name, count, actions)
- 标签输入弹窗: tagInputOverlay (field, confirm, cancel)
- 新增标签: openTagInput(add), 空值校验, 取消关闭
- 编辑标签: openTagInput(edit), 重命名同步所有笔记
- 编辑标签: 检查名称冲突, 更新 customTags
- 删除标签: tagReplaceModal, 有关联/无关联分支
- 删除标签: 替换选择框, 直接移除, 确认删除
- executeTagDelete: replaceWith vs __remove__ 分支
- collectAllTags: Map 统计
- localStorage: notes-custom-tags, loadCustomTags/saveCustomTags
- renderTagManager: 合并 customTags (关联数0)
- 弹窗遮罩关闭, Enter 键提交

### ③ 回归验证 (57 tests total + 34 tag + 15 schema = 106 tests)
- 书架: 39 本内置书籍, 分类分组
- 搜索: 打开/关闭, 输入框, 返回按钮
- 上传: 表单字段, 禁用状态, .html accept, 分类选择
- 删除: 源码分支检查, 确认弹窗
- 主题: toggle, light/dark, CSS 变量, localStorage
- 预览: overlay, back btn, landscape float back, CSS
- 桌面预览: mainContent, title, date, welcome
- 卡片结构: top-bar/body/bottom-bar, title/meta
- 个人中心: 昵称, 存储, 清除, v6.0 版本号
- 数据层: IndexedDB, notes.json, mergeNotes
- 其他: XSS, 键盘导航, 响应式, Toast, resize, popstate
- Action Sheet, 长按, 编辑弹窗, 滑动删除
- Book card CSS variables, TAG_COLORS, localStorage keys
- Categories, Pinned notes, Nickname, Search history

## All Results
1. [PASS] 01-001: 无 .home-subtab-btn 元素（笔记/书架子Tab已移除）
2. [PASS] 01-002: 无 #shelfToggleBtn 书架切换按钮
3. [PASS] 01-003: 书架容器 (#shelfContainer) 可见（非 hidden）
4. [PASS] 01-004: 笔记列表区域 (#notesViewArea) display:none
5. [PASS] 01-005: 🔍 搜索按钮 (#searchBtn) 在 sidebar-header 中
6. [PASS] 01-006: sidebar-header 只有 1 个 icon-btn（搜索）
7. [PASS] 01-007: Desktop Tab Bar 有 3 个按钮：首页/上传/我的
8. [PASS] 01-008: Bottom Nav 有 3 个导航项：首页/上传/我的
9. [PASS] 01-009: 默认选中首页Tab (active)
10. [PASS] 01-010: 书架视图有 book-card 卡片
11. [PASS] 01-011: 书架按分类 (shelf-section) 排列
12. [PASS] 01-012: 书架分类标签使用 CAT_COLOR_MAP 颜色类
13. [PASS] 01-013: localStorage 不再存储 notes-home-view / notes-shelf-view
14. [PASS] 01-014: 切换到"上传"Tab 正常
15. [PASS] 01-015: 切换回首页后书架仍正常显示
16. [PASS] TAG-001: 切换到"我的"页面显示标签管理区域
17. [PASS] TAG-002: 标签管理区域 (.tag-manager-item) 存在
18. [PASS] TAG-003: 标签管理标题为"标签管理"
19. [PASS] TAG-004: 标签列表容器 (#tagManagerList) 存在
20. [PASS] TAG-005: 新增标签按钮 (#addTagBtn) 存在
21. [PASS] TAG-006: 标签列表显示标签名和关联笔记数
22. [PASS] TAG-007: 每个标签行有 dot、name、count、actions
23. [PASS] TAG-008: 每个标签行有编辑和删除按钮
24. [PASS] TAG-009: 标签 dot 有颜色（通过 tagColor 生成）
25. [PASS] TAG-010: 标签输入弹窗 (#tagInputOverlay) 存在且初始隐藏
26. [PASS] TAG-011: 标签输入弹窗有输入框和确定/取消按钮
27. [PASS] TAG-012: 标签输入弹窗输入框 maxlength=30
28. [PASS] TAG-013: 点击"新增标签"打开输入弹窗 (mode=add)
29. [PASS] TAG-014: 新增弹窗标题为"新增标签"
30. [PASS] TAG-015: 确认空标签名显示提示
31. [PASS] TAG-016: 取消按钮关闭输入弹窗
32. [PASS] TAG-017: openTagInput 函数支持 add/edit 两种模式
33. [PASS] TAG-018: 编辑标签时重命名同步到所有关联笔记
34. [PASS] TAG-019: 编辑标签时检查目标标签名是否已存在
35. [PASS] TAG-020: 编辑标签时更新 customTags 并保存到 localStorage
36. [PASS] TAG-021: 标签删除确认弹窗 (#tagReplaceModal) 存在
37. [PASS] TAG-022: 标签删除弹窗有取消/移除/替换按钮
38. [PASS] TAG-023: openTagDeleteConfirm 检查关联笔记数
39. [PASS] TAG-024: 有关联笔记时显示替换选择框
40. [PASS] TAG-025: 无关联笔记时隐藏替换选择框，直接确认删除
41. [PASS] TAG-026: executeTagDelete 支持替换 (replaceWith) 和直接移除 (__remove__)
42. [PASS] TAG-027: 删除标签后从 customTags 中移除
43. [PASS] TAG-028: collectAllTags 统计所有标签及关联笔记数
44. [PASS] TAG-029: 使用 localStorage key "notes-custom-tags"
45. [PASS] TAG-030: loadCustomTags 在 init 中调用
46. [PASS] TAG-031: renderTagManager 合并 customTags（即使关联数为0）
47. [PASS] TAG-032: 点击弹窗遮罩关闭 tagInputOverlay
48. [PASS] TAG-033: Enter 键提交标签输入
49. [PASS] TAG-034: 点击遮罩关闭 tagReplaceModal
50. [PASS] REG-001: 书架渲染完整的 39 本内置书籍
51. [PASS] REG-002: 书架按分类分组（哲学/历史/文学/科技/其他）
52. [PASS] REG-003: 搜索按钮点击打开搜索页面
53. [PASS] REG-004: 搜索页有输入框和返回按钮
54. [PASS] REG-005: 返回按钮关闭搜索页
55. [PASS] REG-006: 上传表单各字段存在
56. [PASS] REG-007: 上传按钮初始为禁用
57. [PASS] REG-008: 上传文件输入仅接受 .html
58. [PASS] REG-009: 上传分类选择有预设分类
59. [PASS] REG-010: deleteNoteById 区分内置笔记和用户笔记
60. [PASS] REG-011: 删除使用 showConfirm 弹窗确认
61. [PASS] REG-012: 确认弹窗 (#confirmModal) 有取消和确定按钮
62. [PASS] REG-013: 主题切换 toggle (#profileThemeToggle) 存在
63. [PASS] REG-014: 初始主题为 light
64. [PASS] REG-015: 黑暗模式 CSS 变量定义 ([data-theme="dark"])
65. [PASS] REG-016: 主题持久化到 localStorage "notes-theme"
66. [PASS] REG-017: toggleTheme 切换 light↔dark
67. [PASS] REG-018: 预览浮层 (#previewOverlay) 存在且初始隐藏
68. [PASS] REG-019: 预览浮层有返回按钮
69. [PASS] REG-020: 横屏浮动返回按钮 (#landscapeFloatBack) 存在
70. [PASS] REG-021: 横屏 CSS — 隐藏 header, 显示浮动返回按钮
71. [PASS] REG-022: checkLandscape 函数存在
72. [PASS] REG-023: 桌面预览区 (#mainContent) 存在
73. [PASS] REG-024: 预览标题 (#previewTitle) 和日期 (#previewDate) 存在
74. [PASS] REG-025: 预览 body (#previewBody) 显示欢迎界面
75. [PASS] REG-026: book-card 有 top-bar, body, bottom-bar 结构
76. [PASS] REG-027: book-card-body 包含 title 和 meta
77. [PASS] REG-028: 个人中心有昵称输入
78. [PASS] REG-029: 个人中心有存储管理
79. [PASS] REG-030: 个人中心有清除用户笔记按钮
80. [PASS] REG-031: 版本号显示 v6.0
81. [PASS] REG-032: IndexedDB 数据库 "notes-app" 用于持久化用户笔记
82. [PASS] REG-033: fetch notes.json 加载内置笔记
83. [PASS] REG-034: mergeNotes 合并用户和内置笔记
84. [PASS] REG-035: escapeHtml 防 XSS 函数存在
85. [PASS] REG-036: 书架支持键盘导航 (Enter/Space)
86. [PASS] REG-037: 移动端断点 max-width: 767px
87. [PASS] REG-038: 移动端底部导航显示 (display: flex)
88. [PASS] REG-039: safe-area-inset 适配
89. [PASS] REG-040: showToast 函数存在
90. [PASS] REG-041: resize 事件处理（含 debounce）
91. [PASS] REG-042: popstate 事件处理（Android 返回键）
92. [PASS] REG-043: Action Sheet (#actionSheetBackdrop) 存在
93. [PASS] REG-044: Action Sheet 有编辑/删除/置顶/取消四个操作
94. [PASS] REG-045: 书架长按机制 (800ms LONG_PRESS_DURATION)
95. [PASS] REG-046: 编辑弹窗 (#editModal) 存在
96. [PASS] REG-047: 滑动删除机制存在 (SWIPE_THRESHOLD=60, SWIPE_MAX=120)
97. [PASS] REG-048: #notesViewArea 始终隐藏（v6 已弃用笔记列表视图）
98. [PASS] REG-049: showConfirm 使用 cloneNode 清理事件
99. [PASS] REG-050: 五种书籍颜色类别 CSS 变量定义
100. [PASS] REG-051: TAG_COLORS 有 8 种颜色
101. [PASS] REG-052: 分类列表从 localStorage "notes-categories" 加载
102. [PASS] REG-053: 预设分类为 ["全部","哲学","历史","文学","科技","其他"]
103. [PASS] REG-054: 置顶笔记 localStorage key "notes-pinned"
104. [PASS] REG-055: 昵称 localStorage key "notes-nickname"
105. [PASS] REG-056: 搜索历史 localStorage key "notes-search-history"
106. [PASS] REG-057: 搜索历史最多 20 条