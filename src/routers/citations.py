import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.app.database import get_db_connection

router = APIRouter(prefix="/api/chat", tags=["citations"])


class Citation(BaseModel):
    local_id: int
    evidence_id: str
    file_path: str
    content: str


class CitationsResponse(BaseModel):
    message_id: str
    citations: list[Citation]


@router.get("/citations", response_model=CitationsResponse)
def get_citations(message_id: str):
    """获取特定消息的详细引用证据链"""
    conn = get_db_connection()
    cursor = conn.cursor()

    row = cursor.execute(
        "SELECT message_id, content, citations FROM message WHERE message_id = ?",
        (message_id,)
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Message not found")

    try:
        citations = json.loads(row["citations"] or "[]")
    except json.JSONDecodeError:
        citations = []

    return CitationsResponse(
        message_id=row["message_id"],
        citations=[
            Citation(
                local_id=c.get("local_id", index),
                evidence_id=c.get("evidence_id", ""),
                file_path=c.get("file_path", ""),
                content=c.get("content", "")
            )
            for index, c in enumerate(citations, start=1)
        ]
    )
