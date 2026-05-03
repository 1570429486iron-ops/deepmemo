# DeepMemo Backend V2：文件系统驱动架构
1. 核心职责划分
状态同步：实时监听磁盘变动，确保前端树结构与物理文件 100% 同步。

元数据管理：在 SQLite 中记录文件的“知识状态”（如：是否已处理、所属标签、逻辑权重）。

自动化桥梁：当 AI 需要“写日记”时，后端负责从 raw/ 读取语料并推送到 diary/。

2. SQLite Schema 增强 (针对文件管理)
除了之前的 session 和 message，我们需要增加一个 file_meta 表来记录文件的“元状态”。

SQL
-- 文件元数据：记录物理文件在知识库中的状态
CREATE TABLE file_meta (
    id UUID PRIMARY KEY,
    file_path TEXT UNIQUE,       -- 相对路径，如 diary/2026-05-03.md
    file_hash TEXT,             -- 内容 MD5，用于判断是否发生实质变动
    sync_status TEXT NOT NULL CHECK (
        sync_status IN ('synced', 'dirty', 'draft', 'processing', 'error')
    ),
    last_modified DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
3. 文件系统 API 设计 (Vibe Coding 指令集)
这些 API 直接驱动你前端的 V2 界面。

📂 目录与文件操作 (FS Operations)
GET /api/fs/tree

逻辑：递归扫描 data/ 目录，返回嵌套 JSON。

增强：联合查询 file_meta 表，给每个文件加上 sync_status（那个“绿色状态灯”的数据来源）。

GET /api/fs/content?path=xxx

逻辑：直接读取物理文件并返回字符串。

POST /api/fs/write

逻辑：接收 Markdown 内容并写入物理磁盘，同时更新 file_meta 的 file_hash。

POST /api/fs/move

逻辑：处理重命名或拖拽移动。

✍️ AI 自动化接口 (AI-to-FS)
POST /api/diary/auto-draft

逻辑：

扫描 data/raw/ 下最新的文件。

调用 LLM 根据这些语料生成日记草稿。

不直接存盘，而是将内容返回给前端编辑器，由用户审核后调用 /api/fs/write。

4. 关键技术点：Watcher (监听器)
你需要一个后台任务来确保当你在 VS Code 里手动改了文件，DeepMemo 的界面能实时感知。

Python
# app/core/watcher.py (示例逻辑)
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class KnowledgeBaseHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".md"):
            # 1. 计算新 Hash
            # 2. 更新 SQLite 中的 sync_status 为 'dirty'
            # 3. (可选) 通过 WebSocket 通知前端刷新
            print(f"File {event.src_path} changed, updating index...")
5. 项目结构建议
Plaintext
.
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── chat.py      # 原有的问答逻辑
│   │   └── fs.py        # 新增：处理 tree/read/write/move
│   ├── core/
│   │   ├── fs_manager.py # 文件系统操作封装
│   │   └── watcher.py    # Watchdog 监听逻辑
│   └── models/           # SQLite (SQLAlchemy) 模型
├── data/                 # 核心数据区 (diary, ideas, memory, raw)
└── config/