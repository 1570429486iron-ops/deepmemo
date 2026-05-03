# 架构设计

要做一个做知识库问答助手的ai部分

## 技术选型

- 编程语言：python
- 构建虚拟环境：uv
- api框架：fastapi
- llm配置文件：config/llm_api.yaml
- llm初始化：openaisdk

## 核心链路

知识库问答使用 RAG 思路，但第一阶段不做 embedding、不建向量索引。系统先通过本地搜索 Agent 从 Markdown 知识库中召回证据，再把检索内容合并到 prompt 中，由 LLM 生成回答。

整体链路：

1. 用户输入问题。
2. QueryRouter 判断问题是否适合本地知识库回答。
3. LocalSearchAgent 在本地知识库中搜索、读取、归纳相关内容。
4. AnswerComposer 基于本地证据生成回答。
5. 如果本地知识库没有高相关内容，且问题需要外部信息，再触发 WebSearchAgent 作为 fallback。

## 本地召回方案

采用一个安全封装的 Codex / Claude Code 混合版本地搜索 Agent，不同时实现 Claude Code 和 Codex 两套召回算法。

核心思想：

- 借鉴 Claude Code 的工具封装和安全边界，把底层文件搜索能力封装成受控 tool。
- 借鉴 Codex 的动态搜索方式，让 LLM 根据问题自主决定搜索关键词、阅读路径和总结策略。
- 底层优先使用 ripgrep，但不向 Agent 暴露任意 shell 命令。
- 适配 MB 级个人 Markdown 知识库，避免过早引入 embedding、向量库和索引维护复杂度。

### LocalSearchAgent

LocalSearchAgent 是默认召回模块。它不直接回答用户，而是负责在知识库中找到可引用的本地证据，并输出结构化检索结论。

Agentic Loop：

1. 根据用户问题拆解可能的关键词、主题、时间范围和目录范围。
2. 调用 `glob_files` 定位候选 Markdown 文件。
3. 调用 `grep_content` 查找匹配片段。
4. 调用 `read_lines` 阅读必要上下文。
5. 根据已读内容决定是否继续搜索、换关键词或结束。
6. 输出证据摘要、来源文件和相关性判断。

### 工具设计

不要只暴露一个 `search(query)`，而是拆成几个可组合的安全工具：

- `glob_files(pattern)`：按文件名或目录模式查找候选文件。
- `grep_content(query, path=None, context=5, mode="content")`：基于 ripgrep 搜索正文内容。
- `read_lines(path, start, end)`：读取指定文件的指定行范围。
- `count_matches(query, path=None)`：统计关键词分布，用于判断影响范围或主题覆盖度。

`grep_content` 的模式：

- `files_with_matches`：只返回匹配文件路径，适合大范围定位。
- `content`：返回匹配行和少量上下文，适合确认具体内容。
- `count`：只返回命中次数，适合评估主题分布。

### 安全边界

- Agent 只能访问知识库根目录 `data/` 下的内容。
- 所有文件路径必须经过 realpath 校验，解析后的真实路径必须位于 `data/` 内，防止 `../` 路径穿越。
- 默认只读取 Markdown 文件，即 `data/**/*.md`。
- 禁止向 Agent 暴露任意 shell。
- 底层 `subprocess` 只允许调用白名单命令，例如 `rg`。
- 单次搜索结果超过 250 条时强制截断，并提醒 LLM 细化搜索词。
- 单次 `read_lines` 限制最大读取行数，避免一次性加载过多上下文。
- `.claude/`、`config/`、源码目录、数据库文件和其他项目配置默认不参与召回。

## WebSearchAgent

websearch 只作为 fallback，不作为默认召回。

触发条件：

- 用户明确要求联网搜索、查看最新信息或查询外部资料。
- 本地知识库没有高相关内容。
- 用户问题本身依赖实时信息，例如价格、版本、新闻、政策、活动日期等。
- 本地笔记只提供了线索，需要外部资料补充背景。

回答时必须区分本地知识库证据和外部搜索补充，避免把外部信息误认为用户自己的知识库内容。

## 模块划分

```text
QueryRouter
  -> LocalSearchAgent
       -> glob_files
       -> grep_content
       -> read_lines
       -> count_matches
       -> summarize_evidence
  -> WebSearchAgent
  -> AnswerComposer
```

## 分阶段实现

第一阶段：实现 LocalSearchAgent。

- 完成本地 Markdown 搜索工具封装。
- 支持多轮搜索、阅读、证据归纳。
- 先不做 embedding 和向量索引。
- 先不默认启用 websearch。

第二阶段：增强 QueryRouter。

- 识别时间范围、目录范围和问题类型。
- 对“最近”“上周”“某个月”等问题优先搜索 diary、weekly、monthly。
- 对“想法”“长期主题”等问题优先搜索 ideas。

第三阶段：加入 WebSearchAgent fallback。

- 只在本地知识库召回失败或问题明确需要外部信息时触发。
- 输出答案时标注哪些来自本地知识库，哪些来自外部搜索。
