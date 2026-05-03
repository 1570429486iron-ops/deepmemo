# V2 版前端设计文档

DeepMemo V2 前端设计文档：面向 Agent 的知识创作工作站
基于从手动 MD 维护转向 NotebookLM 式知识助手”的需求，对已有前端进行重构。
保留我喜欢的专业深蓝色调，但将核心逻辑从单纯的“问答”升级为了“文件系统驱动的知识创作工作站”。

1. 架构与技术栈
框架: React 18+ (Next.js 推荐，或 Vite)

语言: TypeScript (严格类型定义)

样式: Tailwind CSS (用于快速实现高密度布局)

图标: Lucide React

核心组件:

文件树: react-arborist (支持拖拽、重命名、文件夹折叠)

编辑器: TipTap (用于结构化块编辑) 或 Monaco Editor (如果偏好纯 MD)

状态管理: Zustand (管理文件系统镜像、当前激活文件、AI 状态)

2. 页面布局：三栏结构 (15:55:30)
1. 左侧：数据资源管理器 (Data Explorer) - 260px
顶部: 产品名 DeepMemo + 搜索框 (全局全文检索)。

主体: 物理目录镜像 (data/ 根目录)。

第一级固定目录: diary/, ideas/, memory/, raw/。

交互:

悬浮显示 + File, + Folder 图标。

同步状态灯: 文件名右侧小圆点（🟢 已入库, ⚪️ 仅本地）。

右键菜单: 重命名、删除、在终端打开、“以此为 AI 上下文”。

底部: 磁盘空间占用、设置、用户头像。

2. 中间：创作与对话主区 (Hybrid Workspace) - 自适应
顶部状态栏:

显示当前文件路径 (data/diary/2026-05-03.md)。

切换开关: [ 编辑器模式 ] / [ 问答模式 ]。

按钮组：AI 补完、格式化、导出 PDF/Wiki。

内容区 (双模式切换):

编辑器视图: 一个极简的 Markdown 编辑层。支持 Slash Command (输入 / 召唤 AI 技能)。

对话视图: 标准对话流。右侧用户，左侧助手。

底部固定输入区 (Composer):

智能提示行: “正在基于 diary/ 和 skills.db 提供建议...”。

输入框: 支持多行，支持拖入文件。

操作按钮: Auto-Draft (一键生成今日日记初稿)、Refactor (让 AI 润色选中的段落)。

3. 右侧：智能上下文面板 (Insights Panel) - 340px
模式 A：来源溯源 (Sources): 当处于问答模式时，展示引用片段、相似度、原始文件链接。

模式 B：今日脉搏 (Daily Pulse): 当创建新日记时，展示今日 Git Commits、浏览记录摘要、待办事项。

模式 C：知识提取 (Knowledge Extraction): 展示从当前日记中提取出的 Entity (实体) 和 Relation (关系) 候选列表，用户可点击确认。

3. 视觉规范 (UI Specification)
配色方案 (保持专业沉稳):

主色: 深海蓝 #1E3A5F (用于侧边栏、主按钮)。

强调色: 蓝色 #2F80ED (用于选中项、链接)。

背景: 页面背景 #F5F7FA，编辑器背景 #FFFFFF。

文字: 主文字 #172033，次级文字 #5B667A。

圆角与边框:

控件圆角 6px，卡片圆角 8px。

边框色 #DDE3EA，侧边栏与主区分割线采用 1px 实线。

4. 关键 Mock 交互逻辑 (用于 AI 开发)
A. 文件管理 Mock
定义一个 files 数组对象，模拟 data/ 下的文件结构。

点击文件时，更新 Zustand 中的 activeFile 状态，中间区域加载对应的 MD 内容。

B. AI 自动草稿 (The "NotebookLM" Moment)
点击底部 Auto-Draft 按钮：

触发 Loading 状态。

模拟从 data/raw 和 data/ideas 检索。

在编辑器中流式输出 (Streaming) 今日日记草稿，包含三个部分：## 每日记录, ## 科研, ## 工程博客。

C. 实体自动链接
在编辑器中输入 @ 时，弹出 memory/ 下已有的实体列表（如 LLM-Spine, UModel）。

5. 组件拆分建议
Layout: 整体 Grid 布局。

FileTree: 递归渲染文件目录。

EditorContent: 封装 TipTap 编辑器。

ContextPanel: 右侧侧边栏，根据当前状态切换 Tab。

AiCommandBar: 输入框及 AI 快捷指令。