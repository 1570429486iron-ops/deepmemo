# 前后端对接文档

## Base URL
```
http://localhost:8000
```

## 数据模型

### SessionResponse
| 字段 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话 ID (UUID) |
| session_name | string | 会话名称 |
| message_ids | string[] | 消息 ID 列表 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### MessageResponse
| 字段 | 类型 | 说明 |
|------|------|------|
| message_id | string | 消息 ID (UUID) |
| session_id | string | 所属会话 ID |
| role | string | 角色 (`user` / `ai`) |
| content | string | 消息内容 (AI 返回为 markdown) |
| created_at | datetime | 创建时间 |

---

## Session APIs

### POST /sessions
创建新会话。

**Request**
```json
{
  "session_name": "我的会话"
}
```

**Response** `SessionResponse`
```json
{
  "session_id": "uuid-string",
  "session_name": "我的会话",
  "message_ids": [],
  "created_at": "2026-05-01T10:00:00",
  "updated_at": "2026-05-01T10:00:00"
}
```

---

### GET /sessions
获取所有会话列表（按创建时间倒序）。

**Response** `SessionResponse[]`
```json
[
  {
    "session_id": "uuid-string",
    "session_name": "我的会话",
    "message_ids": ["msg_id_1", "msg_id_2"],
    "created_at": "2026-05-01T10:00:00",
    "updated_at": "2026-05-01T10:00:00"
  }
]
```

---

### GET /sessions/{session_id}
获取指定会话详情。

**Response** `SessionResponse`

---

### DELETE /sessions/{session_id}
删除指定会话及其所有消息。

**Response**
```json
{
  "message": "Session deleted"
}
```

---

## Chat APIs

### POST /chat
发送消息并获得 AI 回复。

**Request**
```json
{
  "session_id": "uuid-string",
  "user_message": "用户输入的文字"
}
```

**Response** `MessageResponse`
```json
{
  "message_id": "ai-msg-uuid",
  "session_id": "uuid-string",
  "role": "ai",
  "content": "AI 的回复（markdown 格式）",
  "created_at": "2026-05-01T10:00:00"
}
```

> AI 的 `content` 字段为 markdown 格式，前端可直接渲染。

---

### GET /chat/{session_id}/messages
获取指定会话的所有消息（按时间正序）。

**Response** `MessageResponse[]`
```json
[
  {
    "message_id": "user-msg-uuid",
    "session_id": "uuid-string",
    "role": "user",
    "content": "用户输入的文字",
    "created_at": "2026-05-01T10:00:00"
  },
  {
    "message_id": "ai-msg-uuid",
    "session_id": "uuid-string",
    "role": "ai",
    "content": "AI 的回复",
    "created_at": "2026-05-01T10:00:01"
  }
]
```

---

## 健康检查

### GET /
返回服务状态。

**Response**
```json
{
  "message": "DeepMemo API is running"
}
```
