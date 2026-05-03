import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from src.ai.service import knowledge_qa_service
from src.app.database import get_db_connection
from src.models.schemas import ChatRequest, MessageResponse

router = APIRouter(prefix="/chat", tags=["chat"])


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
    message_ids = json.loads(cursor.execute("SELECT message_ids FROM session WHERE session_id = ?", (session_id,)).fetchone()["message_ids"])
    messages = []
    for mid in message_ids:
        row = cursor.execute("SELECT * FROM message WHERE message_id = ?", (mid,)).fetchone()
        if row:
            role = "assistant" if row["role"] == "ai" else row["role"]
            messages.append({"role": role, "content": row["content"]})
    conn.close()
    return messages


@router.post("/", response_model=MessageResponse)
def chat(request: ChatRequest):
    session = get_session_row(request.session_id)
    message_ids = json.loads(session["message_ids"])
    llm_messages = build_llm_messages(request.session_id)

    user_msg_id = str(uuid.uuid4())
    save_message(user_msg_id, request.session_id, "user", request.user_message)
    message_ids.append(user_msg_id)

    answer = knowledge_qa_service.answer(request.user_message, history=llm_messages)
    ai_content = answer.content

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


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
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
