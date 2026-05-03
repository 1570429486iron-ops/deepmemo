from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.app.core.fs_manager import (
    read_file_content,
    write_file_content,
    move_file,
    scan_directory_tree,
    update_sync_status,
)

router = APIRouter(prefix="/api/fs", tags=["filesystem"])


class WriteRequest(BaseModel):
    path: str
    content: str


class MoveRequest(BaseModel):
    old_path: str
    new_path: str


class SyncStatusRequest(BaseModel):
    path: str
    sync_status: str


@router.get("/tree")
def get_tree():
    """递归扫描 data/ 目录，返回嵌套 JSON"""
    return scan_directory_tree()


@router.get("/content")
def get_content(path: str):
    """读取物理文件并返回字符串"""
    try:
        return {"path": path, "content": read_file_content(path)}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/write")
def write_file(data: WriteRequest):
    """接收 Markdown 内容并写入物理磁盘，同时更新 file_hash"""
    try:
        result = write_file_content(data.path, data.content)
        return {"message": "File written successfully", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/move")
def move_file_api(data: MoveRequest):
    """处理重命名或拖拽移动"""
    try:
        result = move_file(data.old_path, data.new_path)
        return {"message": "File moved successfully", **result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sync-status")
def patch_sync_status(data: SyncStatusRequest):
    """更新文件的 sync_status"""
    try:
        update_sync_status(data.path, data.sync_status)
        return {"message": "Sync status updated", "path": data.path, "sync_status": data.sync_status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
