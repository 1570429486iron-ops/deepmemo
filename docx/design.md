# DeepMemo 前后端对接文档 (V2)

## 概述

本文档描述 DeepMemo V2 后端 API 规范，供前端团队将 Mock 接口替换为真实请求。

**Base URL**: `http://localhost:8000`

---

## 目录

1. [文件系统 API](#1-文件系统-api-fs)
2. [日记自动生成 API](#2-日记自动生成-api-diary)
3. [会话与聊天 API](#3-会话与聊天-api)
4. [数据模型](#4-数据模型)
5. [Socket.IO 实时通知](#5-socketio-实时通知)

---

## 1. 文件系统 API (FS)

### 1.1 获取目录树

```
GET /api/fs/tree
```

**说明**: 递归扫描 `data/` 目录，返回嵌套 JSON。每个文件/目录附带 `sync_status` 状态灯。

**响应示例**:
```json
[
  {
    "name": "diary",
    "path": "diary",
    "type": "directory",
    "sync_status": "synced",
    "children": [
      {
        "name": "2026-05-03.md",
        "path": "diary/2026-05-03.md",
        "type": "file",
        "sync_status": "dirty"
      }
    ]
  },
  {
    "name": "ideas",
    "path": "ideas",
    "type": "directory",
    "sync_status": "synced",
    "children": []
  }
]
```

**sync_status 取值**:
| 值 | 说明 | 前端颜色 |
|---|------|---------|
| `synced` | 已同步 | 绿色 |
| `dirty` | 有变动 | 橙色 |
| `draft` | 草稿 | 灰色 |
| `processing` | 处理中 | 蓝色 |
| `error` | 错误 | 红色 |

---

### 1.2 读取文件内容

```
GET /api/fs/content?path={relative_path}
```

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 相对于 data/ 的路径，如 `diary/2026-05-03.md` |

**响应示例**:
```json
{
  "path": "diary/2026-05-03.md",
  "content": "# 日记内容..."
}
```

**错误响应** (404):
```json
{
  "detail": "File not found: diary/2026-05-03.md"
}
```

---

### 1.3 写入文件

```
POST /api/fs/write
```

**请求体**:
```json
{
  "path": "diary/2026-05-04.md",
  "content": "# 新日记内容"
}
```

**响应示例**:
```json
{
  "message": "File written successfully",
  "file_path": "diary/2026-05-04.md",
  "file_hash": "a1b2c3d4...",
  "sync_status": "synced",
  "last_modified": "2026-05-04T10:30:00"
}
```

---

### 1.4 移动/重命名文件

```
POST /api/fs/move
```

**请求体**:
```json
{
  "old_path": "diary/2026-05-03.md",
  "new_path": "diary/2026-05-03_old.md"
}
```

**响应示例**:
```json
{
  "message": "File moved successfully",
  "old_path": "diary/2026-05-03.md",
  "new_path": "diary/2026-05-03_old.md",
  "file_hash": "a1b2c3d4...",
  "sync_status": "synced"
}
```

---

### 1.5 更新文件同步状态

```
PATCH /api/fs/sync-status
```

**请求体**:
```json
{
  "path": "diary/2026-05-03.md",
  "sync_status": "dirty"
}
```

**响应示例**:
```json
{
  "message": "Sync status updated",
  "path": "diary/2026-05-03.md",
  "sync_status": "dirty"
}
```

---

## 2. 日记自动生成 API (Diary)

### 2.1 AI 自动生成日记草稿

```
POST /api/diary/auto-draft
```

**请求体** (可选):
```json
{
  "raw_dir": "raw",
  "output_dir": "diary"
}
```

**说明**: 扫描 `data/raw/` 下最新的 .md 文件，调用 LLM 生成日记草稿，返回给前端审核。用户确认后调用 `/api/fs/write` 存盘。

**响应示例**:
```json
{
  "source_file": "raw_note.md",
  "draft": "# 2026年5月4日\n\n今天完成了...",
  "message": "Draft generated (LLM pending)"
}
```

---

## 3. 会话与聊天 API

### 3.1 创建会话

```
POST /sessions
```

**请求体**:
```json
{
  "session_name": "我的第一个会话"
}
```

**响应示例**:
```json
{
  "session_id": "uuid-string",
  "session_name": "我的第一个会话",
  "message_ids": [],
  "created_at": "2026-05-04T10:00:00",
  "updated_at": "2026-05-04T10:00:00"
}
```

---

### 3.2 获取会话列表

```
GET /sessions
```

**响应示例**:
```json
[
  {
    "session_id": "uuid-string",
    "session_name": "我的第一个会话",
    "message_ids": ["msg-id-1", "msg-id-2"],
    "created_at": "2026-05-04T10:00:00",
    "updated_at": "2026-05-04T10:30:00"
  }
]
```

---

### 3.3 获取单个会话

```
GET /sessions/{session_id}
```

**响应示例**: 同 3.2 单个对象

---

### 3.4 删除会话

```
DELETE /sessions/{session_id}
```

**响应示例**:
```json
{
  "message": "Session deleted"
}
```

---

### 3.5 发送消息

```
POST /chat
```

**请求体**:
```json
{
  "session_id": "uuid-string",
  "user_message": "今天学了什么？"
}
```

**响应示例**:
```json
{
  "message_id": "ai-msg-uuid",
  "session_id": "uuid-string",
  "role": "ai",
  "content": "根据你的知识库，今天你学习了...",
  "created_at": "2026-05-04T10:30:00"
}
```

> AI 的 `content` 字段为 markdown 格式，前端可直接渲染。

---

### 3.6 获取会话消息历史

```
GET /chat/{session_id}/messages
```

**响应示例**:
```json
[
  {
    "message_id": "user-msg-uuid",
    "session_id": "uuid-string",
    "role": "user",
    "content": "今天学了什么？",
    "created_at": "2026-05-04T10:30:00"
  },
  {
    "message_id": "ai-msg-uuid",
    "session_id": "uuid-string",
    "role": "ai",
    "content": "根据你的知识库...",
    "created_at": "2026-05-04T10:30:01"
  }
]
```

---

## 4. 数据模型

### 4.1 FileMeta (SQLite file_meta 表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| file_path | TEXT | 相对路径，如 `diary/2026-05-03.md` |
| file_hash | TEXT | 内容 MD5，用于判断是否发生实质变动 |
| sync_status | TEXT | 同步状态 |
| last_modified | DATETIME | 最后修改时间 |
| created_at | DATETIME | 创建时间 |

---

### 4.2 Session

| 字段 | 类型 | 说明 |
|------|------|------|
| session_id | TEXT (UUID) | 主键 |
| session_name | TEXT | 会话名称 |
| message_ids | TEXT (JSON Array) | 消息 ID 列表 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

---

### 4.3 Message

| 字段 | 类型 | 说明 |
|------|------|------|------|
| message_id | TEXT (UUID) | 主键 |
| session_id | TEXT | 所属会话 ID |
| role | TEXT | `user` 或 `ai` |
| content | TEXT | 消息内容 |
| created_at | DATETIME | 创建时间 |

---

## 5. Socket.IO 实时通知

Watcher 监听文件变化后，通过 Socket.IO 通知前端刷新。当前为可选功能。

**事件名**: `file_changed`

**Payload**:
```json
{
  "path": "diary/2026-05-03.md",
  "event_type": "modified"
}
```

**event_type 取值**: `created`, `modified`, `deleted`

---

## 前端对接 Checklist

- [ ] 调用 `GET /api/fs/tree` 初始化文件树
- [ ] 调用 `GET /api/fs/content?path=xxx` 读取文件
- [ ] 调用 `POST /api/fs/write` 保存文件
- [ ] 调用 `POST /api/fs/move` 处理拖拽/重命名
- [ ] 调用 `PATCH /api/fs/sync-status` 更新状态灯
- [ ] 调用 `POST /api/diary/auto-draft` 生成日记草稿
- [ ] 调用 `POST /sessions` 创建新会话
- [ ] 调用 `POST /chat` 发送消息
