# DeepMemo 问题记录

## 1. 硬编码问题

**问题描述**: 后端读取文件时存在写死内容，优先检索固定目录结构。

**涉及位置**:

1. `src/routers/diary.py` - `AutoDraftRequest.output_dir` 默认值为 `"diary"`
2. `src/app/core/fs_manager.py` - `scan_directory_tree` 固定扫描 `data/` 下的 `diary/`, `ideas/`, `memory/`, `raw/` 子目录
3. `src/app/core/watcher.py` - 固定监听 `.md` 文件

**确认方案**:

### 1. 配置文件负责系统默认规则

新增 `config/fs_config.yaml`，用于管理知识库文件系统的默认规则，避免后端散落硬编码。

建议配置项：

```yaml
knowledge_base:
  root: data
  visible_dirs:
    - diary
    - ideas
    - memory
    - raw
  allowed_extensions:
    - .md
  default_search_dirs:
    - diary
    - ideas
    - memory
```

用途：
- `root`：知识库根目录，替代代码里写死的 `data/`
- `visible_dirs`：前端文件树默认展示的目录
- `allowed_extensions`：Watcher 和文件读取允许处理的文件类型
- `default_search_dirs`：用户没有手动指定上下文时，问答模式默认检索的目录范围

### 2. 用户手动标记文件/文件夹作为 AI 上下文

前端文件树支持用户把文件或文件夹标记为 AI 上下文，文件名旁显示 `@` 标记。

交互设计：
- 点击文件/文件夹旁的 `@` 按钮，将该路径加入当前会话上下文
- 已加入上下文的路径显示高亮 `@`
- 输入框附近显示当前会话上下文数量，例如 `上下文：3 个文件`
- 用户可以移除某个上下文路径

实现原则：
- 上下文标记按会话保存，优先做 `session` 级，不做全局默认
- 前端只传路径，不直接把文件内容拼进 prompt
- 后端负责路径校验、文件读取、截断、证据构建和引用编号
- 文件上下文优先转成 evidence，继续走现有 citation 机制
- 文件夹上下文作为检索范围或加权范围，不直接整目录塞进 prompt

建议请求结构：

```python
class ChatContextPath(BaseModel):
    path: str
    type: str  # file | directory

class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    context_paths: list[ChatContextPath] = []
```

后端行为：
- 如果用户标记具体文件：优先读取该文件并生成 evidence，小文件可完整读取，大文件只取相关片段
- 如果用户标记文件夹：在该文件夹下优先检索，作为 scope 或 ranking boost
- 如果用户没有标记上下文：沿用默认路由和默认检索目录
- 所有路径必须限制在知识库根目录内，避免越权读取

**决策人**: gzy
**状态**: 已确认（2026-05-04）

## 2. 本地 Skill 如何引入，是否要在前端显示

**问题描述**: 当前仓库已有本地 Skill，例如技术写作 Skill 和 Deep Research Skill，需要确定它们如何接入 DeepMemo，以及是否在前端暴露给用户选择。

**已有 Skill**:

1. `.claude/skills/khazix-writer` - 技术写作 / 公众号长文写作 Skill
2. `.claude/skills/hv-analysis` - Deep Research / 横纵分析法研究报告 Skill

**确认方案**: 本地 Skill 统一抽象为对话框里的 Chat Tool。

参考 ChatGPT / Gemini 的交互设计，前端不把 Skill 做成顶部模式切换，也不直接暴露 `.claude/skills` 本地目录，而是在输入框附近提供一个 `工具` 入口。

前端交互：
- 输入框旁显示 `工具` 按钮
- 点击后展示可用工具列表，例如 `技术写作`、`深度研究`
- 用户选中工具后，在输入框上方显示 tool chip，例如 `技术写作 ×`
- 发送消息时，本轮请求带上选中的 `tool_id`
- 默认按 `next_message` 生效，即只影响下一条消息；后续可支持 `session` 级固定到当前会话

工具展示建议：

```ts
type ChatTool = {
  id: 'khazix-writer' | 'hv-analysis';
  name: string;
  description: string;
  executionType: 'inline' | 'job';
};
```

示例：
- `khazix-writer`
  - 前端名称：`技术写作`
  - 描述：`按卡兹克风格生成公众号长文、改稿、续写`
  - 执行类型：`inline`
- `hv-analysis`
  - 前端名称：`深度研究`
  - 描述：`用横纵分析法研究产品、公司、技术或人物，并生成报告`
  - 执行类型：`job`

后端执行方式：
- `khazix-writer` 作为 inline tool，直接参与本轮聊天回复，适合写文章、改稿、续写、润色
- `hv-analysis` 作为 job tool，创建长任务，在对话中显示研究进度，最后返回 Markdown / PDF 报告
- 前端只传 `tool_id`，后端根据 `tool_id` 加载对应 Skill 的 `SKILL.md` 和必要 references/scripts
- 不把完整 Skill prompt 发给前端，避免暴露内部流程和本地路径细节

建议请求结构：

```python
class ChatToolSelection(BaseModel):
    tool_id: str
    scope: str = "next_message"  # next_message | session

class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    context_paths: list[ChatContextPath] = []
    tool: ChatToolSelection | None = None
```

与 AI 上下文的关系：
- Chat Tool 和 `@` 上下文文件可以组合使用
- 例如用户选择 `技术写作`，同时 `@` 一批素材文件，后端将素材文件作为 evidence/context，再按 `khazix-writer` 的写作流程生成文章
- 例如用户选择 `深度研究`，同时 `@` 一个产品资料文件夹，后端把该文件夹作为本地研究素材，并允许工具执行外部信息收集

MVP 范围：
- 先支持用户手动选择工具
- 不做自动触发和自动路由
- 先实现 `next_message` 级工具选择
- `hv-analysis` 可以先以任务状态消息形式接入，PDF 生成作为后续增强

**决策人**: gzy
**状态**: 已确认（2026-05-04）

## 3. 导出按钮功能重设计

**现状**: 导出按钮当前只是拼一条 prompt（`请将 xxx 导出为 Wiki/PDF 结构...`）丢给 AI 回复，不会真正生成文件或下载。

**期望**: 导出按钮改为**分享当前会话链接**——生成一个可访问的 URL，别人打开后能看到该会话的完整对话内容。

**确认方案**: 本地服务场景下，导出按钮不做真正的文件导出，而是做**本地只读会话分享快照**。

设计原则：
- 分享链接由后端生成，不由前端拼接
- 分享的是会话快照，不是 live 会话
- 分享页只读，不允许继续编辑、发消息或删除
- 不引入账号体系，`share_id` 本身作为访问凭证
- 默认只支持本地服务可访问，公网分享交由用户自己通过隧道工具暴露服务

建议流程：

1. 用户点击 `分享`
2. 前端调用后端接口创建会话快照
3. 后端生成随机 `share_id`
4. 后端保存会话快照数据和元信息
5. 前端复制 `/share/:share_id` 链接到剪贴板并提示成功
6. 打开的分享页只展示对话内容和引用信息

建议数据模型：

```sql
CREATE TABLE shared_session (
  share_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);
```

建议 API：

- `POST /api/share/session` - 创建会话快照并返回分享链接
- `GET /share/:share_id` - 展示只读分享页
- `DELETE /api/share/:share_id` - 撤销分享链接，后续可选

推荐默认策略：
- 分享链接默认不设过期，后续可加 7 天 / 30 天选项
- 后续需要更强安全时，再加密码访问或登录鉴权
- 当前阶段先保证简单、可用、可撤销

**涉及位置**: `app/src/App.tsx` - `handleExport` 函数 + `WorkspaceHeader` 组件

**决策人**: gzy
**状态**: 已确认（2026-05-04）

## 4. 搜索功能：前端过滤 vs 后端全文搜索

**现状**:
- 左侧文件树有搜索框，当前实现是**前端过滤** `GET /api/fs/tree` 返回的完整文件树
- 只匹配文件名和路径，不搜索文件内容

**两种方案**:

### 方案 A：保持前端过滤（当前实现）
- ✅ 实现简单，无需额外 API
- ✅ 响应快，不依赖后端
- ✅ 适合小规模文件树（< 1000 文件）
- ❌ 无法搜索文件内容
- ❌ 无法跨文件名匹配（如搜索文件内容中的关键词）

### 方案 B：后端全文搜索 API
- **新增 API**: `GET /api/search?q=xxx`
- 返回匹配的文件路径 + 内容片段 + 匹配行号
- 前端搜索框改为调用后端 API，实时显示结果
- ✅ 支持内容搜索
- ❌ 需要额外的搜索服务或 SQLite FTS 扩展
- ❌ 响应速度依赖数据量

**决策人**: gzy
**状态**: 不用做全文搜索，因为问答模式是用来做这个的，做了反而死板，应该引导用户使用问答模式来检索

## 5. 编辑器模式 Source Panel 显示 "Not Found"

**现状**: 编辑器模式下打开文件，右侧 Source Panel 曾显示 "Not Found"，但该文件曾在 QA 对话中被引用过。

**可能原因**:
1. 当前编辑的文件从未在任何会话中被引用
2. 文件路径不匹配：前端传 `path=diary/423.md`，但数据库中 `citations` 存的是 `diary/423.md`
3. 前端 UI 判断逻辑问题（`fileRefs.length === 0` 时显示 "Not Found"）

**排查结论**:
- ✅ 数据库中存在 `diary/423.md` 的 citation，数据不是空的。
- ✅ 根因一：Vite 代理缺少 `/api/chat/file-references` 专用规则，请求落到通用 `/api` 规则后被 rewrite 成 `/chat/file-references`，后端返回 404 `Not Found`。
- ✅ 根因二：后端 file reference 查询使用严格字符串比较，缺少 `data/`、前导 `/`、绝对路径等路径变体归一化。

**解决方案**:
- 在 `app/vite.config.ts` 增加 `/api/chat/file-references` 专用代理规则。
- 在 `src/app/main.py` 中对请求路径和 citation `file_path` 做 data-relative POSIX 归一化后再比较。
- 在 `app/src/App.tsx` 中修复 Source Panel 引用跳转：点击后切到问答模式、加载对应会话、选中并滚动到对应消息。
- 将“跳转到会话”按钮移动到每条引用卡片未展开状态的默认可见区域，减少点击成本。

**涉及位置**:
- `app/src/App.tsx` - 1693-1717 行 `useEffect` 获取 file references
- `app/src/App.tsx` - 1288-1294 行空状态展示

**决策人**: gzy
**状态**: 已解决（2026-05-04）

## 6. 流式返回功能丢失

**现状**: AI 回复是同步等待整段返回后一次性渲染，不是流式输出。

**历史追溯**:
- 初始版本 `e2ba152` 实现了完整流式链路：
  - `src/routers/chat.py` 有 `/chat/stream` SSE 端点
  - `src/services/llm_service.py` 支持 `stream=True`
  - `app/src/api.ts` 有 `sendMessageStream()` 函数，用 `ReadableStream` 逐 token 读取并回调 `onChunk`
- V2 重构时被移除：
  - `a80b52c` 后端重写：直接调用 `llm_service.chat()` → 改为 `knowledge_qa_service.answer()`（RAG 管线：路由→检索→组合），管线整体返回 `KnowledgeAnswer`，不再是 token 流
  - `f00c305` 前端重写：移除 `sendMessageStream`，只保留同步的 `sendMessage`

**根因**: V2 引入了 RAG 检索增强管线（QueryRouter → LocalSearchAgent → AnswerComposer），中间涉及本地检索 + 向量匹配 + 引用构建，无法直接用单次 LLM stream 覆盖。

**恢复方案**:
1. **方案 A：端到端流式** — AnswerComposer 改为流式输出最终 LLM 回答部分（检索阶段同步完成，仅最后一步 LLM 生成用 stream），前端恢复 ReadableStream 逐 token 渲染
2. **方案 B：分阶段流式** — 前端先显示"检索中..."，检索完成后切到"生成中..."并开始流式渲染
3. **方案 C：不做流式** — 保持现状，通过优化检索速度缩短整体等待时间

**涉及位置**:
- `src/ai/answer_composer.py` — compose 函数需支持 stream 模式
- `src/routers/chat.py` — 需新增 SSE 端点
- `src/services/llm_service.py` — 已有 `stream` 参数，无需改
- `app/src/api.ts` — 需恢复 `sendMessageStream` 函数
- `app/src/App.tsx` — `submitQuestion` 需改为流式渲染逻辑

**已实现** (2026-05-04):
- ✅ 后端 `answer_composer.py` 新增 `compose_stream()` 方法
- ✅ 后端 `service.py` 新增 `answer_stream()` 方法
- ✅ 后端 `routers/chat.py` 新增 `/chat/stream` SSE 端点
- ✅ 前端 `api.ts` 新增 `sendMessageStream()` 函数
- ✅ 前端 `App.tsx` `submitQuestion` 改为流式渲染
- ✅ SSE 解析改为按 event block 处理，避免最后一个 chunk / done 事件丢失
- ✅ `/chat/stream` 的 `done` 事件返回后端真实保存的 AI 消息，前端用真实消息替换本地占位消息
- ✅ 流式消息保存时补齐 citations，右侧 Source Panel 可继续展示引用来源
- ✅ 前端 optimistic user / assistant 使用不同本地 ID 前缀，避免同毫秒 ID 冲突导致大模型输出写进用户 query 气泡
- ✅ LLM stream 兼容空 `choices` 结束帧，避免完整回答后追加 `list index out of range` fallback
- ✅ 已有内容流出后，如果后续流式迭代异常，不再把 fallback 拼到用户可见答案后面
- ✅ 后端截掉模型自行生成的 `## 引用` / `## 参考` 段，再追加系统生成的引用块，避免引用结构重复或解析错位
- ✅ 对话气泡不再展示底部引用列表，仅保留正文中的 `[1]`、`[2]` 引用标记；完整引用统一放到右侧 Source Panel

**决策人**: gzy
**状态**: 已解决（2026-05-05）
