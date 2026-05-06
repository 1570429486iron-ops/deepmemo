# 架构设计

要做一个做知识库问答助手的ai部分

## 技术选型

- 编程语言：python
- 构建虚拟环境：uv
- api框架：fastapi
- llm配置文件：config/llm_api.yaml
- llm初始化：openaisdk

## 核心链路
先不做知识库，只调llm api来实现问答