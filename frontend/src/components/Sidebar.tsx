import { Settings, Database, Upload, User } from 'lucide-react';
import { KnowledgeBase } from '../types';
import { mockKnowledgeBases } from '../data/mockData';
import '../styles/Sidebar.css';

interface SidebarProps {
  selectedKbId: string;
  onKbSelect: (kbId: string) => void;
}

export function Sidebar({ selectedKbId, onKbSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>DeepMemo</h1>
      </div>
      <nav className="sidebar-content">
        <div className="sidebar-section">
          <div className="sidebar-section-title">知识库</div>
          <ul className="kb-list">
            {mockKnowledgeBases.map((kb) => (
              <li
                key={kb.id}
                className={`kb-item ${selectedKbId === kb.id ? 'active' : ''}`}
                onClick={() => onKbSelect(kb.id)}
              >
                <div className="kb-item-name">{kb.name}</div>
                <div className="kb-item-meta">
                  {kb.docCount} 篇文档 · {kb.updateTime}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-footer-btn">
          <Settings size={16} />
          设置
        </button>
        <button className="sidebar-footer-btn" style={{ marginTop: 8 }}>
          <Upload size={16} />
          数据导入
        </button>
        <button className="sidebar-footer-btn" style={{ marginTop: 8 }}>
          <User size={16} />
          用户中心
        </button>
      </div>
    </aside>
  );
}