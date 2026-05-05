# DeepMemo

文件系统驱动的知识创作工作站。

V1 版本是智能问答助手；V2 版本以 `.md` 文件为唯一真值，支持**编辑器模式**与**问答模式**双切换，是面向 Agent 的知识创作平台。

## 环境要求

- Python 3.11+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv)（Python 包管理）

## 快速启动

```bash
# 1. 克隆后进入项目目录
cd DeepMemo

# 2. 后端安装依赖
uv sync

# 3. 前端安装依赖
cd app && npm install && cd ..

# 4. 配置 LLM API Key
cp config/llm_api.yaml.example config/llm_api.yaml
# 编辑 config/llm_api.yaml，填入你的 LLM API Key

# 5. 启动后端（端口 8000）
uv run uvicorn src.app.main:app --reload

# 6. 另开终端，启动前端（端口 5173）
cd app && npm run dev
```

访问 http://localhost:5173 即可使用。

## 目录结构

```
DeepMemo/
├── src/                    # 后端（Python/FastAPI）
│   ├── app/               # 核心模块（database, watcher, fs_manager）
│   ├── routers/           # API 路由（fs, chat, diary, pulse）
│   ├── ai/                # AI 服务层（QueryRouter, LocalSearchAgent, AnswerComposer）
│   └── services/          # 业务逻辑
├── app/                    # 前端（React + Vite + TypeScript + Tailwind + Zustand）
├── config/                 # 配置文件
├── data/                   # 知识库文件（diary/, ideas/, memory/, raw/）
└── docx/                   # 设计文档
```

## 文档索引（docx/）

| 文件 | 内容 |
|------|------|
| `version/v1.md` | V1 版本说明：智能问答助手技术栈与功能 |
| `version/v2.md` | V2 版本说明：知识创作工作站架构 |
| `backend/backend.md` | 后端架构设计 |
| `backend/backend_v2.md` | V2 后端设计（文件系统即数据库、SQLite 增强、Watcher） |
| `backend/api.md` | API 设计文档（完整 endpoint 说明与数据模型） |
| `frontend/frontend.md` | V1 前端设计（三栏布局、Mock 交互） |
| `frontend/frontend_v2.md` | V2 前端设计（编辑器/问答双模式、Source Panel） |
| `ai/ai.md` | AI 架构设计（QueryRouter → LocalSearchAgent → AnswerComposer RAG 链路） |
| `issues.md` | 问题记录与决策（硬编码、Skill 接入、导出重设计、搜索方案、流式返回等） |

## API 文档

后端启动后访问 http://localhost:8000/docs 查看交互式 Swagger 文档。
