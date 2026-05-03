# DeepMemo

知识库问答助手后端 MVP

## 环境

- Python 3.11+
- uv

## 安装

```bash
uv sync
```

## 配置

编辑 `config/llm_api.yaml`，填入你的 OpenAI API Key。

## 运行

```bash
uv run uvicorn src.app.main:app --reload
```

## API 文档

启动后访问 http://localhost:8000/docs 查看交互式文档。
