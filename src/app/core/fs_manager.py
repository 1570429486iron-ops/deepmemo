import hashlib
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional
import sqlite3

REPO_ROOT = Path(__file__).resolve().parents[3]
DATABASE_PATH = REPO_ROOT / "data.db"
DATA_DIR = REPO_ROOT / "data"

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def compute_file_hash(file_path: Path) -> str:
    if not file_path.exists():
        return ""
    with open(file_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

def get_file_meta(file_path: str) -> Optional[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT * FROM file_meta WHERE file_path = ?", (file_path,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_file_meta(file_path: str, file_hash: str, sync_status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO file_meta (id, file_path, file_hash, sync_status, last_modified, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            file_hash = excluded.file_hash,
            sync_status = excluded.sync_status,
            last_modified = excluded.last_modified
    """, (str(uuid.uuid4()), file_path, file_hash, sync_status, now, now))
    conn.commit()
    conn.close()

def update_sync_status(file_path: str, sync_status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    result = cursor.execute(
        "UPDATE file_meta SET sync_status = ?, last_modified = ? WHERE file_path = ?",
        (sync_status, now, file_path)
    )
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        upsert_file_meta(file_path, compute_file_hash(DATA_DIR / file_path), sync_status)

def read_file_content(file_path: str) -> str:
    full_path = DATA_DIR / file_path
    if not full_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    with open(full_path, "r", encoding="utf-8") as f:
        return f.read()

def write_file_content(file_path: str, content: str) -> dict:
    full_path = DATA_DIR / file_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    # 更新 file_meta
    file_hash = compute_file_hash(full_path)
    upsert_file_meta(file_path, file_hash, "synced")
    return {
        "file_path": file_path,
        "file_hash": file_hash,
        "sync_status": "synced",
        "last_modified": datetime.now().isoformat()
    }

def move_file(old_path: str, new_path: str) -> dict:
    old_full = DATA_DIR / old_path
    new_full = DATA_DIR / new_path
    if not old_full.exists():
        raise FileNotFoundError(f"Source file not found: {old_path}")
    new_full.parent.mkdir(parents=True, exist_ok=True)
    old_full.rename(new_full)
    # 更新 file_meta
    file_hash = compute_file_hash(new_full)
    upsert_file_meta(new_path, file_hash, "synced")
    update_sync_status(old_path, "dirty")  # 标记旧路径为 dirty
    return {
        "old_path": old_path,
        "new_path": new_path,
        "file_hash": file_hash,
        "sync_status": "synced"
    }

def scan_directory_tree(base_path: str = "") -> list:
    """递归扫描 data/ 目录，返回嵌套 JSON"""
    scan_path = DATA_DIR / base_path if base_path else DATA_DIR
    result = []
    if not scan_path.exists():
        return result
    for item in sorted(scan_path.iterdir()):
        rel_path = str(item.relative_to(DATA_DIR))
        meta = get_file_meta(rel_path)
        sync_status = meta["sync_status"] if meta else "synced"
        if item.is_dir():
            result.append({
                "name": item.name,
                "path": rel_path,
                "type": "directory",
                "sync_status": sync_status,
                "children": scan_directory_tree(rel_path)
            })
        else:
            result.append({
                "name": item.name,
                "path": rel_path,
                "type": "file",
                "sync_status": sync_status
            })
    return result
