import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileUp,
  MessageSquare,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  createSession,
  deleteSession,
  getHealth,
  listMessages,
  listSessions,
  sendMessage,
} from './api';
import type { ChatMessage, Session } from './types';

const exampleQuestions = [
  'DeepMemo 的产品想法是什么？',
  '最近的学习记录里有哪些工程经验？',
  '我关于 LLM-Spine 记录了哪些想法？',
];

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

function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  collapsed,
  onToggle,
  creating,
}: {
  sessions: Session[];
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  collapsed: boolean;
  onToggle: () => void;
  creating: boolean;
}) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="brand">
        <div className="brand__mark">D</div>
        {!collapsed && (
          <div>
            <div className="brand__name">DeepMemo</div>
            <div className="brand__env">Knowledge QA</div>
          </div>
        )}
      </div>

      <button className="icon-button sidebar__toggle" type="button" onClick={onToggle} title="切换侧边栏">
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      <nav className="sidebar__nav" aria-label="会话">
        <div className="nav-heading">
          {!collapsed && <div className="nav-label">会话</div>}
          <button className="icon-button" type="button" onClick={onCreateSession} title="新建会话" disabled={creating}>
            <MessageSquarePlus size={18} />
          </button>
        </div>
        {sessions.map((session) => (
          <button
            className={`kb-item ${session.sessionId === activeSessionId ? 'kb-item--active' : ''}`}
            type="button"
            key={session.sessionId}
            onClick={() => onSelectSession(session.sessionId)}
            title={session.sessionName}
          >
            <MessageSquare size={18} />
            {!collapsed && (
              <span className="kb-item__body">
                <span className="kb-item__top">
                  <span>{session.sessionName}</span>
                  <span className="status-dot status-dot--ready" />
                </span>
                <span className="kb-item__meta">
                  {session.messageIds.length} 条消息 · {session.updatedAt}
                </span>
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button className="side-action" type="button" onClick={onCreateSession} title="新建会话" disabled={creating}>
          <FileUp size={18} />
          {!collapsed && <span>新建会话</span>}
        </button>
        <button className="side-action" type="button" title="设置">
          <Settings size={18} />
          {!collapsed && <span>设置</span>}
        </button>
        <button className="side-action" type="button" title="用户">
          <UserRound size={18} />
          {!collapsed && <span>byl</span>}
        </button>
      </div>
    </aside>
  );
}

function TopBar({
  activeSession,
  apiStatus,
  onRefresh,
  onDeleteSession,
  detailsOpen,
  onToggleDetails,
  refreshing,
  deleting,
}: {
  activeSession?: Session;
  apiStatus: 'checking' | 'online' | 'offline';
  onRefresh: () => void;
  onDeleteSession: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  refreshing: boolean;
  deleting: boolean;
}) {
  const statusText = {
    checking: '检查中',
    online: '后端已连接',
    offline: '连接异常',
  }[apiStatus];

  return (
    <header className="topbar">
      <div className="topbar__title">
        <BookOpen size={20} />
        <div>
          <div className="topbar__name">{activeSession?.sessionName ?? '未选择会话'}</div>
          <div className="topbar__sub">通过 /chat 调用本地知识库 RAG</div>
        </div>
        <span className={`pill pill--${apiStatus === 'online' ? 'ready' : 'indexing'}`}>{statusText}</span>
      </div>

      <div className="topbar__actions">
        <button className="icon-button" type="button" onClick={onRefresh} title="刷新会话" disabled={refreshing}>
          <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onDeleteSession}
          title="删除当前会话"
          disabled={!activeSession || deleting}
        >
          <Trash2 size={18} />
        </button>
        <button className="icon-button" type="button" onClick={onToggleDetails} title="切换详情面板">
          {detailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </header>
  );
}

function MarkdownLite({ content }: { content: string }) {
  const { bodyLines, sources } = useMemo(() => parseMarkdownWithSources(content), [content]);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number>();
  const sourceIndexes = useMemo(() => new Set(sources.map((source) => source.index)), [sources]);

  useEffect(() => {
    setActiveSourceIndex(undefined);
  }, [content]);

  const renderInlineText = (line: string, lineIndex: number) => {
    const parts = line.split(/(\[\d+\])/g);
    return parts.map((part, partIndex) => {
      const match = /^\[(\d+)\]$/.exec(part);
      const sourceIndex = match ? Number(match[1]) : undefined;
      if (sourceIndex && sourceIndexes.has(sourceIndex)) {
        return (
          <button
            className={`citation ${activeSourceIndex === sourceIndex ? 'citation--active' : ''}`}
            type="button"
            key={`${lineIndex}-${partIndex}-${part}`}
            onClick={() => setActiveSourceIndex(sourceIndex)}
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
              const isActive = activeSourceIndex === source.index;
              const chunkText = `${source.query ? `query: ${source.query}\n\n` : ''}${source.excerpt}`;
              return (
                <article className={`reference-item ${isActive ? 'reference-item--active' : ''}`} key={`${source.index}-${source.path}`}>
                  <button
                    className="reference-trigger"
                    type="button"
                    onClick={() => setActiveSourceIndex(isActive ? undefined : source.index)}
                  >
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
        <p>DeepMemo 会先检索 data/ 下的 Markdown 证据，再生成回答。</p>
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

function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  disabled,
  activeSession,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  activeSession?: Session;
}) {
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="composer__meta">
        <span>
          <Search size={14} />
          {activeSession?.sessionName ?? '未选择会话'}
        </span>
        <span>本地知识库优先</span>
      </div>
      <div className="composer__box">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入问题，DeepMemo 会检索本地 Markdown 知识库后回答"
          rows={3}
          disabled={disabled}
        />
        <div className="composer__actions">
          <button className="icon-button" type="button" title="上传资料" disabled>
            <FileUp size={18} />
          </button>
          <button className="send-button" type="submit" disabled={loading || disabled || value.trim().length === 0}>
            <Send size={17} />
            发送
          </button>
        </div>
      </div>
    </form>
  );
}

function DetailsPanel({
  activeSession,
  messages,
  apiStatus,
}: {
  activeSession?: Session;
  messages: ChatMessage[];
  apiStatus: 'checking' | 'online' | 'offline';
}) {
  return (
    <aside className="sources-panel">
      <div className="sources-panel__header">
        <div>
          <div className="sources-panel__title">会话详情</div>
          <div className="sources-panel__sub">按 design.md API 对接</div>
        </div>
      </div>

      {!activeSession ? (
        <div className="sources-empty">等待会话加载</div>
      ) : (
        <div className="source-list">
          <section className="source-card source-card--static">
            <div className="source-card__title">{activeSession.sessionName}</div>
            <div className="source-card__file">Session ID</div>
            <p>{activeSession.sessionId}</p>
          </section>
          <section className="source-card source-card--static">
            <div className="source-card__title">消息统计</div>
            <div className="source-card__file">GET /chat/{'{session_id}'}/messages</div>
            <p>当前加载 {messages.length} 条消息，后端记录 {activeSession.messageIds.length} 条消息。</p>
          </section>
          <section className="source-card source-card--static">
            <div className="source-card__title">AI 管线</div>
            <div className="source-card__file">POST /chat</div>
            <p>聊天接口保持 MessageResponse 结构不变，内部已接入 QueryRouter、LocalSearchAgent 和 AnswerComposer。</p>
          </section>
          <section className="source-card source-card--static">
            <div className="source-card__title">接口状态</div>
            <div className="source-card__file">GET /</div>
            <p>{apiStatus === 'online' ? '后端服务正常响应。' : '后端暂未正常响应，请确认服务已启动在 8000 端口。'}</p>
          </section>
        </div>
      )}
    </aside>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [error, setError] = useState<string>();

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId),
    [activeSessionId, sessions],
  );

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
        await loadMessagesForSession(sessionId);
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
  }, [activeSessionId]);

  const handleCreateSession = async () => {
    setCreating(true);
    setError(undefined);
    try {
      const created = await createSession(createSessionName());
      setSessions((current) => [created, ...current]);
      setActiveSessionId(created.sessionId);
      setMessages([]);
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
      if (selectedId) {
        await loadMessagesForSession(selectedId);
      }
    } catch (caught) {
      setApiStatus('offline');
      setError(caught instanceof Error ? caught.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!activeSessionId) return;
    setDeleting(true);
    setError(undefined);
    try {
      await deleteSession(activeSessionId);
      const remaining = sessions.filter((session) => session.sessionId !== activeSessionId);
      if (remaining.length > 0) {
        setSessions(remaining);
        setActiveSessionId(remaining[0].sessionId);
        await loadMessagesForSession(remaining[0].sessionId);
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

  return (
    <div className="app-shell">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={handleCreateSession}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        creating={creating}
      />

      <main className="workspace">
        <TopBar
          activeSession={activeSession}
          apiStatus={apiStatus}
          onRefresh={handleRefresh}
          onDeleteSession={handleDeleteSession}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          refreshing={refreshing}
          deleting={deleting}
        />
        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        <section className="chat-panel">
          <MessageList messages={messages} loading={loading} booting={booting} onAskExample={submitQuestion} />
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submitQuestion()}
            loading={loading}
            disabled={booting || apiStatus !== 'online' || !activeSessionId}
            activeSession={activeSession}
          />
        </section>
      </main>

      {detailsOpen && <DetailsPanel activeSession={activeSession} messages={messages} apiStatus={apiStatus} />}
    </div>
  );
}
