import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Command,
  Database,
  FileDown,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Link2,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Network,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import {
  createDiaryAutoDraft,
  createSession,
  deleteSession,
  getFileContent,
  getFileTree,
  getHealth,
  listMessages,
  listSessions,
  moveFile,
  sendMessage,
  updateFileSyncStatus,
  writeFile,
} from './api';
import type { ChatMessage, FsNode, Session, SyncStatus } from './types';

const exampleQuestions = [
  'DeepMemo 的产品想法是什么？',
  '最近的学习记录里有哪些工程经验？',
  '我关于 LLM-Spine 记录了哪些想法？',
];

type WorkspaceMode = 'editor' | 'qa';
type InsightTab = 'sources' | 'pulse' | 'knowledge';
type FileNode = FsNode;

type SourceChunk = {
  index: number;
  path: string;
  startLine: number;
  endLine: number;
  score?: number;
  query?: string;
  excerpt: string;
};

type ParsedMarkdown = {
  bodyLines: string[];
  sources: SourceChunk[];
};

type ContextMenuState = {
  x: number;
  y: number;
  node: FileNode;
};

type DraftInfo = {
  sourceFile?: string;
  message?: string;
};

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1].trim() === '') {
    next.pop();
  }
  return next;
}

function parseMarkdownWithSources(content: string): ParsedMarkdown {
  const lines = content.split('\n');
  const referenceIndex = lines.findIndex((line) => line.trim() === '## 引用');
  if (referenceIndex === -1) {
    return { bodyLines: lines, sources: [] };
  }

  const sourceHeaderPattern =
    /^\[(\d+)\]\s+(.+):(\d+)-(\d+)(?:\s+·\s+score=([0-9.]+))?(?:\s+·\s+query=(.*))?\s*$/;
  const sources: SourceChunk[] = [];
  let current: SourceChunk | undefined;

  const pushCurrent = () => {
    if (current) {
      sources.push({
        ...current,
        excerpt: trimTrailingBlankLines(current.excerpt.split('\n')).join('\n'),
      });
    }
  };

  for (const rawLine of lines.slice(referenceIndex + 1)) {
    const line = rawLine.trimEnd();
    const match = sourceHeaderPattern.exec(line);
    if (match) {
      pushCurrent();
      const parsedScore = match[5] ? Number(match[5]) : undefined;
      current = {
        index: Number(match[1]),
        path: match[2],
        startLine: Number(match[3]),
        endLine: Number(match[4]),
        score: parsedScore !== undefined && Number.isFinite(parsedScore) ? parsedScore : undefined,
        query: match[6],
        excerpt: '',
      };
      continue;
    }

    if (current && line.startsWith('>')) {
      const excerptLine = line.replace(/^>\s?/, '');
      current.excerpt = current.excerpt ? `${current.excerpt}\n${excerptLine}` : excerptLine;
    }
  }
  pushCurrent();

  if (sources.length === 0) {
    return { bodyLines: lines, sources: [] };
  }

  return {
    bodyLines: trimTrailingBlankLines(lines.slice(0, referenceIndex)),
    sources,
  };
}

function scoreLevel(score?: number): 'high' | 'medium' | 'low' {
  if (score === undefined || score < 0.5) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

function createOptimisticUserMessage(sessionId: string, content: string): ChatMessage {
  return {
    id: `local-${Date.now()}`,
    sessionId,
    role: 'user',
    content,
    createdAt: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
  };
}

function createSessionName(): string {
  return `会话 ${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())}`;
}

function collectFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'file') return [node];
    return collectFiles(node.children ?? []);
  });
}

function findNode(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children ? findNode(node.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

function countNodes(nodes: FileNode[]): { files: number; folders: number } {
  return nodes.reduce(
    (total, node) => {
      if (node.type === 'file') {
        total.files += 1;
      } else {
        total.folders += 1;
        const childCount = countNodes(node.children ?? []);
        total.files += childCount.files;
        total.folders += childCount.folders;
      }
      return total;
    },
    { files: 0, folders: 0 },
  );
}

function findFirstFile(nodes: FileNode[]): FileNode | undefined {
  const allFiles = collectFiles(nodes);
  return allFiles.find((node) => node.path === 'ideas/DeepMemo.md')
    ?? allFiles.find((node) => node.name.endsWith('.md'))
    ?? allFiles[0];
}

function updateNodeStatus(nodes: FileNode[], path: string, syncStatus: SyncStatus): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, syncStatus };
    }
    if (node.children) {
      return { ...node, children: updateNodeStatus(node.children, path, syncStatus) };
    }
    return node;
  });
}

function deriveEntityOptions(nodes: FileNode[], content: string): string[] {
  const fileNames = collectFiles(nodes)
    .filter((node) => node.path.startsWith('memory/') || node.path.startsWith('ideas/'))
    .map((node) => node.name.replace(/\.md$/i, '').trim())
    .filter(Boolean);
  const wikiLinks = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), (match) => match[1].trim());
  return Array.from(new Set([...wikiLinks, ...fileNames])).slice(0, 12);
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap((node) => {
    const selfMatches = `${node.name} ${node.path}`.toLowerCase().includes(normalized);
    if (node.type === 'file') {
      return selfMatches ? [node] : [];
    }
    const children = filterTree(node.children ?? [], normalized);
    if (selfMatches || children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
  });
}

function formatEditorMarkdown(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
}

function getActiveSources(messages: ChatMessage[]): SourceChunk[] {
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!lastAssistant) return [];
  return parseMarkdownWithSources(lastAssistant.content).sources;
}

function getKnowledgeCandidates(content: string, entityOptions: string[]) {
  const entities = entityOptions.filter((entity) => content.toLowerCase().includes(entity.toLowerCase()));
  const wikiLinks = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), (match) => match[1].trim());
  const headings = content
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.replace(/^##\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    entities: Array.from(new Set([...entities, ...wikiLinks])),
    relations: headings.map((heading, index) => ({
      id: `${heading}-${index}`,
      from: '当前文档',
      relation: index % 2 === 0 ? 'mentions' : 'belongs_to',
      to: heading,
    })),
  };
}

function StatusDot({ status }: { status?: SyncStatus }) {
  const labelMap: Record<SyncStatus, string> = {
    synced: '已同步',
    dirty: '有变动',
    draft: '草稿',
    processing: '处理中',
    error: '错误',
  };
  const nextStatus = status ?? 'draft';
  return (
    <span
      className={`status-dot status-dot--${nextStatus}`}
      title={labelMap[nextStatus]}
    />
  );
}

function DataExplorer({
  files,
  activeFileId,
  searchQuery,
  expanded,
  contextMenu,
  contextPaths,
  onSearchChange,
  onSelectFile,
  onToggleFolder,
  onOpenContextMenu,
  onCloseContextMenu,
  onUseAsContext,
  onRenameNode,
}: {
  files: FileNode[];
  activeFileId?: string;
  searchQuery: string;
  expanded: Set<string>;
  contextMenu?: ContextMenuState;
  contextPaths: string[];
  onSearchChange: (value: string) => void;
  onSelectFile: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onCloseContextMenu: () => void;
  onUseAsContext: (node: FileNode) => void;
  onRenameNode: (node: FileNode) => void;
}) {
  const counts = useMemo(() => countNodes(files), [files]);
  const visibleFiles = useMemo(() => filterTree(files, searchQuery), [files, searchQuery]);

  return (
    <aside className="data-explorer" onClick={onCloseContextMenu}>
      <div className="data-explorer__header">
        <div className="brand">
          <div className="brand__mark">D</div>
          <div className="brand__copy">
            <div className="brand__name">DeepMemo</div>
            <div className="brand__env">Agent Workspace</div>
          </div>
        </div>

        <div className="search-box">
          <Search size={15} />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索 data/"
            aria-label="搜索 data"
          />
        </div>
      </div>

      <div className="explorer-toolbar" aria-label="资源操作">
        <button type="button" title="新建文件">
          <FilePlus2 size={16} />
          <span>File</span>
        </button>
        <button type="button" title="新建文件夹">
          <FolderPlus size={16} />
          <span>Folder</span>
        </button>
        <button type="button" title="更多">
          <MoreHorizontal size={16} />
        </button>
      </div>

      <nav className="file-tree" aria-label="data 文件树">
        {visibleFiles.map((node) => (
          <FileTreeNode
            key={node.id}
            node={node}
            level={0}
            activeFileId={activeFileId}
            expanded={expanded}
            contextPaths={contextPaths}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
            onOpenContextMenu={onOpenContextMenu}
            onUseAsContext={onUseAsContext}
            onRenameNode={onRenameNode}
          />
        ))}
      </nav>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button">
            <Code2 size={14} />
            在终端打开
          </button>
          <button type="button" onClick={() => onUseAsContext(contextMenu.node)}>
            <Bot size={14} />
            以此为 AI 上下文
          </button>
          <button type="button" onClick={() => onRenameNode(contextMenu.node)}>
            <FileText size={14} />
            重命名
          </button>
          <button type="button" className="context-menu__danger">
            <Trash2 size={14} />
            删除
          </button>
        </div>
      )}

      <div className="data-explorer__footer">
        <div className="storage-card">
          <HardDrive size={16} />
          <div>
            <strong>38.4 MB</strong>
            <span>{counts.files} files · {counts.folders} folders</span>
          </div>
        </div>
        <div className="footer-actions">
          <button type="button" title="设置">
            <Settings size={17} />
          </button>
          <button type="button" title="用户">
            <UserRound size={17} />
            <span>byl</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function FileTreeNode({
  node,
  level,
  activeFileId,
  expanded,
  contextPaths,
  onSelectFile,
  onToggleFolder,
  onOpenContextMenu,
  onUseAsContext,
  onRenameNode,
}: {
  node: FileNode;
  level: number;
  activeFileId?: string;
  expanded: Set<string>;
  contextPaths: string[];
  onSelectFile: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onUseAsContext: (node: FileNode) => void;
  onRenameNode: (node: FileNode) => void;
}) {
  const isFolder = node.type === 'directory';
  const isExpanded = expanded.has(node.id);
  const isActive = node.id === activeFileId;
  const inContext = contextPaths.includes(node.path);

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(node.id);
    } else {
      onSelectFile(node.id);
    }
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onOpenContextMenu({ x: event.clientX, y: event.clientY, node });
  };

  return (
    <div className="file-node">
      <button
        className={`file-node__row ${isActive ? 'file-node__row--active' : ''}`}
        type="button"
        style={{ paddingLeft: 10 + level * 16 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        <span className="file-node__chevron">
          {isFolder ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {isFolder ? (
          isExpanded ? <FolderOpen className="file-node__icon" size={16} /> : <Folder className="file-node__icon" size={16} />
        ) : (
          <FileText className="file-node__icon" size={16} />
        )}
        <span className="file-node__name">{node.name}</span>
        {inContext && <AtSign className="file-node__context" size={13} />}
        {!isFolder && <StatusDot status={node.syncStatus} />}
        <span className="file-node__hover-actions">
          <span role="button" tabIndex={-1} title="新建文件" onClick={(event) => event.stopPropagation()}>
            <FilePlus2 size={13} />
          </span>
          {isFolder && (
            <span role="button" tabIndex={-1} title="以此为 AI 上下文" onClick={(event) => {
              event.stopPropagation();
              onUseAsContext(node);
            }}>
              <Bot size={13} />
            </span>
          )}
        </span>
      </button>
      {isFolder && isExpanded && (
        <div>
          {(node.children ?? []).map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              activeFileId={activeFileId}
              expanded={expanded}
              contextPaths={contextPaths}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
              onOpenContextMenu={onOpenContextMenu}
              onUseAsContext={onUseAsContext}
              onRenameNode={onRenameNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceHeader({
  activeFile,
  mode,
  apiStatus,
  refreshing,
  saving,
  onModeChange,
  onAiComplete,
  onSave,
  onFormat,
  onExport,
  onRefresh,
}: {
  activeFile?: FileNode;
  mode: WorkspaceMode;
  apiStatus: 'checking' | 'online' | 'offline';
  refreshing: boolean;
  saving: boolean;
  onModeChange: (mode: WorkspaceMode) => void;
  onAiComplete: () => void;
  onSave: () => void;
  onFormat: () => void;
  onExport: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="workspace-header">
      <div className="path-chip" title={activeFile?.path}>
        <Database size={16} />
        <span>{activeFile ? `data/${activeFile.path}` : 'data/'}</span>
      </div>

      <div className="mode-switch" aria-label="工作模式">
        <button
          className={mode === 'editor' ? 'mode-switch__button mode-switch__button--active' : 'mode-switch__button'}
          type="button"
          onClick={() => onModeChange('editor')}
        >
          <FileText size={15} />
          编辑器模式
        </button>
        <button
          className={mode === 'qa' ? 'mode-switch__button mode-switch__button--active' : 'mode-switch__button'}
          type="button"
          onClick={() => onModeChange('qa')}
        >
          <MessageSquare size={15} />
          问答模式
        </button>
      </div>

      <div className="workspace-actions">
        <span className={`api-pill api-pill--${apiStatus}`}>
          <Circle size={8} fill="currentColor" />
          {apiStatus === 'checking' ? 'Checking' : apiStatus === 'online' ? 'Online' : 'Offline'}
        </span>
        <button type="button" onClick={onAiComplete}>
          <WandSparkles size={15} />
          AI 补完
        </button>
        <button type="button" onClick={onSave} disabled={saving || !activeFile}>
          <Check size={15} />
          {saving ? '保存中' : '保存'}
        </button>
        <button type="button" onClick={onFormat}>
          <Command size={15} />
          格式化
        </button>
        <button type="button" onClick={onExport}>
          <FileDown size={15} />
          导出
        </button>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={refreshing} title="刷新问答会话">
          <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
    </header>
  );
}

function EditorContent({
  activeFile,
  value,
  streaming,
  entityOptions,
  onChange,
  onInsertEntity,
  onSlashCommand,
}: {
  activeFile?: FileNode;
  value: string;
  streaming: boolean;
  entityOptions: string[];
  onChange: (value: string) => void;
  onInsertEntity: (entity: string) => void;
  onSlashCommand: (command: 'daily' | 'extract' | 'polish') => void;
}) {
  const atQuery = useMemo(() => {
    const match = /@([\w-]*)$/i.exec(value);
    return match?.[1] ?? undefined;
  }, [value]);
  const slashOpen = /(^|\n)\/$/i.test(value);
  const entityMatches = useMemo(() => {
    if (atQuery === undefined) return [];
    return entityOptions.filter((entity) => entity.toLowerCase().includes(atQuery.toLowerCase())).slice(0, 5);
  }, [atQuery, entityOptions]);

  return (
    <section className="editor-content">
      <div className="editor-meta">
        <div>
          <strong>{activeFile?.name ?? 'untitled.md'}</strong>
          <span>{activeFile ? `data/${activeFile.path}` : '未选择文件'} · Markdown</span>
        </div>
        <div className="editor-meta__right">
          {streaming && (
            <span className="streaming-indicator">
              <Sparkles size={14} />
              Drafting
            </span>
          )}
          <StatusDot status={activeFile?.syncStatus} />
        </div>
      </div>

      <div className="editor-surface">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-label="Markdown 编辑器"
        />
        {entityMatches.length > 0 && (
          <div className="floating-menu entity-menu">
            {entityMatches.map((entity) => (
              <button type="button" key={entity} onClick={() => onInsertEntity(entity)}>
                <AtSign size={14} />
                {entity}
              </button>
            ))}
          </div>
        )}
        {slashOpen && (
          <div className="floating-menu slash-menu">
            <button type="button" onClick={() => onSlashCommand('daily')}>
              <Clock3 size={14} />
              今日日记模板
            </button>
            <button type="button" onClick={() => onSlashCommand('extract')}>
              <Network size={14} />
              抽取实体关系
            </button>
            <button type="button" onClick={() => onSlashCommand('polish')}>
              <WandSparkles size={14} />
              润色选中段落
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function MarkdownLite({ content }: { content: string }) {
  const { bodyLines, sources } = useMemo(() => parseMarkdownWithSources(content), [content]);
  const [activeSourceIndexes, setActiveSourceIndexes] = useState<Set<number>>(new Set());
  const sourceIndexes = useMemo(() => new Set(sources.map((source) => source.index)), [sources]);

  useEffect(() => {
    setActiveSourceIndexes(new Set());
  }, [content]);

  const toggleSource = (index: number) => {
    setActiveSourceIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const renderInlineText = (line: string, lineIndex: number) => {
    const parts = line.split(/(\[\d+\])/g);
    return parts.map((part, partIndex) => {
      const match = /^\[(\d+)\]$/.exec(part);
      const sourceIndex = match ? Number(match[1]) : undefined;
      if (sourceIndex && sourceIndexes.has(sourceIndex)) {
        return (
          <button
            className={`citation ${activeSourceIndexes.has(sourceIndex) ? 'citation--active' : ''}`}
            type="button"
            key={`${lineIndex}-${partIndex}-${part}`}
            onClick={() => toggleSource(sourceIndex)}
          >
            {part}
          </button>
        );
      }

      return <span key={`${lineIndex}-${partIndex}-${part}`}>{part}</span>;
    });
  };

  return (
    <div className="markdown-lite">
      {bodyLines.map((line, index) => {
        if (line.startsWith('### ')) {
          return <h3 key={`${line}-${index}`}>{renderInlineText(line.slice(4), index)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={`${line}-${index}`}>{renderInlineText(line.slice(3), index)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={`${line}-${index}`}>{renderInlineText(line.slice(2), index)}</h1>;
        }
        if (line.startsWith('- ')) {
          return (
            <p key={`${line}-${index}`} className="markdown-lite__list">
              • {renderInlineText(line.slice(2), index)}
            </p>
          );
        }
        if (line.trim() === '') {
          return <div className="markdown-lite__gap" key={`gap-${index}`} />;
        }
        return <p key={`${line}-${index}`}>{renderInlineText(line, index)}</p>;
      })}
      {sources.length > 0 && (
        <section className="reference-section" aria-label="引用">
          <h2>引用</h2>
          <div className="reference-list">
            {sources.map((source) => {
              const isActive = activeSourceIndexes.has(source.index);
              const chunkText = `${source.query ? `query: ${source.query}\n\n` : ''}${source.excerpt}`;
              return (
                <article className={`reference-item ${isActive ? 'reference-item--active' : ''}`} key={`${source.index}-${source.path}`}>
                  <button className="reference-trigger" type="button" onClick={() => toggleSource(source.index)}>
                    <span className="source-index">[{source.index}]</span>
                    <span className="reference-path">
                      {source.path}:{source.startLine}-{source.endLine}
                    </span>
                    {source.score !== undefined && (
                      <span className={`score score--${scoreLevel(source.score)}`}>
                        {Math.round(source.score * 100)}%
                      </span>
                    )}
                  </button>
                  {isActive && <pre className="reference-chunk">{chunkText}</pre>}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function MessageList({
  messages,
  loading,
  booting,
  onAskExample,
}: {
  messages: ChatMessage[];
  loading: boolean;
  booting: boolean;
  onAskExample: (question: string) => void;
}) {
  if (booting) {
    return (
      <div className="empty-state">
        <div className="typing">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (messages.length === 0 && !loading) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <Sparkles size={28} />
        </div>
        <h1>询问你的知识库</h1>
        <div className="example-grid">
          {exampleQuestions.map((question) => (
            <button type="button" key={question} onClick={() => onAskExample(question)}>
              {question}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => (
        <article className={`message message--${message.role}`} key={message.id}>
          <div className="message__meta">{message.role === 'user' ? '你' : 'DeepMemo'} · {message.createdAt}</div>
          <div className="message__bubble">
            <MarkdownLite content={message.content} />
          </div>
        </article>
      ))}
      {loading && (
        <article className="message message--assistant">
          <div className="message__meta">DeepMemo · 等待后端回复</div>
          <div className="message__bubble">
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

function ConversationHeader({
  sessions,
  activeSessionId,
  creating,
  deleting,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
}: {
  sessions: Session[];
  activeSessionId?: string;
  creating: boolean;
  deleting: boolean;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
}) {
  return (
    <div className="conversation-header">
      <select
        value={activeSessionId ?? ''}
        onChange={(event) => onSelectSession(event.target.value)}
        disabled={sessions.length === 0}
        aria-label="选择会话"
      >
        {sessions.length === 0 && <option value="">无会话</option>}
        {sessions.map((session) => (
          <option value={session.sessionId} key={session.sessionId}>
            {session.sessionName} · {session.messageIds.length}
          </option>
        ))}
      </select>
      <button type="button" onClick={onCreateSession} disabled={creating} title="新建会话">
        <MessageSquarePlus size={16} />
        新建
      </button>
      <button
        className="icon-button"
        type="button"
        disabled={deleting || !activeSessionId}
        onClick={() => activeSessionId && onDeleteSession(activeSessionId)}
        title="删除当前会话"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function AiCommandBar({
  value,
  onChange,
  onSubmit,
  onAutoDraft,
  onRefactor,
  loading,
  draftLoading,
  disabled,
  activeSession,
  contextPaths,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAutoDraft: () => void;
  onRefactor: () => void;
  loading: boolean;
  draftLoading: boolean;
  disabled: boolean;
  activeSession?: Session;
  contextPaths: string[];
}) {
  return (
    <form
      className="ai-command-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="ai-command-bar__meta">
        <span>
          <Sparkles size={14} />
          正在基于 {contextPaths.length > 0 ? contextPaths.join('、') : 'diary/ 和 skills.db'} 提供建议
        </span>
        <span>{activeSession?.sessionName ?? '未选择会话'}</span>
      </div>
      <div className="ai-command-bar__box">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入问题，或拖入 Markdown 文件"
          rows={3}
          disabled={disabled}
        />
        <div className="ai-command-bar__actions">
          <button type="button" onClick={onAutoDraft} disabled={draftLoading}>
            <WandSparkles size={16} />
            Auto-Draft
          </button>
          <button type="button" onClick={onRefactor}>
            <Code2 size={16} />
            Refactor
          </button>
          <button className="send-button" type="submit" disabled={loading || disabled || value.trim().length === 0}>
            <Send size={16} />
            发送
          </button>
        </div>
      </div>
    </form>
  );
}

function HybridWorkspace({
  mode,
  activeFile,
  editorValue,
  streaming,
  messages,
  sessions,
  activeSessionId,
  activeSession,
  input,
  loading,
  booting,
  creating,
  deleting,
  apiStatus,
  contextPaths,
  entityOptions,
  onEditorChange,
  onInsertEntity,
  onSlashCommand,
  onAskExample,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onInputChange,
  onSubmit,
  onAutoDraft,
  onRefactor,
}: {
  mode: WorkspaceMode;
  activeFile?: FileNode;
  editorValue: string;
  streaming: boolean;
  messages: ChatMessage[];
  sessions: Session[];
  activeSessionId?: string;
  activeSession?: Session;
  input: string;
  loading: boolean;
  booting: boolean;
  creating: boolean;
  deleting: boolean;
  apiStatus: 'checking' | 'online' | 'offline';
  contextPaths: string[];
  entityOptions: string[];
  onEditorChange: (value: string) => void;
  onInsertEntity: (entity: string) => void;
  onSlashCommand: (command: 'daily' | 'extract' | 'polish') => void;
  onAskExample: (question: string) => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAutoDraft: () => void;
  onRefactor: () => void;
}) {
  return (
    <section className="hybrid-workspace">
      <div className="workspace-body">
        {mode === 'editor' ? (
          <EditorContent
            activeFile={activeFile}
            value={editorValue}
            streaming={streaming}
            entityOptions={entityOptions}
            onChange={onEditorChange}
            onInsertEntity={onInsertEntity}
            onSlashCommand={onSlashCommand}
          />
        ) : (
          <div className="qa-panel">
            <ConversationHeader
              sessions={sessions}
              activeSessionId={activeSessionId}
              creating={creating}
              deleting={deleting}
              onSelectSession={onSelectSession}
              onCreateSession={onCreateSession}
              onDeleteSession={onDeleteSession}
            />
            <MessageList messages={messages} loading={loading} booting={booting} onAskExample={onAskExample} />
          </div>
        )}
      </div>

      <AiCommandBar
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        onAutoDraft={onAutoDraft}
        onRefactor={onRefactor}
        loading={loading}
        draftLoading={streaming}
        disabled={booting || apiStatus !== 'online' || !activeSessionId}
        activeSession={activeSession}
        contextPaths={contextPaths}
      />
    </section>
  );
}

function InsightsPanel({
  activeTab,
  activeFile,
  editorValue,
  messages,
  entityOptions,
  fileCounts,
  contextPaths,
  draftInfo,
  confirmedEntities,
  onTabChange,
  onConfirmEntity,
}: {
  activeTab: InsightTab;
  activeFile?: FileNode;
  editorValue: string;
  messages: ChatMessage[];
  entityOptions: string[];
  fileCounts: { files: number; folders: number };
  contextPaths: string[];
  draftInfo?: DraftInfo;
  confirmedEntities: Set<string>;
  onTabChange: (tab: InsightTab) => void;
  onConfirmEntity: (entity: string) => void;
}) {
  const sources = useMemo(() => getActiveSources(messages), [messages]);
  const knowledge = useMemo(() => getKnowledgeCandidates(editorValue, entityOptions), [editorValue, entityOptions]);

  return (
    <aside className="insights-panel">
      <div className="insights-panel__header">
        <div>
          <strong>Insights</strong>
          <span>{activeFile?.name ?? '未选择文件'}</span>
        </div>
      </div>

      <div className="insight-tabs" role="tablist" aria-label="智能上下文面板">
        <button className={activeTab === 'sources' ? 'active' : ''} type="button" onClick={() => onTabChange('sources')}>
          <Link2 size={15} />
          Sources
        </button>
        <button className={activeTab === 'pulse' ? 'active' : ''} type="button" onClick={() => onTabChange('pulse')}>
          <Clock3 size={15} />
          Pulse
        </button>
        <button className={activeTab === 'knowledge' ? 'active' : ''} type="button" onClick={() => onTabChange('knowledge')}>
          <Network size={15} />
          Knowledge
        </button>
      </div>

      <div className="insights-panel__body">
        {activeTab === 'sources' && <SourcesView sources={sources} />}
        {activeTab === 'pulse' && (
          <DailyPulse activeFile={activeFile} counts={fileCounts} contextPaths={contextPaths} draftInfo={draftInfo} />
        )}
        {activeTab === 'knowledge' && (
          <KnowledgeExtraction
            entities={knowledge.entities}
            relations={knowledge.relations}
            confirmedEntities={confirmedEntities}
            onConfirmEntity={onConfirmEntity}
          />
        )}
      </div>
    </aside>
  );
}

function SourcesView({ sources }: { sources: SourceChunk[] }) {
  if (sources.length === 0) {
    return (
      <div className="empty-panel">
        <Link2 size={18} />
        <span>暂无引用片段</span>
      </div>
    );
  }

  return (
    <div className="source-list">
      {sources.map((source) => (
        <article className="source-card" key={`${source.index}-${source.path}`}>
          <div className="source-card__top">
            <span className="source-index">[{source.index}]</span>
            {source.score !== undefined && (
              <span className={`score score--${scoreLevel(source.score)}`}>
                {Math.round(source.score * 100)}%
              </span>
            )}
          </div>
          <strong>{source.path}</strong>
          <span className="source-card__file">Lines {source.startLine}-{source.endLine}</span>
          <p>{source.excerpt}</p>
        </article>
      ))}
    </div>
  );
}

function DailyPulse({
  activeFile,
  counts,
  contextPaths,
  draftInfo,
}: {
  activeFile?: FileNode;
  counts: { files: number; folders: number };
  contextPaths: string[];
  draftInfo?: DraftInfo;
}) {
  return (
    <div className="pulse-list">
      <article className="pulse-card">
        <div className="pulse-card__icon">
          <FileText size={16} />
        </div>
        <div>
          <strong>当前文件</strong>
          <p>{activeFile ? `data/${activeFile.path} · ${activeFile.syncStatus}` : '后端未返回可编辑文件'}</p>
        </div>
      </article>
      <article className="pulse-card">
        <div className="pulse-card__icon">
          <Database size={16} />
        </div>
        <div>
          <strong>文件系统</strong>
          <p>{counts.files} files · {counts.folders} folders · 来自 /api/fs/tree</p>
        </div>
      </article>
      <article className="pulse-card">
        <div className="pulse-card__icon">
          <Bot size={16} />
        </div>
        <div>
          <strong>AI 上下文</strong>
          <p>{contextPaths.length > 0 ? contextPaths.join('、') : '未选择上下文目录'}</p>
        </div>
      </article>
      {draftInfo && (
        <article className="pulse-card">
          <div className="pulse-card__icon">
            <WandSparkles size={16} />
          </div>
          <div>
            <strong>自动草稿</strong>
            <p>{draftInfo.sourceFile ? `${draftInfo.sourceFile} · ${draftInfo.message ?? ''}` : draftInfo.message}</p>
          </div>
        </article>
      )}
    </div>
  );
}

function KnowledgeExtraction({
  entities,
  relations,
  confirmedEntities,
  onConfirmEntity,
}: {
  entities: string[];
  relations: Array<{ id: string; from: string; relation: string; to: string }>;
  confirmedEntities: Set<string>;
  onConfirmEntity: (entity: string) => void;
}) {
  return (
    <div className="knowledge-view">
      <section>
        <h3>Entity Candidates</h3>
        <div className="entity-list">
          {entities.map((entity) => {
            const confirmed = confirmedEntities.has(entity);
            return (
              <button
                className={confirmed ? 'entity-chip entity-chip--confirmed' : 'entity-chip'}
                type="button"
                key={entity}
                onClick={() => onConfirmEntity(entity)}
              >
                {confirmed ? <Check size={14} /> : <Circle size={14} />}
                {entity}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>Relation Candidates</h3>
        <div className="relation-list">
          {relations.length === 0 ? (
            <div className="empty-panel empty-panel--compact">
              <Network size={16} />
              <span>暂无关系候选</span>
            </div>
          ) : (
            relations.map((relation) => (
              <article className="relation-card" key={relation.id}>
                <span>{relation.from}</span>
                <strong>{relation.relation}</strong>
                <span>{relation.to}</span>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<WorkspaceMode>('editor');
  const [insightTab, setInsightTab] = useState<InsightTab>('knowledge');
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [contextPaths, setContextPaths] = useState<string[]>(['diary', 'ideas']);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftInfo, setDraftInfo] = useState<DraftInfo>();
  const [confirmedEntities, setConfirmedEntities] = useState<Set<string>>(new Set());

  const activeFile = useMemo(
    () => (activeFileId ? findNode(files, activeFileId) : undefined),
    [activeFileId, files],
  );
  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId),
    [activeSessionId, sessions],
  );
  const editorValue = activeFileId ? fileContents[activeFileId] ?? '' : '';
  const fileCounts = useMemo(() => countNodes(files), [files]);
  const entityOptions = useMemo(() => deriveEntityOptions(files, editorValue), [files, editorValue]);

  const setActiveEditorValue = (value: string) => {
    if (!activeFileId) return;
    setFileContents((current) => ({ ...current, [activeFileId]: value }));
    if (activeFile && activeFile.type === 'file' && activeFile.syncStatus === 'synced') {
      setFiles((current) => updateNodeStatus(current, activeFile.path, 'dirty'));
      updateFileSyncStatus(activeFile.path, 'dirty').catch(() => {
        setFiles((current) => updateNodeStatus(current, activeFile.path, 'error'));
      });
    }
  };

  const refreshSessionList = async (preferredSessionId?: string) => {
    const remoteSessions = await listSessions();
    setSessions(remoteSessions);
    const nextActiveId = preferredSessionId ?? activeSessionId ?? remoteSessions[0]?.sessionId;
    setActiveSessionId(nextActiveId);
    return nextActiveId;
  };

  const ensureSession = async () => {
    const remoteSessions = await listSessions();
    if (remoteSessions.length > 0) {
      setSessions(remoteSessions);
      setActiveSessionId(remoteSessions[0].sessionId);
      return remoteSessions[0].sessionId;
    }

    const created = await createSession(createSessionName());
    setSessions([created]);
    setActiveSessionId(created.sessionId);
    return created.sessionId;
  };

  const loadMessagesForSession = async (sessionId: string) => {
    const remoteMessages = await listMessages(sessionId);
    setMessages(remoteMessages);
  };

  const loadFileContent = async (node: FileNode) => {
    if (node.type !== 'file') return;
    const response = await getFileContent(node.path);
    setFileContents((current) => ({ ...current, [node.id]: response.content }));
  };

  const refreshFileTree = async (preferredFileId?: string) => {
    const remoteFiles = await getFileTree();
    setFiles(remoteFiles);
    setExpanded((current) => new Set([...current, ...remoteFiles.map((node) => node.id)]));

    const preferred = preferredFileId ? findNode(remoteFiles, preferredFileId) : undefined;
    const nextFile = preferred?.type === 'file' ? preferred : findFirstFile(remoteFiles);
    setActiveFileId(nextFile?.id);
    return nextFile;
  };

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBooting(true);
      setError(undefined);
      try {
        await getHealth();
        if (cancelled) return;
        setApiStatus('online');
        const sessionId = await ensureSession();
        if (cancelled) return;
        const nextFile = await refreshFileTree(activeFileId);
        if (cancelled) return;
        await Promise.all([
          loadMessagesForSession(sessionId),
          nextFile ? loadFileContent(nextFile) : Promise.resolve(),
        ]);
      } catch (caught) {
        if (cancelled) return;
        setApiStatus('offline');
        setError(caught instanceof Error ? caught.message : '后端连接失败');
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId || booting) return;
    setError(undefined);
    loadMessagesForSession(activeSessionId).catch((caught) => {
      setError(caught instanceof Error ? caught.message : '消息加载失败');
    });
  }, [activeSessionId, booting]);

  useEffect(() => {
    if (!activeFile || activeFile.type !== 'file' || fileContents[activeFile.id] !== undefined) return;
    let cancelled = false;
    setError(undefined);
    loadFileContent(activeFile).catch((caught) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : '文件读取失败');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeFile?.id]);

  const handleCreateSession = async () => {
    setCreating(true);
    setError(undefined);
    try {
      const created = await createSession(createSessionName());
      setSessions((current) => [created, ...current]);
      setActiveSessionId(created.sessionId);
      setMessages([]);
      setMode('qa');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '新建会话失败');
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(undefined);
    try {
      await getHealth();
      setApiStatus('online');
      const selectedId = await refreshSessionList(activeSessionId);
      const nextFile = await refreshFileTree(activeFileId);
      if (selectedId) {
        await loadMessagesForSession(selectedId);
      }
      if (nextFile) {
        await loadFileContent(nextFile);
      }
    } catch (caught) {
      setApiStatus('offline');
      setError(caught instanceof Error ? caught.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeleting(true);
    setError(undefined);
    try {
      await deleteSession(sessionId);
      const remaining = sessions.filter((session) => session.sessionId !== sessionId);
      if (remaining.length > 0) {
        setSessions(remaining);
        if (activeSessionId === sessionId) {
          setActiveSessionId(remaining[0].sessionId);
          await loadMessagesForSession(remaining[0].sessionId);
        }
      } else {
        const created = await createSession(createSessionName());
        setSessions([created]);
        setActiveSessionId(created.sessionId);
        setMessages([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除会话失败');
    } finally {
      setDeleting(false);
    }
  };

  const submitQuestion = async (question = input) => {
    const trimmed = question.trim();
    if (!trimmed || loading || !activeSessionId) return;

    const optimistic = createOptimisticUserMessage(activeSessionId, trimmed);
    setMode('qa');
    setInsightTab('sources');
    setInput('');
    setLoading(true);
    setError(undefined);
    setMessages((current) => [...current, optimistic]);

    try {
      const aiMessage = await sendMessage(activeSessionId, trimmed);
      setMessages((current) => [...current, aiMessage]);
      await refreshSessionList(activeSessionId);
      const persistedMessages = await listMessages(activeSessionId);
      setMessages(persistedMessages);
    } catch (caught) {
      try {
        const persistedMessages = await listMessages(activeSessionId);
        setMessages(persistedMessages);
        await refreshSessionList(activeSessionId);
      } catch {
        setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      }
      setError(caught instanceof Error ? caught.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFolder = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectFile = (id: string) => {
    setActiveFileId(id);
    setMode('editor');
    setInsightTab('knowledge');
  };

  const handleUseAsContext = (node: FileNode) => {
    setContextPaths((current) => {
      if (current.includes(node.path)) return current;
      return [...current.slice(-2), node.path];
    });
    setContextMenu(undefined);
  };

  const handleAutoDraft = async () => {
    if (drafting) return;
    setMode('editor');
    setInsightTab('pulse');
    setDrafting(true);
    setError(undefined);
    try {
      const response = await createDiaryAutoDraft('raw', 'diary');
      setDraftInfo({ sourceFile: response.sourceFile, message: response.message });
      if (response.draft.trim().length > 0) {
        setActiveEditorValue(response.draft);
      } else {
        setError(response.message || '后端没有生成草稿');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '自动草稿生成失败');
    } finally {
      setDrafting(false);
    }
  };

  const handleSave = async () => {
    if (!activeFile || activeFile.type !== 'file') return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await writeFile(activeFile.path, editorValue);
      setFiles((current) => updateNodeStatus(current, response.file_path, response.sync_status));
      const refreshedFile = await refreshFileTree(activeFile.id);
      if (refreshedFile) {
        await loadFileContent(refreshedFile);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件保存失败');
      setFiles((current) => updateNodeStatus(current, activeFile.path, 'error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRenameNode = async (node: FileNode) => {
    setContextMenu(undefined);
    if (node.type !== 'file') {
      setError('当前后端 move 接口仅用于文件重命名');
      return;
    }
    const nextPath = window.prompt('输入新的相对路径', node.path)?.trim();
    if (!nextPath || nextPath === node.path) return;
    setError(undefined);
    try {
      const response = await moveFile(node.path, nextPath);
      setFileContents((current) => {
        const next = { ...current };
        if (next[node.id] !== undefined) {
          next[response.new_path] = next[node.id];
          delete next[node.id];
        }
        return next;
      });
      const nextFile = await refreshFileTree(response.new_path);
      if (nextFile) {
        await loadFileContent(nextFile);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重命名失败');
    }
  };

  const requestEditorAi = async (prompt: string, heading: string) => {
    if (!activeSessionId || loading) {
      setError('需要可用会话后才能调用后端 AI 接口');
      return;
    }
    const optimistic = createOptimisticUserMessage(activeSessionId, prompt);
    setLoading(true);
    setError(undefined);
    setMessages((current) => [...current, optimistic]);
    try {
      const aiMessage = await sendMessage(activeSessionId, prompt);
      setMessages((current) => [...current, aiMessage]);
      setActiveEditorValue(`${editorValue.trimEnd()}\n\n## ${heading}\n\n${aiMessage.content.trim()}\n`);
      await refreshSessionList(activeSessionId);
      const persistedMessages = await listMessages(activeSessionId);
      setMessages(persistedMessages);
    } catch (caught) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setError(caught instanceof Error ? caught.message : `${heading}失败`);
    } finally {
      setLoading(false);
      setMode('editor');
    }
  };

  const handleAiComplete = () => {
    requestEditorAi(
      `请基于当前文件 ${activeFile?.path ?? '未选择文件'} 和上下文 ${contextPaths.join('、')}，补完下面的 Markdown，不要编造未给出的事实：\n\n${editorValue}`,
      'AI 补完',
    );
  };

  const handleFormat = () => {
    setActiveEditorValue(formatEditorMarkdown(editorValue));
  };

  const handleExport = () => {
    submitQuestion(`请将 ${activeFile?.path ?? '当前文档'} 导出为 Wiki/PDF 结构，并保留引用证据。`);
  };

  const handleRefactor = () => {
    requestEditorAi(
      `请润色并重构当前 Markdown，保留事实和引用，按“结论 -> 证据 -> 下一步”的结构输出：\n\n${editorValue}`,
      'Refactor',
    );
  };

  const handleInsertEntity = (entity: string) => {
    setActiveEditorValue(editorValue.replace(/@([\w-]*)$/i, `[[${entity}]]`));
  };

  const handleSlashCommand = (command: 'daily' | 'extract' | 'polish') => {
    if (command === 'daily') {
      handleAutoDraft();
    }
    if (command === 'extract') {
      setInsightTab('knowledge');
      setActiveEditorValue(`${editorValue.replace(/\/$/i, '').trimEnd()}\n\n<!-- extract-knowledge queued -->\n`);
    }
    if (command === 'polish') {
      requestEditorAi(
        `请润色当前 Markdown，保持原意，压缩重复表达，并补充可追溯证据提示：\n\n${editorValue.replace(/\/$/i, '').trimEnd()}`,
        'Polish',
      );
    }
  };

  const handleConfirmEntity = (entity: string) => {
    setConfirmedEntities((current) => {
      const next = new Set(current);
      if (next.has(entity)) {
        next.delete(entity);
      } else {
        next.add(entity);
      }
      return next;
    });
  };

  return (
    <div className="app-shell">
      <DataExplorer
        files={files}
        activeFileId={activeFileId}
        searchQuery={searchQuery}
        expanded={expanded}
        contextMenu={contextMenu}
        contextPaths={contextPaths}
        onSearchChange={setSearchQuery}
        onSelectFile={handleSelectFile}
        onToggleFolder={handleToggleFolder}
        onOpenContextMenu={setContextMenu}
        onCloseContextMenu={() => setContextMenu(undefined)}
        onUseAsContext={handleUseAsContext}
        onRenameNode={handleRenameNode}
      />

      <main className="workspace">
        <WorkspaceHeader
          activeFile={activeFile}
          mode={mode}
          apiStatus={apiStatus}
          refreshing={refreshing}
          saving={saving}
          onModeChange={setMode}
          onAiComplete={handleAiComplete}
          onSave={handleSave}
          onFormat={handleFormat}
          onExport={handleExport}
          onRefresh={handleRefresh}
        />
        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        <HybridWorkspace
          mode={mode}
          activeFile={activeFile}
          editorValue={editorValue}
          streaming={drafting}
          messages={messages}
          sessions={sessions}
          activeSessionId={activeSessionId}
          activeSession={activeSession}
          input={input}
          loading={loading}
          booting={booting}
          creating={creating}
          deleting={deleting}
          apiStatus={apiStatus}
          contextPaths={contextPaths}
          entityOptions={entityOptions}
          onEditorChange={setActiveEditorValue}
          onInsertEntity={handleInsertEntity}
          onSlashCommand={handleSlashCommand}
          onAskExample={submitQuestion}
          onSelectSession={setActiveSessionId}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onInputChange={setInput}
          onSubmit={() => submitQuestion()}
          onAutoDraft={handleAutoDraft}
          onRefactor={handleRefactor}
        />
      </main>

      <InsightsPanel
        activeTab={insightTab}
        activeFile={activeFile}
        editorValue={editorValue}
        messages={messages}
        entityOptions={entityOptions}
        fileCounts={fileCounts}
        contextPaths={contextPaths}
        draftInfo={draftInfo}
        confirmedEntities={confirmedEntities}
        onTabChange={setInsightTab}
        onConfirmEntity={handleConfirmEntity}
      />
    </div>
  );
}
