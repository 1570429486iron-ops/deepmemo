import { useState } from 'react';
import { Send, Upload, FileText } from 'lucide-react';
import { SearchMode } from '../types';
import '../styles/Composer.css';

interface ComposerProps {
  onSend: (message: string) => void;
  disabled: boolean;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
}

export function Composer({ onSend, disabled, searchMode, onSearchModeChange }: ComposerProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="composer-toolbar">
          <button className="composer-tool-btn">
            <Upload size={14} />
            上传文件
          </button>
          <select
            className="composer-mode-select"
            value={searchMode}
            onChange={(e) => onSearchModeChange(e.target.value as SearchMode)}
          >
            <option value="semantic">语义检索</option>
            <option value="keyword">关键词检索</option>
            <option value="hybrid">混合检索</option>
          </select>
        </div>
        <div className="composer-input-wrapper">
          <textarea
            className="composer-textarea"
            placeholder="输入您的问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
          <button
            className="composer-send-btn"
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
          >
            <Send size={16} />
            发送
          </button>
        </div>
      </div>
    </div>
  );
}