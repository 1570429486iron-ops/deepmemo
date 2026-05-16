import { Message } from '../types';
import { mockResponses, exampleQuestions } from '../data/mockData';
import '../styles/ChatPanel.css';

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  onExampleClick: (question: string) => void;
  hasKnowledgeBase: boolean;
}

export function ChatPanel({ messages, isLoading, onExampleClick, hasKnowledgeBase }: ChatPanelProps) {
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(\[(\d+)\])/g);
    return parts.map((part, index) => {
      if (part.match(/^\[(\d+)\]$/)) {
        const num = part.match(/\[(\d+)\]/)?.[1];
        return (
          <span key={index} className="ref-link" title={`查看来源 ${num}`}>
            [{num}]
          </span>
        );
      }
      return part;
    });
  };

  if (messages.length === 0 && !isLoading) {
    return (
      <main className="chat-panel">
        <div className="chat-empty">
          <h2 className="chat-empty-title">开始提问</h2>
          <p className="chat-empty-subtitle">
            {hasKnowledgeBase
              ? '选择知识库后，可以尝试以下示例问题'
              : '请先在左侧选择知识库'}
          </p>
          {hasKnowledgeBase && (
            <div className="example-questions">
              {exampleQuestions.map((q, i) => (
                <button
                  key={i}
                  className="example-btn"
                  onClick={() => onExampleClick(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="chat-panel">
      <div className="message-list">
        <div className="message-wrapper">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-content">
                {renderMessageContent(msg.content)}
              </div>
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}