import { RefreshCw, Download, Trash2, PanelRightClose, PanelRight } from 'lucide-react';
import { KnowledgeBase, SearchMode } from '../types';
import '../styles/TopBar.css';

interface TopBarProps {
  knowledgeBase: KnowledgeBase | null;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onRefresh: () => void;
  onClear: () => void;
  onToggleSources: () => void;
  sourcesVisible: boolean;
  isLoading: boolean;
}

export function TopBar({
  knowledgeBase,
  searchMode,
  onSearchModeChange,
  onRefresh,
  onClear,
  onToggleSources,
  sourcesVisible,
  isLoading,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-kb-name">
          {knowledgeBase?.name || '未选择知识库'}
        </span>
        {knowledgeBase && (
          <span className="topbar-status">就绪</span>
        )}
      </div>
      <div className="topbar-right">
        <select
          className="composer-mode-select"
          value={searchMode}
          onChange={(e) => onSearchModeChange(e.target.value as SearchMode)}
        >
          <option value="semantic">语义检索</option>
          <option value="keyword">关键词检索</option>
          <option value="hybrid">混合检索</option>
        </select>
        <button
          className="topbar-btn"
          onClick={onRefresh}
          disabled={isLoading}
          title="刷新"
        >
          <RefreshCw size={18} />
        </button>
        <button className="topbar-btn" title="导出">
          <Download size={18} />
        </button>
        <button
          className="topbar-btn"
          onClick={onClear}
          disabled={isLoading}
          title="清空会话"
        >
          <Trash2 size={18} />
        </button>
        <button
          className="topbar-btn"
          onClick={onToggleSources}
          title={sourcesVisible ? '收起来源面板' : '展开来源面板'}
        >
          {sourcesVisible ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
        </button>
      </div>
    </header>
  );
}