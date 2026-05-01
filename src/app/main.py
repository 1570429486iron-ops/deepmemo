import json
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.app.database import init_db, get_db_connection
from src.services.llm_service import llm_service


app = FastAPI(title="DeepMemo API", version="0.1.0")


# --- Pydantic Models ---
class SessionCreate(BaseModel):
    session_name: str


class SessionResponse(BaseModel):
    session_id: str
    session_name: str
    message_ids: list[str]
    created_at: datetime
    updated_at: datetime


class ChatRequest(BaseModel):
    session_id: str
    user_message: str


class MessageResponse(BaseModel):
    message_id: str
    session_id: str
    role: str
    content: str
    created_at: datetime


# --- Database Helpers ---
def get_session_row(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM session WHERE session_id = ?", (session_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)


def save_message(message_id: str, session_id: str, role: str, content: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO message (message_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (message_id, session_id, role, content, now),
    )
    conn.commit()
    conn.close()
    return {"message_id": message_id, "session_id": session_id, "role": role, "content": content, "created_at": now}


def update_session_message_ids(session_id: str, message_ids: list[str]):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "UPDATE session SET message_ids = ?, updated_at = ? WHERE session_id = ?",
        (json.dumps(message_ids), now, session_id),
    )
    conn.commit()
    conn.close()


def build_llm_messages(session_id: str) -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    message_ids = json.loads(
        cursor.execute("SELECT message_ids FROM session WHERE session_id = ?", (session_id,)).fetchone()["message_ids"]
    )
    messages = []
    for mid in message_ids:
        row = cursor.execute("SELECT * FROM message WHERE message_id = ?", (mid,)).fetchone()
        if row:
            messages.append({"role": row["role"], "content": row["content"]})
    conn.close()
    return messages


# --- Startup ---
@app.on_event("startup")
def startup():
    init_db()


# --- Session APIs ---
@app.post("/sessions", response_model=SessionResponse)
def create_session(data: SessionCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    session_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO session (session_id, session_name, message_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (session_id, data.session_name, "[]", now, now),
    )
    conn.commit()
    conn.close()
    return SessionResponse(
        session_id=session_id,
        session_name=data.session_name,
        message_ids=[],
        created_at=datetime.fromisoformat(now),
        updated_at=datetime.fromisoformat(now),
    )


@app.get("/sessions", response_model=list[SessionResponse])
def list_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM session ORDER BY created_at DESC").fetchall()
    conn.close()
    return [
        SessionResponse(
            session_id=row["session_id"],
            session_name=row["session_name"],
            message_ids=json.loads(row["message_ids"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )
        for row in rows
    ]


@app.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(session_id: str):
    row = get_session_row(session_id)
    return SessionResponse(
        session_id=row["session_id"],
        session_name=row["session_name"],
        message_ids=json.loads(row["message_ids"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM message WHERE session_id = ?", (session_id,))
    cursor.execute("DELETE FROM session WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"message": "Session deleted"}


# --- Chat APIs ---
@app.post("/chat", response_model=MessageResponse)
def chat(request: ChatRequest):
    session = get_session_row(request.session_id)
    message_ids = json.loads(session["message_ids"])

    user_msg_id = str(uuid.uuid4())
    save_message(user_msg_id, request.session_id, "user", request.user_message)
    message_ids.append(user_msg_id)

    llm_messages = build_llm_messages(request.session_id)
    llm_messages.append({"role": "user", "content": request.user_message})
    response = llm_service.chat(llm_messages)
    ai_content = response.choices[0].message.content

    ai_msg_id = str(uuid.uuid4())
    save_message(ai_msg_id, request.session_id, "ai", ai_content)
    message_ids.append(ai_msg_id)

    update_session_message_ids(request.session_id, message_ids)

    return MessageResponse(
        message_id=ai_msg_id,
        session_id=request.session_id,
        role="ai",
        content=ai_content,
        created_at=datetime.now(),
    )


@app.get("/chat/{session_id}/messages", response_model=list[MessageResponse])
def get_messages(session_id: str):
    get_session_row(session_id)
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM message WHERE session_id = ? ORDER BY created_at", (session_id,)).fetchall()
    conn.close()
    return [
        MessageResponse(
            message_id=row["message_id"],
            session_id=row["session_id"],
            role=row["role"],
            content=row["content"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )
        for row in rows
    ]


# --- Root ---
@app.get("/")
def root():
    return {"message": "DeepMemo API is running"}
