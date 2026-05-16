import { PanelRightClose, FileText, File, FileCheck } from 'lucide-react';
import { SourceDocument } from '../types';
import '../styles/SourcesPanel.css';

interface SourcesPanelProps {
  sources: SourceDocument[];
  visible: boolean;
  onToggle: () => void;
  activeSourceId?: number;
  onSourceClick?: (id: number) => void;
}

export function SourcesPanel({
  sources,
  visible,
  onToggle,
  activeSourceId,
  onSourceClick,
}: SourcesPanelProps) {
  const getTypeIcon = (type: SourceDocument['type']) => {
    switch (type) {
      case 'pdf':
        return <File size={14} />;
      case 'doc':
        return <FileText size={14} />;
      case 'md':
        return <FileCheck size={14} />;
      default:
        return <File size={14} />;
    }
  };

  return (
    <aside className={`sources-panel ${visible ? '' : 'collapsed'}`}>
      <div className="sources-header">
        <h3>引用来源</h3>
        <button className="sources-toggle-btn" onClick={onToggle}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="sources-content">
        {sources.length === 0 ? (
          <div className="sources-empty">
            等待回答后显示引用来源
          </div>
        ) : (
          <div className="sources-list">
            {sources.map((source) => (
              <div
                key={source.id}
                className={`source-card ${activeSourceId === source.id ? 'active' : ''}`}
                onClick={() => onSourceClick?.(source.id)}
              >
                <div className="source-card-header">
                  <span className="source-card-title">
                    {getTypeIcon(source.type)}
                    {source.title}
                  </span>
                  <span className={`similarity-badge ${source.similarity}`}>
                    {source.similarity === 'high' && '高相似'}
                    {source.similarity === 'medium' && '中相似'}
                    {source.similarity === 'low' && '低相似'}
                  </span>
                </div>
                <p className="source-card-snippet">{source.snippet}</p>
                <div className="source-card-meta">
                  更新于 {source.updateTime}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}