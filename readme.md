# DeepMemo

知识库问答助手

## 项目结构

- `src/` — 后端代码（Python/FastAPI）
- `app/` — 前端代码（React + Vite + TypeScript）

## 环境

- Python 3.11+
- Node.js 18+
- uv

## 安装依赖

```bash
# 后端
uv sync

# 前端
cd app && npm install
```

## 配置

编辑 `config/llm_api.yaml`，填入你的 LLM API Key。

## 启动

**后端**（端口 8000）：

```bash
uv run uvicorn src.app.main:app --reload
```

**前端**（端口 5173）：

```bash
cd app && npm run dev
```

## API 文档

后端启动后访问 http://localhost:8000/docs 查看交互式文档。
