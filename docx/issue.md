# DeepMemo V2 实现问题记录

## 1. 硬编码问题 (待确认)

**问题描述**: 后端读取文件时存在写死内容，优先检索固定目录结构。

**涉及位置**:

1. `src/routers/diary.py` - `AutoDraftRequest.output_dir` 默认值为 `"diary"`
2. `src/app/core/fs_manager.py` - `scan_directory_tree` 固定扫描 `data/` 下的 `diary/`, `ideas/`, `memory/`, `raw/` 子目录
3. `src/app/core/watcher.py` - 固定监听 `.md` 文件

**待确认方案**:
- [ ] 改为配置文件方式 (`config/fs_config.yaml`)
- [ ] 保持现状（目录结构固定）
- [ ] 其他方案

**决策人**: 用户
**状态**: 待定
