# DeepMemo 问题记录

## 1. 硬编码问题 (待确认)

**问题描述**: 后端读取文件时存在写死内容，优先检索固定目录结构。

**涉及位置**:

1. `src/routers/diary.py` - `AutoDraftRequest.output_dir` 默认值为 `"diary"`
2. `src/app/core/fs_manager.py` - `scan_directory_tree` 固定扫描 `data/` 下的 `diary/`, `ideas/`, `memory/`, `raw/` 子目录
3. `src/app/core/watcher.py` - 固定监听 `.md` 文件

**待确认方案**:
- [ ] 改为配置文件方式 (`config/fs_config.yaml`)
- [ ] 根据目录文件夹来确定检索优先级，比如Bot — 将该文件夹设为 AI 上下文（会在文件名旁显示 @ 标记）
- [ ] 其他方案

**决策人**: gzy
**状态**: 待定

## 2. 本地skill如何引入，是否要在前端显示（待思考）



## 3. 导出按钮功能重设计

**现状**: 导出按钮当前只是拼一条 prompt（`请将 xxx 导出为 Wiki/PDF 结构...`）丢给 AI 回复，不会真正生成文件或下载。

**期望**: 导出按钮改为**分享当前会话链接**——生成一个可访问的 URL，别人打开后能看到该会话的完整对话内容。

**待确认**:
- [ ] 分享链接的格式和生成方式（前端生成还是后端生成）
- [ ] 是否需要登录/鉴权才能查看分享内容
- [ ] 分享链接是否有时效性
- [ ] 分享页面是只读展示还是会话副本
- [ ] 前端交互：点击后复制链接到剪贴板 + toast 提示

**涉及位置**: `app/src/App.tsx` - `handleExport` 函数 + `WorkspaceHeader` 组件

**决策人**: gzy
**状态**: 待定

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
**状态**: 待定

## 5. 编辑器模式 Source Panel 显示 "Not Found"

**现状**: 编辑器模式下打开文件，右侧 Source Panel 显示 "Not Found"，但该文件曾在 QA 对话中被引用过。

**可能原因**:
1. 当前编辑的文件从未在任何会话中被引用
2. 文件路径不匹配：前端传 `path=diary/423.md`，但数据库中 `citations` 存的是 `diary/423.md`
3. 前端 UI 判断逻辑问题（`fileRefs.length === 0` 时显示 "Not Found"）

**待确认**:
- [ ] 确认当前编辑的文件是否真的在 QA 中被引用过
- [ ] 打开浏览器 DevTools → Network 查看 `/api/chat/file-references` 的请求参数和响应
- [ ] 检查 `fileRefs.length === 0` 时的错误提示是否应该改为"暂无会话引用"

**涉及位置**:
- `app/src/App.tsx` - 1693-1717 行 `useEffect` 获取 file references
- `app/src/App.tsx` - 1288-1294 行空状态展示

**决策人**: gzy
**状态**: 待排查

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

**决策人**: gzy
**状态**: 待定
